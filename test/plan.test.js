process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, planNextWeek, classEntries } from '../src/planner/plan.js';
import { DEFAULT_SETTINGS as S, USER_FIELD_DEFAULTS } from '../src/storage/defaults.js';
import { normalizeAssignment } from '../src/sync/normalize.js';
import { mergeCourse } from '../src/storage/merge.js';
import { fixture, needsFixture, findRaw } from './helpers.js';

// Local 'YYYY-MM-DD HH:MM' -> UTC ISO, the way Canvas sends it.
const iso = (local) => {
  const [d, t = '23:59'] = local.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  return new Date(y, m - 1, day, h, min).toISOString();
};

let nextId = 1;
const mk = (over = {}) => {
  const { due, unlock, ...rest } = over;
  const id = String(nextId++);
  return {
    id, courseId: '1', title: `Item ${id.padStart(3, '0')}`, type: 'upload', nonSubmittable: false,
    dueAt: due === null ? null : iso(due ?? '2026-10-03'), unlockAt: unlock ? iso(unlock) : null,
    lockAt: null, points: 100, canvasStatus: 'unsubmitted', canvasDone: false, submittedAt: null,
    descriptionText: '', url: null, prevDueAt: null, hidden: false,
    ...USER_FIELD_DEFAULTS, minutesOverride: 20, ...rest,
  };
};
const many = (n, over) => Array.from({ length: n }, () => mk(over));

const MON = '2026-09-28 08:00';
const run = (items, over = {}) =>
  plan({ items, settings: { ...S, ...over.settings }, weekState: over.weekState ?? {}, now: iso(over.now ?? MON) });
const placedOn = (p) => Object.fromEntries(p.days.map((d) => [d.date, d.items.map((e) => e.id)]));
const dateOf = (p, id) => p.days.find((d) => d.items.some((e) => e.id === id))?.date ?? null;

test('scenario 1: sixteen items due Saturday are spread within capacity by Wednesday', () => {
  const p = run(many(16, { due: '2026-10-03 23:59', minutesOverride: 20 })); // 16 x 20 min
  assert.equal(p.week.cutoff, '2026-09-30');
  assert.deepEqual(p.days.map((d) => [d.date, d.load]), [
    ['2026-09-28', 120], ['2026-09-29', 120], ['2026-09-30', 80],
  ]);
  assert.equal(p.overflow.length, 0);
  assert.ok(p.days.every((d) => !d.over));
});

test('scenario 2: overflow appears, then Add a day resolves it', () => {
  const items = many(7, { due: '2026-10-03', minutesOverride: 45 }); // 7 x 45 min, 2 fit per day
  const before = run(items);
  assert.equal(before.overflow.length, 1);
  assert.equal(before.overflowMinutes, 45);
  assert.equal(before.week.canAddDay, true);

  const after = run(items, { weekState: { '2026-09-28': { extraDays: 1 } } });
  assert.equal(after.week.cutoff, '2026-10-01');
  assert.equal(after.overflow.length, 0);
  assert.equal(after.days.at(-1).date, '2026-10-01');
  assert.equal(after.week.canRemoveDay, true);

  // Can't go past the end of the planning week.
  const max = run(items, { weekState: { '2026-09-28': { extraDays: 9 } } });
  assert.equal(max.week.cutoff, '2026-10-04');
  assert.equal(max.week.canAddDay, false);
});

test('scenario 3: Wednesday passed, items flagged behind and scheduled ASAP', () => {
  const items = many(10, { due: '2026-10-03', minutesOverride: 45 });
  const p = run(items, { now: '2026-10-01 09:00' }); // Thursday
  assert.equal(p.behind, true);
  assert.deepEqual(p.days.map((d) => [d.date, d.items.length]), [
    ['2026-10-01', 2], ['2026-10-02', 2], ['2026-10-03', 2],
  ]);
  assert.ok(p.days.flatMap((d) => d.items).every((e) => e.behind));
  assert.equal(p.atRisk.length, 4);
  assert.equal(p.overflow.length, 0);
});

test('scenario 4: a locked item is never scheduled before its unlock date', () => {
  const opensWed = mk({ due: '2026-10-03', unlock: '2026-09-30 00:00' });
  const opensThu = mk({ due: '2026-10-03', unlock: '2026-10-01 00:00' });
  const p = run([opensWed, opensThu]);
  assert.equal(dateOf(p, opensWed.id), '2026-09-30');
  // Unlocks after the cutoff: window is unlock date through due date.
  assert.equal(dateOf(p, opensThu.id), '2026-10-01');
  assert.equal(p.days.find((d) => d.date === '2026-10-01').items[0].notOpenYet, true);
});

test('scenario 5: graded with null submitted_at is done, not planned', () => {
  const graded = mk({ canvasStatus: 'graded', canvasDone: true, submittedAt: null });
  const p = run([graded]);
  assert.equal(p.days.flatMap((d) => d.items).length, 0);
  assert.deepEqual(p.done.map((e) => [e.id, e.canUncheck]), [[graded.id, false]]);
});

test('scenario 6: DST change on 1 Nov 2026', () => {
  // Week of Mon 26 Oct. Clocks fall back at 2 AM Sunday 1 Nov.
  const evalItem = mk({
    dueAt: '2026-11-02T06:59:59Z', // 11:59:59 PM Sun 1 Nov MST
    unlockAt: '2026-10-26T06:00:00Z', // 12:00 AM Mon 26 Oct MDT
    minutesOverride: 5,
  });
  const lateOpen = mk({ due: '2026-11-01 23:59', unlock: '2026-10-31 00:00' });
  const p = run([evalItem, lateOpen], { now: '2026-10-26 10:00' });
  assert.equal(p.week.start, '2026-10-26');
  assert.equal(p.week.end, '2026-11-01');
  assert.equal(dateOf(p, evalItem.id), '2026-10-26');
  assert.equal(dateOf(p, lateOpen.id), '2026-10-31');

  // Behind plan on Sunday 1 Nov itself: still schedulable that day.
  const sun = run([evalItem], { now: '2026-11-01 20:00' });
  assert.equal(sun.week.start, '2026-10-26');
  assert.equal(dateOf(sun, evalItem.id), '2026-11-01');
  assert.equal(sun.overdue.length, 0);

  // Monday 2 Nov is a new week; the item is no longer in scope.
  assert.equal(run([evalItem], { now: '2026-11-02 08:00' }).week.start, '2026-11-02');
});

test('scenario 7a: blocked weekday is never used', () => {
  const p = run(many(3, { minutesOverride: 120 }), { settings: { blockedWeekdays: [2] } }); // no Tuesdays
  assert.deepEqual(placedOn(p)['2026-09-29'], []);
  assert.equal(p.days.find((d) => d.date === '2026-09-29').blocked, true);
  assert.equal(p.overflow.length, 1);
});

test('scenario 7b: oversized item goes on an empty day, flagged over capacity', () => {
  const big = mk({ descriptionText: 'It should take about 3 hours.', minutesOverride: null });
  const small = mk({ minutesOverride: 20 });
  const p = run([big, small]);
  const mon = p.days[0];
  assert.deepEqual(mon.items.map((e) => e.id), [big.id]);
  assert.equal(mon.load, 180);
  assert.equal(mon.over, true);
  assert.equal(dateOf(p, small.id), '2026-09-29');
});

test('scenario 7c: pinned item sits on its due date and counts toward load', () => {
  const pinned = mk({ due: '2026-09-30', pinned: true, minutesOverride: 120 });
  const other = mk({ due: '2026-09-30', minutesOverride: 20 });
  const p = run([pinned, other]);
  assert.equal(dateOf(p, pinned.id), '2026-09-30');
  assert.equal(dateOf(p, other.id), '2026-09-28');
  const tight = run([pinned, mk({ due: '2026-09-30', minutesOverride: 20 })], { now: '2026-09-30 08:00' });
  assert.equal(tight.overflow.length, 1); // Wed is full with the pinned 120 min
});

test('scenario 8: pull next week, by day and by amount', () => {
  const doneThisWeek = mk({ canvasDone: true, canvasStatus: 'submitted' });
  const monA = mk({ due: '2026-10-05', minutesOverride: 45 });
  const monB = mk({ due: '2026-10-05', minutesOverride: 5 });
  const tue = mk({ due: '2026-10-06', minutesOverride: 20 });
  const locked = mk({ due: '2026-10-07', unlock: '2026-10-05 00:00', minutesOverride: 20 });
  const items = [doneThisWeek, monA, monB, tue, locked];

  const p = run(items);
  assert.equal(p.pull.enabled, true);
  assert.equal(p.pull.nextDay.date, '2026-10-05');
  assert.deepEqual(p.pull.nextDay.entries.map((e) => e.id), [monB.id, monA.id]);
  // Budgets: earliest due first, ties smallest first, stop at the first that doesn't fit.
  assert.deepEqual(p.pull.byAmount[15].map((e) => e.id), [monB.id]); // 5
  assert.deepEqual(p.pull.byAmount[30].map((e) => e.id), [monB.id]); // 5, then 45 doesn't fit 30
  assert.deepEqual(p.pull.byAmount[120].map((e) => e.id), [monB.id, monA.id, tue.id, locked.id]); // 5+45+20+20

  // Gate: undone work this week disables it unless the setting is off.
  const busy = [...items, mk()];
  assert.equal(run(busy).pull.enabled, false);
  assert.equal(run(busy, { settings: { gatePullOnCompletion: false } }).pull.enabled, true);

  // Pulled items are planned by the same algorithm; not-yet-open ones are marked.
  const pulled = [doneThisWeek, monA, monB, { ...tue, pulledIn: true }, { ...locked, pulledIn: true }];
  const q = run(pulled);
  assert.equal(dateOf(q, tue.id), '2026-09-28');
  // Opens Mon 5 Oct, after the cutoff: window is unlock date through due date.
  assert.equal(dateOf(q, locked.id), '2026-10-05');
  assert.equal(q.days.at(-1).items[0].notOpenYet, true);
  assert.equal(q.pull.nextDay.date, '2026-10-05');
});

test('per-date capacity override: smaller day, day off, and unblocking a blocked weekday', () => {
  const items = many(6, { due: '2026-10-03', minutesOverride: 20 }); // 6 x 20 min
  const weekState = { '2026-09-28': { extraDays: 0, capacity: { '2026-09-28': 40, '2026-09-29': 0 } } };
  const p = run(items, { weekState });
  assert.deepEqual(p.days.map((d) => [d.date, d.load, d.capacity, d.capacityOverridden, d.blocked]), [
    ['2026-09-28', 40, 40, true, false],
    ['2026-09-29', 0, 0, true, true], // day off
    ['2026-09-30', 80, 120, false, false],
  ]);
  assert.equal(p.days[0].defaultCapacity, 120);
  // Tuesday is a blocked weekday, but an explicit override for that date wins.
  const q = run(many(9, { due: '2026-10-03', minutesOverride: 20 }), { settings: { blockedWeekdays: [2] }, weekState: { '2026-09-28': { capacity: { '2026-09-29': 60 } } } });
  assert.equal(q.days[1].load, 60);
  // Forecast "over" uses the same capacity.
  const f = run(many(3, { due: '2026-09-29', minutesOverride: 20 }), { weekState });
  assert.equal(f.forecast[1].over, true);
});

test('overdue items are scheduled today and flagged', () => {
  const late = mk({ due: '2026-09-29', minutesOverride: 20 });
  const p = run([late], { now: '2026-09-30 08:00' });
  assert.deepEqual(p.overdue.map((e) => e.id), [late.id]);
  assert.equal(dateOf(p, late.id), '2026-09-30');
});

test('overdue items from earlier weeks carry over until done or dismissed', () => {
  const lastWeek = mk({ due: '2026-09-24', minutesOverride: 20 });
  const p = run([lastWeek]);
  assert.deepEqual(p.overdue.map((e) => e.id), [lastWeek.id]);
  assert.equal(dateOf(p, lastWeek.id), '2026-09-28');
  assert.equal(p.pull.enabled, false); // still undone, so the gate stays closed
  assert.equal(run([{ ...lastWeek, dismissed: true }]).overdue.length, 0);
  assert.equal(run([{ ...lastWeek, manualDone: true }]).overdue.length, 0);
});

test('due before 5 PM must be done the day before', () => {
  const morning = mk({ due: '2026-10-01 09:00', minutesOverride: 20 });
  const p = run([...many(6, { due: '2026-09-29' }), morning], { now: '2026-09-29 08:00' });
  // Tue is full (6 x 20), Wed is the last day for a 9 AM Thursday item.
  assert.equal(dateOf(p, morning.id), '2026-09-30');
  // On Thursday at 8 AM it can still be done that morning, and isn't overdue.
  const thu = run([morning], { now: '2026-10-01 08:00' });
  assert.equal(dateOf(thu, morning.id), '2026-10-01');
  assert.equal(thu.overdue.length, 0);
});

test('filters: no due date, dismissed, hidden, excluded course, non-submittable', () => {
  const noDue = mk({ due: null });
  const items = [
    noDue,
    mk({ dismissed: true }),
    mk({ hidden: true }),
    mk({ courseId: '2' }),
    mk({ nonSubmittable: true }),
  ];
  const p = run(items, { settings: { courses: { 2: { include: false } } } });
  assert.deepEqual(p.noDueDate.map((e) => e.id), [noDue.id]);
  assert.deepEqual(p.days.flatMap((d) => d.items).map((e) => e.item.nonSubmittable), [true]);
  const off = run(items, { settings: { includeNonSubmittable: false, courses: { 2: { include: false } } } });
  assert.equal(off.days.flatMap((d) => d.items).length, 0);
  assert.ok(p.forecast.every((f) => f.count === (f.date === '2026-10-03' ? 1 : 0)));
});

test('forecast: 14 days of due load, including items not open yet', () => {
  const p = run([
    ...many(7, { due: '2026-10-03', minutesOverride: 20 }),
    mk({ due: '2026-10-05', unlock: '2026-10-04 00:00', minutesOverride: 5 }),
  ]);
  assert.equal(p.forecast.length, 14);
  assert.equal(p.forecast[0].date, '2026-09-28');
  assert.equal(p.forecast.at(-1).date, '2026-10-11');
  const sat = p.forecast.find((f) => f.date === '2026-10-03');
  assert.deepEqual(sat, { date: '2026-10-03', count: 7, minutes: 140, over: true });
  assert.equal(p.forecast.find((f) => f.date === '2026-10-05').count, 1);
});

test('fixture: plan invariants hold on real data', needsFixture, () => {
  let items = {};
  for (const c of fixture) {
    items = mergeCourse(items, c.course.id, c.assignments.map((a) => normalizeAssignment(a, c.course.id)));
  }
  for (const now of ['2026-09-28 08:00', '2026-09-30 12:00', '2026-10-02 18:00', '2026-10-29 07:00']) {
    const p = plan({ items, settings: S, weekState: {}, now: iso(now) });
    for (const day of p.days) {
      for (const e of day.items) {
        assert.ok(day.date >= p.today, `${e.item.title} scheduled in the past`);
        if (!e.overdue && !e.pinned) {
          assert.ok(!e.unlockDate || day.date >= e.unlockDate, `${e.item.title} before unlock`);
          assert.ok(day.date <= e.lastDay, `${e.item.title} after its due date`);
        }
        assert.ok(!e.item.canvasDone);
      }
      if (day.items.length > 1) assert.ok(!day.over || day.items.some((e) => e.overdue || e.pinned));
    }
  }
  // The W07 evaluation across the DST change comes from real data.
  const { raw, courseId } = findRaw('W07 Evaluation');
  const w07 = mergeCourse({}, courseId, [normalizeAssignment(raw, courseId)]);
  const p = plan({ items: w07, settings: S, weekState: {}, now: iso('2026-10-26 10:00') });
  assert.equal(p.days[0].items[0]?.item.title, 'W07 Evaluation');
});

test('next week: projected plan leaves out this week and pulled items', async () => {
  const { planNextWeek } = await import('../src/planner/plan.js');
  const thisWeek = mk({ due: '2026-10-02' });
  const overdue = mk({ due: '2026-09-20' });
  const pulled = mk({ due: '2026-10-06', pulledIn: true });
  const monday = mk({ due: '2026-10-05', minutesOverride: 45 });
  const saturday = many(8, { due: '2026-10-10', minutesOverride: 45 });
  const opensThu = mk({ due: '2026-10-10', unlock: '2026-10-08 00:00', minutesOverride: 5 });
  const items = [thisWeek, overdue, pulled, monday, ...saturday, opensThu];
  // Next week's own state: one added day and a light Tuesday.
  const weekState = { '2026-10-05': { extraDays: 1, capacity: { '2026-10-06': 45 } } };

  const p = planNextWeek({ items, settings: S, weekState, now: iso('2026-09-30 08:00') });
  assert.equal(p.today, '2026-10-05');
  assert.equal(p.week.start, '2026-10-05');
  assert.equal(p.week.cutoff, '2026-10-08'); // Wednesday + 1 added day
  assert.equal(p.behind, false);
  assert.equal(p.overdue.length, 0);
  const ids = p.days.flatMap((d) => d.items.map((e) => e.id));
  for (const left of [thisWeek, overdue, pulled]) assert.ok(!ids.includes(left.id));
  assert.equal(dateOf(p, monday.id), '2026-10-05');
  assert.equal(p.days[1].capacity, 45);
  assert.equal(p.days[1].capacityOverridden, true);
  // Opens Thursday: never placed before then.
  assert.equal(dateOf(p, opensThu.id), '2026-10-08');
  assert.equal(p.days.find((d) => d.date === '2026-10-08').items.find((e) => e.id === opensThu.id).notOpenYet, true);
  // Every remaining next-week item is either placed by the cutoff or reported as overflow.
  const placed = p.days.reduce((s, d) => s + d.items.length, 0);
  assert.equal(placed + p.overflow.length, 10);
});

test('dismissed items are listed so they can be restored', () => {
  const gone = mk({ due: '2026-09-20', dismissed: true });
  const p = run([gone, mk({ dismissed: true, canvasDone: true })]);
  assert.deepEqual(p.dismissed.map((e) => e.id), [gone.id]);
});

test('in-class activity: on its class day, 0 minutes, past ones drop off', () => {
  const teach = mk({ due: '2026-09-30 09:00', inClass: true, minutesOverride: null });
  const pastTeach = mk({ due: '2026-09-21 09:00', inClass: true, minutesOverride: null });
  const homework = many(6, { due: '2026-10-03', minutesOverride: 20 });
  const p = run([teach, pastTeach, ...homework]);
  // Placed on the class day itself (not the day before, unlike homework due at 9 AM).
  assert.equal(dateOf(p, teach.id), '2026-09-30');
  const wed = p.days.find((d) => d.date === '2026-09-30');
  assert.equal(wed.items.find((e) => e.id === teach.id).minutes, 0);
  assert.equal(p.days[0].load, 120); // homework still fills Monday as before
  assert.equal(dateOf(p, pastTeach.id), null);
  assert.equal(p.overdue.length, 0);
  assert.equal(p.forecast.find((f) => f.date === '2026-09-30').count, 0);
});

test('in-class by rule, and an item override beats the rule', () => {
  const settings = { estimateRules: [{ courseId: null, type: null, keyword: 'teach', size: null, minutes: null, inClass: true }] };
  const teach = mk({ title: 'W03 Day 1 Teach', due: '2026-09-30', minutesOverride: null });
  const p = run([teach], { settings });
  assert.equal(p.days.find((d) => d.date === '2026-09-30').items[0].inClass, true);
  const overridden = run([{ ...teach, minutesOverride: 30 }], { settings });
  assert.equal(dateOf(overridden, teach.id), '2026-09-28'); // planned as homework again
});

test('pull gate: pulled items do not re-close it; cap limits unfinished pulled work', async () => {
  const { canPullItem } = await import('../src/planner/plan.js');
  const doneThisWeek = mk({ canvasDone: true });
  const next = [
    mk({ due: '2026-10-05', minutesOverride: 60 }),
    mk({ due: '2026-10-05', minutesOverride: 90 }),
    mk({ due: '2026-10-06', minutesOverride: 45 }),
    mk({ due: '2026-10-07', minutesOverride: 240 }),
  ];
  const settings = { pullCapMinutes: 180 };
  // Nothing pulled yet: unlocked, full 3h available, Monday's 2h 30m fits.
  const a = run([doneThisWeek, ...next], { settings });
  assert.equal(a.pull.enabled, true);
  assert.equal(a.pull.remainingMinutes, 180);
  assert.equal(a.pull.nextDay.fits, true);
  assert.equal(canPullItem(a.pull, 240), true); // a single big item when nothing is pulled

  // Pulled Monday's 2h 30m: still unlocked (pulled work doesn't close the gate), 30m left.
  const pulled = [doneThisWeek, { ...next[0], pulledIn: true }, { ...next[1], pulledIn: true }, next[2], next[3]];
  const b = run(pulled, { settings });
  assert.equal(b.pull.enabled, true);
  assert.equal(b.pull.pulledMinutes, 150);
  assert.equal(b.pull.remainingMinutes, 30);
  assert.equal(canPullItem(b.pull, 45), false); // would pass the cap
  assert.equal(b.pull.nextDay.fits, false);
  assert.deepEqual(b.pull.byAmount[120].map((e) => e.id), []); // 45m doesn't fit in 30m left

  // Finishing a pulled item frees room again.
  const c = run([doneThisWeek, { ...next[0], pulledIn: true, manualDone: true }, { ...next[1], pulledIn: true }, next[2], next[3]], { settings });
  assert.equal(c.pull.remainingMinutes, 90);
  assert.equal(canPullItem(c.pull, 45), true);

  // At the cap: blocked, reason "cap". Unfinished own work: blocked, reason "week".
  const full = run([doneThisWeek, { ...next[3], pulledIn: true }], { settings });
  assert.equal(full.pull.enabled, false);
  assert.equal(full.pull.blockedReason, 'cap');
  const busy = run([mk(), ...next], { settings });
  assert.equal(busy.pull.blockedReason, 'week');
  // In-class items this week don't keep the gate closed.
  assert.equal(run([mk({ inClass: true, due: '2026-10-02', minutesOverride: null }), ...next], { settings }).pull.enabled, true);
});

test('urgency flags follow the real Canvas due date, not the planned day', () => {
  const today = mk({ due: '2026-09-28 23:59' });
  const tomorrowMorning = mk({ due: '2026-09-29 09:00' }); // planned for today (due before 5 PM)
  const later = mk({ due: '2026-10-03' });
  const p = run([today, tomorrowMorning, later]);
  const entry = (id) => p.days.flatMap((d) => d.items).find((e) => e.id === id);
  assert.deepEqual([entry(today.id).dueToday, entry(today.id).dueTomorrow], [true, false]);
  assert.deepEqual([entry(tomorrowMorning.id).dueToday, entry(tomorrowMorning.id).dueTomorrow], [false, true]);
  assert.equal(dateOf(p, tomorrowMorning.id), '2026-09-28');
  assert.deepEqual([entry(later.id).dueToday, entry(later.id).dueTomorrow], [false, false]);
});

test('checking items off today does not pull later work into today', () => {
  const items = many(12, { due: '2026-10-03', minutesOverride: 20 }); // 6 per day
  const before = run(items);
  const todayIds = placedOn(before)['2026-09-28'];
  assert.equal(todayIds.length, 6);
  const done = new Set(todayIds.slice(0, 3));
  const after = run(items.map((i) => (done.has(i.id) ? { ...i, manualDone: true, doneOn: '2026-09-28' } : i)));
  assert.deepEqual(placedOn(after)['2026-09-28'], todayIds.slice(3));
  assert.equal(after.days[0].load, 120);
  assert.equal(after.days[0].doneMinutes, 60);
  assert.deepEqual(placedOn(after)['2026-09-29'], placedOn(before)['2026-09-29']);
});

test('done today: Canvas submissions today count, older ones do not', () => {
  const todayIso = iso('2026-09-28 07:30');
  const items = [
    mk({ canvasDone: true, submittedAt: todayIso, minutesOverride: 30 }),
    mk({ canvasDone: true, submittedAt: iso('2026-09-27 20:00'), minutesOverride: 30 }),
    mk({ manualDone: true, doneOn: '2026-09-28', minutesOverride: 45, log: { minutes: 25, difficulty: null, finishedOn: '2026-09-28' } }),
    mk({ manualDone: true, doneOn: '2026-09-28', inClass: true, minutesOverride: null }),
    mk({ manualDone: true, minutesOverride: 20 }), // checked off before doneOn existed
  ];
  const p = run(items);
  assert.deepEqual(p.doneToday, { count: 2, minutes: 55 }); // logged 25 beats the 45 estimate
  assert.equal(p.days[0].doneMinutes, 75); // load uses estimates: 30 + 45
});

test('move to a day: tomorrow, or today even past capacity', () => {
  const a = mk({ due: '2026-10-03', minutesOverride: 60 });
  const b = mk({ due: '2026-10-03', minutesOverride: 60 });
  const c = mk({ due: '2026-10-03', minutesOverride: 60 });
  const base = run([a, b, c]);
  assert.deepEqual(placedOn(base), { '2026-09-28': [a.id, b.id], '2026-09-29': [c.id], '2026-09-30': [] });

  const later = run([{ ...a, plannedOn: '2026-09-29' }, b, c]);
  assert.equal(dateOf(later, a.id), '2026-09-29');
  assert.equal(later.days[0].load + later.days[1].load, 180);

  const sooner = run([a, b, { ...c, plannedOn: '2026-09-28' }]);
  assert.equal(dateOf(sooner, c.id), '2026-09-28');
  // Moved items are placed first, so c takes today and the planner fits a and b after it.
  assert.deepEqual(placedOn(sooner), { '2026-09-28': [c.id, a.id], '2026-09-29': [b.id], '2026-09-30': [] });

  // Moving a third hour onto a full today goes over capacity rather than refusing.
  const finished = mk({ manualDone: true, doneOn: '2026-09-28', minutesOverride: 120 });
  const full = run([finished, a, b, { ...c, plannedOn: '2026-09-28' }]);
  assert.deepEqual(placedOn(full)['2026-09-28'], [c.id]);
  assert.equal(full.days[0].load, 180);
  assert.equal(full.days[0].over, true);

  // Past the cutoff but before the due date is allowed; the days list extends.
  const thursday = run([{ ...a, plannedOn: '2026-10-01' }]);
  assert.equal(dateOf(thursday, a.id), '2026-10-01');
});

test('a move is ignored once it is in the past, after the last work day, or before unlock', () => {
  const past = mk({ due: '2026-10-03', plannedOn: '2026-09-27' });
  const afterDue = mk({ due: '2026-09-29 09:00', plannedOn: '2026-09-30' }); // last work day is Mon
  const beforeUnlock = mk({ due: '2026-10-03', unlock: '2026-09-30 00:00', plannedOn: '2026-09-28' });
  const inClass = mk({ due: '2026-10-02', inClass: true, minutesOverride: null, plannedOn: '2026-09-28' });
  const p = run([past, afterDue, beforeUnlock, inClass]);
  assert.equal(dateOf(p, past.id), '2026-09-28');
  assert.equal(dateOf(p, afterDue.id), '2026-09-28');
  assert.equal(dateOf(p, beforeUnlock.id), '2026-09-30');
  assert.equal(dateOf(p, inClass.id), '2026-10-02');
  assert.ok(p.days.flatMap((d) => d.items).every((e) => e.movedTo == null));
});

test('a move beats a pin', () => {
  const item = mk({ due: '2026-10-02', pinned: true, plannedOn: '2026-09-29' });
  assert.equal(dateOf(run([item]), item.id), '2026-09-29');
  assert.equal(dateOf(run([{ ...item, plannedOn: null }]), item.id), '2026-10-02');
});

test('class entries: one class, unfinished, earliest due first, no due date last', () => {
  const later = mk({ due: '2026-10-20' });
  const soon = mk({ due: '2026-09-29' });
  const noDue = mk({ due: null });
  const other = mk({ courseId: '2' });
  const done = mk({ manualDone: true });
  const gone = mk({ dismissed: true });
  const list = classEntries({ items: [later, noDue, soon, other, done, gone], settings: S, courseId: '1', now: iso(MON) });
  assert.deepEqual(list.map((e) => e.id), [soon.id, later.id, noDue.id]);
  assert.equal(list[0].minutes, 20);
});

test('exams: matched by title, still ahead this week, "not an exam" removes one', () => {
  const exam = mk({ title: 'Exam 01', type: 'quiz', due: '2026-10-01 23:59' });
  const midterm = mk({ title: 'Physics Midterm', type: 'upload', due: '2026-09-29 17:00' });
  const finalQuiz = mk({ title: 'CYBER201 Final', type: 'quiz', due: '2026-10-02' });
  const finalDoc = mk({ title: 'Final Reflection Document', type: 'upload', due: '2026-10-02' });
  const example = mk({ title: 'Example essay', due: '2026-10-02' });
  const nextWeek = mk({ title: 'Exam 02', type: 'quiz', due: '2026-10-06' });
  const done = mk({ title: 'Exam 00', type: 'quiz', due: '2026-10-01', manualDone: true });
  const items = [exam, midterm, finalQuiz, finalDoc, example, nextWeek, done];
  assert.deepEqual(run(items).exams.map((e) => e.id), [midterm.id, exam.id, finalQuiz.id]);
  assert.deepEqual(run(items, { now: '2026-09-30 09:00' }).exams.map((e) => e.id), [exam.id, finalQuiz.id]); // past ones drop off
  assert.deepEqual(run([{ ...exam, notExam: true }, finalQuiz]).exams.map((e) => e.id), [finalQuiz.id]);
  assert.deepEqual(planNextWeek({ items, settings: S, now: iso(MON) }).exams.map((e) => e.id), [nextWeek.id]);
});

test("Monday-morning work belongs to the week before; Monday-night work doesn't", () => {
  const morning = mk({ due: '2026-10-05 09:00' }); // next Monday, before 5 PM: Sunday's work
  const night = mk({ due: '2026-10-05 23:59' });
  const morningExam = mk({ due: '2026-10-05 08:00', title: 'Midterm Exam', type: 'quiz' });
  const p = run([morning, night, morningExam]);
  // Planned this week like any other work, so by the Wednesday target day.
  assert.ok(dateOf(p, morning.id) <= p.week.cutoff, dateOf(p, morning.id));
  assert.equal(dateOf(p, night.id), null);
  assert.deepEqual(p.pull.nextDay.entries.map((e) => e.id), [night.id]);
  assert.deepEqual(p.exams.map((e) => e.id), [morningExam.id]);
  // Next week's projection leaves the morning items to this week.
  const next = planNextWeek({ items: [morning, night, morningExam], settings: S, now: iso('2026-09-28 12:00') });
  const nextIds = next.days.flatMap((d) => d.items.map((e) => e.id));
  assert.deepEqual(nextIds, [night.id]);
});

test('split item: parts on different days in order, sharing a day only when needed', () => {
  const big = mk({ due: '2026-10-03 23:59', minutesOverride: 120, splitParts: 4 }); // 4 x 30m, target Wed 09-30
  const p = run([big]);
  const parts = p.days.flatMap((d) => d.items.map((e) => [e.id, d.date, e.minutes]));
  assert.deepEqual(parts, [
    [`${big.id}#1`, '2026-09-28', 30], [`${big.id}#2`, '2026-09-29', 30],
    [`${big.id}#3`, '2026-09-30', 30], [`${big.id}#4`, '2026-09-30', 30], // only 3 days before the target
  ]);
  // Two parts done (one today): only parts 3 and 4 are left, and today's done part uses today's time.
  const half = { ...big, partsDone: ['2026-09-27', '2026-09-28'] };
  const q = run([half]);
  assert.deepEqual(q.days.flatMap((d) => d.items.map((e) => e.id)), [`${big.id}#3`, `${big.id}#4`]);
  assert.equal(q.days[0].load, 30 + (dateOf(q, `${big.id}#3`) === '2026-09-28' ? 30 : 0));
  assert.deepEqual(q.doneToday, { count: 1, minutes: 30 });
});

test('checking off a split item adds a part; the last part finishes it', async () => {
  const { checkOffPatch } = await import('../src/planner/plan.js');
  assert.deepEqual(checkOffPatch({ splitParts: null }, '2026-09-28'), { manualDone: true, doneOn: '2026-09-28' });
  assert.deepEqual(checkOffPatch({ splitParts: 3, partsDone: null }, '2026-09-28'), { partsDone: ['2026-09-28'] });
  assert.deepEqual(checkOffPatch({ splitParts: 2, partsDone: ['2026-09-27'] }, '2026-09-28'),
    { partsDone: ['2026-09-27', '2026-09-28'], manualDone: true, doneOn: '2026-09-28' });
});

test('day streak counts a split part done that day', async () => {
  const { dayStreak } = await import('../src/planner/streaks.js');
  const big = mk({ due: '2026-10-03 23:59', minutesOverride: 120, splitParts: 4, partsDone: ['2026-09-28'] });
  const dayLog = { '2026-09-28': { left: [`${big.id}#1`] }, '2026-09-29': { left: [`${big.id}#2`] } };
  const s = dayStreak({ items: [big], settings: S, dayLog, now: iso('2026-09-30 12:00') });
  assert.equal(s.current, 0); // part 2 wasn't done on the 29th
  assert.equal(s.best, 1);
});
