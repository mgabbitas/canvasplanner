process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, statedMinutes } from '../src/planner/estimate.js';
import { DEFAULT_SETTINGS as S } from '../src/storage/defaults.js';
import { normalizeAssignment } from '../src/sync/normalize.js';
import { fixture, needsFixture } from './helpers.js';

const item = (over = {}) => ({ courseId: '1', title: 'Thing', type: 'upload', descriptionText: '', sizeOverride: null, ...over });

test('stated minutes: conservative phrase only', () => {
  assert.equal(statedMinutes('It should take about 15 minutes to complete'), 15);
  assert.equal(statedMinutes('It should take about 1 hour to engage'), 60);
  assert.equal(statedMinutes('It should take about 2.5 hours to complete'), 150);
  assert.equal(statedMinutes('Watch this 18-minute video'), null);
  assert.equal(statedMinutes("You'll have 10 minutes to plan, 5 minutes to present"), null);
  assert.equal(statedMinutes('Each unit will take about 10 minutes to execute'), null);
  assert.equal(statedMinutes('should take about 0 minutes'), null);
  assert.equal(statedMinutes('should take about 40 hours'), null); // implausible, ignored
});

const rule = (over) => ({ courseId: null, type: null, keyword: '', size: null, minutes: null, ...over });

test('resolution order: manual > course rule > stated x scale > general rule > type > default', () => {
  const stated = 'It should take about 2.5 hours.';
  const settings = {
    ...S,
    statedScale: 60,
    estimateRules: [rule({ keyword: 'report', size: 'L' }), rule({ courseId: '7', keyword: 'report', minutes: 25 })],
  };
  const report = (over) => item({ title: 'Week 2 Report', courseId: '7', ...over });
  assert.deepEqual(estimate(report({ sizeOverride: 'XS', descriptionText: stated }), settings), { minutes: 5, source: 'manual' });
  // A course rule beats the instructor's stated time, even though it's lower in the list.
  assert.deepEqual(estimate(report({ descriptionText: stated }), settings), { minutes: 25, source: 'rule' });
  // In another course only the general rule matches, and the stated time (x 60%) beats it.
  assert.deepEqual(estimate(report({ courseId: '8', descriptionText: stated }), settings), { minutes: 90, source: 'stated' });
  assert.deepEqual(estimate(report({ courseId: '8' }), settings), { minutes: 120, source: 'rule' });
  assert.deepEqual(estimate(item({ type: 'external_tool' }), settings), { minutes: 5, source: 'type' });
  assert.deepEqual(estimate(item({ type: 'weird' }), settings), { minutes: 45, source: 'default' });
});

test('rules: every condition set must match; first match in list order wins', () => {
  const settings = {
    ...S,
    estimateRules: [
      rule({ courseId: '7', type: 'quiz', size: 'XS' }),
      rule({ type: 'quiz', keyword: 'mastery', minutes: 33 }),
      rule({ keyword: 'reading', size: 'S' }),
      rule({ keyword: 'report', size: 'L' }),
    ],
  };
  assert.equal(estimate(item({ courseId: '7', type: 'quiz', title: 'Mastery Quiz' }), settings).minutes, 5);
  assert.equal(estimate(item({ courseId: '8', type: 'quiz', title: 'Mastery Quiz' }), settings).minutes, 33);
  assert.equal(estimate(item({ courseId: '8', type: 'upload', title: 'Mastery Upload' }), settings).source, 'type');
  // "reading" is above "report" here, so the daily reading report gets S.
  assert.equal(estimate(item({ title: 'Daily Reading Report' }), settings).minutes, 20);
  // A rule with no conditions never matches.
  assert.equal(estimate(item({ title: 'x' }), { ...S, estimateRules: [rule({ size: 'L' })] }).source, 'type');
});

test('stated scale rounds and never goes below 1 minute', () => {
  const s = (scale) => estimate(item({ descriptionText: 'should take about 15 minutes' }), { ...S, statedScale: scale }).minutes;
  assert.equal(s(100), 15);
  assert.equal(s(70), 11);
  assert.equal(s(1), 1);
});

test('fixture: exactly the three stated-time assignments are found', needsFixture, () => {
  const found = fixture.flatMap((c) => c.assignments.map((a) => normalizeAssignment(a, c.course.id)))
    .map((i) => [i.title, estimate(i, S)])
    .filter(([, e]) => e.source === 'stated')
    .map(([t, e]) => [t, e.minutes]);
  assert.deepEqual(found, [
    ['Week 01 Reading: Syllabus', 15],
    ['Week 02 Participation: Q&A (Online)', 60],
    ['Week 02 Report: How LLMs Work', 150],
  ]);
});
