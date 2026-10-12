/* Class simulation page: reads the live data written by the class-sim workflow. */
(function () {
  'use strict';
  var chat = document.querySelector('[data-sim-chat]');
  if (!chat) return;

  var RAW = 'https://raw.githubusercontent.com/xndanius/autonomous-business-lab/sim-data/';
  var q = new URLSearchParams(location.search).get('data');
  var DATA = q && /^\/(?!\/)[\w\-\/.]*\/$/.test(q) ? q : RAW; // ?data=/local/dir/ for testing (same origin only)
  var TZ = 'Europe/Riga';
  var POLL_MS = 60000;
  var MAJORITY = 20;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var msgsBox = $('[data-sim-msgs]');
  var olderBtn = $('[data-sim-older]');
  var newBtn = $('[data-sim-new]');
  var statusBox = $('[data-sim-status]');
  var statusLine = $('[data-sim-line]');
  var people = [], byId = {};
  var state = null;
  var shown = {}; // n -> true
  var minN = Infinity, maxN = 0;
  var lastDay = null, firstDay = null;
  var loadingOlder = false;

  // ------------------------------------------------------------ helpers
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function fmt(d, opts) { return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: TZ }, opts)).format(d); }
  function dayKey(t) { return fmt(new Date(t), { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-'); }
  function hm(t) { return fmt(new Date(t), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function dayLabel(t) { return fmt(new Date(t), { weekday: 'long', day: 'numeric', month: 'long' }); }
  function shortWhen(t) { return fmt(new Date(t), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  function ago(t) {
    var m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    return Math.round(h / 24) + ' d ago';
  }
  function first(id) { return byId[id] ? byId[id].first : id; }
  function avatar(id, small) {
    var p = byId[id];
    var a = el('span', 'sim-av' + (small ? ' sm' : ''), p ? p.initials : '?');
    if (p) { a.style.setProperty('--h', p.hue); a.title = p.name; }
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function getJSON(url) {
    var u = url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 30000);
    return fetch(u, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function fieldList(i) {
    var dl = el('dl', 'sim-fields');
    [['Payer', i.payer], ['Price', i.price], ['First test', i.test], ['Runs without them', i.loop]].forEach(function (f) {
      if (!f[1]) return;
      dl.appendChild(el('dt', null, f[0]));
      dl.appendChild(el('dd', f[0] === 'Price' ? 'price' : null, f[1]));
    });
    return dl;
  }

  // ------------------------------------------------------------ status
  function setStatus(kind, text) {
    statusBox.setAttribute('data-state', kind);
    statusLine.textContent = text;
  }
  function renderStatus() {
    if (!state) { setStatus('waiting', 'Starting soon. The first students speak a few minutes after launch.'); return; }
    var s = state, n = (s.stats && s.stats.messages) || 0;
    var mins = s.lastTickAt ? (Date.now() - new Date(s.lastTickAt).getTime()) / 60000 : Infinity;
    var tail = ' · ' + n + ' messages · ' + ((s.stats && s.stats.production) || 0) + ' in production';
    if (s.status === 'paused') setStatus('paused', 'Paused by the organiser' + tail);
    else if (s.status === 'budget') setStatus('paused', 'Resting until midnight, Riga time: today’s budget is used' + tail);
    else if (s.status === 'waiting-key' || !n) setStatus('waiting', 'Starting soon. The first students speak a few minutes after launch.');
    else if (s.status === 'error') setStatus('paused', 'Paused: the AI service returned an error. It tries again every 5 minutes' + tail);
    else if (mins > 25) setStatus('late', 'Last update ' + ago(s.lastTickAt) + '. GitHub sometimes runs the clock late' + tail);
    else setStatus('live', 'Live · updated ' + ago(s.lastTickAt) + tail);
    if (s.mock) statusLine.textContent += ' · TEST DATA';
    var model = $('[data-sim-model]'); if (model) model.textContent = s.model || '–';
    var spent = $('[data-sim-spent]');
    if (spent && s.budget) spent.textContent = '$' + Number(s.budget.usd || 0).toFixed(2) + ' (all time $' + Number(s.budget.totalUsd || 0).toFixed(2) + ')';
    var meta = $('[data-sim-chatmeta]');
    if (meta && s.startedAt) meta.textContent = n + ' messages since ' + fmt(new Date(s.startedAt), { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // ------------------------------------------------------------ production + board
  function ideaHow(i) {
    if (i.prodHow === 'allin') return 'All-in by ' + first(i.prodBy) + ' · ' + (i.prodVotes ? i.prodVotes.back : i.backers.length) + ' backed it';
    return (i.prodVotes ? i.prodVotes.back : i.backers.length) + ' of 38 backed it';
  }
  function renderProd() {
    var box = $('[data-sim-prod]');
    var list = (state ? state.ideas : []).filter(function (i) { return i.status === 'production'; });
    list.sort(function (a, b) { return String(b.prodAt).localeCompare(String(a.prodAt)); });
    box.textContent = '';
    if (!list.length) { box.appendChild(el('p', 'sim-empty', 'Nothing yet. The class is still arguing.')); return; }
    list.forEach(function (i) {
      var c = el('article', 'sim-pcard');
      c.id = 'prod-' + i.id;
      var top = el('div', 'sim-pc-top');
      top.appendChild(el('span', 'sim-iid', i.id));
      top.appendChild(el('span', 'sim-pc-how' + (i.prodHow === 'allin' ? ' allin' : ''), ideaHow(i)));
      c.appendChild(top);
      c.appendChild(el('h3', null, i.title));
      c.appendChild(el('p', 'sim-line', i.line));
      c.appendChild(fieldList(i));
      var changes = (i.ver || 1) - 1;
      c.appendChild(el('p', 'sim-meta', 'Pitched by ' + first(i.by) + ' · decided ' + shortWhen(i.prodAt) + (changes ? ' · improved ' + changes + (changes === 1 ? ' time' : ' times') : '')));
      box.appendChild(c);
    });
  }
  function voters(ids, label) {
    var w = el('div', 'sim-voters');
    if (!ids.length) return w;
    w.setAttribute('aria-label', label + ': ' + ids.map(first).join(', '));
    ids.slice(0, 22).forEach(function (id) { w.appendChild(avatar(id, true)); });
    if (ids.length > 22) w.appendChild(el('span', 'sim-more', '+' + (ids.length - 22)));
    return w;
  }
  function renderBoard() {
    var box = $('[data-sim-board]');
    var open = (state ? state.ideas : []).filter(function (i) { return i.status === 'open'; });
    open.sort(function (a, b) { return b.backers.length - a.backers.length || String(a.at).localeCompare(String(b.at)); });
    box.textContent = '';
    var cnt = $('[data-sim-open-count]'); if (cnt) cnt.textContent = open.length ? String(open.length) : '';
    if (!open.length) { box.appendChild(el('p', 'sim-empty', 'No open ideas yet.')); }
    open.forEach(function (i) {
      var c = el('article', 'sim-bcard');
      c.id = 'idea-' + i.id;
      var h = el('div', 'sim-bc-head');
      h.appendChild(el('span', 'sim-iid', i.id));
      h.appendChild(el('h3', null, i.title));
      c.appendChild(h);
      c.appendChild(el('p', 'sim-line', i.line));
      c.appendChild(fieldList(i));
      var v = el('div', 'sim-vote');
      var bar = el('div', 'sim-bar');
      var fill = el('span');
      fill.style.width = Math.min(100, (i.backers.length / MAJORITY) * 100) + '%';
      bar.appendChild(fill);
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', i.backers.length + ' of ' + MAJORITY + ' backers needed');
      v.appendChild(bar);
      var nums = el('p', 'sim-nums');
      nums.appendChild(el('b', null, i.backers.length + ' / ' + MAJORITY));
      nums.appendChild(document.createTextNode(' back · '));
      nums.appendChild(el('span', i.opp.length ? 'opp' : null, i.opp.length + ' oppose'));
      v.appendChild(nums);
      c.appendChild(v);
      c.appendChild(voters(i.backers, 'Backers'));
      var last = (i.hist || []).slice(-1)[0];
      var meta = 'By ' + first(i.by) + ' · ' + ago(i.at);
      if (last) meta += ' · last change by ' + first(last.by) + ': ' + Object.keys(last.ch).map(function (k) { return k === 'loop' ? 'loop' : k === 'test' ? 'first test' : k; }).join(', ');
      c.appendChild(el('p', 'sim-meta', meta));
      box.appendChild(c);
    });
    var dropped = (state ? state.ideas : []).filter(function (i) { return i.status === 'dropped'; }).reverse();
    var dbox = $('[data-sim-dropped]');
    var dc = $('[data-sim-drop-count]'); if (dc) dc.textContent = dropped.length ? '(' + dropped.length + ')' : '';
    dbox.textContent = '';
    if (!dropped.length) dbox.appendChild(el('p', 'sim-empty', 'None yet.'));
    dropped.forEach(function (i) {
      var d = el('div', 'sim-drop');
      d.id = 'drop-' + i.id;
      var t = el('p');
      t.appendChild(el('span', 'sim-iid', i.id));
      t.appendChild(el('b', null, ' ' + i.title));
      d.appendChild(t);
      d.appendChild(el('p', 'sim-meta', (i.price ? i.price + ' · ' : '') + 'by ' + first(i.by) + ' · ' + (i.dropWhy || 'dropped')));
      dbox.appendChild(d);
    });
  }

  // ------------------------------------------------------------ chat
  var ACT = { pitch: 'pitched', refine: 'refined', back: 'backs', oppose: 'opposes', allin: 'ALL IN on', drop: 'drop' };
  function ideaChip(id, verb, act) {
    var b = el('button', 'sim-chip ' + (act || 'talk'), (verb ? verb + ' ' : '') + id);
    b.type = 'button';
    b.setAttribute('data-idea', id);
    return b;
  }
  function msgNode(m) {
    if (m.by === 'sys') {
      var s = el('div', 'sim-sys ' + (m.act || ''));
      s.setAttribute('data-n', m.n);
      var label = { prod: 'Production', drop: 'Dropped', open: 'Class chat' }[m.act] || 'Board';
      s.appendChild(el('span', 'sim-syslabel', label));
      s.appendChild(el('span', null, m.say));
      if (m.idea) s.appendChild(ideaChip(m.idea, '', m.act === 'prod' ? 'allin' : 'oppose'));
      return s;
    }
    var p = byId[m.by] || { first: m.by, town: '' };
    var row = el('div', 'sim-msg' + (m.act === 'allin' ? ' is-allin' : '') + (m.act === 'pitch' ? ' is-pitch' : ''));
    row.setAttribute('data-n', m.n);
    var av = avatar(m.by);
    var avb = el('button', 'sim-avbtn');
    avb.type = 'button';
    avb.setAttribute('data-person', m.by);
    avb.setAttribute('aria-label', 'About ' + (p.name || p.first));
    avb.appendChild(av);
    row.appendChild(avb);
    var body = el('div', 'sim-mb');
    var head = el('div', 'sim-mh');
    var who = el('button', 'sim-who', p.first);
    who.type = 'button';
    who.setAttribute('data-person', m.by);
    head.appendChild(who);
    if (p.town) head.appendChild(el('span', 'sim-from', p.town.replace(/ \(.*\)$/, '') + ', ' + p.cc));
    if (m.idea) head.appendChild(ideaChip(m.idea, ACT[m.act] || 'on', m.act));
    var t = el('time', null, hm(m.t));
    t.dateTime = m.t;
    t.title = shortWhen(m.t);
    head.appendChild(t);
    body.appendChild(head);
    body.appendChild(el('p', 'sim-say', m.say));
    if (m.ch) {
      var ch = el('ul', 'sim-ch');
      Object.keys(m.ch).forEach(function (k) {
        var li = el('li');
        li.appendChild(el('span', 'k', ({ title: 'Title', line: 'What', payer: 'Payer', price: 'Price', test: 'First test', loop: 'Loop' })[k] || k));
        li.appendChild(el('s', null, m.ch[k][0] || '—'));
        li.appendChild(document.createTextNode(' → '));
        li.appendChild(el('b', null, m.ch[k][1]));
        ch.appendChild(li);
      });
      body.appendChild(ch);
    }
    if (m.note) body.appendChild(el('p', 'sim-note', m.note + '.'));
    row.appendChild(body);
    return row;
  }
  function dayDivider(t) {
    var d = el('div', 'sim-day', dayLabel(t));
    d.setAttribute('data-day', dayKey(t));
    return d;
  }
  function nearBottom() { return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120; }
  function toBottom() { chat.scrollTop = chat.scrollHeight; newBtn.hidden = true; }
  function appendMessages(list) {
    var fresh = list.filter(function (m) { return !shown[m.n] && m.n > maxN; });
    if (!fresh.length) return 0;
    var stick = nearBottom() || maxN === 0;
    var frag = document.createDocumentFragment();
    fresh.forEach(function (m) {
      var k = dayKey(m.t);
      if (k !== lastDay) { frag.appendChild(dayDivider(m.t)); lastDay = k; if (!firstDay) firstDay = k; }
      var node = msgNode(m);
      if (maxN) node.classList.add('is-new');
      frag.appendChild(node);
      shown[m.n] = true;
      maxN = Math.max(maxN, m.n);
      minN = Math.min(minN, m.n);
    });
    msgsBox.appendChild(frag);
    if (stick) toBottom(); else newBtn.hidden = false;
    return fresh.length;
  }
  function prependMessages(list) {
    var older = list.filter(function (m) { return !shown[m.n] && m.n < minN; });
    if (!older.length) return 0;
    var h0 = chat.scrollHeight, top0 = chat.scrollTop;
    var frag = document.createDocumentFragment();
    var cur = null;
    older.forEach(function (m) {
      var k = dayKey(m.t);
      if (k !== cur) { frag.appendChild(dayDivider(m.t)); cur = k; }
      frag.appendChild(msgNode(m));
      shown[m.n] = true;
    });
    // remove the old first divider if it repeats the last day of the prepended block
    var firstDiv = msgsBox.querySelector('.sim-day');
    if (firstDiv && firstDiv.getAttribute('data-day') === cur && msgsBox.firstChild === firstDiv) msgsBox.removeChild(firstDiv);
    msgsBox.insertBefore(frag, msgsBox.firstChild);
    minN = Math.min(minN, older[0].n);
    firstDay = dayKey(older[0].t);
    chat.scrollTop = top0 + (chat.scrollHeight - h0);
    return older.length;
  }
  function daysList() { return state && state.days ? Object.keys(state.days).sort() : []; }
  function updateOlder() { olderBtn.hidden = !(minN > 1 && minN !== Infinity); }
  function loadOlder() {
    if (loadingOlder || !state) return;
    loadingOlder = true;
    olderBtn.disabled = true;
    olderBtn.textContent = 'Loading…';
    var days = daysList();
    var target = firstDay;
    var tryDay = function (idx) {
      if (idx < 0) return Promise.resolve(0);
      return getJSON(DATA + 'chat/' + days[idx] + '.json').then(function (arr) {
        var added = prependMessages(arr || []);
        if (!added) return tryDay(idx - 1);
        return added;
      });
    };
    var i = days.indexOf(target);
    if (i < 0) i = days.length - 1;
    tryDay(i).catch(function () { return 0; }).then(function (added) {
      loadingOlder = false;
      olderBtn.disabled = false;
      olderBtn.textContent = 'Load earlier messages';
      updateOlder();
    });
  }

  // ------------------------------------------------------------ people
  var peopleKey = '';
  function renderPeople() {
    var key = JSON.stringify((state && state.ps) || {}) + people.length;
    if (key === peopleKey) return;
    peopleKey = key;
    var box = $('[data-sim-people]');
    box.textContent = '';
    var ps = (state && state.ps) || {};
    people.forEach(function (p) {
      var b = el('button', 'sim-pcard-person');
      b.type = 'button';
      b.setAttribute('data-person', p.id);
      b.appendChild(avatar(p.id));
      var t = el('span', 'sim-pp');
      t.appendChild(el('b', null, p.name));
      t.appendChild(el('span', 'sim-pmeta', p.age + ' · ' + p.town.replace(/ \(.*\)$/, '') + ', ' + p.cc));
      t.appendChild(el('span', 'sim-ptrait', String(p.character || '').split('.')[0] + '.'));
      var st = ps[p.id];
      t.appendChild(el('span', 'sim-pstat', st && st.m ? st.m + (st.m === 1 ? ' message' : ' messages') + (st.p ? ' · ' + st.p + ' pitched' : '') : 'Has not spoken yet'));
      b.appendChild(t);
      box.appendChild(b);
    });
  }
  var dlg = $('[data-sim-dlg]');
  var dlgBody = $('[data-sim-dlg-body]');
  function section(title, content) {
    var s = el('div', 'sim-dsec');
    s.appendChild(el('h4', null, title));
    if (Array.isArray(content)) {
      var ul = el('ul');
      content.forEach(function (x) { ul.appendChild(el('li', null, x)); });
      s.appendChild(ul);
    } else s.appendChild(el('p', null, content));
    return s;
  }
  function openPerson(id) {
    var p = byId[id];
    if (!p) return;
    dlgBody.textContent = '';
    var head = el('div', 'sim-dhead');
    head.appendChild(avatar(id));
    var ht = el('div');
    var h = el('h3', null, p.name); h.id = 'sim-dlg-name';
    ht.appendChild(h);
    ht.appendChild(el('p', 'soft', p.age + ' · from ' + p.origin + ' · speaks ' + (p.languages || []).join(', ')));
    head.appendChild(ht);
    dlgBody.appendChild(head);
    dlgBody.appendChild(el('p', 'sim-dfict', 'Fictional person. Invented for this simulation.'));
    var ps = (state && state.ps && state.ps[id]) || {};
    var open = (state ? state.ideas : []).filter(function (i) { return i.status === 'open'; });
    var backs = open.filter(function (i) { return i.backers.indexOf(id) >= 0; }).map(function (i) { return i.id + ' ' + i.title; });
    var opp = open.filter(function (i) { return i.opp.indexOf(id) >= 0; }).map(function (i) { return i.id + ' ' + i.title; });
    var inChat = (ps.m ? ps.m + ' messages' : 'No messages yet') + (ps.p ? ' · pitched ' + ps.p : '') + (ps.last ? ' · last seen ' + ago(ps.last) : '');
    var box = el('div', 'sim-dgrid');
    box.appendChild(section('In the chat', inChat + (backs.length ? '. Backs: ' + backs.join('; ') : '') + (opp.length ? '. Opposes: ' + opp.join('; ') : '') + '.'));
    var mem = (state && state.mem && state.mem[id]) || [];
    if (mem.length) box.appendChild(section('Last messages', mem.slice().reverse().map(function (x) { return '“' + x + '”'; })));
    box.appendChild(section('Story', p.story));
    box.appendChild(section('Lives', p.lives));
    box.appendChild(section('Family', p.family));
    box.appendChild(section('Money', p.money));
    box.appendChild(section('Experience', p.experience || []));
    box.appendChild(section('Character', p.character));
    box.appendChild(section('Believes', p.believes || []));
    box.appendChild(section('Sense of prices', p.prices));
    box.appendChild(section('Writes', p.style));
    dlgBody.appendChild(box);
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    var x = $('[data-sim-close]'); if (x) x.focus();
  }
  function closePerson() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  // ------------------------------------------------------------ tabs + focus
  var grid = $('[data-sim-view]');
  function setTab(name) {
    grid.setAttribute('data-sim-view', name);
    document.querySelectorAll('[data-sim-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-sim-tab') === name ? 'true' : 'false'); });
    if (name === 'chat' && !newBtn.hidden) { /* keep */ }
  }
  function focusIdea(id) {
    var target = document.getElementById('idea-' + id) || document.getElementById('prod-' + id) || document.getElementById('drop-' + id);
    if (!target) return;
    if (target.id.indexOf('idea-') === 0) setTab('board');
    if (target.id.indexOf('drop-') === 0) { var d = $('.sim-dropped'); if (d) d.open = true; setTab('board'); }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('sim-flash');
    void target.offsetWidth;
    target.classList.add('sim-flash');
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-person],[data-idea],[data-sim-tab],[data-sim-close]') : null;
    if (!t) { if (e.target === dlg) closePerson(); return; }
    if (t.hasAttribute('data-sim-close')) closePerson();
    else if (t.hasAttribute('data-person')) openPerson(t.getAttribute('data-person'));
    else if (t.hasAttribute('data-idea')) focusIdea(t.getAttribute('data-idea'));
    else if (t.hasAttribute('data-sim-tab')) setTab(t.getAttribute('data-sim-tab'));
  });
  olderBtn.addEventListener('click', loadOlder);
  newBtn.addEventListener('click', toBottom);
  chat.addEventListener('scroll', function () { if (nearBottom()) newBtn.hidden = true; });

  // ------------------------------------------------------------ load + poll
  function apply(s) {
    state = s;
    renderStatus();
    renderProd();
    renderBoard();
    if (s && s.recent) appendMessages(s.recent);
    renderPeople();
    if (s) updateOlder();
    if (!s || !(s.recent || []).length) {
      if (!msgsBox.childNodes.length) msgsBox.appendChild(el('p', 'sim-empty sim-chat-empty', 'The chat is empty. The first students speak a few minutes after launch.'));
    } else {
      var e = msgsBox.querySelector('.sim-chat-empty'); if (e) e.remove();
    }
  }
  function load() {
    return getJSON(DATA + 'state.json').then(apply).catch(function () {
      if (!state) setStatus('waiting', 'Could not reach the class data. It will retry in a minute.');
    });
  }
  fetch('people.json').then(function (r) { return r.json(); }).then(function (j) {
    people = j.people || [];
    people.forEach(function (p) { byId[p.id] = p; });
    renderPeople();
    return load();
  }).catch(function () { setStatus('paused', 'Could not load the class list.'); });

  setInterval(function () { if (!document.hidden) load(); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  setInterval(function () { if (state) { renderStatus(); } }, 30000);
})();
