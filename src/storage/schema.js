// Storage schema: validate, clamp and migrate everything read from storage. Pure.
// Anything malformed falls back to the default rather than throwing.
import { DEFAULT_SETTINGS, SIZES, USER_FIELD_DEFAULTS } from './defaults.js';

export const SCHEMA_VERSION = 1;

const TYPES = ['quiz', 'discussion', 'upload', 'external_tool', 'other'];
const MAX_MINUTES = 24 * 60;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : null);
const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

function int(v, min, max, fallback) {
  if (typeof v !== 'number' && typeof v !== 'string') return fallback; // Number(null) is 0
  const n = v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

const weekdayIndex = (v, fallback) => int(v, 0, 6, fallback);
const size = (v, fallback) => (SIZES.includes(v) ? v : fallback);

export function validateSettings(raw) {
  const d = DEFAULT_SETTINGS;
  const s = isObj(raw) ? raw : {};
  const capacity = Array.isArray(s.capacity) && s.capacity.length === 7
    ? s.capacity.map((c, i) => int(c, 0, MAX_MINUTES, d.capacity[i]))
    : [...d.capacity];
  const sizeMinutes = {};
  for (const k of SIZES) sizeMinutes[k] = int(s.sizeMinutes?.[k], 1, MAX_MINUTES, d.sizeMinutes[k]);
  const typeDefaults = {};
  for (const t of TYPES) typeDefaults[t] = size(s.typeDefaults?.[t], d.typeDefaults[t]);
  const keywordRules = Array.isArray(s.keywordRules)
    ? s.keywordRules
      .filter((r) => isObj(r) && str(r.keyword, 100)?.trim() && SIZES.includes(r.size))
      .slice(0, 200)
      .map((r) => ({ keyword: r.keyword.trim().slice(0, 100), size: r.size }))
    : d.keywordRules.map((r) => ({ ...r }));
  const courses = {};
  if (isObj(s.courses)) {
    for (const [id, c] of Object.entries(s.courses)) {
      if (!isObj(c)) continue;
      courses[id] = { include: c.include !== false, displayName: str(c.displayName, 100) ?? '' };
    }
  }
  const blocked = Array.isArray(s.blockedWeekdays)
    ? [...new Set(s.blockedWeekdays.map((w) => weekdayIndex(w, -1)).filter((w) => w >= 0))]
    : [];
  return {
    weekStartDay: weekdayIndex(s.weekStartDay, d.weekStartDay),
    targetDay: weekdayIndex(s.targetDay, d.targetDay),
    capacity,
    blockedWeekdays: blocked.length < 7 ? blocked : [],
    sizeMinutes,
    typeDefaults,
    keywordRules,
    courses,
    autoSyncMinutes: int(s.autoSyncMinutes, 15, 7 * 24 * 60, d.autoSyncMinutes),
    gatePullOnCompletion: typeof s.gatePullOnCompletion === 'boolean' ? s.gatePullOnCompletion : d.gatePullOnCompletion,
    includeNonSubmittable: typeof s.includeNonSubmittable === 'boolean' ? s.includeNonSubmittable : d.includeNonSubmittable,
  };
}

function validateItem(id, raw) {
  if (!isObj(raw) || !/^\d{1,20}$/.test(id)) return null;
  const courseId = String(raw.courseId ?? '');
  if (!/^\d{1,20}$/.test(courseId)) return null;
  const url = str(raw.url, 1000);
  return {
    id,
    courseId,
    title: str(raw.title, 500) || '(untitled)',
    type: TYPES.includes(raw.type) ? raw.type : 'other',
    nonSubmittable: raw.nonSubmittable === true,
    dueAt: isoOrNull(raw.dueAt),
    unlockAt: isoOrNull(raw.unlockAt),
    lockAt: isoOrNull(raw.lockAt),
    points: Number.isFinite(raw.points) ? raw.points : null,
    canvasStatus: str(raw.canvasStatus, 50),
    canvasDone: raw.canvasDone === true,
    submittedAt: isoOrNull(raw.submittedAt),
    descriptionText: str(raw.descriptionText, 2000) ?? '',
    url: url && url.startsWith('https://byui.instructure.com/') ? url : null,
    prevDueAt: isoOrNull(raw.prevDueAt),
    hidden: raw.hidden === true,
    manualDone: raw.manualDone === true,
    sizeOverride: SIZES.includes(raw.sizeOverride) ? raw.sizeOverride : USER_FIELD_DEFAULTS.sizeOverride,
    pinned: raw.pinned === true,
    dismissed: raw.dismissed === true,
    pulledIn: raw.pulledIn === true,
  };
}

export function validateItems(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, item] of Object.entries(raw)) {
    const v = validateItem(id, item);
    if (v) out[id] = v;
  }
  return out;
}

export function validateWeekState(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [week, w] of Object.entries(raw)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(week) && isObj(w)) out[week] = { extraDays: int(w.extraDays, 0, 6, 0) };
  }
  return out;
}

export function validateMeta(raw) {
  const m = isObj(raw) ? raw : {};
  return { lastSyncAt: isoOrNull(m.lastSyncAt), lastError: str(m.lastError, 1000) };
}

export function validateCourses(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, c] of Object.entries(raw)) {
    if (/^\d{1,20}$/.test(id) && isObj(c)) out[id] = { name: str(c.name, 200) || `Course ${id}` };
  }
  return out;
}

/** Whole stored state -> current schema, validated. Unknown future versions are not trusted. */
export function migrate(raw) {
  const r = isObj(raw) ? raw : {};
  // Version 1 is the first schema; future migrations go here, oldest first.
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: validateSettings(r.settings),
    items: validateItems(r.items),
    meta: validateMeta(r.meta),
    weekState: validateWeekState(r.weekState),
    courses: validateCourses(r.courses),
  };
}
