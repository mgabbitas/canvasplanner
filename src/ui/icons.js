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
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  flame: ['M12 22c-4.4 0-7.5-3-7.5-7 0-3 1.6-5.2 3.4-7.2.3 1.6 1 2.8 2.1 3.6C10 7.6 11.6 4.4 14.6 2c-.2 3.2 1.4 5.2 3 7.2 1.3 1.6 1.9 3.3 1.9 5.3 0 4.3-3.1 7.5-7.5 7.5z'],
};

// Theme marks next to the name, in the logo's style: a filled shape in the theme color,
// with details cut out in the background color at the logo's line weight.
// fill: solid shape; cut: detail line in the background color; line: line in the theme color.
const MARKS = {
  leaf: [{ fill: 'M4 20C4 10.5 10.5 4 20 4c0 9.5-6.5 16-16 16z' }, { cut: 'M8 16l7.5-7.5' }, { line: 'M3 21l3-3' }],
  pumpkin: [
    { fill: 'M12 7.6c-1.5-1-3.6-1.2-5.4-.5C4.2 8.1 3 10.6 3 13.8 3 17.9 5.5 21 9 21c1.2 0 2.2-.3 3-.8.8.5 1.8.8 3 .8 3.5 0 6-3.1 6-7.2 0-3.2-1.2-5.7-3.6-6.7-1.8-.7-3.9-.5-5.4.5z' },
    { cut: 'M12 9.5v10' }, { cut: 'M8.3 9.5c-1.2 2.6-1.2 7 .2 10' }, { cut: 'M15.7 9.5c1.2 2.6 1.2 7-.2 10' },
    { line: 'M12 7.5c0-2 .8-3.5 2.6-4.5' },
  ],
  snowflake: [
    { line: 'M12 2.5v19' }, { line: 'M3.8 7.25l16.4 9.5' }, { line: 'M3.8 16.75l16.4-9.5' },
    { line: 'M9.5 4l2.5 2 2.5-2' }, { line: 'M9.5 20l2.5-2 2.5 2' },
  ],
  star: [{ fill: 'M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z' }],
  tree: [
    { fill: 'M12 2l5.2 6.3h-2.4l4.2 5.2h-2.5l4.5 5.6H3l4.5-5.6H5l4.2-5.2H6.8z' },
    { fill: 'M10.4 19h3.2v3h-3.2z' },
  ],
};

// Holidays always get their mark; of the everyday looks only Christmas has one.
// (Plain Fall and Patriotic stay plain: festive is for the holiday itself.)
const HOLIDAY_MARKS = { halloween: 'pumpkin', thanksgiving: 'leaf', christmasday: 'tree', july4: 'star' };
const LOOK_MARKS = { christmas: 'snowflake' };

/** The little mark next to the name for today's look, or null. */
export function lookIcon(look, holiday) {
  const name = HOLIDAY_MARKS[holiday] ?? LOOK_MARKS[look];
  if (!name) return null;
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true', class: 'look-icon', 'data-mark': name,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  })) svg.setAttribute(k, v);
  for (const part of MARKS[name]) {
    const node = document.createElementNS(SVG, 'path');
    const [kind, d] = Object.entries(part)[0];
    node.setAttribute('d', d);
    node.setAttribute('class', `mark-${kind}`);
    svg.append(node);
  }
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
