process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, applyImport } from '../src/storage/transfer.js';
import { migrate } from '../src/storage/schema.js';

const stored = () => migrate({
  settings: { statedScale: 70, capacity: [0, 90, 90, 90, 90, 90, 60] },
  weekState: { '2026-09-28': { extraDays: 1, capacity: { '2026-09-29': 30 } } },
  dayLog: { '2026-10-01': { left: ['1'] } },
  items: {
    1: { courseId: '9', title: 'Changed', minutesOverride: 120, pinned: true, descriptionText: 'secret-ish' },
    2: { courseId: '9', title: 'Untouched' },
    3: { courseId: '9', title: 'Dismissed', dismissed: true },
  },
});

test('export has settings, week state, and only changed user fields', () => {
  const e = buildExport(stored(), '2026-10-04T12:00:00.000Z');
  assert.equal(e.app, 'canvas-planner');
  assert.equal(e.schemaVersion, 3);
  assert.equal(e.settings.statedScale, 70);
  assert.deepEqual(e.weekState['2026-09-28'].capacity, { '2026-09-29': 30 });
  assert.deepEqual(Object.keys(e.userItems), ['1', '3']);
  assert.deepEqual(e.userItems['1'], {
    courseId: '9', manualDone: false, minutesOverride: 120, pinned: true, dismissed: false, pulledIn: false, inClass: false, log: null, doneOn: null, plannedOn: null, notExam: false,
  });
  assert.equal(JSON.stringify(e).includes('secret-ish'), false); // no Canvas content
});

test('round trip into a fresh install keeps everything; unsynced items wait hidden', () => {
  const file = JSON.parse(JSON.stringify(buildExport(stored(), '2026-10-04T12:00:00.000Z')));
  const fresh = migrate({ items: { 1: { courseId: '9', title: 'Changed' } } });
  const next = applyImport(fresh, file);
  assert.equal(next.settings.statedScale, 70);
  assert.equal(next.settings.capacity[0], 0);
  assert.equal(next.weekState['2026-09-28'].extraDays, 1);
  assert.deepEqual(next.dayLog, { '2026-10-01': { left: ['1'] } });
  assert.equal(next.items['1'].minutesOverride, 120);
  assert.equal(next.items['1'].title, 'Changed');
  assert.equal(next.items['3'].dismissed, true);
  assert.equal(next.items['3'].hidden, true); // stub until the next sync finds it
});

test('import replaces user fields that are not in the file', () => {
  const state = stored();
  const file = { app: 'canvas-planner', schemaVersion: 2, settings: {}, weekState: {}, userItems: {} };
  const next = applyImport(state, file);
  assert.equal(next.items['1'].minutesOverride, null);
  assert.equal(next.items['1'].pinned, false);
  assert.equal(next.items['1'].title, 'Changed'); // Canvas fields untouched
});

test('import rejects other files and clamps bad values', () => {
  assert.throws(() => applyImport(stored(), { hello: 1 }), /not a Canvas Planner export/);
  assert.throws(() => applyImport(stored(), []), /not a Canvas Planner export/);
  assert.throws(() => applyImport(stored(), { app: 'canvas-planner', schemaVersion: 99 }), /newer version/);
  const next = applyImport(stored(), {
    app: 'canvas-planner', schemaVersion: 2,
    settings: { capacity: [5000, 1, 1, 1, 1, 1, 1], estimateRules: [{ keyword: 'x' }, { type: 'quiz', size: 'XS' }] },
    weekState: { junk: 1 },
    userItems: { 1: { courseId: '9', minutesOverride: 'HUGE', manualDone: 'yes' }, evil: { courseId: '9' }, 5: 'junk' },
  });
  assert.equal(next.settings.capacity[0], 1440);
  assert.deepEqual(next.settings.estimateRules, [{ courseId: null, type: 'quiz', keyword: '', size: 'XS', minutes: null, inClass: false }]);
  assert.deepEqual(next.weekState, {});
  assert.equal(next.items['1'].minutesOverride, null);
  assert.equal(next.items['1'].manualDone, false);
  assert.deepEqual(Object.keys(next.items).sort(), ['1', '2', '3']);
});

test('a v1-shaped export still imports (keyword rules migrate)', () => {
  const next = applyImport(stored(), {
    app: 'canvas-planner', schemaVersion: 1, settings: { keywordRules: [{ keyword: 'essay', size: 'L' }] },
  });
  assert.deepEqual(next.settings.estimateRules, [{ courseId: null, type: null, keyword: 'essay', size: 'L', minutes: null, inClass: false }]);
});

test('a v2 export with size overrides imports as minutes', () => {
  const next = applyImport(stored(), {
    app: 'canvas-planner', schemaVersion: 2, settings: { sizeMinutes: { XS: 5, S: 15, M: 45, L: 90 } },
    userItems: { 1: { courseId: '9', sizeOverride: 'L' } },
  });
  assert.equal(next.items['1'].minutesOverride, 90);
});
