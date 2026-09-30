// Minutes estimate per item. Highest-priority source wins (SPEC section 5).

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

function keywordSize(title, rules) {
  const t = String(title ?? '').toLowerCase();
  for (const rule of rules ?? []) {
    const k = String(rule?.keyword ?? '').trim().toLowerCase();
    if (k && t.includes(k)) return rule.size;
  }
  return null;
}

/** { minutes, source } where source is manual | stated | keyword | type | default. */
export function estimate(item, settings) {
  const sizeMin = (size) => settings.sizeMinutes[size];
  if (item.sizeOverride && sizeMin(item.sizeOverride) != null) {
    return { minutes: sizeMin(item.sizeOverride), source: 'manual' };
  }
  const stated = statedMinutes(item.descriptionText);
  if (stated != null) return { minutes: stated, source: 'stated' };
  const kw = keywordSize(item.title, settings.keywordRules);
  if (kw && sizeMin(kw) != null) return { minutes: sizeMin(kw), source: 'keyword' };
  const typeSize = settings.typeDefaults[item.type];
  if (typeSize && sizeMin(typeSize) != null) return { minutes: sizeMin(typeSize), source: 'type' };
  return { minutes: sizeMin('M'), source: 'default' };
}
