// Settings sync (1.7, decided 2026-11-20): your settings, class settings and school go to
// browser.storage.sync, so your other computers (same Firefox account or Chrome profile)
// start set up. Assignments, check-offs and logs never sync. Pure: no browser.*, the time
// and this computer's id come in as arguments. The browser side is in store.js.
//
// How copies are told apart (fixed after the 1.7 bug hunt):
// - Each computer has a random id. A copy it sent itself is never taken back.
// - Each computer remembers the stamp of the last copy it took or sent. Any other stamp
//   from another computer is news (no comparing clocks between computers).
// - Every key of a copy carries the same stamp, so a half-arrived copy is ignored.
// - A new computer sends nothing until it has settings of its own (or has taken a copy),
//   so its defaults never replace your real settings.
import { validateSettings } from './schema.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { isCanvasHost } from '../sync/school.js';

// browser.storage.sync allows about 8 KB per key, so rules (up to 200) go in chunks.
const CHUNK_BYTES = 7000;
const MAX_CHUNKS = 10;
export const SYNC_KEY_PREFIX = 'cp_';
const K_MAIN = `${SYNC_KEY_PREFIX}settings`;
const kRules = (i) => `${SYNC_KEY_PREFIX}rules${i}`;

// Kept per computer, never sent: the on/off switch. Ignored when deciding whether a
// computer has settings of its own: the review invite and season offers answered.
const NOT_SENT = ['syncSettings'];
const NOT_OWN = ['syncSettings', 'reviewAsked', 'seasonAnswered'];

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isStamp = (v) => Number.isFinite(v) && v > 0;
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

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

/** What goes to storage.sync, as { key: value }. `from` is this computer's id. */
export function toSyncPayload(settings, host, nowMs, from) {
  const { estimateRules, ...rest } = settings;
  const rules = chunk(estimateRules ?? []);
  const out = {
    [K_MAIN]: { at: nowMs, from, school: host ?? null, chunks: rules.length, settings: omit(rest, NOT_SENT) },
  };
  rules.forEach((r, i) => { out[kRules(i)] = { at: nowMs, rules: r }; });
  return out;
}

/** "Clear all data on every computer": what replaces the synced copy. */
export const clearedPayload = (nowMs, from) => ({ [K_MAIN]: { at: nowMs, from, cleared: true } });

/** Whether a synced copy is there at all (anything under our main key). */
export const hasSyncedCopy = (raw) => isObj(raw?.[K_MAIN]);

/** Settings that differ from the defaults (class names, rules, themes…), not counting per-computer bits. */
export function hasOwnSettings(settings) {
  const norm = (s) => JSON.stringify(omit(validateSettings(s), NOT_OWN));
  return norm(settings) !== norm(DEFAULT_SETTINGS);
}

/**
 * Whether this computer should send its settings now. `local` is { settings,
 * settingsSyncedAt }: a computer that has taken or sent a copy keeps everyone up to date;
 * a new one only sends once it has settings of its own.
 */
export const shouldPush = (local) => Boolean(local.settings.syncSettings)
  && (isStamp(local.settingsSyncedAt) || hasOwnSettings(local.settings));

/**
 * The synced copy as local changes, or null when there's nothing new to take. `local` is
 * { settings, canvas, settingsSyncedAt, syncDevice }. Everything is validated like an
 * import. Returns { cleared: true, at } when another computer cleared everything.
 * A synced school only fills in a computer with none; class names, colors and class
 * rules only come from a computer on the same school.
 */
export function fromSyncPayload(raw, local) {
  if (!isObj(raw) || !isObj(raw[K_MAIN])) return null;
  const m = raw[K_MAIN];
  if (!isStamp(m.at) || m.at === local.settingsSyncedAt) return null;
  if (m.from != null && m.from === local.syncDevice) return null; // our own copy
  if (m.cleared === true) {
    // Only a computer that was syncing before the clear follows it; a new one starts fresh.
    return isStamp(local.settingsSyncedAt) ? { cleared: true, at: m.at } : null;
  }
  if (!isObj(m.settings)) return null;
  const n = Number.isInteger(m.chunks) ? Math.min(MAX_CHUNKS, Math.max(0, m.chunks)) : 0;
  const rules = [];
  for (let i = 0; i < n; i++) {
    const part = raw[kRules(i)];
    if (!isObj(part) || part.at !== m.at || !Array.isArray(part.rules)) return null; // half-arrived: wait
    rules.push(...part.rules);
  }
  const school = isCanvasHost(m.school) ? m.school : null;
  const host = local.canvas?.host ?? null;
  const sameSchool = !school || !host || school === host;
  const settings = validateSettings({
    ...m.settings,
    estimateRules: sameSchool ? rules : [...rules.filter((r) => !r?.courseId), ...local.settings.estimateRules.filter((r) => r.courseId)],
    courses: sameSchool ? m.settings.courses : local.settings.courses,
    syncSettings: local.settings.syncSettings,
    reviewAsked: m.settings.reviewAsked === true || local.settings.reviewAsked,
  });
  const out = { settings, settingsSyncedAt: m.at };
  if (!host && school) out.canvas = { host: school };
  return out;
}

/** Every synced key (to clear), including names used by 1.7 test builds. */
export const syncKeys = () => ['settings', 'school', 'rulesChunks', 'updatedAt', ...Array.from({ length: MAX_CHUNKS }, (_, i) => `rules${i}`)]
  .map((k) => `${SYNC_KEY_PREFIX}${k}`);
