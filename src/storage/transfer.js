// Export / import of settings and user-owned data. Pure.
import { migrate, validateItems, sizeToMinutes, SCHEMA_VERSION } from './schema.js';
import { USER_FIELD_DEFAULTS } from './defaults.js';

export const EXPORT_APP = 'canvas-planner';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ITEMS = 20000;
const USER_FIELDS = Object.keys(USER_FIELD_DEFAULTS);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const userFields = (item) => Object.fromEntries(USER_FIELDS.map((f) => [f, item[f]]));
const isDefault = (item) => USER_FIELDS.every((f) => item[f] === USER_FIELD_DEFAULTS[f]);

/** Settings, week state, day-on-plan history, and user fields of items you've changed. No Canvas content. */
export function buildExport(state, nowIso) {
  const userItems = {};
  for (const [id, item] of Object.entries(state.items)) {
    if (!isDefault(item)) userItems[id] = { courseId: item.courseId, ...userFields(item) };
  }
  return {
    app: EXPORT_APP,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso,
    settings: state.settings,
    weekState: state.weekState,
    dayLog: state.dayLog ?? {},
    userItems,
  };
}

/**
 * Validate an export file and return the state that replaces settings, week state,
 * day history and all user fields. Throws with a readable message if it isn't one of our exports.
 * Items not synced yet are kept as hidden stubs; the next sync fills them in.
 */
export function applyImport(state, raw) {
  if (!isObj(raw) || raw.app !== EXPORT_APP) throw new Error('This file is not a Canvas Planner export.');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This export is from a newer version of Canvas Planner.');
  }
  const { settings, weekState, dayLog } = migrate({
    schemaVersion: raw.schemaVersion, settings: raw.settings, weekState: raw.weekState, dayLog: raw.dayLog,
  });

  const items = {};
  for (const [id, item] of Object.entries(state.items)) items[id] = { ...item, ...USER_FIELD_DEFAULTS };
  const incoming = isObj(raw.userItems) ? Object.entries(raw.userItems).slice(0, MAX_IMPORT_ITEMS) : [];
  for (const [id, rawUser] of incoming) {
    if (!isObj(rawUser)) continue;
    const u = raw.schemaVersion < 3 ? sizeToMinutes(rawUser, settings.sizeMinutes) : rawUser;
    const base = items[id] ?? { courseId: u.courseId, title: '(waiting for sync)', hidden: true };
    const valid = validateItems({ [id]: { ...base, ...userFields(u) } })[id];
    if (valid) items[id] = state.items[id] ? { ...items[id], ...userFields(valid) } : valid;
  }
  return { settings, weekState, dayLog, items };
}
