// Single source of default settings. Placeholder values (SPEC section 8).
// Weekday indexes follow Date#getDay: 0 = Sunday ... 6 = Saturday.

const rules = (size, words) => words.map((keyword) => ({ courseId: null, type: null, keyword, size, minutes: null, inClass: false }));

export const DEFAULT_SETTINGS = Object.freeze({
  weekStartDay: 1,
  targetDay: 3,
  capacity: [120, 120, 120, 120, 120, 120, 120],
  blockedWeekdays: [],
  sizeMinutes: { XS: 5, S: 20, M: 45, L: 120 },
  typeDefaults: { quiz: 'S', discussion: 'M', upload: 'M', external_tool: 'XS', other: 'M' },
  // Estimate rules: optional courseId/type/keyword (at least one), and a size or exact
  // minutes. Rules naming a course beat instructor-stated times; others don't.
  estimateRules: [
    ...rules('L', ['report', 'essay', 'paper', 'project', 'exam', 'midterm', 'final']),
    ...rules('XS', ['evaluation', 'feedback', 'survey']),
    ...rules('S', ['quiz', 'reading']),
  ],
  statedScale: 100, // percent applied to instructor-stated minutes
  courses: {}, // courseId -> { include, displayName }
  autoSyncMinutes: 60,
  gatePullOnCompletion: true,
  pullCapMinutes: 180, // most unfinished pulled-in work allowed in this week
  showForecast: true,
  includeNonSubmittable: true,
  openOnCanvasVisit: true, // first Canvas visit each browser session opens the planner
});

export const SIZES = ['XS', 'S', 'M', 'L'];

/** User-owned item fields. Sync never touches these. */
export const USER_FIELD_DEFAULTS = Object.freeze({
  manualDone: false,
  minutesOverride: null, // minutes you set on the item (beats every estimate)
  pinned: false,
  dismissed: false,
  pulledIn: false,
  inClass: false, // in-class activity: no homework time
  log: null, // { minutes, difficulty (1-5), finishedOn: 'YYYY-MM-DD' } once logged
});
