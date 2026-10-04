// Theme, accent and class colors. Pure helpers plus applyTheme() for the page.

export const ACCENTS = {
  blue: 'Blue', teal: 'Teal', purple: 'Purple', green: 'Green', orange: 'Orange', pink: 'Pink',
};

// Class colors: mid tones that keep 3:1 contrast as stripes/dots on light and dark
// cards. Always shown next to the class name, never as the only cue.
export const CLASS_COLORS = {
  blue: '#3b82f6', orange: '#ea580c', green: '#16a34a', purple: '#9333ea', red: '#dc2626',
  teal: '#0d9488', pink: '#db2777', amber: '#d97706', indigo: '#6366f1', slate: '#64748b',
};
const CLASS_COLOR_KEYS = Object.keys(CLASS_COLORS);

/**
 * A class's color key: the one you picked, else assigned by course id order so it
 * stays stable when classes are renamed.
 */
export function courseColorKey(courseId, settings, courses) {
  const picked = settings.courses?.[courseId]?.color;
  if (picked && CLASS_COLORS[picked]) return picked;
  const ids = Object.keys(courses ?? {}).sort((a, b) => Number(a) - Number(b));
  const i = ids.indexOf(String(courseId));
  return CLASS_COLOR_KEYS[(i === -1 ? Number(courseId) || 0 : i) % CLASS_COLOR_KEYS.length];
}

export const courseColor = (courseId, settings, courses) => CLASS_COLORS[courseColorKey(courseId, settings, courses)];

export function applyTheme(settings) {
  const root = document.documentElement;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  root.dataset.accent = settings.accent;
}
