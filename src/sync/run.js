// Runs a sync from an extension page using the browser's Canvas login session.
import { fetchCanvas, applySync, ACCESS_MESSAGE, SCHOOL_MESSAGE } from './canvas.js';
import { CANVAS_PATTERN, canvasBase } from './school.js';
import { loadState, save } from '../storage/store.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const CANVAS_ORIGINS = { origins: [CANVAS_PATTERN] };

/** Firefox can install the add-on without host access; then requests go out without the login cookie. */
export const hasCanvasAccess = () => browser.permissions.contains(CANVAS_ORIGINS).catch(() => true);

/** Returns { ok, error }. On any failure nothing but meta.lastError changes. */
export async function runSync() {
  let result;
  const { canvas } = await loadState();
  if (!canvas.host) return { ok: false, error: SCHOOL_MESSAGE };
  try {
    result = await fetchCanvas({ fetchImpl: (url, opts) => fetch(url, opts), sleep, base: canvasBase(canvas.host) });
  } catch (e) {
    // Without host access the request is refused or sent without the login, so say that instead.
    const error = (await hasCanvasAccess()) ? e.message : ACCESS_MESSAGE;
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
