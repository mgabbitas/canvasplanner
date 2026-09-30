// Canvas API access (GET only) and applying a sync result to stored state.
// fetch and sleep are passed in so this runs under Node tests with a fake Canvas.
import { normalizeAssignment, normalizeCourse } from './normalize.js';
import { mergeCourse } from '../storage/merge.js';

export const CANVAS = 'https://byui.instructure.com';
export const LOGIN_MESSAGE = 'Log into Canvas, then sync';

const MAX_PAGES = 50;
const MAX_RETRIES = 3;

/** Not logged in (401/403, or Canvas answered with its login page instead of JSON). */
export class AuthError extends Error {
  constructor() {
    super(LOGIN_MESSAGE);
    this.name = 'AuthError';
  }
}

/** The rel="next" URL from a Link header, only if it stays on our Canvas host. */
export function parseNextLink(header) {
  for (const part of String(header ?? '').split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (m && m[1].startsWith(CANVAS + '/')) return m[1];
  }
  return null;
}

async function fetchWithBackoff(url, { fetchImpl, sleep }) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (res.status !== 429) return res;
    if (attempt >= MAX_RETRIES) throw new Error('Canvas is rate limiting requests; try again later');
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 2 ** attempt * 1000);
  }
}

/** GET every page of a list endpoint. */
export async function getAll(path, deps) {
  const out = [];
  let url = CANVAS + path;
  for (let page = 0; url; page++) {
    if (page >= MAX_PAGES) throw new Error('Too many pages from Canvas');
    const res = await fetchWithBackoff(url, deps);
    if (res.status === 401 || res.status === 403) throw new AuthError();
    if (!res.ok) throw new Error(`Canvas returned HTTP ${res.status}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text.replace(/^while\(1\);/, ''));
    } catch {
      throw new AuthError(); // an HTML page: the login screen
    }
    if (!Array.isArray(data)) throw new Error('Unexpected response from Canvas');
    out.push(...data);
    url = parseNextLink(res.headers.get('link'));
  }
  return out;
}

/**
 * Fetch courses, then each course's assignments, one course at a time.
 * Throws AuthError if not logged in. A single course failing is recorded, not thrown.
 */
export async function fetchCanvas({ fetchImpl, sleep, delayMs = 300 }) {
  const deps = { fetchImpl, sleep };
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
    if (!activeIds.has(item.courseId) && !item.hidden) items[id] = { ...item, hidden: true };
  }
  const courseMap = { ...state.courses };
  for (const c of courses) courseMap[c.id] = { name: c.name };
  return {
    items,
    courses: courseMap,
    meta: { lastSyncAt: nowIso, lastError: errors.length ? `Some courses failed. ${errors.join('; ')}` : null },
  };
}
