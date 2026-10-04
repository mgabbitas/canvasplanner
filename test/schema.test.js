process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, validateSettings, validateItems, validateRule, pruneWeekState } from '../src/storage/schema.js';
import { DEFAULT_SETTINGS } from '../src/storage/defaults.js';

test('empty or garbage storage gives defaults', () => {
  for (const raw of [undefined, null, 42, [], {}]) {
    const s = migrate(raw);
    assert.equal(s.schemaVersion, 3);
    assert.deepEqual(s.settings, validateSettings(DEFAULT_SETTINGS));
    assert.equal(s.settings.estimateRules.length, 12);
    assert.deepEqual(s.items, {});
    assert.deepEqual(s.meta, { lastSyncAt: null, lastError: null });
  }
});

test('migration v1 -> v2: keyword rules become estimate rules', () => {
  const v1 = {
    schemaVersion: 1,
    settings: { capacity: [60, 60, 60, 60, 60, 60, 60], keywordRules: [{ keyword: 'reading', size: 'S' }, { keyword: '', size: 'L' }] },
    weekState: { '2026-09-28': { extraDays: 1 } },
  };
  const s = migrate(v1);
  assert.deepEqual(s.settings.estimateRules, [{ courseId: null, type: null, keyword: 'reading', size: 'S', minutes: null }]);
  assert.equal(s.settings.capacity[1], 60);
  assert.equal('keywordRules' in s.settings, false);
  assert.deepEqual(s.weekState, { '2026-09-28': { extraDays: 1, capacity: {} } });
  // A v1 store with no settings at all just gets the defaults.
  assert.equal(migrate({ schemaVersion: 1 }).settings.estimateRules.length, 12);
});

test('migration v2 -> v3: item size override becomes minutes', () => {
  const s = migrate({
    schemaVersion: 2,
    settings: { sizeMinutes: { XS: 5, S: 15, M: 45, L: 90 } },
    items: {
      1: { courseId: '9', title: 'A', sizeOverride: 'S' },
      2: { courseId: '9', title: 'B', sizeOverride: 'L' },
      3: { courseId: '9', title: 'C', sizeOverride: null },
    },
  });
  assert.equal(s.items['1'].minutesOverride, 15); // uses your size minutes, not the defaults
  assert.equal(s.items['2'].minutesOverride, 90);
  assert.equal(s.items['3'].minutesOverride, null);
  assert.equal('sizeOverride' in s.items['1'], false);
  // A v3 store is left alone.
  assert.equal(migrate({ schemaVersion: 3, items: { 1: { courseId: '9', minutesOverride: 37 } } }).items['1'].minutesOverride, 37);
});

test('settings are clamped and bad values fall back', () => {
  const s = validateSettings({
    weekStartDay: 9, targetDay: 'x', capacity: [0, -5, 99999, '60', null, 120, 120],
    sizeMinutes: { XS: 0, S: 'abc', M: 30 }, typeDefaults: { quiz: 'XXL', upload: 'L' },
    blockedWeekdays: [0, 0, 6, 12], autoSyncMinutes: 1, gatePullOnCompletion: 'yes', statedScale: 5,
    courses: { 5: { include: false, displayName: ' Phys ' }, 6: 'junk', abc: { include: true } },
  });
  assert.equal(s.weekStartDay, 6);
  assert.equal(s.targetDay, 3);
  assert.deepEqual(s.capacity, [0, 0, 1440, 60, 120, 120, 120]);
  assert.deepEqual(s.sizeMinutes, { XS: 1, S: 20, M: 30, L: 120 });
  assert.equal(s.typeDefaults.quiz, 'S');
  assert.equal(s.typeDefaults.upload, 'L');
  assert.deepEqual(s.blockedWeekdays, [0, 6]);
  assert.equal(s.autoSyncMinutes, 15);
  assert.equal(s.statedScale, 10);
  assert.equal(s.gatePullOnCompletion, true);
  assert.deepEqual(s.courses, { 5: { include: false, displayName: 'Phys' } });
  assert.deepEqual(validateSettings({ blockedWeekdays: [0, 1, 2, 3, 4, 5, 6] }).blockedWeekdays, []);
});

test('bad input falls back to the last valid settings, not the defaults', () => {
  const current = validateSettings({ ...DEFAULT_SETTINGS, capacity: [90, 90, 90, 90, 90, 90, 90], statedScale: 70 });
  const next = validateSettings({ ...current, capacity: [90, 'oops', 90, 90, 90, 90, 90], statedScale: 'x' }, current);
  assert.equal(next.capacity[1], 90);
  assert.equal(next.statedScale, 70);
});

test('estimate rules: need a condition and a value; minutes beat size', () => {
  assert.deepEqual(validateRule({ courseId: 7, keyword: ' Report ', minutes: '25', size: 'L' }),
    { courseId: '7', type: null, keyword: 'Report', size: null, minutes: 25 });
  assert.deepEqual(validateRule({ type: 'quiz', size: 'S' }),
    { courseId: null, type: 'quiz', keyword: '', size: 'S', minutes: null });
  assert.equal(validateRule({ size: 'S' }), null); // no condition
  assert.equal(validateRule({ keyword: 'x' }), null); // no value
  assert.equal(validateRule({ keyword: 'x', minutes: 0 }).minutes, 1); // clamped, not dropped
  assert.equal(validateRule({ courseId: 'evil', type: 'nope', keyword: '', size: 'S' }), null);
  assert.equal(validateSettings({ estimateRules: 'junk' }).estimateRules.length, 12);
  assert.deepEqual(validateSettings({ estimateRules: [] }).estimateRules, []);
});

test('items: malformed entries dropped, fields coerced, non-Canvas URLs removed', () => {
  const items = validateItems({
    '12': { courseId: '9', title: 'A', dueAt: '2026-10-03T05:59:00Z', manualDone: 'true', minutesOverride: 120,
      url: 'javascript:alert(1)', type: 'weird' },
    'abc': { courseId: '9' },
    '13': { courseId: 'x' },
    '14': null,
  });
  assert.deepEqual(Object.keys(items), ['12']);
  const i = items['12'];
  assert.equal(i.manualDone, false);
  assert.equal(i.minutesOverride, 120);
  assert.equal(i.url, null);
  assert.equal(i.type, 'other');
  assert.equal(i.dueAt, '2026-10-03T05:59:00Z');
});

test('weekState: extraDays and per-date capacity are clamped', () => {
  const s = migrate({ weekState: {
    '2026-09-28': { extraDays: 40, capacity: { '2026-09-29': 45, '2026-09-30': -3, '2026-10-01': 'x', bad: 10 } },
    'bad': { extraDays: 1 },
  } });
  assert.deepEqual(s.weekState, { '2026-09-28': { extraDays: 6, capacity: { '2026-09-29': 45, '2026-09-30': 0 } } });
});

test('old weeks are pruned after 8 weeks', () => {
  const ws = { '2026-08-03': {}, '2026-08-10': {}, '2026-10-05': {} };
  assert.deepEqual(Object.keys(pruneWeekState(ws, '2026-10-05')), ['2026-08-10', '2026-10-05']);
});
