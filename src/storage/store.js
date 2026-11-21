// browser.storage.local access. Everything read goes through migrate() to be validated.
// Settings also go to browser.storage.sync when this computer's switch is on (see
// settingssync.js for what goes there).
import { migrate, validateSettings, SCHEMA_VERSION } from './schema.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import {
  toSyncPayload, fromSyncPayload, syncKeys, clearedPayload, hasSyncedCopy, shouldPush,
} from './settingssync.js';

export async function loadState() {
  const raw = await browser.storage.local.get(null);
  const state = migrate(raw);
  // Stored in an older shape: write the upgraded state back whole, once. Otherwise a later
  // partial save would stamp the new version on keys that were never upgraded.
  if (Number.isInteger(raw.schemaVersion) && raw.schemaVersion < SCHEMA_VERSION) await browser.storage.local.set(state);
  return state;
}

/**
 * Save some top-level keys (settings, items, meta, weekState, courses). A change to
 * settings or the school also updates the synced copy (unless it came from there).
 */
export async function save(partial, { fromSync = false } = {}) {
  await browser.storage.local.set({ ...partial, schemaVersion: SCHEMA_VERSION });
  if (!fromSync && ('settings' in partial || 'canvas' in partial)) await pushSettings();
}

// Synced settings are only touched once the stored data is in the current shape (the
// page's loadState upgrades it); a partial save would stamp the new version on old keys.
async function readLocal() {
  const raw = await browser.storage.local.get(null);
  if (Number.isInteger(raw.schemaVersion) && raw.schemaVersion < SCHEMA_VERSION) return null;
  return migrate(raw);
}

/** This computer's random id (made once, kept in storage.local). */
async function deviceId(local) {
  if (local.syncDevice) return local.syncDevice;
  const id = crypto.randomUUID();
  await browser.storage.local.set({ syncDevice: id });
  return id;
}

/** Copy this computer's settings and school to storage.sync. Never fails a save. */
export async function pushSettings() {
  let before;
  try {
    if (!browser.storage.sync) return;
    const local = await readLocal();
    if (!local || !shouldPush(local)) return;
    const from = await deviceId(local);
    const now = Date.now();
    before = local.settingsSyncedAt;
    // Remember the stamp first: this copy's change event must not look like news.
    await browser.storage.local.set({ settingsSyncedAt: now });
    await browser.storage.sync.set(toSyncPayload(local.settings, local.canvas.host, now, from));
  } catch (e) {
    if (before !== undefined) await browser.storage.local.set({ settingsSyncedAt: before }).catch(() => {});
    console.warn(`Settings sync skipped: ${e?.message ?? e}`); // e.g. over the browser's sync quota
  }
}

/**
 * Take another computer's copy when there's a new one. With nothing synced yet, a
 * computer with settings of its own sends them. Returns whether anything here changed.
 */
export async function pullSettings() {
  try {
    if (!browser.storage.sync) return false;
    const local = await readLocal();
    if (!local || !local.settings.syncSettings) return false;
    const remote = await browser.storage.sync.get(null);
    const changes = fromSyncPayload(remote, local);
    if (changes?.cleared) {
      // Another computer chose "Clear all data on every computer".
      await browser.storage.local.clear();
      await save({ settingsSyncedAt: changes.at }, { fromSync: true });
      return true;
    }
    if (changes) {
      await save(changes, { fromSync: true });
      return true;
    }
    if (!hasSyncedCopy(remote)) await pushSettings();
  } catch (e) {
    console.warn(`Settings sync skipped: ${e?.message ?? e}`);
  }
  return false;
}

/** Clear all data on this computer only: sync is switched off here so nothing comes back. */
export async function clearThisComputer() {
  await browser.storage.local.clear();
  await save({ settings: validateSettings({ ...DEFAULT_SETTINGS, syncSettings: false }) }, { fromSync: true });
}

/**
 * Clear all data on every computer: the synced copy becomes a "cleared" note, which the
 * other computers follow (they clear their data too) the next time they check.
 */
export async function clearEverywhere() {
  const local = migrate(await browser.storage.local.get(null));
  const from = await deviceId(local);
  try {
    await browser.storage.sync?.remove(syncKeys());
    await browser.storage.sync?.set(clearedPayload(Date.now(), from));
  } catch { /* sync unavailable: this computer is still cleared */ }
  await browser.storage.local.clear();
}
