// Merge one course's freshly synced items into the stored item map. Pure.
import { USER_FIELD_DEFAULTS } from './defaults.js';

const USER_FIELDS = Object.keys(USER_FIELD_DEFAULTS);

/**
 * Call only for a course whose fetch succeeded. Canvas-owned fields are replaced,
 * user-owned fields are kept, a changed due date is remembered in prevDueAt, and
 * stored items of this course missing from the fetch are hidden (not deleted).
 * Items of other courses are returned unchanged.
 */
export function mergeCourse(storedItems, courseId, freshItems) {
  const out = { ...storedItems };
  const seen = new Set();
  for (const fresh of freshItems) {
    seen.add(fresh.id);
    const old = storedItems[fresh.id];
    const user = {};
    for (const f of USER_FIELDS) user[f] = old && f in old ? old[f] : USER_FIELD_DEFAULTS[f];
    let prevDueAt = old?.prevDueAt ?? null;
    if (old && old.dueAt !== fresh.dueAt) prevDueAt = old.dueAt;
    out[fresh.id] = { ...fresh, ...user, prevDueAt, hidden: false };
  }
  for (const [id, item] of Object.entries(storedItems)) {
    if (item.courseId === String(courseId) && !seen.has(id) && !item.hidden) {
      out[id] = { ...item, hidden: true };
    }
  }
  return out;
}

