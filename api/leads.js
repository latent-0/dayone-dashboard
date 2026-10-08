import { getLeads } from '../lib/leads.js';

export default async function handler(req, res) {
  try {
    const force = new URL(req.url, 'http://x').searchParams.has('refresh');
    res.setHeader('cache-control', 'no-store');
    res.status(200).json(await getLeads(force));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
