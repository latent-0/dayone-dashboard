import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { getLeads } from './lib/leads.js';
import { getAudits, auditAge } from './lib/audit.js';
import { SITES, AUDIT_EVERY_MS, PSI_API_KEY } from './lib/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = process.env.PORT || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

// Optional shared password: set DASH_PASSWORD to require HTTP Basic auth (and DASH_USERNAME, if set).
const PASSWORD = process.env.DASH_PASSWORD || '';
const authed = (req) => {
  if (!PASSWORD) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const dec = Buffer.from(h.slice(6), 'base64').toString();
  const i = dec.indexOf(':');
  const user = process.env.DASH_USERNAME;
  return (!user || dec.slice(0, i).trim().toLowerCase() === user.toLowerCase()) && dec.slice(i + 1) === PASSWORD;
};

function send(req, res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const compressible = /json|text|javascript|svg|xml/.test(headers['content-type'] || '');
  if (compressible && buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(status, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
    return res.end(gzipSync(buf));
  }
  res.writeHead(status, headers);
  res.end(buf);
}
const json = (req, res, data, status = 200) =>
  send(req, res, status, JSON.stringify(data), { 'content-type': 'application/json', 'cache-control': 'no-store' });

const server = createServer(async (req, res) => {
  try {
    if (!authed(req)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Dayone Dashboard"' });
      return res.end('Authentication required');
    }
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/leads') return json(req, res, await getLeads(url.searchParams.has('refresh')));
    if (url.pathname === '/api/audit') return json(req, res, await getAudits(url.searchParams.has('refresh')));
    if (url.pathname === '/api/config') {
      return json(req, res, {
        sites: Object.fromEntries(Object.values(SITES).map((s) => [s.key, { key: s.key, name: s.name, short: s.short, domain: s.domain, url: s.url, sheetUrl: `https://docs.google.com/spreadsheets/d/${s.sheetId}/edit` }])),
        psiConfigured: !!PSI_API_KEY, auditAgeMs: auditAge(),
      });
    }

    // static
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '\\' || !extname(p)) p = '/index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT) || !existsSync(file)) return send(req, res, 404, 'Not found', { 'content-type': 'text/plain' });
    const body = await readFile(file);
    return send(req, res, 200, body, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': /\.(html|css|js)$/.test(file) ? 'no-cache' : 'public, max-age=3600',
    });
  } catch (e) {
    console.error(e);
    return json(req, res, { error: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`Dayone dashboard → http://localhost:${PORT}${PASSWORD ? ' (password protected)' : ''}`);
  getAudits().catch(() => {});
  setInterval(() => getAudits(true).catch(() => {}), AUDIT_EVERY_MS).unref();
});
