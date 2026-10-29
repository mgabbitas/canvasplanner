// Storage schema: validate, clamp and migrate everything read from storage. Pure.
// Anything malformed falls back to the default rather than throwing.
import { DEFAULT_SETTINGS, LEGACY_SIZES, USER_FIELD_DEFAULTS } from './defaults.js';
import { addDays } from '../planner/dates.js';

// Kept in sync with src/ui/theme.js (schema stays free of UI imports).
const ACCENT_KEYS = ['blue', 'teal', 'purple', 'green', 'orange', 'pink'];
const CLASS_COLOR_KEYS = ['blue', 'orange', 'green', 'purple', 'red', 'teal', 'pink', 'amber', 'indigo', 'slate'];

export const SCHEMA_VERSION = 4;

export const TYPES = ['quiz', 'discussion', 'upload', 'external_tool', 'other'];
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
const ID = /^\d{1,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RULES = 200;
const dateOrNull = (v) => (typeof v === 'string' && DATE.test(v) ? v : null);

/** One estimate rule, or null if it has no condition or no value. */
export function validateRule(r) {
  if (!isObj(r)) return null;
  const courseId = r.courseId != null && ID.test(String(r.courseId)) ? String(r.courseId) : null;
  const type = TYPES.includes(r.type) ? r.type : null;
  const keyword = (str(r.keyword, 100) ?? '').trim();
  const inClass = r.inClass === true;
  const minutes = inClass || r.minutes == null ? null : int(r.minutes, 1, MAX_MINUTES, null);
  if (!courseId && !type && !keyword) return null;
  if (!inClass && minutes == null) return null;
  return { courseId, type, keyword, minutes, inClass };
}

/**
 * Validate settings. Bad or missing values fall back to `base` (the last valid
 * settings when editing, the defaults otherwise).
 */
export function validateSettings(raw, base = DEFAULT_SETTINGS) {
  const d = base;
  const s = isObj(raw) ? raw : {};
  const capacity = Array.isArray(s.capacity) && s.capacity.length === 7
    ? s.capacity.map((c, i) => int(c, 0, MAX_MINUTES, d.capacity[i]))
    : [...d.capacity];
  const typeDefaults = {};
  for (const t of TYPES) typeDefaults[t] = int(s.typeDefaults?.[t], 1, MAX_MINUTES, d.typeDefaults[t]);
  const estimateRules = Array.isArray(s.estimateRules)
    ? s.estimateRules.map(validateRule).filter(Boolean).slice(0, MAX_RULES)
    : d.estimateRules.map((r) => ({ ...r }));
  const courses = {};
  if (isObj(s.courses)) {
    for (const [id, c] of Object.entries(s.courses)) {
      if (!ID.test(id) || !isObj(c)) continue;
      courses[id] = {
        include: c.include !== false,
        displayName: (str(c.displayName, 100) ?? '').trim(),
        color: CLASS_COLOR_KEYS.includes(c.color) ? c.color : null,
      };
    }
  }
  const blocked = Array.isArray(s.blockedWeekdays)
    ? [...new Set(s.blockedWeekdays.map((w) => weekdayIndex(w, -1)).filter((w) => w >= 0))].sort()
    : [...d.blockedWeekdays];
  const bool = (k) => (typeof s[k] === 'boolean' ? s[k] : d[k]);
  return {
    weekStartDay: weekdayIndex(s.weekStartDay, d.weekStartDay),
    targetDay: weekdayIndex(s.targetDay, d.targetDay),
    capacity,
    blockedWeekdays: blocked.length < 7 ? blocked : [...d.blockedWeekdays],
    typeDefaults,
    estimateRules,
    statedScale: int(s.statedScale, 10, 300, d.statedScale),
    courses,
    autoSyncMinutes: int(s.autoSyncMinutes, 15, 7 * 24 * 60, d.autoSyncMinutes),
    gatePullOnCompletion: bool('gatePullOnCompletion'),
    pullCapMinutes: int(s.pullCapMinutes, 15, 2400, d.pullCapMinutes ?? DEFAULT_SETTINGS.pullCapMinutes),
    showForecast: typeof s.showForecast === 'boolean' ? s.showForecast : (d.showForecast ?? true),
    theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : (d.theme ?? 'system'),
    accent: ACCENT_KEYS.includes(s.accent) ? s.accent : (d.accent ?? 'blue'),
    openOnCanvasVisit: typeof s.openOnCanvasVisit === 'boolean' ? s.openOnCanvasVisit : (d.openOnCanvasVisit ?? true),
    includeNonSubmittable: bool('includeNonSubmittable'),
  };
}

function validateItem(id, raw) {
  if (!isObj(raw) || !ID.test(id)) return null;
  const courseId = String(raw.courseId ?? '');
  if (!ID.test(courseId)) return null;
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
    minutesOverride: raw.minutesOverride == null ? USER_FIELD_DEFAULTS.minutesOverride : int(raw.minutesOverride, 1, MAX_MINUTES, null),
    pinned: raw.pinned === true,
    dismissed: raw.dismissed === true,
    pulledIn: raw.pulledIn === true,
    inClass: raw.inClass === true,
    log: validateLog(raw.log),
    doneOn: dateOrNull(raw.doneOn),
    plannedOn: dateOrNull(raw.plannedOn),
    notExam: raw.notExam === true,
  };
}

/** A logged time: minutes and difficulty are each optional; the finish day is required. */
export function validateLog(raw) {
  if (!isObj(raw) || typeof raw.finishedOn !== 'string' || !DATE.test(raw.finishedOn)) return null;
  const minutes = raw.minutes == null ? null : int(raw.minutes, 1, MAX_MINUTES, null);
  const difficulty = raw.difficulty == null ? null : int(raw.difficulty, 1, 5, null);
  if (minutes == null && difficulty == null) return null;
  return { minutes, difficulty, finishedOn: raw.finishedOn };
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
    if (!DATE.test(week) || !isObj(w)) continue;
    const capacity = {};
    if (isObj(w.capacity)) {
      for (const [date, minutes] of Object.entries(w.capacity)) {
        const m = int(minutes, 0, MAX_MINUTES, null);
        if (DATE.test(date) && m != null) capacity[date] = m;
      }
    }
    out[week] = { extraDays: int(w.extraDays, 0, 6, 0), capacity };
  }
  return out;
}

const KEEP_WEEKS = 8;

/** Drop week state for weeks that started more than 8 weeks before today. */
export function pruneWeekState(weekState, today) {
  const oldest = addDays(today, -7 * KEEP_WEEKS);
  return Object.fromEntries(Object.entries(weekState).filter(([week]) => week >= oldest));
}

const KEEP_DAYS = 400;
const MAX_LEFT = 200;

/** dayLog: date -> { left: [item ids still planned that day] }, for the days-on-plan streak. */
export function validateDayLog(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [date, d] of Object.entries(raw)) {
    if (!DATE.test(date) || !isObj(d)) continue;
    const left = Array.isArray(d.left) ? [...new Set(d.left.map(String).filter((id) => ID.test(id)))].slice(0, MAX_LEFT) : [];
    out[date] = { left };
  }
  return out;
}

/** Drop day records older than about 13 months. */
export function pruneDayLog(dayLog, today) {
  const oldest = addDays(today, -KEEP_DAYS);
  return Object.fromEntries(Object.entries(dayLog).filter(([date]) => date >= oldest));
}

export function validateMeta(raw) {
  const m = isObj(raw) ? raw : {};
  return { lastSyncAt: isoOrNull(m.lastSyncAt), lastError: str(m.lastError, 1000) };
}

export function validateCourses(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, c] of Object.entries(raw)) {
    if (ID.test(id) && isObj(c)) out[id] = { name: str(c.name, 200) || `Course ${id}` };
  }
  return out;
}

/** Your XS/S/M/L minutes from schema v3 or older settings (defaults where missing or bad). */
export function legacySizeMinutes(rawSettings) {
  const out = {};
  for (const [k, fallback] of Object.entries(LEGACY_SIZES)) out[k] = int(rawSettings?.sizeMinutes?.[k], 1, MAX_MINUTES, fallback);
  return out;
}

/** v2 -> v3 helper: replace an item's sizeOverride with minutesOverride. */
export function sizeToMinutes(item, sizeMinutes) {
  if (!isObj(item) || !('sizeOverride' in item)) return item;
  const { sizeOverride, ...rest } = item;
  const minutes = Object.hasOwn(sizeMinutes, sizeOverride) ? sizeMinutes[sizeOverride] : null;
  return { ...rest, minutesOverride: rest.minutesOverride ?? minutes };
}

/** Upgrade older stored shapes step by step, oldest first. Returns a new object. */
function upgrade(raw) {
  const r = { ...raw };
  const version = Number.isInteger(r.schemaVersion) ? r.schemaVersion : 1;
  if (version < 2 && isObj(r.settings)) {
    // v1 -> v2: title keyword rules became estimate rules (course/type/keyword).
    const { keywordRules, ...settings } = r.settings;
    if (Array.isArray(keywordRules) && !Array.isArray(settings.estimateRules)) {
      settings.estimateRules = keywordRules.map((k) => ({
        courseId: null, type: null, keyword: k?.keyword, size: k?.size, minutes: null,
      }));
    }
    r.settings = settings;
  }
  if (version < 3 && isObj(r.items)) {
    // v2 -> v3: per-item size override (XS/S/M/L) became exact minutes.
    const sizeMinutes = legacySizeMinutes(r.settings);
    r.items = Object.fromEntries(Object.entries(r.items).map(([id, item]) => [id, sizeToMinutes(item, sizeMinutes)]));
  }
  if (version < 4 && isObj(r.settings)) {
    // v3 -> v4: sizes removed. Rules and type defaults that named a size get its minutes.
    const sizeMinutes = legacySizeMinutes(r.settings);
    const minutesOf = (size) => (Object.hasOwn(sizeMinutes, size) ? sizeMinutes[size] : null);
    const settings = { ...r.settings };
    delete settings.sizeMinutes;
    if (Array.isArray(settings.estimateRules)) {
      settings.estimateRules = settings.estimateRules.map((rule) => (isObj(rule) && rule.minutes == null && minutesOf(rule.size)
        ? { ...rule, minutes: minutesOf(rule.size) } : rule));
    }
    if (isObj(settings.typeDefaults)) {
      settings.typeDefaults = Object.fromEntries(Object.entries(settings.typeDefaults)
        .map(([t, v]) => [t, minutesOf(v) ?? v]));
    }
    r.settings = settings;
  }
  return r;
}

/** Whole stored state -> current schema, validated. */
export function migrate(raw) {
  const r = upgrade(isObj(raw) ? raw : {});
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: validateSettings(r.settings),
    items: validateItems(r.items),
    meta: validateMeta(r.meta),
    weekState: validateWeekState(r.weekState),
    courses: validateCourses(r.courses),
    dayLog: validateDayLog(r.dayLog),
  };
}
