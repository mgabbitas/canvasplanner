// The planner: items + settings + week state + now -> everything the page shows.
// Pure: no browser APIs, no clock. See SPEC section 6.
import {
  toLocalDate, addDays, weekday, dateRange, minDate, maxDate, workDueDate, planningWeek, atNoon,
} from './dates.js';
import { estimate } from './estimate.js';

const FORECAST_DAYS = 14;

export const isDone = (item) => Boolean(item.manualDone || item.canvasDone);

const courseIncluded = (item, settings) => settings.courses?.[item.courseId]?.include !== false;

/** Not done, not dismissed or hidden, and not filtered out by settings. */
function isActive(item, settings) {
  return !isDone(item) && !item.dismissed && !item.hidden && courseIncluded(item, settings)
    && (settings.includeNonSubmittable || !item.nonSubmittable);
}

function toEntry(item, settings, today) {
  const { minutes, source } = estimate(item, settings);
  const unlockDate = item.unlockAt ? toLocalDate(item.unlockAt) : null;
  const dueDay = item.dueAt ? toLocalDate(item.dueAt) : null; // calendar day it's due
  // Last day to work on it. Due before 5 PM means the day before, except that
  // something due later today can still be done today.
  let lastDay = item.dueAt ? workDueDate(item.dueAt) : null;
  if (dueDay && dueDay >= today) lastDay = maxDate(lastDay, today);
  return {
    id: item.id,
    item,
    minutes,
    source,
    dueDay,
    lastDay,
    unlockDate,
    notOpenYet: unlockDate != null && unlockDate > today,
    pinned: Boolean(item.pinned),
    pulledIn: Boolean(item.pulledIn),
    date: null,
    overdue: false,
    behind: false,
  };
}

const byDueThenSizeDesc = (a, b) =>
  a.dueDay.localeCompare(b.dueDay) || a.lastDay.localeCompare(b.lastDay)
  || b.minutes - a.minutes || a.item.title.localeCompare(b.item.title) || a.id.localeCompare(b.id);

const byDueThenSizeAsc = (a, b) =>
  a.dueDay.localeCompare(b.dueDay) || a.minutes - b.minutes
  || a.item.title.localeCompare(b.item.title) || a.id.localeCompare(b.id);

/**
 * @param {object} args
 * @param {object|object[]} args.items   stored items (map by id, or an array)
 * @param {object} args.settings
 * @param {object} args.weekState       { [weekStartDate]: { extraDays } }
 * @param {Date|number|string} args.now
 */
export function plan({ items, settings, weekState = {}, now }) {
  const today = toLocalDate(now);
  const weekStart = planningWeek(today, settings).start;
  const week = planningWeek(today, settings, weekState?.[weekStart]?.extraDays ?? 0);
  const all = Array.isArray(items) ? items : Object.values(items ?? {});
  const entries = all.filter((i) => isActive(i, settings)).map((i) => toEntry(i, settings, today));

  const inWeek = (d) => d >= week.start && d <= week.end;
  // This week's items, carried-over overdue items from earlier weeks, and pulled items.
  const scoped = entries.filter((e) => e.dueDay && (e.dueDay <= week.end || e.pulledIn));
  const noDueDate = entries.filter((e) => !e.dueDay);
  const behind = today > week.cutoff;

  // --- scheduling ---
  const blocked = new Set(settings.blockedWeekdays ?? []);
  const defaultCapacity = (d) => settings.capacity[weekday(d)] ?? 0;
  // A per-date override (set on the day in the planner) beats the weekday default
  // and a blocked weekday. 0 means a day off.
  const override = (d) => weekState?.[planningWeek(d, settings).start]?.capacity?.[d];
  const capacity = (d) => override(d) ?? defaultCapacity(d);
  const usable = (d) => (override(d) != null || !blocked.has(weekday(d))) && capacity(d) > 0;
  const load = new Map();
  const onDay = new Map();
  const place = (e, date) => {
    e.date = date;
    load.set(date, (load.get(date) ?? 0) + e.minutes);
    if (!onDay.has(date)) onDay.set(date, []);
    onDay.get(date).push(e);
  };

  const overdue = scoped.filter((e) => e.dueDay < today);
  const pinned = scoped.filter((e) => e.dueDay >= today && e.pinned);
  const rest = scoped.filter((e) => e.dueDay >= today && !e.pinned).sort(byDueThenSizeDesc);

  for (const e of scoped) e.behind = behind;
  for (const e of overdue) {
    e.overdue = true;
    place(e, today);
  }
  for (const e of pinned) place(e, e.lastDay);

  const overflow = [];
  const atRisk = [];
  for (const e of rest) {
    const start = maxDate(today, e.unlockDate ?? today);
    const opensLate = e.unlockDate != null && e.unlockDate > week.cutoff;
    const end = behind || opensLate ? e.lastDay : minDate(e.lastDay, week.cutoff);
    const day = dateRange(start, end).find((d) => {
      if (!usable(d)) return false;
      const l = load.get(d) ?? 0;
      return l === 0 || l + e.minutes <= capacity(d); // an empty day takes anything
    });
    if (day) place(e, day);
    else (behind ? atRisk : overflow).push(e);
  }

  const lastPlaced = [...onDay.keys()].reduce(maxDate, week.cutoff);
  const days = dateRange(today, maxDate(today, lastPlaced)).map((date) => {
    const l = load.get(date) ?? 0;
    return {
      date,
      weekday: weekday(date),
      capacity: capacity(date),
      defaultCapacity: defaultCapacity(date),
      capacityOverridden: override(date) != null,
      blocked: !usable(date),
      load: l,
      over: l > capacity(date),
      items: onDay.get(date) ?? [],
    };
  });

  // --- pull next week ---
  const candidates = entries
    .filter((e) => e.dueDay && e.dueDay > week.end && !e.pulledIn)
    .sort(byDueThenSizeAsc);
  const nextDue = candidates[0]?.dueDay ?? null;
  const bySize = {};
  for (const [size, budget] of Object.entries(settings.sizeMinutes)) {
    const picked = [];
    let total = 0;
    for (const e of candidates) {
      if (picked.length > 0 && total + e.minutes > budget) break;
      picked.push(e);
      total += e.minutes;
    }
    bySize[size] = picked;
  }
  const pull = {
    enabled: !settings.gatePullOnCompletion || scoped.length === 0,
    nextDay: { date: nextDue, entries: candidates.filter((e) => e.dueDay === nextDue) },
    bySize,
  };

  // --- forecast: what's *due* each day, independent of the plan ---
  const forecast = dateRange(today, addDays(today, FORECAST_DAYS - 1)).map((date) => {
    const due = entries.filter((e) => e.dueDay === date);
    const minutes = due.reduce((sum, e) => sum + e.minutes, 0);
    return { date, count: due.length, minutes, over: minutes > capacity(date) };
  });

  // --- dismissed (so a dismissal can be undone) ---
  const dismissed = all
    .filter((i) => i.dismissed && !isDone(i) && !i.hidden && courseIncluded(i, settings))
    .map((i) => toEntry(i, settings, today));

  // --- done this week (for the collapsible Done section) ---
  const done = all
    .filter((i) => isDone(i) && !i.hidden && courseIncluded(i, settings) && i.dueAt
      && (inWeek(toLocalDate(i.dueAt)) || i.pulledIn))
    .map((i) => ({ ...toEntry(i, settings, today), canUncheck: !i.canvasDone }));

  const sum = (list) => list.reduce((s, e) => s + e.minutes, 0);
  return {
    today,
    week: {
      ...week,
      canAddDay: week.cutoff < week.end,
      canRemoveDay: week.extraDays > 0,
    },
    behind,
    days,
    overdue,
    overflow,
    overflowMinutes: sum(overflow),
    atRisk,
    atRiskMinutes: sum(atRisk),
    noDueDate,
    dismissed,
    pull,
    forecast,
    done,
  };
}

/**
 * Projected plan for next week, as if this week's work were done: items due this
 * week or earlier and items already pulled into this week are left out, and the
 * rest is planned as of next week's first day (its own target day, added days and
 * per-date capacity apply).
 */
export function planNextWeek({ items, settings, weekState = {}, now }) {
  const thisWeek = planningWeek(toLocalDate(now), settings);
  const start = addDays(thisWeek.start, 7);
  const list = (Array.isArray(items) ? items : Object.values(items ?? {}))
    .filter((i) => !i.pulledIn && !(i.dueAt && toLocalDate(i.dueAt) <= thisWeek.end));
  return plan({ items: list, settings, weekState, now: atNoon(start) });
}
