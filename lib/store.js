// Tiny JSON document store. On Vercel (BLOB_READ_WRITE_TOKEN present) documents live in a private Blob;
// locally they are files under data/. Used for audit history and the growth tracker.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const safe = (name) => {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('bad store name');
  return name;
};

export async function readJson(name, fallback = {}) {
  safe(name);
  try {
    if (useBlob()) {
      const { get } = await import('@vercel/blob');
      const r = await get(`${name}.json`, { access: 'private', useCache: false });
      if (!r || r.statusCode !== 200) return fallback;
      return JSON.parse(await new Response(r.stream).text());
    }
    return JSON.parse(await readFile(join(DIR, `${name}.json`), 'utf8'));
  } catch {
    return fallback;
  }
}

// Throws on failure so callers (e.g. the growth API) can tell the user the save did not happen.
export async function writeJson(name, data) {
  safe(name);
  const body = JSON.stringify(data);
  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    await put(`${name}.json`, body, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 });
  } else {
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, `${name}.json`), body);
  }
}
