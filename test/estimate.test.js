process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, statedMinutes } from '../src/planner/estimate.js';
import { DEFAULT_SETTINGS as S } from '../src/storage/defaults.js';
import { normalizeAssignment } from '../src/sync/normalize.js';
import { fixture, needsFixture } from './helpers.js';

const item = (over = {}) => ({ title: 'Thing', type: 'upload', descriptionText: '', sizeOverride: null, ...over });

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

test('resolution order: manual > stated > keyword > type > default', () => {
  const stated = 'It should take about 15 minutes.';
  assert.deepEqual(estimate(item({ sizeOverride: 'L', descriptionText: stated }), S), { minutes: 120, source: 'manual' });
  assert.deepEqual(estimate(item({ title: 'Week 1 Report', descriptionText: stated }), S), { minutes: 15, source: 'stated' });
  assert.deepEqual(estimate(item({ title: 'Week 1 REPORT' }), S), { minutes: 120, source: 'keyword' });
  assert.deepEqual(estimate(item({ type: 'external_tool' }), S), { minutes: 5, source: 'type' });
  assert.deepEqual(estimate(item({ type: 'weird' }), S), { minutes: 45, source: 'default' });
});

test('keyword rules: first match in list order wins', () => {
  // "report" (L) comes before "reading" (S) in the default list.
  assert.equal(estimate(item({ title: 'Daily Reading Report' }), S).minutes, 120);
  const reordered = { ...S, keywordRules: [{ keyword: 'reading', size: 'S' }, { keyword: 'report', size: 'L' }] };
  assert.equal(estimate(item({ title: 'Daily Reading Report' }), reordered).minutes, 20);
  assert.equal(estimate(item({ title: 'x' }), { ...S, keywordRules: [{ keyword: '', size: 'L' }] }).source, 'type');
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
