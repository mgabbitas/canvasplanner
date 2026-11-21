process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSyncPayload, fromSyncPayload, syncKeys } from '../src/storage/settingssync.js';
import { validateSettings } from '../src/storage/schema.js';
import { DEFAULT_SETTINGS } from '../src/storage/defaults.js';

const mine = validateSettings({
  ...DEFAULT_SETTINGS, targetDay: 4, look: 'forest',
  courses: { 4242: { include: false, displayName: 'Physics', color: 'teal' } },
});
const local = (over = {}) => ({ settings: validateSettings(DEFAULT_SETTINGS), canvas: { host: null }, settingsSyncedAt: null, ...over });

test('round trip: settings, class settings and school arrive on a new computer', () => {
  const payload = toSyncPayload(mine, 'yourschool.instructure.com', 1000);
  const out = fromSyncPayload(payload, local());
  assert.deepEqual(out.settings, mine);
  assert.deepEqual(out.canvas, { host: 'yourschool.instructure.com' });
  assert.equal(out.settingsSyncedAt, 1000);
  // Every key fits the browser's 8 KB per-key limit.
  for (const [k, v] of Object.entries(payload)) assert.ok(JSON.stringify(v).length < 8000, k);
});

test('the on/off switch stays per computer', () => {
  const payload = toSyncPayload({ ...mine, syncSettings: true }, null, 1000);
  assert.equal('syncSettings' in payload.cp_settings, false);
  const out = fromSyncPayload(payload, local({ settings: { ...validateSettings(DEFAULT_SETTINGS), syncSettings: false } }));
  assert.equal(out.settings.syncSettings, false);
});

test('only a newer copy is taken, and a synced school never replaces yours', () => {
  const payload = toSyncPayload(mine, 'other.instructure.com', 1000);
  assert.equal(fromSyncPayload(payload, local({ settingsSyncedAt: 1000 })), null);
  assert.equal(fromSyncPayload(payload, local({ settingsSyncedAt: 2000 })), null);
  const out = fromSyncPayload(payload, local({ canvas: { host: 'mine.instructure.com' }, settingsSyncedAt: 500 }));
  assert.equal(out.canvas, undefined);
  assert.equal(out.settings.look, 'forest');
});

test('many rules are split under the size limit and come back in order', () => {
  const rules = Array.from({ length: 200 }, (_, i) => ({ keyword: `keyword number ${i} with some length`, minutes: 10 + i }));
  const big = validateSettings({ ...DEFAULT_SETTINGS, estimateRules: rules });
  const payload = toSyncPayload(big, null, 5);
  assert.ok(payload.cp_rulesChunks > 1);
  for (const [k, v] of Object.entries(payload)) assert.ok(JSON.stringify(v).length < 8000, k);
  assert.deepEqual(fromSyncPayload(payload, local()).settings.estimateRules, big.estimateRules);
  // A chunk that hasn't arrived yet: wait rather than lose rules.
  const partial = { ...payload };
  delete partial.cp_rules1;
  assert.equal(fromSyncPayload(partial, local()), null);
});

test('garbage from sync is validated or ignored', () => {
  assert.equal(fromSyncPayload(null, local()), null);
  assert.equal(fromSyncPayload({ cp_updatedAt: 'soon', cp_settings: {} }, local()), null);
  const out = fromSyncPayload({ cp_updatedAt: 9, cp_settings: { targetDay: 99, capacity: 'lots' }, cp_school: 'evil.example.com', cp_rulesChunks: 0 }, local());
  assert.equal(out.settings.targetDay >= 0 && out.settings.targetDay <= 6, true);
  assert.deepEqual(out.settings.capacity, DEFAULT_SETTINGS.capacity);
  assert.equal(out.canvas, undefined); // not a Canvas address
  assert.ok(syncKeys().includes('cp_rules9'));
});
