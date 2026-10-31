// Calendar export: your plan as an .ics file (RFC 5545) of all-day events on each
// item's target day. Pure: the plans and `now` come in as arguments.
import { addDays } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
const icsDate = (ymd) => ymd.replaceAll('-', '');
function stamp(now) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
/** Local "Fri Oct 30, 11:59 PM"-style text without depending on the browser locale. */
function localDue(iso) {
  const d = new Date(iso);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const h = d.getHours() % 12 || 12;
  return `${day} ${month} ${d.getDate()}, ${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}
const minutes = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

/** Escape text values: backslash, semicolon, comma, newline. */
export const escapeText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets (continuation lines start with a space). */
export function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let chunk = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(chunk); chunk = ''; size = 0; }
    chunk += ch;
    size += n;
  }
  out.push(chunk);
  return out.join('\r\n ');
}

/**
 * The .ics text for plans (this week's and next week's): one all-day event per
 * planned homework item or split part, on the day it's planned. courseName(id) names classes.
 */
export function buildIcs(plans, { now, courseName }) {
  const seen = new Set();
  const events = [];
  for (const p of plans) {
    for (const day of p.days) {
      for (const e of day.items) {
        if (e.inClass || seen.has(e.id)) continue;
        seen.add(e.id);
        const part = e.part ? ` (part ${e.part.n} of ${e.part.of})` : '';
        const notes = [
          courseName(e.item.courseId),
          e.item.dueAt ? `Due ${localDue(e.item.dueAt)}` : 'No due date',
          `About ${minutes(e.minutes)}`,
          e.item.task?.notes || null,
          e.item.url,
        ].filter(Boolean).join('\n');
        events.push([
          'BEGIN:VEVENT',
          `UID:${e.id.replace(/[^a-z0-9#-]/gi, '')}@canvas-planner`,
          `DTSTAMP:${stamp(now)}`,
          `DTSTART;VALUE=DATE:${icsDate(day.date)}`,
          `DTEND;VALUE=DATE:${icsDate(addDays(day.date, 1))}`,
          `SUMMARY:${escapeText(`${e.item.title}${part}`)}`,
          `DESCRIPTION:${escapeText(notes)}`,
          e.item.url ? `URL:${e.item.url}` : null,
          'TRANSP:TRANSPARENT',
          'END:VEVENT',
        ].filter(Boolean));
      }
    }
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planner for Canvas//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Planner for Canvas', ...events.flat(), 'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
