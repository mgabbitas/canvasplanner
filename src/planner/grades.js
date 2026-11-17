// How much each assignment is worth toward its class grade. Pure: no browser, no clock.
//
// Weighted class (assignment groups have weights): an item's share is its points over
// all points in its group, times the group's weight over the weights of the groups
// that have anything in them (Canvas scales weights that don't add up to 100).
// Unweighted class: its points over all points in the class.
// Drop rules ("drop the lowest") are ignored: close enough for a planning hint.

/** Items that count toward a grade: Canvas items with points, not left out of the grade. */
const counts = (i) => !i.task && !i.hidden && i.countsToGrade !== false && i.points > 0;

/**
 * { itemId: share of the class grade, 0-1 } for every item that counts.
 * Items in a 0% group, or in classes without grade info, get no entry.
 */
export function gradeShares(items, courses) {
  const all = Array.isArray(items) ? items : Object.values(items ?? {});
  const byCourse = new Map();
  for (const i of all) if (counts(i)) (byCourse.get(i.courseId) ?? byCourse.set(i.courseId, []).get(i.courseId)).push(i);
  const out = {};
  for (const [courseId, list] of byCourse) {
    const course = courses?.[courseId];
    // Every Canvas class has at least one group, so none means grade info isn't synced
    // yet (e.g. right after updating): show nothing rather than guess.
    if (!course || !Object.keys(course.groups ?? {}).length) continue;
    // Unweighted with no current score: likely not a graded class (an advising or
    // announcements shell). Weighted classes get shares even before the first grade.
    if (!course.weighted && !Number.isFinite(course.score)) continue;
    if (!course.weighted) {
      const total = list.reduce((s, i) => s + i.points, 0);
      for (const i of list) out[i.id] = i.points / total;
      continue;
    }
    const groupPoints = new Map();
    for (const i of list) if (i.groupId) groupPoints.set(i.groupId, (groupPoints.get(i.groupId) ?? 0) + i.points);
    const weightOf = (g) => course.groups?.[g] ?? 0;
    const totalWeight = [...groupPoints.keys()].reduce((s, g) => s + weightOf(g), 0);
    if (!totalWeight) continue;
    for (const i of list) {
      const w = weightOf(i.groupId);
      if (w > 0) out[i.id] = (i.points / groupPoints.get(i.groupId)) * (w / totalWeight);
    }
  }
  return out;
}

/** "12.5%", "6%": one decimal only when it matters. */
export const shareLabel = (share) => `${Math.round(share * 1000) / 10}%`;

/** Shown on an item when it's worth at least this much of the class grade. */
export const BIG_SHARE = 0.05;
