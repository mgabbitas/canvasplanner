// The plan itself: banners, day tabs, days grouped by class, day capacity editing,
// the pull card and the forecast strip.
import { SIZES } from '../storage/defaults.js';
import { el, select, dayLabel, minutesLabel, readInt } from './dom.js';
import { courseColor } from './theme.js';
import {
  app, courseName, sumMinutes, plural, updateItems, changeExtraDays, setDayCapacity, saveState, homework, itemCount,
} from './app.js';
import { itemRow, pullBlockedText } from './items.js';

export function renderBanners(p) {
  const out = [];
  const target = dayLabel(p.week.cutoff, { weekday: 'long' });
  if (p.overdue.length) {
    out.push(el('div', { className: 'banner bad' },
      `${plural(p.overdue.length, 'overdue item')} (${minutesLabel(sumMinutes(p.overdue))}) scheduled today.`));
  }
  if (p.behind) {
    out.push(el('div', { className: 'banner warn' },
      `${target} has passed. Remaining work is scheduled as soon as possible.`));
  }
  if (p.overflow.length) {
    out.push(el('div', { className: 'banner warn' },
      el('span', {}, `${plural(p.overflow.length, 'item')}, ${minutesLabel(p.overflowMinutes)} won't fit by ${target}.`),
      p.week.canAddDay ? el('button', { onclick: () => changeExtraDays(p.week.start, 1) }, 'Add a day') : null,
    ));
  }
  if (p.atRisk.length) {
    out.push(el('div', { className: 'banner bad' },
      `${plural(p.atRisk.length, 'item')} (${minutesLabel(p.atRiskMinutes)}) may not fit before they're due.`));
  }
  return out;
}

export function renderPullCard() {
  const { pull } = app.thisWeekPlan;
  const day = pull.nextDay;
  const bySize = pull.bySize[app.pullSize] ?? [];
  const pullAll = (entries) => updateItems(entries.map((e) => e.id), { pulledIn: true });
  const cap = pull.capMinutes ?? 0;
  const pct = cap ? Math.min(100, (pull.pulledMinutes / cap) * 100) : 0;
  return el('section', { className: 'panel pullcard' },
    el('h2', {}, 'Pull into this week'),
    el('div', { className: 'meter', 'aria-hidden': 'true' }, el('span', { style: `width:${pct}%` })),
    el('p', { className: 'hint' }, `${minutesLabel(pull.pulledMinutes)} of ${minutesLabel(cap)} pulled and unfinished`),
    el('button', {
      className: 'wide', disabled: !pull.enabled || !day.fits, 'data-key': 'pull-day',
      title: pull.enabled && !day.fits && day.entries.length ? pullBlockedText(pull, sumMinutes(day.entries)) : '',
      onclick: () => pullAll(day.entries),
    }, day.date
      ? `Pull ${dayLabel(day.date, { weekday: 'long' })}'s ${day.entries.length} (${minutesLabel(sumMinutes(day.entries))})`
      : 'Nothing left to pull'),
    el('div', { className: 'pull-amount' },
      select(SIZES.map((z) => [z, `About ${minutesLabel(app.state.settings.sizeMinutes[z])}`]), app.pullSize, {
        'aria-label': 'Amount of work to pull', 'data-key': 'pull-size',
        onchange: (e) => { app.pullSize = e.target.value; app.render(); },
      }),
      el('button', {
        disabled: !pull.enabled || !bySize.length, 'data-key': 'pull-size-btn',
        title: 'Earliest due first, smallest first when due the same day',
        onclick: () => pullAll(bySize),
      }, `Pull ${bySize.length}`),
    ),
    pull.enabled
      ? el('p', { className: 'hint' }, 'Or use Pull → on any item. Pulled items can be sent back from This week.')
      : el('p', { className: 'warn-text' }, pullBlockedText(pull)),
  );
}

export function renderForecast(p) {
  const max = Math.max(1, ...p.forecast.map((f) => f.minutes));
  return el('details', {
    className: 'panel forecast', open: app.state.settings.showForecast, 'data-key': 'forecast',
    ontoggle: (e) => {
      if (e.target.open !== app.state.settings.showForecast) {
        saveState({ settings: { ...app.state.settings, showForecast: e.target.open } });
      }
    },
  },
    el('summary', {}, 'Due in the next 14 days'),
    el('ol', { className: 'fc' }, p.forecast.map((f) => {
      const text = `${dayLabel(f.date)}: ${f.count ? `${plural(f.count, 'item')}, ${minutesLabel(f.minutes)} due` : 'nothing due'}${f.over ? ' (more than that day\'s time)' : ''}`;
      return el('li', { className: `${f.over ? 'over' : ''}${f.date === p.today ? ' today' : ''}`, title: text },
        el('span', { className: 'visually-hidden' }, text),
        el('div', { className: 'fc-bar', 'aria-hidden': 'true' }, el('div', { style: `height:${Math.round((f.minutes / max) * 100)}%` })),
        el('span', { className: 'fc-day', 'aria-hidden': 'true' }, dayLabel(f.date, { weekday: 'narrow' })),
        el('span', { className: 'fc-date', 'aria-hidden': 'true' }, dayLabel(f.date, { day: 'numeric' })),
        el('span', { className: 'fc-n', 'aria-hidden': 'true' }, f.count ? String(f.count) : ''),
      );
    })),
  );
}

// --- days and panels ---------------------------------------------------------------

function capacityControl(day) {
  if (app.editingDay === day.date) {
    const input = el('input', {
      type: 'number', min: 0, max: 1440, step: 5, value: day.capacity, className: 'cap-input',
      'aria-label': `Minutes available on ${dayLabel(day.date)}`,
      onkeydown: (e) => {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { app.editingDay = null; app.render(); }
      },
      onblur: (e) => {
        if (app.editingDay !== day.date) return;
        const minutes = readInt(e.target);
        if (minutes == null || minutes === day.capacity) { app.editingDay = null; app.render(); } else setDayCapacity(day.date, minutes);
      },
    });
    queueMicrotask(() => { input.focus(); input.select(); });
    return [input, 'm'];
  }
  return [
    el('button', {
      className: 'cap', 'data-key': `cap-${day.date}`,
      title: `Minutes available on this day (default ${minutesLabel(day.defaultCapacity)}). Click to change for this date only.`,
      onclick: () => { app.editingDay = day.date; app.render(); },
    }, day.capacity === 0 ? 'day off' : minutesLabel(day.capacity)),
    day.capacityOverridden
      ? el('button', {
        className: 'link', 'data-key': `cap-reset-${day.date}`,
        title: `Back to the ${minutesLabel(day.defaultCapacity)} default`,
        onclick: () => setDayCapacity(day.date, null),
      }, 'reset')
      : null,
  ];
}

/** Tabs: Week (every day) then one per day, each with its count and load. */
export function renderDayLayout(p, kind) {
  const days = p.days;
  const ids = ['week', ...days.map((d) => d.date)];
  const selected = ids.includes(app.selectedDay) ? app.selectedDay : days[0].date;
  const pick = (id) => {
    app.selectedDay = id;
    app.render();
    document.querySelector(`[data-key="daytab-${CSS.escape(id)}"]`)?.focus();
  };
  const tab = (id, i, { name, date, items, load, capacity, over, blocked }) => {
    const active = id === selected;
    const pct = capacity ? Math.min(100, (load / capacity) * 100) : 0;
    return el('button', {
      role: 'tab', 'aria-selected': String(active), tabIndex: active ? 0 : -1, 'data-key': `daytab-${id}`,
      className: `day-tab${active ? ' active' : ''}${over ? ' over' : ''}${blocked ? ' blocked' : ''}${id === 'week' ? ' week' : ''}`,
      'aria-label': `${name}, ${date}: ${itemCount(items)}, ${minutesLabel(load)} planned of ${minutesLabel(capacity)}`,
      onclick: () => pick(id),
      onkeydown: (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (step) { e.preventDefault(); pick(ids[(i + step + ids.length) % ids.length]); }
        if (e.key === 'Home') { e.preventDefault(); pick(ids[0]); }
        if (e.key === 'End') { e.preventDefault(); pick(ids.at(-1)); }
      },
    },
      el('span', { className: 'dt-name' }, name),
      el('span', { className: 'dt-date' }, date),
      el('span', { className: 'dt-bar', 'aria-hidden': 'true' }, el('span', { style: `width:${pct}%` })),
      el('span', { className: 'dt-count' }, itemCount(items)),
      el('span', { className: 'dt-load' }, capacity === 0 && id !== 'week' ? 'day off' : `${minutesLabel(load)} / ${minutesLabel(capacity)}`),
    );
  };
  const short = (d) => dayLabel(d, { month: 'short', day: 'numeric' });
  const all = days.flatMap((d) => d.items);
  const weekLoad = days.reduce((s, d) => s + d.load, 0);
  const weekCap = days.reduce((s, d) => s + d.capacity, 0);
  const tabs = el('div', { className: 'day-tabs', role: 'tablist', 'aria-label': 'Days' },
    tab('week', 0, {
      name: 'Week', date: `${short(days[0].date)} – ${short(days.at(-1).date)}`,
      items: all, load: weekLoad, capacity: weekCap, over: weekLoad > weekCap, blocked: false,
    }),
    days.map((d, i) => tab(d.date, i + 1, {
      name: d.date === p.today && kind === 'plan' ? 'Today' : dayLabel(d.date, { weekday: 'short' }),
      date: short(d.date), items: d.items, load: d.load, capacity: d.capacity, over: d.over, blocked: d.blocked,
    })),
  );
  const shown = selected === 'week' ? days : [days.find((d) => d.date === selected)];
  return [tabs, el('div', { role: 'tabpanel', className: 'day-panel' },
    shown.map((d) => renderDay(d, p.today, kind, { upNext: kind === 'plan' && d.date === p.today })))];
}

/** One day: header with count and load, then items grouped by class. */
function renderDay(day, today, kind, { upNext = false } = {}) {
  // "Up next": the most urgent homework item today (the planner's first pick).
  const nextId = upNext ? day.items.find((e) => !e.inClass)?.id : null;
  const groups = new Map();
  for (const e of day.items) {
    if (!groups.has(e.item.courseId)) groups.set(e.item.courseId, []);
    groups.get(e.item.courseId).push(e);
  }
  const ordered = [...groups].sort(([a], [b]) => courseName(a).localeCompare(courseName(b)));
  const pct = day.capacity ? Math.min(100, (day.load / day.capacity) * 100) : 0;
  const heading = dayLabel(day.date) + (day.date === today && kind === 'plan' ? ' · Today' : '');
  return el('section', { className: `day${day.over ? ' over' : ''}${day.blocked ? ' blocked' : ''}` },
    el('div', { className: 'day-head' },
      el('h2', {}, heading),
      el('span', { className: 'load' },
        day.blocked && day.capacity > 0 ? 'blocked · ' : `${itemCount(day.items)} · ${minutesLabel(day.load)} of `,
        ...capacityControl(day)),
    ),
    day.blocked ? null : el('div', { className: 'bar' }, el('div', { style: `width:${pct}%` })),
    ordered.length
      ? ordered.map(([courseId, entries]) => el('div', {
        className: 'class-group', style: `--course:${courseColor(courseId, app.state.settings, app.state.courses)}`,
      },
        el('div', { className: 'class-head' },
          el('span', { className: 'dot', 'aria-hidden': 'true' }),
          el('span', { className: 'class-name' }, courseName(courseId)),
          el('span', { className: 'muted' }, homework(entries).length
            ? `${itemCount(entries)} · ${minutesLabel(sumMinutes(entries))}` : 'in class'),
        ),
        el('ul', { className: 'items' }, entries.map((e) => itemRow(e, kind, { upNext: e.id === nextId, showCourse: false }))),
      ))
      : el('p', { className: 'empty' }, day.blocked ? 'No work planned on this day.' : 'Nothing planned.'),
  );
}
