// Growth tracker data: weekly activity log, monthly targets and 90-day plan checklist, per site.
// Outbound emails, posts and briefings have no automatic source, so they are logged here and combined with the live lead data.
import { readJson, writeJson } from './store.js';

const NAME = 'growth';
export const SITE_KEYS = ['ventures', 'tech'];
export const FIELDS = ['sent', 'replies', 'positive', 'briefings', 'diagnostics', 'mandates', 'posts', 'keywords'];
export const TARGET_FIELDS = ['positive', 'briefings', 'diagnostics'];

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function getGrowth() {
  const d = await readJson(NAME, {});
  return { weeks: d.weeks || {}, targets: d.targets || {}, checklist: d.checklist || {}, updatedAt: d.updatedAt || null };
}

const num = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000 || !Number.isInteger(n)) throw new HttpError(400, `${label} must be a whole number from 0 to 1,000,000`);
  return n;
};

export async function saveGrowth(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Body must be JSON');
  const { type, site } = body;
  if (!SITE_KEYS.includes(site)) throw new HttpError(400, 'Unknown site');
  const d = await getGrowth();

  if (type === 'week') {
    if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(body.key || '')) throw new HttpError(400, 'Bad week key');
    const values = {};
    for (const f of FIELDS) values[f] = body.values && body.values[f] !== '' && body.values[f] != null ? num(body.values[f], f) : 0;
    if (values.replies > values.sent && values.sent > 0) throw new HttpError(400, 'Replies cannot exceed emails / DMs sent');
    if (values.positive > values.replies) throw new HttpError(400, 'Positive replies cannot exceed replies');
    values.note = String(body.values?.note || '').slice(0, 280);
    ((d.weeks[site] ||= {})[body.key]) = values;
  } else if (type === 'clearWeek') {
    if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(body.key || '')) throw new HttpError(400, 'Bad week key');
    if (d.weeks[site]) delete d.weeks[site][body.key];
  } else if (type === 'targets') {
    const t = {};
    for (const f of TARGET_FIELDS) if (body.targets && body.targets[f] !== '' && body.targets[f] != null) t[f] = num(body.targets[f], f);
    (d.targets[site] ||= {});
    d.targets[site] = t;
  } else if (type === 'check') {
    if (!/^[a-z0-9-]{1,60}$/.test(body.id || '')) throw new HttpError(400, 'Bad item id');
    const c = (d.checklist[site] ||= {});
    if (body.done) c[body.id] = new Date().toISOString().slice(0, 10);
    else delete c[body.id];
  } else {
    throw new HttpError(400, 'Unknown type');
  }
  d.updatedAt = new Date().toISOString();
  try {
    await writeJson(NAME, d);
  } catch (e) {
    throw new HttpError(500, `Could not save: ${e.message}`);
  }
  return d;
}
