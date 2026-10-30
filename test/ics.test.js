process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, escapeText, fold } from '../src/planner/ics.js';

const entry = (id, over = {}) => ({
  id, minutes: 45, inClass: false,
  item: { courseId: '7', title: `Essay, part ${id}`, dueAt: '2026-10-31T05:59:00Z', url: 'https://byui.instructure.com/courses/7/assignments/1', task: null },
  ...over,
});
const plans = [{
  days: [
    { date: '2026-10-29', items: [entry('1'), entry('2', { inClass: true })] },
    { date: '2026-10-31', items: [entry('3', { part: { n: 2, of: 4 }, id: '3#2' })] },
  ],
}, { days: [{ date: '2026-11-02', items: [entry('1'), entry('4', { item: { courseId: '7', title: 'Study', dueAt: null, url: null, task: { notes: 'ch 4' } } })] }] }];

test('ics: all-day events on the planned day, due date in the notes', () => {
  const ics = buildIcs(plans, { now: Date.UTC(2026, 9, 29, 18, 0), courseName: () => 'Physics' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  const events = ics.split('BEGIN:VEVENT').slice(1);
  assert.equal(events.length, 3); // in-class left out; item 1 only once
  const flat = ics.replace(/\r\n /g, '');
  assert.match(flat, /DTSTART;VALUE=DATE:20261029\r\nDTEND;VALUE=DATE:20261030/);
  assert.match(flat, /SUMMARY:Essay\\, part 1\r\n/);
  assert.match(flat, /DESCRIPTION:Physics\\nDue Fri Oct 30\\, 11:59 PM\\nAbout 45m\\nhttps:\/\/byui/);
  assert.match(flat, /SUMMARY:Essay\\, part 3 \(part 2 of 4\)/);
  assert.match(flat, /UID:3#2@canvas-planner/);
  assert.match(flat, /SUMMARY:Study\r\nDESCRIPTION:Physics\\nNo due date\\nAbout 45m\\nch 4\r\n/);
  assert.match(flat, /DTSTAMP:20261029T180000Z/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('ics: escaping and folding', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
  const long = `SUMMARY:${'é'.repeat(60)}`;
  const folded = fold(long);
  assert.equal(folded.replace(/\r\n /g, ''), long);
  assert.ok(folded.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});
