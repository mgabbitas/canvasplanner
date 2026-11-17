process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gradeShares, shareLabel } from '../src/planner/grades.js';
import { normalizeAssignment, normalizeGroups } from '../src/sync/normalize.js';
import { fixture } from './helpers.js';

const GRADES = new URL('./fixtures/canvas-grades.json', import.meta.url);
const grades = existsSync(GRADES) ? JSON.parse(readFileSync(GRADES, 'utf8')) : null;
const needsGrades = { skip: fixture && grades ? false : 'canvas-dump.json or canvas-grades.json not present' };

const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 1e9) / 1e9]));
const it = (id, over = {}) => ({ id, courseId: '1', points: 10, groupId: 'a', countsToGrade: true, hidden: false, task: null, ...over });

test('weighted class: points share of the group, times the group weight', () => {
  const items = [it('1', { points: 30 }), it('2', { points: 10 }), it('3', { groupId: 'b', points: 50 })];
  const s = round(gradeShares(items, { 1: { weighted: true, score: 90, groups: { a: 60, b: 40 } } }));
  assert.deepEqual(s, { 1: 0.45, 2: 0.15, 3: 0.4 });
});

test('weights that do not add to 100 are scaled; 0% groups and non-counting items get nothing', () => {
  const items = [
    it('1'), it('2', { groupId: 'b' }), it('3', { groupId: 'zero' }),
    it('4', { countsToGrade: false }), it('5', { points: 0 }), it('6', { task: {} }), it('7', { hidden: true }),
  ];
  const s = round(gradeShares(items, { 1: { weighted: true, score: 90, groups: { a: 30, b: 10, zero: 0 } } }));
  assert.deepEqual(s, { 1: 0.75, 2: 0.25 });
});

test('unweighted class: points over all points; no course info means no shares', () => {
  const items = [it('1', { points: 75 }), it('2', { points: 25, groupId: 'b' }), it('3', { courseId: '2' })];
  assert.deepEqual(gradeShares(items, { 1: { weighted: false, score: 90, groups: { a: 0, b: 0 } } }), { 1: 0.75, 2: 0.25 });
  // No groups synced yet (e.g. right after updating), or no score (not graded here): no guesses.
  assert.deepEqual(gradeShares(items, { 1: { weighted: false, score: 90, groups: {} } }), {});
  assert.deepEqual(gradeShares(items, { 1: { weighted: false, score: null, groups: { a: 0 } } }), {});
});

test('labels: one decimal only when needed', () => {
  assert.equal(shareLabel(0.125), '12.5%');
  assert.equal(shareLabel(0.06), '6%');
  assert.equal(shareLabel(0.0749), '7.5%');
});

test('real data: exams in a weighted class are 12.5% each, and every class adds up to 100%', needsGrades, () => {
  const items = {};
  for (const c of fixture) for (const a of c.assignments) { const i = normalizeAssignment(a, c.course.id); items[i.id] = i; }
  const courses = {};
  for (const g of grades) {
    courses[g.course.id] = {
      weighted: g.course.apply_assignment_group_weights, score: g.course.enrollments[0]?.computed_current_score ?? null,
      groups: normalizeGroups(g.assignment_groups),
    };
  }
  const s = gradeShares(items, courses);
  const exams = Object.values(items).filter((i) => i.courseId === '434252' && /^Exam 0\d$/.test(i.title));
  assert.equal(exams.length, 4);
  for (const e of exams) assert.ok(Math.abs(s[e.id] - 0.125) < 1e-9, `${e.title}: ${s[e.id]}`);
  const sums = {};
  for (const [id, v] of Object.entries(s)) sums[items[id].courseId] = (sums[items[id].courseId] ?? 0) + v;
  for (const [c, sum] of Object.entries(sums)) assert.ok(Math.abs(sum - 1) < 1e-9, `${c}: ${sum}`);
  assert.equal(sums['48558'], undefined); // CSE Majors: no score, so no shares
  // Surveys sit in 0% groups: no share.
  const survey = Object.values(items).find((i) => i.courseId === '422536' && /Survey/i.test(i.title) && i.points > 0);
  if (survey) assert.equal(s[survey.id], undefined, survey.title);
});
