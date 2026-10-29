// Stats from logged times, and estimate-rule suggestions. Pure.
import { weekday } from './dates.js';
import { estimate } from './estimate.js';

export const MIN_LOGS_FOR_SUGGESTION = 3;
export const MIN_DIFFERENCE_MINUTES = 5;

const avg = (nums) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null);
const roundTo5 = (n) => Math.max(5, Math.round(n / 5) * 5);

/** What the planner would estimate on its own (ignoring a per-item minutes override). */
const autoEstimate = (item, settings) => estimate({ ...item, minutesOverride: null, inClass: false }, settings);

function summarize(entries) {
  const minutes = entries.map((e) => e.minutes);
  const difficulties = entries.map((e) => e.difficulty).filter((d) => d != null);
  const estimates = entries.map((e) => e.estimate);
  const total = minutes.reduce((s, n) => s + n, 0);
  return {
    count: entries.length,
    totalMinutes: total,
    avgMinutes: Math.round(avg(minutes)),
    avgDifficulty: difficulties.length ? Math.round(avg(difficulties) * 10) / 10 : null,
    avgEstimate: Math.round(avg(estimates)),
  };
}

function groupBy(entries, keyOf) {
  const groups = new Map();
  for (const e of entries) {
    const key = keyOf(e);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return groups;
}

/**
 * Logged items with minutes, grouped by class, type and the weekday they were
 * finished. Difficulty-only logs count toward difficulty averages only in `overall`.
 */
export function computeStats({ items, settings }) {
  const all = Array.isArray(items) ? items : Object.values(items ?? {});
  const logged = all
    .filter((i) => i.log?.minutes != null)
    .map((i) => ({
      item: i,
      minutes: i.log.minutes,
      difficulty: i.log.difficulty,
      finishedOn: i.log.finishedOn,
      estimate: autoEstimate(i, settings).minutes,
    }));

  const table = (keyOf) => [...groupBy(logged, keyOf)]
    .map(([key, entries]) => ({ key, ...summarize(entries) }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const total = logged.reduce((s, e) => s + e.minutes, 0);
  const byWeekday = Array.from({ length: 7 }, (_, d) => {
    const entries = logged.filter((e) => weekday(e.finishedOn) === d);
    const s = summarize(entries);
    return { key: d, ...s, share: total ? s.totalMinutes / total : 0 };
  });

  const estimated = logged.reduce((s, e) => s + e.estimate, 0);
  return {
    overall: {
      ...summarize(logged),
      // Actual time as a share of the automatic estimates: 0.8 = you take 80% of the estimate.
      actualVsEstimate: estimated ? Math.round((total / estimated) * 100) / 100 : null,
    },
    byCourse: table((e) => e.item.courseId),
    byType: table((e) => e.item.type),
    byWeekday,
  };
}

const ruleKey = (r) => `${r.courseId ?? ''}|${r.type ?? ''}|${(r.keyword ?? '').toLowerCase()}`;

/**
 * Suggested rules: for each class+type and class+keyword group (keywords taken from
 * your current rules) with 3+ logs whose average differs from the current automatic
 * estimate by 5+ minutes. Groups covering the same items keep only the first.
 */
export function suggestRules({ items, settings }) {
  const all = Array.isArray(items) ? items : Object.values(items ?? {});
  const logged = all.filter((i) => i.log?.minutes != null);
  const keywords = [...new Set((settings.estimateRules ?? [])
    .map((r) => (r.keyword ?? '').trim().toLowerCase()).filter(Boolean))];

  const candidates = [];
  for (const [courseId, inCourse] of groupBy(logged, (i) => i.courseId)) {
    for (const keyword of keywords) {
      const matched = inCourse.filter((i) => i.title.toLowerCase().includes(keyword));
      candidates.push({ courseId, type: null, keyword, items: matched });
    }
    for (const [type, matched] of groupBy(inCourse, (i) => i.type)) {
      candidates.push({ courseId, type, keyword: '', items: matched });
    }
  }

  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    if (c.items.length < MIN_LOGS_FOR_SUGGESTION) continue;
    const signature = c.items.map((i) => i.id).sort().join(',');
    if (seen.has(signature)) continue;
    seen.add(signature);
    const actual = avg(c.items.map((i) => i.log.minutes));
    const current = avg(c.items.map((i) => autoEstimate(i, settings).minutes));
    if (Math.abs(actual - current) < MIN_DIFFERENCE_MINUTES) continue;
    out.push({
      courseId: c.courseId,
      type: c.type,
      keyword: c.keyword,
      count: c.items.length,
      avgMinutes: Math.round(actual),
      currentMinutes: Math.round(current),
      minutes: roundTo5(actual),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

const specificity = (r) => (r.courseId ? 1 : 0) + (r.type ? 1 : 0) + (r.keyword ? 1 : 0);

/**
 * Apply a suggestion: replace any rule with the same conditions, and insert the new
 * rule before the first less specific rule so a broader rule can't shadow it.
 */
export function applySuggestion(rules, s) {
  const rule = { courseId: s.courseId, type: s.type, keyword: s.keyword, minutes: s.minutes, inClass: false };
  const rest = rules.filter((r) => ruleKey(r) !== ruleKey(rule));
  const at = rest.findIndex((r) => specificity(r) < specificity(rule));
  return at === -1 ? [...rest, rule] : [...rest.slice(0, at), rule, ...rest.slice(at)];
}
