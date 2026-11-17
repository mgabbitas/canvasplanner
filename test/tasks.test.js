process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskItem, syncSeries, dropFutureCopies, endOfDay, studyTask, syncStudyTasks, studyTaskId } from '../src/planner/tasks.js';
import { plan, planNextWeek } from '../src/planner/plan.js';
import { weekStreak } from '../src/planner/streaks.js';
import { atNoon } from '../src/planner/dates.js';
import { migrate, validateTaskSeries } from '../src/storage/schema.js';
import { mergeCourse } from '../src/storage/merge.js';
import { buildExport, applyImport } from '../src/storage/transfer.js';
import { DEFAULT_SETTINGS as S } from '../src/storage/defaults.js';

// Weeks start Monday with a Wednesday target: week of 2026-10-05 has cutoff 10-07.
const now = (date) => atNoon(date).getTime();
const task = (over = {}) => taskItem({ id: 't1', courseId: '7', title: 'Study', minutes: 30, ...over });
const byId = (list) => Object.fromEntries(list.map((i) => [i.id, i]));
const dateOf = (p, id) => p.days.find((d) => d.items.some((e) => e.id === id))?.date ?? null;
const series = (over = {}) => ({ id: 'sab', courseId: '7', title: 'Review', minutes: 30, notes: '', weekdays: [1, 3, 5], start: '2026-10-05', until: null, ...over });

test('task items validate and keep their task fields; Canvas sync leaves them alone', () => {
  const s = migrate({ items: { t1: task({ dueDate: '2026-10-08', notes: 'ch. 4' }), tbad_: task(), 9: { courseId: '7', title: 'Canvas' } } });
  assert.deepEqual(Object.keys(s.items).sort(), ['9', 't1']);
  assert.deepEqual(s.items.t1.task, { notes: 'ch. 4', floating: false, seriesId: null, examId: null });
  assert.equal(s.items.t1.dueAt, endOfDay('2026-10-08'));
  assert.equal(s.items['9'].task, null);
  assert.equal(migrate({ items: { t2: task({ id: 't2' }) } }).items.t2.task.floating, true);
  const merged = mergeCourse(s.items, '7', []); // the class came back with no assignments
  assert.equal(merged.t1.hidden, false);
  assert.equal(merged['9'].hidden, true);
});

test('floating task: planned by the target day, never overdue, carried into later weeks', () => {
  const p = plan({ items: [task()], settings: S, now: now('2026-10-05') });
  assert.ok(dateOf(p, 't1') <= '2026-10-07');
  assert.deepEqual(p.forecast.filter((d) => d.count).map((d) => d.date), []);
  // After the target day: still planned this week.
  const late = plan({ items: [task()], settings: S, now: now('2026-10-09') });
  assert.equal(dateOf(late, 't1'), '2026-10-09');
  assert.equal(late.overdue.length, 0);
  // A new week: it floats again (by that week's target day), not overdue.
  const next = plan({ items: [task()], settings: S, now: now('2026-10-12') });
  assert.equal(dateOf(next, 't1'), '2026-10-12');
  assert.equal(next.overdue.length, 0);
  // Not duplicated in the next-week projection.
  assert.equal(planNextWeek({ items: [task()], settings: S, now: now('2026-10-05') }).days.flatMap((d) => d.items).length, 0);
});

test('dated task is planned like a Canvas item', () => {
  const p = plan({ items: [task({ dueDate: '2026-10-09' })], settings: S, now: now('2026-10-05') });
  assert.ok(dateOf(p, 't1') <= '2026-10-07');
});

test('series: copies on chosen weekdays through next week, respecting start and end', () => {
  const items = syncSeries({}, { sab: series() }, '2026-10-06', S);
  assert.deepEqual(Object.keys(items).sort(), ['sab-20261007', 'sab-20261009', 'sab-20261012', 'sab-20261014', 'sab-20261016']);
  assert.equal(items['sab-20261007'].pinned, true);
  assert.equal(items['sab-20261007'].task.seriesId, 'sab');
  assert.equal(syncSeries(items, { sab: series() }, '2026-10-06', S), items); // nothing new: same object
  const ended = syncSeries({}, { sab: series({ until: '2026-10-09' }) }, '2026-10-06', S);
  assert.deepEqual(Object.keys(ended).sort(), ['sab-20261007', 'sab-20261009']);
  const later = syncSeries({}, { sab: series({ start: '2026-10-14' }) }, '2026-10-06', S);
  assert.deepEqual(Object.keys(later).sort(), ['sab-20261014', 'sab-20261016']);
});

test('series: a copy sits on its day; a missed one drops off, then is cleaned up', () => {
  const items = syncSeries({}, { sab: series() }, '2026-10-05', S);
  const p = plan({ items, settings: S, now: now('2026-10-05') });
  assert.equal(dateOf(p, 'sab-20261005'), '2026-10-05');
  assert.equal(dateOf(p, 'sab-20261007'), '2026-10-07');
  // Wednesday: Monday's copy was skipped. It isn't overdue, it's just gone.
  const wed = plan({ items, settings: S, now: now('2026-10-07') });
  assert.equal(dateOf(wed, 'sab-20261005'), null);
  assert.equal(wed.overdue.length, 0);
  // Two weeks later the missed copies are removed; a done one stays for stats.
  const kept = { ...items, 'sab-20261007': { ...items['sab-20261007'], manualDone: true, doneOn: '2026-10-07' } };
  const pruned = syncSeries(kept, { sab: series({ until: '2026-10-09' }) }, '2026-10-31', S);
  assert.deepEqual(Object.keys(pruned).sort(), ['sab-20261007']);
});

test('dropFutureCopies keeps past and done copies', () => {
  const items = syncSeries({}, { sab: series() }, '2026-10-05', S);
  items['sab-20261009'] = { ...items['sab-20261009'], manualDone: true };
  const left = dropFutureCopies(items, 'sab', '2026-10-07');
  assert.deepEqual(Object.keys(left).sort(), ['sab-20261005', 'sab-20261009']);
});

test('series validation', () => {
  assert.deepEqual(validateTaskSeries({ sab: series({ weekdays: [5, 1, 1, 9], until: '2026-01-01' }) }).sab,
    { ...series(), weekdays: [1, 5], until: null });
  assert.deepEqual(validateTaskSeries({ sab: series({ weekdays: [] }), bad: series(), sx: series({ title: ' ' }) }), {});
});

test('week streak ignores repeats; export and import carry tasks and series', () => {
  const items = syncSeries({}, { sab: series() }, '2026-10-05', S);
  const one = task({ dueDate: '2026-10-09' });
  assert.equal(weekStreak({ items: byId([...Object.values(items)]), settings: S, now: now('2026-10-08') }).thisWeek, 'none');

  const state = migrate({ items: { ...items, t1: one, 9: { courseId: '7', title: 'Canvas', minutesOverride: 15 } }, taskSeries: { sab: series() } });
  const file = JSON.parse(JSON.stringify(buildExport(state, '2026-10-05T12:00:00Z')));
  assert.equal(file.tasks.t1.title, 'Study');
  assert.equal(file.userItems.t1, undefined);
  const fresh = migrate({ items: { 9: { courseId: '7', title: 'Canvas' }, told: task({ id: 'told' }) } });
  const next = applyImport(fresh, file);
  assert.equal(next.items.t1.title, 'Study');
  assert.equal(next.items.told, undefined); // replaced by the file's tasks
  assert.equal(next.items['9'].minutesOverride, 15);
  assert.deepEqual(next.taskSeries, { sab: series() });
});

test('floating task: moving it to a day works; once done it shows under Done', () => {
  const moved = { ...task(), plannedOn: '2026-10-07' };
  const p = plan({ items: [moved], settings: S, now: now('2026-10-05') });
  assert.equal(dateOf(p, 't1'), '2026-10-07');
  assert.equal(p.days.flatMap((d) => d.items).find((e) => e.id === 't1').movedTo, '2026-10-07');
  const finished = { ...task(), manualDone: true, doneOn: '2026-10-05' };
  const q = plan({ items: [finished], settings: S, now: now('2026-10-06') });
  assert.deepEqual(q.done.map((e) => e.id), ['t1']);
  assert.equal(q.done[0].canUncheck, true);
  // Finished in an earlier week: not in this week's Done.
  assert.deepEqual(plan({ items: [finished], settings: S, now: now('2026-10-13') }).done, []);
});

test('sync: tasks follow their class (hidden while it is inactive, back when it returns)', async () => {
  const { applySync } = await import('../src/sync/canvas.js');
  const state = migrate({ items: { t1: task(), 9: { courseId: '7', title: 'Canvas' } }, courses: { 7: { name: 'Physics' } } });
  const gone = applySync(state, { courses: [], results: [] }, '2026-10-05T12:00:00Z');
  assert.equal(gone.items.t1.hidden, true);
  const back = applySync({ ...state, items: gone.items }, { courses: [{ id: '7', name: 'Physics' }], results: [] }, '2026-10-06T12:00:00Z');
  assert.equal(back.items.t1.hidden, false);
});

test('school change clears everything tied to the old school; import refuses another school', async () => {
  const { changeSchool } = await import('../src/storage/merge.js');
  const state = migrate({
    items: { t1: task(), 9: { courseId: '7', title: 'Canvas' } }, courses: { 7: { name: 'Physics' } }, taskSeries: { sab: series() },
    settings: { courses: { 7: { displayName: 'Phys', include: true, color: 'red' } }, statedScale: 70,
      estimateRules: [{ courseId: '7', keyword: 'lab', minutes: 30 }, { keyword: 'essay', minutes: 90 }] },
    canvas: { host: 'byui.instructure.com' },
  });
  const p = changeSchool(state, 'uofu.instructure.com');
  assert.deepEqual([p.items, p.courses, p.taskSeries, p.settings.courses], [{}, {}, {}, {}]);
  assert.deepEqual(p.settings.estimateRules.map((r) => r.keyword), ['essay']);
  assert.equal(p.settings.statedScale, 70);
  assert.deepEqual(p.canvas, { host: 'uofu.instructure.com' });
  const file = buildExport(migrate({ canvas: { host: 'uofu.instructure.com' } }), '2026-10-05T12:00:00Z');
  assert.throws(() => applyImport(state, JSON.parse(JSON.stringify(file))), /from uofu\.instructure\.com/);
  assert.equal(applyImport(migrate({}), JSON.parse(JSON.stringify(file))).canvas.host, 'uofu.instructure.com');
  // A task never keeps a link (a doctored file can't point it elsewhere).
  assert.equal(migrate({ items: { t1: { ...task(), url: 'https://evil.instructure.com/x' } } }).items.t1.url, null);
});

// --- study time for exams ---
const exam = (over = {}) => ({
  id: '500', courseId: '7', title: 'Exam 03', dueAt: endOfDay('2026-10-09'), unlockAt: null, plannedOn: null,
  dismissed: false, hidden: false, notExam: false, manualDone: false, canvasDone: false, ...over,
});

test('study task: pinned to the day before you take the exam (or today if that has passed)', () => {
  const e = exam({ plannedOn: '2026-10-08' });
  const t = studyTask(e, 60, '2026-10-05');
  assert.equal(t.id, studyTaskId('500'));
  assert.equal(t.task.examId, '500');
  assert.equal(t.title, 'Study: Exam 03');
  assert.equal(t.minutesOverride, 60);
  assert.equal(t.dueAt, endOfDay('2026-10-07'));
  assert.equal(t.pinned, true);
  // No day picked: the day before it's due. Exam tomorrow-ish already: today.
  assert.equal(studyTask(exam(), 30, '2026-10-05').dueAt, endOfDay('2026-10-08'));
  assert.equal(studyTask(exam({ plannedOn: '2026-10-05' }), 30, '2026-10-05').dueAt, endOfDay('2026-10-05'));
  // Planned like any task: on its day.
  const p = plan({ items: byId([t, e]), settings: S, now: now('2026-10-05') });
  assert.equal(dateOf(p, t.id), '2026-10-07');
  // Exam due 10 AM Thursday: its last work day is Wednesday, so study goes Tuesday.
  const morning = exam({ dueAt: new Date(2026, 9, 8, 10, 0).toISOString() });
  assert.equal(studyTask(morning, 30, '2026-10-05').dueAt, endOfDay('2026-10-06'));
});

test('study task of a done or dismissed exam is kept but not planned, so Undo brings it back', () => {
  const e = exam({ plannedOn: '2026-10-08' });
  const t = studyTask(e, 60, '2026-10-05');
  for (const change of [{ dismissed: true }, { canvasDone: true }, { manualDone: true }]) {
    const items = { 500: { ...e, ...change }, [t.id]: t };
    assert.equal(syncStudyTasks(items, '2026-10-05'), items, JSON.stringify(change)); // not deleted
    assert.equal(dateOf(plan({ items, settings: S, now: now('2026-10-05') }), t.id), null, JSON.stringify(change));
  }
  // Next week's view still finds the exam (it isn't in the filtered list there).
  const nextWeekExam = exam({ dueAt: endOfDay('2026-10-14'), plannedOn: '2026-10-14' });
  const nt = studyTask(nextWeekExam, 60, '2026-10-05');
  const q = planNextWeek({ items: byId([nt, nextWeekExam]), settings: S, now: now('2026-10-05') });
  assert.equal(dateOf(q, nt.id), '2026-10-13');
});

test('study task follows the exam and goes away with it', () => {
  const e = exam({ plannedOn: '2026-10-08' });
  const t = studyTask(e, 60, '2026-10-05');
  const items = { 500: e, [t.id]: t };
  assert.equal(syncStudyTasks(items, '2026-10-05'), items); // nothing to change
  // You moved the exam to Friday: study moves to Thursday.
  const moved = syncStudyTasks({ ...items, 500: { ...e, plannedOn: '2026-10-09' } }, '2026-10-05');
  assert.equal(moved[t.id].dueAt, endOfDay('2026-10-08'));
  // Not an exam, gone, or its day has passed (e.g. an in-class exam you never check
  // off): the study task goes instead of coming back on Today every day.
  assert.equal(syncStudyTasks({ ...items, 500: { ...e, notExam: true } }, '2026-10-05')[t.id], undefined);
  assert.equal(syncStudyTasks({ [t.id]: t }, '2026-10-05')[t.id], undefined);
  assert.equal(syncStudyTasks(items, '2026-10-09')[t.id], undefined);
  // ...unless you already studied (checked off or logged).
  const studied = { ...t, manualDone: true, doneOn: '2026-10-06' };
  assert.equal(syncStudyTasks({ 500: e, [t.id]: studied }, '2026-10-12')[t.id], studied);
});

test('study task fields survive storage', () => {
  const t = studyTask(exam(), 45, '2026-10-05');
  const s = migrate({ items: { [t.id]: t, 500: { ...exam(), studyChoice: 'yes' }, 501: { ...exam({ id: '501' }), studyChoice: 'maybe' } } });
  assert.equal(s.items[t.id].task.examId, '500');
  assert.equal(s.items['500'].studyChoice, 'yes');
  assert.equal(s.items['501'].studyChoice, null);
});
