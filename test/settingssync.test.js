process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toSyncPayload, fromSyncPayload, syncKeys, clearedPayload, hasSyncedCopy, hasOwnSettings, shouldPush,
} from '../src/storage/settingssync.js';
import { validateSettings } from '../src/storage/schema.js';
import { applyImport, buildExport } from '../src/storage/transfer.js';
import { DEFAULT_SETTINGS } from '../src/storage/defaults.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const defaults = () => validateSettings(DEFAULT_SETTINGS);
const mine = validateSettings({
  ...DEFAULT_SETTINGS, targetDay: 4, look: 'forest',
  courses: { 4242: { include: false, displayName: 'Physics', color: 'teal' } },
  estimateRules: [{ keyword: 'lab', minutes: 90 }, { courseId: '4242', keyword: 'quiz', minutes: 15 }],
});
const local = (over = {}) => ({
  settings: defaults(), canvas: { host: null }, settingsSyncedAt: null, syncDevice: B, ...over,
});

test('round trip: settings, class settings and school arrive on a new computer', () => {
  const payload = toSyncPayload(mine, 'yourschool.instructure.com', 1000, A);
  const out = fromSyncPayload(payload, local());
  assert.deepEqual(out.settings, mine);
  assert.deepEqual(out.canvas, { host: 'yourschool.instructure.com' });
  assert.equal(out.settingsSyncedAt, 1000);
  for (const [k, v] of Object.entries(payload)) assert.ok(JSON.stringify(v).length < 8000, k);
  assert.ok(hasSyncedCopy(payload));
  assert.equal(hasSyncedCopy({}), false);
});

test('the on/off switch stays per computer; a review asked stays asked', () => {
  const payload = toSyncPayload({ ...mine, syncSettings: true }, null, 1000, A);
  assert.equal('syncSettings' in payload.cp_settings.settings, false);
  const off = fromSyncPayload(payload, local({ settings: { ...defaults(), syncSettings: false } }));
  assert.equal(off.settings.syncSettings, false);
  const asked = fromSyncPayload(payload, local({ settings: { ...defaults(), reviewAsked: true } }));
  assert.equal(asked.settings.reviewAsked, true);
});

test('a copy is news when its stamp differs, from another computer (clocks not compared)', () => {
  const payload = toSyncPayload(mine, null, 1000, A);
  assert.equal(fromSyncPayload(payload, local({ settingsSyncedAt: 1000 })), null); // already have it
  assert.ok(fromSyncPayload(payload, local({ settingsSyncedAt: 2000 }))); // other computer's clock is behind
  assert.equal(fromSyncPayload(payload, local({ syncDevice: A })), null); // our own copy never comes back
});

test('a synced school only fills in a computer with none', () => {
  const out = fromSyncPayload(toSyncPayload(mine, 'mine.instructure.com', 1000, A), local({ canvas: { host: 'mine.instructure.com' } }));
  assert.equal(out.canvas, undefined);
  assert.equal(out.settings.look, 'forest');
});

test('another school: general settings come over, class names, colors and class rules stay', () => {
  const here = validateSettings({
    ...DEFAULT_SETTINGS,
    courses: { 77: { include: true, displayName: 'Mine', color: 'red' } },
    estimateRules: [{ courseId: '77', keyword: 'essay', minutes: 120 }],
  });
  const out = fromSyncPayload(toSyncPayload(mine, 'new.instructure.com', 1000, A),
    local({ settings: here, canvas: { host: 'old.instructure.com' } }));
  assert.equal(out.settings.look, 'forest');
  assert.deepEqual(out.settings.courses, here.courses);
  assert.deepEqual(out.settings.estimateRules, [{ courseId: null, type: null, keyword: 'lab', minutes: 90, inClass: false },
    { courseId: '77', type: null, keyword: 'essay', minutes: 120, inClass: false }]);
  assert.equal(out.canvas, undefined);
});

test('many rules are split under the size limit; a half-arrived copy waits', () => {
  const rules = Array.from({ length: 200 }, (_, i) => ({ keyword: `keyword number ${i} with some length`, minutes: 10 + i }));
  const big = validateSettings({ ...DEFAULT_SETTINGS, estimateRules: rules });
  const payload = toSyncPayload(big, null, 5, A);
  assert.ok(payload.cp_settings.chunks > 1);
  for (const [k, v] of Object.entries(payload)) assert.ok(JSON.stringify(v).length < 8000, k);
  assert.deepEqual(fromSyncPayload(payload, local()).settings.estimateRules, big.estimateRules);
  const missing = { ...payload };
  delete missing.cp_rules1;
  assert.equal(fromSyncPayload(missing, local()), null);
  // A chunk left from an older copy (different stamp) doesn't count as arrived.
  const stale = { ...payload, cp_rules1: { ...payload.cp_rules1, at: 4 } };
  assert.equal(fromSyncPayload(stale, local()), null);
});

test('a new computer sends nothing until it has settings of its own', () => {
  assert.equal(hasOwnSettings(defaults()), false);
  assert.equal(hasOwnSettings({ ...defaults(), reviewAsked: true, seasonAnswered: ['fall-2026'] }), false);
  assert.equal(hasOwnSettings(mine), true);
  assert.equal(shouldPush(local()), false); // fresh, defaults: wait for the other computer's copy
  assert.equal(shouldPush(local({ settings: mine })), true); // set up here
  assert.equal(shouldPush(local({ settingsSyncedAt: 5 })), true); // syncing already (e.g. Reset settings)
  assert.equal(shouldPush(local({ settings: { ...mine, syncSettings: false } })), false);
});

test('clear on every computer: followed only by computers that were syncing', () => {
  const cleared = clearedPayload(3000, A);
  assert.deepEqual(fromSyncPayload(cleared, local({ settingsSyncedAt: 1000 })), { cleared: true, at: 3000 });
  assert.equal(fromSyncPayload(cleared, local()), null); // a new computer starts fresh
  assert.equal(fromSyncPayload(cleared, local({ settingsSyncedAt: 3000 })), null); // already done
});

test('garbage from sync is validated or ignored', () => {
  assert.equal(fromSyncPayload(null, local()), null);
  assert.equal(fromSyncPayload({ cp_settings: { at: 'soon', settings: {} } }, local()), null);
  const out = fromSyncPayload({ cp_settings: { at: 9, settings: { targetDay: 99, capacity: 'lots' }, school: 'evil.example.com', chunks: 0 } }, local());
  assert.equal(out.settings.targetDay >= 0 && out.settings.targetDay <= 6, true);
  assert.deepEqual(out.settings.capacity, DEFAULT_SETTINGS.capacity);
  assert.equal(out.canvas, undefined); // not a Canvas address
  assert.ok(syncKeys().includes('cp_rules9') && syncKeys().includes('cp_settings'));
});

test('import keeps this computer\'s sync switch and a review already asked', () => {
  const state = {
    settings: { ...defaults(), syncSettings: false, reviewAsked: true }, items: {}, weekState: {}, dayLog: {}, taskSeries: {},
    canvas: { host: null },
  };
  const file = buildExport({ ...state, settings: { ...mine, syncSettings: true, reviewAsked: false } });
  const next = applyImport(state, JSON.parse(JSON.stringify(file)));
  assert.equal(next.settings.syncSettings, false);
  assert.equal(next.settings.reviewAsked, true);
  assert.equal(next.settings.look, 'forest');
});
