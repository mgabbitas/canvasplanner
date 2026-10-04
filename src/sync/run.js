// Runs a sync from an extension page using the browser's Canvas login session.
import { fetchCanvas, applySync, AuthError, LOGIN_MESSAGE } from './canvas.js';
import { loadState, save } from '../storage/store.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Returns { ok, error }. On any failure nothing but meta.lastError changes. */
export async function runSync() {
  let result;
  try {
    result = await fetchCanvas({ fetchImpl: (url, opts) => fetch(url, opts), sleep });
  } catch (e) {
    const error = e instanceof AuthError ? LOGIN_MESSAGE : e.message;
    const { meta } = await loadState();
    await save({ meta: { ...meta, lastError: error } });
    return { ok: false, error };
  }
  // Re-read so edits made while fetching (e.g. a checkbox) aren't overwritten.
  const state = await loadState();
  const next = applySync(state, result, new Date().toISOString());
  await save(next);
  return { ok: !next.meta.lastError, error: next.meta.lastError };
}
