import { getGrowth, saveGrowth, HttpError } from '../lib/growth.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await getGrowth());
    if (req.method === 'POST') {
      // Same-origin only: the dashboard sends JSON, which a cross-site form cannot.
      if (!/application\/json/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'Send JSON' });
      return res.status(200).json(await saveGrowth(req.body));
    }
    res.setHeader('allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(e instanceof HttpError ? e.status : 500).json({ error: e.message });
  }
}
