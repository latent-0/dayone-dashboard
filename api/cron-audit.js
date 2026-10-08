// Called by Vercel Cron (see vercel.json). Runs a fresh audit so history keeps growing even when nobody opens the dashboard.
import { getAudits } from '../lib/audit.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const d = await getAudits(true);
  res.status(200).json({ ok: true, scores: Object.fromEntries(Object.entries(d.sites).map(([k, s]) => [k, s.scores?.overall ?? null])) });
}
