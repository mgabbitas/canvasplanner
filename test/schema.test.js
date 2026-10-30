process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, validateSettings, validateItems, validateRule, pruneWeekState, pruneDayLog } from '../src/storage/schema.js';
import { DEFAULT_SETTINGS } from '../src/storage/defaults.js';

test('empty or garbage storage gives defaults', () => {
  for (const raw of [undefined, null, 42, [], {}]) {
    const s = migrate(raw);
    assert.equal(s.schemaVersion, 4);
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
  assert.deepEqual(s.settings.estimateRules, [{ courseId: null, type: null, keyword: 'reading', minutes: 20, inClass: false }]);
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

test('migration v3 -> v4: sizes in rules and type defaults become your minutes', () => {
  const s = migrate({
    schemaVersion: 3,
    settings: {
      sizeMinutes: { XS: 10, S: 15, M: 40, L: 90 },
      typeDefaults: { quiz: 'S', discussion: 'M', upload: 'L', external_tool: 'XS', other: 'toString' },
      estimateRules: [
        { keyword: 'essay', size: 'L', minutes: null },
        { keyword: 'lab', size: 'L', minutes: 50 }, // exact minutes already won
        { keyword: 'teach', size: null, inClass: true },
        { keyword: 'odd', size: 'constructor' },
      ],
    },
  });
  assert.deepEqual(s.settings.typeDefaults, { quiz: 15, discussion: 40, upload: 90, external_tool: 10, other: 45 });
  assert.deepEqual(s.settings.estimateRules, [
    { courseId: null, type: null, keyword: 'essay', minutes: 90, inClass: false },
    { courseId: null, type: null, keyword: 'lab', minutes: 50, inClass: false },
    { courseId: null, type: null, keyword: 'teach', minutes: null, inClass: true },
  ]);
  assert.equal('sizeMinutes' in s.settings, false);
  // Without stored size minutes, the old defaults apply.
  assert.equal(migrate({ schemaVersion: 3, settings: { typeDefaults: { quiz: 'L' } } }).settings.typeDefaults.quiz, 120);
});

test('settings are clamped and bad values fall back', () => {
  const s = validateSettings({
    weekStartDay: 9, targetDay: 'x', capacity: [0, -5, 99999, '60', null, 120, 120],
    typeDefaults: { quiz: 'XXL', upload: 90, other: 0 },
    blockedWeekdays: [0, 0, 6, 12], autoSyncMinutes: 1, gatePullOnCompletion: 'yes', statedScale: 5,
    courses: { 5: { include: false, displayName: ' Phys ' }, 6: 'junk', abc: { include: true } },
  });
  assert.equal(s.weekStartDay, 6);
  assert.equal(s.targetDay, 3);
  assert.deepEqual(s.capacity, [0, 0, 1440, 60, 120, 120, 120]);
  assert.equal('sizeMinutes' in s, false);
  assert.deepEqual(s.typeDefaults, { quiz: 20, discussion: 45, upload: 90, external_tool: 5, other: 1 });
  assert.deepEqual(s.blockedWeekdays, [0, 6]);
  assert.equal(s.autoSyncMinutes, 15);
  assert.equal(s.statedScale, 10);
  assert.equal(s.gatePullOnCompletion, true);
  assert.deepEqual(s.courses, { 5: { include: false, displayName: 'Phys', color: null } });
  assert.deepEqual(validateSettings({ blockedWeekdays: [0, 1, 2, 3, 4, 5, 6] }).blockedWeekdays, []);
});

test('bad input falls back to the last valid settings, not the defaults', () => {
  const current = validateSettings({ ...DEFAULT_SETTINGS, capacity: [90, 90, 90, 90, 90, 90, 90], statedScale: 70 });
  const next = validateSettings({ ...current, capacity: [90, 'oops', 90, 90, 90, 90, 90], statedScale: 'x' }, current);
  assert.equal(next.capacity[1], 90);
  assert.equal(next.statedScale, 70);
});

test('estimate rules: need a condition and a value', () => {
  assert.deepEqual(validateRule({ courseId: 7, keyword: ' Report ', minutes: '25', size: 'L' }),
    { courseId: '7', type: null, keyword: 'Report', minutes: 25, inClass: false });
  assert.equal(validateRule({ minutes: 20 }), null); // no condition
  assert.equal(validateRule({ keyword: 'x' }), null); // no value
  assert.equal(validateRule({ type: 'quiz', size: 'S' }), null); // sizes are gone (migrated before this)
  assert.equal(validateRule({ keyword: 'x', minutes: 0 }).minutes, 1); // clamped, not dropped
  assert.equal(validateRule({ courseId: 'evil', type: 'nope', keyword: '', minutes: 20 }), null);
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

test('in-class: rule value and item flag validate; new settings have defaults', () => {
  assert.deepEqual(validateRule({ keyword: 'teach', inClass: true, minutes: 30 }),
    { courseId: null, type: null, keyword: 'teach', minutes: null, inClass: true });
  assert.equal(validateItems({ 1: { courseId: '9', inClass: 'yes' } })['1'].inClass, false);
  assert.equal(validateItems({ 1: { courseId: '9', inClass: true } })['1'].inClass, true);
  const s = validateSettings({ pullCapMinutes: 5, showForecast: 'no' });
  assert.equal(s.pullCapMinutes, 15);
  assert.equal(s.showForecast, true);
  assert.equal(validateSettings({}).pullCapMinutes, 180);
});

test('items: doneOn and plannedOn must be dates', () => {
  const v = validateItems({
    1: { courseId: '9', doneOn: '2026-10-06', plannedOn: '2026-10-07' },
    2: { courseId: '9', doneOn: 'yesterday', plannedOn: 5 },
  });
  assert.deepEqual([v['1'].doneOn, v['1'].plannedOn], ['2026-10-06', '2026-10-07']);
  assert.deepEqual([v['2'].doneOn, v['2'].plannedOn], [null, null]);
});

test('dayLog: dates and ids validated, duplicates dropped, old days pruned', () => {
  const s = migrate({ dayLog: {
    '2026-10-20': { left: ['5', 5, 'x', '6'] },
    'nope': { left: ['1'] },
    '2026-10-21': { left: 'not a list' },
    '2026-10-22': null,
  } });
  assert.deepEqual(s.dayLog, { '2026-10-20': { left: ['5', '6'] }, '2026-10-21': { left: [] } });
  assert.deepEqual(Object.keys(pruneDayLog({ '2025-01-01': { left: [] }, '2026-10-20': { left: [] } }, '2026-10-24')), ['2026-10-20']);
});

test('split parts validate; day log keeps part ids', () => {
  const items = validateItems({
    1: { courseId: '9', splitParts: 12, partsDone: ['2026-10-01', 'junk', '2026-10-02'] },
    2: { courseId: '9', splitParts: 1, partsDone: ['2026-10-01'] },
    3: { courseId: '9', splitParts: 2, partsDone: ['2026-10-01', '2026-10-02', '2026-10-03'] },
  });
  assert.deepEqual([items['1'].splitParts, items['1'].partsDone], [8, ['2026-10-01', '2026-10-02']]);
  assert.deepEqual([items['2'].splitParts, items['2'].partsDone], [2, ['2026-10-01']]); // clamped up to 2
  assert.deepEqual(items['3'].partsDone, ['2026-10-01', '2026-10-02']);
  assert.deepEqual(migrate({ dayLog: { '2026-10-01': { left: ['5#2', '5', 'x#2', '5#22'] } } }).dayLog['2026-10-01'].left, ['5#2', '5']);
});

test('onboarding validates', () => {
  assert.deepEqual(migrate({}).onboarding, { seenVersion: null, toured: null });
  assert.deepEqual(migrate({ onboarding: { seenVersion: '1.2.0', toured: true } }).onboarding, { seenVersion: '1.2.0', toured: true });
  assert.deepEqual(migrate({ onboarding: { seenVersion: '<b>', toured: 'yes' } }).onboarding, { seenVersion: null, toured: null });
});

test('theme settings validate', () => {
  const s = validateSettings({
    accent: 'brown', look: 'halloween', customAccent: '#ABCDEF', customTint: 'red', holidayLooks: 'yes',
    seasonAnswered: ['fall-2026', 'junk', 'fall-2026', 'christmas-2026'], effects: 9,
  });
  assert.equal(s.accent, 'brown');
  assert.equal(s.look, 'plain'); // holiday looks are never a saved choice
  assert.equal(s.customAccent, '#abcdef');
  assert.equal(s.customTint, DEFAULT_SETTINGS.customTint);
  assert.equal(s.holidayLooks, null);
  assert.deepEqual(s.seasonAnswered, ['fall-2026', 'christmas-2026']);
  assert.equal(s.effects, 3);
  assert.equal(validateSettings({ decorations: false }).effects, 0); // the old switch, turned off
  assert.equal(validateSettings({}).effects, 2);
  assert.equal(validateSettings({ holidayLooks: false }).holidayLooks, false);
});

test('school: chosen host kept; stores from before 1.3 with data are BYU-Idaho; new installs ask', () => {
  assert.deepEqual(migrate({ canvas: { host: 'uofu.instructure.com' } }).canvas, { host: 'uofu.instructure.com' });
  assert.deepEqual(migrate({ canvas: { host: 'evil.com' } }).canvas, { host: null });
  assert.deepEqual(migrate({ meta: { lastSyncAt: '2026-10-01T00:00:00Z' } }).canvas, { host: 'byui.instructure.com' });
  assert.deepEqual(migrate({ items: { 1: { courseId: '9', title: 'A' } } }).canvas, { host: 'byui.instructure.com' });
  assert.deepEqual(migrate({}).canvas, { host: null });
  // Item links from any Canvas school are kept; others dropped.
  const items = validateItems({ 1: { courseId: '9', url: 'https://uofu.instructure.com/courses/9/assignments/1' }, 2: { courseId: '9', url: 'https://evil.com/x' } });
  assert.equal(items['1'].url, 'https://uofu.instructure.com/courses/9/assignments/1');
  assert.equal(items['2'].url, null);
});
