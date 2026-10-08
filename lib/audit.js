// Live website audit: SEO, AEO (answer engines), GEO (generative engines), performance, security.
// Everything is measured by fetching the real site; nothing is mocked.
import { SITES, AUDIT_TTL_MS, PSI_API_KEY } from './config.js';
import { recordHistory, getHistory } from './history.js';

const UA = 'Mozilla/5.0 (compatible; DayOneDashboardAudit/1.0; +https://day1tech.com)';

const AI_BOTS = [
  { ua: 'GPTBot', owner: 'OpenAI', use: 'Model training' },
  { ua: 'OAI-SearchBot', owner: 'OpenAI', use: 'ChatGPT search' },
  { ua: 'ChatGPT-User', owner: 'OpenAI', use: 'ChatGPT live browsing' },
  { ua: 'ClaudeBot', owner: 'Anthropic', use: 'Model training' },
  { ua: 'Claude-SearchBot', owner: 'Anthropic', use: 'Claude search' },
  { ua: 'PerplexityBot', owner: 'Perplexity', use: 'Perplexity answers' },
  { ua: 'Google-Extended', owner: 'Google', use: 'Gemini / AI Overviews grounding' },
  { ua: 'Applebot-Extended', owner: 'Apple', use: 'Apple Intelligence' },
  { ua: 'Bingbot', owner: 'Microsoft', use: 'Bing + Copilot' },
  { ua: 'CCBot', owner: 'Common Crawl', use: 'Open datasets' },
];

async function timedFetch(url, { timeout = 15_000, method = 'GET' } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain,*/*', 'accept-encoding': 'br, gzip' },
    });
    const ttfb = performance.now() - t0;
    const buf = method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
    return {
      ok: true,
      status: res.status,
      headers: res.headers,
      text: buf.toString('utf8'),
      bytes: buf.length,
      ttfb: Math.round(ttfb),
      total: Math.round(performance.now() - t0),
      finalUrl: res.url,
      redirected: res.redirected,
      type: res.headers.get('content-type') || '',
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message, text: '', bytes: 0, ttfb: 0, total: 0, headers: new Headers(), type: '' };
  }
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// ---------- HTML parsing (regex is enough for audit signals) ----------
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&middot;/g, '·');

function parseHtml(html, pageUrl) {
  const tags = (re) => html.match(re) || [];
  const metas = tags(/<meta\b[^>]*>/gi);
  const meta = (key, by = 'name') => {
    for (const m of metas) if (attr(m, by).toLowerCase() === key.toLowerCase()) return decode(attr(m, 'content'));
    return '';
  };
  const links = tags(/<link\b[^>]*>/gi);
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonical = (links.find((l) => attr(l, 'rel').toLowerCase().split(/\s+/).includes('canonical')) || '');
  const icon = links.find((l) => /(^|\s)(shortcut )?icon($|\s)/i.test(attr(l, 'rel')));

  // JSON-LD
  const ld = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        ld.push(n);
        if (n['@graph']) walk(n['@graph']);
      };
      walk(j);
    } catch { /* invalid JSON-LD is itself a finding */ ld.push({ '@invalid': true }); }
  }
  const types = new Set();
  for (const n of ld) [].concat(n['@type'] || []).forEach((t) => types.add(t));
  const invalidLd = ld.filter((n) => n['@invalid']).length;

  // visible text (raw HTML; reflects what non-JS crawlers see)
  const body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  const text = decode(
    body.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  ).trim();
  const words = text ? text.split(' ').length : 0;

  const h = (n) => [...html.matchAll(new RegExp(`<h${n}\\b[^>]*>([\\s\\S]*?)</h${n}>`, 'gi'))].map((m) => decode(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
  const h1 = h(1), h2 = h(2), h3 = h(3);
  const questions = [...h2, ...h3].filter((t) => t.endsWith('?'));

  const imgs = tags(/<img\b[^>]*>/gi);
  const imgsNoAlt = imgs.filter((i) => !/\balt\s*=/i.test(i)).length;
  const lazy = imgs.filter((i) => /loading\s*=\s*["']?lazy/i.test(i)).length;

  const host = new URL(pageUrl).host.replace(/^www\./, '');
  const anchors = [...html.matchAll(/<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi)].map((m) => m[2] ?? m[3]);
  const internal = new Set(), external = new Set();
  for (const href of anchors) {
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      const u = new URL(href, pageUrl);
      if (u.host.replace(/^www\./, '') === host) internal.add(u.origin + u.pathname.replace(/\/$/, ''));
      else if (/^https?:$/.test(u.protocol)) external.add(u.host);
    } catch { /* ignore */ }
  }

  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const blockingScripts = (head.match(/<script\b[^>]*>/gi) || []).filter((s) => /\bsrc=/i.test(s) && !/\b(async|defer)\b/i.test(s) && !/type=["']module["']/i.test(s)).length;
  const blockingCss = links.filter((l) => attr(l, 'rel').toLowerCase() === 'stylesheet' && !/media=["']print["']/i.test(l)).length;
  const hints = links.filter((l) => /^(preconnect|preload|dns-prefetch|modulepreload)$/i.test(attr(l, 'rel'))).length;

  // facts: numbers/percentages/currency a generative engine can quote
  const facts = (text.match(/(\$\s?\d[\d.,]*\s?[KMB]?|\b\d{1,3}(?:[.,]\d+)?\s?(%|x|\+)|\b\d{2,}[+]?\s?(years|clients|companies|deals|engineers|projects|countries|days|weeks|months)\b)/gi) || []).length;

  return {
    title: titleM ? decode(titleM[1].replace(/\s+/g, ' ').trim()) : '',
    description: meta('description'),
    canonical: canonical ? attr(canonical, 'href') : '',
    robotsMeta: meta('robots'),
    viewport: meta('viewport'),
    lang: (html.match(/<html[^>]*\blang\s*=\s*["']?([\w-]+)/i) || [])[1] || '',
    themeColor: meta('theme-color'),
    og: { title: meta('og:title', 'property'), description: meta('og:description', 'property'), image: meta('og:image', 'property'), url: meta('og:url', 'property') },
    twitter: meta('twitter:card'),
    favicon: icon ? attr(icon, 'href') : '',
    h1, h2, h3, questions,
    ldTypes: [...types], ld, invalidLd,
    words, text, facts,
    imgs: imgs.length, imgsNoAlt, lazy,
    internalLinks: [...internal], externalHosts: [...external],
    blockingScripts, blockingCss, hints,
    noscript: /<noscript/i.test(html),
  };
}

// ---------- robots.txt ----------
function parseRobots(txt) {
  const groups = [];
  let cur = null, lastWasUA = false;
  const sitemaps = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') {
      if (!cur || !lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasUA = true;
    } else {
      lastWasUA = false;
      if (k === 'sitemap') sitemaps.push(v);
      else if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ k, v });
    }
  }
  const verdict = (ua) => {
    const g = groups.find((x) => x.agents.includes(ua.toLowerCase()));
    const star = groups.find((x) => x.agents.includes('*'));
    const use = g || star;
    if (!use) return { state: 'allowed', explicit: false };
    const blocksAll = use.rules.some((r) => r.k === 'disallow' && r.v === '/');
    const allowsAll = use.rules.some((r) => r.k === 'allow' && (r.v === '/' || r.v === ''));
    if (blocksAll && !allowsAll) return { state: 'blocked', explicit: !!g };
    return { state: 'allowed', explicit: !!g };
  };
  return { groups: groups.length, sitemaps, verdict };
}

// ---------- sitemap ----------
function parseSitemap(xml) {
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => ({
    loc: (m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i) || [])[1] || '',
    lastmod: (m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i) || [])[1] || '',
  })).filter((u) => u.loc);
  const index = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  return { urls, index };
}

// ---------- optional Lighthouse via PageSpeed Insights ----------
async function psi(url, strategy) {
  const q = new URLSearchParams({ url, strategy });
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) q.append('category', c);
  if (PSI_API_KEY) q.set('key', PSI_API_KEY);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(90_000) });
    const j = await res.json();
    if (j.error) return { error: j.error.code === 429 ? 'quota' : j.error.message };
    const a = j.lighthouseResult.audits, c = j.lighthouseResult.categories;
    return {
      strategy,
      scores: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v.score * 100)])),
      lcp: a['largest-contentful-paint']?.numericValue, cls: a['cumulative-layout-shift']?.numericValue,
      tbt: a['total-blocking-time']?.numericValue, fcp: a['first-contentful-paint']?.numericValue, si: a['speed-index']?.numericValue,
      field: j.loadingExperience?.metrics ? Object.fromEntries(Object.entries(j.loadingExperience.metrics).map(([k, v]) => [k, { p75: v.percentile, rating: v.category }])) : null,
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ---------- check builder ----------
function makeChecks() {
  const list = [];
  const add = (cat, id, label, weight, result, detail, fix) =>
    list.push({ cat, id, label, weight, score: result === null ? null : result, status: result === null ? 'na' : result >= 1 ? 'pass' : result > 0 ? 'warn' : 'fail', detail, fix: result !== null && result < 1 ? fix : '' });
  return { list, add };
}

const pct = (n) => Math.round(n * 100);

export async function auditSite(site) {
  const started = Date.now();
  const origin = new URL(site.url).origin;
  const { list: checks, add } = makeChecks();

  // Home page, three samples for a stable TTFB
  const homes = [];
  for (let i = 0; i < 3; i++) homes.push(await timedFetch(site.url));
  const home = homes[0];
  if (!home.ok) {
    return { site: site.key, name: site.name, domain: site.domain, ok: false, error: home.error, at: new Date().toISOString() };
  }
  const h = parseHtml(home.text, home.finalUrl);
  const finalHost = new URL(home.finalUrl).host;
  const ttfb = median(homes.filter((x) => x.ok).map((x) => x.ttfb));

  const [robotsR, llmsR, llmsFullR, sitemapR, wwwR] = await Promise.all([
    timedFetch(`${origin}/robots.txt`), timedFetch(`${origin}/llms.txt`), timedFetch(`${origin}/llms-full.txt`), timedFetch(`${origin}/sitemap.xml`),
    timedFetch(`${new URL(site.url).protocol}//${new URL(site.url).host.startsWith('www.') ? new URL(site.url).host.slice(4) : 'www.' + new URL(site.url).host}/`, { method: 'HEAD', timeout: 10_000 }),
  ]);
  const isText = (r) => r.ok && r.status === 200 && !/text\/html/i.test(r.type);
  const robotsOk = isText(robotsR) && /user-agent/i.test(robotsR.text);
  const llmsOk = isText(llmsR) && /^\s*#/.test(llmsR.text) && llmsR.text.length > 80;
  const llmsFullOk = isText(llmsFullR) && llmsFullR.text.length > 200;
  const sitemapOk = sitemapR.ok && sitemapR.status === 200 && /<(urlset|sitemapindex)/i.test(sitemapR.text);
  const robots = robotsOk ? parseRobots(robotsR.text) : null;
  const sm = sitemapOk ? parseSitemap(sitemapR.text) : { urls: [], index: [] };

  // Sample pages: from the sitemap, otherwise internal links
  let sample = sm.urls.map((u) => u.loc);
  if (!sample.length) sample = h.internalLinks;
  const home404 = new URL(home.finalUrl).origin + new URL(home.finalUrl).pathname.replace(/\/$/, '');
  sample = [...new Set(sample.map((u) => u.replace(/\/$/, '')))].filter((u) => u !== home404).slice(0, 8);
  const pages = [{ url: home.finalUrl, status: home.status, ttfb, bytes: home.bytes, title: h.title, description: h.description, canonical: h.canonical ? attr(h.canonical, 'href') || h.canonical : '', h1: h.h1.length, words: h.words, schema: h.ldTypes, isHome: true }];
  const fetched = await Promise.all(sample.map((u) => timedFetch(u, { timeout: 12_000 })));
  fetched.forEach((r, i) => {
    if (!r.ok) return pages.push({ url: sample[i], status: 0, error: r.error });
    const p = parseHtml(r.text, r.finalUrl || sample[i]);
    pages.push({ url: r.finalUrl || sample[i], status: r.status, ttfb: r.ttfb, bytes: r.bytes, title: p.title, description: p.description, canonical: p.canonical ? attr(p.canonical, 'href') || p.canonical : '', h1: p.h1.length, words: p.words, schema: p.ldTypes });
  });
  // apex/www redirects can make the same URL appear twice; keep the first
  const seen = new Set();
  for (let i = 0; i < pages.length; i++) {
    const key = pages[i].url.replace(/\/$/, '');
    if (seen.has(key)) pages.splice(i--, 1);
    else seen.add(key);
  }
  const okPages = pages.filter((p) => p.status === 200);
  const dupTitles = okPages.length - new Set(okPages.map((p) => p.title)).size;
  const dupDesc = okPages.length - new Set(okPages.map((p) => p.description).filter(Boolean)).size;
  const missingDesc = okPages.filter((p) => !p.description).length;
  const brokenPages = pages.filter((p) => p.status >= 400 || p.status === 0).length;

  // ===== SEO =====
  const S = 'seo';
  add(S, 'https', 'Served over HTTPS with a 200', 5, home.status === 200 && home.finalUrl.startsWith('https') ? 1 : 0, home.finalUrl, 'Serve the site over HTTPS and return 200 on the canonical URL.');
  const tl = h.title.length;
  add(S, 'title', 'Title tag 30–65 characters', 8, !tl ? 0 : tl >= 30 && tl <= 65 ? 1 : 0.5, tl ? `"${h.title}" (${tl} chars)` : 'No <title> found', 'Write a unique title of 30–65 characters with the primary topic first.');
  const dl = h.description.length;
  add(S, 'desc', 'Meta description 70–170 characters', 8, !dl ? 0 : dl >= 70 && dl <= 170 ? 1 : 0.5, dl ? `${dl} chars` : 'Missing', 'Add a 120–160 character description that states who you serve and the outcome.');
  const canonHref = h.canonical ? attr(h.canonical, 'href') : '';
  add(S, 'canonical', 'Canonical URL declared', 6, canonHref ? 1 : 0, canonHref || 'No <link rel="canonical">', 'Add <link rel="canonical"> pointing at the preferred absolute URL (include it on every page).');
  add(S, 'h1', 'Exactly one H1', 6, h.h1.length === 1 ? 1 : h.h1.length ? 0.5 : 0, h.h1.length ? `${h.h1.length} H1: "${h.h1[0].slice(0, 70)}"` : 'No H1 in server HTML', 'Use one descriptive H1 per page, present in the server-rendered HTML.');
  add(S, 'headings', 'Logical heading hierarchy (2+ H2)', 3, h.h2.length >= 2 ? 1 : h.h2.length ? 0.5 : 0, `${h.h2.length} H2 · ${h.h3.length} H3`, 'Break content into H2 sections so engines can lift passages.');
  add(S, 'viewport', 'Mobile viewport set', 4, h.viewport ? 1 : 0, h.viewport || 'Missing', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
  add(S, 'lang', 'html lang attribute', 3, h.lang ? 1 : 0, h.lang || 'Missing', 'Add lang="en" (or the right locale) on <html>.');
  add(S, 'indexable', 'Indexable (no noindex)', 5, /noindex/i.test(h.robotsMeta) ? 0 : 1, h.robotsMeta || 'No robots meta (default index,follow)', 'Remove noindex from pages you want in search.');
  add(S, 'robots', 'robots.txt present', 6, robotsOk ? 1 : 0, robotsOk ? `${robots.groups} rule groups` : `${origin}/robots.txt returned ${robotsR.status}`, 'Publish /robots.txt that allows search + AI crawlers and lists your sitemap.');
  add(S, 'sitemap', 'XML sitemap present & valid', 8, sitemapOk ? 1 : 0, sitemapOk ? `${sm.urls.length || sm.index.length} ${sm.urls.length ? 'URLs' : 'child sitemaps'}` : `${origin}/sitemap.xml returned ${sitemapR.status}`, 'Generate /sitemap.xml at build time and submit it in Google Search Console and Bing Webmaster Tools.');
  add(S, 'sitemap-ref', 'Sitemap referenced in robots.txt', 3, robotsOk && robots.sitemaps.length ? 1 : 0, robotsOk ? robots.sitemaps[0] || 'No Sitemap: line' : 'No robots.txt', 'Add "Sitemap: https://…/sitemap.xml" to robots.txt.');
  const lastmods = sm.urls.filter((u) => u.lastmod).length;
  add(S, 'lastmod', 'Sitemap includes lastmod dates', 2, !sm.urls.length ? null : lastmods === sm.urls.length ? 1 : lastmods ? 0.5 : 0, `${lastmods}/${sm.urls.length} URLs`, 'Emit <lastmod> for every URL so crawlers prioritise fresh content.');
  const ogN = [h.og.title, h.og.description, h.og.image].filter(Boolean).length;
  add(S, 'og', 'Open Graph (title, description, image)', 4, ogN === 3 ? 1 : ogN ? 0.5 : 0, `${ogN}/3 tags${h.og.image ? '' : ' · og:image missing'}`, 'Add og:title, og:description and a 1200×630 og:image so shares and AI link previews look right.');
  add(S, 'twitter', 'Twitter / X card', 2, h.twitter ? 1 : 0, h.twitter || 'Missing', 'Add <meta name="twitter:card" content="summary_large_image">.');
  add(S, 'alt', 'Images have alt text', 4, h.imgs ? (h.imgsNoAlt === 0 ? 1 : h.imgsNoAlt / h.imgs < 0.3 ? 0.5 : 0) : null, `${h.imgs - h.imgsNoAlt}/${h.imgs} images`, 'Add descriptive alt text to every meaningful image.');
  add(S, 'links', 'Internal linking (5+ links)', 3, h.internalLinks.length >= 5 ? 1 : h.internalLinks.length ? 0.5 : 0, `${h.internalLinks.length} internal links`, 'Link to your key service pages from the homepage with descriptive anchors.');
  add(S, 'favicon', 'Favicon declared', 2, h.favicon ? 1 : 0, h.favicon || 'Missing', 'Add <link rel="icon">.');
  add(S, 'pages', 'Sampled pages healthy (no 4xx/5xx)', 6, brokenPages === 0 ? 1 : 0, `${okPages.length}/${pages.length} sampled pages returned 200`, 'Fix or redirect broken URLs listed in the sitemap.');
  add(S, 'unique', 'Unique titles & descriptions across pages', 5, okPages.length < 2 ? null : dupTitles === 0 && dupDesc === 0 && missingDesc === 0 ? 1 : dupTitles + missingDesc <= 1 ? 0.5 : 0, `${dupTitles} duplicate titles · ${dupDesc} duplicate / ${missingDesc} missing descriptions`, 'Give every page its own title and description. Duplicates dilute rankings and AI snippets.');
  const wwwOk = wwwR.ok && (wwwR.redirected || wwwR.status === 200);
  add(S, 'www', 'www / non-www variants resolve', 2, wwwOk ? 1 : 0, wwwOk ? `Alternate host → ${wwwR.finalUrl}` : 'Alternate host does not resolve', 'Redirect the alternate hostname to the canonical one with a 301.');
  if (canonHref) {
    const cu = new URL(canonHref, home.finalUrl);
    add(S, 'canon-host', 'Canonical host matches served host', 3, cu.host.replace(/^www\./, '') === finalHost.replace(/^www\./, '') ? (cu.host === finalHost ? 1 : 0.5) : 0, `canonical ${cu.host} · served ${finalHost}`, 'Make the canonical host identical to the host users land on (301 the other).');
  }

  // ===== AEO =====
  const A = 'aeo';
  const hasType = (...t) => t.some((x) => h.ldTypes.includes(x));
  const org = h.ld.find((n) => [].concat(n['@type'] || []).some((t) => /^(Organization|Corporation|LocalBusiness|ProfessionalService|FinancialService|Person)$/.test(t)));
  add(A, 'llms', 'llms.txt published', 10, llmsOk ? 1 : 0, llmsOk ? `${llmsR.bytes} bytes` : `${origin}/llms.txt returned ${llmsR.status}`, 'Publish /llms.txt: H1 name, a one-paragraph summary, then links to your core pages in Markdown.');
  add(A, 'jsonld', 'Structured data (JSON-LD) present', 8, h.invalidLd ? 0.5 : h.ld.length ? 1 : 0, h.ld.length ? `${h.ldTypes.join(', ') || 'untyped'}${h.invalidLd ? ` · ${h.invalidLd} block(s) invalid JSON` : ''}` : 'None found', 'Add JSON-LD for Organization, WebSite and your main services.');
  add(A, 'entity', 'Organization entity with description', 8, org && org.description ? 1 : org ? 0.5 : 0, org ? `${org.name || 'unnamed'}${org.description ? ' · has description' : ''}` : 'No Organization schema', 'Describe the company in Organization schema: name, description, url, logo, contact, areaServed.');
  add(A, 'faq', 'FAQPage structured data', 10, hasType('FAQPage') ? 1 : 0, hasType('FAQPage') ? 'FAQPage found' : 'Not found', 'Add an FAQ section answering buyer questions in 40–60 words each, marked up as FAQPage JSON-LD.');
  add(A, 'qheads', 'Question-style headings (3+)', 8, h.questions.length >= 3 ? 1 : h.questions.length ? 0.5 : 0, `${h.questions.length} question headings`, 'Phrase H2/H3s as the questions buyers ask ("How does an operating partner differ from a consultant?") and answer directly beneath.');
  add(A, 'ssr', 'Content visible without JavaScript (300+ words)', 12, h.words >= 300 ? 1 : h.words >= 120 ? 0.5 : 0, `${h.words} words in raw HTML`, 'Server-render or pre-render pages. Most AI crawlers do not execute JavaScript, so a client-rendered page looks empty to them.');
  add(A, 'schema-rich', 'Service / Article / WebPage schema beyond Organization', 6, hasType('Service', 'Article', 'BlogPosting', 'WebPage', 'Product', 'ItemList', 'HowTo') ? 1 : 0, h.ldTypes.join(', ') || '—', 'Mark up each service as Service and add Article schema to thought-leadership posts.');
  add(A, 'breadcrumb', 'WebSite / BreadcrumbList / sitelinks schema', 3, hasType('WebSite', 'BreadcrumbList') ? 1 : 0, hasType('WebSite') ? 'WebSite present' : 'Not found', 'Add WebSite (and BreadcrumbList on inner pages).');
  const contactInSchema = org && (org.email || org.telephone || org.address || org.contactPoint);
  add(A, 'contact', 'Contact details machine-readable', 4, contactInSchema ? 1 : 0, contactInSchema ? 'In schema' : 'Not in schema', 'Put email, telephone and address in Organization schema.');
  add(A, 'answer-meta', 'Description reads as a direct definition', 3, /\b(is|are|we)\b/i.test(h.description) && dl >= 70 ? 1 : dl ? 0.5 : 0, h.description.slice(0, 90), 'Open the description with a one-sentence definition: "X is a … that helps … do …".');

  // ===== GEO =====
  const G = 'geo';
  const botRows = AI_BOTS.map((b) => {
    const v = robotsOk ? robots.verdict(b.ua) : { state: 'allowed', explicit: false };
    return { ...b, state: v.state, explicit: v.explicit };
  });
  const allowed = botRows.filter((b) => b.state === 'allowed').length;
  const explicit = botRows.filter((b) => b.state === 'allowed' && b.explicit).length;
  add(G, 'bots-open', 'AI crawlers are not blocked', 12, allowed === botRows.length ? 1 : allowed / botRows.length >= 0.7 ? 0.5 : 0, `${allowed}/${botRows.length} crawlers allowed`, 'Remove Disallow rules for GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Google-Extended if you want to be cited.');
  add(G, 'bots-explicit', 'AI crawlers explicitly welcomed in robots.txt', 6, !robotsOk ? 0 : explicit >= 6 ? 1 : explicit ? 0.5 : 0, robotsOk ? `${explicit} explicit Allow groups` : 'No robots.txt', 'Add explicit "User-agent: GPTBot / Allow: /" groups for the major AI crawlers.');
  add(G, 'llms-geo', 'llms.txt gives models a curated map', 8, llmsOk ? 1 : 0, llmsOk ? 'Present' : 'Missing', 'Publish /llms.txt (see AEO).');
  add(G, 'llms-full', 'llms-full.txt (long-form context)', 3, llmsFullOk ? 1 : 0, llmsFullOk ? `${llmsFullR.bytes} bytes` : 'Missing', 'Optional: publish /llms-full.txt with the full text of your key pages for retrieval.');
  const sameAs = [].concat((org && org.sameAs) || []);
  add(G, 'sameas', 'Entity links (sameAs: LinkedIn, Crunchbase, Wikipedia)', 8, sameAs.length >= 2 ? 1 : sameAs.length ? 0.5 : 0, sameAs.length ? `${sameAs.length} profile links` : 'None in schema', 'Add sameAs links to LinkedIn, Crunchbase, X and any directory so models can reconcile the brand entity.');
  const knows = [].concat((org && org.knowsAbout) || []);
  add(G, 'knows', 'Topical authority declared (knowsAbout)', 5, knows.length >= 4 ? 1 : knows.length ? 0.5 : 0, knows.length ? `${knows.length} topics` : 'None', 'List the topics you want to be cited for in knowsAbout.');
  add(G, 'facts', 'Quotable facts & figures on page (10+)', 6, h.facts >= 10 ? 1 : h.facts >= 4 ? 0.5 : 0, `${h.facts} numeric facts detected`, 'Generative engines cite specifics. Add named metrics, ranges and outcomes ("NRR from 98% to 115%").');
  const trustLinks = h.internalLinks.some((u) => /about|firm|team|company|contact/i.test(u));
  add(G, 'eeat', 'Trust pages linked (About / Team / Contact)', 5, trustLinks ? 1 : 0, trustLinks ? 'Linked' : 'Not found in homepage links', 'Link About, Team and Contact from the homepage; add author bios to articles.');
  const lm = sm.urls.map((u) => Date.parse(u.lastmod)).filter(Boolean);
  const newest = lm.length ? Math.max(...lm) : 0;
  const ageDays = newest ? Math.round((Date.now() - newest) / 864e5) : null;
  add(G, 'fresh', 'Fresh content (sitemap lastmod < 90 days)', 5, ageDays === null ? null : ageDays <= 90 ? 1 : ageDays <= 180 ? 0.5 : 0, ageDays === null ? 'No lastmod dates' : `Newest update ${ageDays} days ago`, 'Ship new insight posts or refresh key pages; engines weight recency.');
  add(G, 'cite', 'Cites authoritative external sources', 3, h.externalHosts.length >= 3 ? 1 : h.externalHosts.length ? 0.5 : 0, `${h.externalHosts.length} external hosts linked`, 'Cite named studies and sources; engines favour pages that show their evidence.');
  add(G, 'ssr-geo', 'Server-rendered so crawlers can read it', 10, h.words >= 300 ? 1 : h.words >= 120 ? 0.5 : 0, `${h.words} words in raw HTML`, 'Pre-render to HTML (SSR/SSG). GPTBot, ClaudeBot and PerplexityBot do not run JavaScript.');

  // ===== Performance (measured from this server) =====
  const P = 'perf';
  add(P, 'ttfb', 'Time to first byte (median of 3)', 15, ttfb <= 200 ? 1 : ttfb <= 600 ? 0.5 : 0, `${ttfb} ms`, 'Put the site behind a CDN and cache the HTML at the edge.');
  const enc = (home.headers.get('content-encoding') || '').toLowerCase();
  add(P, 'compress', 'Brotli / gzip compression', 10, /br|gzip|zstd/.test(enc) ? 1 : 0, enc || 'none', 'Enable Brotli or gzip on the CDN/origin.');
  add(P, 'weight', 'HTML under 100 KB', 8, home.bytes <= 100_000 ? 1 : home.bytes <= 250_000 ? 0.5 : 0, `${(home.bytes / 1024).toFixed(1)} KB`, 'Trim inline JSON/CSS or move to external cached files.');
  add(P, 'blocking-js', 'No render-blocking scripts in <head>', 8, h.blockingScripts === 0 ? 1 : h.blockingScripts <= 2 ? 0.5 : 0, `${h.blockingScripts} blocking`, 'Add defer/async (or type="module") to head scripts.');
  add(P, 'blocking-css', 'Few blocking stylesheets (≤2)', 5, h.blockingCss <= 2 ? 1 : h.blockingCss <= 4 ? 0.5 : 0, `${h.blockingCss} stylesheets`, 'Inline critical CSS and load the rest asynchronously.');
  add(P, 'hints', 'Resource hints (preconnect / preload)', 4, h.hints >= 2 ? 1 : h.hints ? 0.5 : 0, `${h.hints} hints`, 'Preconnect to font/CDN origins and preload the LCP image.');
  add(P, 'lazy', 'Below-the-fold images lazy-loaded', 3, h.imgs <= 2 ? null : h.lazy ? 1 : 0, `${h.lazy}/${h.imgs} lazy`, 'Add loading="lazy" to images below the fold.');
  const cache = home.headers.get('cache-control') || '';
  const edge = !!(home.headers.get('x-vercel-cache') || home.headers.get('cf-cache-status') || home.headers.get('x-cache') || home.headers.get('age'));
  add(P, 'cdn', 'Served from a CDN edge', 5, edge || /vercel|cloudflare|netlify|fastly|akamai|cloudfront/i.test(home.headers.get('server') || '') ? 1 : 0.5, `${home.headers.get('server') || 'unknown server'}${cache ? ` · ${cache}` : ''}`, 'Serve through a CDN (Vercel, Cloudflare, Fastly) with edge caching.');
  const slowPages = okPages.filter((p) => !p.isHome && p.ttfb > 800).length;
  add(P, 'pages-speed', 'Sampled pages respond fast (<800 ms)', 5, okPages.length < 2 ? null : slowPages === 0 ? 1 : 0.5, `${okPages.length > 1 ? Math.round(median(okPages.filter((p) => !p.isHome).map((p) => p.ttfb))) : 0} ms median across ${okPages.length - 1} pages`, 'Investigate slow routes (cold starts, uncached data fetches).');

  // ===== Security & trust =====
  const X = 'security';
  const hv = (n) => home.headers.get(n) || '';
  add(X, 'hsts', 'HSTS enabled', 4, hv('strict-transport-security') ? 1 : 0, hv('strict-transport-security') || 'Missing', 'Send Strict-Transport-Security: max-age=63072000; includeSubDomains; preload.');
  add(X, 'xcto', 'X-Content-Type-Options: nosniff', 2, /nosniff/i.test(hv('x-content-type-options')) ? 1 : 0, hv('x-content-type-options') || 'Missing', 'Add X-Content-Type-Options: nosniff.');
  add(X, 'csp', 'Content-Security-Policy', 3, hv('content-security-policy') ? 1 : 0, hv('content-security-policy') ? 'Set' : 'Missing', 'Define a CSP to limit script and frame sources.');
  add(X, 'refpol', 'Referrer-Policy', 2, hv('referrer-policy') ? 1 : 0, hv('referrer-policy') || 'Missing', 'Add Referrer-Policy: strict-origin-when-cross-origin.');
  add(X, 'frame', 'Clickjacking protection', 2, hv('x-frame-options') || /frame-ancestors/i.test(hv('content-security-policy')) ? 1 : 0, hv('x-frame-options') || 'Missing', 'Add X-Frame-Options: SAMEORIGIN or CSP frame-ancestors.');
  add(X, 'permissions', 'Permissions-Policy', 1, hv('permissions-policy') ? 1 : 0, hv('permissions-policy') ? 'Set' : 'Missing', 'Add a Permissions-Policy to disable unused browser features.');

  // Scores
  const scores = {};
  for (const cat of ['seo', 'aeo', 'geo', 'perf', 'security']) {
    const cs = checks.filter((c) => c.cat === cat && c.score !== null);
    const w = cs.reduce((s, c) => s + c.weight, 0);
    scores[cat] = w ? Math.round((cs.reduce((s, c) => s + c.weight * c.score, 0) / w) * 100) : 0;
  }
  scores.overall = Math.round((scores.seo + scores.aeo + scores.geo + scores.perf + scores.security * 0.5) / 4.5);

  // Fix list: biggest weighted gaps first
  // The same fix can lift two scores (e.g. SSR helps AEO and GEO): list it once with the combined gain.
  const TWINS = { 'ssr-geo': 'ssr', 'llms-geo': 'llms' };
  const actions = checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .map((c) => ({ ...c, gain: Math.round(c.weight * (1 - c.score) * 10) / 10, cats: [c.cat] }));
  for (const [twin, primary] of Object.entries(TWINS)) {
    const t = actions.findIndex((a) => a.id === twin), p = actions.find((a) => a.id === primary);
    if (t >= 0 && p) { p.gain = Math.round((p.gain + actions[t].gain) * 10) / 10; p.cats.push(actions[t].cat); actions.splice(t, 1); }
  }
  actions.sort((a, b) => b.gain - a.gain);

  // Lighthouse (optional)
  let lighthouse = null;
  if (PSI_API_KEY) {
    const [mobile, desktop] = await Promise.all([psi(site.url, 'mobile'), psi(site.url, 'desktop')]);
    lighthouse = { mobile, desktop };
  }

  const result = {
    site: site.key, name: site.name, domain: site.domain, url: site.url, ok: true,
    at: new Date().toISOString(), tookMs: Date.now() - started,
    scores,
    telemetry: {
      ttfb, ttfbSamples: homes.map((x) => x.ttfb), totalMs: home.total, htmlKB: +(home.bytes / 1024).toFixed(1),
      status: home.status, finalUrl: home.finalUrl, redirected: home.redirected, compression: enc || 'none', server: hv('server'),
      cache: cache, http: 'HTTPS', words: h.words, headings: { h1: h.h1.length, h2: h.h2.length, h3: h.h3.length },
      schemaTypes: h.ldTypes, internalLinks: h.internalLinks.length, externalLinks: h.externalHosts.length,
      images: h.imgs, imagesNoAlt: h.imgsNoAlt, blockingScripts: h.blockingScripts, blockingCss: h.blockingCss,
      sitemapUrls: sm.urls.length, sitemapNewestDays: ageDays, factsOnPage: h.facts,
    },
    files: {
      robots: { ok: robotsOk, status: robotsR.status },
      llms: { ok: llmsOk, status: llmsR.status },
      llmsFull: { ok: llmsFullOk, status: llmsFullR.status },
      sitemap: { ok: sitemapOk, status: sitemapR.status },
    },
    aiCrawlers: botRows,
    pages,
    checks,
    actions: actions.slice(0, 12),
    lighthouse,
    psiConfigured: !!PSI_API_KEY,
    questions: h.questions.slice(0, 8),
    title: h.title, description: h.description,
  };
  return result;
}

let cache = null;
let inflight = null;
export async function getAudits(force = false) {
  if (!force && cache && Date.now() - cache.at < AUDIT_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const results = await Promise.all(Object.values(SITES).map((s) => auditSite(s).catch((e) => ({ site: s.key, name: s.name, domain: s.domain, ok: false, error: e.message, at: new Date().toISOString() }))));
    const points = {};
    for (const r of results) if (r.ok) points[r.site] = { overall: r.scores.overall, seo: r.scores.seo, aeo: r.scores.aeo, geo: r.scores.geo, perf: r.scores.perf, security: r.scores.security, ttfb: r.telemetry.ttfb };
    const history = Object.keys(points).length ? await recordHistory(points) : await getHistory();
    const data = { fetchedAt: new Date().toISOString(), sites: Object.fromEntries(results.map((r) => [r.site, r])), history };
    cache = { at: Date.now(), data };
    return data;
  })().finally(() => { inflight = null; });
  return inflight;
}
export const auditAge = () => (cache ? Date.now() - cache.at : null);
