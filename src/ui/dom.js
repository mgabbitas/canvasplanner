// Small DOM and formatting helpers shared by the planner and settings views.
// Text always goes in as text nodes (textContent), never as HTML.

/** el('button', { className: 'x', onclick: fn, 'aria-label': 'y' }, 'text', childNode) */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key.includes('-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** <select> from [value, label] pairs. */
export function select(options, value, props = {}) {
  return el('select', props,
    options.map(([v, label]) => el('option', { value: v, selected: v === value }, label)));
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const TYPE_LABELS = {
  quiz: 'Quiz', discussion: 'Discussion', upload: 'Upload', external_tool: 'External tool', other: 'Other',
};

export const dayLabel = (date, opts = { weekday: 'long', month: 'short', day: 'numeric' }) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, opts);
};

export const dueLabel = (iso) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const minutesLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

/** Parse a number input; null if blank or not a number. */
export function readInt(input) {
  const v = input.value.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
