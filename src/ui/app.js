// Shared page state and the actions that change it. Every view module imports `app`
// and these helpers; planner.js sets app.render.
import { planningWeek, toLocalDate } from '../planner/dates.js';
import { loadState, save } from '../storage/store.js';
import { pruneWeekState } from '../storage/schema.js';
import { runSync } from '../sync/run.js';
import { dueLabel } from './dom.js';

export const app = {
  state: null, // validated stored state (settings, items, meta, weekState, courses)
  syncing: false,
  syncMessage: null,
  editingDay: null, // date whose capacity is being edited
  pullSize: 'M', // amount picked in the "pull about …" control
  thisWeekPlan: null, // latest plan for this week (pull gate, pull candidates)
  selectedDay: null, // day tab shown ('week', a date, or null = first day)
  navOpen: false, // sidebar open on narrow screens
  render: () => {}, // set by planner.js
};

export function view() {
  const h = location.hash;
  if (h === '#settings' || h.startsWith('#settings/')) return 'settings';
  return ({ '#next': 'next', '#stats': 'stats' })[h] ?? 'this';
}
export const settingsTab = () => location.hash.split('/')[1] ?? '';

// --- formatting ----------------------------------------------------------------

export function timeAgo(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : dueLabel(iso);
}

export const courseName = (courseId) =>
  app.state.settings.courses[courseId]?.displayName || app.state.courses[courseId]?.name || `Course ${courseId}`;

export const SOURCE_LABEL = {
  manual: 'minutes you picked', rule: 'one of your estimate rules', stated: 'instructor-stated time',
  type: 'assignment type default', default: 'default size',
};

export const sumMinutes = (entries) => entries.reduce((s, e) => s + e.minutes, 0);
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- state changes ---------------------------------------------------------------

export async function saveState(partial) {
  Object.assign(app.state, partial);
  await save(partial);
  app.render();
}

export function updateItems(ids, patch) {
  const items = { ...app.state.items };
  for (const id of ids) items[id] = { ...items[id], ...patch };
  return saveState({ items });
}
export const updateItem = (id, patch) => updateItems([id], patch);

/** Change one week's app.state (extraDays, per-date capacity) and prune old weeks. */
export function updateWeek(weekStart, change) {
  const current = app.state.weekState[weekStart] ?? { extraDays: 0, capacity: {} };
  const next = { ...app.state.weekState, [weekStart]: change({ ...current, capacity: { ...current.capacity } }) };
  return saveState({ weekState: pruneWeekState(next, toLocalDate(Date.now())) });
}

export const changeExtraDays = (weekStart, delta) =>
  updateWeek(weekStart, (w) => ({ ...w, extraDays: Math.max(0, w.extraDays + delta) }));

export function setDayCapacity(date, minutes) {
  app.editingDay = null;
  return updateWeek(planningWeek(date, app.state.settings).start, (w) => {
    if (minutes == null) delete w.capacity[date];
    else w.capacity[date] = Math.min(1440, Math.max(0, minutes));
    return w;
  });
}

export async function sync() {
  if (app.syncing) return;
  app.syncing = true;
  app.syncMessage = null;
  app.render();
  const result = await runSync().catch((e) => ({ ok: false, error: `Sync failed: ${e.message}` }));
  app.syncing = false;
  app.syncMessage = result.ok ? null : result.error;
  app.state = await loadState();
  app.render();
}

export const homework = (entries) => entries.filter((e) => !e.inClass);
export const itemCount = (entries) => {
  const n = homework(entries).length;
  return `${n} item${n === 1 ? '' : 's'}`;
};
