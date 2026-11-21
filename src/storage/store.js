// browser.storage.local access. Everything read goes through migrate() to be validated.
// Settings also go to browser.storage.sync when this computer's switch is on (see
// settingssync.js for what goes there).
import { migrate, SCHEMA_VERSION } from './schema.js';
import { toSyncPayload, fromSyncPayload, syncKeys } from './settingssync.js';

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

/** Copy this computer's settings and school to storage.sync. Never fails a save. */
export async function pushSettings() {
  try {
    if (!browser.storage.sync) return;
    const { settings, canvas } = migrate(await browser.storage.local.get(null));
    if (!settings.syncSettings) return;
    const now = Date.now();
    await browser.storage.sync.set(toSyncPayload(settings, canvas.host, now));
    await browser.storage.local.set({ settingsSyncedAt: now });
  } catch (e) {
    console.warn(`Settings sync skipped: ${e?.message ?? e}`); // e.g. over the browser's sync quota
  }
}

/**
 * Take the synced copy when it's newer than this computer's settings. With nothing synced
 * yet, a computer that's set up (has a school) sends its own. Returns whether it changed.
 */
export async function pullSettings() {
  try {
    if (!browser.storage.sync) return false;
    const local = migrate(await browser.storage.local.get(null));
    if (!local.settings.syncSettings) return false;
    const remote = await browser.storage.sync.get(null);
    const changes = fromSyncPayload(remote, local);
    if (changes) {
      await save(changes, { fromSync: true });
      return true;
    }
    if (!Object.keys(remote).length && local.canvas.host) await pushSettings();
  } catch (e) {
    console.warn(`Settings sync skipped: ${e?.message ?? e}`);
  }
  return false;
}

/** Clear all data: the synced copy too, or it would bring the settings straight back. */
export async function clearSyncedSettings() {
  try {
    await browser.storage.sync?.remove(syncKeys());
  } catch { /* nothing synced, or sync unavailable */ }
}
