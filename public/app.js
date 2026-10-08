// Dayone Command Centre: vanilla JS, no build step.
import { FUNNELS, GEO } from './funnel.js';
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 864e5;

const ICONS = {
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  inbox: '<path d="M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  funnel: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
const hydrateIcons = (root = document) => root.querySelectorAll('i[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i); });

const S = {
  site: 'all', view: 'overview', sub: null,
  cfg: null, leads: [], sources: [], leadsAt: null, audit: null,
  range: 30, showFiltered: false, q: '', kind: 'all', tier: 'all', cat: 'all',
  knownIds: null, auditBusy: false,
};

const CAT = { seo: 'SEO', aeo: 'AEO', geo: 'GEO', perf: 'Performance', security: 'Security' };
const CAT_HELP = {
  seo: 'Can Google and Bing find, crawl and rank you?',
  aeo: 'Can answer engines (ChatGPT, Gemini, Perplexity, Siri) lift a direct answer from you?',
  geo: 'Will generative AI cite and recommend you by name?',
  perf: 'How fast is it, measured live from this server?',
  security: 'Trust headers browsers and enterprise buyers look for.',
};
const SITE_COLOR = { tech: '#ff7a00', ventures: '#2a2118' };

// ---------- helpers ----------
const scoreColor = (n) => (n >= 80 ? 'var(--good)' : n >= 60 ? 'var(--warn)' : 'var(--bad)');
const fmtMoney = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
const ago = (ts) => {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 6e4) return 'just now';
  if (d < 36e5) return `${Math.floor(d / 6e4)}m ago`;
  if (d < DAY) return `${Math.floor(d / 36e5)}h ago`;
  if (d < 30 * DAY) return `${Math.floor(d / DAY)}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fullDate = (ts) => (ts ? new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const initials = (n) => (n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const siteName = (k) => S.cfg?.sites[k]?.short || k;
const siteChip = (k) => `<span class="chip ${k}">${esc(siteName(k))}</span>`;
const FLAG_LABEL = { test: 'Test', solicitation: 'Solicitation', geo: 'Outside ICP region' };
const FLAG_TEXT = { test: 'a test submission', solicitation: 'a likely cold solicitation', geo: 'outside the ICP region (India / Nigeria)' };
const tierChip = (l) => (l.tier === 'filtered' ? `<span class="chip filtered">${FLAG_LABEL[l.flags[0]] || 'Filtered'}</span>` : `<span class="chip ${l.tier}">${l.tier === 'hot' ? '🔥 Hot' : l.tier[0].toUpperCase() + l.tier.slice(1)}</span>`);
const real = (l) => l.tier !== 'filtered';
const scoped = (arr) => (S.site === 'all' ? arr : arr.filter((l) => l.site === S.site));
const inRange = (l, days) => l.ts && Date.now() - l.ts <= days * DAY;

function ring(score, size = 96, stroke = 9) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, col = scoreColor(score);
  return `<span class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#f3e8da" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}"/></svg><b style="font-size:${size * 0.3}px;color:${col}">${score}</b></span>`;
}
function scoreBars(sc) {
  return `<div class="scorebars">${['seo', 'aeo', 'geo', 'perf', 'security'].map((k) => `<div class="sb"><span>${CAT[k]}</span><div class="track"><i style="width:${sc[k]}%;background:${scoreColor(sc[k])}"></i></div><b>${sc[k]}</b></div>`).join('')}</div>`;
}
function sparkline(vals, w = 120, h = 34, color = 'var(--orange)') {
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ---------- data ----------
async function api(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}
function setLive(state, text) {
  const el = $('#live');
  el.className = `live ${state}`;
  el.lastElementChild.textContent = text;
}
async function loadLeads({ force = false, quiet = false } = {}) {
  try {
    const d = await api(`/api/leads${force ? '?refresh=1' : ''}`);
    const ids = new Set(d.leads.filter(real).map((l) => l.id));
    if (S.knownIds && !quiet) {
      const fresh = d.leads.filter((l) => real(l) && !S.knownIds.has(l.id));
      if (fresh.length) toast(`New lead: ${fresh[0].name || fresh[0].email}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''}`);
    }
    S.knownIds = ids;
    S.leads = d.leads; S.sources = d.sources; S.leadsAt = Date.now();
    setLive(d.sources.some((s) => !s.ok) ? 'err' : 'ok', d.sources.some((s) => !s.ok) ? 'Sheet error' : `Live · synced ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (e) {
    setLive('err', 'Offline');
  }
  renderChrome();
  render();
}
async function loadAudit(force = false) {
  S.auditBusy = true; render();
  try { S.audit = await api(`/api/audit${force ? '?refresh=1' : ''}`); } catch (e) { S.audit = S.audit || { error: e.message }; }
  S.auditBusy = false; render();
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 5000);
}

// ---------- chrome ----------
function renderChrome() {
  $('#nav').querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.v === S.view));
  const n = scoped(S.leads).filter((l) => real(l) && inRange(l, 7)).length;
  const nc = $('#navCount'); nc.hidden = !n; nc.textContent = n;
  const sites = S.cfg?.sites || {};
  $('#siteSeg').innerHTML = [['all', 'Both'], ...Object.values(sites).map((s) => [s.key, s.short])]
    .map(([k, label]) => `<button class="${S.site === k ? 'on' : ''}" data-site="${k}" role="tab">${esc(label)}</button>`).join('');
  $('#sources').innerHTML = `<h4>Live sources</h4>` + S.sources.filter((s) => s.rows || !s.ok).map((s) => `<div class="src ${s.ok ? '' : 'bad'}" title="${esc(s.error || '')}"><i></i><span>${esc(siteName(s.site))} · ${esc(s.tab)}</span><span>${s.ok ? s.rows : '!'}</span></div>`).join('');
}

// ---------- shared derived stats ----------
function stats() {
  const all = scoped(S.leads);
  const good = all.filter(real);
  const w = (a, from, to) => a.filter((l) => l.ts && Date.now() - l.ts <= to * DAY && Date.now() - l.ts > from * DAY);
  const thisWeek = w(good, 0, 7).length, lastWeek = w(good, 7, 14).length;
  const pipeline = good.filter((l) => l.kind === 'project').reduce((s, l) => s + l.budgetMid, 0);
  return {
    all, good, total: all.length, noise: all.length - good.length,
    hot: good.filter((l) => l.tier === 'hot'), warm: good.filter((l) => l.tier === 'warm'),
    thisWeek, lastWeek, pipeline, last30: w(good, 0, 30).length,
    projects: good.filter((l) => l.kind === 'project').length,
    tests: all.filter((l) => l.flags[0] === 'test').length, spam: all.filter((l) => l.flags[0] === 'solicitation').length, geo: all.filter((l) => l.flags[0] === 'geo').length,
  };
}

// ---------- charts ----------
function timeline(days) {
  const leads = scoped(S.leads).filter((l) => (S.showFiltered ? true : real(l)));
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const keys = [...Object.keys(S.cfg.sites)];
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(end.getTime() - i * DAY); buckets.push({ d, n: Object.fromEntries(keys.map((k) => [k, 0])) }); }
  for (const l of leads) {
    if (!l.ts) continue;
    const idx = days - 1 - Math.floor((end.getTime() + DAY - l.ts) / DAY);
    if (idx >= 0 && idx < days) buckets[idx].n[l.site]++;
  }
  const max = Math.max(3, ...buckets.map((b) => keys.reduce((s, k) => s + b.n[k], 0)));
  const W = 760, H = 210, pl = 28, pb = 26, bw = (W - pl) / days;
  let bars = '';
  buckets.forEach((b, i) => {
    let y = H - pb;
    const x = pl + i * bw + bw * 0.14, w = bw * 0.72;
    for (const k of keys) {
      const h = (b.n[k] / max) * (H - pb - 10);
      if (h > 0) { y -= h; bars += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(4, w / 2)}" fill="${SITE_COLOR[k] || '#999'}"><title>${b.d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${siteName(k)} ${b.n[k]}</title></rect>`; }
    }
  });
  let axis = '';
  for (let t = 0; t <= max; t += Math.max(1, Math.ceil(max / 4))) { const y = H - pb - (t / max) * (H - pb - 10); axis += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="#eee2d3" stroke-dasharray="3 4"/><text x="0" y="${y + 4}" font-size="10" fill="#86786b">${t}</text>`; }
  const step = Math.ceil(days / 7);
  buckets.forEach((b, i) => { if (i % step === 0) axis += `<text x="${pl + i * bw}" y="${H - 6}" font-size="10" fill="#86786b">${b.d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Submissions per day">${axis}${bars}</svg>`;
}
function hbars(rows, { empty = 'No data yet', fmt = (n) => n } = {}) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const max = Math.max(...rows.map((r) => r[1]));
  return `<div class="hbars">${rows.map(([k, v]) => `<div class="hb"><span title="${esc(k)}">${esc(k)}</span><div class="t"><i style="width:${(v / max) * 100}%"></i></div><b>${fmt(v)}</b></div>`).join('')}</div>`;
}
const tally = (arr, fn) => { const m = new Map(); for (const x of arr) { const k = fn(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };

// ---------- views ----------
function leadRow(l, compact = false) {
  return `<div class="feed-i" data-lead="${esc(l.id)}">
    <div class="avatar ${l.tier === 'hot' ? 'hot' : ''}">${esc(initials(l.name))}</div>
    <div style="min-width:0"><div class="who" style="font-weight:600">${esc(l.name || l.email || 'Unknown')} ${compact ? '' : tierChip(l)}</div>
      <div class="sm muted clip" style="max-width:100%">${esc(l.company || l.email)} · ${esc(l.kindLabel)}${l.budget ? ' · ' + esc(l.budget) : ''}</div></div>
    <div style="text-align:right">${siteChip(l.site)}<div class="sm muted" style="font-size:11px;margin-top:3px">${ago(l.ts)}</div></div></div>`;
}

function viewOverview() {
  const st = stats();
  const A = S.audit;
  const sitesA = A?.sites ? Object.values(A.sites) : [];
  const vis = sitesA.filter((s) => s.ok);
  const visAvg = vis.length ? Math.round(vis.reduce((s, x) => s + x.scores.overall, 0) / vis.length) : null;
  const d = st.thisWeek - st.lastWeek;
  const delta = st.lastWeek || st.thisWeek ? `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}</span> vs prior 7 days` : 'No activity in 14 days';

  const kpis = `<div class="grid g-kpi">
    <div class="card kpi hero"><div class="label">Qualified leads</div><div class="val">${st.good.length}<small>of ${st.total} submissions</small></div><div class="note">${st.last30} in the last 30 days</div></div>
    <div class="card kpi"><div class="label">New this week</div><div class="val">${st.thisWeek}</div><div class="note">${delta}</div></div>
    <div class="card kpi"><div class="label">Hot leads</div><div class="val">${st.hot.length}<small>+ ${st.warm.length} warm</small></div><div class="note">Score ≥ 70: budget, timing, fit</div></div>
    <div class="card kpi"><div class="label">Declared pipeline</div><div class="val">${st.pipeline ? fmtMoney(st.pipeline) : '—'}</div><div class="note">${st.projects} project enquir${st.projects === 1 ? 'y' : 'ies'} (midpoint of stated budgets)</div></div>
    <div class="card kpi"><div class="label">Inbox noise filtered</div><div class="val">${st.total ? Math.round((st.noise / st.total) * 100) : 0}<small>%</small></div><div class="note">${st.tests} test · ${st.spam} cold solicitation</div></div>
    <div class="card kpi"><div class="label">Search + AI visibility</div><div class="val" style="color:${visAvg === null ? 'inherit' : scoreColor(visAvg)}">${visAvg ?? '…'}<small>/ 100</small></div><div class="note">${A?.sites ? 'Average across both sites' : 'Auditing sites…'}</div></div>
  </div>`;

  const chart = `<div class="card"><div class="card-h"><div><h3>Submissions over time</h3><p class="sub">Live from ${S.sources.filter((s) => s.ok && s.rows).length} Google Sheet tabs${S.showFiltered ? ' · including test &amp; spam' : ''}</p></div>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <label class="switch"><input type="checkbox" id="chkFiltered" ${S.showFiltered ? 'checked' : ''}> Show test &amp; spam</label>
      <div class="seg small" id="rangeSeg">${[[14, '14d'], [30, '30d'], [90, '90d']].map(([n, l]) => `<button data-range="${n}" class="${S.range === n ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    ${timeline(S.range)}
    <div style="display:flex;gap:16px;font-size:12px;margin-top:6px;color:var(--muted)">${Object.values(S.cfg.sites).map((s) => `<span><i class="dot" style="background:${SITE_COLOR[s.key]}"></i> ${esc(s.short)}</span>`).join('')}</div></div>`;

  const recent = st.good.slice(0, 6);
  const feed = `<div class="card"><div class="card-h"><div><h3>Latest qualified leads</h3><p class="sub">Click for the full submission</p></div><a class="chip" href="#/leads">View all →</a></div>
    ${recent.length ? `<div class="feed">${recent.map((l) => leadRow(l)).join('')}</div>` : `<div class="empty"><b>No qualified leads yet</b>Test and spam submissions are filtered out.</div>`}</div>`;

  const health = sitesA.length
    ? `<div class="grid g-2">${sitesA.map(healthCard).join('')}</div>`
    : `<div class="grid g-2"><div class="skeleton" style="height:260px"></div><div class="skeleton" style="height:260px"></div></div>`;

  return `${kpis}
    <div class="grid g-21" style="margin-top:16px">${chart}${feed}</div>
    <div class="section-t">Search &amp; AI visibility · live audit</div>
    ${health}
    ${vis.length ? readiness(vis) : ''}
    ${vis.length ? topActions(vis) : ''}`;
}

function healthCard(s) {
  if (!s.ok) return `<div class="card"><h3>${esc(s.name)}</h3><div class="callout bad" style="margin-top:12px">Audit failed: ${esc(s.error)}</div></div>`;
  const h = (S.audit.history?.[s.site] || []).map((p) => p.overall);
  const t = s.telemetry;
  const top = s.actions.slice(0, 3);
  return `<div class="card">
    <div class="health-top"><div><h3>${esc(s.name)}</h3><p class="sub">${esc(s.domain)} · audited ${ago(Date.parse(s.at))}</p></div><a href="#/sites/${s.site}">Full report →</a></div>
    <div class="health">${ring(s.scores.overall)}${scoreBars(s.scores)}</div>
    <div class="facts"><div><b>${t.ttfb}<small> ms</small></b><span>Server response</span></div><div><b>${s.aiCrawlers.filter((b) => b.state === 'allowed').length}/${s.aiCrawlers.length}</b><span>AI bots allowed</span></div><div><b>${t.words}</b><span>Words w/o JS</span></div><div><b>${t.sitemapUrls || '0'}</b><span>Sitemap URLs</span></div></div>
    ${h.length > 1 ? `<div style="margin-top:12px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)">Score trend ${sparkline(h)}</div>` : ''}
    <div class="actions" style="margin-top:10px">${top.map((a) => `<div class="act"><span class="tick ${a.status === 'fail' ? 'n' : 'p'}">${a.status === 'fail' ? '✕' : '!'}</span><div><b>${esc(a.label)}</b><p>${esc(a.detail)}</p></div><span class="gain">+${a.gain}</span></div>`).join('')}</div></div>`;
}

function readiness(vis) {
  const rows = [
    ['robots.txt', (s) => s.files.robots.ok], ['XML sitemap', (s) => s.files.sitemap.ok], ['llms.txt (AI site map)', (s) => s.files.llms.ok],
    ['Organization schema', (s) => s.telemetry.schemaTypes.some((t) => /Organization|Service|Corporation/.test(t))], ['FAQPage schema', (s) => s.telemetry.schemaTypes.includes('FAQPage')],
    ['Content readable without JavaScript', (s) => (s.telemetry.words >= 300 ? true : s.telemetry.words >= 120 ? 'p' : false)],
    ['Canonical URL tag', (s) => s.checks.find((c) => c.id === 'canonical')?.status === 'pass'],
    ['Entity links (sameAs)', (s) => s.checks.find((c) => c.id === 'sameas')?.status === 'pass' ? true : s.checks.find((c) => c.id === 'sameas')?.status === 'warn' ? 'p' : false],
    ['AI crawlers allowed', (s) => { const a = s.aiCrawlers.filter((b) => b.state === 'allowed').length; return a === s.aiCrawlers.length ? true : a ? 'p' : false; }],
  ];
  const cell = (v) => `<span class="tick ${v === true ? 'y' : v === 'p' ? 'p' : 'n'}">${v === true ? '✓' : v === 'p' ? '~' : '✕'}</span>`;
  return `<div class="card" style="margin-top:16px"><div class="card-h"><div><h3>AI &amp; search readiness</h3><p class="sub">The seven signals that decide whether ChatGPT, Gemini, Perplexity and Google can find and cite each site</p></div></div>
    <div class="tbl-wrap"><table class="matrix"><thead><tr><th>Signal</th>${vis.map((s) => `<th style="text-align:center">${esc(siteName(s.site))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, fn]) => `<tr><td>${esc(label)}</td>${vis.map((s) => `<td style="text-align:center">${cell(fn(s))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

function topActions(vis) {
  const all = vis.flatMap((s) => s.actions.map((a) => ({ ...a, site: s.site }))).sort((a, b) => b.gain - a.gain).slice(0, 7);
  return `<div class="card" style="margin-top:16px"><div class="card-h"><div><h3>Highest-impact fixes</h3><p class="sub">Ranked by how many score points each is worth. Do these first.</p></div></div>
    <div class="actions">${all.map((a) => `<div class="act"><span class="tick ${a.status === 'fail' ? 'n' : 'p'}">${a.status === 'fail' ? '✕' : '!'}</span><div><b>${esc(a.label)}</b> ${siteChip(a.site)} ${a.cats.map((c) => `<span class="chip">${CAT[c]}</span>`).join(" ")}<p>${esc(a.fix)}</p></div><span class="gain">+${a.gain} pts</span></div>`).join('')}</div></div>`;
}

// ----- Leads -----
function filteredLeads() {
  const q = S.q.toLowerCase();
  return scoped(S.leads).filter((l) =>
    (S.showFiltered || real(l)) && (S.kind === 'all' || l.kind === S.kind) && (S.tier === 'all' || l.tier === S.tier) &&
    (!q || `${l.name} ${l.email} ${l.company} ${l.message} ${l.industry} ${l.budget}`.toLowerCase().includes(q)));
}
function viewLeads() {
  const rows = filteredLeads();
  return `<div class="card">
    <div class="filters">
      <input class="input" id="q" placeholder="Search name, email, company, message…" value="${esc(S.q)}">
      <div class="seg small" id="kindSeg">${[['all', 'All types'], ['project', 'Project enquiries'], ['contact', 'Contact'], ['application', 'Applications']].map(([k, l]) => `<button data-kind="${k}" class="${S.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="seg small" id="tierSeg">${[['all', 'Any score'], ['hot', 'Hot'], ['warm', 'Warm'], ['cold', 'Cold']].map(([k, l]) => `<button data-tier="${k}" class="${S.tier === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="switch"><input type="checkbox" id="chkFiltered" ${S.showFiltered ? 'checked' : ''}> Show test &amp; spam</label>
      <button class="btn" id="export" style="margin-left:auto">Export CSV</button>
    </div>
    ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Received</th><th>Contact</th><th>Company</th><th>Type</th><th>Brief</th><th>Fit</th></tr></thead><tbody>
      ${rows.map((l) => `<tr class="click" data-lead="${esc(l.id)}">
        <td style="white-space:nowrap"><div>${ago(l.ts)}</div><div class="sm">${siteChip(l.site)}</div></td>
        <td><div class="who">${esc(l.name || '—')}</div><div class="sm">${esc(l.email)}</div></td>
        <td>${esc(l.company || '—')}<div class="sm">${esc(l.role || l.industry || '')}</div></td>
        <td>${esc(l.kindLabel)}<div class="sm">${esc(l.tab)}</div></td>
        <td><div class="clip">${esc(l.budget ? l.budget + ' · ' : '')}${esc(l.message || l.interest || '—')}</div></td>
        <td>${tierChip(l)}<div class="sm">${l.score}/100</div></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><b>No leads match</b>Try clearing filters or enabling “Show test &amp; spam”.</div>`}
    </div>`;
}

function openLead(id) {
  const l = S.leads.find((x) => x.id === id); if (!l) return;
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '');
  $('#drawer').innerHTML = `<button class="x" id="closeDrawer" aria-label="Close">×</button>
    <div style="display:flex;gap:8px;margin-bottom:12px">${siteChip(l.site)} ${tierChip(l)}</div>
    <h2>${esc(l.name || l.email)}</h2><p class="muted" style="margin:2px 0 0">${esc(l.kindLabel)} · ${fullDate(l.ts)} (${ago(l.ts)})</p>
    ${l.flags.length ? `<div class="callout info" style="margin-top:16px">Auto-flagged as <b>${FLAG_TEXT[l.flags[0]] || 'filtered'}</b>${l.geoReason && l.flags[0] === 'geo' ? ` (${esc(l.geoReason)})` : ''} and excluded from your numbers.</div>` : ''}
    <dl>${row('Email', l.email)}${row('Phone', l.phone)}${l.phoneError ? '<dt>Phone</dt><dd>Stored as #ERROR! in the sheet (see Insights → data quality)</dd>' : ''}${row('Company', l.company)}${row('Role', l.role)}${row('Industry', l.industry)}${row('Interest', l.interest)}${row('Goal', l.goal)}${row('Building', l.building)}${row('Budget', l.budget)}${row('Start', l.start)}${row('Deliver', l.deliver)}${row('Funding', l.funding)}${row('Engagement', l.engagement)}${row('Link', l.link)}${row('Source', l.source)}${row('Sheet tab', `${siteName(l.site)} › ${l.tab}`)}${row('Lead score', `${l.score}/100`)}</dl>
    ${l.fullMessage ? `<h3 style="margin:0 0 8px;font-size:13px">Message</h3><div class="msg">${esc(l.fullMessage)}</div>` : ''}
    <div class="row">${l.email ? `<a class="btn primary" href="mailto:${esc(l.email)}?subject=${encodeURIComponent('Re: your enquiry to ' + (S.cfg.sites[l.site]?.name || 'Dayone'))}">Reply by email</a>` : ''}${l.email ? `<button class="btn" id="copyMail">Copy email</button>` : ''}<a class="btn" target="_blank" rel="noopener" href="${esc(S.cfg.sites[l.site].sheetUrl)}">Open sheet</a></div>`;
  $('#drawer').hidden = false; $('#drawerBg').hidden = false;
  $('#closeDrawer').onclick = closeDrawer;
  const cm = $('#copyMail'); if (cm) cm.onclick = () => { navigator.clipboard?.writeText(l.email); toast('Email copied'); };
}
const closeDrawer = () => { $('#drawer').hidden = true; $('#drawerBg').hidden = true; };

function exportCsv() {
  const rows = filteredLeads();
  const cols = ['submittedAt', 'siteName', 'kindLabel', 'tab', 'name', 'email', 'phone', 'company', 'role', 'industry', 'budget', 'start', 'funding', 'engagement', 'tier', 'score', 'message', 'source'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((l) => cols.map((c) => q(l[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `dayone-leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

// ----- Websites -----
function viewSites() {
  if (!S.audit) return `<div class="grid g-2"><div class="skeleton" style="height:300px"></div><div class="skeleton" style="height:300px"></div></div>`;
  const keys = Object.keys(S.audit.sites || {});
  const key = S.sub && S.audit.sites[S.sub] ? S.sub : (S.site !== 'all' ? S.site : keys[0]);
  const s = S.audit.sites[key];
  const tabs = `<div class="seg" style="margin-bottom:16px">${keys.map((k) => `<button data-sitetab="${k}" class="${k === key ? 'on' : ''}">${esc(siteName(k))}</button>`).join('')}</div>
    <button class="btn ${S.auditBusy ? 'spin' : ''}" id="reaudit" style="float:right"><i data-i="refresh"></i><span>${S.auditBusy ? 'Auditing…' : 'Re-run audit'}</span></button>`;
  if (!s.ok) return `${tabs}<div class="callout bad">Audit failed: ${esc(s.error)}</div>`;
  const t = s.telemetry;
  const hist = S.audit.history?.[key] || [];
  const cats = ['all', 'seo', 'aeo', 'geo', 'perf', 'security'];
  const list = s.checks.filter((c) => S.cat === 'all' || c.cat === S.cat).sort((a, b) => ({ fail: 0, warn: 1, pass: 2, na: 3 }[a.status] - { fail: 0, warn: 1, pass: 2, na: 3 }[b.status]) || b.weight - a.weight);
  const csrOnly = t.words < 120;

  const gauges = `<div class="card"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px">
    ${['overall', 'seo', 'aeo', 'geo', 'perf', 'security'].map((k) => `<div style="text-align:center">${ring(s.scores[k], k === 'overall' ? 112 : 92)}<div style="font-weight:600;margin-top:6px">${k === 'overall' ? 'Overall' : CAT[k]}</div><div class="muted" style="font-size:11.5px;line-height:1.35">${k === 'overall' ? 'Weighted blend' : esc(CAT_HELP[k])}</div></div>`).join('')}</div>
    ${hist.length > 1 ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);display:flex;gap:12px;align-items:center">Overall trend over ${hist.length} audits ${sparkline(hist.map((p) => p.overall), 160, 34)}</div>` : `<p class="muted" style="font-size:12px;margin:14px 0 0">Trend lines build up as the audit re-runs every 6 hours.</p>`}</div>`;

  const warn = csrOnly ? `<div class="callout bad"><span style="font-size:18px">⚠</span><div><b>AI crawlers see an empty page.</b> The raw HTML contains only ${t.words} words and ${t.headings.h1 + t.headings.h2} headings: the content is drawn by JavaScript, and GPTBot, ClaudeBot and PerplexityBot do not run JavaScript. Pre-rendering (SSR/SSG) is the single biggest AEO and GEO win for this site.</div></div>` : '';

  const tele = `<div class="card"><div class="card-h"><div><h3>Live telemetry</h3><p class="sub">Measured from this dashboard's server just now · ${esc(t.finalUrl)}</p></div></div>
    <div class="tele">
      <div><b style="color:${scoreColor(t.ttfb <= 200 ? 100 : t.ttfb <= 600 ? 70 : 30)}">${t.ttfb} ms</b><span>Time to first byte (median of ${t.ttfbSamples.length})</span></div>
      <div><b>${t.totalMs} ms</b><span>Full HTML download</span></div>
      <div><b>${t.htmlKB} KB</b><span>HTML weight (${esc(t.compression)})</span></div>
      <div><b>${t.words}</b><span>Words visible without JS</span></div>
      <div><b>${t.headings.h1} / ${t.headings.h2} / ${t.headings.h3}</b><span>H1 / H2 / H3</span></div>
      <div><b>${t.schemaTypes.length}</b><span>Schema types${t.schemaTypes.length ? ': ' + esc(t.schemaTypes.slice(0, 4).join(', ')) : ''}</span></div>
      <div><b>${t.sitemapUrls}</b><span>URLs in sitemap</span></div>
      <div><b>${t.blockingScripts} / ${t.blockingCss}</b><span>Blocking JS / CSS in head</span></div>
    </div></div>`;

  const lh = s.lighthouse ? lighthouseCard(s.lighthouse) : `<div class="callout info"><span style="font-size:18px">ℹ</span><div><b>Lighthouse lab data (LCP, CLS, TBT)</b> needs a free Google PageSpeed API key. Set <code>PSI_API_KEY</code> and restart; the figures above are measured directly in the meantime.</div></div>`;

  const files = `<div class="card"><div class="card-h"><div><h3>Discovery files</h3><p class="sub">What crawlers fetch first</p></div></div>
    <table class="matrix"><tbody>${[['robots.txt', s.files.robots], ['sitemap.xml', s.files.sitemap], ['llms.txt', s.files.llms], ['llms-full.txt', s.files.llmsFull]].map(([n, f]) => `<tr><td>${n}</td><td><span class="tick ${f.ok ? 'y' : 'n'}">${f.ok ? '✓' : '✕'}</span></td><td class="muted">${f.ok ? 'Found' : `HTTP ${f.status}`}</td></tr>`).join('')}</tbody></table></div>`;

  const bots = `<div class="card"><div class="card-h"><div><h3>AI crawler access</h3><p class="sub">Parsed from robots.txt, per crawler</p></div></div>
    <table class="matrix"><tbody>${s.aiCrawlers.map((b) => `<tr><td><b>${esc(b.ua)}</b><div class="sm muted">${esc(b.owner)} · ${esc(b.use)}</div></td><td><span class="chip ${b.state === 'allowed' ? 'good' : 'bad'}">${b.state === 'allowed' ? (b.explicit ? 'Welcomed' : 'Allowed by default') : 'Blocked'}</span></td></tr>`).join('')}</tbody></table></div>`;

  const pages = `<div class="card"><div class="card-h"><div><h3>Pages sampled</h3><p class="sub">From the sitemap (or homepage links when none exists)</p></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>URL</th><th>Status</th><th>TTFB</th><th>Words (no JS)</th><th>H1</th><th>Title</th></tr></thead><tbody>
    ${s.pages.map((p) => `<tr><td class="clip"><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:var(--orange)">${esc(p.url.replace(/^https?:\/\/(www\.)?/, ''))}</a></td><td><span class="chip ${p.status === 200 ? 'good' : 'bad'}">${p.status || 'ERR'}</span></td><td>${p.ttfb ?? '—'} ms</td><td>${p.words ?? '—'}</td><td>${p.h1 ?? '—'}</td><td><div class="clip" style="max-width:300px">${esc(p.title || '—')}</div></td></tr>`).join('')}</tbody></table></div></div>`;

  const checks = `<div class="card"><div class="card-h"><div><h3>All checks</h3><p class="sub">Failures first, each with the specific fix</p></div></div>
    <div class="cat-tabs">${cats.map((c) => { const n = c === 'all' ? s.checks.length : s.checks.filter((x) => x.cat === c).length; const bad = (c === 'all' ? s.checks : s.checks.filter((x) => x.cat === c)).filter((x) => x.status === 'fail' || x.status === 'warn').length; return `<button data-cat="${c}" class="${S.cat === c ? 'on' : ''}">${c === 'all' ? 'All' : CAT[c]}<small>${bad ? bad + ' to fix' : n + ' ok'}</small></button>`; }).join('')}</div>
    ${list.map((c) => `<div class="check"><span class="tick ${c.status === 'pass' ? 'y' : c.status === 'warn' ? 'p' : c.status === 'fail' ? 'n' : 'na'}">${c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : c.status === 'fail' ? '✕' : '–'}</span><div><b>${esc(c.label)}</b> <span class="chip">${CAT[c.cat]}</span><div class="d">${esc(c.detail)}</div>${c.fix ? `<div class="fix">${esc(c.fix)}</div>` : ''}</div><span class="muted" style="font-size:11px">wt ${c.weight}</span></div>`).join('')}</div>`;

  return `${tabs}<div style="clear:both"></div>${warn}${gauges}<div class="grid g-2" style="margin-top:16px">${tele}<div>${lh}${files}</div></div>
    <div class="grid g-2" style="margin-top:16px">${bots}${s.questions.length ? `<div class="card"><div class="card-h"><div><h3>Question headings found</h3><p class="sub">Phrasing answer engines match to queries</p></div></div><ul style="margin:0;padding-left:18px">${s.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></div>` : `<div class="card"><h3>Question headings</h3><div class="empty"><b>None found</b>Answer engines match H2/H3 questions to user prompts. Add 5–8 buyer questions.</div></div>`}</div>
    <div style="margin-top:16px">${pages}</div><div style="margin-top:16px">${checks}</div>`;
}

function lighthouseCard(l) {
  const col = (d) => (d.error ? `<div class="muted">${d.error === 'quota' ? 'API quota hit' : esc(d.error)}</div>` : `<div style="display:flex;gap:10px;flex-wrap:wrap">${Object.entries(d.scores).map(([k, v]) => `<div style="text-align:center">${ring(v, 56, 6)}<div style="font-size:10.5px;color:var(--muted)">${k.replace('best-practices', 'practices')}</div></div>`).join('')}</div>
    <div class="tele" style="margin-top:10px">${[['LCP', d.lcp, 2500, 4000, 'ms'], ['FCP', d.fcp, 1800, 3000, 'ms'], ['TBT', d.tbt, 200, 600, 'ms'], ['CLS', d.cls, 0.1, 0.25, '']].map(([n, v, g, p, u]) => `<div><b style="color:${v <= g ? 'var(--good)' : v <= p ? 'var(--warn)' : 'var(--bad)'}">${u ? Math.round(v) + ' ' + u : v?.toFixed(3)}</b><span>${n}</span></div>`).join('')}</div>`);
  return `<div class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>Lighthouse</h3><p class="sub">Google PageSpeed Insights lab data</p></div></div><div class="grid g-2" style="gap:20px"><div><b>Mobile</b>${col(l.mobile)}</div><div><b>Desktop</b>${col(l.desktop)}</div></div></div>`;
}

// ----- Funnel & ICP -----
function funnelKey() {
  if (S.sub && FUNNELS[S.sub]) return S.sub;
  return S.site !== 'all' && FUNNELS[S.site] ? S.site : 'ventures';
}
function fixFirst(key) {
  const out = [];
  const a = S.audit?.sites?.[key];
  if (a?.ok) {
    if (a.telemetry.words < 120) out.push(`Pre-render the site. AI crawlers currently read ${a.telemetry.words} words, so the assets below are hard for AI assistants to find or cite.`);
    if (!a.files.llms.ok) out.push('Publish llms.txt: a curated map of the pages above for AI assistants.');
    if (!a.files.sitemap.ok || !a.files.robots.ok) out.push('Add robots.txt and sitemap.xml (both return 404 today) so search and AI crawlers can discover every asset.');
    const faq = a.checks.find((c) => c.id === 'faq');
    if (faq && faq.status !== 'pass' && out.length < 3) out.push('Add FAQ structured data to the answer pages so assistants can lift direct answers.');
  }
  const mine = S.leads.filter((l) => l.site === key);
  if (mine.length && (mine.length - mine.filter(real).length) / mine.length > 0.4) out.push(`${Math.round(((mine.length - mine.filter(real).length) / mine.length) * 100)}% of form submissions are tests, cold pitches or out-of-region. Add a honeypot or Turnstile and a Country field to the form before driving traffic to it.`);
  else out.push('Add a required Country field to the forms (today country is only inferred from phone code, email domain and stated location).');
  out.push(key === 'tech' ? 'Align the declared service area with the ICP: llms.txt lists US regions only, while the ICP is every market except India and Nigeria.' : 'Align the declared service area with the ICP: the site schema says areaServed United States only, while the ICP is every market except India and Nigeria.');
  return out.slice(0, 5);
}
function viewFunnel() {
  const key = funnelKey();
  const F = FUNNELS[key], site = S.cfg.sites[key];
  const mine = S.leads.filter((l) => l.site === key);
  const good = mine.filter(real);
  const geoOut = mine.filter((l) => l.flags[0] === 'geo').length;
  const hot = good.filter((l) => l.tier === 'hot').length, warm = good.filter((l) => l.tier === 'warm').length;
  const pipe = good.filter((l) => l.kind === 'project').reduce((s, l) => s + l.budgetMid, 0);
  const a = S.audit?.sites?.[key];
  const live = [
    a?.ok ? `Traffic is not connected yet (needs GA4 and Search Console). Audit: ${a.aiCrawlers.filter((b) => b.state === 'allowed').length}/${a.aiCrawlers.length} AI crawlers allowed, ${a.telemetry.sitemapUrls} sitemap URLs, ${a.telemetry.words} words visible to crawlers.` : 'Traffic is not connected yet (needs GA4 and Search Console).',
    `${mine.length} submissions to date, ${good.length} qualified and in region${geoOut ? `, ${geoOut} outside the ICP region` : ''}. Capture rate per visit needs traffic data.`,
    `${hot} hot, ${warm} warm${pipe ? `, ${fmtMoney(pipe)} declared pipeline` : ', no declared pipeline yet'}.`,
  ];
  const tabs = `<div class="funnel-bar"><div class="seg">${Object.keys(FUNNELS).map((k) => `<button data-funneltab="${k}" class="${k === key ? 'on' : ''}">${esc(siteName(k))}</button>`).join('')}</div>
    <button class="btn primary" id="printFunnel">Print / save as PDF</button></div>`;
  const logo = `<span class="op-logo"><img src="/logo-mark.svg" alt="" width="26" height="26"><b>${key === 'tech' ? 'Day One <i>Technologies</i>' : 'Dayone <i>Ventures</i>'}</b></span>`;
  const liClean = (arr) => arr.map((t) => `<li>${esc(t)}</li>`).join('');

  const icp = `<section class="onepager">
    <div class="op-top"><span class="op-kicker">${esc(F.kicker.replace('Funnel and pipeline', 'ICP scope'))}</span>${logo}</div>
    <h2 class="op-h">Who we are for, <em>and where.</em></h2>
    <p class="op-intro">${esc(F.icp.one)}</p>
    <div class="op-segs">${F.icp.segments.map((s, i) => `<div class="op-seg"><span class="op-n">0${i + 1}</span><h4>${esc(s.name)}</h4><p>${esc(s.who)}</p><dl><dt>Titles</dt><dd>${esc(s.titles)}</dd><dt>Trigger</dt><dd>${esc(s.trigger)}</dd></dl></div>`).join('')}</div>
    <div class="op-grid3">
      <div class="op-box"><span class="op-lab">Firmographic fit</span><ul>${liClean(F.icp.firmographics)}</ul></div>
      <div class="op-box"><span class="op-lab">Qualify in the first call</span><ul>${liClean(F.icp.qualify)}</ul></div>
      <div class="op-box bad"><span class="op-lab">Not our ICP</span><ul>${liClean(F.icp.disqualify)}</ul></div>
    </div>
    <div class="op-geo">
      <div><span class="op-lab">Geography: anywhere except India and Nigeria</span>
        <div class="op-chips"><span class="chip good">Core · ${GEO.core.join(', ')}</span>${GEO.expand.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}<span class="chip">Everywhere else</span>${GEO.excluded.map((g) => `<span class="chip bad">✕ ${esc(g)}</span>`).join('')}</div></div>
      <p class="op-note"><b>How it is enforced.</b> Leads from India or Nigeria (detected from the phone code, email domain or stated location) are flagged “Outside ICP region” and left out of every KPI and the funnel counts. Turn on “Show test &amp; spam” on the Leads page to review them. Outbound lists exclude accounts headquartered there. <b>Right now:</b> ${geoOut} of ${mine.length} ${esc(site.short)} submissions are outside the region.</p>
    </div></section>`;

  const col = (s) => `<div class="op-col"><div class="op-colh ${s.tone}"><span>${esc(s.tag)}</span><h3>${esc(s.title)}</h3><p>Goal: ${esc(s.goal)}</p></div>
    <div class="op-colb"><span class="op-lab">Assets</span><ul class="assets">${s.assets.map(([b, t]) => `<li><b>${esc(b)}</b> ${esc(t)}</li>`).join('')}</ul></div>
    ${s.channels ? `<div class="op-colb"><span class="op-lab">Channels</span><p>${esc(s.channels)}</p></div>` : ''}
    ${s.loop ? `<div class="op-colb"><span class="op-lab">Expansion loop</span><p>${esc(s.loop)}</p></div>` : ''}
    <div class="op-colm"><span class="op-lab">Measure</span><p>${esc(s.measure)}</p></div></div>`;
  const stageIdx = (i) => `<div class="op-live"><span class="op-lab">Live now</span> ${esc(live[i])}</div>`;

  const fix = fixFirst(key);
  const one = `<section class="onepager">
    <div class="op-top"><span class="op-kicker">${esc(F.kicker)}</span>${logo}</div>
    <h2 class="op-h">${esc(F.headline[0])}<em>${esc(F.headline[1])}</em>${esc(F.headline[2])}</h2>
    <p class="op-intro">${esc(F.intro)}</p>
    <div class="op-cols">${F.stages.map((s, i) => `<div class="op-stage">${col(s)}${stageIdx(i)}</div>`).join('')}</div>
    <div class="op-foot"><div class="op-fix"><span class="op-lab">Fix before any of it</span><ul>${fix.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>
      <div class="op-week">${F.week.map(([d, t]) => `<div><span>${d}</span>${esc(t)}</div>`).join('')}</div></div>
    <p class="op-legal">Dayone · Targets are set after a four week baseline. No numbers here are guarantees. ${esc(site.domain)}</p></section>`;

  return `${tabs}${icp}${one}`;
}

// ----- Insights -----
function viewInsights() {
  const st = stats();
  const good = st.good;
  const projects = good.filter((l) => l.kind === 'project');
  const dq = [];
  const allScoped = st.all;
  const phoneErr = allScoped.filter((l) => l.phoneError).length;
  if (phoneErr) dq.push(['bad', `${phoneErr} phone number${phoneErr > 1 ? 's' : ''} stored as #ERROR!`, 'Google Sheets reads a leading “+” as a formula. Have the Apps Script write phone numbers as text (prefix with an apostrophe, or set the column format to Plain text) so international numbers aren’t lost.']);
  const emptyTabs = S.sources.filter((s) => s.ok && !s.rows);
  if (emptyTabs.length) dq.push(['warn', `${emptyTabs.length} empty tab${emptyTabs.length > 1 ? 's' : ''}: ${emptyTabs.map((t) => `${siteName(t.site)} › ${t.tab}`).join(', ')}`, 'Likely default “Sheet1” tabs. Safe to delete, or rename if a form writes there.']);
  if (st.tests) dq.push(['warn', `${st.tests} test submission${st.tests > 1 ? 's' : ''} sit in the production sheets`, 'The dashboard excludes them from every number. Delete the rows (or move to a Test tab) so exports stay clean.']);
  const dupEmails = [...tally(good.filter((l) => l.email), (l) => l.email)].filter(([, n]) => n > 1);
  if (dupEmails.length) dq.push(['warn', `${dupEmails.length} contact${dupEmails.length > 1 ? 's' : ''} submitted more than once`, dupEmails.map(([e]) => e).join(', ')]);
  if (!dq.length) dq.push(['good', 'Sheet data looks clean', 'No errors, duplicates or stray test rows detected.']);

  const funnel = [['All submissions', st.total, '#2a2118'], ['Excluding test rows', st.total - st.tests, '#8a4a12'], ['Excluding cold solicitations', st.total - st.tests - st.spam, '#b8650d'], ['In ICP region (not India / Nigeria)', st.good.length, '#ff7a00'], ['Warm or hot', st.hot.length + st.warm.length, '#ff4a00']];
  const maxF = Math.max(1, st.total);

  return `<div class="grid g-2">
    <div class="card"><div class="card-h"><div><h3>Lead quality funnel</h3><p class="sub">How much of the inbox is real opportunity</p></div></div><div class="funnel">${funnel.map(([l, n, c]) => `<div class="fn"><div class="fn-h"><span>${esc(l)}</span><b>${n}</b></div><div class="fn-t"><i style="width:${n ? Math.max(3, (n / maxF) * 100) : 0}%;background:${c}"></i></div></div>`).join('')}</div></div>
    <div class="card"><div class="card-h"><div><h3>Data quality</h3><p class="sub">Issues found in the connected sheets</p></div></div><div class="actions">${dq.map(([t, h, d]) => `<div class="act"><span class="tick ${t === 'bad' ? 'n' : t === 'warn' ? 'p' : 'y'}">${t === 'good' ? '✓' : t === 'bad' ? '✕' : '!'}</span><div><b>${esc(h)}</b><p>${esc(d)}</p></div><span></span></div>`).join('')}</div></div>
  </div>
  <div class="section-t">Who is asking</div>
  <div class="grid g-2">
    <div class="card"><h3>By industry</h3><div style="margin-top:12px">${hbars(tally(projects, (l) => l.industry).slice(0, 8), { empty: 'Appears as project enquiries arrive' })}</div></div>
    <div class="card"><h3>By declared budget</h3><div style="margin-top:12px">${hbars(tally(projects, (l) => l.budget), { empty: 'Appears as project enquiries arrive' })}</div></div>
    <div class="card"><h3>Urgency (start)</h3><div style="margin-top:12px">${hbars(tally(projects, (l) => l.start), { empty: 'No project enquiries yet' })}</div></div>
    <div class="card"><h3>Engagement model wanted</h3><div style="margin-top:12px">${hbars(tally(projects, (l) => l.engagement), { empty: 'No project enquiries yet' })}</div></div>
    <div class="card"><h3>Funding stage</h3><div style="margin-top:12px">${hbars(tally(projects, (l) => l.funding), { empty: 'No project enquiries yet' })}</div></div>
    <div class="card"><h3>Where leads land</h3><div style="margin-top:12px">${hbars(tally(good, (l) => `${siteName(l.site)} · ${l.kindLabel}`), { empty: 'No leads yet' })}</div></div>
  </div>
  <div class="section-t">Playbook</div>
  <div class="card"><div class="actions">${playbook(st).map(([h, d]) => `<div class="act"><span class="tick p">→</span><div><b>${esc(h)}</b><p>${esc(d)}</p></div><span></span></div>`).join('')}</div></div>`;
}
function playbook(st) {
  const out = [];
  const sites = S.audit?.sites ? Object.values(S.audit.sites).filter((s) => s.ok) : [];
  if (st.total && st.noise / st.total > 0.4) out.push([`${Math.round((st.noise / st.total) * 100)}% of submissions are noise`, 'Add a honeypot field or Cloudflare Turnstile to both forms to block cold solicitations at the source, and send test submissions to a separate sheet.']);
  if (st.hot.length) out.push([`Reply to ${st.hot.length} hot lead${st.hot.length > 1 ? 's' : ''} first`, st.hot.slice(0, 3).map((l) => `${l.name} (${ago(l.ts)})`).join(' · ')]);
  for (const s of sites) {
    if (s.telemetry.words < 120) out.push([`${s.name}: pre-render the site`, 'Its content is invisible to AI crawlers and non-JS bots. Moving to SSR/SSG is the highest-leverage AEO + GEO change.']);
    if (!s.files.llms.ok) out.push([`${s.name}: publish llms.txt`, 'A curated Markdown map of your key pages. It takes about 30 minutes and is a strong signal to AI assistants.']);
    if (!s.files.sitemap.ok || !s.files.robots.ok) out.push([`${s.name}: add robots.txt and sitemap.xml`, 'Currently returning 404. Without them Google and Bing discover pages slowly and AI crawlers get no guidance.']);
  }
  out.push(['Connect real-user traffic next', 'This dashboard measures the sites directly. For visitors, sources and conversion rate, connect Google Search Console and GA4 (read-only) and these leads can be attributed to channels.']);
  return out;
}

// ---------- router / render ----------
const TITLES = {
  overview: ['Overview', () => `Live leads and search / AI visibility for ${S.site === 'all' ? 'both companies' : siteName(S.site)}`],
  leads: ['Leads', () => `${filteredLeads().length} shown · synced from Google Sheets in real time`],
  sites: ['Websites & AI visibility', () => 'SEO, AEO, GEO, performance and security, audited live'],
  funnel: ['Funnel & ICP', () => 'Who we sell to, where, and the reach → capture → convert plan'],
  insights: ['Insights', () => 'Quality, demand and what to do next'],
};
function render() {
  if (!S.cfg) return;
  const [t, sub] = TITLES[S.view];
  $('#title').textContent = t; $('#subtitle').textContent = sub();
  document.title = `${t} · Dayone Command Centre`;
  const v = $('#view');
  const y = window.scrollY;
  const focusId = document.activeElement?.id;
  const sel = focusId === 'q' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  v.innerHTML = ({ overview: viewOverview, leads: viewLeads, sites: viewSites, funnel: viewFunnel, insights: viewInsights })[S.view]();
  hydrateIcons(v);
  if (focusId === 'q') { const q = $('#q'); q.focus(); if (sel) q.setSelectionRange(...sel); }
  window.scrollTo(0, y);
}
function route() {
  const [, view = 'overview', sub] = location.hash.split('/');
  S.view = TITLES[view] ? view : 'overview'; S.sub = sub || null; S.cat = 'all';
  renderChrome(); render();
  window.scrollTo(0, 0);
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-site],[data-range],[data-kind],[data-tier],[data-cat],[data-sitetab],[data-funneltab],[data-lead],#printFunnel,#reaudit,#export,#refresh,#drawerBg');
  if (!t) return;
  if (t.dataset.site) { S.site = t.dataset.site; if (S.view === 'sites') S.sub = null; renderChrome(); render(); }
  else if (t.dataset.range) { S.range = +t.dataset.range; render(); }
  else if (t.dataset.kind) { S.kind = t.dataset.kind; render(); }
  else if (t.dataset.tier) { S.tier = t.dataset.tier; render(); }
  else if (t.dataset.cat) { S.cat = t.dataset.cat; render(); }
  else if (t.dataset.sitetab) { location.hash = `#/sites/${t.dataset.sitetab}`; }
  else if (t.dataset.funneltab) { location.hash = `#/funnel/${t.dataset.funneltab}`; }
  else if (t.id === 'printFunnel') window.print();
  else if (t.dataset.lead) openLead(t.dataset.lead);
  else if (t.id === 'reaudit') loadAudit(true);
  else if (t.id === 'export') exportCsv();
  else if (t.id === 'drawerBg') closeDrawer();
  else if (t.id === 'refresh') {
    t.classList.add('spin');
    Promise.all([loadLeads({ force: true }), loadAudit(true)]).finally(() => t.classList.remove('spin'));
  }
});
document.addEventListener('input', (e) => { if (e.target.id === 'q') { S.q = e.target.value; render(); } });
document.addEventListener('change', (e) => { if (e.target.id === 'chkFiltered') { S.showFiltered = e.target.checked; render(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
window.addEventListener('hashchange', route);

(async function init() {
  hydrateIcons();
  S.cfg = await api('/api/config');
  route();
  loadLeads({ quiet: true });
  loadAudit();
  setInterval(() => loadLeads(), 60_000);          // leads are live: poll every minute
  setInterval(() => loadAudit(), 15 * 60_000);      // audits every 15 minutes (server caches)
})();
