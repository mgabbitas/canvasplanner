// browser.storage.local access. Everything read goes through migrate() to be validated.
import { migrate, SCHEMA_VERSION } from './schema.js';

export async function loadState() {
  const raw = await browser.storage.local.get(null);
  const state = migrate(raw);
  // Stored in an older shape: write the upgraded state back whole, once. Otherwise a later
  // partial save would stamp the new version on keys that were never upgraded.
  if (Number.isInteger(raw.schemaVersion) && raw.schemaVersion < SCHEMA_VERSION) await browser.storage.local.set(state);
  return state;
}

/** Save some top-level keys (settings, items, meta, weekState, courses). */
export async function save(partial) {
  await browser.storage.local.set({ ...partial, schemaVersion: SCHEMA_VERSION });
}
