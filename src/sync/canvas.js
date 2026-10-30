// Canvas API access (GET only) and applying a sync result to stored state.
// fetch, sleep and the school's base URL ("https://x.instructure.com") are passed in,
// so this runs under Node tests with a fake Canvas.
import { normalizeAssignment, normalizeCourse } from './normalize.js';
import { mergeCourse } from '../storage/merge.js';

export const LOGIN_MESSAGE = "Canvas didn't recognize your login";
export const ACCESS_MESSAGE = "Canvas Planner isn't allowed to read Canvas yet";
export const SCHOOL_MESSAGE = "Choose your school's Canvas address first";
export const isLoginError = (msg) => String(msg ?? '').startsWith(LOGIN_MESSAGE);

const MAX_PAGES = 50;
const MAX_RETRIES = 3;

/**
 * Not logged in (401/403, or Canvas answered with its login page instead of JSON).
 * `reason` says which, so a report from someone else's browser tells us what happened.
 */
export class AuthError extends Error {
  constructor(reason) {
    super(`${LOGIN_MESSAGE} (${reason}).`);
    this.name = 'AuthError';
    this.reason = reason;
  }
}

/** The rel="next" URL from a Link header, only if it stays on our Canvas host. */
export function parseNextLink(header, base) {
  for (const part of String(header ?? '').split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (m && m[1].startsWith(base + '/')) return m[1];
  }
  return null;
}

async function fetchWithBackoff(url, { fetchImpl, sleep }) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    } catch {
      throw new Error("Couldn't reach Canvas. Check your internet connection, then sync again.");
    }
    if (res.status !== 429) return res;
    if (attempt >= MAX_RETRIES) throw new Error('Canvas is busy right now. Try again in a few minutes.');
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 2 ** attempt * 1000);
  }
}

/** GET every page of a list endpoint. */
export async function getAll(path, deps) {
  const out = [];
  let url = deps.base + path;
  for (let page = 0; url; page++) {
    if (page >= MAX_PAGES) throw new Error('Too many pages from Canvas');
    const res = await fetchWithBackoff(url, deps);
    if (res.status === 401 || res.status === 403) throw new AuthError(`HTTP ${res.status}`);
    if (res.status >= 500) throw new Error(`Canvas is having trouble (HTTP ${res.status}). Try again later.`);
    if (!res.ok) throw new Error(`Canvas returned HTTP ${res.status}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text.replace(/^while\(1\);/, ''));
    } catch {
      // An HTML page: usually the login screen after a redirect.
      throw new AuthError(res.redirected && /\/login/.test(res.url) ? 'sent to the login page' : 'got a web page instead of data');
    }
    if (!Array.isArray(data)) throw new Error('Unexpected response from Canvas');
    out.push(...data);
    url = parseNextLink(res.headers.get('link'), deps.base);
  }
  return out;
}

/**
 * Fetch courses, then each course's assignments, one course at a time.
 * Throws AuthError if not logged in. A single course failing is recorded, not thrown.
 */
export async function fetchCanvas({ fetchImpl, sleep, base, delayMs = 300 }) {
  const deps = { fetchImpl, sleep, base };
  const rawCourses = await getAll('/api/v1/courses?enrollment_state=active&per_page=50', deps);
  const courses = rawCourses.map(normalizeCourse).filter(Boolean);
  const results = [];
  for (const [i, course] of courses.entries()) {
    if (i > 0) await sleep(delayMs);
    try {
      const raw = await getAll(`/api/v1/courses/${course.id}/assignments?include[]=submission&per_page=100`, deps);
      results.push({ courseId: course.id, items: raw.map((a) => normalizeAssignment(a, course.id)) });
    } catch (e) {
      if (e instanceof AuthError) throw e; // session expired mid-sync: change nothing
      results.push({ courseId: course.id, error: e.message });
    }
  }
  return { courses, results };
}

/**
 * Apply a fetch result to stored state. Pure. Successful courses are merged; failed
 * courses keep their items untouched; items of courses no longer active are hidden.
 */
export function applySync(state, { courses, results }, nowIso) {
  let items = state.items;
  const errors = [];
  const activeIds = new Set(courses.map((c) => c.id));
  for (const r of results) {
    if (r.error) {
      const name = courses.find((c) => c.id === r.courseId)?.name ?? r.courseId;
      errors.push(`${name}: ${r.error}`);
    } else {
      items = mergeCourse(items, r.courseId, r.items);
    }
  }
  items = { ...items };
  for (const [id, item] of Object.entries(items)) {
    // Your tasks follow their class: hidden while it isn't active, back when it is.
    // (Canvas items come back through mergeCourse; tasks aren't part of a fetch.)
    const hidden = !activeIds.has(item.courseId);
    if (item.task ? item.hidden !== hidden : hidden && !item.hidden) items[id] = { ...item, hidden };
  }
  const courseMap = { ...state.courses };
  for (const c of courses) courseMap[c.id] = { name: c.name };
  return {
    items,
    courses: courseMap,
    meta: { lastSyncAt: nowIso, lastError: errors.length ? `Some courses failed. ${errors.join('; ')}` : null },
  };
}
