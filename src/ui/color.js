// Color math for themes. Pure (no DOM), so it runs under Node tests.
// Every theme is a background tint plus an accent; the palette for light and dark mode
// is derived from those two, with the accent nudged until text on it stays readable.

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v) => typeof v === 'string' && HEX.test(v);

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;

/** a·(1-t) + b·t, per channel. */
export const mix = (a, b, t) => toHex(toRgb(a).map((c, i) => c + (toRgb(b)[i] - c) * t));

/** WCAG relative luminance and contrast ratio. */
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Move `color` toward `toward` in small steps until it has `ratio` contrast with `against`. */
export function ensureContrast(color, against, ratio, toward) {
  let c = color;
  for (let i = 0; i < 40 && contrast(c, against) < ratio; i++) c = mix(c, toward, 0.06);
  return c;
}

const LIGHT = { text: '#1b1f24', muted: '#5d6570', white: '#ffffff' };
const DARK = { text: '#e7e9ec', muted: '#9ba3ad', base: '#121417' };

/**
 * CSS custom properties for a tint + accent in light or dark mode. Links and the accent
 * get 4.5:1 against the card surface; text on accent buttons picks white or near-black.
 */
export function palette({ tint, accent, accentDark = accent }, dark) {
  if (!dark) {
    const surface = mix(tint, LIGHT.white, 0.97);
    const a = ensureContrast(accent, surface, 4.5, '#000000');
    return {
      '--bg': mix(tint, LIGHT.white, 0.9),
      '--surface': surface,
      '--surface-2': mix(tint, LIGHT.white, 0.86),
      '--border': mix(tint, '#e1e4e8', 0.84),
      '--bar': mix(tint, '#dfe4ec', 0.72),
      '--text': LIGHT.text,
      '--muted': ensureContrast(LIGHT.muted, mix(tint, LIGHT.white, 0.86), 4.5, '#000000'),
      '--accent': a,
      '--accent-soft': mix(a, surface, 0.88),
      '--on-accent': contrast(LIGHT.white, a) >= 4.5 ? LIGHT.white : '#0f1217',
    };
  }
  const surface = mix(tint, '#1a1d21', 0.9);
  const a = ensureContrast(accentDark, surface, 4.5, '#ffffff');
  return {
    '--bg': mix(tint, DARK.base, 0.92),
    '--surface': surface,
    '--surface-2': mix(tint, '#22262b', 0.86),
    '--border': mix(tint, '#2e3339', 0.84),
    '--bar': mix(tint, '#343b44', 0.78),
    '--text': DARK.text,
    '--muted': ensureContrast(DARK.muted, mix(tint, '#22262b', 0.86), 4.5, '#ffffff'),
    '--accent': a,
    '--accent-soft': mix(a, surface, 0.82),
    '--on-accent': contrast('#0f1217', a) >= 4.5 ? '#0f1217' : LIGHT.white,
  };
}

/** For the custom picker: does the chosen accent need adjusting to stay readable? */
export function accentAdjusted({ tint, accent }, dark) {
  return palette({ tint, accent }, dark)['--accent'].toLowerCase() !== accent.toLowerCase();
}
