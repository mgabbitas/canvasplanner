// browser.storage.local access. Everything read goes through migrate() to be validated.
import { migrate, SCHEMA_VERSION } from './schema.js';

export async function loadState() {
  return migrate(await browser.storage.local.get(null));
}

/** Save some top-level keys (settings, items, meta, weekState, courses). */
export async function save(partial) {
  await browser.storage.local.set({ ...partial, schemaVersion: SCHEMA_VERSION });
}
