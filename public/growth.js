// Growth tracker: live inbound results (from the sheets) + a weekly activity log + targets + 90-day plan.
import { PLAN } from './plan.js';

const FIELDS = [
  ['sent', 'Emails / DMs sent'], ['replies', 'Replies'], ['positive', 'Positive replies'], ['briefings', 'Briefings held'],
  ['diagnostics', 'Diagnostics started'], ['mandates', 'Mandates signed'], ['posts', 'Posts published'], ['keywords', 'Keyword comments'],
];
const REGION = { US: 'United States / Canada', EU: 'Europe', OTHER: 'Other markets', UNKNOWN: 'Unknown', EXCLUDED: 'Excluded (India / Nigeria)' };
const REGION_COLOR = { US: '#ff7a00', EU: '#2a2118', OTHER: '#b8a28a', UNKNOWN: '#e3d6c4', EXCLUDED: '#e03b3b' };
const STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['briefing', 'Briefing'], ['diagnostic', 'Diagnostic'], ['mandate', 'Mandate']];

// ---- ISO week helpers ("2026-W42") ----
export function isoWeek(date = new Date()) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
export function weekMonday(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7);
  return mon;
}
const weekLabel = (key) => weekMonday(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '—');
const sum = (rows, f) => rows.reduce((s, r) => s + (r[f] || 0), 0);

export function growthSite(S) {
  if (S.sub === 'ventures' || S.sub === 'tech') return S.sub;
  return S.site === 'tech' ? 'tech' : 'ventures';
}

export function viewGrowth(ctx) {
  const { S, esc, siteName, real, fmtMoney, scoreColor } = ctx;
  const site = growthSite(S);
  const G = S.growth || { weeks: {}, targets: {}, checklist: {} };
  const weeksObj = G.weeks[site] || {};
  const weekKeys = Object.keys(weeksObj).sort();
  const weekRows = weekKeys.map((k) => ({ key: k, ...weeksObj[k] }));
  const thisWeek = isoWeek();
  const editKey = S.growWeek || thisWeek;
  const cur = weeksObj[editKey] || {};
  const targets = (G.targets || {})[site] || {};
  const checklist = (G.checklist || {})[site] || {};

  // ---- inbound, live from the sheets ----
  const all = S.leads.filter((l) => l.site === site);
  const tests = all.filter((l) => l.flags[0] === 'test').length;
  const spam = all.filter((l) => l.flags[0] === 'solicitation').length;
  const excluded = all.filter((l) => l.flags[0] === 'geo').length;
  const good = all.filter(real);
  const qualified = good.filter((l) => l.tier === 'hot' || l.tier === 'warm');
  const regionOf = (l) => (l.flags[0] === 'geo' ? 'EXCLUDED' : l.region || 'UNKNOWN');
  const regionCounts = {};
  for (const l of all.filter((x) => x.flags[0] !== 'test' && x.flags[0] !== 'solicitation')) regionCounts[regionOf(l)] = (regionCounts[regionOf(l)] || 0) + 1;
  const regionTotal = Object.values(regionCounts).reduce((a, b) => a + b, 0);
  const staged = good.filter((l) => l.stage);
  const stageCount = (st) => staged.filter((l) => l.stage === st).length;
  const sheetUrl = S.cfg.sites[site].sheetUrl;

  // ---- outbound + activity, from the log ----
  const now = new Date();
  const thisMonth = monthKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
  const monthRows = weekRows.filter((r) => monthKey(weekMonday(r.key)) === thisMonth);
  const tot = Object.fromEntries(FIELDS.map(([f]) => [f, sum(weekRows, f)]));
  const mon = Object.fromEntries(FIELDS.map(([f]) => [f, sum(monthRows, f)]));

  const funnelIn = [
    ['Form submissions', all.length, '#2a2118'],
    ['Real (not test or solicitation)', all.length - tests - spam, '#8a4a12'],
    ['In ICP region (not India / Nigeria)', good.length, '#b8650d'],
    ['Qualified (hot or warm)', qualified.length, '#ff7a00'],
  ];
  const funnelOut = [
    ['Emails / DMs sent', tot.sent, '#2a2118'], ['Replies', tot.replies, '#6b3a10'], ['Positive replies', tot.positive, '#b8650d'],
    ['Briefings held', tot.briefings, '#ff7a00'], ['Diagnostics started', tot.diagnostics, '#ff5a00'], ['Mandates signed', tot.mandates, '#e03b00'],
  ];
  const bars = (rows) => {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return `<div class="fnl">${rows.map(([l, n, c], i) => `<div class="fn"><div class="fn-h"><span>${esc(l)}</span><b>${n}</b></div><div class="fn-t"><i style="width:${n ? Math.max(3, (n / max) * 100) : 0}%;background:${c}"></i></div>${i < rows.length - 1 ? `<div class="fn-r">${pct(rows[i + 1][1], n)} continue</div>` : ''}</div>`).join('')}</div>`;
  };

  // ---- targets ----
  const tgt = (f, label) => {
    const t = targets[f];
    const a = mon[f] || 0;
    if (t == null) return `<div class="tg"><div class="tg-h"><span>${label}</span><b>${a}</b></div><div class="tg-n">No target set</div></div>`;
    const p = t ? Math.min(100, Math.round((a / t) * 100)) : 0;
    return `<div class="tg"><div class="tg-h"><span>${label}</span><b>${a} <small>/ ${t}</small></b></div><div class="fn-t"><i style="width:${p}%;background:${p >= 100 ? 'var(--good)' : 'var(--orange)'}"></i></div><div class="tg-n">${p}% of this month’s target</div></div>`;
  };

  // ---- weekly chart (last 12 logged weeks) ----
  const last = weekRows.slice(-12);
  const chart = last.length
    ? (() => {
        const W = 560, H = 150, pl = 24, pb = 22, bw = (W - pl) / last.length;
        const max = Math.max(3, ...last.map((r) => Math.max(r.positive || 0, r.briefings || 0)));
        let g = '';
        for (let t = 0; t <= max; t += Math.max(1, Math.ceil(max / 4))) { const y = H - pb - (t / max) * (H - pb - 8); g += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="#eee2d3" stroke-dasharray="3 4"/><text x="0" y="${y + 3}" font-size="9" fill="#86786b">${t}</text>`; }
        last.forEach((r, i) => {
          const x = pl + i * bw;
          const h1 = ((r.positive || 0) / max) * (H - pb - 8), h2 = ((r.briefings || 0) / max) * (H - pb - 8);
          g += `<rect x="${x + bw * 0.12}" y="${H - pb - h1}" width="${bw * 0.34}" height="${h1}" rx="3" fill="#ffb000"><title>${weekLabel(r.key)}: ${r.positive || 0} positive replies</title></rect><rect x="${x + bw * 0.52}" y="${H - pb - h2}" width="${bw * 0.34}" height="${h2}" rx="3" fill="#2a2118"><title>${weekLabel(r.key)}: ${r.briefings || 0} briefings</title></rect><text x="${x + bw * 0.1}" y="${H - 6}" font-size="9" fill="#86786b">${weekLabel(r.key)}</text>`;
        });
        return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Positive replies and briefings per week">${g}</svg><div class="legend"><span><i class="dot" style="background:#ffb000"></i> Positive replies</span><span><i class="dot" style="background:#2a2118"></i> Briefings</span></div>`;
      })()
    : `<div class="empty"><b>No weeks logged yet</b>Log your first week below and the trend appears here.</div>`;

  // ---- plan ----
  const items = PLAN[site].flatMap((p) => p.items);
  const done = items.filter(([id]) => checklist[id]).length;

  const weekOptions = [];
  for (let i = 0; i < 12; i++) weekOptions.push(isoWeek(new Date(now.getTime() - i * 7 * 864e5)));

  const rateRow = (label, a, b, hint) => `<div class="rate"><span>${label}</span><b>${pct(a, b)}</b><small>${hint}</small></div>`;

  return `
  <div class="funnel-bar"><div class="seg">${['ventures', 'tech'].map((k) => `<button data-growtab="${k}" class="${k === site ? 'on' : ''}">${esc(siteName(k))}</button>`).join('')}</div>
    <a class="btn" href="${esc(sheetUrl)}" target="_blank" rel="noopener">Open ${esc(siteName(site))} sheet</a></div>

  <div class="grid g-kpi">
    <div class="card kpi hero"><div class="label">Briefings held (all time)</div><div class="val">${tot.briefings}</div><div class="note">${mon.briefings} this month · from your weekly log</div></div>
    <div class="card kpi"><div class="label">Positive replies</div><div class="val">${tot.positive}</div><div class="note">${pct(tot.positive, tot.sent)} of ${tot.sent} sent</div></div>
    <div class="card kpi"><div class="label">Qualified inbound</div><div class="val">${qualified.length}<small>of ${all.length}</small></div><div class="note">Live from the sheet · ${all.length ? Math.round(((tests + spam + excluded) / all.length) * 100) : 0}% filtered</div></div>
    <div class="card kpi"><div class="label">Diagnostics → mandates</div><div class="val">${tot.diagnostics}<small>→ ${tot.mandates}</small></div><div class="note">${pct(tot.mandates, tot.diagnostics)} close rate</div></div>
    <div class="card kpi"><div class="label">90-day plan</div><div class="val">${Math.round((done / items.length) * 100)}<small>%</small></div><div class="note">${done} of ${items.length} steps done</div></div>
  </div>

  <div class="grid g-2" style="margin-top:16px">
    <div class="card"><div class="card-h"><div><h3>Inbound funnel · live</h3><p class="sub">Read from the ${esc(siteName(site))} sheet right now</p></div></div>${bars(funnelIn)}
      ${staged.length ? `<div class="stage-row">${STAGES.map(([k, l]) => `<div><b>${stageCount(k)}</b><span>${l}</span></div>`).join('')}</div><p class="sub" style="margin-top:8px">Stage comes from the sheet’s Status column (${staged.length} of ${good.length} qualified leads have one).</p>`
        : `<div class="callout info" style="margin:14px 0 0"><span style="font-size:16px">ℹ</span><div><b>Track pipeline stage in the sheet.</b> Add a column named <code>Status</code> to the sheet and type New, Contacted, Briefing, Diagnostic, Mandate or Lost. It shows up here within a minute.</div></div>`}</div>
    <div class="card"><div class="card-h"><div><h3>Where inbound leads come from</h3><p class="sub">Region of everything that is not a test or solicitation</p></div></div>
      ${regionTotal ? `<div class="regbar">${Object.entries(regionCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<i style="width:${(n / regionTotal) * 100}%;background:${REGION_COLOR[k]}" title="${REGION[k]}: ${n}"></i>`).join('')}</div>
        <div class="hbars" style="margin-top:12px">${Object.entries(regionCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="hb"><span><i class="dot" style="background:${REGION_COLOR[k]}"></i> ${REGION[k]}</span><div class="t"><i style="width:${(n / regionTotal) * 100}%;background:${REGION_COLOR[k]}"></i></div><b>${n}</b></div>`).join('')}</div>
        <p class="sub" style="margin-top:10px">Region comes from the phone code, email domain or stated location. Most forms capture none of these, so “Unknown” stays high until a Country field is added.</p>`
        : `<div class="empty"><b>No leads yet</b></div>`}</div>
  </div>

  <div class="section-t">Outbound and social · from your weekly log</div>
  <div class="grid g-2">
    <div class="card"><div class="card-h"><div><h3>Outbound funnel</h3><p class="sub">${weekRows.length} week${weekRows.length === 1 ? '' : 's'} logged</p></div></div>${weekRows.length ? bars(funnelOut) : `<div class="empty"><b>Nothing logged yet</b>Outbound email, LinkedIn and posts have no automatic data source, so log each week below.</div>`}
      ${weekRows.length ? `<div class="rates">${rateRow('Reply rate', tot.replies, tot.sent, 'replies ÷ sent')}${rateRow('Positive-reply rate', tot.positive, tot.sent, 'positive ÷ sent')}${rateRow('Briefing rate', tot.briefings, tot.positive, 'briefings ÷ positive')}${rateRow('Diagnostic rate', tot.diagnostics, tot.briefings, 'diagnostics ÷ briefings')}</div>` : ''}</div>
    <div class="card"><div class="card-h"><div><h3>This month vs target</h3><p class="sub">Set targets after the day-35 baseline, not before</p></div></div>
      <div class="tgs">${tgt('positive', 'Positive replies')}${tgt('briefings', 'Briefings')}${tgt('diagnostics', 'Diagnostics')}</div>
      <div class="growth-form" style="margin-top:14px"><span class="lab" style="color:var(--gold)">Monthly targets</span><div class="gf-row">${[['positive', 'Positive replies'], ['briefings', 'Briefings'], ['diagnostics', 'Diagnostics']].map(([f, l]) => `<label>${l}<input type="number" min="0" step="1" data-target="${f}" value="${targets[f] ?? ''}" placeholder="—"></label>`).join('')}<button class="btn" id="saveTargets">Save targets</button></div></div>
      <div style="margin-top:14px">${chart}</div></div>
  </div>

  <div class="card growth-form" style="margin-top:16px"><div class="card-h"><div><h3>Log a week</h3><p class="sub">Enter the totals for the week. Saving the same week again replaces it.</p></div>
      <select class="input" id="weekSel" style="min-width:210px">${weekOptions.map((k) => `<option value="${k}" ${k === editKey ? 'selected' : ''}>${k}${k === thisWeek ? ' · this week' : ''} · from ${weekLabel(k)}${weeksObj[k] ? ' · logged' : ''}</option>`).join('')}</select></div>
    <div class="gf-grid">${FIELDS.map(([f, l]) => `<label>${l}<input type="number" min="0" step="1" data-week="${f}" value="${cur[f] ?? ''}" placeholder="0"></label>`).join('')}
      <label class="wide">Note (optional)<input type="text" maxlength="280" data-week="note" value="${esc(cur.note || '')}" placeholder="What worked, what didn’t"></label></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:12px"><button class="btn primary" id="saveWeek">Save week</button>${weeksObj[editKey] ? '<button class="btn" id="clearWeek">Clear this week</button>' : ''}<span class="muted" id="gfMsg" role="status"></span></div></div>

  ${weekRows.length ? `<div class="card" style="margin-top:16px"><div class="card-h"><div><h3>Weekly history</h3><p class="sub">Click a row to edit that week</p></div></div><div class="tbl-wrap"><table><thead><tr><th>Week</th>${FIELDS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Reply rate</th><th>Note</th></tr></thead><tbody>
    ${[...weekRows].reverse().map((r) => `<tr class="click" data-editweek="${r.key}"><td style="white-space:nowrap"><b>${r.key}</b><div class="sm">from ${weekLabel(r.key)}</div></td>${FIELDS.map(([f]) => `<td>${r[f] || 0}</td>`).join('')}<td>${pct(r.replies, r.sent)}</td><td><div class="clip" style="max-width:220px">${esc(r.note || '')}</div></td></tr>`).join('')}</tbody></table></div></div>` : ''}

  <div class="section-t">90-day plan · ${done} of ${items.length} done</div>
  <div class="grid g-3">${PLAN[site].map((p) => `<div class="card"><h3 style="margin-bottom:10px">${esc(p.phase)}</h3><div class="checks">${p.items.map(([id, label]) => `<label class="ck ${checklist[id] ? 'done' : ''}"><input type="checkbox" data-check="${id}" ${checklist[id] ? 'checked' : ''}><span>${esc(label)}${checklist[id] ? `<small>done ${esc(checklist[id])}</small>` : ''}</span></label>`).join('')}</div></div>`).join('')}</div>`;
}

// ---- events (delegated; app.js calls this once) ----
export function bindGrowth(ctx) {
  const { S, api, render, toast } = ctx;
  const post = async (payload) => {
    const r = await fetch('/api/growth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Save failed (${r.status})`);
    S.growth = j;
    return j;
  };
  const say = (msg, bad) => { const m = document.getElementById('gfMsg'); if (m) { m.textContent = msg; m.style.color = bad ? 'var(--bad)' : 'var(--good)'; } else toast(msg); };

  document.addEventListener('click', async (e) => {
    const site = growthSite(S);
    const tab = e.target.closest('[data-growtab]');
    if (tab) { location.hash = `#/growth/${tab.dataset.growtab}`; return; }
    const row = e.target.closest('[data-editweek]');
    if (row) { S.growWeek = row.dataset.editweek; render(); document.querySelector('.growth-form')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (e.target.id === 'saveWeek') {
      const values = {};
      document.querySelectorAll('[data-week]').forEach((el) => { values[el.dataset.week] = el.value; });
      e.target.disabled = true;
      try { await post({ type: 'week', site, key: S.growWeek || isoWeek(), values }); render(); say('Saved', false); toast('Week saved'); }
      catch (err) { say(err.message, true); }
      finally { const b = document.getElementById('saveWeek'); if (b) b.disabled = false; }
    }
    if (e.target.id === 'clearWeek') {
      if (!confirm(`Remove everything logged for ${S.growWeek || isoWeek()}?`)) return;
      try { await post({ type: 'clearWeek', site, key: S.growWeek || isoWeek() }); render(); toast('Week cleared'); }
      catch (err) { toast(err.message); }
    }
    if (e.target.id === 'saveTargets') {
      const targets = {};
      document.querySelectorAll('[data-target]').forEach((el) => { targets[el.dataset.target] = el.value; });
      try { await post({ type: 'targets', site, targets }); render(); toast('Targets saved'); }
      catch (err) { toast(err.message); }
    }
  });
  document.addEventListener('change', async (e) => {
    const site = growthSite(S);
    if (e.target.id === 'weekSel') { S.growWeek = e.target.value; render(); return; }
    if (e.target.dataset?.check) {
      const box = e.target;
      try { await post({ type: 'check', site, id: box.dataset.check, done: box.checked }); render(); }
      catch (err) { box.checked = !box.checked; toast(err.message); }
    }
  });
}

export async function loadGrowth(ctx) {
  try { ctx.S.growth = await ctx.api('/api/growth'); } catch { ctx.S.growth = ctx.S.growth || { weeks: {}, targets: {}, checklist: {} }; }
}
