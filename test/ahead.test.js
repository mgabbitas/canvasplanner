process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysAhead, isLateNight, daysEarly, progressCheer } from '../src/planner/ahead.js';

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

test('daysEarly: whole days before the due date, never negative', () => {
  assert.equal(daysEarly({ dueAt: '2026-10-09T23:59:00-06:00' }, '2026-10-07'), 2);
  assert.equal(daysEarly({ dueAt: '2026-10-09T23:59:00-06:00' }, '2026-10-09'), 0);
  assert.equal(daysEarly({ dueAt: '2026-10-09T23:59:00-06:00' }, '2026-10-11'), 0);
  assert.equal(daysEarly({ dueAt: null }, '2026-10-07'), 0);
  // Across the DST change (1 Nov 2026).
  assert.equal(daysEarly({ dueAt: '2026-11-02T23:59:00-07:00' }, '2026-10-31'), 2);
});

test('progressCheer: only on a change seen by this page', () => {
  const base = { days: 0, weekDone: false, onTime: true, todayClear: false, doneToday: 1 };
  assert.equal(progressCheer(null, { ...base, todayClear: true }), null); // first look: no cheer
  assert.equal(progressCheer(base, { ...base, todayClear: true }), 'today');
  assert.equal(progressCheer(base, { ...base, todayClear: true, doneToday: 0 }), null); // nothing done: just empty
  assert.equal(progressCheer(base, { ...base, days: 1, todayClear: true }), 'ahead');
  assert.equal(progressCheer(base, { ...base, days: 2, weekDone: true, todayClear: true }), 'week');
  assert.equal(progressCheer(base, { ...base, weekDone: true, onTime: false, todayClear: true }), 'today');
  const clear = { ...base, todayClear: true };
  assert.equal(progressCheer(clear, clear), null); // no repeats
});

test('daysAhead: work with no day to sit on means the week is not done', () => {
  const p = plan([day('2026-10-05'), day('2026-10-06')]);
  p.atRisk = [{ inClass: false, date: null }];
  assert.equal(daysAhead(p).weekDone, false);
  p.atRisk = [{ inClass: false, date: '2026-10-06' }]; // placed (tight): its day shows it
  assert.equal(daysAhead(p).weekDone, true);
});

test('daysAhead: extra credit on a day never stands in the way', () => {
  const p = plan([day('2026-10-05'), { date: '2026-10-06', blocked: false, items: [{ inClass: false, optional: true }] }]);
  assert.deepEqual(daysAhead(p), { days: 1, weekDone: true });
});

test('progressCheer: going past your hours with finished work', () => {
  const base = { days: 0, weekDone: false, onTime: true, todayClear: true, doneToday: 3, bonus: false };
  assert.equal(progressCheer(base, { ...base, bonus: true }), 'extra');
  assert.equal(progressCheer({ ...base, bonus: true }, { ...base, bonus: true }), null);
});
