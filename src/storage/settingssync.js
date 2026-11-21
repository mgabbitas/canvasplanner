// Settings sync (1.7, decided 2026-11-20): your settings, class settings and school go to
// browser.storage.sync, so your other computers (same Firefox account or Chrome profile)
// start set up. Assignments, check-offs and logs never sync. Pure: no browser.*, the time
// comes in as an argument. The browser side is in store.js.
import { validateSettings } from './schema.js';
import { isCanvasHost } from '../sync/school.js';

// browser.storage.sync allows about 8 KB per key, so rules (up to 200) go in chunks.
const CHUNK_BYTES = 7000;
const MAX_CHUNKS = 10;
export const SYNC_KEY_PREFIX = 'cp_';

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** Split a list into pieces whose JSON stays under CHUNK_BYTES each. */
function chunk(list) {
  const out = [[]];
  let size = 2;
  for (const x of list) {
    const n = JSON.stringify(x).length + 1;
    if (size + n > CHUNK_BYTES && out.at(-1).length) {
      out.push([]);
      size = 2;
    }
    out.at(-1).push(x);
    size += n;
  }
  return out.slice(0, MAX_CHUNKS);
}

/**
 * What goes to storage.sync, as { key: value }. The on/off switch itself stays on each
 * computer (turning it off on one shouldn't turn it off on the others).
 */
export function toSyncPayload(settings, host, nowMs) {
  const { estimateRules, syncSettings, ...rest } = settings;
  const rules = chunk(estimateRules ?? []);
  const out = {
    [`${SYNC_KEY_PREFIX}settings`]: rest,
    [`${SYNC_KEY_PREFIX}school`]: host ?? null,
    [`${SYNC_KEY_PREFIX}rulesChunks`]: rules.length,
    [`${SYNC_KEY_PREFIX}updatedAt`]: nowMs,
  };
  rules.forEach((r, i) => { out[`${SYNC_KEY_PREFIX}rules${i}`] = r; });
  return out;
}

/**
 * The synced copy as local changes, or null when there's nothing newer to take. `local`
 * is { settings, canvas, settingsSyncedAt }. Everything is validated like an import.
 * A synced school only fills in a computer with none (changing school clears your data).
 */
export function fromSyncPayload(raw, local) {
  if (!isObj(raw)) return null;
  const updatedAt = raw[`${SYNC_KEY_PREFIX}updatedAt`];
  if (!Number.isFinite(updatedAt) || updatedAt <= (local.settingsSyncedAt ?? 0)) return null;
  const s = raw[`${SYNC_KEY_PREFIX}settings`];
  if (!isObj(s)) return null;
  const n = Math.min(MAX_CHUNKS, Math.max(0, Number.isInteger(raw[`${SYNC_KEY_PREFIX}rulesChunks`]) ? raw[`${SYNC_KEY_PREFIX}rulesChunks`] : 0));
  const rules = [];
  for (let i = 0; i < n; i++) {
    const part = raw[`${SYNC_KEY_PREFIX}rules${i}`];
    if (!Array.isArray(part)) return null; // half-arrived copy: wait for the rest
    rules.push(...part);
  }
  const settings = validateSettings({ ...s, estimateRules: rules, syncSettings: local.settings.syncSettings });
  const school = raw[`${SYNC_KEY_PREFIX}school`];
  const out = { settings, settingsSyncedAt: updatedAt };
  if (!local.canvas?.host && isCanvasHost(school)) out.canvas = { host: school };
  return out;
}

/** The synced keys to remove (Clear all data), for any number of rule chunks. */
export const syncKeys = () => ['settings', 'school', 'rulesChunks', 'updatedAt', ...Array.from({ length: MAX_CHUNKS }, (_, i) => `rules${i}`)]
  .map((k) => `${SYNC_KEY_PREFIX}${k}`);
