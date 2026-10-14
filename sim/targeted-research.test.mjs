import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { CATALOG, parseTargeted, fetchTargeted, cachedResearch } from './targeted-research.mjs';

const now = new Date('2026-10-14T10:00:00.000Z');
const day = 86400000;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
// These bounded identity fragments, wrappers and metadata match the live
// official pages checked on 14 October. Padding is explicitly synthetic.
const padding = ' TEST DATA: this paragraph supplies aggregate context only, and establishes neither a reachable Riga buyer nor willingness to pay. '.repeat(8);
const related = '<main><article><h2>Films, series, sports: top choice of paid subscriptions</h2><time>27 August 2026</time><p>Unrelated recommendation card.</p></article></main>';
function article(source, publishedAt, modifiedAt = publishedAt) {
  return `<!doctype html><head><meta content="${source.expectedTitle}" property="og:title"><meta property='article:published_time' content='${publishedAt}'><meta content="${modifiedAt}" property="article:modified_time"></head>${related}<div class="lfr-layout-structure-item-publication-web-content"><div id="fragment-changing-id"><div class="publication-web-content ecl-row"><div class="ecl-col-12 ecl-col-l-8"><div><p class="ecl-u-type-paragraph">${source.expected}.</p><div><p>${padding}</p><div><p>Source dataset: <strong>${source.dataset}</strong></p></div></div></div></div></div></div></div>`;
}
const github = `# Workflow syntax for GitHub Actions\n\nTEST DATA: navigation and unrelated YAML introduction.\n\n## \`on.schedule\`\n\n${CATALOG.implementation.expected}\n${padding}\n### Schedule example\n\nTEST DATA: keep a subordinate heading inside this section.\n\n## \`on.workflow_dispatch\`\n\nTEST DATA: unrelated next section must not enter a schedule receipt.\n`;
const cloud = `---\ntitle: Pricing\ndescription: TEST DATA frontmatter.\n---\n\n[Skip to content](#main-content)\n\n# Pricing\n\nLast updated Oct 2, 2026|Copy as Markdown\n\nThe Workers Paid plan has a minimum charge of $5 USD per month for an account.\n\n## Workers\n\nTEST DATA: compare free and paid usage without inferring demand.\n\n| Plan | Requests | CPU time |\n| --- | --- | --- |\n| **Free** | 100,000 per day | 10 milliseconds per invocation |\n| **Standard** | 10 million included per month; +$0.30 per additional million | 30 million CPU milliseconds included per month; +$0.02 per additional million |\n\nTEST DATA: inbound requests count, and static assets have separate treatment.\n\n### Example pricing\n\nTEST DATA: illustrative example is outside the tariff receipt.\n\n## Workers KV\n\nTEST DATA: another product is outside the tariff receipt.\n`;
const atomEntry = ({ title = 'TEST DATA dated EU context', url = 'https://ec.europa.eu/eurostat/web/test', date = new Date(+now - day).toISOString(), summary = 'TEST DATA: aggregate context, without customer or willingness-to-pay proof.' } = {}) => `<entry><title>${title}</title><link rel="alternate" href="${url}"/><published>${date}</published><summary>${summary}</summary></entry>`;
const atom = (...entries) => `<feed xmlns="http://www.w3.org/2005/Atom">${entries.join('')}</feed>`;
const payment = `<main>${CATALOG.payments.anchor} ${padding}</main>`;

test('both actual Eurostat publication identities select the complete nested body, ignoring the earlier recommendation card', () => {
  for (const [source, date] of [[CATALOG.aiAdoption, '2025-12-11T10:00:00Z'], [CATALOG.cloudAdoption, '2026-02-03T10:00:00Z']]) {
    const [record] = parseTargeted(article(source, date), source, now);
    assert.equal(record.title, source.expectedTitle);
    assert.ok(record.excerpt.startsWith(source.expected));
    assert.ok(record.excerpt.endsWith(source.dataset), 'nested final paragraph must survive');
    assert.doesNotMatch(record.excerpt, /Films|paid subscriptions|27 August/);
    assert.equal(record.kind, 'market-context');
    assert.match(record.scope, /not evidence of Riga buyers/);
    assert.equal(record.publishedAt, new Date(date).toISOString());
    assert.equal(record.modifiedAt, new Date(date).toISOString());
    assert.equal(record.retrievedAt, now.toISOString());
    assert.equal(record.sourceHash, sha(record.url + '\n' + record.title + '\n' + record.excerpt));
  }
});

test('Eurostat refuses missing, truncated, wrong or too-short publication bodies instead of labelling a related card as research', () => {
  const source = CATALOG.aiAdoption, valid = article(source, '2025-12-11T10:00:00Z');
  for (const invalid of [
    valid.replace('class="publication-web-content ecl-row"', 'class="related-card ecl-row"'),
    valid.slice(0, valid.lastIndexOf('</div>') - 12),
    valid.replace(source.dataset, 'unrelated_dataset'),
    valid.replace(source.expected, 'TEST DATA: unrelated publication'),
    valid.replace(source.expectedTitle, 'TEST DATA: wrong headline'),
    valid.replace(padding, 'TEST DATA: short'),
  ]) assert.throws(() => parseTargeted(invalid, source, now));
  assert.throws(() => parseTargeted(related, source, now));
});

test('Eurostat publication dates come from actual metadata; invalid, missing or future dates fail closed', () => {
  const source = CATALOG.aiAdoption;
  for (const date of ['', 'not-a-date', new Date(+now + 6 * 60000).toISOString()]) assert.throws(() => parseTargeted(article(source, date), source, now));
  const older = '2024-05-09T08:15:00Z', changed = '2026-10-12T09:00:00Z';
  const record = parseTargeted(article(source, older, changed), source, now)[0];
  assert.equal(record.publishedAt, new Date(older).toISOString());
  assert.equal(record.modifiedAt, new Date(changed).toISOString());
  const missingModified = article(source, older).replace(/<meta content="[^"]*" property="article:modified_time">/, '');
  assert.equal(parseTargeted(missingModified, source, now)[0].modifiedAt, null);
});

test('official GitHub Markdown preserves the whole schedule section and its subordinate headings, excluding adjacent sections', () => {
  assert.equal(CATALOG.implementation.url, 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax.md');
  const [record] = parseTargeted(github, CATALOG.implementation, now);
  assert.match(record.excerpt, /once every 5 minutes/);
  assert.match(record.excerpt, /Schedule example/);
  assert.doesNotMatch(record.excerpt, /unrelated YAML|on\.workflow_dispatch|unrelated next section/);
  assert.equal(record.kind, 'implementation-only');
  assert.equal(record.publishedAt, null);
  assert.equal(record.modifiedAt, null);
  assert.equal(record.retrievedAt, now.toISOString());
  assert.throws(() => parseTargeted(github.replace('## `on.schedule`', '## `unrelated.schedule`'), CATALOG.implementation, now));
  assert.throws(() => parseTargeted(github.replace(CATALOG.implementation.expected, 'TEST DATA: unsupported claim'), CATALOG.implementation, now));
});

test('Cloudflare receipts contain the monthly fee, complete plan table and caveats, not frontmatter or illustrative examples', () => {
  const [record] = parseTargeted(cloud, CATALOG.hostingCost, now);
  for (const fact of ['$5 USD', '**Free**', '100,000 per day', '10 milliseconds', '**Standard**', '10 million included per month', '$0.30', '30 million CPU milliseconds', '$0.02', 'static assets']) assert.ok(record.excerpt.includes(fact), fact);
  assert.doesNotMatch(record.excerpt, /frontmatter|Skip to content|illustrative example|Workers KV/);
  assert.equal(record.kind, 'supplier-cost');
  assert.equal(record.publishedAt, null);
  assert.equal(record.modifiedAt, '2026-10-02T00:00:00.000Z');
  const changedDate = parseTargeted(cloud.replace('Oct 2, 2026', 'Sep 19, 2026'), CATALOG.hostingCost, now)[0];
  assert.equal(changedDate.modifiedAt, '2026-09-19T00:00:00.000Z');
  for (const invalid of [cloud.replace('minimum charge', 'TEST DATA unrelated amount'), cloud.replace('| **Free** |', '| Missing |'), cloud.replace('| **Standard** |', '| Missing |'), cloud.replace('### Example pricing', '### Different heading'), cloud.replace('10 million included per month', 'TEST DATA unsupported capacity')]) assert.throws(() => parseTargeted(invalid, CATALOG.hostingCost, now));
});

test('dated Atom entries reject foreign hosts, credentials, nonstandard ports, HTTP, future and stale publications', () => {
  const good = atomEntry();
  const invalid = [
    { url: 'https://other.example/eurostat/web/test' },
    { url: 'https://ec.europa.eu.attacker.example/eurostat/web/test' },
    { url: 'https://person:credential@ec.europa.eu/eurostat/web/test' },
    { url: 'https://ec.europa.eu:8443/eurostat/web/test' },
    { url: 'http://ec.europa.eu/eurostat/web/test' },
    { url: 'https://ec.europa.eu/not-eurostat/test' },
    { date: 'not-a-date' },
    { date: new Date(+now + 6 * 60000).toISOString() },
    { date: new Date(+now - 45 * day - 1).toISOString() },
  ].map(atomEntry);
  const results = parseTargeted(atom(...invalid, good), CATALOG.economy, now);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, 'https://ec.europa.eu/eurostat/web/test');
  assert.equal(results[0].publishedAt, new Date(+now - day).toISOString());
  assert.equal(parseTargeted(atom(atomEntry({ date: new Date(+now - 45 * day).toISOString() })), CATALOG.economy, now).length, 1);
});

test('cache reuse retains original retrieval dates and source roles; six-hour and twenty-four-hour boundaries expire exactly', async () => {
  const cache = {}, calls = [];
  const fetcher = async (url, options) => { calls.push({ url, options }); return new Response(url.includes('ec.europa') ? atom(atomEntry()) : payment); };
  await fetchTargeted(cache, ['economy', 'payments'], now, fetcher);
  assert.equal(calls.length, 2);
  const saved = structuredClone(cache);
  const within = new Date(+now + 5 * 3600000);
  const hit = await fetchTargeted(cache, ['economy', 'payments'], within, fetcher);
  assert.equal(calls.length, 2);
  assert.ok(hit.records.every(record => record.retrievedAt === now.toISOString()));
  assert.deepEqual(cache, saved);
  assert.equal(cachedResearch(cache, within, true).length, 1);
  assert.equal(cachedResearch(cache, new Date(+now + 6 * 3600000)).length, 1);
  assert.equal(cachedResearch(cache, new Date(+now + 24 * 3600000)).length, 0);
  assert.equal(saved.economy.records[0].kind, 'market-context');
  assert.equal(saved.payments.records[0].kind, 'supplier-cost');
  assert.match(saved.payments.records[0].scope, /not customer demand/);
  await fetchTargeted(cache, ['economy', 'payments'], new Date(+now + 6 * 3600000), fetcher);
  assert.equal(calls.length, 3, 'only the six-hour source is fetched again');
  assert.equal(cache.payments.records[0].retrievedAt, now.toISOString());
});

test('future cache timestamps cannot manufacture freshness and force a fresh guarded retrieval', async () => {
  const record = parseTargeted(payment, CATALOG.payments, now)[0];
  const future = new Date(+now + day).toISOString();
  const cache = { payments: { attemptedAt: future, records: [record] } };
  assert.deepEqual(cachedResearch(cache, now), []);
  let calls = 0;
  await fetchTargeted(cache, ['payments'], now, async () => { calls++; return new Response(payment); });
  assert.equal(calls, 1);
  assert.equal(cache.payments.attemptedAt, now.toISOString());
});

test('HTTP, timeout, oversized or unparsable retrievals replace expired cache with an honest failure and no stale new receipt', async () => {
  const old = new Date(+now - 2 * day), stale = parseTargeted(payment, CATALOG.payments, old)[0];
  let cancelled = false;
  const failures = [
    { expected: /HTTP 503/, fetcher: async () => new Response('TEST DATA unavailable', { status: 503 }) },
    { expected: /timed out/, fetcher: async (_url, options) => { assert.ok(options.signal instanceof AbortSignal); assert.equal(options.redirect, 'error'); assert.match(options.headers['User-Agent'], /^AutonomousBusinessLabResearch\//); throw new DOMException('TEST DATA request timed out', 'TimeoutError'); } },
    { expected: /byte limit/, fetcher: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2000001)); }, cancel() { cancelled = true; } })) },
    { expected: /expected official source section missing/, fetcher: async () => new Response('<main>TEST DATA unrelated document</main>') },
  ];
  for (const { expected, fetcher } of failures) {
    const cache = { payments: { attemptedAt: old.toISOString(), records: [stale] } };
    const result = await fetchTargeted(cache, ['payments'], now, fetcher);
    assert.deepEqual(result.records, []);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0].error, expected);
    assert.deepEqual(cache.payments.records, []);
    assert.equal(cache.payments.attemptedAt, now.toISOString());
    assert.deepEqual(cachedResearch(cache, now), []);
    let retryCalls = 0;
    const cachedFailure = await fetchTargeted(cache, ['payments'], new Date(+now + 60000), async () => { retryCalls++; throw Error('Unexpected retry'); });
    assert.equal(retryCalls, 0);
    assert.deepEqual(cachedFailure.records, []);
    assert.equal(cachedFailure.failures.length, 1);
  }
  assert.equal(cancelled, true, 'oversized response body must be cancelled');
});

test('targeted fetch accepts only catalog keys, deduplicates topics and keeps its two-source task bound', async () => {
  const calls = [];
  const result = await fetchTargeted({}, ['payments', 'payments', 'economy', 'industry', 'https://attacker.example/'], now, async (url) => { calls.push(url); return new Response(url.includes('stripe') ? payment : atom(atomEntry())); });
  assert.equal(calls.length, 2);
  assert.equal(result.records.length, 2);
  assert.ok(calls.every(url => Object.values(CATALOG).some(source => source.url === url)));
});
