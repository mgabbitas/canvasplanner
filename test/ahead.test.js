process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysAhead, isLateNight } from '../src/planner/ahead.js';

const day = (date, n = 0, blocked = false) => ({ date, blocked, items: Array.from({ length: n }, () => ({ inClass: false })) });
const plan = (days, { doneToday = 1, done = 1 } = {}) => ({
  today: days[0].date, days, doneToday: { count: doneToday }, done: Array(done).fill({}), overflow: [],
});

test('days ahead: counts clear days after a finished today, up to the first with work', () => {
  assert.deepEqual(daysAhead(plan([day('2026-10-05', 1), day('2026-10-06')])), { days: 0, weekDone: false }); // today not done
  assert.deepEqual(daysAhead(plan([day('2026-10-05'), day('2026-10-06', 2)])), { days: 0, weekDone: false });
  assert.deepEqual(daysAhead(plan([day('2026-10-05'), day('2026-10-06'), day('2026-10-07', true && 0, true), day('2026-10-08', 1)])),
    { days: 1, weekDone: false }); // the day off is skipped, not counted
  assert.deepEqual(daysAhead(plan([day('2026-10-05'), day('2026-10-06'), day('2026-10-07')])), { days: 2, weekDone: true });
  // In-class activities don't count as work left.
  assert.deepEqual(daysAhead(plan([day('2026-10-05'), { date: '2026-10-06', blocked: false, items: [{ inClass: true }] }])), { days: 1, weekDone: true });
});

test('days ahead: an empty week with nothing done is not "ahead"', () => {
  assert.deepEqual(daysAhead(plan([day('2026-10-05'), day('2026-10-06')], { doneToday: 0, done: 0 })), { days: 0, weekDone: false });
});

test('late night is midnight to 4 AM', () => {
  assert.deepEqual([23, 0, 2, 3, 4].map(isLateNight), [false, true, true, true, false]);
});
