// Time series of audit scores so trend lines build up.
// On Vercel (BLOB_READ_WRITE_TOKEN present) it persists in a private Blob; locally it uses data/history.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'history.json');
const BLOB_PATH = 'audit-history.json';
const MIN_GAP_MS = 30 * 60_000;
const MAX_POINTS = 600;
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

async function load() {
  try {
    if (useBlob) {
      const { get } = await import('@vercel/blob');
      const r = await get(BLOB_PATH, { access: 'private', useCache: false });
      if (!r || r.statusCode !== 200) return {};
      return JSON.parse(await new Response(r.stream).text());
    }
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function save(data) {
  try {
    if (useBlob) {
      const { put } = await import('@vercel/blob');
      await put(BLOB_PATH, JSON.stringify(data), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 });
    } else {
      await mkdir(dirname(FILE), { recursive: true });
      await writeFile(FILE, JSON.stringify(data));
    }
  } catch (e) {
    console.error('history save failed:', e.message);
  }
}

// Append one point per site (skips if the last point is under 30 min old). Takes all sites at once: one read, one write.
export async function recordHistory(points) {
  const h = await load();
  let changed = false;
  for (const [site, scores] of Object.entries(points)) {
    const arr = (h[site] ||= []);
    const last = arr[arr.length - 1];
    if (last && Date.now() - last.t < MIN_GAP_MS) continue;
    arr.push({ t: Date.now(), ...scores });
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
    changed = true;
  }
  if (changed) await save(h);
  return h;
}

export const getHistory = load;
