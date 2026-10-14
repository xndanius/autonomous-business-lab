// Small verified primary-source catalog. Model output cannot supply URLs.
import crypto from 'node:crypto';
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const eurostat = (theme) => 'https://ec.europa.eu/eurostat/en/search?_estatsearchportlet_WAR_estatsearchportlet_collection=CAT_EURNEW&_estatsearchportlet_WAR_estatsearchportlet_theme=' + theme + '&p_p_id=estatsearchportlet_WAR_estatsearchportlet&p_p_lifecycle=2&p_p_mode=view&p_p_resource_id=atom&p_p_state=maximized';
export const CATALOG = Object.freeze({
  economy: { name: 'Eurostat economy and finance', url: eurostat('PER_ECOFIN'), host: 'ec.europa.eu', kind: 'market-context', ttl: 21600000, format: 'atom' },
  industry: { name: 'Eurostat industry, trade and services', url: eurostat('PER_INDCOM'), host: 'ec.europa.eu', kind: 'market-context', ttl: 21600000, format: 'atom' },
  agriculture: { name: 'Eurostat agriculture and food', url: eurostat('PER_AGRFIS'), host: 'ec.europa.eu', kind: 'market-context', ttl: 21600000, format: 'atom' },
  payments: { name: 'Stripe Latvia official pricing', url: 'https://stripe.com/en-lv/pricing', host: 'stripe.com', kind: 'supplier-cost', ttl: 86400000, format: 'html', anchor: 'Pricing built for businesses of all sizes' },
  alternative: { name: 'Stripe Payment Links official capabilities', url: 'https://stripe.com/en-lv/pricing', host: 'stripe.com', kind: 'alternative-tool', ttl: 86400000, format: 'html', anchor: 'No-code links to sell online without a website' },
  implementation: { name: 'GitHub Actions official schedule documentation', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax.md', host: 'docs.github.com', kind: 'implementation-only', ttl: 86400000, format: 'markdown', section: '## `on.schedule`', expected: 'The shortest interval you can run scheduled workflows is once every 5 minutes.' },
  aiAdoption: { name: 'Eurostat enterprise AI adoption survey', url: 'https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251211-2', host: 'ec.europa.eu', kind: 'market-context', ttl: 86400000, format: 'eurostat-article', expectedTitle: '20% of EU enterprises use AI technologies', expected: 'In 2025, 20.0% of EU enterprises with 10 or more employees', dataset: 'isoc_eb_ai' },
  cloudAdoption: { name: 'Eurostat paid cloud adoption survey', url: 'https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260203-1', host: 'ec.europa.eu', kind: 'market-context', ttl: 86400000, format: 'eurostat-article', expectedTitle: '53% EU enterprises used paid cloud services in 2025', expected: 'In 2025, 52.7% of EU enterprises used paid cloud computing services', dataset: 'isoc_cicce_use' },
  hostingCost: { name: 'Cloudflare Workers official pricing', url: 'https://developers.cloudflare.com/workers/platform/pricing/index.md', host: 'developers.cloudflare.com', kind: 'supplier-cost', ttl: 86400000, format: 'markdown', section: '## Workers', end: '### Example pricing', expected: '10 million included per month', pricing: true },
  schedule: { name: 'n8n Schedule Trigger official documentation', url: 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger', host: 'docs.n8n.io', kind: 'implementation-only', ttl: 86400000, format: 'html', main: true },
  approval: { name: 'n8n human approval official documentation', url: 'https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools', host: 'docs.n8n.io', kind: 'implementation-only', ttl: 86400000, format: 'html', main: true },
});
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => +n <= 0x10ffff ? String.fromCodePoint(+n) : '').replace(/\s+/g, ' ').trim();
const tag = (s, k) => decode((s.match(new RegExp(`<${k}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${k}>`, 'i')) || [])[1]);
const safe = (s) => !/[\w.+-]+@[\w.-]+|\+\d[\d ()-]{8,}|ignore.{0,20}instructions|system prompt|api[_ -]?key/i.test(s);
function receipt(source, title, excerpt, url, now, publishedAt = null, modifiedAt = null) {
  const sourceHash = hash(url + '\n' + title + '\n' + excerpt);
  return { id: 'R' + sourceHash.slice(0, 12), publisher: source.name, url, title, excerpt, kind: source.kind, sourceHash, retrievedAt: now.toISOString(), publishedAt, modifiedAt, scope: source.kind === 'market-context' ? 'Official EU aggregate context; not evidence of Riga buyers or willingness to pay.' : 'Supplier/tool evidence only; not customer demand or validation.' };
}
// Match the identified publication container, balancing nested DIVs. A related
// news card can be the first ARTICLE on these pages and must never be a receipt.
function publicationBody(body) {
  const opening = [...body.matchAll(/<div\b[^>]*>/gi)].find((match) => (match[0].match(/\bclass=["']([^"']*)["']/i)?.[1] || '').split(/\s+/).includes('publication-web-content'));
  if (!opening) throw new Error('identified publication body missing');
  const tags = /<\/?div\b[^>]*>/gi; tags.lastIndex = opening.index + opening[0].length;
  let depth = 1, token;
  while ((token = tags.exec(body))) {
    depth += /^<\//.test(token[0]) ? -1 : 1;
    if (!depth) return body.slice(opening.index + opening[0].length, token.index);
  }
  throw new Error('publication body is unbalanced');
}
function meta(body, key) {
  for (const tag of body.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((m) => [m[1].toLowerCase(), m[3]]));
    if (attrs.property === key || attrs.name === key) return decode(attrs.content);
  }
  return '';
}
function sourceDate(value, now, required = false) {
  if (!value && !required) return null;
  const parsed = new Date(/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(String(value).trim()) ? value.trim() + ' 00:00:00 UTC' : value);
  if (!Number.isFinite(+parsed) || +parsed > +now + 300000) throw new Error('source publication date missing or invalid');
  return parsed.toISOString();
}
export function parseTargeted(body, source, now) {
  if (source.format === 'atom') {
    const out = [];
    for (const entry of body.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) || []) {
      const title = tag(entry, 'title').slice(0, 180), excerpt = tag(entry, 'summary').slice(0, 650);
      const url = (entry.match(/<link[^>]*rel="alternate"[^>]*href="([^\"]+)"/) || [])[1];
      const publishedAt = new Date(tag(entry, 'published') || tag(entry, 'updated'));
      let u; try { u = new URL(url); } catch { continue; }
      if (u.protocol !== 'https:' || u.hostname !== source.host || u.username || u.password || u.port || !u.pathname.startsWith('/eurostat/') || !title || !excerpt || !safe(title + excerpt)) continue;
      if (!Number.isFinite(+publishedAt) || +publishedAt > +now + 300000 || +now - +publishedAt > 45 * 86400000) continue;
      out.push(receipt(source, title, excerpt, u.href, now, publishedAt.toISOString()));
      if (out.length === 3) break;
    }
    return out;
  }
  if (source.format === 'eurostat-article') {
    const title = meta(body, 'og:title'), plain = decode(publicationBody(body));
    if (title !== source.expectedTitle || !plain.includes(source.expected) || !plain.includes(source.dataset) || plain.length < 700) throw new Error('publication identity/content mismatch');
    const publishedAt = sourceDate(meta(body, 'article:published_time'), now, true);
    const modifiedAt = sourceDate(meta(body, 'article:modified_time'), now);
    if (!safe(plain)) throw new Error('publication failed privacy/instruction check');
    return [receipt(source, title, plain.slice(0, 2500), source.url, now, publishedAt, modifiedAt)];
  }
  if (source.format === 'markdown') {
    const at = body.indexOf('\n' + source.section + '\n');
    if (at < 0) throw new Error('expected Markdown heading missing');
    const rest = body.slice(at + 1), boundary = source.end ? rest.indexOf('\n' + source.end + '\n') : rest.slice(source.section.length).search(/\n## /) + source.section.length;
    if (boundary < source.section.length) throw new Error('bounded Markdown section missing');
    const section = rest.slice(0, boundary), intro = source.pricing ? body.match(/[^\n]*minimum charge[^\n]*/)?.[0] : '';
    if (!section.includes(source.expected) || section.length < 300 || (source.pricing && (!intro || !section.includes('| **Free** |') || !section.includes('| **Standard** |')))) throw new Error('expected documentation content missing');
    // Keep the complete tariff section, including usage caveats and USD units.
    const excerpt = decode([intro, section].filter(Boolean).join('\n'));
    if (excerpt.length > 4500 || !safe(excerpt)) throw new Error('documentation section failed bound/check');
    const modified = source.pricing ? body.match(/Last updated ([^|\n]+)/)?.[1] : null;
    return [receipt(source, source.name, excerpt, source.url, now, null, sourceDate(modified, now))];
  }
  const main = source.main ? (body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]) : body;
  if (!main) throw new Error('official main content section missing');
  const plain = decode(main), at = source.main ? 0 : plain.indexOf(source.anchor);
  if (at < 0) throw new Error('expected official source section missing');
  const excerpt = plain.slice(Math.max(0, at - 100), at + 650);
  if (excerpt.length < 300 || !safe(excerpt)) throw new Error('source excerpt failed content/privacy/instruction check');
  return [receipt(source, source.name, excerpt, source.url, now, source.publishedAt || null)];
}
export function researchTopics(idea, role) {
  const food = /farm|food|flower|bouquet|bakery|produce|market box/i.test(idea.title + ' ' + idea.line);
  if (role === 'build') return /agent|approval|risk|customer/i.test(idea.loop) ? ['schedule', 'approval'] : ['implementation', 'hostingCost'];
  if (role === 'challenge') return ['payments', 'alternative'];
  return food ? ['agriculture', 'industry'] : /\bAI\b|agent|automation|account|admin|office/i.test(idea.title + ' ' + idea.line) ? ['aiAdoption', 'cloudAdoption'] : ['industry', 'economy'];
}
export function cachedResearch(cache, now, marketOnly = false) {
  return Object.entries(cache || {}).flatMap(([key, value]) => CATALOG[key] && +now - +new Date(value.attemptedAt) >= 0 && +now - +new Date(value.attemptedAt) < CATALOG[key].ttl && Array.isArray(value.records) ? value.records.filter((r) => !marketOnly || r.kind === 'market-context') : []);
}
export async function fetchTargeted(cache, topics, now, fetcher = fetch) {
  const records = [], failures = [], fetched = [];
  for (const key of [...new Set(topics)].slice(0, 2)) {
    const source = CATALOG[key]; if (!source) continue;
    const prior = cache[key];
    if (prior?.attemptedAt && Array.isArray(prior.records) && +now - +new Date(prior.attemptedAt) >= 0 && +now - +new Date(prior.attemptedAt) < source.ttl) {
      records.push(...prior.records); if (prior.error) failures.push({ source: source.name, error: prior.error }); continue;
    }
    try {
      const response = await fetcher(source.url, { redirect: 'error', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'AutonomousBusinessLabResearch/1.0 (+https://xndanius.github.io/autonomous-business-lab/simulation/)' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const reader = response.body.getReader(), parts = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2000000) { await reader.cancel(); throw new Error('source byte limit exceeded'); } parts.push(value); }
      const found = parseTargeted(Buffer.concat(parts).toString('utf8'), source, now); if (!found.length) throw new Error('no safe dated source records');
      cache[key] = { attemptedAt: now.toISOString(), records: found }; records.push(...found); fetched.push(key);
    } catch (e) { const error = String(e.message).slice(0, 100); cache[key] = { attemptedAt: now.toISOString(), records: [], error }; failures.push({ source: source.name, error }); }
  }
  return { records: [...new Map(records.map((r) => [r.id, r])).values()], failures, fetched };
}
