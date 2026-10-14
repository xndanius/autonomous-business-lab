/* Class simulation page: reads the live data written by the class-sim workflow. */
(function () {
  'use strict';
  var chat = document.querySelector('[data-sim-chat]');
  if (!chat) return;

  var RAW = 'https://raw.githubusercontent.com/xndanius/autonomous-business-lab/sim-data/';
  var CDN = 'https://cdn.jsdelivr.net/gh/xndanius/autonomous-business-lab@sim-data/'; // fallback mirror
  var q = new URLSearchParams(location.search).get('data');
  var local = q && /^\/(?!\/)[\w\-\/.]*\/$/.test(q); // ?data=/local/dir/ for testing (same origin only)
  var BASES = local ? [q] : [RAW, CDN];
  var TZ = 'Europe/Riga';
  var POLL_MS = 120000;
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
  function getJSON(path) {
    var i = 0;
    function attempt() {
      var base = BASES[i];
      var u = base + path + (base === CDN ? '' : '?t=' + Math.floor(Date.now() / 30000));
      return fetch(u, { cache: 'no-store' }).then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function (e) {
        if (++i < BASES.length) return attempt();
        throw e;
      });
    }
    return attempt();
  }
  function oldPrices(i) {
    var seen = {}, out = [];
    (i.hist || []).forEach(function (h) {
      var c = h.ch && h.ch.price;
      if (c && c[0] && c[0] !== i.price && !seen[c[0]]) { seen[c[0]] = 1; out.push(c[0]); }
    });
    return out.slice(-2);
  }
  function fieldList(i) {
    var dl = el('dl', 'sim-fields');
    [['Payer', i.payer], ['Price', i.price], ['First test', i.test], ['Runs without them', i.loop]].forEach(function (f) {
      if (!f[1]) return;
      dl.appendChild(el('dt', null, f[0]));
      var dd = el('dd', f[0] === 'Price' ? 'price' : null, f[1]);
      if (f[0] === 'Price') {
        var was = oldPrices(i);
        if (was.length) {
          var w = el('span', 'sim-was');
          w.appendChild(document.createTextNode('was '));
          was.forEach(function (x, k) { if (k) w.appendChild(document.createTextNode(', ')); w.appendChild(el('s', null, x)); });
          dd.appendChild(w);
        }
      }
      dl.appendChild(dd);
    });
    if (i.review) {
      dl.appendChild(el('dt', null, 'Independent review'));
      dl.appendChild(el('dd', null, i.review.score + '/10 · model judgement, not customer validation. ' + i.review.critique));
    }
    if (i.pending) { dl.appendChild(el('dt', null, 'Revision')); dl.appendChild(el('dd', null, 'Waiting for review; accepted version shown above.')); }
    if (i.feedback) { dl.appendChild(el('dt', null, 'What to fix')); dl.appendChild(el('dd', null, i.feedback)); }
    if (i.sources && i.sources.length) {
      dl.appendChild(el('dt', null, 'Research receipts'));
      var dd = el('dd', 'sim-receipts');
      dd.appendChild(receiptList(i.sources));
      dl.appendChild(dd);
    }
    return dl;
  }

  // The implementation view uses only the engine's bounded shortlist.
  // Historical popularity and fictional anecdotes never create a leader here.
  function activeSlots() {
    var seen = {};
    return ((((state || {}).collaboration || {}).shortlist) || []).filter(function (slot) { return slot && typeof slot === 'object'; }).sort(function (a, b) { return a.rank - b.rank; }).filter(function (slot) {
      var idea = findIdea(slot.ideaId);
      if (!slot || !/^I\d+$/.test(slot.ideaId || '') || !Number.isInteger(slot.rank) || slot.rank < 1 || slot.rank > 5 || seen[slot.ideaId] || !idea || !['title', 'line', 'payer', 'price', 'test', 'loop'].every(function (field) { return typeof idea[field] === 'string' && idea[field].trim(); }) || idea.review && idea.review.safe === false || slot.contentHeld || slot.unsafe === true || slot.disposition === 'held') return false;
      seen[slot.ideaId] = true; return true;
    }).slice(0, 5);
  }
  function findIdea(id) { return ((state && state.ideas) || []).find(function (i) { return i.id === id; }); }
  function implementationHold(idea) { return idea.implementationHold || (((state || {}).collaboration || {}).deferred || {})[idea.id] || null; }
  function listText(value) { return Array.isArray(value) ? value.join('; ') : String(value || ''); }
  function sourceURL(source) {
    try { var u = new URL(source.url); return u.protocol === 'https:' && /^(?:www\.)?(?:riga\.lv|liaa\.gov\.lv|stripe\.com|supabase\.com)$|^(?:ec\.europa\.eu|docs\.github\.com|developers\.cloudflare\.com|docs\.n8n\.io)$/.test(u.hostname) && !u.username && !u.password ? u.href : null; }
    catch (e) { return null; }
  }
  function receiptList(records) {
    var box = el('div', 'sim-receipts');
    (records || []).slice(0, 8).forEach(function (source) {
      if (!source) return;
      var href = sourceURL(source); if (!href) return;
      var a = el('a', null, source.title || source.publisher || source.id); a.href = href; a.target = '_blank'; a.rel = 'noopener'; box.appendChild(a);
      if (source.quote) box.appendChild(el('p', null, '“' + source.quote + '”'));
      var when = source.retrievedAt && Number.isFinite(+new Date(source.retrievedAt)) ? ' · fetched ' + shortWhen(source.retrievedAt) : '';
      if (source.publishedAt && Number.isFinite(+new Date(source.publishedAt))) when = ' · published ' + fmt(new Date(source.publishedAt), { day: 'numeric', month: 'short', year: 'numeric' }) + when;
      else if (source.modifiedAt && Number.isFinite(+new Date(source.modifiedAt))) when = ' · source updated ' + fmt(new Date(source.modifiedAt), { day: 'numeric', month: 'short', year: 'numeric' }) + when;
      var kind = ({ 'market-context': 'EU aggregate context', 'supplier-cost': 'Published supplier cost', 'alternative-tool': 'Existing alternative', 'implementation-only': 'Implementation reference' })[source.kind] || 'Public source evidence';
      box.appendChild(el('small', null, kind + when));
      if (source.scope) box.appendChild(el('p', 'sim-model-note', source.scope));
    });
    if (!box.childNodes.length) box.appendChild(el('p', 'soft', 'No verified source receipts have been attached yet.'));
    return box;
  }
  function teamLine(team) {
    var box = el('div', 'sim-teamline');
    (team || []).forEach(function (member) {
      var button = el('button', 'sim-chip', first(member.id) + ' · ' + member.role); button.type = 'button'; button.setAttribute('data-person', member.id); box.appendChild(button);
    });
    if (!box.childNodes.length) box.appendChild(el('span', null, 'Team assignment pending'));
    return box;
  }
  function scoreBreakdown(scores) {
    var box = el('div', 'sim-review-breakdown');
    var names = { evidence: 'Evidence', usefulness: 'Useful', payer: 'Payer', autonomy: 'Autonomy', test: 'First test' };
    Object.keys(names).forEach(function (key) { if (scores && Number.isFinite(scores[key])) box.appendChild(el('span', null, names[key] + ' ' + scores[key] + '/2')); });
    return box;
  }
  function planDetail(title, content) {
    var detail = el('details', 'sim-plan-subsection'); detail.appendChild(el('summary', null, title));
    if (content) detail.appendChild(content); return detail;
  }
  function labelled(dl, title, value) {
    if (!value) return;
    dl.appendChild(el('dt', null, title)); dl.appendChild(el('dd', null, listText(value)));
  }
  function bullets(items) {
    var ul = el('ul'); (items || []).forEach(function (item) { if (item) ul.appendChild(el('li', null, listText(item))); }); return ul;
  }
  function mentorState(slot) {
    if (slot.archivedView) return 'Archived mentor receipt';
    var c = (state && state.collaboration) || {}, q = c.mentorQueue || {};
    if ((q.items || []).some(function (item) { return item.ideaId === slot.ideaId; })) return 'Weekly review queued';
    if (slot.lastWeeklyReview && slot.weeklyReviewCurrent === true) return 'Weekly review current';
    if (slot.lastWeeklyReview) return 'Fresh weekly review needed';
    if (slot.nextWeeklyDueAt && +new Date(slot.nextWeeklyDueAt) <= Date.now()) return 'Weekly review due';
    return 'First weekly review pending';
  }
  function mentorPanel(slot) {
    var box = el('div', 'sim-mentor-panel'), review = slot.lastWeeklyReview, mentor = review && review.mentor || slot.mentor;
    if (mentor) {
      box.appendChild(el('p', null, mentor.name + ' · ' + mentor.lens));
      box.appendChild(el('p', 'sim-model-note', 'Fictional experienced mentor role. Sparring and weekly reviews use the same shared API budget.'));
    }
    box.appendChild(el('p', 'sim-report-status', mentorState(slot)));
    if (review) {
      box.appendChild(el('p', null, 'Last review: ' + shortWhen(review.at) + ' · ' + review.recommendation + ' · ' + review.score + '/10'));
      if (slot.archivedView) box.appendChild(el('p', 'sim-model-note', 'This review belongs to an earlier plan that is no longer active.'));
      else if (slot.weeklyReviewCurrent !== true) box.appendChild(el('p', 'sim-model-note', 'This is an earlier review receipt; the current plan needs a fresh check.'));
      box.appendChild(scoreBreakdown(review.scores));
      if (review.risk) box.appendChild(el('p', null, 'Main risk: ' + review.risk));
      if (review.milestone) box.appendChild(el('p', null, (slot.archivedView ? 'Earlier proposed milestone: ' : 'Next falsifiable milestone: ') + review.milestone));
      if (review.evidenceGaps && review.evidenceGaps.length) { box.appendChild(el('h4', null, 'Evidence still needed')); box.appendChild(bullets(review.evidenceGaps)); }
    }
    if (!slot.archivedView && slot.nextWeeklyDueAt && Number.isFinite(+new Date(slot.nextWeeklyDueAt))) box.appendChild(el('p', 'sim-model-note', 'Next weekly review due ' + shortWhen(slot.nextWeeklyDueAt) + ' Riga time. A budget pause preserves the queue.'));
    var sparring = (slot.sparring || []).slice(-2);
    if (sparring.length) {
      box.appendChild(el('h4', null, 'Recent team sparring'));
      sparring.forEach(function (x) {
        var detail = el('details'); detail.appendChild(el('summary', null, (x.mentor ? x.mentor.name + ': ' : '') + x.question)); detail.appendChild(el('p', null, x.answer));
        if (x.mentor) detail.appendChild(el('p', 'sim-model-note', x.mentor.name + ' · fictional ' + x.mentor.lens));
        detail.appendChild(el('small', 'sim-model-note', shortWhen(x.at) + ' · proposed advice, not a completed customer test'));
        if (x.evidence && x.evidence.length) detail.appendChild(receiptList(x.evidence)); box.appendChild(detail);
      });
    } else box.appendChild(el('p', 'sim-model-note', 'On-demand sparring appears when a team has a specific question.'));
    return box;
  }
  function implementationPlan(slot, idea) {
    var detail = el('details', 'sim-plan'); detail.id = 'plan-' + slot.ideaId;
    var summary = el('summary'); summary.appendChild(el('span', 'sim-iid', slot.ideaId)); summary.appendChild(el('span', null, idea.title + ' · plan, team & sources')); detail.appendChild(summary);
    var body = el('div', 'sim-plan-body'), plan = slot.plan;
    body.appendChild(teamLine(slot.team));
    body.appendChild(el('p', 'sim-plan-disclaimer', 'An implementation proposal in a fictional accelerator. Public source facts are cited below. Prices, forecasts and tests are hypotheses; no product launch or customer result is claimed.'));
    if (!plan) {
      body.appendChild(el('p', 'soft', 'The team is preparing a detailed plan. The accepted idea is shown below.'));
      body.appendChild(fieldList(idea)); body.appendChild(planDetail('Mentor & weekly review', mentorPanel(slot))); detail.appendChild(body); return detail;
    }
    body.appendChild(el('p', 'sim-report-status', (slot.archivedView ? 'Archived plan: ' : 'Plan: ') + String(plan.status || 'draft').replace(/-/g, ' ') + ' · version ' + plan.version + (plan.at ? ' · ' + shortWhen(plan.at) : '') + (!slot.archivedView && plan.current === false ? ' · idea changed; refresh needed' : '')));
    var intro = el('dl', 'sim-fields');
    labelled(intro, 'Who uses it', plan.audience); labelled(intro, 'Why they return', plan.valueProposition); labelled(intro, 'Proposed payer & price', plan.payerAndPrice); labelled(intro, 'First test', plan.firstTest); body.appendChild(intro);
    if (plan.review) { body.appendChild(scoreBreakdown(plan.review.scores)); body.appendChild(el('p', 'sim-model-note', (plan.current === false ? 'Previous plan review ' : 'Plan review ') + plan.review.score + '/10 · model judgement. ' + (plan.current === false ? 'The current idea needs a refreshed plan. ' : '') + plan.review.critique)); }
    var build = el('div', 'sim-plan-section');
    if (plan.mvp) { build.appendChild(el('h4', null, 'Smallest useful first version')); build.appendChild(el('p', null, plan.mvp)); }
    (plan.weeks || []).forEach(function (week) { build.appendChild(el('h4', null, 'Week ' + week.week + ' · ' + week.goal)); build.appendChild(bullets(week.tasks)); });
    body.appendChild(planDetail('Four-week build plan', build));
    var system = el('div', 'sim-plan-section'), loop = el('dl', 'sim-fields');
    [['Trigger', 'trigger'], ['Make', 'make'], ['Independent check', 'check'], ['Deliver', 'deliver'], ['Exception owner', 'exceptionOwner']].forEach(function (f) { labelled(loop, f[0], plan.loop && plan.loop[f[1]]); }); system.appendChild(loop);
    if (plan.architecture && plan.architecture.length) { system.appendChild(el('h4', null, 'Components & tools')); var table = el('table', 'sim-architecture'); var thead = el('thead'), tr = el('tr'); ['Component', 'Suggested tool', 'Why'].forEach(function (label) { var th = el('th', null, label); th.scope = 'col'; tr.appendChild(th); }); thead.appendChild(tr); table.appendChild(thead); var tb = el('tbody'); plan.architecture.forEach(function (x) { var row = el('tr'); [x.component, x.tool, x.why].forEach(function (v) { row.appendChild(el('td', null, v)); }); tb.appendChild(row); }); table.appendChild(tb); system.appendChild(table); }
    if (plan.dataAndPrivacy) { system.appendChild(el('h4', null, 'Data & privacy')); system.appendChild(el('p', null, plan.dataAndPrivacy)); } body.appendChild(planDetail('System & operating loop', system));
    var tests = el('div', 'sim-plan-section'), economics = plan.economics || {};
    [['Revenue hypothesis', economics.hypothesis], ['Cost assumptions', economics.costAssumptions], ['Unit economics hypothesis', economics.unitEconomics]].forEach(function (f) { if (f[1]) { tests.appendChild(el('h4', null, f[0])); tests.appendChild(el('p', null, listText(f[1]))); } });
    (plan.tests || []).forEach(function (test) { tests.appendChild(el('h4', null, test.hypothesis)); var dl = el('dl', 'sim-fields'); labelled(dl, 'Test', test.test); labelled(dl, 'Pass', test.pass); labelled(dl, 'Fail', test.fail); if (Number.isFinite(test.maxCostEuro)) labelled(dl, 'Maximum test cost', '€' + test.maxCostEuro); tests.appendChild(dl); });
    if (economics.unknowns && economics.unknowns.length) { tests.appendChild(el('h4', null, 'Unproven assumptions')); tests.appendChild(bullets(economics.unknowns)); } body.appendChild(planDetail('Economics & tests that could disprove it', tests));
    var evidence = el('div', 'sim-plan-section'); evidence.appendChild(receiptList(plan.evidence || idea.sources || []));
    if (plan.risks && plan.risks.length) { evidence.appendChild(el('h4', null, 'Risks')); evidence.appendChild(bullets(plan.risks)); }
    if (plan.unknowns && plan.unknowns.length) { evidence.appendChild(el('h4', null, 'Still unknown')); evidence.appendChild(bullets(plan.unknowns)); } body.appendChild(planDetail('Public evidence & open risks', evidence));
    body.appendChild(planDetail('Mentor & weekly review', mentorPanel(slot))); detail.appendChild(body); return detail;
  }
  function renderCollaboration() {
    var leaders = $('[data-sim-leaders]'), runners = $('[data-sim-runners]'), plans = $('[data-sim-plans]');
    if (!leaders || !runners || !plans) return;
    var testNotice = $('[data-sim-fixture-notice]'); if (testNotice) testNotice.hidden = !(state && state.mock);
    var slots = activeSlots(); leaders.textContent = ''; runners.textContent = ''; plans.textContent = '';
    if (!slots.length) leaders.appendChild(el('p', 'sim-empty', 'The class is preparing its reviewed shortlist. Historical votes are kept in the archive below.'));
    slots.forEach(function (slot, idx) {
      var rank = Number.isInteger(slot.rank) && slot.rank >= 1 && slot.rank <= 5 ? slot.rank : idx + 1, isLeader = rank <= 3;
      var idea = findIdea(slot.ideaId), card = el('article', isLeader ? 'sim-leader' : 'sim-runner'), content = card;
      if (!isLeader) { content = el('div', 'sim-runner-main'); card.appendChild(content); }
      var top = el('div', 'sim-rankline'); top.appendChild(el('span', 'sim-rank', String(rank).padStart(2, '0') + ' · ' + (isLeader ? 'Leader' : 'Runner-up')));
      var score = el('span', 'sim-score', Number.isFinite(slot.score) ? slot.score : '—'); score.appendChild(el('small', null, '/10')); top.appendChild(score); content.appendChild(top);
      content.appendChild(el('h3', null, idea.title)); content.appendChild(el('p', 'sim-line', idea.line));
      content.appendChild(el('p', 'sim-model-note', slot.qualification === 'reviewed' ? 'Idea review · model judgement' : 'Provisional selection · review pending'));
      if (isLeader) { var audience = el('div', 'sim-card-audience'), currentPlan = slot.plan && slot.plan.current !== false ? slot.plan : null; if (currentPlan && currentPlan.audience) audience.appendChild(el('p', null, 'For: ' + currentPlan.audience)); audience.appendChild(el('p', null, 'Proposed payer: ' + (currentPlan && currentPlan.payerAndPrice || idea.payer))); content.appendChild(audience); content.appendChild(teamLine(slot.team)); }
      if (slot.disposition === 'revise' || slot.disposition === 'rework' || slot.status === 'rework' || slot.weeklyReviewCurrent && slot.lastWeeklyReview && slot.lastWeeklyReview.recommendation === 'revise') content.appendChild(el('p', 'sim-rework-note', 'Mentor: revise before proceeding'));
      var mentor = slot.lastWeeklyReview && slot.lastWeeklyReview.mentor || slot.mentor;
      if (mentor) content.appendChild(el('p', 'sim-model-note', mentor.name + ' · fictional mentor · ' + mentorState(slot)));
      var link = el('a', isLeader ? 'btn' : null, 'Open plan, team & evidence →'); link.href = '#plan-' + slot.ideaId; link.setAttribute('data-open-plan', slot.ideaId); content.appendChild(link);
      (isLeader ? leaders : runners).appendChild(card); plans.appendChild(implementationPlan(slot, idea));
    });
    renderShortlistFeed(slots); renderTeams(slots); renderCommonMemory(); renderRetiredPlans();
  }
  function renderRetiredPlans() {
    var box = $('[data-sim-retired-plans]'), count = $('[data-sim-retired-count]'); if (!box) return;
    var archive = (((state || {}).collaboration || {}).archive || []).slice().reverse(); box.textContent = ''; if (count) count.textContent = '(' + archive.length + ')';
    if (!archive.length) { box.appendChild(el('p', 'sim-empty', 'No implementation plan has been retired yet.')); return; }
    archive.slice(0, 15).forEach(function (slot) {
      var idea = slot.ideaSnapshot || findIdea(slot.ideaId), card = el('article', 'sim-retired-card');
      var currentIdea = findIdea(slot.ideaId), contentHeld = slot.contentHeld || slot.unsafe === true || currentIdea && currentIdea.review && currentIdea.review.safe === false || idea && idea.review && idea.review.safe === false || slot.lastWeeklyReview && slot.lastWeeklyReview.safe === false;
      card.appendChild(el('span', 'sim-iid', slot.ideaId)); card.appendChild(el('h3', null, contentHeld ? 'Content held for a safety review' : idea && idea.title || 'Earlier hypothesis'));
      card.appendChild(el('p', 'soft', 'Held or archived: ' + (slot.reason || 'No longer on the active shortlist.')));
      if (slot.archivedAt) card.appendChild(el('small', 'sim-model-note', shortWhen(slot.archivedAt)));
      if (slot.lastWeeklyReview) card.appendChild(el('p', 'sim-model-note', 'Earlier mentor recommendation: ' + slot.lastWeeklyReview.recommendation + '. ' + slot.lastWeeklyReview.risk));
      if (!contentHeld && slot.plan && idea) { var details = implementationPlan(Object.assign({}, slot, { archivedView: true }), idea); details.id = 'archived-plan-' + slot.ideaId + '-' + Math.round(+new Date(slot.archivedAt || slot.selectedAt)); card.appendChild(details); }
      box.appendChild(card);
    });
  }
  function collaborativeMessage(m) {
    var mentor = activeSlots().reduce(function (all, s) { return all.concat(s.mentor || [], s.lastWeeklyReview && s.lastWeeklyReview.mentor || [], (s.sparring || []).map(function (x) { return x.mentor; }).filter(Boolean)); }, []).find(function (p) { return p && p.id === m.by; });
    var row = el('article', 'sim-report-message'), who = m.by === 'sys' ? 'Class notebook' : mentor ? mentor.name + ' · fictional mentor' : first(m.by);
    row.setAttribute('data-detail-scope', 'report-' + (m.n || m.t + '-' + m.ideaId));
    var top = el('div', 'sim-mh'); top.appendChild(el('span', 'sim-rank', ({ research: 'Research report', plan: 'Build plan', challenge: 'Challenge', mentor: 'Weekly review', sparring: 'Mentor sparring', selection: 'Shortlist' })[m.kind] || 'Discussion'));
    if (m.by && m.by !== 'sys' && byId[m.by]) { var button = el('button', 'sim-who', who); button.type = 'button'; button.setAttribute('data-person', m.by); top.appendChild(button); } else top.appendChild(el('span', 'sim-who', who));
    if (m.ideaId) top.appendChild(ideaChip(m.ideaId, 'on', 'talk'));
    if (m.t && Number.isFinite(+new Date(m.t))) { var t = el('time', null, hm(m.t)); t.dateTime = m.t; t.title = shortWhen(m.t); top.appendChild(t); } row.appendChild(top); row.appendChild(el('p', 'sim-say', m.say));
    if ((m.evidence || []).length || (m.uncertainty || []).length || (m.dissent || []).length) {
      var detail = el('details'); detail.appendChild(el('summary', null, 'Sources, unknowns & dissent'));
      if (m.evidence && m.evidence.length) detail.appendChild(receiptList(m.evidence));
      if (m.uncertainty && m.uncertainty.length) { detail.appendChild(el('h4', null, 'Unknowns')); detail.appendChild(bullets(m.uncertainty)); }
      if (m.dissent && m.dissent.length) { detail.appendChild(el('h4', null, 'Dissent kept on record')); detail.appendChild(bullets(m.dissent)); } row.appendChild(detail);
    }
    return row;
  }
  function collaborationMessages() { return (((state || {}).collaboration || {}).discussion || {}).recent || []; }
  function renderShortlistFeed(slots) {
    var box = $('[data-sim-shortlist-feed]'); if (!box) return;
    var ids = slots.map(function (s) { return s.ideaId; }), messages = collaborationMessages().filter(function (m) { return ids.indexOf(m.ideaId) >= 0; }).slice(-16);
    box.textContent = ''; if (!messages.length) box.appendChild(el('p', 'sim-empty', 'No team report for the current shortlist yet. Earlier class chat stays in the discussion archive.'));
    messages.forEach(function (m) { box.appendChild(collaborativeMessage(m)); });
  }
  function renderTeams(slots) {
    var box = $('[data-sim-teams]'); if (!box) return; box.textContent = '';
    if (!slots.length) { box.appendChild(el('p', 'sim-empty', 'Research teams form around the selected startup plans. No shortlist has been declared yet.')); return; }
    slots.forEach(function (slot) {
      var idea = findIdea(slot.ideaId), card = el('article', 'sim-report'); card.setAttribute('data-detail-scope', 'team-' + slot.ideaId); card.appendChild(el('p', 'sim-rank', slot.ideaId + ' · Research / Build / Challenge')); card.appendChild(el('h3', null, idea.title)); card.appendChild(teamLine(slot.team));
      var reports = collaborationMessages().filter(function (m) { return m.ideaId === slot.ideaId && ['research', 'challenge', 'plan'].indexOf(m.kind) >= 0; }).slice(-3);
      if (!reports.length) card.appendChild(el('p', 'soft', 'The team has not returned a public research report yet.'));
      else { var last = reports[reports.length - 1]; card.appendChild(el('p', 'sim-report-status', 'Latest report · ' + shortWhen(last.t))); card.appendChild(el('p', null, last.say)); var more = el('details'); more.appendChild(el('summary', null, 'Open team reports & receipts')); reports.forEach(function (m) { more.appendChild(collaborativeMessage(m)); }); card.appendChild(more); }
      var link = el('a', null, 'See the implementation plan →'); link.href = '#plan-' + slot.ideaId; link.setAttribute('data-open-plan', slot.ideaId); card.appendChild(link); box.appendChild(card);
    });
  }
  function renderCommonMemory() {
    var box = $('[data-sim-memory]'); if (!box) return; box.textContent = '';
    var memory = ((state && state.collaboration) || {}).memory;
    if (!memory) { box.appendChild(el('p', 'sim-empty', 'The shared notebook is starting. Earlier assessed lessons remain available below.')); return; }
    var patterns = el('article', 'sim-memory-card'); patterns.appendChild(el('h3', null, 'What makes a good startup here'));
    var principles = (memory.principles || []).slice(0, 8);
    principles.forEach(function (p) { var detail = el('details'); detail.appendChild(el('summary', null, p.title + (p.status === 'contested' ? ' · contested' : ''))); detail.appendChild(el('p', null, p.text)); detail.appendChild(el('small', null, (p.kind === 'fixed' ? 'Fixed criterion' : 'Learned model judgement') + (p.at ? ' · ' + shortWhen(p.at) : ''))); if (p.evidence && p.evidence.length) detail.appendChild(receiptList(p.evidence)); if (p.dissent && p.dissent.length) detail.appendChild(bullets(p.dissent)); patterns.appendChild(detail); });
    if (!principles.length) patterns.appendChild(el('p', 'soft', 'Common criteria are waiting for the next collaborative turn.')); box.appendChild(patterns);
    var changes = el('article', 'sim-memory-card'); changes.appendChild(el('h3', null, 'What changed, and what is still unknown'));
    var lessons = (memory.lessons || []).slice(-3).reverse(); lessons.forEach(function (x) {
      var p = el('p', null, (x.ideaId ? x.ideaId + ': ' : '') + x.text); if (x.at) p.appendChild(el('small', null, shortWhen(x.at))); changes.appendChild(p);
      if (x.evidence && x.evidence.length) { var sources = el('details'); sources.setAttribute('data-detail-scope', 'lesson-' + x.at + '-' + x.ideaId); sources.appendChild(el('summary', null, 'Sources behind this change')); sources.appendChild(receiptList(x.evidence)); changes.appendChild(sources); }
      if (x.dissent && x.dissent.length) changes.appendChild(bullets(x.dissent));
    });
    if (!lessons.length) changes.appendChild(el('p', 'soft', 'No shared change has been recorded yet.'));
    if (memory.openQuestions && memory.openQuestions.length) { changes.appendChild(el('h3', null, 'Next questions to answer')); changes.appendChild(bullets(memory.openQuestions.slice(0, 4))); } box.appendChild(changes);
  }

  function renderLearning() {
    var box = $('[data-sim-learning]'); if (!box) return;
    box.textContent = '';
    var l = state && state.learning, r = state && state.research;
    if (!l) { box.appendChild(el('p', 'soft', 'Research and learning will appear after the next upgraded turn. Existing class history is preserved.')); return; }
    var stats = l.stats || {}, names = { 'source-first': 'Start from a source', 'repeat-use': 'Design for weekly return', 'payer-test': 'Test the payer first', 'bounded-loop': 'Design the whole loop' };
    var row = el('div', 'sim-learning-stats');
    row.appendChild(el('p', null, ((r && r.records) || []).length + ' public research receipts'));
    row.appendChild(el('p', null, (stats.reviews || 0) + ' independent idea reviews'));
    row.appendChild(el('p', null, (stats.revisionsAccepted || 0) + ' ' + (stats.revisionsAccepted === 1 ? 'revision' : 'revisions') + ' kept · ' + (stats.revisionsRejected || 0) + ' rejected'));
    box.appendChild(row);
    box.appendChild(el('p', null, 'Current method: ' + (names[l.active] || l.active) + '.'));
    if (l.trial) box.appendChild(el('p', 'soft', 'Testing “' + (names[l.trial.candidate] || l.trial.candidate) + '” against the current method: ' + l.trial.pairs.length + ' of 3 matched pairs reviewed. No winner declared yet.'));
    var last = (l.history || []).slice(-1)[0];
    if (last) box.appendChild(el('p', 'soft', last.pairs ? 'Last trial: ' + (names[last.candidateStrategy] || last.candidateStrategy) + ' averaged ' + last.candidate + '/10 versus ' + last.baseline + '/10 across ' + last.pairs + ' matched pairs; ' + (last.adopted ? 'the better method was kept.' : 'the current method stayed.') : 'Last trial was not adopted: ' + last.reason));
    var lessons = (l.lessons || []).slice(-2);
    lessons.forEach(function (x) {
      var detail = el('details', 'sim-learning-lesson'), text = String(x.text || '');
      var compact = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
      if (compact.length > 220) compact = compact.slice(0, 219).replace(/\s+\S*$/, '') + '…';
      detail.appendChild(el('summary', null, (x.context ? x.context + ': ' : '') + compact));
      detail.appendChild(el('p', null, text)); box.appendChild(detail);
    });
    var details = el('details', 'sim-research'); details.appendChild(el('summary', null, 'Open the actual research sources' + (r && r.fetchedAt ? ' · fetched ' + shortWhen(r.fetchedAt) : '')));
    ((r && r.records) || []).forEach(function (source) {
      if (!/^https:\/\/(www\.)?(riga\.lv|liaa\.gov\.lv)\//.test(source.url || '')) return;
      var p = el('p'), a = el('a', null, source.title); a.href = source.url; a.target = '_blank'; a.rel = 'noopener'; p.appendChild(a); p.appendChild(el('small', null, source.excerpt)); details.appendChild(p);
    });
    if (r && r.failures && r.failures.length) details.appendChild(el('p', 'soft', r.failures.length + ' feeds unavailable; their contents were not invented.'));
    box.appendChild(details);
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
    var tail = ' · ' + n + ' class chat messages · ' + activeSlots().length + ' active plans';
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
    var count = $('[data-sim-history-count]'); if (count) count.textContent = '(' + list.length + ')';
    if (!list.length) { box.appendChild(el('p', 'sim-empty', 'No historical decisions yet.')); return; }
    list.forEach(function (i) {
      var c = el('article', 'sim-pcard');
      c.id = 'prod-' + i.id;
      var top = el('div', 'sim-pc-top');
      top.appendChild(el('span', 'sim-iid', i.id));
      top.appendChild(el('span', 'sim-pc-how' + (i.prodHow === 'allin' ? ' allin' : ''), 'Historical vote · ' + ideaHow(i)));
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
    var open = (state ? state.ideas : []).filter(function (i) { return i.status === 'open' && !implementationHold(i); });
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
    var held = (state ? state.ideas : []).filter(function (i) { return !!implementationHold(i); }), heldBox = $('[data-sim-held]'), heldCount = $('[data-sim-held-count]');
    if (heldCount) heldCount.textContent = held.length ? '(' + held.length + ')' : '';
    if (heldBox) {
      heldBox.textContent = ''; if (!held.length) heldBox.appendChild(el('p', 'sim-empty', 'No version is held from implementation.'));
      held.forEach(function (i) {
        var record = implementationHold(i), card = el('article', 'sim-drop'); card.id = 'held-' + i.id; card.appendChild(el('span', 'sim-iid', i.id));
        var unsafe = i.review && i.review.safe === false;
        card.appendChild(el('h3', null, unsafe ? 'Content held for safety review' : i.title)); card.appendChild(el('p', 'sim-meta', record.reason || 'This version is held from the active implementation shortlist.'));
        if (!unsafe) { var detail = el('details'); detail.appendChild(el('summary', null, 'Earlier hypothesis & review')); detail.appendChild(fieldList(i)); card.appendChild(detail); }
        card.appendChild(el('p', 'sim-model-note', 'To re-enter: materially revise the idea, add new source evidence, and pass a new independent review. Earlier votes do not bypass this.')); heldBox.appendChild(card);
      });
    }
  }

  // ------------------------------------------------------------ chat
  var ACT = { pitch: 'pitched', refine: 'proposes revision to', back: 'backs', oppose: 'opposes', allin: 'ALL IN on', drop: 'drop' };
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
      return getJSON('chat/' + days[idx] + '.json').then(function (arr) {
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
    var open = (state ? state.ideas : []).filter(function (i) { return i.status === 'open' && !implementationHold(i); });
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
    var target = document.getElementById('plan-' + id) || document.getElementById('idea-' + id) || document.getElementById('held-' + id) || document.getElementById('prod-' + id) || document.getElementById('drop-' + id);
    if (!target) return;
    if (target.classList.contains('sim-plan')) target.open = true;
    if (target.id.indexOf('idea-') === 0) setTab('board');
    if (target.id.indexOf('prod-') === 0) { var history = $('.sim-archive-votes'); if (history) history.open = true; }
    if (target.id.indexOf('held-') === 0) { var held = $('.sim-held'); if (held) held.open = true; setTab('board'); }
    if (target.id.indexOf('drop-') === 0) { var d = $('.sim-dropped'); if (d) d.open = true; setTab('board'); }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('sim-flash');
    void target.offsetWidth;
    target.classList.add('sim-flash');
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-person],[data-idea],[data-open-plan],[data-sim-tab],[data-sim-close]') : null;
    if (!t) { if (e.target === dlg) closePerson(); return; }
    if (t.hasAttribute('data-sim-close')) closePerson();
    else if (t.hasAttribute('data-open-plan')) { e.preventDefault(); var id = t.getAttribute('data-open-plan'); focusIdea(id); history.replaceState(null, '', '#plan-' + id); }
    else if (t.hasAttribute('data-person')) openPerson(t.getAttribute('data-person'));
    else if (t.hasAttribute('data-idea')) focusIdea(t.getAttribute('data-idea'));
    else if (t.hasAttribute('data-sim-tab')) setTab(t.getAttribute('data-sim-tab'));
  });
  olderBtn.addEventListener('click', loadOlder);
  newBtn.addEventListener('click', toBottom);
  chat.addEventListener('scroll', function () { if (nearBottom()) newBtn.hidden = true; });

  // ------------------------------------------------------------ load + poll
  function apply(s) {
    var opened = Array.from(document.querySelectorAll('#shortlist details[open],#teams details[open],#memory details[open]')).map(detailKey);
    state = s;
    renderStatus();
    renderCollaboration();
    renderLearning();
    renderProd();
    renderBoard();
    if (s && s.recent) appendMessages(s.recent);
    renderPeople();
    document.querySelectorAll('#shortlist details,#teams details,#memory details').forEach(function (d) { if (opened.indexOf(detailKey(d)) >= 0) d.open = true; });
    var planHash = location.hash.match(/^#plan-(I\d+)$/); if (planHash) { var linked = document.getElementById('plan-' + planHash[1]); if (linked) linked.open = true; }
    if (s) updateOlder();
    if (!s || !(s.recent || []).length) {
      if (!msgsBox.childNodes.length) msgsBox.appendChild(el('p', 'sim-empty sim-chat-empty', 'The chat is empty. The first students speak a few minutes after launch.'));
    } else {
      var e = msgsBox.querySelector('.sim-chat-empty'); if (e) e.remove();
    }
  }
  function detailKey(detail) { var scope = detail.closest('.sim-plan,[data-detail-scope]'), summary = detail.querySelector('summary'); return (scope ? scope.id || scope.getAttribute('data-detail-scope') : '') + '\n' + (summary ? summary.textContent : ''); }
  function load() {
    return getJSON('state.json').then(apply).catch(function () {
      if (!state) setStatus('waiting', 'Could not reach the class data. It will retry in a minute.');
    });
  }
  fetch('people.json').then(function (r) { return r.json(); }).then(function (j) {
    people = j.people || [];
    people.forEach(function (p) { byId[p.id] = p; });
    renderPeople();
    return load();
  }).catch(function () { setStatus('paused', 'Could not load the class list.'); });

  setInterval(function () { if (!document.hidden) setTimeout(load, Math.random() * 15000); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  setInterval(function () { if (state) { renderStatus(); } }, 30000);
})();
