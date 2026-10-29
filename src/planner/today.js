// What's left today, for the toolbar popup and badge. Pure: same plan as the page.
import { plan } from './plan.js';

const dueTime = (e) => (e.item.dueAt ? Date.parse(e.item.dueAt) : Infinity);

/**
 * { date, remaining, doneCount }: today's planned homework that isn't done (in-class
 * activities left out), overdue first, then by due time; and how many were finished today.
 */
export function todaySummary({ items, settings, weekState = {}, now }) {
  const p = plan({ items, settings, weekState, now });
  const day = p.days.find((d) => d.date === p.today);
  const remaining = (day?.items ?? [])
    .filter((e) => !e.inClass)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || dueTime(a) - dueTime(b) || a.id.localeCompare(b.id));
  return { date: p.today, remaining, doneCount: p.doneToday.count };
}

/** Badge text: today's remaining count, or nothing when there's none. */
export const badgeText = (summary) => (summary.remaining.length ? String(Math.min(summary.remaining.length, 99)) : '');
