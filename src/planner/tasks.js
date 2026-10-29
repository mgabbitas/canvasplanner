// Your own tasks: items you add for a class (no Canvas link). One-off tasks are items
// with a `task` field; repeating tasks are a series that creates one item per chosen
// weekday as the days come up. Pure: today comes in as an argument.
import { addDays, dateRange, planningWeek, weekday } from './dates.js';

/** Task item ids: t<letters/digits>; repeat copies are <seriesId>-YYYYMMDD. */
export const TASK_ID = /^[ts][a-z0-9]{1,24}(-\d{8})?$/;
export const isTask = (item) => Boolean(item?.task);

const KEEP_MISSED_DAYS = 14;
const isDone = (item) => Boolean(item.manualDone || item.canvasDone); // as in plan.js

/** End of a local calendar day as a UTC ISO string: a task due that day. */
export function endOfDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59).toISOString();
}

/**
 * A task item. dueDate 'YYYY-MM-DD', or null for a floating task (any time this week).
 * seriesId marks a repeat copy, pinned to its day.
 */
export function taskItem({ id, courseId, title, minutes, dueDate = null, notes = '', seriesId = null }) {
  return {
    id, courseId: String(courseId), title, type: 'other', nonSubmittable: false,
    dueAt: dueDate ? endOfDay(dueDate) : null, unlockAt: null, lockAt: null, points: null,
    canvasStatus: null, canvasDone: false, submittedAt: null, descriptionText: '', url: null,
    prevDueAt: null, hidden: false,
    manualDone: false, minutesOverride: minutes, pinned: Boolean(seriesId), dismissed: false, pulledIn: false,
    inClass: false, log: null, doneOn: null, plannedOn: null, notExam: true,
    task: { notes, floating: !dueDate && !seriesId, seriesId },
  };
}

const occurrenceId = (seriesId, date) => `${seriesId}-${date.replaceAll('-', '')}`;
const occurrenceDate = (item) => item.dueAt && item.task?.seriesId ? item.id.slice(-8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : null;

/**
 * Bring repeat copies up to date: create the missing ones from today through the end
 * of next week, and remove old missed ones (not done, nothing logged) after two weeks.
 * Returns the same object when nothing changed.
 */
export function syncSeries(items, taskSeries, today, settings) {
  const horizon = addDays(planningWeek(today, settings).end, 7);
  let out = items;
  const change = () => { if (out === items) out = { ...items }; };
  for (const s of Object.values(taskSeries ?? {})) {
    const from = s.start > today ? s.start : today;
    const to = s.until && s.until < horizon ? s.until : horizon;
    if (from > to) continue;
    for (const date of dateRange(from, to)) {
      if (!s.weekdays.includes(weekday(date))) continue;
      const id = occurrenceId(s.id, date);
      if (out[id]) continue;
      change();
      out[id] = taskItem({ id, courseId: s.courseId, title: s.title, minutes: s.minutes, dueDate: date, notes: s.notes, seriesId: s.id });
    }
  }
  const oldest = addDays(today, -KEEP_MISSED_DAYS);
  for (const [id, item] of Object.entries(out)) {
    const date = occurrenceDate(item);
    if (date && date < oldest && !isDone(item) && !item.log) {
      change();
      delete out[id];
    }
  }
  return out;
}

/** Remove a series' copies from today on that aren't done (before re-creating or deleting it). */
export function dropFutureCopies(items, seriesId, today) {
  const out = { ...items };
  for (const [id, item] of Object.entries(items)) {
    if (item.task?.seriesId === seriesId && occurrenceDate(item) >= today && !isDone(item) && !item.log) delete out[id];
  }
  return out;
}

/** A missed repeat: its day has passed and it wasn't done. The planner drops these. */
export const isMissedRepeat = (item, today) => {
  const date = occurrenceDate(item);
  return date != null && date < today && !isDone(item);
};
