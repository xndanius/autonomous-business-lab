// Public research is evidence about a context, never a customer interview.
// All source text is untrusted data. The model cannot choose fetch destinations.
import crypto from 'node:crypto';

export const FEEDS = Object.freeze([
  { name: 'Riga city news', url: 'https://www.riga.lv/lv/rss/articles', host: 'www.riga.lv' },
  { name: 'Riga city events', url: 'https://www.riga.lv/lv/rss/events', host: 'www.riga.lv' },
  { name: 'Latvian investment and development agency', url: 'https://www.liaa.gov.lv/lv/rss/articles', host: 'www.liaa.gov.lv' },
]);
export const RUBRIC = Object.freeze(['evidence', 'usefulness', 'payer', 'autonomy', 'test']);
export const STRATEGIES = Object.freeze({
  'source-first': 'Start with a concrete change or recurring activity in a source. Explain what is known and what is still a hypothesis. Avoid a generic chatbot.',
  'repeat-use': 'Find a specific reachable audience and a reason to return every week. Name the fresh daily output. Make delight or usefulness concrete.',
  'payer-test': 'Choose one realistic payer and a reachable acquisition route. Treat price as a hypothesis. Design a small test that could actually disprove the idea.',
  'bounded-loop': 'Trace trigger, make, independent check, delivery and exception owner. Keep the daily routine automatic and scope it to four weeks.',
});
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const text = (s, max = 600) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => +n <= 0x10ffff ? String.fromCodePoint(+n) : '').replace(/\s+/g, ' ').trim().slice(0, max);
const tag = (xml, name) => (xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i')) || [])[1] || '';
const safe = (s) => !/@|\b(?:ignore.{0,20}instructions|system prompt|api[_ -]?key|sexual|suicid|vardarb|pacient|patient)\b/i.test(s) && !/(?:\+\d[\d ()-]{7,}|[\w.+-]+@[\w.-]+)/.test(s);

export function parseFeed(xml, feed, now) {
  const records = [];
  for (const item of String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []) {
    const title = text(tag(item, 'title'), 180), excerpt = text(tag(item, 'description'), 600);
    const url = text(tag(item, 'link'), 600), publishedAt = new Date(text(tag(item, 'pubDate')));
    let parsed; try { parsed = new URL(url); } catch { continue; }
    if (parsed.protocol !== 'https:' || parsed.hostname !== feed.host || parsed.search || !safe(title + ' ' + excerpt)) continue;
    if (!title || !excerpt || !Number.isFinite(+publishedAt) || +publishedAt > +now + 300000 || +now - +publishedAt > 45 * 86400000) continue;
    const sourceHash = hash(url + '\n' + title + '\n' + excerpt);
    records.push({ id: 'R' + sourceHash.slice(0, 12), publisher: feed.name, url, title, excerpt, sourceHash, retrievedAt: now.toISOString(), publishedAt: publishedAt.toISOString() });
    if (records.length === 4) break;
  }
  return records;
}

export async function refreshResearch(previous, now, fetcher = fetch) {
  if (previous?.attemptedAt && +now - +new Date(previous.attemptedAt) < 3600000) return previous;
  const records = [], failures = [];
  for (const feed of FEEDS) {
    try {
      const r = await fetcher(feed.url, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: { 'User-Agent': 'SSE-Riga-class-research/2 (+https://xndanius.github.io/autonomous-business-lab/simulation/)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const reader = r.body.getReader(); let bytes = 0, parts = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 250000) { await reader.cancel(); throw new Error('feed too large'); } parts.push(value); }
      const xml = Buffer.concat(parts).toString('utf8'), found = parseFeed(xml, feed, now);
      if (!found.length) throw new Error('no safe current records');
      records.push(...found);
    } catch (e) { failures.push({ publisher: feed.name, error: String(e.message).slice(0, 80) }); }
  }
  // No stale packet is silently carried forward as fresh research.
  return { attemptedAt: now.toISOString(), fetchedAt: now.toISOString(), records, failures, packetHash: hash(JSON.stringify(records.map((r) => r.sourceHash))) };
}

export function validCitations(input, records) {
  if (!Array.isArray(input)) return [];
  const seen = new Set(), out = [];
  for (const c of input.slice(0, 3)) {
    if (!c || typeof c !== 'object') continue;
    const source = records.find((r) => r.id === c.source), quote = String(c.quote || '').replace(/\s+/g, ' ').trim();
    if (!source || seen.has(source.id) || quote.length < 18 || quote.length > 240 || !safe(quote)) continue;
    if (!(source.title + ' ' + source.excerpt).includes(quote)) continue;
    seen.add(source.id); out.push({ ...source, quote });
  }
  return out;
}

export function assessment(j, expectedIds) {
  if (!j || !Array.isArray(j.reviews) || j.reviews.length !== expectedIds.length) return null;
  const out = [];
  for (const id of expectedIds) {
    const r = j.reviews.find((x) => x && typeof x === 'object' && x.id === id);
    if (!r || !RUBRIC.every((k) => Number.isInteger(r.scores?.[k]) && r.scores[k] >= 0 && r.scores[k] <= 2)) return null;
    if (typeof r.supported !== 'boolean' || typeof r.safe !== 'boolean') return null;
    const score = RUBRIC.reduce((n, k) => n + r.scores[k], 0);
    out.push({ id, scores: Object.fromEntries(RUBRIC.map((k) => [k, r.scores[k]])), score, supported: r.supported, safe: r.safe, critique: text(r.critique, 360), nextTest: text(r.nextTest, 220) });
  }
  return out;
}

export function revisionWins(oldReview, newReview) {
  return newReview.safe && newReview.supported && newReview.scores.evidence >= 1 && newReview.scores.autonomy >= 1 && newReview.scores.test >= 1 && newReview.score >= oldReview.score + 1;
}

export function settleTrial(trial) {
  if (trial.pairs.length < 3) return null;
  const baseline = trial.pairs.reduce((s, p) => s + p.baseline.score, 0) / trial.pairs.length;
  const candidate = trial.pairs.reduce((s, p) => s + p.candidate.score, 0) / trial.pairs.length;
  const passes = (key) => trial.pairs.filter((p) => p[key].safe && p[key].supported && p[key].scores.evidence >= 1 && p[key].scores.autonomy >= 1 && p[key].scores.test >= 1).length;
  // A prompt never wins by raising its own score or lowering the fixed rubric.
  return { adopted: candidate >= baseline + 1 && passes('candidate') >= passes('baseline') && passes('candidate') === trial.pairs.length, baseline: +baseline.toFixed(2), candidate: +candidate.toFixed(2), pairs: trial.pairs.length };
}

export function reserveCost(system, user, maxOut, prices) {
  // Bytes provide a conservative token ceiling, plus API framing overhead.
  const inputCeiling = Buffer.byteLength(JSON.stringify({ instructions: system, input: user }), 'utf8') + 1024;
  return +(inputCeiling * prices.pin / 1e6 + maxOut * prices.pout / 1e6).toFixed(5);
}
