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
  status: ['status', 'stage', 'pipeline stage', 'lead status'],
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
    // bulk-marketing tells
    'reply (yes|stop)', 'respond with stop', 'stop to opt', 'opt[- ]?out', 'unsubscribe', 'first \\d+ days (are )?free', 'complimentary',
    'feature you in', 'upcoming edition', 'participation fee', 'magazine', 'most trusted', 'companies to watch',
    'virtual assistant', '\\bVAs?\\b', 'trained VA', 'looking for help with admin', 'cleaning bid', 'janitorial',
    'interest in purchasing your products', 'sales representative to contact us', 'explore a potential business relationship',
  ].join('|'),
  'i'
);

const RELEVANT_RE = /\b(private equity|portfolio|sponsor|operating partner|software|saas|arr|ebitda|platform|data|\bai\b|machine learning|digital|transformation|engineering|product|roadmap|cto|cio|cfo|fund|acquisition|diligence|exit|value creation|retention|go-to-market|margin|build|migration|modernis|moderniz)\b/i;
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
    // A contact-form lead with no sign it is about what we sell cannot be hot or warm.
    if (!RELEVANT_RE.test(`${l.message} ${l.role} ${l.company} ${l.industry}`)) s = Math.min(s, 40);
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

// Region for the US + Europe targeting plan. Phone code is the strongest signal; bare 10-digit numbers are ambiguous and stay unknown.
const EU_CODES = ['353', '358', '351', '352', '356', '357', '354', '359', '385', '386', '370', '371', '372', '420', '421', '44', '49', '33', '31', '32', '46', '45', '47', '41', '43', '34', '39', '48', '36', '30', '40'];
const EU_TLD = /\.(uk|de|fr|nl|se|dk|no|fi|ie|ch|es|it|be|at|pl|pt|cz|hu|gr|ro|lu|eu)$/i;
const US_PLACES = 'united states|usa|u\\.s\\.|new york|boston|chicago|texas|dallas|austin|houston|california|san francisco|los angeles|atlanta|philadelphia|new jersey|seattle|denver|miami|washington dc';
const EU_PLACES = 'united kingdom|london|germany|berlin|munich|frankfurt|paris|france|amsterdam|netherlands|stockholm|sweden|copenhagen|denmark|oslo|norway|helsinki|finland|dublin|ireland|zurich|switzerland|madrid|spain|milan|italy|brussels|belgium|vienna|austria|warsaw|poland|europe';
const US_RE = new RegExp('\\b(' + US_PLACES + ')\\b', 'i');
const EU_RE = new RegExp('\\b(' + EU_PLACES + ')\\b', 'i');
export function detectRegion(l, rawPhone) {
  const d = String(rawPhone || '').replace(/\D/g, '');
  const plus = /^\s*(\+|00)/.test(rawPhone || '');
  if ((plus && d.startsWith('1') && d.length === 11) || (!plus && d.length === 11 && d.startsWith('1'))) return ['US', 'phone +1'];
  if (plus) {
    const code = EU_CODES.filter((c) => d.startsWith(c)).sort((a, b) => b.length - a.length)[0];
    if (code) return ['EU', 'phone +' + code];
    return ['OTHER', 'phone +' + d.slice(0, 3)];
  }
  const dom = (l.email.split('@')[1] || '').toLowerCase();
  if (/\.us$|\.gov$/.test(dom)) return ['US', 'email domain'];
  if (EU_TLD.test(dom)) return ['EU', 'email domain'];
  // City or country in the company / role fields counts directly; in free text it needs "based in", "from", etc.
  const short = `${l.company} ${l.role} ${l.industry}`;
  const stated = /\b(based|located|headquartered|hq|we are|we're)\s+(in|at)?\s*(united states|usa|u\.s\.|new york|boston|chicago|texas|dallas|austin|houston|california|san francisco|los angeles|atlanta|philadelphia|new jersey|seattle|denver|miami|washington dc|united kingdom|london|germany|berlin|munich|frankfurt|paris|france|amsterdam|netherlands|stockholm|sweden|copenhagen|denmark|oslo|norway|helsinki|finland|dublin|ireland|zurich|switzerland|madrid|spain|milan|italy|brussels|belgium|vienna|austria|warsaw|poland|europe)\b/i;
  const text = (src, needStated) => {
    const us = US_RE.test(src), eu = EU_RE.test(src);
    if (us === eu || (needStated && !stated.test(src))) return null;
    return us ? 'US' : 'EU';
  };
  const r = text(short, false) || text(l.fullMessage, true);
  return r ? [r, 'stated location'] : ['UNKNOWN', ''];
}
// Sheet "Status" column -> canonical pipeline stage. Missing column or blank = null (not tracked).
export function normaliseStage(v) {
  const t = String(v || '').trim().toLowerCase();
  if (!t) return null;
  if (/lost|dead|disqualif|unqualified|not a fit|no fit|spam|junk/.test(t)) return 'lost';
  if (/mandate|won|signed|closed.?won|engag/.test(t)) return 'mandate';
  if (/diagnostic/.test(t)) return 'diagnostic';
  if (/brief|meeting|call|demo|booked/.test(t)) return 'briefing';
  if (/contact|repl|reach|outreach|follow|emailed|sent/.test(t)) return 'contacted';
  if (/new|open|todo|to do|inbox/.test(t)) return 'new';
  return 'new';
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
  const reg = geo ? [geo[0] === 'IN' ? 'EXCLUDED' : 'EXCLUDED', geo[1]] : detectRegion(l, rawPhone);
  l.region = reg[0]; l.regionReason = reg[1];
  l.stage = normaliseStage(get('status'));
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
