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
};

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
