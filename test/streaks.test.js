process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStreak, weekStreak, plannedToday } from '../src/planner/streaks.js';
import { atNoon } from '../src/planner/dates.js';
import { DEFAULT_SETTINGS as S } from '../src/storage/defaults.js';

// Weeks start Monday, target Wednesday: 2026-10-05 (cutoff 10-07), 10-12 (10-14), 10-19 (10-21).
let n = 0;
const item = (over = {}) => ({
  id: String(++n), courseId: '7', title: 'Homework', type: 'upload', descriptionText: '',
  minutesOverride: null, inClass: false, dueAt: '2026-10-09T23:59:00-06:00', unlockAt: null,
  manualDone: false, canvasDone: false, submittedAt: null, doneOn: null, ...over,
});
const done = (doneOn, over = {}) => item({ manualDone: true, doneOn, ...over });
const now = (date) => atNoon(date).getTime();

test('weeks on target: done by the target day, added days move it', () => {
  const items = [
    done('2026-10-06'), // week of 10-05: hit
    done('2026-10-15', { dueAt: '2026-10-16T23:59:00-06:00' }), // week of 10-12: a day late
    done('2026-10-13', { dueAt: '2026-10-23T23:59:00-06:00' }), // week of 10-19: hit
  ];
  assert.deepEqual(weekStreak({ items, settings: S, now: now('2026-10-24') }), { current: 1, best: 1, thisWeek: 'hit' });
  const weekState = { '2026-10-12': { extraDays: 1, capacity: {} } };
  assert.deepEqual(weekStreak({ items, settings: S, weekState, now: now('2026-10-24') }), { current: 3, best: 3, thisWeek: 'hit' });
});

test('weeks on target: the current week is pending until settled, then can miss', () => {
  const items = [done('2026-10-06'), item({ dueAt: '2026-10-23T23:59:00-06:00' })];
  assert.deepEqual(weekStreak({ items, settings: S, now: now('2026-10-20') }), { current: 1, best: 1, thisWeek: 'pending' });
  assert.deepEqual(weekStreak({ items, settings: S, now: now('2026-10-22') }), { current: 0, best: 1, thisWeek: 'miss' });
});

test('weeks on target: Canvas submissions use local time; late openers, in-class and dismissed', () => {
  const items = [
    // 23:30 on Wed 10-07 in Denver is 05:30 UTC on 10-08.
    item({ canvasDone: true, submittedAt: '2026-10-08T05:30:00Z' }),
    // Opens Saturday (after the target day), so its due day is the deadline.
    done('2026-10-25', { unlockAt: '2026-10-24T06:00:00Z', dueAt: '2026-10-25T23:59:00-06:00' }),
    done('2026-10-23', { inClass: true, dueAt: '2026-10-23T10:00:00-06:00' }),
    item({ dismissed: true, dueAt: '2026-10-20T23:59:00-06:00' }),
    // Graded with no submitted time: counted as on time.
    item({ canvasDone: true, dueAt: '2026-10-21T23:59:00-06:00' }),
  ];
  assert.deepEqual(weekStreak({ items, settings: S, now: now('2026-10-26') }), { current: 2, best: 2, thisWeek: 'none' });
});

test('weeks on target: weeks with no homework and future weeks are skipped', () => {
  const items = [done('2026-10-06'), done('2026-10-20', { dueAt: '2026-10-21T23:59:00-06:00' }), done('2026-10-20', { dueAt: '2026-11-04T23:59:00-07:00' })];
  assert.deepEqual(weekStreak({ items, settings: S, now: now('2026-10-24') }), { current: 2, best: 2, thisWeek: 'hit' });
  assert.deepEqual(weekStreak({ items: [], settings: S, now: now('2026-10-24') }), { current: 0, best: 0, thisWeek: 'none' });
});

test('days on plan: hits, skips, late Canvas submissions and a miss', () => {
  const a = done('2026-10-20');
  const b = item({ canvasDone: true, submittedAt: '2026-10-23T04:00:00Z' }); // 22:00 on 10-22 local
  const c = done('2026-10-24'); // planned for 10-23, finished a day late
  const d = item();
  const items = [a, b, c, d];
  const dayLog = {
    '2026-10-20': { left: [a.id] },
    '2026-10-21': { left: [] }, // nothing planned, nothing done
    '2026-10-22': { left: [b.id, '999'] }, // an id that no longer exists doesn't block
  };
  assert.deepEqual(dayStreak({ items, settings: S, dayLog, now: now('2026-10-22') }), { current: 2, best: 2, today: 'hit' });
  const later = { ...dayLog, '2026-10-23': { left: [c.id] }, '2026-10-24': { left: [d.id] } };
  assert.deepEqual(dayStreak({ items, settings: S, dayLog: later, now: now('2026-10-24') }), { current: 0, best: 2, today: 'open' });
});

test('days on plan: today counts once cleared, with work done that day', () => {
  const items = [done('2026-10-24')];
  assert.deepEqual(dayStreak({ items, settings: S, dayLog: { '2026-10-24': { left: [] } }, now: now('2026-10-24') }),
    { current: 1, best: 1, today: 'hit' });
  // An unrecorded gap doesn't break it.
  const dayLog = { '2026-10-20': { left: [] }, '2026-10-24': { left: [] } };
  const two = [done('2026-10-20'), ...items];
  assert.equal(dayStreak({ items: two, settings: S, dayLog, now: now('2026-10-24') }).current, 2);
  assert.deepEqual(dayStreak({ items: [], settings: S, dayLog: {}, now: now('2026-10-24') }), { current: 0, best: 0, today: 'none' });
});

test('plannedToday: undone homework on today, sorted, in-class left out', () => {
  const p = { today: '2026-10-24', days: [{ date: '2026-10-24', items: [{ id: '20' }, { id: '10' }, { id: '30', inClass: true }] }] };
  assert.deepEqual(plannedToday(p), ['10', '20']);
  assert.deepEqual(plannedToday({ today: '2026-10-24', days: [] }), []);
});
