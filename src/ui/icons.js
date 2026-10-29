// Small line icons, built with DOM calls (no HTML strings). Decorative: aria-hidden.
const SVG = 'http://www.w3.org/2000/svg';

const ICONS = {
  week: ['M3 5h18v16H3z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  next: ['M3 5h18v16H3z', 'M3 10h18', 'M8 3v4', 'M16 3v4', 'M9 15.5h6', 'M12.5 13l2.5 2.5-2.5 2.5'],
  stats: ['M4 20V11', 'M10 20V5', 'M16 20v-6', 'M3 20h18'],
  settings: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', { cx: 15, cy: 7 }, { cx: 9, cy: 17 }],
  sync: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v5h-5'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  // Theme decorations, shown next to the name.
  leaf: ['M5 19C5 10 11 4 20 4c0 9-6 15-15 15z', 'M5 19l8-8'],
  snowflake: ['M12 3v18', 'M4.2 7.5l15.6 9', 'M4.2 16.5l15.6-9', 'M10 4.5l2 1.5 2-1.5', 'M10 19.5l2-1.5 2 1.5'],
  pumpkin: ['M12 8c-5 0-8 2.5-8 6s3 6 8 6 8-2.5 8-6-3-6-8-6z', 'M12 8v12', 'M12 8c0-2 1-3.5 3-4'],
  star: ['M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6-4.5-4.1 6-.7z'],
};

const LOOK_ICONS = { fall: 'leaf', thanksgiving: 'leaf', christmas: 'snowflake', halloween: 'pumpkin', july4: 'star' };

/** The little seasonal mark next to the name, or null for themes without one. */
export function lookIcon(look) {
  if (!LOOK_ICONS[look]) return null;
  const svg = icon(LOOK_ICONS[look]);
  svg.classList.add('look-icon');
  return svg;
}

export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon',
  })) svg.setAttribute(k, v);
  for (const part of ICONS[name] ?? []) {
    const node = typeof part === 'string'
      ? document.createElementNS(SVG, 'path')
      : document.createElementNS(SVG, 'circle');
    if (typeof part === 'string') node.setAttribute('d', part);
    else { node.setAttribute('cx', part.cx); node.setAttribute('cy', part.cy); node.setAttribute('r', 2.2); }
    svg.append(node);
  }
  return svg;
}

/** The app logo (calendar with a check), drawn in the current accent color. */
export function logo() {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 32 32', width: 28, height: 28, 'aria-hidden': 'true', class: 'logo' })) svg.setAttribute(k, v);
  const bg = document.createElementNS(SVG, 'rect');
  for (const [k, v] of Object.entries({ width: 32, height: 32, rx: 8, class: 'logo-bg' })) bg.setAttribute(k, v);
  const g = document.createElementNS(SVG, 'g');
  for (const [k, v] of Object.entries({
    class: 'logo-fg', fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  })) g.setAttribute(k, v);
  const cal = document.createElementNS(SVG, 'rect');
  for (const [k, v] of Object.entries({ x: 8, y: 9.5, width: 16, height: 14.5, rx: 2.5 })) cal.setAttribute(k, v);
  const lines = document.createElementNS(SVG, 'path');
  lines.setAttribute('d', 'M8 14h16M12 7.5v4M20 7.5v4M12.5 19l2.5 2.5 4.5-4.5');
  g.append(cal, lines);
  svg.append(bg, g);
  return svg;
}
