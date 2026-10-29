// Minutes estimate per item. Highest-priority source wins (SPEC section 5):
// minutes you set on the item > rules naming a course > instructor-stated time x scale >
// general rules > type default > 45 minutes.
import { DEFAULT_MINUTES } from '../storage/defaults.js';

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

const ruleUsable = (rule) => rule.inClass === true || Number.isFinite(rule.minutes);
const fromRule = (rule) => (rule.inClass === true
  ? { minutes: 0, source: 'rule', inClass: true }
  : { minutes: rule.minutes, source: 'rule', inClass: false });

/**
 * { minutes, source, inClass } where source is manual | rule | stated | type | default.
 * inClass: an in-class activity, which takes no homework time (0 minutes).
 */
export function estimate(item, settings) {
  if (Number.isFinite(item.minutesOverride) && item.minutesOverride > 0) {
    return { minutes: item.minutesOverride, source: 'manual', inClass: false };
  }
  if (item.inClass === true) return { minutes: 0, source: 'manual', inClass: true };
  const rules = settings.estimateRules ?? [];
  const firstRule = (withCourse) => rules.find((r) =>
    Boolean(r.courseId) === withCourse && ruleMatches(r, item) && ruleUsable(r));

  const courseRule = firstRule(true);
  if (courseRule) return fromRule(courseRule);

  const stated = statedMinutes(item.descriptionText);
  if (stated != null) {
    const scale = (settings.statedScale ?? 100) / 100;
    return { minutes: Math.max(1, Math.round(stated * scale)), source: 'stated', inClass: false };
  }

  const generalRule = firstRule(false);
  if (generalRule) return fromRule(generalRule);

  const typeMinutes = settings.typeDefaults?.[item.type];
  if (Number.isFinite(typeMinutes)) return { minutes: typeMinutes, source: 'type', inClass: false };
  return { minutes: DEFAULT_MINUTES, source: 'default', inClass: false };
}
