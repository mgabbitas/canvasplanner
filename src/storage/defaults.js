// Single source of default settings. Placeholder values (SPEC section 8).
// Weekday indexes follow Date#getDay: 0 = Sunday ... 6 = Saturday.

const rules = (minutes, words) => words.map((keyword) => ({ courseId: null, type: null, keyword, minutes, inClass: false }));

export const DEFAULT_SETTINGS = Object.freeze({
  weekStartDay: 1,
  targetDay: 3,
  capacity: [120, 120, 120, 120, 120, 120, 120],
  blockedWeekdays: [],
  typeDefaults: { quiz: 20, discussion: 45, upload: 45, external_tool: 5, other: 45 }, // minutes
  // Estimate rules: optional courseId/type/keyword (at least one), and minutes (or in
  // class). Rules naming a course beat instructor-stated times; others don't.
  estimateRules: [
    ...rules(120, ['report', 'essay', 'paper', 'project', 'exam', 'midterm', 'final']),
    ...rules(5, ['evaluation', 'feedback', 'survey']),
    ...rules(20, ['quiz', 'reading']),
  ],
  statedScale: 100, // percent applied to instructor-stated minutes
  courses: {}, // courseId -> { include, displayName, color }
  autoSyncMinutes: 60,
  gatePullOnCompletion: true,
  pullCapMinutes: 180, // most unfinished pulled-in work allowed in this week
  showForecast: true,
  theme: 'system', // 'system', 'light' or 'dark'
  accent: 'blue',
  look: 'plain', // theme: plain, ocean, forest, sunset, lavender, fall, christmas, patriotic, neon or custom
  customAccent: '#2563c9', // the Custom theme's colors
  customTint: '#2563c9',
  neonGlow: '#22d3ee', // Neon's main glow (accent, finished time)
  neonGlow2: '#d946ef', // Neon's second glow (planned time)
  neonBg: '#7c3aed', // tints Neon's near-black background (always stays dark)
  holidayLooks: null, // dress up on holidays (just that day): null until you answer
  seasonOffers: true, // offer the Fall / Christmas theme when the season starts
  seasonAnswered: [], // ['fall-2026', …]: seasons already offered this year
  effects: 2, // falling snow and leaves: 0 off, 1 light, 2 normal, 3 lots (never with reduced motion)
  themeClassColors: false, // tint class colors toward the theme
  funMessages: true, // "days ahead" celebrations and the late-night note
  includeNonSubmittable: true,
  openOnCanvasVisit: true, // first Canvas visit each browser session opens the planner
});

/** Fallback when nothing else gives an estimate. */
export const DEFAULT_MINUTES = 45;

/** Size names from schema v3 and older, and their default minutes (for migrations). */
export const LEGACY_SIZES = Object.freeze({ XS: 5, S: 20, M: 45, L: 120 });

/** Preset times offered for rules and type defaults. */
export const TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

/** User-owned item fields. Sync never touches these. */
export const USER_FIELD_DEFAULTS = Object.freeze({
  manualDone: false,
  minutesOverride: null, // minutes you set on the item (beats every estimate)
  pinned: false,
  dismissed: false,
  pulledIn: false,
  inClass: false, // in-class activity: no homework time
  log: null, // { minutes, difficulty (1-5), finishedOn: 'YYYY-MM-DD' } once logged
  doneOn: null, // 'YYYY-MM-DD' you checked it off (counts toward that day's load)
  plannedOn: null, // 'YYYY-MM-DD' you moved it to (beats the planner's pick)
  notExam: false, // you said a title that looks like an exam isn't one
  splitParts: null, // split into this many parts (2-8), planned on different days
  partsDone: null, // ['YYYY-MM-DD', …]: the day each finished part was checked off, in order
});
