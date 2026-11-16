// "Split across days…": pick the days an item is split across. Mini day cards show each
// day's free time; the number of days you pick is the number of parts.
import { MAX_PARTS } from '../planner/plan.js';
import { estimate } from '../planner/estimate.js';
import { dateRange, minDate, addDays, toLocalDate } from '../planner/dates.js';
import { el, dayLabel, minutesLabel } from './dom.js';
import { app, updateItem } from './app.js';

const MAX_DAYS_SHOWN = 14;

/** Planned days from the plans on screen (this week, and next week when it's shown). */
function knownDays() {
  const byDate = new Map();
  for (const p of [app.thisWeekPlan, app.shownPlan]) for (const d of p?.days ?? []) if (!byDate.has(d.date)) byDate.set(d.date, d);
  return byDate;
}

/**
 * The days on offer: today (or the plan's first day) through the item's last work day.
 * Each: { date, free (minutes, or null when unknown), disabled reason or null, current (a part is there) }.
 */
export function pickerDays(entry, kind, days = knownDays()) {
  const { item } = entry;
  // Next week's view plans as if it were next week already: start at its first day.
  const start = kind === 'next' ? entry.firstDay : toLocalDate(Date.now());
  const end = minDate(entry.lastDay, addDays(start, MAX_DAYS_SHOWN - 1));
  if (end < start) return [];
  return dateRange(start, end).map((date) => {
    const day = days.get(date);
    // This item's own time on the day doesn't count against it.
    const own = (day?.items ?? []).filter((e) => e.item.id === item.id && !e.overdue).reduce((s, e) => s + e.minutes, 0);
    const free = day ? Math.max(0, day.capacity - (day.load - own)) : null;
    const disabled = date < entry.firstDay ? 'not open yet' : day?.blocked ? 'day off' : null;
    return { date, free, disabled, current: own > 0 };
  });
}

/** Which days start picked: where its parts are now, else the roomiest days for 2-4 parts. */
export function suggestedDays(options, total) {
  const open = options.filter((o) => !o.disabled);
  const current = open.filter((o) => o.current).map((o) => o.date);
  if (current.length >= 2) return current;
  const n = Math.min(open.length, total <= 60 ? 2 : total <= 120 ? 3 : 4);
  return open.slice().sort((a, b) => (b.free ?? 0) - (a.free ?? 0) || a.date.localeCompare(b.date))
    .slice(0, n).map((o) => o.date).sort();
}

export function openSplitPicker(entry, kind) {
  const { item } = entry;
  const total = estimate(item, app.state.settings).minutes;
  const options = pickerDays(entry, kind);
  const picked = new Set(suggestedDays(options, total));

  const summary = el('p', { className: 'split-summary', 'data-key': 'split-summary', 'aria-live': 'polite' });
  const error = el('p', { className: 'warn-text', role: 'alert' });
  const update = () => {
    const n = picked.size;
    summary.textContent = n >= 2 ? `${n} parts · ${minutesLabel(Math.ceil(total / n))} each` : 'Pick at least 2 days.';
    error.textContent = '';
  };

  const cards = options.map((o) => {
    const box = el('input', {
      type: 'checkbox', value: o.date, checked: picked.has(o.date), disabled: Boolean(o.disabled), 'data-key': `split-day-${o.date}`,
      onchange: (e) => {
        if (e.target.checked && picked.size >= MAX_PARTS) {
          e.target.checked = false;
          error.textContent = `At most ${MAX_PARTS} parts.`;
          return;
        }
        if (e.target.checked) picked.add(o.date); else picked.delete(o.date);
        update();
      },
    });
    return el('label', { className: `split-day${o.disabled ? ' disabled' : ''}` },
      box,
      el('span', { className: 'dt-name' }, dayLabel(o.date, { weekday: 'short' })),
      el('span', { className: 'dt-date' }, dayLabel(o.date, { month: 'short', day: 'numeric' })),
      el('span', { className: 'dt-load' }, o.disabled ?? (o.free == null ? '' : o.free ? `${minutesLabel(o.free)} free` : 'full')));
  });

  const dialog = el('dialog', { className: 'task-dialog split-dialog', 'aria-labelledby': 'split-dialog-title' });
  const close = () => { dialog.close(); dialog.remove(); };
  const save = (e) => {
    e.preventDefault();
    if (picked.size < 2) return void (error.textContent = 'Pick at least 2 days, or Cancel.');
    const splitDays = [...picked].sort();
    updateItem(item.id, { splitParts: splitDays.length, splitDays, partsDone: null, plannedOn: null, pinned: false });
    close();
  };

  dialog.append(el('form', { method: 'dialog', onsubmit: save },
    el('h2', { id: 'split-dialog-title' }, 'Split across days'),
    el('p', { className: 'hint' }, item.title, ` · ${minutesLabel(total)}. Pick the days to work on it.`),
    cards.length
      ? el('div', { className: 'split-days', role: 'group', 'aria-label': 'Days' }, cards)
      : el('p', { className: 'hint' }, 'No days left before it\'s due.'),
    summary,
    error,
    el('div', { className: 'form-buttons' },
      item.splitParts ? el('button', {
        type: 'button', 'data-key': 'split-none',
        onclick: () => { close(); updateItem(item.id, { splitParts: null, splitDays: null }); },
      }, "Don't split") : null,
      el('span', { className: 'spacer' }),
      el('button', { type: 'button', onclick: close, 'data-key': 'split-cancel' }, 'Cancel'),
      el('button', { type: 'submit', className: 'primary', 'data-key': 'split-save' }, 'Split')),
  ));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  update();
  dialog.showModal();
}
