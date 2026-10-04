// Local calendar-date helpers. A "date" here is a 'YYYY-MM-DD' string in the
// browser's local timezone. Day math goes through the calendar (year/month/day),
// never by adding 24 h to a timestamp, so daylight saving can't shift a day.

const pad = (n) => String(n).padStart(2, '0');

/** Local 'YYYY-MM-DD' for a Date, ms timestamp, or ISO string. */
export function toLocalDate(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Noon on the given local date. Noon is never skipped or repeated by DST. */
export function atNoon(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return toLocalDate(new Date(y, m - 1, d + n, 12));
}

/** 0 = Sunday ... 6 = Saturday, like Date#getDay. */
export function weekday(date) {
  return atNoon(date).getDay();
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a, b) {
  const utc = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** Every date from start to end, inclusive. Empty if start > end. */
export function dateRange(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const minDate = (a, b) => (a <= b ? a : b);
export const maxDate = (a, b) => (a >= b ? a : b);

/** Minutes after local midnight for a timestamp. */
export function localMinutes(value) {
  const d = new Date(value);
  return d.getHours() * 60 + d.getMinutes();
}

// Work due before this local time has to be finished the previous day.
export const EARLY_DUE_MINUTES = 17 * 60;

/** The last local date an item can be worked on, given its Canvas due timestamp. */
export function workDueDate(dueAt) {
  const date = toLocalDate(dueAt);
  return localMinutes(dueAt) < EARLY_DUE_MINUTES ? addDays(date, -1) : date;
}

/**
 * The planning week containing `today`.
 * start: most recent weekStartDay on or before today. end: start + 6.
 * targetDate: first targetDay on or after start. cutoff: targetDate + extraDays,
 * never past end.
 */
export function planningWeek(today, { weekStartDay, targetDay }, extraDays = 0) {
  const start = addDays(today, -((weekday(today) - weekStartDay + 7) % 7));
  const end = addDays(start, 6);
  const targetDate = addDays(start, (targetDay - weekStartDay + 7) % 7);
  const maxExtra = daysBetween(targetDate, end);
  const extra = Math.min(Math.max(0, Math.trunc(extraDays) || 0), maxExtra);
  return { start, end, targetDate, extraDays: extra, maxExtraDays: maxExtra, cutoff: addDays(targetDate, extra) };
}
