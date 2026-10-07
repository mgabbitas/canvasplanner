// Class view (#class/<id>): every unfinished item of one class, grouped by week, with
// filters and a "set all shown" control for changing many estimates at once.
import { classEntries } from '../planner/plan.js';
import { addDays, planningWeek, toLocalDate } from '../planner/dates.js';
import { TYPES } from '../storage/schema.js';
import { el, select, minutesLabel, TYPE_LABELS } from './dom.js';
import { showToast } from './toast.js';
import { app, sumMinutes, plural, saveState, homework } from './app.js';
import { itemRow, MINUTE_CHOICES } from './items.js';

export const emptyClassFilter = () => ({ keyword: '', type: '', setTo: '' });

/** The class's entries after the keyword and type filters. */
export function shownEntries(courseId) {
  const all = classEntries({ items: app.state.items, settings: app.state.settings, courseId, now: Date.now() });
  const kw = app.classFilter.keyword.trim().toLowerCase();
  const type = app.classFilter.type;
  return {
    all,
    shown: all.filter((e) => (!kw || e.item.title.toLowerCase().includes(kw)) && (!type || e.item.type === type)),
  };
}

const SET_TO_PATCH = (v) => (v === 'auto' ? { minutesOverride: null, inClass: false }
  : v === 'inclass' ? { minutesOverride: null, inClass: true }
    : { minutesOverride: Number(v), inClass: false });

/** Change the minutes of every shown item at once, with Undo. */
function setAll(entries, value) {
  const patch = SET_TO_PATCH(value);
  const before = Object.fromEntries(entries.map((e) => [e.id, { minutesOverride: e.item.minutesOverride, inClass: e.item.inClass }]));
  const apply = (patchFor) => {
    const items = { ...app.state.items };
    for (const id of Object.keys(before)) items[id] = { ...items[id], ...patchFor(id) };
    return saveState({ items });
  };
  apply(() => patch);
  const label = value === 'auto' ? 'auto' : value === 'inclass' ? 'in class' : minutesLabel(Number(value));
  const t = showToast({
    message: `Set ${plural(entries.length, 'item')} to ${label}.`,
    actions: [{ label: 'Undo', onclick: () => { t.close(); apply((id) => before[id]); } }],
  });
}

function weekGroup(entry, today, settings) {
  if (!entry.dueDay) return 'No due date';
  const thisWeek = planningWeek(today, settings);
  if (entry.dueDay < today) return 'Overdue';
  if (entry.dueDay <= thisWeek.end) return 'This week';
  if (entry.dueDay <= addDays(thisWeek.end, 7)) return 'Next week';
  return 'Later';
}

export function renderClass(courseId) {
  const { all, shown } = shownEntries(courseId);
  const f = app.classFilter;
  const set = (patch) => { Object.assign(app.classFilter, patch); app.render(); };

  const filters = el('section', { className: 'panel class-tools' },
    el('div', { className: 'row' },
      el('input', {
        type: 'search', value: f.keyword, placeholder: 'Filter by title, e.g. "Teach"', className: 'class-filter',
        'aria-label': 'Filter items by title', 'data-key': 'class-filter',
        oninput: (e) => set({ keyword: e.target.value }),
      }),
      select([['', 'Any type'], ...TYPES.map((t) => [t, TYPE_LABELS[t]])], f.type, {
        'aria-label': 'Filter by type', 'data-key': 'class-type', onchange: (e) => set({ type: e.target.value }),
      }),
    ),
    el('div', { className: 'row' },
      el('span', {}, `Set all ${shown.length} shown to`),
      select([
        ['', 'Choose…'], ['auto', 'Auto (clear)'], ['inclass', 'In class (0m)'],
        ...MINUTE_CHOICES.map((m) => [String(m), minutesLabel(m)]),
      ], f.setTo, { 'aria-label': 'Minutes for every shown item', 'data-key': 'class-set-to', onchange: (e) => set({ setTo: e.target.value }) }),
      el('button', {
        disabled: !f.setTo || !shown.length, 'data-key': 'class-apply',
        onclick: () => { const v = f.setTo; app.classFilter.setTo = ''; setAll(shown, v); },
      }, 'Apply'),
    ),
    shown.length < all.length ? el('p', { className: 'hint' }, `Showing ${shown.length} of ${all.length}.`) : null,
  );

  if (!all.length) return [el('section', { className: 'panel' }, el('p', { className: 'empty' }, 'Nothing left to do in this class.'))];

  const today = toLocalDate(Date.now());
  const groups = new Map();
  for (const e of shown) {
    const g = weekGroup(e, today, app.state.settings);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  return [
    filters,
    ...[...groups].map(([name, entries]) => el('section', { className: 'panel class-week' },
      el('div', { className: 'day-head' },
        el('h2', {}, name),
        el('span', { className: 'load muted' }, homework(entries).length
          ? `${plural(homework(entries).length, 'item')} · ${minutesLabel(sumMinutes(entries))}` : 'in class'),
      ),
      el('ul', { className: 'items' }, entries.map((e) => itemRow(e, 'class', { showCourse: false }))),
    )),
    shown.length ? null : el('p', { className: 'empty' }, 'No items match the filter.'),
  ];
}
