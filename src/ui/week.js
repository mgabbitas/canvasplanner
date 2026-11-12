// The plan itself: banners, day tabs, days grouped by class, day capacity editing,
// the pull card and the forecast strip.
import { el, select, dayLabel, dueLabel, minutesLabel, readInt } from './dom.js';
import { courseColor } from './theme.js';
import { toLocalDate, addDays } from '../planner/dates.js';
import { PULL_AMOUNTS } from '../planner/plan.js';
import {
  app, courseName, sumMinutes, plural, updateItems, changeExtraDays, setDayCapacity, saveState, homework, required, itemCount,
} from './app.js';
import { itemRow, pullBlockedText, relativeDay } from './items.js';

export function renderBanners(p) {
  const out = [];
  const target = dayLabel(p.week.cutoff, { weekday: 'long' });
  // Overdue work needs no banner: the Catch up group and the header already say it.
  const workLeft = p.days.some((d) => required(d.items).length) || p.overflow.length || p.atRisk.length;
  if (p.behind && workLeft) {
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
    // Days holding work that doesn't fit in their hours but can't go later.
    const over = p.days.filter((d) => d.over && d.items.some((e) => e.tight))
      .map((d) => `${dayLabel(d.date, { weekday: 'short' })} +${minutesLabel(d.load - d.capacity)}`);
    out.push(el('div', { className: 'banner bad' },
      `${plural(p.atRisk.length, 'item')} (${minutesLabel(p.atRiskMinutes)}) don't fit in your hours before they're due`,
      over.length ? `, so ${over.length === 1 ? 'a day goes' : 'some days go'} over: ${over.join(', ')}. Move something, or give ${over.length === 1 ? 'that day' : 'those days'} more time.` : '.'));
  }
  return out;
}

export function renderPullCard() {
  const { pull } = app.thisWeekPlan;
  const day = pull.nextDay;
  const byAmount = pull.byAmount[app.pullAmount] ?? [];
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
      select(PULL_AMOUNTS.map((m) => [String(m), `About ${minutesLabel(m)}`]), String(app.pullAmount), {
        'aria-label': 'Amount of work to pull', 'data-key': 'pull-size',
        onchange: (e) => { app.pullAmount = Number(e.target.value); app.render(); },
      }),
      el('button', {
        disabled: !pull.enabled || !byAmount.length, 'data-key': 'pull-size-btn',
        title: 'Earliest due first, smallest first when due the same day',
        onclick: () => pullAll(byAmount),
      }, `Pull ${byAmount.length}`),
    ),
    pull.enabled
      ? el('p', { className: 'hint' }, 'Or use Pull → on any item. Pulled items can be sent back from This week.')
      : el('p', { className: 'hint' }, pullBlockedText(pull)), // information, not a problem
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
        // Items due sits on top of its bar; day and date underneath, like a calendar.
        el('span', { className: 'fc-n', 'aria-hidden': 'true' }, f.count ? String(f.count) : ''),
        el('div', { className: 'fc-bar', 'aria-hidden': 'true' }, el('div', { style: `height:${Math.round((f.minutes / max) * 100)}%` })),
        el('span', { className: 'fc-day', 'aria-hidden': 'true' }, dayLabel(f.date, { weekday: 'narrow' })),
        el('span', { className: 'fc-date', 'aria-hidden': 'true' }, dayLabel(f.date, { day: 'numeric' })),
      );
    })),
    p.forecast.some((f) => f.over)
      ? el('p', { className: 'fc-note', 'aria-hidden': 'true' }, el('span', { className: 'swatch' }), 'More than that day\'s hours.')
      : null,
  );
}

/** Exams still ahead in the shown week. Nothing when there are none. */
export function renderExams(p, which) {
  if (!p.exams.length) return null;
  // Real dates: the Next week projection plans as if it were already next week.
  const today = toLocalDate(Date.now());
  return el('section', { className: 'panel exams', 'data-key': 'exams' },
    el('h2', {}, `Exams ${which}`),
    el('ul', { className: 'exam-list' }, p.exams.map((e) => {
      const { item } = e;
      return el('li', { style: `--course:${courseColor(item.courseId, app.state.settings, app.state.courses)}` },
        el('span', { className: 'dot', 'aria-hidden': 'true' }),
        el('div', {},
          item.url
            ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'exam-title' }, item.title)
            : el('span', { className: 'exam-title' }, item.title),
          el('div', { className: 'muted' }, `${courseName(item.courseId)} · ${dueLabel(item.dueAt)}`,
            e.dueDay === today ? el('span', { className: 'chip bad' }, 'today')
              : e.dueDay === addDays(today, 1) ? el('span', { className: 'chip warn' }, 'tomorrow') : null),
        ),
      );
    })),
    el('p', { className: 'hint' }, 'Found by title. Use ⋮ → Not an exam on an item to remove it.'),
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
  const tab = (id, i, { name, date, items, load, done = 0, capacity, over, bonus = false, blocked, wontFit = 0 }) => {
    const active = id === selected;
    const pct = (m) => (capacity ? Math.min(100, (m / capacity) * 100) : 0);
    return el('button', {
      role: 'tab', 'aria-selected': String(active), tabIndex: active ? 0 : -1, 'data-key': `daytab-${id}`,
      className: `day-tab${active ? ' active' : ''}${over ? ' over' : ''}${bonus && !over ? ' bonus' : ''}${blocked ? ' blocked' : ''}${id === 'week' ? ' week' : ''}`,
      'aria-label': `${name}, ${date}: ${itemCount(items)}, ${minutesLabel(load)} planned of ${minutesLabel(capacity)}${done ? `, ${minutesLabel(done)} done` : ''}`,
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
      el('span', { className: 'dt-bar', 'aria-hidden': 'true' },
        done ? el('span', { className: 'done', style: `width:${pct(done)}%` }) : null,
        el('span', { className: 'planned', style: `width:${Math.max(0, pct(load) - pct(done))}%` })),
      el('span', { className: 'dt-count' }, itemCount(items)),
      el('span', { className: 'dt-load' }, capacity === 0 && id !== 'week' ? 'day off'
        // A gold day: your hours, plus what you did beyond them (not "5h 40m / 4h", which reads like a mistake).
        : bonus && !over ? `${minutesLabel(capacity)} + ${minutesLabel(done - capacity)} extra`
          : `${minutesLabel(load)} / ${minutesLabel(capacity)}`),
      wontFit ? el('span', { className: 'dt-wontfit', 'data-key': 'week-wontfit' }, `+${minutesLabel(wontFit)} won't fit`) : null,
    );
  };
  const short = (d) => dayLabel(d, { month: 'short', day: 'numeric' });
  const all = days.flatMap((d) => d.items);
  const weekLoad = days.reduce((s, d) => s + d.load, 0);
  const weekCap = days.reduce((s, d) => s + d.capacity, 0);
  const weekDone = days.reduce((s, d) => s + (d.doneMinutes ?? 0), 0);
  const wontFit = p.overflowMinutes + sumMinutes(p.atRisk.filter((e) => !e.date));
  const tabs = el('div', { className: 'day-tabs', role: 'tablist', 'aria-label': 'Days' },
    tab('week', 0, {
      name: 'Week', date: `${short(days[0].date)} – ${short(days.at(-1).date)}`,
      items: all, load: weekLoad, done: weekDone, capacity: weekCap, blocked: false, wontFit,
      over: days.some((d) => d.over), // what won't fit is its own amber line
    }),
    days.map((d, i) => tab(d.date, i + 1, {
      name: d.date === p.today && kind === 'plan' ? 'Today' : dayLabel(d.date, { weekday: 'short' }),
      date: short(d.date), items: d.items, load: d.load, done: d.doneMinutes ?? 0, capacity: d.capacity, over: d.over, bonus: d.bonus, blocked: d.blocked,
    })),
  );
  const shown = selected === 'week' ? days : [days.find((d) => d.date === selected)];
  return [tabs, el('div', { role: 'tabpanel', className: 'day-panel' },
    shown.map((d) => renderDay(d, p.today, kind, {
      upNext: kind === 'plan' && d.date === p.today,
      ahead: kind === 'plan' && d.date === p.today ? getAhead(p) : null,
    })))];
}

/**
 * Today's homework is all done: offer the next open item from the next day with work.
 * Returns { entry, date, today, finished } or null.
 */
function getAhead(p) {
  const today = p.days.find((d) => d.date === p.today);
  if (!today || required(today.items).length) return null;
  for (const day of p.days) {
    if (day.date <= p.today) continue;
    // A split part can't be moved on its own (the planner places parts), so skip those.
    const entry = required(day.items).find((e) => e.firstDay === p.today && !e.movedTo && !e.part);
    if (entry) return { entry, date: day.date, today: p.today, finished: p.doneToday.count > 0 };
  }
  return null;
}

function aheadCard({ entry, date, today, finished }) {
  const from = relativeDay(date) === 'Tomorrow' ? 'tomorrow' : dayLabel(date, { weekday: 'long' });
  return el('div', { className: 'ahead' },
    el('p', {}, finished ? 'All done for today. Nice work! ' : 'Nothing left today. ',
      el('span', { className: 'muted' }, 'Want to get ahead?')),
    el('button', {
      'data-key': 'ahead',
      title: `${entry.item.title}\nMoves it to today. Use ⋮ on the item to undo.`,
      onclick: () => updateItems([entry.id], { plannedOn: today, pinned: false }),
    }, el('span', { className: 'nowrap' }, `Start one from ${from}:`),
    el('span', { className: 'ahead-title' }, entry.item.title),
    el('span', { className: 'muted nowrap' }, minutesLabel(entry.minutes))),
  );
}

/** One day: header with count and load, then items grouped by class. */
function renderDay(day, today, kind, { upNext = false, ahead = null } = {}) {
  // "Up next": the most urgent homework item today (the planner's first pick). Today's
  // own work comes before catching up, so late work never makes you miss today's.
  const work = day.items.filter((e) => !e.inClass);
  const nextId = upNext ? (work.find((e) => !e.overdue) ?? work[0])?.id : null;
  // Overdue work sits in its own Catch up group at the top of today.
  const catchUp = day.items.filter((e) => e.overdue);
  const groups = new Map();
  for (const e of day.items) {
    if (e.overdue) continue;
    if (!groups.has(e.item.courseId)) groups.set(e.item.courseId, []);
    groups.get(e.item.courseId).push(e);
  }
  const ordered = [...groups].sort(([a], [b]) => courseName(a).localeCompare(courseName(b)));
  const pctOf = (m) => (day.capacity ? Math.min(100, (m / day.capacity) * 100) : 0);
  const done = day.doneMinutes ?? 0;
  const heading = dayLabel(day.date) + (day.date === today && kind === 'plan' ? ' · Today' : '');
  return el('section', { className: `day${day.over ? ' over' : ''}${day.bonus && !day.over ? ' bonus' : ''}${day.blocked ? ' blocked' : ''}` },
    el('div', { className: 'day-head' },
      el('h2', {}, heading),
      el('span', { className: 'load' },
        // Same "planned / hours" as the day tab. What you finished is in the header.
        ...(day.bonus && !day.over
          ? [...capacityControl(day), ` + ${minutesLabel(done - day.capacity)} extra`]
          : [day.blocked && day.capacity > 0 ? 'blocked · ' : `${minutesLabel(day.load)} / `, ...capacityControl(day)])),
    ),
    day.blocked ? null : el('div', { className: 'bar' },
      done ? el('div', { className: 'done', style: `width:${pctOf(done)}%` }) : null,
      el('div', { className: 'planned', style: `width:${Math.max(0, pctOf(day.load) - pctOf(done))}%` })),
    ahead ? aheadCard(ahead) : null,
    catchUp.length ? el('div', { className: 'class-group catch-up', 'data-key': 'catch-up' },
      el('div', { className: 'class-head' },
        el('span', { className: 'class-name' }, 'Catch up'),
        el('span', { className: 'muted' }, `${itemCount(catchUp)} · ${minutesLabel(sumMinutes(catchUp))} overdue`)),
      el('ul', { className: 'items' }, catchUp.map((e) => itemRow(e, kind, { upNext: e.id === nextId })))) : null,
    ordered.length || catchUp.length
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
      : ahead ? null : el('p', { className: 'empty' }, day.blocked ? 'No work planned on this day.'
        : day.doneMinutes ? 'All done for today.' : 'Nothing planned.'),
  );
}
