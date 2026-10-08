import { parseCsv } from './csv.js';
import { SITES, LEADS_TTL_MS } from './config.js';

const ALIASES = {
  submittedAt: ['submitted at', 'timestamp', 'date'],
  name: ['name', 'full name'],
  email: ['email', 'email address'],
  phone: ['phone', 'phone & country', 'phone number'],
  company: ['company', 'organisation', 'organization'],
  role: ['role'],
  industry: ['industry'],
  goal: ['goal'],
  building: ['currently working on', 'building'],
  budget: ['budget'],
  start: ['start when', 'start'],
  deliver: ['deliver when', 'delivery'],
  funding: ['raised investment', 'funding'],
  fundingAmount: ['investment amount'],
  engagement: ['engagement model', 'engagement'],
  interest: ['area of interest'],
  link: ['resume / linkedin'],
  details: ['focus / problem', 'details'],
  notes: ['additional notes'],
  message: ['message'],
  companyInQuestion: ['company in question'],
  source: ['source'],
};

const FREE_MAIL = /@(gmail|googlemail|yahoo|outlook|hotmail|live|msn|icloud|me|aol|proton|protonmail|gmx|mail|zoho|yandex)\./i;
const TEST_RE = /\b(test|testing|verify|verification|redeploy|wiring|ignore|curl)\b/i;
const SPAM_RE = new RegExp(
  [
    'first .{0,12}\\d+ leads', 'list of your', 'free (trial|audit|quote|consultation)', 'seo (services|expert|audit)',
    'guest post', 'backlink', 'rank (your )?(website|site)', 'increase your (traffic|sales|revenue)',
    'web ?(site)? (design|development) (services|company)', 'whatsapp number', 'authorized resellers', 'vendors? and',
    'procurement', 'our (platform|agency|team) (can|will|offers?)', 'we (can|would like to) (offer|help you)',
    'lead generation', 'appointment setting', 'cold (email|outreach)',
    '(attendee|email|mailing|contact|prospect) list', 'targeted (list|audience|database)', 'database of', '[\\d,]{4,}\\+? (contacts|emails|decision.?makers|leads)',
    'more details on the audience', 'b2b (data|leads|contacts)',
  ].join('|'),
  'i'
);

const clean = (v) => (v ?? '').toString().replace(/\s+/g, ' ').trim();

// "$100K – $250K" -> {min,max,mid}; "Under $50K"; "$1M+"
function money(str) {
  const nums = [...clean(str).matchAll(/\$?\s*([\d.,]+)\s*([kKmM])?/g)]
    .map((m) => {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (!isFinite(n)) return null;
      return m[2] ? n * (/m/i.test(m[2]) ? 1e6 : 1e3) : n;
    })
    .filter((n) => n && n >= 1000);
  if (!nums.length) return null;
  const min = Math.min(...nums), max = Math.max(...nums);
  return { min, max, mid: nums.length > 1 ? (min + max) / 2 : /under|<|less/i.test(str) ? min / 2 : min };
}

function validPhone(p) {
  const d = clean(p).replace(/\D/g, '');
  return d.length >= 7 && !/#ERROR/i.test(p);
}

function scoreLead(l) {
  let s = 0;
  if (l.kind === 'project') {
    const b = money(l.budget);
    if (b) s += b.mid >= 250e3 ? 35 : b.mid >= 100e3 ? 30 : b.mid >= 50e3 ? 22 : 12;
    if (/now|asap|within a month|immediate|this month/i.test(l.start)) s += 15;
    else if (l.start) s += 6;
    if (/^(yes|raised)/i.test(l.funding)) s += 10;
    if (l.businessEmail) s += 10;
    if (l.phoneValid) s += 5;
    if (l.message.length > 120) s += 10;
    else if (l.message.length > 40) s += 5;
    if (l.industry) s += 5;
    if (l.engagement) s += 5;
    if (l.building) s += 5;
  } else if (l.kind === 'contact') {
    if (l.businessEmail) s += 35;
    if (l.company && !/^n\/?a$/i.test(l.company)) s += 15;
    if (l.message.length > 150) s += 20;
    else if (l.message.length > 50) s += 10;
    if (/\b(pe|private equity|fund|sponsor|investor|ceo|founder|cto|cfo|partner|director)\b/i.test(`${l.role} ${l.company}`)) s += 25;
    if (l.phoneValid) s += 5;
  } else {
    s = l.businessEmail ? 50 : 35;
    if (l.link) s += 25;
    if (l.message.length > 40) s += 10;
  }
  return Math.min(100, s);
}

// ICP geography: everywhere EXCEPT India and Nigeria. Detected from phone code, email TLD, and stated location.
const EXCLUDED_PLACES = 'india|nigeria|lagos|abuja|mumbai|bangalore|bengaluru|hyderabad|delhi|noida|gurgaon|gurugram|pune|chennai|kolkata|ahmedabad|port harcourt|ibadan|kano';
const PLACE_RE = new RegExp('\\b(' + EXCLUDED_PLACES + ')\\b', 'i');
const STATED_RE = new RegExp('\\b(based|located|headquartered|hq|office|offices|we are|we\'re|from)\\s+(in|at)?\\s*(' + EXCLUDED_PLACES + ')\\b', 'i');
export function detectExcludedGeo(l, rawPhone) {
  const d = String(rawPhone || '').replace(/\D/g, '');
  const plus = /^\s*(\+|00)/.test(rawPhone || '');
  if (plus && d.startsWith('91') && d.length === 12) return ['IN', 'phone +91'];
  if (plus && d.startsWith('234') && d.length >= 13 && d.length <= 14) return ['NG', 'phone +234'];
  if (!plus && d.startsWith('91') && d.length === 12) return ['IN', 'phone 91…'];
  if (!plus && d.startsWith('234') && d.length === 13) return ['NG', 'phone 234…'];
  const dom = (l.email.split('@')[1] || '').toLowerCase();
  if (/\.in$/.test(dom)) return ['IN', 'email domain .in'];
  if (/\.ng$/.test(dom)) return ['NG', 'email domain .ng'];
  const field = `${l.company} ${l.role} ${l.industry}`;
  const m = field.match(PLACE_RE) || l.fullMessage.match(STATED_RE);
  if (m) { const w = (m[3] || m[1]).toLowerCase(); return [/nigeria|lagos|abuja|port harcourt|ibadan|kano/.test(w) ? 'NG' : 'IN', 'stated location: ' + w]; }
  return null;
}

function normalise(raw, site, tab, idx) {
  const find = (key) => ALIASES[key].find((a) => raw[a] !== undefined && clean(raw[a]));
  const get = (key) => {
    const a = find(key);
    return a ? clean(raw[a]) : '';
  };
  const getLong = (key) => {
    const a = find(key);
    return a ? String(raw[a]).trim() : '';
  };
  const l = {
    id: `${site.key}-${tab.gid}-${idx}`,
    site: site.key,
    siteName: site.name,
    tab: tab.name,
    kind: tab.kind,
    kindLabel: tab.kind === 'project' ? 'Project enquiry' : tab.kind === 'application' ? 'Career application' : 'Contact',
    submittedAt: get('submittedAt'),
    name: get('name'),
    email: get('email').toLowerCase(),
    phone: get('phone'),
    company: get('company') || get('companyInQuestion'),
    role: get('role'),
    industry: get('industry'),
    goal: get('goal'),
    building: get('building'),
    budget: get('budget'),
    start: get('start'),
    deliver: get('deliver'),
    funding: [get('funding'), get('fundingAmount')].filter(Boolean).join(' · '),
    engagement: get('engagement'),
    interest: get('interest'),
    link: get('link'),
    source: get('source'),
  };
  l.message = get('message') || get('details') || get('notes');
  l.fullMessage = (getLong('message') || getLong('details') || getLong('notes')).slice(0, 4000);
  const rawPhone = l.phone;
  l.phoneError = /#ERROR/i.test(l.phone);
  l.phoneValid = validPhone(l.phone);
  if (l.phoneError) l.phone = '';
  const t = Date.parse(l.submittedAt);
  l.ts = isFinite(t) ? t : 0;
  l.businessEmail = !!l.email && !FREE_MAIL.test(l.email);

  const flags = [];
  const geo = detectExcludedGeo(l, rawPhone);
  if (geo) { l.geo = geo[0]; l.geoReason = geo[1]; }
  const blob = `${l.name} ${l.company} ${l.message} ${l.source}`;
  if (/@napkin\.ie$/i.test(l.email) || TEST_RE.test(blob)) flags.push('test');
  else if (SPAM_RE.test(l.message) || SPAM_RE.test(l.company)) flags.push('solicitation');
  else if (geo) flags.push('geo');
  l.flags = flags;
  l.score = scoreLead(l);
  l.tier = flags.length ? 'filtered' : l.score >= 70 ? 'hot' : l.score >= 45 ? 'warm' : 'cold';
  const b = money(l.budget);
  l.budgetMid = b ? b.mid : 0;
  return l;
}

async function fetchTab(site, tab) {
  if (!site.sheetId) throw new Error(`Sheet ID not configured (set SHEET_ID_${site.key.toUpperCase()})`);
  const url = `https://docs.google.com/spreadsheets/d/${site.sheetId}/export?format=csv&gid=${tab.gid}`;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'dayone-dashboard/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Sheet is not shared (got a login page). Set sharing to "Anyone with the link: Viewer".');
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => clean(h).toLowerCase());
  return rows.slice(1).map((r, i) => {
    const raw = {};
    header.forEach((h, c) => {
      if (h) raw[h] = r[c] ?? '';
    });
    return normalise(raw, site, tab, i);
  }).filter((l) => l.name || l.email || l.message);
}

let cache = null;
export async function getLeads(force = false) {
  if (!force && cache && Date.now() - cache.at < LEADS_TTL_MS) return cache.data;
  const sources = [];
  const leads = [];
  await Promise.all(
    Object.values(SITES).flatMap((site) =>
      site.tabs.map(async (tab) => {
        const src = { site: site.key, tab: tab.name, kind: tab.kind, rows: 0, ok: true, error: null };
        try {
          const rows = await fetchTab(site, tab);
          src.rows = rows.length;
          leads.push(...rows);
        } catch (e) {
          src.ok = false;
          src.error = e.message;
        }
        sources.push(src);
      })
    )
  );
  leads.sort((a, b) => b.ts - a.ts);
  sources.sort((a, b) => a.site.localeCompare(b.site) || a.tab.localeCompare(b.tab));
  // If every tab failed but we hold an older good copy, serve it flagged as stale.
  if (!leads.length && sources.every((s) => !s.ok) && cache) return { ...cache.data, stale: true, sources };
  const data = { fetchedAt: new Date().toISOString(), sources, leads };
  cache = { at: Date.now(), data };
  return data;
}
