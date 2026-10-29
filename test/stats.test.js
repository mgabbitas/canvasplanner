process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, suggestRules, applySuggestion } from '../src/planner/stats.js';
import { estimate } from '../src/planner/estimate.js';
import { validateLog } from '../src/storage/schema.js';
import { DEFAULT_SETTINGS as S } from '../src/storage/defaults.js';

let n = 0;
const item = (over = {}, log = null) => ({
  id: String(++n), courseId: '7', title: 'Thing', type: 'upload', descriptionText: '',
  minutesOverride: null, inClass: false, log, ...over,
});
const log = (minutes, finishedOn = '2026-09-28', difficulty = null) => ({ minutes, difficulty, finishedOn });

test('stats by class, type and weekday finished', () => {
  const items = [
    item({ courseId: '7', type: 'quiz' }, log(10, '2026-09-28', 2)), // Monday
    item({ courseId: '7', type: 'quiz' }, log(20, '2026-09-28', 4)), // Monday
    item({ courseId: '8', type: 'upload' }, log(60, '2026-09-30')), // Wednesday
    item({ courseId: '8', type: 'upload' }, { minutes: null, difficulty: 3, finishedOn: '2026-09-30' }), // no minutes
    item({ courseId: '8' }), // not logged
  ];
  const s = computeStats({ items, settings: S });
  assert.equal(s.overall.count, 3);
  assert.equal(s.overall.totalMinutes, 90);
  assert.deepEqual(s.byCourse.map((r) => [r.key, r.count, r.avgMinutes]), [['8', 1, 60], ['7', 2, 15]]);
  assert.equal(s.byCourse[1].avgDifficulty, 3);
  assert.equal(s.byCourse[0].avgDifficulty, null);
  assert.deepEqual(s.byType.map((r) => r.key), ['upload', 'quiz']);
  assert.equal(s.byWeekday[1].totalMinutes, 30);
  assert.equal(s.byWeekday[3].totalMinutes, 60);
  assert.equal(Math.round(s.byWeekday[3].share * 100), 67);
  // Estimates: quiz default S (20) x2, upload default M (45): 85 estimated vs 90 actual.
  assert.equal(s.overall.avgEstimate, Math.round((20 + 20 + 45) / 3));
  assert.equal(s.overall.actualVsEstimate, 1.06);
});

test('empty stats are safe', () => {
  const s = computeStats({ items: {}, settings: S });
  assert.equal(s.overall.count, 0);
  assert.equal(s.overall.actualVsEstimate, null);
  assert.deepEqual(s.byCourse, []);
  assert.equal(s.byWeekday.length, 7);
});

test('suggestions: 3+ logs, 5+ min off, class+keyword and class+type, no duplicates', () => {
  const reports = [24, 22, 27].map((m) => item({ title: 'Week Report', type: 'upload' }, log(m)));
  const quizzes = [18, 21].map((m) => item({ title: 'Quiz', type: 'quiz' }, log(m))); // only 2 logs
  const onTarget = [44, 46, 45].map((m) => item({ courseId: '9', title: 'Draft', type: 'discussion' }, log(m)));
  const sugg = suggestRules({ items: [...reports, ...quizzes, ...onTarget], settings: S });
  // "report" keyword group and the course 7 upload-type group hold the same 3 items: keep one.
  assert.equal(sugg.length, 1);
  assert.deepEqual(sugg[0], {
    courseId: '7', type: null, keyword: 'report', count: 3, avgMinutes: 24, currentMinutes: 120, minutes: 25,
  });
});

test('applying a suggestion changes the estimate and is not suggested again', () => {
  const reports = [24, 22, 27].map((m) => item({ title: 'Week Report', type: 'upload' }, log(m)));
  const [s] = suggestRules({ items: reports, settings: S });
  const settings = { ...S, estimateRules: applySuggestion(S.estimateRules, s) };
  assert.equal(settings.estimateRules[0].courseId, '7'); // more specific: goes first
  assert.deepEqual(estimate(reports[0], settings), { minutes: 25, source: 'rule', inClass: false });
  assert.deepEqual(suggestRules({ items: reports, settings }), []);
  // Applying again with new data replaces the rule instead of adding a second one.
  const again = applySuggestion(settings.estimateRules, { ...s, minutes: 30 });
  assert.equal(again.filter((r) => r.courseId === '7' && r.keyword === 'report').length, 1);
  assert.equal(again[0].minutes, 30);
});

test('applySuggestion puts a class+type rule after a more specific class+keyword rule', () => {
  const rules = [{ courseId: '7', type: null, keyword: 'report', minutes: 25, inClass: false }];
  const next = applySuggestion(rules, { courseId: '7', type: 'upload', keyword: '', minutes: 40 });
  // Both have specificity 2, so the new one goes after the existing one.
  assert.deepEqual(next.map((r) => r.keyword || r.type), ['report', 'upload']);
});

test('log validation', () => {
  assert.deepEqual(validateLog({ minutes: '30', difficulty: 9, finishedOn: '2026-10-01' }),
    { minutes: 30, difficulty: 5, finishedOn: '2026-10-01' });
  assert.equal(validateLog({ minutes: 30 }), null); // no finish day
  assert.equal(validateLog({ finishedOn: '2026-10-01' }), null); // nothing logged
  assert.deepEqual(validateLog({ difficulty: 2, finishedOn: '2026-10-01' }), { minutes: null, difficulty: 2, finishedOn: '2026-10-01' });
});
