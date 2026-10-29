// Streaks: weeks in a row finished by the target day, and days in a row where you
// finished what the planner gave you. Pure: `now` comes in as an argument.
import { toLocalDate, planningWeek } from './dates.js';
import { estimate } from './estimate.js';
import { isDone, doneDay } from './plan.js';

const list = (items) => (Array.isArray(items) ? items : Object.values(items ?? {}));
const courseIncluded = (item, settings) => settings.courses?.[item.courseId]?.include !== false;

/** Homework the streaks look at: not in-class, not dismissed or hidden, not filtered out. */
const counts = (item, settings) => !item.dismissed && !item.hidden && courseIncluded(item, settings)
  && (settings.includeNonSubmittable || !item.nonSubmittable) && !estimate(item, settings).inClass;

/** Done on or before `date`. A done item with no known finish day gets the benefit of the doubt. */
function doneBy(item, date) {
  if (!isDone(item)) return false;
  const d = doneDay(item);
  return d == null || d <= date;
}

/** Longest run of 'hit' and the run ending at the latest settled period; 'skip' never breaks a run. */
function runs(statuses) {
  let run = 0;
  let best = 0;
  for (const s of statuses) {
    if (s === 'hit') best = Math.max(best, ++run);
    else if (s === 'miss') run = 0;
  }
  return { current: run, best };
}

/** The ids of today's planned homework that's still undone (stored in dayLog each render). */
export function plannedToday(p) {
  const today = p.days.find((d) => d.date === p.today);
  return (today?.items ?? []).filter((e) => !e.inClass).map((e) => e.id).sort();
}

/**
 * Days on plan. dayLog maps a date to { left: [ids] }: the homework still planned for
 * that day the last time the page looked. A day is a hit if all of it was done by the
 * end of that day and something was planned or done; a day with nothing either way,
 * or one never recorded, is skipped. Today only counts once it's a hit.
 * Returns { current, best, today: 'hit' | 'open' | 'none' }.
 */
export function dayStreak({ items, settings, dayLog = {}, now }) {
  const today = toLocalDate(now);
  const all = list(items);
  const byId = new Map(all.map((i) => [i.id, i]));
  const finished = new Map(); // date -> homework finished that day
  for (const i of all) {
    const d = doneDay(i);
    if (d && counts(i, settings)) finished.set(d, (finished.get(d) ?? 0) + 1);
  }
  const status = (date) => {
    const left = dayLog[date]?.left ?? [];
    const allDone = left.every((id) => {
      const i = byId.get(id);
      return !i || !counts(i, settings) || doneBy(i, date);
    });
    if (!allDone) return date === today ? 'open' : 'miss';
    return left.length || finished.get(date) ? 'hit' : 'none';
  };
  const dates = Object.keys(dayLog).filter((d) => d <= today).sort();
  const statuses = dates.map(status);
  const todayStatus = dayLog[today] ? statuses.at(-1) : 'none';
  return { ...runs(statuses.map((s) => (s === 'hit' ? 'hit' : s === 'miss' ? 'miss' : 'skip'))), today: todayStatus };
}

/**
 * Weeks on target. A week's homework is the work due in it; each item must be done by
 * the week's target day (plus added days), or by its due day if it opens after that.
 * A week is a miss once any item is late, a hit once all are done in time, and
 * pending otherwise. Weeks with no homework are skipped.
 * Returns { current, best, thisWeek: 'hit' | 'pending' | 'miss' | 'none' }.
 */
export function weekStreak({ items, settings, weekState = {}, now }) {
  const today = toLocalDate(now);
  const thisWeek = planningWeek(today, settings).start;
  const weeks = new Map(); // week start -> items due that week
  for (const i of list(items)) {
    // Repeats of your tasks are daily habits, not the week's deliverables.
    if (!i.dueAt || !counts(i, settings) || i.task?.seriesId) continue;
    const start = planningWeek(toLocalDate(i.dueAt), settings).start;
    if (start > thisWeek) continue;
    if (!weeks.has(start)) weeks.set(start, []);
    weeks.get(start).push(i);
  }
  const status = (start, due) => {
    const { cutoff } = planningWeek(start, settings, weekState[start]?.extraDays ?? 0);
    let pending = false;
    for (const i of due) {
      const opens = i.unlockAt ? toLocalDate(i.unlockAt) : null;
      const deadline = opens && opens > cutoff ? toLocalDate(i.dueAt) : cutoff;
      if (doneBy(i, deadline)) continue;
      if (isDone(i) || today > deadline) return 'miss';
      pending = true;
    }
    return pending ? 'pending' : 'hit';
  };
  const starts = [...weeks.keys()].sort();
  const statuses = starts.map((s) => status(s, weeks.get(s)));
  const thisStatus = weeks.has(thisWeek) ? statuses.at(-1) : 'none';
  return { ...runs(statuses.map((s) => (s === 'pending' ? 'skip' : s))), thisWeek: thisStatus };
}
