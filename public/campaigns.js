// Email campaigns: sends, replies, bounces and reply sentiment per mailbox, read from the Apps Script feed.
const DAY = 864e5;
const C = { data: null, error: null, busy: false, range: 30, mailbox: 'all', camp: 'all', status: 'all', q: '' };
const STATUS = {
  replied: ['Replied', 'good'], awaiting: ['No reply yet', ''], bounced: ['Bounced', 'bad'], auto: ['Auto-reply only', 'warn'],
};
const SENT = { positive: ['Positive', 'good'], negative: ['Not interested', 'bad'], neutral: ['Neutral', ''] };
const FOLLOW_UP_AFTER_DAYS = 3;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '—');
const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const hrs = (h) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);
const gmailLink = (c) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(c.mailbox)}#all/${encodeURIComponent(c.threadId)}`;

export async function loadCampaigns(ctx, force = false) {
  C.busy = true; ctx.render();
  try { C.data = await ctx.api(`/api/campaigns${force ? '?refresh=1' : ''}`); C.error = null; } catch (e) { C.error = e.message; }
  C.busy = false; ctx.render();
}

function scope() {
  const d = C.data;
  const since = C.range ? Date.now() - C.range * DAY : 0;
  const contacts = d.contacts.filter((c) => (C.mailbox === 'all' || c.mailbox === C.mailbox) && (C.camp === 'all' || c.campaignId === C.camp) && Date.parse(c.sentAt) >= since);
  return { contacts, campaigns: d.campaigns.filter((c) => C.mailbox === 'all' || c.mailbox === C.mailbox) };
}

function totals(list) {
  const replied = list.filter((c) => c.status === 'replied');
  const bounced = list.filter((c) => c.status === 'bounced').length;
  const delivered = list.length - bounced;
  return {
    sent: list.length, followUps: list.reduce((s, c) => s + (c.followUps || 0), 0), delivered, bounced,
    replied: replied.length, positive: replied.filter((c) => c.sentiment === 'positive').length, negative: replied.filter((c) => c.sentiment === 'negative').length,
    auto: list.filter((c) => c.autoReply).length,
    due: list.filter((c) => c.status === 'awaiting' && Date.now() - Date.parse(c.sentAt) > FOLLOW_UP_AFTER_DAYS * DAY).length,
    medianH: median(replied.map((c) => c.replyHours).filter((h) => h != null)),
  };
}

function chart(list, days) {
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const n = Math.min(days || 90, 90);
  const b = Array.from({ length: n }, (_, i) => ({ d: new Date(end.getTime() - (n - 1 - i) * DAY), sent: 0, rep: 0 }));
  const idx = (ts) => n - 1 - Math.floor((end.getTime() + DAY - ts) / DAY);
  for (const c of list) {
    const i = idx(Date.parse(c.sentAt)); if (i >= 0 && i < n) b[i].sent++;
    if (c.repliedAt) { const j = idx(Date.parse(c.repliedAt)); if (j >= 0 && j < n) b[j].rep++; }
  }
  const max = Math.max(3, ...b.map((x) => Math.max(x.sent, x.rep)));
  const W = 760, H = 210, pl = 28, pb = 26, bw = (W - pl) / n, h = (v) => (v / max) * (H - pb - 10);
  let s = '';
  for (let t = 0; t <= max; t += Math.max(1, Math.ceil(max / 4))) { const y = H - pb - h(t); s += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="#eee2d3" stroke-dasharray="3 4"/><text x="0" y="${y + 4}" font-size="10" fill="#86786b">${t}</text>`; }
  const step = Math.ceil(n / 7);
  b.forEach((x, i) => {
    const label = x.d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const x0 = pl + i * bw + bw * 0.12, w = bw * 0.38;
    if (x.sent) s += `<rect x="${x0}" y="${H - pb - h(x.sent)}" width="${w}" height="${h(x.sent)}" rx="${Math.min(3, w / 2)}" fill="#2a2118"><title>${label}: ${x.sent} sent</title></rect>`;
    if (x.rep) s += `<rect x="${x0 + w}" y="${H - pb - h(x.rep)}" width="${w}" height="${h(x.rep)}" rx="${Math.min(3, w / 2)}" fill="#ff7a00"><title>${label}: ${x.rep} replies</title></rect>`;
    if (i % step === 0) s += `<text x="${pl + i * bw}" y="${H - 6}" font-size="10" fill="#86786b">${label}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Emails sent and replies per day">${s}</svg>`;
}

function setupCard(esc) {
  return `<div class="card"><div class="card-h"><div><h3>Connect a mailbox</h3><p class="sub">Tracks outreach sent from a Gmail / Google Workspace mailbox, e.g. kim@dayoneventurepartners.com</p></div></div>
    <ol style="margin:0;padding-left:20px;line-height:1.7">
      <li>Signed in as the mailbox owner, open <a href="https://script.google.com" target="_blank" rel="noopener" style="color:var(--orange)">script.google.com</a> → New project, and paste in <code>apps-script/campaigns.gs</code> from this repo.</li>
      <li>Project Settings → Script Properties → add <code>FEED_KEY</code> with a long random value.</li>
      <li>Run <code>setup</code> once and approve read access to Gmail and Drive. It builds the first snapshot and refreshes it every 15 minutes.</li>
      <li>Deploy → New deployment → Web app · Execute as <b>Me</b> · Access <b>Anyone</b>. Copy the <code>/exec</code> URL.</li>
      <li>Set <code>CAMPAIGN_FEEDS</code> to <code>&lt;exec URL&gt;?key=&lt;FEED_KEY&gt;</code> in Vercel (comma-separate several mailboxes) and redeploy.</li>
    </ol>
    <div class="callout info" style="margin-top:14px"><span style="font-size:18px">ℹ</span><div>To name campaigns, label the sent threads in Gmail under <b>Campaign/</b> (for example <i>Campaign/PE operating partners</i>). Unlabelled outreach is grouped by subject line.</div></div></div>`;
}

export function viewCampaigns(ctx) {
  const { esc } = ctx;
  if (C.error && !C.data) return `<div class="callout bad">Could not load campaigns: ${esc(C.error)}</div>`;
  if (!C.data) return `<div class="grid g-kpi">${'<div class="skeleton" style="height:110px"></div>'.repeat(4)}</div>`;
  const d = C.data;
  if (!d.configured) return setupCard(esc);

  const bad = d.feeds.filter((f) => !f.ok);
  const errors = bad.map((f) => `<div class="callout bad" style="margin-bottom:12px">${esc(f.label)}: ${esc(f.error)}</div>`).join('');
  const trunc = d.feeds.filter((f) => f.truncated).map((f) => `<div class="callout info" style="margin-bottom:12px">${esc(f.mailbox)}: hit the thread cap, so the oldest outreach is missing. Raise <code>maxThreads</code> or lower <code>days</code> in the script.</div>`).join('');
  const mailboxes = d.feeds.filter((f) => f.ok).map((f) => f.mailbox);
  if (!mailboxes.length) return errors || setupCard(esc);

  const { contacts, campaigns } = scope();
  const t = totals(contacts);
  const campName = (id) => campaigns.find((c) => c.id === id)?.name || '—';

  const controls = `<div class="filters" style="margin-bottom:16px">
    ${mailboxes.length > 1 ? `<div class="seg small">${[['all', 'All mailboxes'], ...mailboxes.map((m) => [m, m.split('@')[0]])].map(([k, l]) => `<button data-cmailbox="${esc(k)}" class="${C.mailbox === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>` : `<span class="chip">${esc(mailboxes[0])}</span>`}
    <div class="seg small">${[[7, '7d'], [30, '30d'], [90, '90d'], [0, 'All']].map(([n, l]) => `<button data-crange="${n}" class="${C.range === n ? 'on' : ''}">${l}</button>`).join('')}</div>
    <select class="input" id="campSel" style="max-width:340px"><option value="all">All campaigns</option>${campaigns.map((c) => `<option value="${esc(c.id)}" ${C.camp === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <span class="muted" style="font-size:12px;margin-left:auto">Mailbox snapshot ${esc(ctx.ago(Date.parse(d.feeds.find((f) => f.ok).generatedAt)))}</span>
    <button class="btn ${C.busy ? 'spin' : ''}" id="campRefresh"><i data-i="refresh"></i><span>Refresh</span></button></div>`;

  const kpis = `<div class="grid g-kpi">
    <div class="card kpi hero"><div class="label">Emails sent</div><div class="val">${t.sent}<small>+ ${t.followUps} follow-up${t.followUps === 1 ? '' : 's'}</small></div><div class="note">${t.delivered} delivered · ${C.range ? `last ${C.range} days` : 'all time'}</div></div>
    <div class="card kpi"><div class="label">Reply rate</div><div class="val">${pct(t.replied, t.delivered)}</div><div class="note">${t.replied} human repl${t.replied === 1 ? 'y' : 'ies'} (auto-replies excluded)</div></div>
    <div class="card kpi"><div class="label">Positive replies</div><div class="val" style="color:var(--good)">${t.positive}</div><div class="note">${pct(t.positive, t.delivered)} of delivered · ${t.negative} not interested</div></div>
    <div class="card kpi"><div class="label">Bounce rate</div><div class="val" style="color:${t.sent && t.bounced / t.sent > 0.03 ? 'var(--bad)' : 'inherit'}">${pct(t.bounced, t.sent)}</div><div class="note">${t.bounced} bounced${t.sent && t.bounced / t.sent > 0.03 ? ' · above 3%, clean the list' : ''}</div></div>
    <div class="card kpi"><div class="label">Follow-up due</div><div class="val">${t.due}</div><div class="note">No reply after ${FOLLOW_UP_AFTER_DAYS}+ days</div></div>
    <div class="card kpi"><div class="label">Time to reply</div><div class="val">${hrs(t.medianH)}</div><div class="note">Median · ${t.auto} out-of-office / auto-replies</div></div>
  </div>`;

  const chartCard = `<div class="card"><div class="card-h"><div><h3>Sent vs replies</h3><p class="sub">First-touch emails sent and replies received per day</p></div></div>
    ${chart(contacts, C.range || 90)}
    <div style="display:flex;gap:16px;font-size:12px;margin-top:6px;color:var(--muted)"><span><i class="dot" style="background:#2a2118"></i> Sent</span><span><i class="dot" style="background:#ff7a00"></i> Replies</span></div></div>`;

  const repliedList = contacts.filter((c) => c.status === 'replied');
  const byDay = WEEKDAYS.map((w, i) => {
    const sent = contacts.filter((c) => c.status !== 'bounced' && new Date(c.sentAt).getDay() === i);
    return [w, sent.length, sent.filter((c) => c.status === 'replied').length];
  }).filter(([, n]) => n);
  const maxRate = Math.max(0.0001, ...byDay.map(([, n, r]) => r / n));
  const dayCard = `<div class="card"><div class="card-h"><div><h3>Reply rate by send day</h3><p class="sub">Which weekday's sends get answered</p></div></div>
    ${byDay.length ? `<div class="hbars">${byDay.map(([w, n, r]) => `<div class="hb"><span>${w}</span><div class="t"><i style="width:${(r / n / maxRate) * 100}%"></i></div><b title="${r} of ${n}">${pct(r, n)}</b></div>`).join('')}</div>` : '<div class="empty">No sends in this range</div>'}
    ${repliedList.length ? `<h3 style="margin:18px 0 8px;font-size:13px">Reply sentiment</h3><div class="hbars">${['positive', 'neutral', 'negative'].map((k) => { const n = repliedList.filter((c) => c.sentiment === k).length; return `<div class="hb"><span>${SENT[k][0]}</span><div class="t"><i style="width:${(n / repliedList.length) * 100}%;background:${k === 'positive' ? 'var(--good)' : k === 'negative' ? 'var(--bad)' : '#b8a28a'}"></i></div><b>${n}</b></div>`; }).join('')}</div>` : ''}</div>`;

  const campRows = campaigns.map((c) => ({ c, t: totals(contacts.filter((x) => x.campaignId === c.id)) })).filter((r) => r.t.sent).sort((a, b) => b.t.sent - a.t.sent);
  const campTable = `<div class="card"><div class="card-h"><div><h3>Campaigns</h3><p class="sub">Gmail labels under Campaign/, otherwise grouped by subject line · click to filter</p></div></div>
    ${campRows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Campaign</th><th>Sent</th><th>Follow-ups</th><th>Replied</th><th>Reply rate</th><th>Positive</th><th>Not interested</th><th>Bounced</th><th>Due</th><th>Last sent</th></tr></thead><tbody>
      ${campRows.map(({ c, t: x }) => `<tr class="click" data-camp="${esc(c.id)}"><td><div class="who">${esc(c.name)}</div><div class="sm">${c.source === 'label' ? 'Gmail label' : 'Subject line'}${mailboxes.length > 1 ? ' · ' + esc(c.mailbox) : ''}</div></td>
        <td>${x.sent}</td><td>${x.followUps}</td><td>${x.replied}</td><td><b>${pct(x.replied, x.delivered)}</b></td><td>${x.positive}</td><td>${x.negative}</td>
        <td>${x.bounced ? `<span class="chip ${x.bounced / x.sent > 0.03 ? 'bad' : ''}">${x.bounced}</span>` : '0'}</td><td>${x.due}</td><td style="white-space:nowrap">${esc(ctx.ago(Date.parse(c.lastSent)))}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><b>No outreach in this range</b>Widen the date range.</div>'}</div>`;

  const q = C.q.toLowerCase();
  const rows = contacts.filter((c) =>
    (C.status === 'all' || (C.status === 'due' ? c.status === 'awaiting' && Date.now() - Date.parse(c.sentAt) > FOLLOW_UP_AFTER_DAYS * DAY : ['positive', 'negative'].includes(C.status) ? c.sentiment === C.status : c.status === C.status)) &&
    (!q || `${c.name} ${c.email} ${c.domain} ${c.subject} ${c.snippet}`.toLowerCase().includes(q)));
  const shown = rows.slice(0, 300);
  const table = `<div class="card"><div class="card-h"><div><h3>Recipients &amp; responses</h3><p class="sub">${rows.length} recipient${rows.length === 1 ? '' : 's'}${rows.length > shown.length ? `, showing the latest ${shown.length}` : ''} · newest activity first</p></div><button class="btn" id="campExport">Export CSV</button></div>
    <div class="filters">
      <input class="input" id="campQ" placeholder="Search name, email, company, reply…" value="${esc(C.q)}">
      <div class="seg small">${[['all', 'All'], ['replied', 'Replied'], ['positive', 'Positive'], ['negative', 'Not interested'], ['due', 'Follow-up due'], ['bounced', 'Bounced'], ['auto', 'Auto-reply']].map(([k, l]) => `<button data-cstatus="${k}" class="${C.status === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    ${shown.length ? `<div class="tbl-wrap"><table><thead><tr><th>Recipient</th><th>Campaign</th><th>Sent</th><th>Status</th><th>Reply</th><th></th></tr></thead><tbody>
      ${shown.map((c) => `<tr><td><div class="who">${esc(c.name || c.email)}</div><div class="sm">${esc(c.name ? c.email : c.domain)}</div></td>
        <td><div class="clip" style="max-width:220px">${esc(campName(c.campaignId))}</div></td>
        <td style="white-space:nowrap">${esc(ctx.ago(Date.parse(c.sentAt)))}<div class="sm">${c.followUps ? `+${c.followUps} follow-up${c.followUps > 1 ? 's' : ''}` : 'no follow-up'}</div></td>
        <td><span class="chip ${STATUS[c.status][1]}">${STATUS[c.status][0]}</span>${c.sentiment ? `<div class="sm"><span class="chip ${SENT[c.sentiment][1]}" style="margin-top:4px">${SENT[c.sentiment][0]}</span></div>` : ''}</td>
        <td>${c.repliedAt ? `<div class="clip" style="max-width:360px" title="${esc(c.snippet)}">${esc(c.snippet || '(no text)')}</div><div class="sm">after ${hrs(c.replyHours)}${c.replyFrom && c.replyFrom !== c.email ? ` · from ${esc(c.replyFrom)}` : ''}</div>` : '<span class="muted">—</span>'}</td>
        <td><a class="chip" href="${esc(gmailLink(c))}" target="_blank" rel="noopener">Open in Gmail</a></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><b>No recipients match</b>Try another filter.</div>'}</div>`;

  const note = `<div class="callout info" style="margin-top:16px"><span style="font-size:18px">ℹ</span><div><b>Opens and clicks are not shown.</b> Gmail does not record them; they need a tracking tool (Mailmeteor, GMass, Instantly and similar). Sentiment is a keyword guess, so check replies before acting on them.</div></div>`;

  return `${errors}${trunc}${controls}${kpis}<div class="grid g-21" style="margin-top:16px">${chartCard}${dayCard}</div>
    <div style="margin-top:16px">${campTable}</div><div style="margin-top:16px">${table}</div>${note}`;
}

function exportCsv() {
  const { contacts, campaigns } = scope();
  const name = (id) => campaigns.find((c) => c.id === id)?.name || '';
  const cols = [['mailbox', (c) => c.mailbox], ['campaign', (c) => name(c.campaignId)], ['name', (c) => c.name], ['email', (c) => c.email], ['subject', (c) => c.subject], ['sentAt', (c) => c.sentAt], ['followUps', (c) => c.followUps], ['status', (c) => c.status], ['sentiment', (c) => c.sentiment], ['repliedAt', (c) => c.repliedAt], ['replyHours', (c) => c.replyHours], ['reply', (c) => c.snippet]];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(([k]) => k).join(','), ...contacts.map((c) => cols.map(([, f]) => q(f(c))).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `dayone-email-campaigns-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

export function bindCampaigns(ctx) {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cmailbox],[data-crange],[data-cstatus],[data-camp],#campRefresh,#campExport');
    if (!t) return;
    if (t.dataset.cmailbox) { C.mailbox = t.dataset.cmailbox; C.camp = 'all'; }
    else if (t.dataset.crange) C.range = +t.dataset.crange;
    else if (t.dataset.cstatus) C.status = t.dataset.cstatus;
    else if (t.dataset.camp) { C.camp = C.camp === t.dataset.camp ? 'all' : t.dataset.camp; }
    else if (t.id === 'campRefresh') return loadCampaigns(ctx, true);
    else if (t.id === 'campExport') return exportCsv();
    ctx.render();
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'campSel') { C.camp = e.target.value; ctx.render(); } });
  document.addEventListener('input', (e) => { if (e.target.id === 'campQ') { C.q = e.target.value; ctx.render(); } });
}

export const campaignSubtitle = () => (C.data?.configured ? `${C.data.contacts.length} outreach threads tracked across ${C.data.feeds.filter((f) => f.ok).length} mailbox${C.data.feeds.filter((f) => f.ok).length === 1 ? '' : 'es'}` : 'Sends, replies and bounces from your Gmail outreach');
