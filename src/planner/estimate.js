// Minutes estimate per item. Highest-priority source wins (SPEC section 5):
// size you set > rules naming a course > instructor-stated time x scale >
// general rules > type default > default size M.

// Only "should take about N minutes/hours". Looser phrases in real descriptions are
// video lengths or in-class presentation times, not the assignment's length.
const STATED = /\bshould take (?:about |approximately |around |roughly )?(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i;
const MAX_STATED_MINUTES = 12 * 60;

export function statedMinutes(text) {
  const m = String(text ?? '').match(STATED);
  if (!m) return null;
  const minutes = Math.round(Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1));
  return minutes > 0 && minutes <= MAX_STATED_MINUTES ? minutes : null;
}

/** Does this rule apply to the item? Every condition the rule sets must match. */
export function ruleMatches(rule, item) {
  const keyword = String(rule.keyword ?? '').trim().toLowerCase();
  if (!rule.courseId && !rule.type && !keyword) return false;
  if (rule.courseId && String(rule.courseId) !== String(item.courseId)) return false;
  if (rule.type && rule.type !== item.type) return false;
  if (keyword && !String(item.title ?? '').toLowerCase().includes(keyword)) return false;
  return true;
}

const ruleMinutes = (rule, sizeMinutes) => rule.minutes ?? sizeMinutes[rule.size] ?? null;

/** { minutes, source } where source is manual | rule | stated | type | default. */
export function estimate(item, settings) {
  const sizes = settings.sizeMinutes;
  if (item.sizeOverride && sizes[item.sizeOverride] != null) {
    return { minutes: sizes[item.sizeOverride], source: 'manual' };
  }
  const rules = settings.estimateRules ?? [];
  const firstRule = (withCourse) => rules.find((r) =>
    Boolean(r.courseId) === withCourse && ruleMatches(r, item) && ruleMinutes(r, sizes) != null);

  const courseRule = firstRule(true);
  if (courseRule) return { minutes: ruleMinutes(courseRule, sizes), source: 'rule' };

  const stated = statedMinutes(item.descriptionText);
  if (stated != null) {
    const scale = (settings.statedScale ?? 100) / 100;
    return { minutes: Math.max(1, Math.round(stated * scale)), source: 'stated' };
  }

  const generalRule = firstRule(false);
  if (generalRule) return { minutes: ruleMinutes(generalRule, sizes), source: 'rule' };

  const typeSize = settings.typeDefaults[item.type];
  if (typeSize && sizes[typeSize] != null) return { minutes: sizes[typeSize], source: 'type' };
  return { minutes: sizes.M, source: 'default' };
}
