// Time series of audit scores so trend lines build up (persisted via lib/store.js).
import { readJson, writeJson } from './store.js';

const NAME = 'audit-history';
const MIN_GAP_MS = 30 * 60_000;
const MAX_POINTS = 600;

export const getHistory = () => readJson(NAME, {});

// Append one point per site (skips if the last point is under 30 min old). One read, one write for all sites.
export async function recordHistory(points) {
  const h = await getHistory();
  let changed = false;
  for (const [site, scores] of Object.entries(points)) {
    const arr = (h[site] ||= []);
    const last = arr[arr.length - 1];
    if (last && Date.now() - last.t < MIN_GAP_MS) continue;
    arr.push({ t: Date.now(), ...scores });
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
    changed = true;
  }
  if (changed) {
    try { await writeJson(NAME, h); } catch (e) { console.error('history save failed:', e.message); }
  }
  return h;
}
