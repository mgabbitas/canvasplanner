// The planner: items + settings + week state + now -> everything the page shows.
// Pure: no browser APIs, no clock. See SPEC section 6.
import {
  toLocalDate, addDays, weekday, dateRange, minDate, maxDate, workDueDate, planningWeek, atNoon,
} from './dates.js';
import { estimate, measuredMinutes } from './estimate.js';
import { isMissedRepeat, studyOff } from './tasks.js';

const FORECAST_DAYS = 14;
/** "Pull about …" choices, in minutes. */
export const PULL_AMOUNTS = [15, 30, 60, 120, 180];

export const isDone = (item) => Boolean(item.manualDone || item.canvasDone);

export const MAX_PARTS = 8;

/**
 * The change that checks an item off today. A split item gets one more part done,
 * and is done once every part is.
 */
export function checkOffPatch(item, today, partDay = today, nowMs = null) {
  // Finishing a whole item measures the time since you last opened it (see estimate.js).
  if (!item.splitParts) {
    const measured = item.openedAt ? { openedAt: null, measuredMinutes: measuredMinutes(item.openedAt, nowMs) } : {};
    return { manualDone: true, doneOn: today, ...measured };
  }
  const partsDone = [...(item.partsDone ?? []), today];
  // The part you checked off frees the day you chose for it (if you chose one), and
  // chosen days that have passed go (their parts are the planner's again anyway).
  const left = withoutDay(item.splitDays, partDay)?.filter((d) => d >= today) ?? [];
  const splitDays = left.length ? left : null;
  const patch = item.splitDays ? { partsDone, splitDays } : { partsDone };
  return partsDone.length >= item.splitParts ? { ...patch, manualDone: true, doneOn: today } : patch;
}

/** A list of days with one copy of `day` taken out (null when nothing is left). */
export function withoutDay(days, day) {
  if (!days) return null;
  const i = days.indexOf(day);
  const out = i < 0 ? days : [...days.slice(0, i), ...days.slice(i + 1)];
  return out.length ? out : null;
}

/**
 * Split parts still to do: entries for parts n..of, each with an even share of the time.
 * Days you chose for parts (splitDays, still inside the item's window) go to the first
 * parts; the rest are the planner's to place. Parts are renumbered by day afterwards.
 */
function splitEntries(e) {
  const of = e.item.splitParts;
  if (!of || e.inClass) return [e];
  const per = Math.max(1, Math.ceil(e.minutes / of));
  const first = (e.item.partsDone?.length ?? 0) + 1;
  const chosen = (e.item.splitDays ?? []).filter((d) => e.lastDay && d >= e.firstDay && d <= e.lastDay).sort();
  const out = [];
  for (let n = first; n <= of; n++) {
    const movedTo = chosen[n - first] ?? null;
    out.push({ ...e, id: `${e.id}#${n}`, part: { n, of }, minutes: per, movedTo, pinned: false });
  }
  return out;
}

/** Number each item's remaining parts in day order (unplaced last), so part 1 comes first. */
function renumberParts(entries) {
  const byItem = new Map();
  for (const e of entries) if (e.part) (byItem.get(e.item.id) ?? byItem.set(e.item.id, []).get(e.item.id)).push(e);
  for (const parts of byItem.values()) {
    const ns = parts.map((e) => e.part.n).sort((a, b) => a - b);
    parts.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.part.n - b.part.n);
    parts.forEach((e, i) => { e.part = { ...e.part, n: ns[i] }; e.id = `${e.item.id}#${ns[i]}`; });
  }
}

/** Minutes of one part of a split item. */
const partMinutes = (item, settings) => Math.max(1, Math.ceil(estimate(item, settings).minutes / item.splitParts));

// Canvas has no exam flag, so go by title: "exam" or "midterm" anywhere, or "final"
// on a quiz (so "Final Reflection Document" isn't one).
const EXAM_WORDS = /\b(exam|midterm)s?\b/i;
const FINAL = /\bfinal\b/i;
export const looksLikeExam = (item) => EXAM_WORDS.test(item.title) || (item.type === 'quiz' && FINAL.test(item.title));
export const isExam = (item) => !item.notExam && looksLikeExam(item);

// Extra credit (decided 2026-11-11): Canvas has no flag for it, so go by title. It's
// optional: planned only into time left after required work, never overdue, never
// part of a streak or the pull gate.
const EXTRA_CREDIT = /\b(extra[\s-]*credit|bonus)\b/i;
export const isOptional = (item) => !item.task && EXTRA_CREDIT.test(item.title);

/** The local date a done item was finished: when you checked it off, else when Canvas got it. */
export function doneDay(item) {
  if (!isDone(item)) return null;
  if (item.doneOn) return item.doneOn;
  return item.canvasDone && item.submittedAt ? toLocalDate(item.submittedAt) : null;
}

/**
 * Missing in Canvas and past its lock date: it can't be submitted anymore, so it isn't
 * planned. It shows greyed out under "Closed in Canvas" on the day it closed and the
 * day after (CLOSED_SHOW_DAYS), then drops off.
 */
export const isClosed = (item, nowMs) => Boolean(item.canvasMissing && item.lockAt && Date.parse(item.lockAt) <= nowMs);
export const CLOSED_SHOW_DAYS = 1;

const courseIncluded = (item, settings) => settings.courses?.[item.courseId]?.include !== false;

/** Not done, not dismissed or hidden, and not filtered out by settings. */
function isActive(item, settings) {
  return !isDone(item) && !item.dismissed && !item.hidden && courseIncluded(item, settings)
    && (settings.includeNonSubmittable || !item.nonSubmittable);
}

function toEntry(item, settings, today, shares = {}) {
  const est = estimate(item, settings);
  // An exam you can't submit in Canvas (on paper, no submission) is taken in class: no
  // homework time, like in-class activities. Minutes you set on it still win.
  const { minutes, source, inClass } = isExam(item) && item.nonSubmittable && est.source !== 'manual'
    ? { minutes: 0, source: est.source, inClass: true } : est;
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
    gradeShare: shares[item.id] ?? null, // share of the class grade (0-1), when known
    optional: isOptional(item),
    pinned: Boolean(item.pinned),
    pulledIn: Boolean(item.pulledIn),
    // Real Canvas due date vs today, for urgency flags (independent of the plan).
    dueToday: dueDay === today,
    dueTomorrow: dueDay != null && dueDay === addDays(today, 1),
    date: null,
    overdue: false,
    behind: false,
    tight: false,
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
export function plan({ items, settings, weekState = {}, now, shares = {}, lookup = null }) {
  const today = toLocalDate(now);
  const sum = (list) => list.reduce((s, e) => s + e.minutes, 0);
  const weekStart = planningWeek(today, settings).start;
  const week = planningWeek(today, settings, weekState?.[weekStart]?.extraDays ?? 0);
  const all = Array.isArray(items) ? items : Object.values(items ?? {});
  const behind = today > week.cutoff;
  const nowMs = new Date(now).getTime();
  const closedShown = (i) => today <= addDays(toLocalDate(i.lockAt), CLOSED_SHOW_DAYS);
  const closed = all
    .filter((i) => isActive(i, settings) && isClosed(i, nowMs) && closedShown(i))
    .map((i) => toEntry(i, settings, today, shares));
  // A missed repeat of one of your tasks just drops off (it isn't work to catch up on).
  // Items by id, to find a study task's exam (planNextWeek passes the full set).
  const byId = lookup ?? Object.fromEntries(all.map((i) => [i.id, i]));
  const entries = all.filter((i) => isActive(i, settings) && !isMissedRepeat(i, today) && !isClosed(i, nowMs) && !studyOff(i, byId))
    .map((i) => toEntry(i, settings, today, shares));
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
  // the week before's), carried-over overdue items from earlier weeks, pulled items, and
  // next week's items you put on a day this week (an exam that's already open).
  const movedIn = (e) => e.movedTo != null && e.movedTo <= week.end;
  const scoped = entries.filter((e) => e.dueDay && (e.workDay <= week.end || e.pulledIn || movedIn(e)));
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
    .map((i) => toEntry(i, settings, today, shares));
  const partsToday = all
    .filter((i) => i.splitParts && !i.hidden && courseIncluded(i, settings))
    .flatMap((i) => (i.partsDone ?? []).filter((d) => d === today).map(() => partMinutes(i, settings)));
  // Scheduling counts finished work at its estimate (SPEC 6 step 2), so logging a time
  // never pulls work into today or pushes it out.
  const partsMinutes = partsToday.reduce((s, m) => s + m, 0);
  const doneEstimate = finishedToday.reduce((s, e) => s + (e.inClass ? 0 : e.minutes), 0) + partsMinutes;
  if (doneEstimate) load.set(today, doneEstimate);
  // What you finished, for display (header, bar, gold): logged time, else the estimate.
  const spent = (e) => (e.inClass ? 0 : e.item.log?.minutes ?? e.minutes);
  const doneMinutes = finishedToday.reduce((s, e) => s + spent(e), 0) + partsMinutes;

  // Extra credit past its due date just drops off (not work to catch up on).
  // Catch up: what's worth most toward your grade first (sort keeps the rest in order).
  const overdue = work.filter((e) => e.dueDay < today && !e.optional)
    .sort((a, b) => (b.gradeShare ?? 0) - (a.gradeShare ?? 0));
  const upcoming = work.filter((e) => e.dueDay >= today);
  const moved = upcoming.filter((e) => e.movedTo);
  const pinned = upcoming.filter((e) => !e.movedTo && e.pinned);
  const free = upcoming.filter((e) => !e.movedTo && !e.pinned);
  const rest = free.filter((e) => !e.optional).sort(byDueThenSizeDesc);
  const optionalRest = free.filter((e) => e.optional).sort(byDueThenSizeDesc);

  for (const e of work) e.behind = behind;
  // Catch up: overdue work shows on today but doesn't use today's hours, so it never
  // pushes today's own work off today. Today's bar still counts it (and can go over).
  let catchUpMinutes = 0;
  for (const e of overdue) {
    e.overdue = true;
    e.date = today;
    if (!onDay.has(today)) onDay.set(today, []);
    onDay.get(today).push(e);
    catchUpMinutes += e.minutes;
  }
  // Work you moved to a day yourself (e.g. "Start one from tomorrow") is your choice, so
  // it never makes that day count as over.
  const chosen = new Map();
  for (const e of moved) {
    place(e, e.movedTo);
    chosen.set(e.movedTo, (chosen.get(e.movedTo) ?? 0) + e.minutes);
  }
  for (const e of pinned) place(e, e.lastDay);

  const overflow = [];
  const atRisk = [];
  // Parts of a split item go on different days in order when they can (part 2 the day
  // after part 1 at the earliest), and share a day only when nothing else fits.
  const partDay = new Map(); // item id -> day of its last placed part
  // Days you chose for some of an item's parts: its other parts go elsewhere when they can.
  const chosenPartDays = new Map();
  for (const e of moved) if (e.part) (chosenPartDays.get(e.item.id) ?? chosenPartDays.set(e.item.id, new Set()).get(e.item.id)).add(e.movedTo);
  for (const e of rest) {
    const prev = e.part ? partDay.get(e.item.id) : null;
    const start = maxDate(maxDate(today, e.unlockDate ?? today), prev ? addDays(prev, 1) : today);
    const opensLate = e.unlockDate != null && e.unlockDate > week.cutoff;
    const end = behind || opensLate ? e.lastDay : minDate(e.lastDay, week.cutoff);
    // An empty day takes anything.
    const fits = (d) => usable(d) && ((load.get(d) ?? 0) === 0 || (load.get(d) ?? 0) + e.minutes <= capacity(d));
    const taken = e.part ? chosenPartDays.get(e.item.id) : null;
    const day = dateRange(start, end).find((d) => fits(d) && !taken?.has(d)) ?? dateRange(start, end).find(fits);
    const sameDay = !day && prev && prev <= end && fits(prev) ? prev : null;
    if (day || sameDay) {
      place(e, day ?? sameDay);
      if (e.part) partDay.set(e.item.id, day ?? sameDay);
      continue;
    }
    // No room. If a later target day would give it more days, it's overflow (Add a day
    // helps). Otherwise it has to be done by then anyway: put it on the day in its window
    // that's least over, flag it tight, and report it in atRisk.
    if (!behind && !opensLate && e.lastDay > week.cutoff) {
      overflow.push(e);
      continue;
    }
    const options = dateRange(start, end).filter(usable);
    if (!options.length && prev && prev <= end && usable(prev)) options.push(prev);
    atRisk.push(e);
    if (!options.length) continue; // no usable day at all (e.g. all days off): listed only
    const overBy = (d) => (load.get(d) ?? 0) - capacity(d);
    const best = options.reduce((a, b) => (overBy(b) < overBy(a) ? b : a));
    e.tight = true;
    place(e, best);
    if (e.part) partDay.set(e.item.id, best);
  }

  // Extra credit last, only where it fits in the hours left (an empty day doesn't take
  // anything here). What doesn't fit waits in its own list.
  const extraCredit = [];
  for (const e of optionalRest) {
    const prev = e.part ? partDay.get(e.item.id) : null;
    const start = maxDate(maxDate(today, e.unlockDate ?? today), prev ? addDays(prev, 1) : today);
    const end = behind ? e.lastDay : minDate(e.lastDay, week.end);
    const day = dateRange(start, end).find((d) => usable(d) && (load.get(d) ?? 0) + e.minutes <= capacity(d));
    if (day) {
      place(e, day);
      if (e.part) partDay.set(e.item.id, day);
    } else extraCredit.push(e);
  }

  renumberParts([...onDay.values()].flat().concat(overflow, atRisk.filter((e) => !e.date), extraCredit));

  const lastPlaced = [...onDay.keys()].reduce(maxDate, week.cutoff);
  const days = dateRange(today, maxDate(today, lastPlaced)).map((date) => {
    // Shown load: today's finished work at the time you spent on it, plus catching up.
    const l = (load.get(date) ?? 0) + (date === today ? catchUpMinutes + doneMinutes - doneEstimate : 0);
    return {
      date,
      weekday: weekday(date),
      capacity: capacity(date),
      defaultCapacity: defaultCapacity(date),
      capacityOverridden: override(date) != null,
      blocked: !usable(date),
      load: l,
      chosenMinutes: chosen.get(date) ?? 0, // work you moved here yourself (never makes the day over)
      doneMinutes: date === today ? doneMinutes : 0,
      // Over: more than the day's hours with work still left (not counting work you moved
      // there yourself). Finished work alone going past the hours is extra effort
      // ("bonus"), not a problem.
      over: l - (chosen.get(date) ?? 0) > capacity(date)
        && l - (date === today ? doneMinutes : 0) - (chosen.get(date) ?? 0) > 0,
      bonus: date === today && usable(date) && doneMinutes > capacity(date),
      items: onDay.get(date) ?? [],
    };
  });

  // --- pull next week ---
  // Gate: this week's own work must be done first (if the setting is on; pulled items
  // don't count), then pulling continues until unfinished pulled work reaches the cap.
  const pulledMinutes = sum(work.filter((e) => e.pulledIn));
  const remaining = Math.max(0, (settings.pullCapMinutes ?? Infinity) - pulledMinutes);
  const weekDone = work.every((e) => e.pulledIn || e.optional);
  const unlocked = !settings.gatePullOnCompletion || weekDone;
  // With nothing pulled yet, one item may exceed the cap so a big item is never stuck.
  const fitsOne = (minutes) => minutes <= remaining || pulledMinutes === 0;

  const candidates = entries
    .filter((e) => e.dueDay && e.workDay > week.end && !e.pulledIn && !e.inClass && !movedIn(e))
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
    const due = entries.filter((e) => e.dueDay === date && !e.inClass && !e.floating && !e.optional);
    const minutes = due.reduce((sum, e) => sum + e.minutes, 0);
    return { date, count: due.length, minutes, over: minutes > capacity(date) };
  });

  // --- exams for the side panel: still ahead this week, or due next week and open by
  // the end of this one (so you can pick a day this week to take it) ---
  const opensInTime = (e) => !e.inClass && e.unlockDate != null && e.unlockDate <= week.end
    && e.workDay <= addDays(week.end, 7);
  const exams = entries
    .filter((e) => e.dueDay && e.dueDay >= today && isExam(e.item) && (e.workDay <= week.end || opensInTime(e)))
    .sort((a, b) => Date.parse(a.item.dueAt) - Date.parse(b.item.dueAt));

  // --- dismissed (so a dismissal can be undone) ---
  const dismissed = all
    // A closed item past its Closed window would come back nowhere, so it isn't listed.
    .filter((i) => i.dismissed && !isDone(i) && !i.hidden && courseIncluded(i, settings) && !(isClosed(i, nowMs) && !closedShown(i)))
    .map((i) => toEntry(i, settings, today, shares));

  // --- done this week (for the collapsible Done section) ---
  const done = all
    .filter((i) => isDone(i) && !i.hidden && courseIncluded(i, settings) && (i.dueAt
      ? inWeek(toLocalDate(i.dueAt)) || inWeek(workDueDate(i.dueAt)) || i.pulledIn
      : i.task?.floating && inWeek(doneDay(i) ?? ''))) // a floating task: the week you finished it
    .map((i) => ({ ...toEntry(i, settings, today, shares), canUncheck: !i.canvasDone }));

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
    extraCredit,
    closed,
    dismissed,
    pull,
    forecast,
    exams,
    done,
    // Homework finished today: count and minutes (logged time if any, else the estimate).
    doneToday: {
      count: finishedToday.filter((e) => !e.inClass).length + partsToday.length,
      minutes: doneMinutes,
    },
  };
}

/**
 * Projected plan for next week, as if this week's work were done: items whose work
 * deadline is this week or earlier and items already pulled into this week are left out, and the
 * rest is planned as of next week's first day (its own target day, added days and
 * per-date capacity apply).
 */
export function planNextWeek({ items, settings, weekState = {}, now, shares = {} }) {
  const thisWeek = planningWeek(toLocalDate(now), settings);
  const start = addDays(thisWeek.start, 7);
  const list = (Array.isArray(items) ? items : Object.values(items ?? {}))
    .filter((i) => !i.pulledIn && !i.task?.floating && !(i.dueAt && workDueDate(i.dueAt) <= thisWeek.end)
      // Put on a day this week (an open exam you'll take early): this week's work now.
      && !(i.plannedOn && i.plannedOn >= toLocalDate(now) && i.plannedOn <= thisWeek.end));
  const lookup = Array.isArray(items) ? Object.fromEntries(items.map((i) => [i.id, i])) : items;
  return plan({ items: list, settings, weekState, now: atNoon(start), shares, lookup });
}

/** Can a single item of this many minutes be pulled right now? */
export function canPullItem(pull, minutes) {
  return pull.enabled && (minutes <= pull.remainingMinutes || pull.pulledMinutes === 0);
}

/**
 * Every unfinished item of one class (not dismissed or hidden), as plan entries:
 * earliest due first, items with no due date last.
 */
export function classEntries({ items, settings, courseId, now, shares = {} }) {
  const today = toLocalDate(now);
  return (Array.isArray(items) ? items : Object.values(items ?? {}))
    .filter((i) => i.courseId === String(courseId) && isActive(i, settings) && !isClosed(i, new Date(now).getTime()))
    .map((i) => toEntry(i, settings, today, shares))
    .sort((a, b) => {
      const ta = a.item.dueAt ? Date.parse(a.item.dueAt) : Infinity;
      const tb = b.item.dueAt ? Date.parse(b.item.dueAt) : Infinity;
      return (ta === tb ? 0 : ta < tb ? -1 : 1) || a.item.title.localeCompare(b.item.title) || a.id.localeCompare(b.id);
    });
}
