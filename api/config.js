import { SITES, PSI_API_KEY } from '../lib/config.js';
import { auditAge } from '../lib/audit.js';

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    sites: Object.fromEntries(
      Object.values(SITES).map((s) => [s.key, { key: s.key, name: s.name, short: s.short, domain: s.domain, url: s.url, sheetUrl: `https://docs.google.com/spreadsheets/d/${s.sheetId}/edit` }])
    ),
    psiConfigured: !!PSI_API_KEY,
    auditAgeMs: auditAge(),
  });
}
