process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todaySummary, badgeText } from '../src/planner/today.js';
import { atNoon } from '../src/planner/dates.js';
import { DEFAULT_SETTINGS as S } from '../src/storage/defaults.js';

let n = 0;
const item = (over = {}) => ({
  id: String(++n), courseId: '7', title: `Homework ${n}`, type: 'upload', descriptionText: '',
  minutesOverride: 20, inClass: false, dueAt: '2026-10-07T23:59:00-06:00', unlockAt: null,
  manualDone: false, canvasDone: false, submittedAt: null, doneOn: null, ...over,
});
const now = atNoon('2026-10-06').getTime(); // Tuesday; target day Wednesday

test("today: overdue first, then by due time; in-class and done items left out", () => {
  const late = item({ dueAt: '2026-10-07T21:00:00-06:00' });
  const early = item({ dueAt: '2026-10-07T09:00:00-06:00' });
  const overdue = item({ dueAt: '2026-10-05T23:59:00-06:00' });
  const inClass = item({ dueAt: '2026-10-06T10:00:00-06:00', inClass: true, minutesOverride: null });
  const doneToday = item({ manualDone: true, doneOn: '2026-10-06' });
  const s = todaySummary({ items: [late, early, overdue, inClass, doneToday], settings: S, now });
  assert.equal(s.date, '2026-10-06');
  assert.deepEqual(s.remaining.map((e) => e.id), [overdue.id, early.id, late.id]);
  assert.equal(s.doneCount, 1);
  assert.equal(badgeText(s), '3');
});

test('today: nothing left gives an empty badge; big counts are capped', () => {
  assert.equal(badgeText(todaySummary({ items: [], settings: S, now })), '');
  assert.equal(badgeText({ remaining: Array(120) }), '99');
});
