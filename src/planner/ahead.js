// "You're N days ahead", "done early" and other cheers. Pure: works on a plan from plan().
import { toLocalDate, daysBetween } from './dates.js';

// Extra credit is optional, so it never stands between you and "ahead".
const homework = (items) => items.filter((e) => !e.inClass && !e.optional);

/**
 * { days, weekDone }: once today's homework is all done (and something got done this
 * week), how many of the following days (days off skipped) have no homework left,
 * up to the first one that still does. weekDone: nothing left this week at all.
 */
export function daysAhead(p) {
  const today = p.days.find((d) => d.date === p.today);
  const none = { days: 0, weekDone: false };
  if (!today || homework(today.items).length) return none;
  if (!p.doneToday.count && !p.done.length) return none; // nothing done yet: not "ahead", just empty
  let days = 0;
  for (const d of p.days) {
    if (d.date <= p.today || d.blocked) continue;
    if (homework(d.items).length) return { days, weekDone: false };
    days++;
  }
  // Work with no day to sit on (won't fit, or can't fit before it's due) still counts.
  const unplaced = [...(p.overflow ?? []), ...(p.atRisk ?? []).filter((e) => !e.date)];
  return { days, weekDone: !homework(unplaced).length };
}

/** Between midnight and 4 AM: late enough to suggest bed. */
export const isLateNight = (hour) => hour >= 0 && hour < 4;

/** Whole days between finishing on `today` and the item's due date (0 if due today, late or none). */
export function daysEarly(item, today) {
  if (!item?.dueAt) return 0;
  return Math.max(0, daysBetween(today, toLocalDate(item.dueAt)));
}

/**
 * Which cheer a change in progress earns, comparing what this page saw before (`before`)
 * with now. Only changes count, so opening a new tab never repeats one.
 * Returns 'week' | 'ahead' | 'extra' | 'today' | null.
 */
export function progressCheer(before, now) {
  if (!before) return null;
  if (now.weekDone && !before.weekDone && now.onTime) return 'week';
  if (now.days > before.days) return 'ahead';
  if (now.bonus && !before.bonus) return 'extra';
  if (now.todayClear && !before.todayClear && now.doneToday > 0) return 'today';
  return null;
}

