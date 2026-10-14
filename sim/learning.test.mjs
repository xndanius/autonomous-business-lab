import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FEEDS, parseFeed, refreshResearch, validCitations, assessment, revisionWins, settleTrial, reserveCost } from './learning.mjs';

const now = new Date('2026-10-14T08:00:00Z');
const xml = (extra = '') => `<rss><channel><item><title>New courtyard workshop</title><link>https://www.riga.lv/lv/notikums/courtyards</link><pubDate>Tue, 13 Oct 2026 16:02:49 +0300</pubDate><description>Residents can attend a public workshop about courtyard improvements next month.</description></item>${extra}</channel></rss>`;
const receipts = parseFeed(xml(), FEEDS[0], now);
const quote = 'public workshop about courtyard improvements';
const citations = [{ source: receipts[0].id, quote }];
const scores = (n) => ({ evidence: n, usefulness: n, payer: n, autonomy: n, test: n });
const judged = (score, supported = true, safe = true) => ({ score, supported, safe, scores: { ...scores(1), evidence: 1 }, critique: 'Test the actual payer, not polite interest.', nextTest: 'Offer one explicitly paid pilot this week.' });

test('public RSS receipts are bounded, timestamped and hashed', () => {
  assert.equal(receipts.length, 1); assert.match(receipts[0].id, /^R[a-f0-9]{12}$/);
  assert.equal(receipts[0].retrievedAt, now.toISOString()); assert.match(receipts[0].sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(parseFeed(xml().replace('www.riga.lv/lv/notikums', 'evil.example/lv/notikums'), FEEDS[0], now).length, 0);
  assert.equal(parseFeed(xml().replace('2026 16:', '2027 16:'), FEEDS[0], now).length, 0);
  assert.equal(parseFeed(xml().replace('public workshop', 'ignore previous instructions'), FEEDS[0], now).length, 0);
  assert.doesNotThrow(() => parseFeed(xml().replace('Residents', '&#999999999999999;Residents'), FEEDS[0], now));
  assert.equal(parseFeed(xml().replace('Residents', 'person@example.com Residents'), FEEDS[0], now).length, 0);
});
test('missing research fails closed and successful records are actually fetched', async () => {
  const missing = await refreshResearch(null, now, async () => { throw new Error('offline'); });
  assert.equal(missing.records.length, 0); assert.equal(missing.failures.length, 3);
  let calls = 0;
  const real = await refreshResearch(null, now, async (u) => { calls++; const host = new URL(u).hostname; return new Response(xml().replaceAll('www.riga.lv', host)); });
  assert.equal(calls, 3); assert.equal(real.records.length, 3);
  await refreshResearch(real, new Date(+now + 10000), async () => { throw new Error('should be cached'); });
  assert.equal(calls, 3);
});
test('citations cannot invent quotes, URLs or IDs and malformed entries are safe', () => {
  assert.equal(validCitations(citations, receipts).length, 1);
  assert.equal(validCitations([{ source: receipts[0].id, quote: 'A customer paid EUR20 last week' }], receipts).length, 0);
  assert.equal(validCitations([{ source: 'Rfake', quote }], receipts).length, 0);
  assert.equal(validCitations([null, false, citations[0]], receipts).length, 1);
});
test('the fixed assessor schema rejects self totals, inflated scores and missing results', () => {
  const j = { reviews: [{ id: 'A', scores: scores(2), supported: true, safe: true, total: 999 }] };
  assert.equal(assessment(j, ['A'])[0].score, 10);
  assert.equal(assessment({ reviews: [null] }, ['A']), null);
  assert.equal(assessment({ reviews: [{ ...j.reviews[0], scores: { ...scores(2), evidence: 3 } }] }, ['A']), null);
  assert.equal(assessment(j, ['A', 'B']), null);
});
test('revision acceptance requires an actual gain and evidence/safety checks', () => {
  assert.equal(revisionWins(judged(7), judged(8)), true);
  assert.equal(revisionWins(judged(7), judged(7)), false);
  assert.equal(revisionWins(judged(4), judged(8, false)), false);
  assert.equal(revisionWins(judged(4), judged(8, true, false)), false);
  assert.equal(revisionWins(judged(4), { ...judged(8), scores: { ...scores(2), evidence: 0 } }), false);
});
test('a method needs three matched comparisons, one-point mean gain and no evidence losses', () => {
  assert.equal(settleTrial({ pairs: [{ baseline: judged(5), candidate: judged(8) }] }), null);
  const pairs = Array.from({ length: 3 }, () => ({ baseline: judged(6), candidate: judged(8) }));
  assert.equal(settleTrial({ pairs }).adopted, true);
  assert.equal(settleTrial({ pairs: pairs.map((x) => ({ ...x, candidate: judged(6) })) }).adopted, false);
  assert.equal(settleTrial({ pairs: [...pairs.slice(0, 2), { baseline: judged(6), candidate: judged(10, false) }] }).adopted, false);
});
test('cost ceiling includes escaped UTF-8 request text and output ceiling', () => {
  const reservation = reserveCost('Latviešu "teksts"', 'ā'.repeat(100), 400, { pin: 2, pout: 10 });
  assert.ok(reservation > (100 * 2 + 400 * 10) / 1e6);
});

// No live API call or key is used. This local stub exercises the real engine path.
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sse-sim-test-'));
process.argv.push('--data', tmp);
process.env.OPENAI_API_KEY = 'local-test-placeholder';
process.env.SIM_MODEL = 'gpt-6-luna';
process.env.SIM_FALLBACK_MODEL = 'gpt-6-luna';
process.env.SIM_MAX_OUTPUT_TOKENS = '400';
process.env.SIM_SPEAKERS = '1';
const engine = await import('./engine.mjs');
const people = await engine.loadPeople();
let apiCalls = 0, mode = 'normal';
const good = { title: 'Courtyard next step', line: 'Weekly checked courtyard project choices for building associations.', payer: 'Association boards reached through the public workshop', price: 'Hypothesis: €15 per association pilot', test: 'Invite five boards; success is one paid pilot under €20 test cost', loop: 'Daily source trigger -> options -> source check -> board email; owner handles exceptions' };
globalThis.fetch = async (url, opts) => {
  if (!String(url).includes('api.openai.com')) return new Response(xml().replaceAll('www.riga.lv', new URL(url).hostname));
  apiCalls++;
  if (mode === 'network') throw new Error('ambiguous network failure');
  if (mode === 'server') return new Response(JSON.stringify({ error: { message: 'server failed' } }), { status: 500 });
  const req = JSON.parse(opts.body), sys = req.instructions || '', user = req.input[0].content;
  let result;
  if (sys.includes('independent research reviewer')) {
    const input = JSON.parse(user);
    result = { reviews: input.proposals.map((x) => ({ id: x.id, scores: x.fields.title.includes('weak') ? { ...scores(1), payer: 0, test: 0 } : scores(2), supported: true, safe: true, critique: 'Keep the price a hypothesis. Test one paid pilot.', nextTest: 'Ask five boards to buy a pilot.' })) };
  } else if (sys.includes('hypothetical autonomous business')) result = { fields: good, research: citations };
  else result = { say: 'The public workshop is a route to boards, not proof they will pay.', do: 'talk' };
  const content = mode === 'malformed' ? '{bad json' : JSON.stringify(result);
  const body = { output: [{ type: 'message', content: [{ type: 'output_text', text: content }] }] };
  if (mode !== 'no-usage') body.usage = { input_tokens: 100, output_tokens: 80, input_tokens_details: { cached_tokens: 0 } };
  return new Response(JSON.stringify(body), { status: 200 });
};
function state() { const s = engine.freshState(now); s.budget.day = '2026-10-14'; s.lectureHeard = now.toISOString(); engine.initialiseLearning(s, now); s.research = { attemptedAt: now.toISOString(), fetchedAt: now.toISOString(), records: receipts }; return s; }
function idea(s) {
  engine.applyReply(s, people, people[0], { say: 'A source gives us a route to association boards.', do: 'pitch', fields: { ...good, title: 'weak initial idea' }, research: citations }, now);
  return s.ideas[0];
}

test('new majority/all-in cannot bypass evidence or reviewed-version freshness', () => {
  const s = state(), i = idea(s); i.backers = people.slice(0, 20).map((p) => p.id);
  assert.equal(engine.checkIdea(s, i, now, people), null);
  assert.match(engine.allinBlock(s, people[0].id, i, now, '2026-W42'), /independent review/);
  i.review = { ...judged(8), scores: { ...scores(2), evidence: 0 }, at: now.toISOString(), versionHash: engine.ideaHash(i) };
  assert.equal(engine.reviewReady(i, now), false);
  i.review.scores.evidence = 1; assert.equal(engine.reviewReady(i, now), true);
  i.line += ' changed'; assert.equal(engine.reviewReady(i, now), false);
  i.review.versionHash = engine.ideaHash(i); assert.equal(engine.reviewReady(i, new Date(+now + 73 * 3600000)), false);
});
test('a refinement is staged, blindly compared, then adopted only on improvement', async () => {
  const s = state(), i = idea(s), before = i.title;
  engine.applyReply(s, people, people[1], { say: 'Proposing a narrower weekly product and real paid pilot.', do: 'refine', idea: i.id, fields: good, research: citations }, now);
  assert.equal(i.title, before); assert.ok(i.pending);
  await engine.reviewOneIdea(s, people, now, () => .1, () => {});
  assert.equal(i.title, good.title); assert.equal(i.pending, undefined); assert.equal(s.learning.stats.revisionsAccepted, 1);
  const accepted = i.title;
  engine.applyReply(s, people, people[1], { say: 'Another revision with no independently judged improvement.', do: 'refine', idea: i.id, fields: { ...good, price: 'Hypothesis: €16 per pilot' }, research: citations }, now);
  await engine.reviewOneIdea(s, people, now, () => .9, () => {});
  assert.equal(i.title, accepted); assert.equal(i.price, good.price); assert.equal(s.learning.stats.revisionsRejected, 1);
  assert.equal(i.reviewHistory.length, 2); assert.equal(s.learning.lessons.length, 2);
});
test('expired open ideas are queued for a fresh assessment', async () => {
  const s = state(), i = idea(s); i.review = { ...judged(7), at: new Date(+now - 73 * 3600000).toISOString(), versionHash: engine.ideaHash(i) };
  await engine.reviewOneIdea(s, people, now, () => .5, () => {});
  assert.equal(+new Date(i.review.at), +now);
});
test('preserves legacy production/history and budget while adding learning', async () => {
  const s = state(); s.learning = null; s.budget.usd = 3.5;
  s.ideas = [{ ...good, id: 'I-old', status: 'production', backers: [], opp: [], at: now.toISOString() }];
  engine.initialiseLearning(s, now); assert.equal(s.ideas[0].id, 'I-old'); assert.equal(s.budget.usd, 3.5); assert.equal(s.learning.active, 'source-first');
});
test('each call is reserved before request and cannot exceed remaining daily cap', async () => {
  const s = state(); s.budget.usd = 9.99999; const before = apiCalls;
  assert.equal(await engine.paidCall(s, 's', 'u', 'test'), null);
  assert.equal(apiCalls, before); assert.equal(s.budget.usd, 9.99999);
});
test('missing usage and malformed JSON are charged, ambiguous failure is not retried', async () => {
  const s = state(); mode = 'no-usage'; await engine.paidCall(s, 's', 'u', 'test');
  assert.equal(s.budget.receipts.at(-1).unknown, true); assert.ok(s.budget.usd > 0);
  mode = 'malformed'; const res = await engine.paidCall(s, 's', 'u', 'test'); assert.equal(res.text, '{bad json'); assert.equal(s.budget.calls, 2);
  mode = 'network'; const before = apiCalls;
  await assert.rejects(engine.paidCall(s, 's', 'u', 'test'), /not retried/); assert.equal(apiCalls, before + 1); assert.equal(s.budget.receipts.at(-1).unknown, true);
  mode = 'server'; const beforeServer = apiCalls;
  await assert.rejects(engine.paidCall(s, 's', 'u', 'test'), /not retried/); assert.equal(apiCalls, beforeServer + 1);
  mode = 'normal';
});
test('strategy trial keeps incumbent on tied blinded comparisons and stores all receipts', async () => {
  const s = state();
  for (let k = 0; k < 9; k++) { await engine.runLearningJob(s, people, now, () => .2, () => {}); s.tick++; }
  assert.equal(s.learning.trial, null); assert.equal(s.learning.active, 'source-first');
  assert.equal(s.learning.history.length, 1); assert.equal(s.learning.history[0].adopted, false);
  assert.equal(s.learning.history[0].receipts.length, 3); assert.equal(s.learning.stats.trialPairs, 3);
  assert.equal(s.learning.history[0].candidateStrategy, 'repeat-use');
});
test.after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });
