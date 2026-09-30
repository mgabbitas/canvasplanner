process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toLocalDate, addDays, weekday, daysBetween, dateRange, workDueDate, planningWeek,
} from '../src/planner/dates.js';

test('UTC timestamps bucket into the local day', () => {
  // 11:59:59 PM Saturday in Denver is already Sunday in UTC.
  assert.equal(toLocalDate('2026-10-04T05:59:59Z'), '2026-10-03');
});

test('DST end on 1 Nov 2026: dates stay on the calendar', () => {
  // W07 Evaluation: due 11:59:59 PM Sunday 1 Nov, after clocks fall back (UTC-7).
  assert.equal(toLocalDate('2026-11-02T06:59:59Z'), '2026-11-01');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(addDays('2026-11-02', -1), '2026-11-01');
  assert.deepEqual(dateRange('2026-10-26', '2026-11-01').length, 7);
  assert.equal(daysBetween('2026-10-26', '2026-11-02'), 7);
  // Adding 24 h to a timestamp would land on 11 PM Nov 1, not Nov 2.
  const naive = new Date(new Date(2026, 10, 1, 0, 0).getTime() + 86_400_000);
  assert.equal(toLocalDate(naive), '2026-11-01');
});

test('DST start in March is also safe', () => {
  assert.equal(addDays('2027-03-13', 1), '2027-03-14');
  assert.equal(addDays('2027-03-14', 1), '2027-03-15');
});

test('weekday', () => {
  assert.equal(weekday('2026-09-28'), 1); // Monday
  assert.equal(weekday('2026-11-01'), 0); // Sunday
});

test('work due date: before 5 PM means the day before', () => {
  assert.equal(workDueDate('2026-10-02T15:00:00Z'), '2026-10-01'); // 9:00 AM Fri
  assert.equal(workDueDate('2026-10-02T22:59:00Z'), '2026-10-01'); // 4:59 PM Fri
  assert.equal(workDueDate('2026-10-02T23:00:00Z'), '2026-10-02'); // 5:00 PM Fri
  assert.equal(workDueDate('2026-10-03T05:59:00Z'), '2026-10-02'); // 11:59 PM Fri
});

test('planning week and cutoff', () => {
  const s = { weekStartDay: 1, targetDay: 3 };
  assert.deepEqual(planningWeek('2026-09-30', s), {
    start: '2026-09-28', end: '2026-10-04', targetDate: '2026-09-30',
    extraDays: 0, maxExtraDays: 4, cutoff: '2026-09-30',
  });
  assert.equal(planningWeek('2026-10-04', s).start, '2026-09-28'); // Sunday belongs to that week
  assert.equal(planningWeek('2026-09-30', s, 2).cutoff, '2026-10-02');
  assert.equal(planningWeek('2026-09-30', s, 99).cutoff, '2026-10-04'); // clamped to week end
  assert.equal(planningWeek('2026-09-30', s, -3).cutoff, '2026-09-30');
});
