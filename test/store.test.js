process.env.TZ = 'America/Denver';
// Settings sync end to end: two fake computers sharing one browser.storage.sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { save, loadState, pullSettings, clearThisComputer, clearEverywhere } from '../src/storage/store.js';
import { SCHEMA_VERSION } from '../src/storage/schema.js';

function area(data = {}) {
  return {
    data,
    get: async () => structuredClone(data),
    set: async (o) => { Object.assign(data, structuredClone(o)); },
    remove: async (keys) => { for (const k of [keys].flat()) delete data[k]; },
    clear: async () => { for (const k of Object.keys(data)) delete data[k]; },
  };
}
function world() {
  const sync = area();
  const computer = () => ({ storage: { local: area(), sync } });
  return { sync, computer };
}
/** Run `fn` as this computer. */
async function on(computer, fn) {
  globalThis.browser = computer;
  return fn();
}
const settingsOf = async (c) => on(c, async () => (await loadState()).settings);
const school = { host: 'yourschool.instructure.com' };

test('a new computer never pushes its defaults over your settings', async () => {
  const { computer } = world();
  const a = computer();
  const b = computer();
  await on(a, async () => {
    await save({ canvas: school });
    await save({ settings: { ...(await loadState()).settings, look: 'forest', targetDay: 4 } });
  });
  // B is installed and you type the school before A's copy has "arrived": B sends nothing.
  await on(b, () => save({ canvas: school }));
  assert.equal((await settingsOf(a)).look, 'forest');
  // The copy arrives: B takes it.
  assert.equal(await on(b, pullSettings), true);
  assert.equal((await settingsOf(b)).look, 'forest');
  // B's next change reaches A.
  await on(b, async () => save({ settings: { ...(await loadState()).settings, look: 'ocean' } }));
  assert.equal(await on(a, pullSettings), true);
  assert.equal((await settingsOf(a)).look, 'ocean');
  // A doesn't take its own copy back, and nothing changes on a second check.
  assert.equal(await on(a, pullSettings), false);
});

test('a set-up computer seeds an empty sync; a fresh one does not', async () => {
  const { sync, computer } = world();
  await on(computer(), () => save({ canvas: school }));
  await on(computer(), pullSettings);
  assert.deepEqual(sync.data, {});
  const old = computer();
  old.storage.local.data.settings = { look: 'forest' };
  old.storage.local.data.schemaVersion = SCHEMA_VERSION;
  await on(old, pullSettings);
  assert.equal(sync.data.cp_settings.settings.look, 'forest');
});

test('stored data in an older shape is left for the page to upgrade first', async () => {
  const { sync, computer } = world();
  const old = computer();
  old.storage.local.data.schemaVersion = SCHEMA_VERSION - 1;
  old.storage.local.data.settings = { look: 'forest' };
  await on(old, pullSettings);
  assert.deepEqual(sync.data, {});
  assert.equal(old.storage.local.data.schemaVersion, SCHEMA_VERSION - 1);
});

test('clear this computer: sync off here, nothing comes back, other computers untouched', async () => {
  const { sync, computer } = world();
  const a = computer();
  const b = computer();
  await on(a, async () => save({ settings: { ...(await loadState()).settings, look: 'forest' } }));
  await on(b, pullSettings);
  await on(a, clearThisComputer);
  assert.equal(sync.data.cp_settings.settings.look, 'forest');
  assert.equal(await on(a, pullSettings), false);
  const here = await settingsOf(a);
  assert.equal(here.syncSettings, false);
  assert.equal(here.look, 'plain');
  assert.equal(await on(b, pullSettings), false);
  assert.equal((await settingsOf(b)).look, 'forest');
});

test('clear every computer: the others clear too; a new computer starts fresh', async () => {
  const { computer } = world();
  const a = computer();
  const b = computer();
  await on(a, async () => save({ settings: { ...(await loadState()).settings, look: 'forest' } }));
  await on(b, pullSettings);
  b.storage.local.data.items = { 1: { id: '1' } };
  await on(a, clearEverywhere);
  assert.deepEqual(a.storage.local.data, {});
  assert.equal(await on(b, pullSettings), true);
  assert.equal(b.storage.local.data.items, undefined);
  assert.equal((await settingsOf(b)).look, 'plain');
  const c = computer();
  assert.equal(await on(c, pullSettings), false);
});
