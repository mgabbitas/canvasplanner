process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAssignment, normalizeCourse, resolveType, htmlToText } from '../src/sync/normalize.js';
import { mergeCourse } from '../src/storage/merge.js';
import { fixture, needsFixture, findRaw } from './helpers.js';

const raw = (over = {}) => ({
  id: 1, name: 'Thing', due_at: '2026-10-04T05:59:00Z', unlock_at: null, lock_at: null,
  points_possible: 100, submission_types: ['online_upload'],
  submission: { workflow_state: 'unsubmitted', submitted_at: null, excused: null },
  description: '<p>Hi</p>', html_url: 'https://byui.instructure.com/courses/9/assignments/1',
  ...over,
});

test('scenario 10: stray whitespace in titles is collapsed', () => {
  assert.equal(normalizeAssignment(raw({ name: ' Report:  Transcript\n' }), 9).title, 'Report: Transcript');
});

test('scenario 5: graded with null submitted_at counts as done', () => {
  const item = normalizeAssignment(raw({ submission: { workflow_state: 'graded', submitted_at: null } }), 9);
  assert.equal(item.canvasDone, true);
  assert.equal(item.submittedAt, null);
});

test('done states: submitted, pending_review, excused; not unsubmitted', () => {
  const done = (submission) => normalizeAssignment(raw({ submission }), 9).canvasDone;
  assert.equal(done({ workflow_state: 'submitted' }), true);
  assert.equal(done({ workflow_state: 'pending_review' }), true);
  assert.equal(done({ workflow_state: 'unsubmitted', excused: true }), true);
  assert.equal(done({ workflow_state: 'unsubmitted' }), false);
  assert.equal(done(undefined), false);
});

test('type resolution: first match in agreed order', () => {
  assert.equal(resolveType(['online_text_entry', 'online_upload']), 'upload');
  assert.equal(resolveType(['external_tool', 'online_quiz']), 'quiz');
  assert.equal(resolveType(['on_paper']), 'other');
  assert.equal(resolveType(undefined), 'other');
  assert.equal(normalizeAssignment(raw({ submission_types: ['none'] }), 9).nonSubmittable, true);
  assert.equal(normalizeAssignment(raw({ submission_types: ['none', 'online_upload'] }), 9).nonSubmittable, false);
});

test('untrusted fields are sanitized', () => {
  const item = normalizeAssignment(raw({
    html_url: 'javascript:alert(1)', due_at: 'garbage',
    description: '<script>x()</script><p>A &amp; B&nbsp;&#39;c&#39;</p><div>line&lt;2&gt;</div>',
  }), 9);
  assert.equal(item.url, null);
  assert.equal(item.dueAt, null);
  assert.equal(item.descriptionText, "A & B 'c'\nline<2>");
  assert.equal(htmlToText(null), '');
});

test('courses: restricted or unnamed are skipped', () => {
  assert.equal(normalizeCourse({ id: 1, access_restricted_by_date: true }), null);
  assert.equal(normalizeCourse({ id: 1, name: '  ' }), null);
  assert.deepEqual(normalizeCourse({ id: 1, name: 'Physics ' }), { id: '1', name: 'Physics' });
});

test('scenario 9: merge keeps user fields and flags a moved due date', () => {
  const first = mergeCourse({}, 9, [normalizeAssignment(raw(), 9)]);
  assert.equal(first['1'].manualDone, false);
  assert.equal(first['1'].prevDueAt, null);

  const edited = { '1': { ...first['1'], manualDone: true, minutesOverride: 120, pinned: true } };
  const moved = normalizeAssignment(raw({ due_at: '2026-10-06T05:59:00Z', name: 'Renamed' }), 9);
  const second = mergeCourse(edited, 9, [moved]);
  assert.equal(second['1'].manualDone, true);
  assert.equal(second['1'].minutesOverride, 120);
  assert.equal(second['1'].pinned, true);
  assert.equal(second['1'].title, 'Renamed');
  assert.equal(second['1'].dueAt, '2026-10-06T05:59:00Z');
  assert.equal(second['1'].prevDueAt, '2026-10-04T05:59:00Z');

  // Same due date on the next sync keeps the chip's old date.
  assert.equal(mergeCourse(second, 9, [moved])['1'].prevDueAt, '2026-10-04T05:59:00Z');
});

test('merge: no duplicates, disappeared items hidden, other courses untouched', () => {
  const a = normalizeAssignment(raw({ id: 1 }), 9);
  const b = normalizeAssignment(raw({ id: 2 }), 9);
  const other = normalizeAssignment(raw({ id: 3 }), 7);
  let items = mergeCourse(mergeCourse({}, 9, [a, b]), 7, [other]);
  items = mergeCourse(items, 9, [a, a]);
  assert.deepEqual(Object.keys(items).sort(), ['1', '2', '3']);
  assert.equal(items['2'].hidden, true);
  assert.equal(items['3'].hidden, false);
  // Reappearing un-hides it.
  assert.equal(mergeCourse(items, 9, [a, b])['2'].hidden, false);
});

test('fixture: every assignment normalizes cleanly', needsFixture, () => {
  const items = fixture.flatMap((c) => c.assignments.map((a) => normalizeAssignment(a, c.course.id)));
  assert.equal(items.length, 426);
  for (const i of items) {
    assert.doesNotMatch(i.title, /\s{2}|^\s|\s$/);
    assert.ok(['quiz', 'discussion', 'upload', 'external_tool', 'other'].includes(i.type));
    assert.ok(i.url);
    assert.doesNotMatch(i.descriptionText, /<\/?(p|div|span|a|br|li|ul|ol|strong|em|img|iframe|table|h[1-6])\b/i);
  }
  // 9 graded-with-null-submitted_at items: all done except the one graded 0 as missing.
  const graded = fixture.flatMap((c) => c.assignments)
    .filter((a) => a.submission.workflow_state === 'graded' && a.submission.submitted_at === null);
  assert.equal(graded.length, 9);
  const notDone = graded.filter((a) => !normalizeAssignment(a, 0).canvasDone).map((a) => a.name);
  assert.deepEqual(notDone, ['L03 Prepare: Checkpoint']);
});

test('fixture: a missing item graded 0 is not done, and is flagged missing', needsFixture, () => {
  const { raw: a, courseId } = findRaw('L03 Prepare: Checkpoint');
  const item = normalizeAssignment(a, courseId);
  assert.equal(item.canvasDone, false);
  assert.equal(item.canvasMissing, true);
});

test('missing: only when nothing was submitted, not excused, and no points', () => {
  const n = (submission) => normalizeAssignment(raw({ submission }), 9);
  const missing0 = n({ workflow_state: 'graded', submitted_at: null, missing: true, score: 0 });
  assert.deepEqual([missing0.canvasDone, missing0.canvasMissing], [false, true]);
  // Points given anyway: the teacher counted it.
  assert.equal(n({ workflow_state: 'graded', submitted_at: null, missing: true, score: 5 }).canvasDone, true);
  assert.equal(n({ workflow_state: 'graded', submitted_at: null, missing: true, excused: true }).canvasDone, true);
  // Turned in late: done even if Canvas still flags it.
  assert.equal(n({ workflow_state: 'submitted', submitted_at: '2026-10-05T01:00:00Z', missing: true }).canvasDone, true);
  // A 0-point evaluation that isn't missing stays done.
  assert.equal(n({ workflow_state: 'graded', submitted_at: null, missing: false, score: 0 }).canvasDone, true);
  // Unsubmitted and missing: not done, flagged.
  assert.equal(n({ workflow_state: 'unsubmitted', submitted_at: null, missing: true }).canvasMissing, true);
});

test('fixture: excused items are done', needsFixture, () => {
  const { raw: a, courseId } = findRaw('W01 Day 1 Teach:  CIA Triad in Action');
  assert.equal(normalizeAssignment(a, courseId).canvasDone, true);
});
