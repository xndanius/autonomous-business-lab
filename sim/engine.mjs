#!/usr/bin/env node
// Class simulation engine for the Autonomous Business Lab site.
//
// 38 fictional SSE Riga third-year students argue in a class chat about which
// business ideas are worth launching. Each run ("tick") lets a few students
// speak. Every student is a separate model call that sees only:
//   - their own profile, the class list, the idea board, the last messages.
// The engine (not the model) enforces the rules: backing limits, production,
// dropping, the daily budget.
//
// Usage: node sim/engine.mjs --data <dir> [--ticks N] [--force] [--mock]
// Env:   OPENAI_API_KEY, SIM_MODEL, SIM_FALLBACK_MODEL, SIM_REASONING,
//        SIM_PRICE_IN, SIM_PRICE_OUT, SIM_PRICE_CACHED (USD per 1M tokens),
//        SIM_DAILY_CAP_USD, SIM_SPEAKERS, SIM_NIGHT_SPEAKERS, SIM_PAUSED, SIM_MOCK
// No dependencies. Node 20+.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// ---------------------------------------------------------------- config
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
function env(k, d = '') {
  const v = process.env[k];
  return v === undefined || v === null || String(v).trim() === '' ? d : String(v).trim();
}
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const num = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const DATA = path.resolve(String(arg('data', 'data')));
const TICKS = clamp(int(arg('ticks', '1'), 1), 1, 12);
const FORCE = arg('force', false) === true || arg('force', false) === 'true';
const MOCK = env('SIM_MOCK') === '1' || arg('mock', false) === true;
const START = arg('now', null) ? new Date(String(arg('now'))) : null; // tests only
const STEP_MIN = num(arg('step-min', '5'), 5); // tests only: virtual minutes per tick

// USD per 1M tokens [input, output]. Override with SIM_PRICE_IN / SIM_PRICE_OUT.
const PRICE_TABLE = {
  'gpt-6.1-sol': [2, 10],
  'gpt-6-luna': [0.1, 0.5],
  'gpt-6-astra': [10, 50],
};

const CFG = {
  key: env('OPENAI_API_KEY'),
  base: env('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
  model: env('SIM_MODEL', 'gpt-6.1-sol'),
  fallback: env('SIM_FALLBACK_MODEL', 'gpt-6-luna'),
  effort: env('SIM_REASONING', 'low'),
  cap: num(env('SIM_DAILY_CAP_USD', '10'), 10),
  speakers: clamp(int(env('SIM_SPEAKERS', '3'), 3), 1, 6),
  nightSpeakers: clamp(int(env('SIM_NIGHT_SPEAKERS', '1'), 1), 0, 6),
  paused: ['1', 'true', 'yes'].includes(env('SIM_PAUSED').toLowerCase()),
  minGapMin: num(env('SIM_MIN_GAP_MIN', '3'), 3),
  maxOut: clamp(int(env('SIM_MAX_OUTPUT_TOKENS', '2500'), 2500), 400, 16000),
};

function priceFor(model) {
  const t = PRICE_TABLE[model] || [5, 25]; // unknown model: assume expensive
  const pin = num(env('SIM_PRICE_IN'), t[0]);
  const pout = num(env('SIM_PRICE_OUT'), t[1]);
  const pcached = num(env('SIM_PRICE_CACHED'), pin); // unknown: count cached input at full price
  return { pin, pout, pcached };
}

export const RULES = {
  classSize: 38,
  majority: 20, // backers needed for production
  maxOpen: 6, // open ideas on the board
  maxBacks: 2, // open ideas one student can back at once
  allinMinBackers: 8,
  allinRatio: 2, // backers >= 2 x opponents
  allinMinAgeMin: 120,
  dropOpp: 8, // voted down: >= 8 opponents and more opponents than backers
  staleHours: 12, // no activity -> dropped
  recentPrompt: 24, // messages a student sees
  recentKeep: 80, // messages kept in state.json
  droppedKeep: 40,
};

// ---------------------------------------------------------------- time
const TZ = 'Europe/Riga';
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23',
});
const FMT_LONG = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
function riga(d) {
  const o = {};
  for (const p of FMT.formatToParts(d)) o[p.type] = p.value;
  return {
    date: `${o.year}-${o.month}-${o.day}`, hour: +o.hour, minute: +o.minute,
    weekday: o.weekday, hm: `${o.hour}:${o.minute}`, long: FMT_LONG.format(d),
  };
}
function isoWeek(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow + 3);
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((t - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}
const minutesSince = (a, now) => (now - new Date(a)) / 6e4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- io
async function readJSON(file, def) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return def;
    throw e;
  }
}
async function writeJSON(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(obj));
  await fs.rename(tmp, file);
}

// ---------------------------------------------------------------- text helpers
const FIELDS = ['title', 'line', 'payer', 'price', 'test', 'loop'];
const LIMITS = { title: 60, line: 200, payer: 140, price: 100, test: 200, loop: 220 };
const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function clean(s, max) {
  let t = String(s ?? '').replace(/\s*\u2014\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^["“”']+|["“”']+$/g, '').trim();
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return t;
}
function mentions(text, first) {
  const re = new RegExp('(^|[^\\p{L}])@?' + fold(first).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}])', 'u');
  return re.test(fold(text));
}
const STOP = new Set(['for', 'the', 'and', 'with', 'from', 'your', 'our', 'app', 'that', 'this']);
function words(s) {
  return new Set(fold(s).replace(/[^\p{L}\p{N} ]/gu, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
}
function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  let x = 0;
  for (const w of A) if (B.has(w)) x++;
  return x / Math.min(A.size, B.size) >= 0.75 && x >= 2;
}
const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

// ---------------------------------------------------------------- state
function freshState(now) {
  return {
    v: 1, startedAt: iso(now), tick: 0, lastTickAt: null, n: 0, nextIdea: 1,
    status: 'starting', note: '', mock: MOCK || undefined,
    model: null, api: null,
    budget: { day: null, usd: 0, cap: CFG.cap, calls: 0, totalUsd: 0, totalCalls: 0 },
    stats: { messages: 0, pitched: 0, refined: 0, production: 0, dropped: 0 },
    ideas: [], recent: [], days: {}, allin: {}, mem: {}, ps: {}, err: null,
  };
}
const openIdeas = (s) => s.ideas.filter((i) => i.status === 'open');
function findOpen(s, id) {
  if (!id) return null;
  const k = String(id).trim().toUpperCase().replace(/^#/, '');
  const key = /^I?\d+$/.test(k) ? (k.startsWith('I') ? k : 'I' + k) : k;
  return s.ideas.find((i) => i.id === key && i.status === 'open') || null;
}
const complete = (i) => FIELDS.every((k) => i[k] && String(i[k]).trim()) && /(€|eur|\d)/i.test(i.price);

function sysMsg(s, now, say, act, idea) {
  const m = { n: ++s.n, t: iso(now), by: 'sys', say, act };
  if (idea) m.idea = idea;
  return m;
}
function promote(s, idea, how, by, now, people) {
  idea.status = 'production';
  idea.prodAt = iso(now);
  idea.prodHow = how;
  if (by) idea.prodBy = by;
  idea.prodVotes = { back: idea.backers.length, opp: idea.opp.length };
  s.stats.production++;
  const who = by ? people.byId[by]?.first || by : '';
  const say = how === 'majority'
    ? `${idea.id} “${idea.title}” goes to production: ${idea.backers.length} of ${RULES.classSize} back it.`
    : `${idea.id} “${idea.title}” goes to production: ${who} played the all-in card. ${idea.backers.length} back it, ${idea.opp.length} oppose.`;
  return sysMsg(s, now, say, 'prod', idea.id);
}
function dropIdea(s, idea, why, now) {
  idea.status = 'dropped';
  idea.dropAt = iso(now);
  idea.dropWhy = why;
  s.stats.dropped++;
  return sysMsg(s, now, `${idea.id} “${idea.title}” is dropped: ${why}.`, 'drop', idea.id);
}
function back(s, sid, idea, now) {
  idea.opp = idea.opp.filter((x) => x !== sid);
  idea.act = iso(now);
  if (idea.backers.includes(sid)) return null;
  idea.bt = idea.bt || {};
  const mine = openIdeas(s).filter((i) => i.id !== idea.id && i.backers.includes(sid));
  let moved = null;
  if (mine.length >= RULES.maxBacks) {
    mine.sort((a, b) => (a.by === sid) - (b.by === sid) || String(a.bt?.[sid] || '').localeCompare(String(b.bt?.[sid] || '')));
    moved = mine[0];
    moved.backers = moved.backers.filter((x) => x !== sid);
    if (moved.bt) delete moved.bt[sid];
  }
  idea.backers.push(sid);
  idea.bt[sid] = iso(now);
  return moved;
}
function oppose(s, sid, idea, now) {
  idea.backers = idea.backers.filter((x) => x !== sid);
  if (idea.bt) delete idea.bt[sid];
  if (!idea.opp.includes(sid)) idea.opp.push(sid);
  idea.act = iso(now);
}
function allinBlock(s, sid, idea, now, week) {
  if (s.allin[sid] === week) return 'the all-in card is already used this week';
  if (idea.backers.length < RULES.allinMinBackers) return `it needs ${RULES.allinMinBackers} backers, it has ${idea.backers.length}`;
  if (idea.backers.length < RULES.allinRatio * idea.opp.length) return `it needs twice as many backers as opponents (${idea.backers.length} vs ${idea.opp.length})`;
  if (minutesSince(idea.at, now) < RULES.allinMinAgeMin) return 'the idea is less than 2 hours old';
  if (!complete(idea)) return 'it still needs a payer, a price in euros, a first test and a loop';
  return null;
}
function checkIdea(s, idea, now, people) {
  if (idea.status !== 'open') return null;
  if (idea.backers.length >= RULES.majority && complete(idea)) return promote(s, idea, 'majority', null, now, people);
  if (idea.opp.length >= RULES.dropOpp && idea.opp.length > idea.backers.length)
    return dropIdea(s, idea, `voted down (${idea.opp.length} oppose, ${idea.backers.length} back)`, now);
  return null;
}
function housekeeping(s, now) {
  const out = [];
  for (const i of openIdeas(s)) {
    if (minutesSince(i.act || i.at, now) > RULES.staleHours * 60) out.push(dropIdea(s, i, `nobody touched it for ${RULES.staleHours} hours`, now));
  }
  // keep state.json small: archive old dropped ideas
  const dropped = s.ideas.filter((i) => i.status === 'dropped');
  const extra = dropped.length - RULES.droppedKeep;
  const archived = extra > 0 ? dropped.slice(0, extra) : [];
  if (archived.length) s.ideas = s.ideas.filter((i) => !archived.includes(i));
  return { msgs: out, archived };
}

// ---------------------------------------------------------------- people
async function loadPeople() {
  const j = await readJSON(path.join(ROOT, 'simulation', 'people.json'), null);
  if (!j || !Array.isArray(j.people)) throw new Error('simulation/people.json missing');
  const ps = j.people;
  ps.byId = Object.fromEntries(ps.map((p) => [p.id, p]));
  return ps;
}

function pickSpeakers(s, people, n, rnd) {
  const msgs = s.recent.filter((m) => m.by !== 'sys');
  const lastBy = msgs.length ? msgs[msgs.length - 1].by : null;
  const recentBy = new Set(msgs.slice(-6).map((m) => m.by));
  const lastIdx = {};
  msgs.forEach((m, i) => (lastIdx[m.by] = i));
  const w = people.map((p) => {
    let x = Math.pow(p.talk || 3, 1.4);
    const since = msgs.slice((lastIdx[p.id] ?? -1) + 1).slice(-12);
    if (since.some((m) => m.by !== p.id && mentions(m.say, p.first))) x *= 4;
    if (openIdeas(s).some((i) => i.by === p.id && since.some((m) => m.idea === i.id && m.by !== p.id))) x *= 2.5;
    if (!(p.id in lastIdx)) x *= 1.6; // has not spoken yet
    if (recentBy.has(p.id)) x *= 0.25;
    if (p.id === lastBy) x = 0;
    return x;
  });
  const out = [];
  for (let k = 0; k < n; k++) {
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let r = rnd() * total;
    let i = 0;
    for (; i < w.length; i++) { r -= w[i]; if (r <= 0) break; }
    i = Math.min(i, w.length - 1);
    out.push(people[i]);
    w[i] = 0;
  }
  return out;
}

// ---------------------------------------------------------------- prompt
function rosterLine(p) {
  const trait = String(p.character || '').split('.')[0];
  return `- ${p.name} (${p.town}, ${p.cc}): ${trait}.`;
}
function systemPrompt(people) {
  return `You play ONE student in the group chat of a third-year class at the Stockholm School of Economics in Riga (SSE Riga). The class has 38 students. Everyone in the chat is a separate person; you speak only for yourself.

THE SITUATION
This term the class has a challenge: launch a small real business where AI does most of the repeat work, "a loop that runs without you". In this chat the class argues about which business ideas are actually good, improves them, and decides which ones go to production (teams will really build them). The discussion never ends: when ideas go to production, the class looks for the next ones.

WHAT MAKES AN IDEA GOOD HERE
- A payer you can name and reach this week ("dental clinics in Riga with 2-5 chairs", not "SMEs").
- A pain they already spend money or hours on.
- A price people here would really pay.
- A first test that takes a week and costs under €50.
- A loop: what keeps running without the founders (AI and simple tools), and what a human still checks.

PRICE REALITY IN RIGA
You live here, so you know what people really pay. Rough anchors:
- A typical net salary in Riga is about €1,200-1,500 a month. Many people earn less.
- A business lunch is €7-10, a cappuccino €3-4, a Bolt ride across town €5-10.
- Students almost never pay for apps. €2-5 is a lot for them. Free beats cheap.
- Consumers rarely start new subscriptions. They prefer free, one-off payments, or paying a person they know.
- Small businesses pay when it brings customers or saves the owner hours: often €10-50 a month. €100+ only when it clearly replaces staff time or wins money.
- For small service businesses, a commission or a fee per result often sells better than a monthly fee.
- Owners want a free first month and hate long contracts. Many prices here are a third of Nordic prices.
If a price would make people in Riga laugh, say so and suggest a better one with a reason from real life. Don't invent statistics.

CHAT RULES
1. This is a group chat, not an essay. Most messages are 5-30 words. Sometimes just "ok I'm in" or "no way, too pricey for here". Never more than 3 sentences.
2. Write the way your profile says you write. People sound different: some lowercase, some blunt, some funny, some careful.
3. Don't start with a classmate's name unless you are answering them. Don't open with "In my experience" or "From my job at". Bring in your own life only when it adds a fact.
4. Take positions. When you have heard enough about an idea, back it or oppose it, with one reason. Refine an idea when you can make its price, payer or first test more realistic.
5. Disagree when you disagree. Ask the hard questions: who exactly pays, how much, how do we reach the first 10, what runs without us?
6. Don't repeat what was just said. Move the discussion forward.
7. English is the class language; an occasional word in your own language is fine. No em dashes, no bullet lists, no hashtags, no assistant tone.
8. Stay on business. Personal stories are welcome. No politics, no insults. Ideas must be legal, decent and possible for students to start this month.
9. You are a real student here: never mention AI agents, models, prompts or a simulation. Don't name real private people.
10. Use first names. You can @mention a classmate.

WHAT YOU CAN DO (one action per message)
- "talk": say something without changing the board (question, story, objection, joke).
- "pitch": put a new idea on the board. Only if fewer than 6 ideas are open. Fill all six fields.
- "refine": improve an open idea: change one or more fields (a more realistic price, a sharper payer, a cheaper first test, a clearer loop).
- "back": support an open idea. You can back at most 2 open ideas at once; backing a third moves your support away from your oldest one.
- "oppose": say an idea won't work. Opposing removes your backing.
- "allin": you believe in an idea so strongly that you push it to production now. Works only if it has at least 8 backers, at least twice as many backers as opponents, is at least 2 hours old, and you have not used your all-in card this week. Rare. Use it only if you would bet your summer on it.
- "drop": ask to drop an idea. If it is your own idea, it is withdrawn at once.

HOW IDEAS GO TO PRODUCTION
Automatically when 20 of the 38 students back it, or through an all-in. Production is permanent. Ideas with 8+ opponents and more opponents than backers are dropped, and so are ideas nobody touches for 12 hours.

THE CLASS
${people.map(rosterLine).join('\n')}

REPLY FORMAT
Reply with one JSON object and nothing else:
{"say": "your chat message", "do": "talk|pitch|refine|back|oppose|allin|drop", "idea": "I7" or null, "fields": {...} or null, "conviction": 1-5}
- "fields" for pitch: all six keys. For refine: only the keys you change. Otherwise null.
  Keep fields short, like a sticky note. title: max 5 words. line: what it is, max 15 words. payer: who pays, max 12 words. price: only the amount and unit ("€15 a month per salon", "€2 per booking"). test: the first test this week, max 20 words. loop: what runs without the founders and what a human checks, max 20 words.
- "conviction": how strongly you feel about this message, 1 (meh) to 5 (would bet my summer on it).`;
}

function fmtIdea(i, people, full) {
  const nm = (id) => people.byId[id]?.first || id;
  const age = Math.max(0, Math.round(minutesSince(i.at, CLOCK.now) / 60));
  const head = `${i.id} “${i.title}” by ${nm(i.by)}, ${age < 1 ? 'new' : age + 'h old'} · ${i.backers.length} back${i.backers.length ? ' (' + i.backers.map(nm).join(', ') + ')' : ''} · ${i.opp.length} oppose${i.opp.length ? ' (' + i.opp.map(nm).join(', ') + ')' : ''}`;
  if (!full) return head;
  const lines = [head, `   What: ${i.line}`, `   Payer: ${i.payer}`, `   Price: ${i.price}`, `   First test: ${i.test}`, `   Loop: ${i.loop}`];
  const ch = (i.hist || []).slice(-3).map((h) => Object.entries(h.ch).map(([k, [a, b]]) => `${k} “${a}” → “${b}” (${nm(h.by)})`).join('; '));
  if (ch.length) lines.push(`   Recent changes: ${ch.join(' | ')}`);
  return lines.join('\n');
}
function fmtMsg(m, people) {
  const t = riga(new Date(m.t)).hm;
  if (m.by === 'sys') return `[${t}] (class board) ${m.say}`;
  const p = people.byId[m.by];
  const tag = { pitch: ` (pitched ${m.idea})`, refine: ` (refined ${m.idea})`, back: ` (backs ${m.idea})`, oppose: ` (opposes ${m.idea})`, allin: ` (ALL-IN on ${m.idea})`, drop: ` (wants ${m.idea} dropped)` }[m.act] || (m.idea ? ` (about ${m.idea})` : '');
  return `[${t}] ${p ? p.first : m.by}${tag}: ${m.say}`;
}

const ANGLES = [
  'Question a price on the board, with a real number from your life.',
  'Ask who exactly pays, and how the team would reach the first 10 of them.',
  'Tell a short story from your own life that supports or kills one idea.',
  'Propose a cheaper, faster first test for one idea.',
  'Point out a practical risk: law, data, trust, time or seasonality.',
  'Ask what really runs without the founders, and what still needs a human.',
  'If you have made up your mind about an idea, back it or oppose it now, with one reason.',
  'If you have made up your mind about an idea, back it or oppose it now, with one reason.',
  'Push back on the last message if you disagree.',
  'Say something short and human (a joke, a doubt, a late-night thought) that still helps.',
  'Answer a question someone asked recently, if you know the answer.',
  'Do what you would naturally do here.',
]

function nudge(s, people, p, rnd) {
  const msgs = s.recent.filter((m) => m.by !== 'sys');
  let li = -1;
  msgs.forEach((m, i) => { if (m.by === p.id) li = i; });
  const since = msgs.slice(li + 1).slice(-12);
  const by = [...new Set(since.filter((m) => m.by !== p.id && mentions(m.say, p.first)).map((m) => people.byId[m.by]?.first).filter(Boolean))];
  const open = openIdeas(s);
  const out = [];
  if (by.length) out.push(`${list(by)} mentioned you. Answer.`);
  const own = open.filter((i) => i.by === p.id && i.opp.length);
  if (own.length) out.push(`Your idea ${own[0].id} has critics. Defend it, fix it, or drop it.`);
  const near = open.filter((i) => i.backers.length >= RULES.majority - 5 && !i.backers.includes(p.id) && !i.opp.includes(p.id)).sort((a, b) => b.backers.length - a.backers.length)[0];
  if (near) out.push(`${near.id} is close to production (${near.backers.length}/${RULES.majority}). Decide where you stand.`);
  if (open.length < 3) out.push('The board needs ideas. If something from your own life fits, pitch it.');
  if (out.length < 2 && open.length >= 2 && !open.some((i) => i.backers.includes(p.id)) && rnd() < 0.5) out.push('You back no idea yet. Back one you believe in, or say what would convince you.');
  if (out.length < 2) {
    const pitched = s.ps[p.id]?.p || 0;
    if (open.length < RULES.maxOpen && !pitched && rnd() < 0.35) out.push('If you have a better idea than what is on the board, pitch it.');
    else out.push(ANGLES[Math.floor(rnd() * ANGLES.length)]);
  }
  return out.slice(0, 2).join(' ');
}

function userPrompt(s, people, p, now, rnd) {
  const r = riga(now);
  const nm = (id) => people.byId[id]?.first || id;
  const open = openIdeas(s).sort((a, b) => b.backers.length - a.backers.length);
  const prod = s.ideas.filter((i) => i.status === 'production');
  const dropped = s.ideas.filter((i) => i.status === 'dropped').slice(-5);
  const backs = open.filter((i) => i.backers.includes(p.id)).map((i) => `${i.id} “${i.title}”`);
  const opps = open.filter((i) => i.opp.includes(p.id)).map((i) => `${i.id} “${i.title}”`);
  const week = isoWeek(r.date);
  const mem = (s.mem[p.id] || []).map((x) => `“${x}”`).join(' / ');
  const recent = s.recent.slice(-RULES.recentPrompt).map((m) => fmtMsg(m, people)).join('\n');
  return `YOU ARE ${p.name}, ${p.age}, from ${p.origin}.
Lives: ${p.lives}
Languages: ${(p.languages || []).join(', ')}
Family: ${p.family}
Money: ${p.money}
Experience: ${(p.experience || []).join('; ')}
Your story: ${p.story}
Character: ${p.character}
You believe: ${(p.believes || []).join('; ')}
Your sense of prices: ${p.prices}

YOUR POSITION
You back: ${backs.length ? backs.join(', ') : 'nothing yet'}.
You oppose: ${opps.length ? opps.join(', ') : 'nothing'}.
Your all-in card this week: ${s.allin[p.id] === week ? 'used' : 'unused'}.
Your last messages: ${mem || 'none yet'}

NOW: ${r.weekday} ${r.long}, ${r.hm} in Riga.

THE BOARD: ${open.length} open idea${open.length === 1 ? '' : 's'} (max ${RULES.maxOpen})${open.length ? '\n' + open.map((i) => fmtIdea(i, people, true)).join('\n') : ' — empty'}

IN PRODUCTION (decided, permanent): ${prod.length ? prod.map((i) => `${i.id} “${i.title}” (${i.price})`).join('; ') : 'nothing yet'}
RECENTLY DROPPED: ${dropped.length ? dropped.map((i) => `“${i.title}” (${i.dropWhy})`).join('; ') : 'nothing'}

LAST MESSAGES (oldest first)
${recent || '(the chat is empty)'}

YOUR MOVE: ${nudge(s, people, p, rnd)}
Write as yourself (${p.style}). Short. Reply with the JSON object only.`;
}

// ---------------------------------------------------------------- model call
const CLOCK = { now: new Date() };
class Fatal extends Error {}

function buildRequest(api, system, user) {
  const drop = new Set(api.drop || []);
  if (api.mode === 'chat') {
    const body = {
      model: api.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_completion_tokens: CFG.maxOut,
      reasoning_effort: CFG.effort,
      response_format: { type: 'json_object' },
    };
    for (const k of drop) delete body[k];
    return { url: CFG.base + '/chat/completions', body };
  }
  const body = {
    model: api.model,
    instructions: system,
    input: [{ role: 'user', content: user }],
    max_output_tokens: CFG.maxOut,
    reasoning: { effort: CFG.effort },
    text: { format: { type: 'json_object' } },
    store: false,
    prompt_cache_key: 'class-sim-v1',
  };
  for (const k of drop) delete body[k.split('.')[0]];
  return { url: CFG.base + '/responses', body };
}

async function callModel(s, system, user) {
  const today = riga(new Date()).date;
  if (!s.api || s.api.want !== CFG.model || (s.api.model !== s.api.want && s.api.day !== today)) {
    s.api = { want: CFG.model, model: CFG.model, mode: 'responses', drop: [], day: today };
  }
  const api = s.api;
  let lastErr = '';
  for (let attempt = 0; attempt < 7; attempt++) {
    const { url, body } = buildRequest(api, system, user);
    let res, text, data;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120000);
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CFG.key}` },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      text = await res.text();
    } catch (e) {
      clearTimeout(timer);
      lastErr = 'network: ' + (e.name === 'AbortError' ? 'timeout' : e.message);
      await sleep(3000);
      continue;
    }
    clearTimeout(timer);
    try { data = JSON.parse(text); } catch { data = null; }
    if (res.ok && data) return readResult(api, data);
    const err = (data && data.error) || {};
    const msg = String(err.message || text || '').slice(0, 400);
    const code = String(err.code || '');
    const param = String(err.param || '');
    lastErr = `${res.status} ${code} ${msg}`.trim();
    if (res.status === 401) throw new Fatal('OpenAI rejected the API key (401).');
    if (res.status === 429 && /insufficient_quota|billing|quota/i.test(code + msg)) throw new Fatal('OpenAI quota or billing limit reached.');
    const modelMissing = res.status === 404 || code === 'model_not_found' || /model.*(does not exist|not found|do not have access)/i.test(msg);
    if (res.status === 400 || res.status === 422) {
      const p = param || (msg.match(/(?:parameter|param)[: ]+'?([a-z_.]+)'?/i) || [])[1] || '';
      if (p && !modelMissing) {
        const k = api.mode === 'chat' ? p : p.split('.')[0];
        if (!api.drop.includes(k) && k !== 'model' && k !== 'input' && k !== 'messages') { api.drop.push(k); continue; }
      }
    }
    if (res.status === 404 && api.mode === 'responses' && !/model/i.test(msg)) { api.mode = 'chat'; api.drop = []; continue; }
    if (modelMissing && CFG.fallback && api.model !== CFG.fallback) { api.model = CFG.fallback; api.drop = []; api.day = today; continue; }
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
    throw new Error('OpenAI ' + lastErr);
  }
  throw new Error('OpenAI gave up after retries: ' + lastErr);
}

function readResult(api, data) {
  let text = '';
  let inTok = 0, outTok = 0, cached = 0;
  if (api.mode === 'chat') {
    text = data.choices?.[0]?.message?.content || '';
    inTok = data.usage?.prompt_tokens || 0;
    outTok = data.usage?.completion_tokens || 0;
    cached = data.usage?.prompt_tokens_details?.cached_tokens || 0;
  } else {
    for (const item of data.output || []) {
      if (item.type !== 'message') continue;
      for (const c of item.content || []) if (c.type === 'output_text' && c.text) text += c.text;
    }
    if (!text && typeof data.output_text === 'string') text = data.output_text;
    inTok = data.usage?.input_tokens || 0;
    outTok = data.usage?.output_tokens || 0;
    cached = data.usage?.input_tokens_details?.cached_tokens || 0;
  }
  const pr = priceFor(api.model);
  const cost = ((inTok - cached) * pr.pin + cached * pr.pcached + outTok * pr.pout) / 1e6;
  return { text, cost, usage: { in: inTok, out: outTok, cached }, model: api.model };
}

function parseReply(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const tryParse = (x) => { try { const j = JSON.parse(x); return j && typeof j === 'object' ? j : null; } catch { return null; } };
  let j = tryParse(t);
  if (!j) {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) j = tryParse(t.slice(a, b + 1));
  }
  if (!j && !t.includes('{') && t.length < 400) j = { say: t, do: 'talk' };
  return j;
}

// ---------------------------------------------------------------- mock (tests only)
const MOCK_IDEAS = [
  { title: 'Salon no-show fixer', line: 'Reminders and a waitlist that refills cancelled slots for salons.', payer: 'Beauty salons in Riga with 2-6 chairs', price: '€15 a month per salon', test: 'Run it by hand for 3 salons in Teika for one week', loop: 'AI texts clients and offers freed slots; the owner sees a daily list' },
  { title: 'Bakery waste forecast', line: 'Tells a small bakery how much to bake tomorrow.', payer: 'Small bakeries outside Riga', price: '€19 a month after a free month', test: 'Forecast for one bakery in Kuldīga for 7 days', loop: 'AI reads sales and weather, sends a bake list at 18:00; the baker approves' },
  { title: 'Receipt chaser for accountants', line: 'Collects missing receipts from clients of small accounting firms.', payer: 'Accounting firms with 20-80 clients', price: '€40 a month per firm', test: 'Chase receipts for 10 clients of one firm', loop: 'AI sends polite reminders and files receipts; the accountant checks odd ones' },
  { title: 'Guesthouse night replies', line: 'Answers guest questions at night for small guesthouses.', payer: 'Guesthouses in Jūrmala and Liepāja', price: '€12 a month, €20 in summer', test: 'Answer one guesthouse inbox for a weekend', loop: 'AI answers from house rules; the owner sees anything unusual in the morning' },
  { title: 'Sponsor follow-up helper', line: 'Writes and sends follow-ups to sponsors for student societies.', payer: 'Student societies with a sponsorship lead', price: '€3 per sponsor deal closed', test: 'Run it for one SSE society this week', loop: 'AI drafts follow-ups after each meeting; the lead approves before sending' },
  { title: 'Clinic cancellation filler', line: 'Fills cancelled dental appointments from a waitlist.', payer: 'Dental clinics in Riga with 2-5 chairs', price: '€2 per refilled slot', test: 'Manual waitlist for one clinic for 5 days', loop: 'AI texts the waitlist when a slot frees up; reception confirms' },
  { title: 'Tender alert for builders', line: 'Finds public tenders that match a small construction firm.', payer: 'Construction firms with 10-40 staff', price: '€60 a month', test: 'Send 3 firms a weekly tender list by hand', loop: 'AI scans tender sites daily and drafts a shortlist; the owner picks' },
];
const MOCK_TALK = [
  'Who exactly pays for this though?',
  'My mum would never pay monthly for that, maybe per use.',
  'That price is Nordic, not Riga. Halve it.',
  'I can ask two owners in my town tomorrow.',
  'What runs without us here? Sounds like a lot of manual work.',
  'I like it, but the first test is too big. Start with one shop.',
  'Honestly this is the only one I would build.',
];
function mockReply(s, people, p, rnd) {
  const open = openIdeas(s);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const r = rnd();
  let j;
  if ((open.length < 3 || (r < 0.12 && open.length < RULES.maxOpen))) {
    const used = new Set(s.ideas.map((i) => i.title));
    const f = MOCK_IDEAS.find((x) => !used.has(x.title)) || { ...pick(MOCK_IDEAS), title: 'Idea ' + (s.nextIdea) };
    j = { say: `[test] Pitch: ${f.line}`, do: 'pitch', fields: f, conviction: 4 };
  } else if (r < 0.62 && open.length) {
    const i = open.sort((a, b) => b.backers.length - a.backers.length)[Math.floor(Math.pow(rnd(), 2) * open.length)];
    j = { say: `[test] Backing ${i.title}. ${pick(MOCK_TALK)}`, do: 'back', idea: i.id, conviction: 3 };
  } else if (r < 0.72 && open.length) {
    const i = pick(open);
    j = { say: `[test] Not convinced by ${i.title}. ${pick(MOCK_TALK)}`, do: 'oppose', idea: i.id, conviction: 3 };
  } else if (r < 0.80 && open.length) {
    const i = pick(open);
    j = { say: `[test] Make the price smaller for ${i.title}.`, do: 'refine', idea: i.id, fields: { price: '€' + (5 + Math.floor(rnd() * 20)) + ' a month' }, conviction: 3 };
  } else if (r < 0.83 && open.length) {
    const i = open.sort((a, b) => b.backers.length - a.backers.length)[0];
    j = { say: `[test] I am all in on ${i.title}.`, do: 'allin', idea: i.id, conviction: 5 };
  } else {
    j = { say: '[test] ' + pick(MOCK_TALK), do: 'talk', idea: null, conviction: 2 };
  }
  return { text: JSON.stringify(j), cost: 0, usage: { in: 0, out: 0, cached: 0 }, model: 'mock' };
}

// ---------------------------------------------------------------- apply
function applyReply(s, people, p, j, now) {
  const say = clean(String(j.say || '').replace(new RegExp('^' + p.first + '\\s*:\\s*', 'i'), ''), 480);
  if (!say) return [];
  const recentSays = new Set(s.recent.slice(-40).map((m) => fold(m.say)));
  if (recentSays.has(fold(say))) return [];
  const act = String(j.do || j.action || 'talk').toLowerCase().trim();
  const conv = clamp(int(j.conviction, 3), 1, 5);
  const idea = findOpen(s, j.idea);
  const m = { n: 0, t: iso(now), by: p.id, say, act: 'talk', c: conv };
  const notes = [];
  const after = [];
  const f = {};
  if (j.fields && typeof j.fields === 'object') for (const k of FIELDS) if (j.fields[k]) f[k] = clean(j.fields[k], LIMITS[k]);
  const week = isoWeek(riga(now).date);

  if (act === 'pitch') {
    const open = openIdeas(s);
    if (open.length >= RULES.maxOpen) notes.push('Board full, pitch not added');
    else if (!f.title || !f.line) notes.push('Pitch needs a title and a line, not added');
    else if (s.ideas.some((i) => i.status !== 'dropped' && similar(i.title, f.title))) notes.push('Similar idea already on the list');
    else {
      const id = 'I' + s.nextIdea++;
      const it = { id, ...Object.fromEntries(FIELDS.map((k) => [k, f[k] || ''])), by: p.id, at: iso(now), act: iso(now), backers: [], opp: [], bt: {}, ver: 1, hist: [], status: 'open' };
      s.ideas.push(it);
      const moved = back(s, p.id, it, now);
      if (moved) notes.push(`Support moved from ${moved.id}`);
      m.act = 'pitch'; m.idea = id;
      s.stats.pitched++;
      (s.ps[p.id] ||= {}).p = (s.ps[p.id].p || 0) + 1;
    }
  } else if (['refine', 'back', 'oppose', 'allin', 'drop'].includes(act) && !idea) {
    if (j.idea) notes.push(`${String(j.idea).toUpperCase()} is not open`);
  } else if (act === 'refine') {
    const ch = {};
    for (const k of FIELDS) if (f[k] && f[k] !== idea[k]) { ch[k] = [idea[k], f[k]]; idea[k] = f[k]; }
    m.idea = idea.id;
    if (Object.keys(ch).length) {
      idea.ver++; idea.hist.push({ t: iso(now), by: p.id, ch }); idea.hist = idea.hist.slice(-12); idea.act = iso(now);
      m.act = 'refine'; m.ch = ch; s.stats.refined++;
    }
  } else if (act === 'back') {
    const moved = back(s, p.id, idea, now);
    if (moved) notes.push(`Support moved from ${moved.id}`);
    m.act = 'back'; m.idea = idea.id;
  } else if (act === 'oppose') {
    oppose(s, p.id, idea, now);
    m.act = 'oppose'; m.idea = idea.id;
  } else if (act === 'allin') {
    const moved = back(s, p.id, idea, now);
    if (moved) notes.push(`Support moved from ${moved.id}`);
    m.act = 'allin'; m.idea = idea.id; m.c = 5;
    const why = allinBlock(s, p.id, idea, now, week);
    if (why) notes.push('All-in not accepted: ' + why);
    else { s.allin[p.id] = week; after.push(() => promote(s, idea, 'allin', p.id, now, people)); }
  } else if (act === 'drop') {
    m.idea = idea.id;
    if (idea.by === p.id) { m.act = 'drop'; after.push(() => dropIdea(s, idea, `withdrawn by ${p.first}`, now)); }
    else { oppose(s, p.id, idea, now); m.act = 'drop'; notes.push('Counts as oppose'); }
  } else if (idea) {
    m.idea = idea.id;
  }
  if (notes.length) m.note = notes.join('. ');
  m.n = ++s.n;
  const out = [m];
  for (const fn of after) out.push(fn());
  if (idea && idea.status === 'open') { const x = checkIdea(s, idea, now, people); if (x) out.push(x); }
  // ideas that lost backers through "support moved" can't be promoted; nothing else to check.
  s.stats.messages++;
  const ps = (s.ps[p.id] ||= {});
  ps.m = (ps.m || 0) + 1; ps.last = iso(now);
  s.mem[p.id] = [...(s.mem[p.id] || []), clean(say, 200)].slice(-3);
  return out;
}

// ---------------------------------------------------------------- tick
function makeRng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

async function appendChat(s, msgs) {
  const byDay = {};
  for (const m of msgs) (byDay[riga(new Date(m.t)).date] ||= []).push(m);
  for (const [day, arr] of Object.entries(byDay)) {
    const file = path.join(DATA, 'chat', day + '.json');
    const cur = await readJSON(file, []);
    cur.push(...arr);
    await writeJSON(file, cur);
    s.days[day] = cur.length;
  }
}

async function runTick(s, people, now, rnd) {
  CLOCK.now = now;
  const r = riga(now);
  if (s.budget.day !== r.date) { s.budget.day = r.date; s.budget.usd = 0; s.budget.calls = 0; }
  s.budget.cap = CFG.cap;
  const msgs = [];
  const add = (arr) => { msgs.push(...arr); s.recent = [...s.recent, ...arr].slice(-RULES.recentKeep); };
  if (s.tick === 0 && !s.recent.length) {
    add([sysMsg(s, now, 'Class chat is open. The question: which business would you actually launch this term? Pitch it with a payer, a price in euros, a first test and the loop that runs without you.', 'open')]);
  }
  const hk = housekeeping(s, now);
  add(hk.msgs);
  if (hk.archived.length) {
    const file = path.join(DATA, 'dropped-archive.json');
    const arc = await readJSON(file, []);
    arc.push(...hk.archived);
    await writeJSON(file, arc);
  }

  let n = r.hour < 7 ? CFG.nightSpeakers : CFG.speakers;
  const pace = CFG.cap * Math.min(1, (r.hour * 60 + r.minute + 60) / 1440);
  if (s.budget.usd >= CFG.cap) {
    n = 0; s.status = 'budget'; s.note = 'Daily budget used. The class continues after midnight, Riga time.';
  } else if (s.budget.usd >= pace) n = Math.min(n, 1);

  const sys = systemPrompt(people);
  const speakers = n ? pickSpeakers(s, people, n, rnd) : [];
  let spoke = 0;
  for (const p of speakers) {
    const t = START ? new Date(now.getTime() + spoke * 20000) : new Date();
    CLOCK.now = t;
    const user = userPrompt(s, people, p, t, rnd);
    let res;
    try {
      res = MOCK ? mockReply(s, people, p, rnd) : await callModel(s, sys, user);
    } catch (e) {
      s.err = { at: iso(new Date()), msg: String(e.message || e).slice(0, 300) };
      console.error('call failed:', s.err.msg);
      if (e instanceof Fatal) { s.status = 'error'; s.note = s.err.msg; break; }
      continue;
    }
    s.budget.usd = +(s.budget.usd + res.cost).toFixed(5);
    s.budget.totalUsd = +(s.budget.totalUsd + res.cost).toFixed(5);
    s.budget.calls++; s.budget.totalCalls++;
    s.model = res.model;
    const j = parseReply(res.text);
    if (!j) { console.error('unreadable reply from', p.id, String(res.text).slice(0, 200)); continue; }
    const out = applyReply(s, people, p, j, t);
    if (out.length) { spoke++; add(out); }
    console.log(`${p.first}: ${out[0] ? out[0].act + (out[0].idea ? ' ' + out[0].idea : '') + ' · ' + out[0].say : '(skipped)'}  [$${res.cost.toFixed(4)} ${res.usage.in}/${res.usage.out}]`);
  }
  if (msgs.length) await appendChat(s, msgs);
  s.tick++;
  s.lastTickAt = iso(START ? now : new Date());
  if (spoke) {
    s.status = 'running'; s.note = '';
    if (s.err && minutesSince(s.err.at, new Date()) > 30) s.err = null;
  }
  return msgs.length;
}

async function main() {
  const people = await loadPeople();
  const stateFile = path.join(DATA, 'state.json');
  const start = START || new Date();
  let s = await readJSON(stateFile, null);
  if (!s) s = freshState(start);
  const show = arg('print-prompt', null);
  if (show) {
    const p = people.byId[String(show)] || people[0];
    const now = START || new Date();
    CLOCK.now = now;
    const sys = systemPrompt(people), user = userPrompt(s, people, p, now, makeRng(7));
    console.log(sys + '\n\n========== USER ==========\n' + user);
    console.error(`system ${sys.length} chars (~${Math.round(sys.length / 4)} tokens), user ${user.length} chars (~${Math.round(user.length / 4)} tokens)`);
    return;
  }
  if (CFG.paused) {
    if (s.status !== 'paused') { s.status = 'paused'; s.note = 'Paused by the organiser.'; await writeJSON(stateFile, s); }
    console.log('Paused.');
    return;
  }
  if (!MOCK && !CFG.key) {
    if (s.status !== 'waiting-key') { s.status = 'waiting-key'; s.note = 'Waiting for the OpenAI key.'; await writeJSON(stateFile, s); }
    console.log('No OPENAI_API_KEY. Nothing to do.');
    return;
  }
  if (!FORCE && !START && s.lastTickAt && minutesSince(s.lastTickAt, new Date()) < CFG.minGapMin) {
    console.log('Last tick was less than', CFG.minGapMin, 'minutes ago. Skipping.');
    return;
  }
  const rnd = makeRng((Date.now() ^ (s.n * 2654435761)) >>> 0);
  for (let k = 0; k < TICKS; k++) {
    const now = START ? new Date(start.getTime() + k * STEP_MIN * 6e4) : new Date();
    const added = await runTick(s, people, now, rnd);
    await writeJSON(stateFile, s);
    console.log(`tick ${s.tick}: +${added} messages, today $${s.budget.usd.toFixed(3)} of $${CFG.cap}, status ${s.status}`);
    if (s.status === 'error' || s.status === 'budget') break;
  }
  await fs.writeFile(path.join(DATA, 'README.md'), '# Class simulation data\n\nWritten by the class-sim workflow every ~5 minutes. `state.json` holds the board and the latest messages; `chat/YYYY-MM-DD.json` holds every message of a day (Riga time). All students are fictional.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
