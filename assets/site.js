/* Autonomous Business Lab: small page behaviours. No tracking, nothing is sent anywhere. */
(function () {
  'use strict';
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var base = document.documentElement.getAttribute('data-base') || '';

  /* ---------- copy buttons ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, fail) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand('copy')) ok(); else fail(); } catch (e) { fail(e); }
      document.body.removeChild(ta);
    });
  }
  function sixText() {
    return $$('.six textarea').map(function (t) {
      return t.getAttribute('data-label') + ': ' + (t.value.trim() || '...');
    }).join('\n');
  }
  $$('[data-copy]').forEach(function (btn) {
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      var sel = btn.getAttribute('data-copy');
      var text = sel === 'six' ? sixText() : ($(sel) ? $(sel).textContent.trim() : '');
      copyText(text).then(function () {
        btn.classList.add('done'); btn.textContent = 'Copied';
        setTimeout(function () { btn.classList.remove('done'); btn.textContent = label; }, 1800);
      }, function () { btn.textContent = 'Select the text and copy'; });
    });
  });

  /* ---------- six lines: keep a draft in this browser only ---------- */
  var KEY = 'abl-six-lines';
  var six = $$('.six textarea');
  if (six.length) {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      six.forEach(function (t) { if (saved[t.name]) t.value = saved[t.name]; });
    } catch (e) { /* storage blocked: fine */ }
    six.forEach(function (t) {
      t.addEventListener('input', function () {
        try {
          var o = {}; six.forEach(function (x) { o[x.name] = x.value; });
          localStorage.setItem(KEY, JSON.stringify(o));
        } catch (e) { /* ignore */ }
      });
    });
    var clear = $('[data-clear-six]');
    if (clear) clear.addEventListener('click', function () {
      six.forEach(function (t) { t.value = ''; });
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    });
  }

  /* ---------- lesson stepper (tabs) ---------- */
  $$('.stepper').forEach(function (st) {
    var tabs = $$('[role="tab"]', st), panels = $$('[role="tabpanel"]', st);
    function show(i, focus) {
      tabs.forEach(function (t, j) { var on = j === i; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
      panels.forEach(function (p, j) { p.hidden = j !== i; });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length, k = e.key;
        if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); show((i + 1) % n, true); }
        else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); show((i - 1 + n) % n, true); }
        else if (k === 'Home') { e.preventDefault(); show(0, true); }
        else if (k === 'End') { e.preventDefault(); show(n - 1, true); }
      });
    });
    $$('[data-goto]', st).forEach(function (b) {
      b.addEventListener('click', function () { show(+b.getAttribute('data-goto'), true); });
    });
    show(0);
  });

  /* ---------- key dates: mark the current step ---------- */
  $$('.timeline').forEach(function (tl) {
    var items = $$('.tl', tl), today = new Date(), cur = -1;
    items.forEach(function (it, i) {
      var d = it.getAttribute('data-when');
      if (d && new Date(d + 'T23:59:59+03:00') >= today && cur === -1) cur = i;
    });
    if (cur === -1) { // all dated steps are past: the next undated step is now
      items.forEach(function (it, i) { if (cur === -1 && !it.getAttribute('data-when')) cur = i; });
    }
    items.forEach(function (it, i) { it.classList.toggle('now', i === cur); });
  });

  /* ---------- data for the comic and the atlas ---------- */
  var dataPromise = null;
  function getData() {
    if (!dataPromise) dataPromise = fetch(base + 'assets/loops-data.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    return dataPromise;
  }
  function whenNear(el, fn) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (en) {
      if (en.some(function (x) { return x.isIntersecting; })) { io.disconnect(); fn(); }
    }, { rootMargin: '400px 0px' });
    io.observe(el);
  }
  function when(iso) {
    try {
      return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius' });
    } catch (e) { return ''; }
  }

  /* ---------- comic viewer ---------- */
  var comic = $('[data-comic]');
  if (comic) whenNear(comic, function () {
    getData().then(function (d) {
      var pages = d.comic, i = 0, timer = null;
      var img = $('img', comic), title = $('.cap b', comic), story = $('.cap .story', comic), dia = $('.cap .dia', comic);
      var range = $('input[type="range"]', comic), count = $('.count', comic), play = $('[data-play]', comic);
      range.max = String(pages.length); range.disabled = false;
      function show(k) {
        i = (k + pages.length) % pages.length;
        var p = pages[i];
        img.src = base + p.img; img.alt = 'Comic page ' + p.n + ': ' + p.title;
        title.textContent = p.n + '. ' + p.title;
        story.textContent = p.caption;
        dia.textContent = '';
        (p.dialogue || []).forEach(function (x) {
          var line = document.createElement('p'), b = document.createElement('b');
          b.textContent = x.speaker + ': '; line.appendChild(b); line.appendChild(document.createTextNode('“' + x.text + '”'));
          dia.appendChild(line);
        });
        range.value = String(i + 1);
        count.textContent = (i + 1) + ' / ' + pages.length;
        var pre = new Image(); pre.src = base + pages[(i + 1) % pages.length].img;
      }
      function stop() { if (timer) { clearInterval(timer); timer = null; play.textContent = 'Play'; play.setAttribute('aria-pressed', 'false'); } }
      $('[data-prev]', comic).addEventListener('click', function () { stop(); show(i - 1); });
      $('[data-next]', comic).addEventListener('click', function () { stop(); show(i + 1); });
      range.addEventListener('input', function () { stop(); show(+range.value - 1); });
      play.addEventListener('click', function () {
        if (timer) { stop(); return; }
        play.textContent = 'Pause'; play.setAttribute('aria-pressed', 'true');
        timer = setInterval(function () { show(i + 1); }, 3500);
      });
      comic.addEventListener('keydown', function (e) {
        if (e.target === range) return;
        if (e.key === 'ArrowRight') { stop(); show(i + 1); }
        if (e.key === 'ArrowLeft') { stop(); show(i - 1); }
      });
      show(0);
    }).catch(function () { comic.querySelector('.cap .story').textContent = 'The comic could not load. Please reload the page.'; });
  });

  /* ---------- atlas: drag, zoom, watch it grow ---------- */
  var atlas = $('[data-atlas]');
  if (atlas) whenNear(atlas, function () {
    getData().then(function (d) {
      var tiles = d.atlas.slice().sort(function (a, b) { return a.id - b.id; });
      var T = 120, plane = $('.plane', atlas), name = $('.name', atlas), counter = $('.counter', atlas);
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      tiles.forEach(function (t) { minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x); minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y); });
      var els = tiles.map(function (t) {
        var im = document.createElement('img');
        im.src = base + t.img; im.alt = ''; im.draggable = false; im.decoding = 'async';
        im.style.left = ((t.x - minX) * T) + 'px'; im.style.top = ((t.y - minY) * T) + 'px';
        im.setAttribute('data-title', t.id + '. ' + t.title); im.setAttribute('data-at', t.at);
        plane.appendChild(im); return im;
      });
      var W = (maxX - minX + 1) * T, H = (maxY - minY + 1) * T;
      plane.style.width = W + 'px'; plane.style.height = H + 'px';
      var s = 1, tx = 0, ty = 0;
      function apply() { plane.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; plane.style.transformOrigin = '0 0'; }
      function fit() {
        var r = atlas.getBoundingClientRect();
        s = Math.min(r.width / W, r.height / H) * 0.92;
        tx = (r.width - W * s) / 2; ty = (r.height - H * s) / 2; apply();
      }
      function zoomAt(f, cx, cy) {
        var ns = Math.max(0.2, Math.min(3, s * f));
        tx = cx - (cx - tx) * (ns / s); ty = cy - (cy - ty) * (ns / s); s = ns; apply();
      }
      fit();
      window.addEventListener('resize', fit);

      // growth: tiles appear in the order they were drawn
      var shown = 0, growT = null;
      function setShown(n) {
        shown = n;
        els.forEach(function (im, k) { im.classList.toggle('in', k < n); });
        var t = tiles[Math.max(0, n - 1)];
        counter.textContent = n + ' of ' + tiles.length + ' tiles' + (t ? ' · ' + when(t.at) : '');
      }
      function grow() {
        if (growT) clearInterval(growT);
        setShown(0);
        if (reduced) { setShown(tiles.length); return; }
        var n = 0;
        growT = setInterval(function () { n++; setShown(n); if (n >= tiles.length) { clearInterval(growT); growT = null; } }, 40);
      }
      grow();
      $('[data-replay]', atlas).addEventListener('click', grow);
      $('[data-fit]', atlas).addEventListener('click', fit);
      $('[data-zoom-in]', atlas).addEventListener('click', function () { var r = atlas.getBoundingClientRect(); zoomAt(1.35, r.width / 2, r.height / 2); });
      $('[data-zoom-out]', atlas).addEventListener('click', function () { var r = atlas.getBoundingClientRect(); zoomAt(1 / 1.35, r.width / 2, r.height / 2); });

      // pointer: drag with one finger or the mouse, pinch with two
      var pts = {}, last = null, pinch = null, moved = false;
      atlas.addEventListener('pointerdown', function (e) {
        if (e.target.closest('button')) return;
        atlas.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = false;
        var ids = Object.keys(pts);
        if (ids.length === 2) {
          var a = pts[ids[0]], b = pts[ids[1]];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: s };
        } else { last = { x: e.clientX, y: e.clientY }; }
      });
      atlas.addEventListener('pointermove', function (e) {
        var r = atlas.getBoundingClientRect();
        if (!pts[e.pointerId]) {
          var hit = document.elementFromPoint(e.clientX, e.clientY);
          if (hit && hit.parentNode === plane && hit.classList.contains('in')) name.textContent = hit.getAttribute('data-title');
          return;
        }
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pts);
        if (ids.length === 2 && pinch) {
          var a = pts[ids[0]], b = pts[ids[1]];
          var dist = Math.hypot(a.x - b.x, a.y - b.y);
          zoomAt((pinch.s * dist / pinch.d) / s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        } else if (last) {
          tx += e.clientX - last.x; ty += e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
          moved = true; apply();
        }
      });
      function up(e) {
        delete pts[e.pointerId];
        if (Object.keys(pts).length < 2) pinch = null;
        if (!Object.keys(pts).length) last = null;
        if (!moved && e.type === 'pointerup') {
          var hit = document.elementFromPoint(e.clientX, e.clientY);
          if (hit && hit.parentNode === plane && hit.classList.contains('in')) name.textContent = hit.getAttribute('data-title');
        }
      }
      atlas.addEventListener('pointerup', up); atlas.addEventListener('pointercancel', up);
      atlas.addEventListener('wheel', function (e) {
        if (!e.ctrlKey && !e.metaKey) return; // plain scroll keeps scrolling the page
        e.preventDefault(); var r = atlas.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      atlas.addEventListener('keydown', function (e) {
        var step = 60;
        if (e.key === 'ArrowLeft') { tx += step; apply(); e.preventDefault(); }
        if (e.key === 'ArrowRight') { tx -= step; apply(); e.preventDefault(); }
        if (e.key === 'ArrowUp') { ty += step; apply(); e.preventDefault(); }
        if (e.key === 'ArrowDown') { ty -= step; apply(); e.preventDefault(); }
        if (e.key === '+' || e.key === '=') { var r = atlas.getBoundingClientRect(); zoomAt(1.35, r.width / 2, r.height / 2); }
        if (e.key === '-') { var r2 = atlas.getBoundingClientRect(); zoomAt(1 / 1.35, r2.width / 2, r2.height / 2); }
      });
    }).catch(function () { $('.name', atlas).textContent = 'The atlas could not load. Please reload the page.'; });
  });

  /* ---------- While You Sleep: live numbers from its public data ---------- */
  var live = $('[data-wys-live]');
  if (live) whenNear(live.closest('section') || live.parentNode, function () { // the bar itself is hidden until data arrives
    fetch('https://xndanius.github.io/while-you-sleep/api/machine.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (m) {
        var st = m.stats || {}, s2 = m.status || {};
        function set(k, v) { var el = $('[data-wys="' + k + '"]', live); if (el && v !== null && v !== undefined && v !== '') el.textContent = v; }
        if (typeof st.candidates === 'number') set('checked', st.candidates.toLocaleString('en-GB'));
        if (typeof st.published === 'number') set('published', String(st.published));
        if (typeof st.totalCostUsd === 'number') set('cost', '$' + st.totalCostUsd.toFixed(2));
        var lastRun = s2.lastRunAt || s2.lastLoopAt;
        if (lastRun) {
          var mins = Math.round((Date.now() - new Date(lastRun).getTime()) / 60000);
          set('last', mins < 1 ? 'now' : mins < 90 ? mins + ' min ago' : Math.round(mins / 60) + ' h ago');
        }
        live.hidden = false;
      })
      .catch(function () { live.hidden = true; });
  });
})();
