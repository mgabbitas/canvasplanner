// The planner: items + settings + week state + now -> everything the page shows.
// Pure: no browser APIs, no clock. See SPEC section 6.
import {
  toLocalDate, addDays, weekday, dateRange, minDate, maxDate, workDueDate, planningWeek, atNoon,
} from './dates.js';
import { estimate } from './estimate.js';
import { isMissedRepeat } from './tasks.js';

const FORECAST_DAYS = 14;
/** "Pull about …" choices, in minutes. */
export const PULL_AMOUNTS = [15, 30, 60, 120, 180];

export const isDone = (item) => Boolean(item.manualDone || item.canvasDone);

export const MAX_PARTS = 8;

/**
 * The change that checks an item off today. A split item gets one more part done,
 * and is done once every part is.
 */
export function checkOffPatch(item, today) {
  if (!item.splitParts) return { manualDone: true, doneOn: today };
  const partsDone = [...(item.partsDone ?? []), today];
  return partsDone.length >= item.splitParts ? { partsDone, manualDone: true, doneOn: today } : { partsDone };
}

/** Split parts still to do: entries for parts n..of, each with an even share of the time. */
function splitEntries(e) {
  const of = e.item.splitParts;
  if (!of || e.inClass) return [e];
  const per = Math.max(1, Math.ceil(e.minutes / of));
  const out = [];
  for (let n = (e.item.partsDone?.length ?? 0) + 1; n <= of; n++) {
    out.push({ ...e, id: `${e.id}#${n}`, part: { n, of }, minutes: per, movedTo: null, pinned: false });
  }
  return out;
}

/** Minutes of one part of a split item. */
const partMinutes = (item, settings) => Math.max(1, Math.ceil(estimate(item, settings).minutes / item.splitParts));

// Canvas has no exam flag, so go by title: "exam" or "midterm" anywhere, or "final"
// on a quiz (so "Final Reflection Document" isn't one).
const EXAM_WORDS = /\b(exam|midterm)s?\b/i;
const FINAL = /\bfinal\b/i;
export const looksLikeExam = (item) => EXAM_WORDS.test(item.title) || (item.type === 'quiz' && FINAL.test(item.title));
export const isExam = (item) => !item.notExam && looksLikeExam(item);

/** The local date a done item was finished: when you checked it off, else when Canvas got it. */
export function doneDay(item) {
  if (!isDone(item)) return null;
  if (item.doneOn) return item.doneOn;
  return item.canvasDone && item.submittedAt ? toLocalDate(item.submittedAt) : null;
}

const courseIncluded = (item, settings) => settings.courses?.[item.courseId]?.include !== false;

/** Not done, not dismissed or hidden, and not filtered out by settings. */
function isActive(item, settings) {
  return !isDone(item) && !item.dismissed && !item.hidden && courseIncluded(item, settings)
    && (settings.includeNonSubmittable || !item.nonSubmittable);
}

function toEntry(item, settings, today) {
  const { minutes, source, inClass } = estimate(item, settings);
  const unlockDate = item.unlockAt ? toLocalDate(item.unlockAt) : null;
  const dueDay = item.dueAt ? toLocalDate(item.dueAt) : null; // calendar day it's due
  // Last day to work on it. Due before 5 PM means the day before, except that
  // something due later today can still be done today.
  // Which week the work belongs to: the work deadline, so something due Monday morning
  // is the week before's work (it has to be done by Sunday).
  const workDay = item.dueAt ? workDueDate(item.dueAt) : null;
  let lastDay = workDay;
  if (dueDay && dueDay >= today) lastDay = maxDate(lastDay, today);
  const firstDay = maxDate(today, unlockDate ?? today);
  // A day you moved it to, while that day is still in its window.
  const p = item.plannedOn;
  const movedTo = !inClass && p && lastDay && p >= firstDay && p <= lastDay ? p : null;
  return {
    id: item.id,
    item,
    minutes,
    source,
    inClass,
    dueDay,
    workDay,
    lastDay,
    unlockDate,
    firstDay,
    movedTo,
    notOpenYet: unlockDate != null && unlockDate > today,
    pinned: Boolean(item.pinned),
    pulledIn: Boolean(item.pulledIn),
    // Real Canvas due date vs today, for urgency flags (independent of the plan).
    dueToday: dueDay === today,
    dueTomorrow: dueDay != null && dueDay === addDays(today, 1),
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
  const sum = (list) => list.reduce((s, e) => s + e.minutes, 0);
  const weekStart = planningWeek(today, settings).start;
  const week = planningWeek(today, settings, weekState?.[weekStart]?.extraDays ?? 0);
  const all = Array.isArray(items) ? items : Object.values(items ?? {});
  const behind = today > week.cutoff;
  // A missed repeat of one of your tasks just drops off (it isn't work to catch up on).
  const entries = all.filter((i) => isActive(i, settings) && !isMissedRepeat(i, today))
    .map((i) => toEntry(i, settings, today));
  // Floating tasks (no due date) are due by this week's target day, or by the end of the
  // week once that has passed. Recomputed each week, so they carry over and never go overdue.
  for (const e of entries) {
    if (!e.item.task?.floating) continue;
    const deadline = behind ? week.end : week.cutoff;
    const lastDay = maxDate(deadline, today);
    // A day you moved it to counts while it's inside this week's window (toEntry
    // couldn't tell: a floating task has no due date of its own).
    const p = e.item.plannedOn;
    const movedTo = !e.inClass && p && p >= e.firstDay && p <= lastDay ? p : null;
    Object.assign(e, { floating: true, dueDay: deadline, workDay: deadline, lastDay, movedTo, dueToday: false, dueTomorrow: false });
  }

  const inWeek = (d) => d >= week.start && d <= week.end;
  // This week's items (work deadline in this week, e.g. Monday-morning items count as
  // the week before's), carried-over overdue items from earlier weeks, and pulled items.
  const scoped = entries.filter((e) => e.dueDay && (e.workDay <= week.end || e.pulledIn));
  const noDueDate = entries.filter((e) => !e.dueDay);

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

  // In-class activities take no homework time: they sit on their class day at 0 min,
  // and past ones simply drop off (they aren't homework to catch up on).
  // A split item is planned as its remaining parts (see splitEntries).
  const work = scoped.filter((e) => !e.inClass).flatMap(splitEntries);
  for (const e of scoped) if (e.inClass && e.dueDay >= today) place(e, e.dueDay);

  // Work finished today keeps using today's time, so checking items off doesn't pull
  // later work into today. (Moving an item to today is how you take on more.)
  // A split item counts the parts done today, not its whole time.
  const finishedToday = all
    .filter((i) => doneDay(i) === today && !i.hidden && courseIncluded(i, settings) && !i.splitParts)
    .map((i) => toEntry(i, settings, today));
  const partsToday = all
    .filter((i) => i.splitParts && !i.hidden && courseIncluded(i, settings))
    .flatMap((i) => (i.partsDone ?? []).filter((d) => d === today).map(() => partMinutes(i, settings)));
  const doneMinutes = sum(finishedToday) + partsToday.reduce((s, m) => s + m, 0);
  if (doneMinutes) load.set(today, doneMinutes);

  const overdue = work.filter((e) => e.dueDay < today);
  const upcoming = work.filter((e) => e.dueDay >= today);
  const moved = upcoming.filter((e) => e.movedTo);
  const pinned = upcoming.filter((e) => !e.movedTo && e.pinned);
  const rest = upcoming.filter((e) => !e.movedTo && !e.pinned).sort(byDueThenSizeDesc);

  for (const e of work) e.behind = behind;
  for (const e of overdue) {
    e.overdue = true;
    place(e, today);
  }
  for (const e of moved) place(e, e.movedTo);
  for (const e of pinned) place(e, e.lastDay);

  const overflow = [];
  const atRisk = [];
  // Parts of a split item go on different days in order when they can (part 2 the day
  // after part 1 at the earliest), and share a day only when nothing else fits.
  const partDay = new Map(); // item id -> day of its last placed part
  for (const e of rest) {
    const prev = e.part ? partDay.get(e.item.id) : null;
    const start = maxDate(maxDate(today, e.unlockDate ?? today), prev ? addDays(prev, 1) : today);
    const opensLate = e.unlockDate != null && e.unlockDate > week.cutoff;
    const end = behind || opensLate ? e.lastDay : minDate(e.lastDay, week.cutoff);
    // An empty day takes anything.
    const fits = (d) => usable(d) && ((load.get(d) ?? 0) === 0 || (load.get(d) ?? 0) + e.minutes <= capacity(d));
    const day = dateRange(start, end).find(fits);
    const sameDay = !day && prev && prev <= end && fits(prev) ? prev : null;
    if (day || sameDay) {
      place(e, day ?? sameDay);
      if (e.part) partDay.set(e.item.id, day ?? sameDay);
    } else (behind ? atRisk : overflow).push(e);
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
      doneMinutes: date === today ? doneMinutes : 0,
      over: l > capacity(date),
      items: onDay.get(date) ?? [],
    };
  });

  // --- pull next week ---
  // Gate: this week's own work must be done first (if the setting is on; pulled items
  // don't count), then pulling continues until unfinished pulled work reaches the cap.
  const pulledMinutes = sum(work.filter((e) => e.pulledIn));
  const remaining = Math.max(0, (settings.pullCapMinutes ?? Infinity) - pulledMinutes);
  const weekDone = work.every((e) => e.pulledIn);
  const unlocked = !settings.gatePullOnCompletion || weekDone;
  // With nothing pulled yet, one item may exceed the cap so a big item is never stuck.
  const fitsOne = (minutes) => minutes <= remaining || pulledMinutes === 0;

  const candidates = entries
    .filter((e) => e.dueDay && e.workDay > week.end && !e.pulledIn && !e.inClass)
    .sort(byDueThenSizeAsc);
  const nextDue = candidates[0]?.dueDay ?? null;
  const nextDayEntries = candidates.filter((e) => e.dueDay === nextDue);
  const byAmount = {};
  for (const budget of PULL_AMOUNTS) {
    const limit = Math.min(budget, remaining);
    const picked = [];
    let total = 0;
    for (const e of candidates) {
      const ok = picked.length === 0 ? fitsOne(e.minutes) : total + e.minutes <= limit;
      if (!ok) break;
      picked.push(e);
      total += e.minutes;
    }
    byAmount[budget] = picked;
  }
  const pull = {
    enabled: unlocked && remaining > 0,
    blockedReason: !unlocked ? 'week' : remaining <= 0 ? 'cap' : null,
    pulledMinutes,
    capMinutes: settings.pullCapMinutes ?? null,
    remainingMinutes: remaining,
    nextDay: {
      date: nextDue,
      entries: nextDayEntries,
      fits: nextDayEntries.length > 0
        && (sum(nextDayEntries) <= remaining || (pulledMinutes === 0 && nextDayEntries.length === 1)),
    },
    byAmount,
  };

  // --- forecast: what's *due* each day, independent of the plan ---
  const forecast = dateRange(today, addDays(today, FORECAST_DAYS - 1)).map((date) => {
    const due = entries.filter((e) => e.dueDay === date && !e.inClass && !e.floating);
    const minutes = due.reduce((sum, e) => sum + e.minutes, 0);
    return { date, count: due.length, minutes, over: minutes > capacity(date) };
  });

  // --- exams still ahead this week (for the side panel) ---
  const exams = entries
    .filter((e) => e.dueDay && e.dueDay >= today && e.workDay <= week.end && isExam(e.item))
    .sort((a, b) => Date.parse(a.item.dueAt) - Date.parse(b.item.dueAt));

  // --- dismissed (so a dismissal can be undone) ---
  const dismissed = all
    .filter((i) => i.dismissed && !isDone(i) && !i.hidden && courseIncluded(i, settings))
    .map((i) => toEntry(i, settings, today));

  // --- done this week (for the collapsible Done section) ---
  const done = all
    .filter((i) => isDone(i) && !i.hidden && courseIncluded(i, settings) && (i.dueAt
      ? inWeek(toLocalDate(i.dueAt)) || inWeek(workDueDate(i.dueAt)) || i.pulledIn
      : i.task?.floating && inWeek(doneDay(i) ?? ''))) // a floating task: the week you finished it
    .map((i) => ({ ...toEntry(i, settings, today), canUncheck: !i.canvasDone }));

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
    exams,
    done,
    // Homework finished today: count and minutes (logged time if any, else the estimate).
    doneToday: {
      count: finishedToday.filter((e) => !e.inClass).length + partsToday.length,
      minutes: finishedToday.reduce((s, e) => s + (e.inClass ? 0 : e.item.log?.minutes ?? e.minutes), 0)
        + partsToday.reduce((s, m) => s + m, 0),
    },
  };
}

/**
 * Projected plan for next week, as if this week's work were done: items whose work
 * deadline is this week or earlier and items already pulled into this week are left out, and the
 * rest is planned as of next week's first day (its own target day, added days and
 * per-date capacity apply).
 */
export function planNextWeek({ items, settings, weekState = {}, now }) {
  const thisWeek = planningWeek(toLocalDate(now), settings);
  const start = addDays(thisWeek.start, 7);
  const list = (Array.isArray(items) ? items : Object.values(items ?? {}))
    .filter((i) => !i.pulledIn && !i.task?.floating && !(i.dueAt && workDueDate(i.dueAt) <= thisWeek.end));
  return plan({ items: list, settings, weekState, now: atNoon(start) });
}

/** Can a single item of this many minutes be pulled right now? */
export function canPullItem(pull, minutes) {
  return pull.enabled && (minutes <= pull.remainingMinutes || pull.pulledMinutes === 0);
}

/**
 * Every unfinished item of one class (not dismissed or hidden), as plan entries:
 * earliest due first, items with no due date last.
 */
export function classEntries({ items, settings, courseId, now }) {
  const today = toLocalDate(now);
  return (Array.isArray(items) ? items : Object.values(items ?? {}))
    .filter((i) => i.courseId === String(courseId) && isActive(i, settings))
    .map((i) => toEntry(i, settings, today))
    .sort((a, b) => {
      const ta = a.item.dueAt ? Date.parse(a.item.dueAt) : Infinity;
      const tb = b.item.dueAt ? Date.parse(b.item.dueAt) : Infinity;
      return (ta === tb ? 0 : ta < tb ? -1 : 1) || a.item.title.localeCompare(b.item.title) || a.id.localeCompare(b.id);
    });
}
