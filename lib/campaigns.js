// Email campaign stats, read from one Apps Script feed per mailbox (see apps-script/campaigns.gs).
// CAMPAIGN_FEEDS = comma-separated feed URLs, each including its ?key=. The URLs are secrets.
const FEEDS = (process.env.CAMPAIGN_FEEDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const TTL_MS = 5 * 60_000;   // the feed itself refreshes every 15 minutes
let cache = null;

async function fetchFeed(url, i) {
  const label = `Mailbox ${i + 1}`;
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    let d;
    try { d = JSON.parse(text); } catch { throw new Error('Feed did not return JSON (check the deployment is "Anyone" and the URL ends in /exec)'); }
    if (!d.ok) throw new Error(d.error === 'unauthorised' ? 'Feed key rejected (check ?key= matches FEED_KEY)' : d.error || 'Feed error');
    return { ...d, label };
  } catch (e) {
    return { ok: false, label, error: e.name === 'TimeoutError' ? 'Feed timed out' : e.message };
  }
}

export async function getCampaigns(force = false) {
  if (!FEEDS.length) return { configured: false, feeds: [], campaigns: [], contacts: [], daily: [] };
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const feeds = await Promise.all(FEEDS.map(fetchFeed));
  const campaigns = [], contacts = [];
  const daily = new Map();
  for (const f of feeds) {
    if (!f.ok) continue;
    const mb = f.mailbox;
    for (const c of f.campaigns || []) campaigns.push({ ...c, id: `${mb}|${c.id}`, mailbox: mb });
    for (const c of f.contacts || []) contacts.push({ ...c, campaignId: `${mb}|${c.campaignId}`, mailbox: mb, id: `${mb}|${c.threadId}` });
    for (const d of f.daily || []) {
      const key = `${mb}|${d.d}`;
      daily.set(key, { ...d, mailbox: mb });
    }
  }
  contacts.sort((a, b) => Date.parse(b.repliedAt || b.sentAt) - Date.parse(a.repliedAt || a.sentAt));
  const data = {
    configured: true,
    fetchedAt: new Date().toISOString(),
    feeds: feeds.map((f) => ({ ok: f.ok, label: f.label, mailbox: f.mailbox || null, error: f.error || null, generatedAt: f.generatedAt || null, windowDays: f.windowDays || null, truncated: !!f.truncated })),
    campaigns, contacts, daily: [...daily.values()],
  };
  // Keep the last good data if every feed failed this time.
  if (feeds.some((f) => f.ok) || !cache) cache = { at: Date.now(), data };
  else cache.data = { ...cache.data, feeds: data.feeds };
  return cache.data;
}
