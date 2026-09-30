process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, validateSettings, validateItems } from '../src/storage/schema.js';
import { DEFAULT_SETTINGS } from '../src/storage/defaults.js';

test('empty or garbage storage gives defaults', () => {
  for (const raw of [undefined, null, 42, [], {}]) {
    const s = migrate(raw);
    assert.equal(s.schemaVersion, 1);
    assert.deepEqual(s.settings, validateSettings(DEFAULT_SETTINGS));
    assert.deepEqual(s.items, {});
    assert.deepEqual(s.meta, { lastSyncAt: null, lastError: null });
  }
});

test('settings are clamped and bad values fall back', () => {
  const s = validateSettings({
    weekStartDay: 9, targetDay: 'x', capacity: [0, -5, 99999, '60', null, 120, 120],
    sizeMinutes: { XS: 0, S: 'abc', M: 30 }, typeDefaults: { quiz: 'XXL', upload: 'L' },
    keywordRules: [{ keyword: ' Essay ', size: 'L' }, { keyword: '', size: 'S' }, { keyword: 'x', size: 'huge' }, 'junk'],
    blockedWeekdays: [0, 0, 6, 12], autoSyncMinutes: 1, gatePullOnCompletion: 'yes',
    courses: { 5: { include: false, displayName: 'Phys' }, 6: 'junk' },
  });
  assert.equal(s.weekStartDay, 6);
  assert.equal(s.targetDay, 3);
  assert.deepEqual(s.capacity, [0, 0, 1440, 60, 120, 120, 120]);
  assert.deepEqual(s.sizeMinutes, { XS: 1, S: 20, M: 30, L: 120 });
  assert.equal(s.typeDefaults.quiz, 'S');
  assert.equal(s.typeDefaults.upload, 'L');
  assert.deepEqual(s.keywordRules, [{ keyword: 'Essay', size: 'L' }]);
  assert.deepEqual(s.blockedWeekdays, [0, 6]);
  assert.equal(s.autoSyncMinutes, 15);
  assert.equal(s.gatePullOnCompletion, true);
  assert.deepEqual(s.courses, { 5: { include: false, displayName: 'Phys' } });
  assert.deepEqual(validateSettings({ blockedWeekdays: [0, 1, 2, 3, 4, 5, 6] }).blockedWeekdays, []);
});

test('items: malformed entries dropped, fields coerced, non-Canvas URLs removed', () => {
  const items = validateItems({
    '12': { courseId: '9', title: 'A', dueAt: '2026-10-03T05:59:00Z', manualDone: 'true', sizeOverride: 'L',
      url: 'javascript:alert(1)', type: 'weird' },
    'abc': { courseId: '9' },
    '13': { courseId: 'x' },
    '14': null,
  });
  assert.deepEqual(Object.keys(items), ['12']);
  const i = items['12'];
  assert.equal(i.manualDone, false);
  assert.equal(i.sizeOverride, 'L');
  assert.equal(i.url, null);
  assert.equal(i.type, 'other');
  assert.equal(i.dueAt, '2026-10-03T05:59:00Z');
});

test('weekState clamps extraDays', () => {
  const s = migrate({ weekState: { '2026-09-28': { extraDays: 40 }, 'bad': { extraDays: 1 } } });
  assert.deepEqual(s.weekState, { '2026-09-28': { extraDays: 6 } });
});
