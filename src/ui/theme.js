// Theme, accent and class colors. Pure helpers plus applyTheme() for the page.
import { palette, mix, ensureContrast, contrast } from './color.js';
import { activeLook } from '../planner/seasons.js';
import { toLocalDate } from '../planner/dates.js';

// Accent colors (light-mode values; dark mode lightens them until they're readable).
export const ACCENT_COLORS = {
  blue: '#2563c9', teal: '#0f766e', purple: '#7c3aed', green: '#166c34', orange: '#b03b0b', pink: '#be185d',
  red: '#b42318', amber: '#a15c07', indigo: '#4f46e5', cyan: '#0e7490', brown: '#8a4b2a',
};
export const ACCENTS = Object.fromEntries(Object.keys(ACCENT_COLORS).map((k) => [k, k[0].toUpperCase() + k.slice(1)]));

/**
 * Themes: a background tint and an accent (Plain uses your accent on neutral grays).
 * `pick` themes show in Appearance; `holiday` ones only appear on their day.
 */
export const THEMES = {
  plain: { label: 'Plain', pick: true },
  ocean: { label: 'Ocean', pick: true, tint: '#0ea5e9', accent: '#0369a1' },
  forest: { label: 'Forest', pick: true, tint: '#22a35a', accent: '#166534' },
  sunset: { label: 'Sunset', pick: true, tint: '#f97316', accent: '#be185d' },
  lavender: { label: 'Lavender', pick: true, tint: '#8b5cf6', accent: '#6d28d9' },
  fall: { label: 'Fall', pick: true, seasonal: true, tint: '#d97706', accent: '#b45309', accentDark: '#f59e0b' },
  christmas: { label: 'Christmas', pick: true, seasonal: true, tint: '#15803d', accent: '#b91c1c', accentDark: '#f04848' },
  custom: { label: 'Custom', pick: true },
  halloween: { label: 'Halloween', holiday: true, tint: '#7c3aed', accent: '#c2410c', accentDark: '#fb923c' },
  thanksgiving: { label: 'Thanksgiving', holiday: true, tint: '#a16207', accent: '#9a3412' },
  july4: { label: '4th of July', holiday: true, tint: '#1d4ed8', accent: '#b91c1c' },
};

/** Tint and accent for a look ({ tint, accent }), or null for Plain. */
export function lookColors(look, settings) {
  if (look === 'custom') return { tint: settings.customTint, accent: settings.customAccent };
  const t = THEMES[look];
  return t?.tint ? { tint: t.tint, accent: t.accent, accentDark: t.accentDark ?? t.accent } : null;
}

/** Accent variables on Plain's fixed surfaces. */
function accentVars(accent, dark) {
  const surface = dark ? '#1c1f23' : '#ffffff';
  const a = ensureContrast(accent, surface, dark ? 5.5 : 4.5, dark ? '#ffffff' : '#000000');
  return {
    '--accent': a,
    '--accent-soft': mix(a, surface, dark ? 0.82 : 0.88),
    '--on-accent': dark ? (contrast('#0f1217', a) >= 4.5 ? '#0f1217' : '#ffffff') : (contrast('#ffffff', a) >= 4.5 ? '#ffffff' : '#0f1217'),
  };
}

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

// The look on screen right now (set by applyTheme), for "class colors match the theme".
let shownTint = null;

export function courseColor(courseId, settings, courses) {
  const base = CLASS_COLORS[courseColorKey(courseId, settings, courses)];
  return settings.themeClassColors && shownTint ? mix(base, shownTint, 0.3) : base;
}

const prefersDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Put the theme on the page: light/dark, the look's colors (or Plain + accent), and data-look for decorations. */
export function applyTheme(settings, date = toLocalDate(Date.now())) {
  const root = document.documentElement;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  const dark = settings.theme === 'dark' || (settings.theme !== 'light' && prefersDark());
  const look = activeLook(settings, date);
  const colors = lookColors(look, settings);
  root.dataset.look = look;
  root.dataset.accent = settings.accent;
  for (const name of PALETTE_VARS) root.style.removeProperty(name);
  const vars = colors ? palette(colors, dark) : accentVars(ACCENT_COLORS[settings.accent] ?? ACCENT_COLORS.blue, dark);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  shownTint = colors?.tint ?? null;
  return look;
}
const PALETTE_VARS = ['--bg', '--surface', '--surface-2', '--border', '--bar', '--text', '--muted', '--accent', '--accent-soft', '--on-accent'];
