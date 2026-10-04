// New-tab planner page. Views by URL hash: '' this week, #next next week, #settings.
// All Canvas text goes in via textContent (see dom.js), never innerHTML.
import { plan, planNextWeek } from '../planner/plan.js';
import { estimate } from '../planner/estimate.js';
import { planningWeek, toLocalDate } from '../planner/dates.js';
import { loadState, save } from '../storage/store.js';
import { pruneWeekState } from '../storage/schema.js';
import { SIZES } from '../storage/defaults.js';
import { runSync } from '../sync/run.js';
import { el, select, dayLabel, dueLabel, minutesLabel, readInt } from './dom.js';
import { renderSettings, resetSettingsDraft } from './settings.js';

let state = null;
let syncing = false;
let syncMessage = null;
let editingDay = null; // date whose capacity is being edited
let pullSize = 'M'; // amount picked in the "pull about …" control
let thisWeekPlan = null; // latest plan for this week (pull gate, pull candidates)

const view = () => ({ '#settings': 'settings', '#next': 'next' })[location.hash] ?? 'this';

// --- formatting ----------------------------------------------------------------

function timeAgo(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : dueLabel(iso);
}

const courseName = (courseId) =>
  state.settings.courses[courseId]?.displayName || state.courses[courseId]?.name || `Course ${courseId}`;

const SOURCE_LABEL = {
  manual: 'minutes you picked', rule: 'one of your estimate rules', stated: 'instructor-stated time',
  type: 'assignment type default', default: 'default size',
};

const sumMinutes = (entries) => entries.reduce((s, e) => s + e.minutes, 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- state changes ---------------------------------------------------------------

async function saveState(partial) {
  Object.assign(state, partial);
  await save(partial);
  render();
}

function updateItems(ids, patch) {
  const items = { ...state.items };
  for (const id of ids) items[id] = { ...items[id], ...patch };
  return saveState({ items });
}
const updateItem = (id, patch) => updateItems([id], patch);

/** Change one week's state (extraDays, per-date capacity) and prune old weeks. */
function updateWeek(weekStart, change) {
  const current = state.weekState[weekStart] ?? { extraDays: 0, capacity: {} };
  const next = { ...state.weekState, [weekStart]: change({ ...current, capacity: { ...current.capacity } }) };
  return saveState({ weekState: pruneWeekState(next, toLocalDate(Date.now())) });
}

const changeExtraDays = (weekStart, delta) =>
  updateWeek(weekStart, (w) => ({ ...w, extraDays: Math.max(0, w.extraDays + delta) }));

function setDayCapacity(date, minutes) {
  editingDay = null;
  return updateWeek(planningWeek(date, state.settings).start, (w) => {
    if (minutes == null) delete w.capacity[date];
    else w.capacity[date] = Math.min(1440, Math.max(0, minutes));
    return w;
  });
}

async function sync() {
  if (syncing) return;
  syncing = true;
  syncMessage = null;
  render();
  const result = await runSync().catch((e) => ({ ok: false, error: `Sync failed: ${e.message}` }));
  syncing = false;
  syncMessage = result.ok ? null : result.error;
  state = await loadState();
  render();
}

// --- item rows ---------------------------------------------------------------------

// Minutes you can pick for an item: 5, 10, then every 15 min up to 4 h, then 5, 6, 8 h.
const MINUTE_CHOICES = [5, 10, ...Array.from({ length: 16 }, (_, i) => (i + 1) * 15), 300, 360, 480];

function minutesControl(entry) {
  const { item } = entry;
  const auto = estimate({ ...item, minutesOverride: null }, state.settings).minutes;
  const choices = [...new Set([...MINUTE_CHOICES, item.minutesOverride].filter(Boolean))].sort((a, b) => a - b);
  return select(
    [['', `${minutesLabel(auto)} auto`], ...choices.map((m) => [String(m), minutesLabel(m)])],
    item.minutesOverride ? String(item.minutesOverride) : '',
    {
      className: `chip size${item.minutesOverride ? ' set' : ''}`,
      title: `Estimate from ${SOURCE_LABEL[entry.source]}. Pick minutes to change it.`,
      'aria-label': `Minutes for "${item.title}"`,
      'data-key': `minutes-${item.id}`,
      onchange: (e) => updateItem(item.id, { minutesOverride: e.target.value ? Number(e.target.value) : null }),
    },
  );
}

function pinButton(item) {
  return el('button', {
    className: `pin${item.pinned ? ' on' : ''}`,
    'aria-pressed': String(item.pinned),
    'aria-label': `${item.pinned ? 'Unpin' : 'Pin'} "${item.title}"`,
    title: item.pinned ? 'Pinned to its due date. Click to let the planner move it.' : 'Pin to its due date',
    'data-key': `pin-${item.id}`,
    onclick: () => updateItem(item.id, { pinned: !item.pinned }),
  }, '📌');
}

/** One item. kind: 'plan' (this week), 'next' (next week), 'done', 'dismissed'. */
function itemRow(entry, kind = 'plan') {
  const { item } = entry;
  const done = kind === 'done';
  const checkbox = el('input', {
    type: 'checkbox',
    checked: done,
    disabled: (done && !entry.canUncheck) || kind === 'dismissed',
    'aria-label': `Mark "${item.title}" ${done ? 'not done' : 'done'}`,
    title: done && !entry.canUncheck ? 'Submitted in Canvas' : '',
    'data-key': `done-${item.id}`,
    onchange: (e) => updateItem(item.id, { manualDone: e.target.checked }),
  });
  const title = item.url
    ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'title' }, item.title)
    : el('span', { className: 'title' }, item.title);

  const chips = [];
  if (entry.overdue) chips.push(el('span', { className: 'chip bad' }, 'overdue'));
  else if (entry.behind && kind === 'plan') chips.push(el('span', { className: 'chip warn' }, 'behind plan'));
  if (entry.notOpenYet) chips.push(el('span', { className: 'chip' }, `opens ${dayLabel(entry.unlockDate, { weekday: 'short', month: 'short', day: 'numeric' })}`));
  if (item.prevDueAt) chips.push(el('span', { className: 'chip warn', title: `Was due ${dueLabel(item.prevDueAt)}` }, 'due date changed'));
  if (entry.pulledIn && kind === 'plan') chips.push(el('span', { className: 'chip' }, 'pulled in'));

  const canPull = thisWeekPlan?.pull.enabled;
  const actions = [];
  if (kind === 'plan' && entry.overdue) {
    actions.push(el('button', { onclick: () => updateItem(item.id, { dismissed: true }), title: 'Hide this overdue item', 'data-key': `dismiss-${item.id}` }, 'Dismiss'));
  }
  if (kind === 'plan' && entry.pulledIn) {
    actions.push(el('button', { onclick: () => updateItem(item.id, { pulledIn: false }), title: 'Move back to its own week', 'data-key': `back-${item.id}` }, 'Send back'));
  }
  if (kind === 'next') {
    actions.push(el('button', {
      disabled: !canPull, 'data-key': `pull-${item.id}`,
      title: canPull ? 'Plan this in this week' : 'Finish this week\'s work first (or turn off the pull gate in Settings)',
      onclick: () => updateItem(item.id, { pulledIn: true }),
    }, 'Pull →'));
  }
  if (kind === 'dismissed') {
    actions.push(el('button', { onclick: () => updateItem(item.id, { dismissed: false }), 'data-key': `restore-${item.id}` }, 'Restore'));
  }
  if (kind === 'plan' || kind === 'next') actions.push(pinButton(item));
  actions.push(kind === 'plan' || kind === 'next'
    ? minutesControl(entry)
    : el('span', { className: 'chip' }, minutesLabel(entry.minutes)));

  return el('li', { className: `item${done ? ' done' : ''}` },
    checkbox,
    title,
    el('div', { className: 'right' }, actions),
    el('div', { className: 'sub' },
      el('span', {}, courseName(item.courseId)),
      item.dueAt ? el('span', {}, `due ${dueLabel(item.dueAt)}`) : null,
      ...chips,
    ),
  );
}

// --- header, banners, pull bar, forecast ---------------------------------------------

function renderHeader(p) {
  const v = view();
  const meta = state.meta;
  const status = syncing
    ? el('span', {}, 'Syncing…')
    : (syncMessage || meta.lastError)
      ? el('span', { className: 'error' }, syncMessage || meta.lastError)
      : el('span', {}, meta.lastSyncAt ? `Synced ${timeAgo(meta.lastSyncAt)}` : 'Never synced');

  const tab = (hash, label, active) => el('a', {
    href: hash || '#', className: `tab${active ? ' active' : ''}`, 'aria-current': active ? 'page' : null,
    onclick: (e) => { e.preventDefault(); location.hash = hash; },
  }, label);

  const week = p.week;
  return [
    el('h1', {}, v === 'settings'
      ? 'Settings'
      : `Week of ${dayLabel(week.start, { month: 'short', day: 'numeric' })}${v === 'next' ? ' · projected' : ''}`),
    v === 'settings' ? null : el('div', { className: 'target' },
      el('span', {}, `Target: ${dayLabel(week.cutoff, { weekday: 'long' })}`),
      el('button', {
        disabled: !week.canRemoveDay, 'aria-label': 'Remove a day', 'data-key': 'remove-day',
        onclick: () => changeExtraDays(week.start, -1),
      }, '−'),
      el('button', {
        disabled: !week.canAddDay, 'aria-label': 'Add a day', 'data-key': 'add-day',
        onclick: () => changeExtraDays(week.start, 1),
      }, '+'),
    ),
    el('div', { className: 'sync' },
      status,
      el('button', { onclick: sync, disabled: syncing }, 'Sync now'),
      v === 'settings'
        ? el('button', { onclick: () => { location.hash = ''; } }, 'Back to plan')
        : el('button', { onclick: () => { location.hash = 'settings'; }, 'aria-label': 'Settings', title: 'Settings' }, '⚙'),
    ),
    v === 'settings' ? null : el('nav', { className: 'tabs', 'aria-label': 'Week' },
      tab('', 'This week', v === 'this'),
      tab('next', 'Next week', v === 'next'),
    ),
  ];
}

function renderBanners(p) {
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

function renderPullBar() {
  const { pull } = thisWeekPlan;
  const day = pull.nextDay;
  const bySize = pull.bySize[pullSize] ?? [];
  const pullAll = (entries) => updateItems(entries.map((e) => e.id), { pulledIn: true });
  return el('section', { className: 'panel pullbar' },
    el('h2', {}, 'Pull into this week'),
    el('div', { className: 'row' },
      el('button', {
        disabled: !pull.enabled || !day.entries.length, 'data-key': 'pull-day',
        onclick: () => pullAll(day.entries),
      }, day.date
        ? `Pull ${dayLabel(day.date, { weekday: 'long', month: 'short', day: 'numeric' })}'s items (${day.entries.length} · ${minutesLabel(sumMinutes(day.entries))})`
        : 'Nothing left to pull'),
      el('span', { className: 'or' }, 'or'),
      select(SIZES.map((z) => [z, `about ${minutesLabel(state.settings.sizeMinutes[z])}`]), pullSize, {
        'aria-label': 'Amount of work to pull', 'data-key': 'pull-size',
        onchange: (e) => { pullSize = e.target.value; render(); },
      }),
      el('button', {
        disabled: !pull.enabled || !bySize.length, 'data-key': 'pull-size-btn',
        title: 'Earliest due first, smallest first when due the same day',
        onclick: () => pullAll(bySize),
      }, `Pull ${plural(bySize.length, 'item')} (${minutesLabel(sumMinutes(bySize))})`),
    ),
    pull.enabled
      ? el('p', { className: 'hint' }, 'Or pull single items below. Pulled items can be sent back from this week.')
      : el('p', { className: 'warn-text' }, 'Pulling unlocks when this week\'s work is done. You can turn this off in Settings.'),
  );
}

function renderForecast(p) {
  const max = Math.max(1, ...p.forecast.map((f) => f.minutes));
  return el('section', { className: 'panel forecast' },
    el('h2', {}, 'Due in the next 14 days'),
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
  if (editingDay === day.date) {
    const input = el('input', {
      type: 'number', min: 0, max: 1440, step: 5, value: day.capacity, className: 'cap-input',
      'aria-label': `Minutes available on ${dayLabel(day.date)}`,
      onkeydown: (e) => {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { editingDay = null; render(); }
      },
      onblur: (e) => {
        if (editingDay !== day.date) return;
        const minutes = readInt(e.target);
        if (minutes == null || minutes === day.capacity) { editingDay = null; render(); } else setDayCapacity(day.date, minutes);
      },
    });
    queueMicrotask(() => { input.focus(); input.select(); });
    return [input, 'm'];
  }
  return [
    el('button', {
      className: 'cap', 'data-key': `cap-${day.date}`,
      title: `Minutes available on this day (default ${minutesLabel(day.defaultCapacity)}). Click to change for this date only.`,
      onclick: () => { editingDay = day.date; render(); },
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

function renderDay(day, today, kind) {
  const pct = day.capacity ? Math.min(100, (day.load / day.capacity) * 100) : 0;
  const heading = dayLabel(day.date) + (day.date === today && kind === 'plan' ? ' · Today' : '');
  return el('section', { className: `day${day.over ? ' over' : ''}${day.blocked ? ' blocked' : ''}` },
    el('div', { className: 'day-head' },
      el('h2', {}, heading),
      el('span', { className: 'load' },
        day.blocked && day.capacity > 0 ? 'blocked · ' : `${minutesLabel(day.load)} / `,
        ...capacityControl(day)),
    ),
    day.blocked ? null : el('div', { className: 'bar' }, el('div', { style: `width:${pct}%` })),
    day.items.length
      ? el('ul', { className: 'items' }, day.items.map((e) => itemRow(e, kind)))
      : el('p', { className: 'empty' }, day.blocked ? 'No work planned on this day.' : 'Nothing planned.'),
  );
}

function panel(title, entries, kind, open = false) {
  if (!entries.length) return null;
  return el('details', { className: 'panel', open },
    el('summary', {}, `${title} (${entries.length})`),
    el('ul', { className: 'items' }, entries.map((e) => itemRow(e, kind))),
  );
}

// --- settings view hooks ---------------------------------------------------------

const settingsContext = () => ({
  state,
  saveState,
  render,
  afterClear: async () => {
    state = await loadState();
    syncMessage = null;
    location.hash = '';
    render();
    sync();
  },
});

// --- render ------------------------------------------------------------------------

function render() {
  if (!state) return;
  // Re-rendering replaces the DOM; put keyboard focus back where it was.
  const focusKey = document.activeElement?.getAttribute?.('data-key');

  const args = { items: state.items, settings: state.settings, weekState: state.weekState, now: Date.now() };
  thisWeekPlan = plan(args);
  const v = view();
  const p = v === 'next' ? planNextWeek(args) : thisWeekPlan;

  const $ = (id) => document.getElementById(id);
  $('header').replaceChildren(...renderHeader(p).filter(Boolean));
  if (v === 'settings') {
    $('banners').replaceChildren();
    $('days').replaceChildren(...renderSettings(settingsContext()));
    $('extras').replaceChildren();
  } else if (v === 'next') {
    $('banners').replaceChildren(renderPullBar(), ...renderBanners(p));
    $('days').replaceChildren(...p.days.map((d) => renderDay(d, p.today, 'next')));
    $('extras').replaceChildren(...[
      panel("Won't fit by next week's target day", p.overflow, 'next', true),
    ].filter(Boolean));
  } else {
    $('banners').replaceChildren(...renderBanners(p), renderForecast(p));
    $('days').replaceChildren(...p.days.map((d) => renderDay(d, p.today, 'plan')));
    $('extras').replaceChildren(...[
      panel("Won't fit by the target day", p.overflow, 'plan', true),
      panel('At risk', p.atRisk, 'plan', true),
      panel('No due date', p.noDueDate, 'plan'),
      panel('Done this week', p.done, 'done'),
      panel('Dismissed', p.dismissed, 'dismissed'),
    ].filter(Boolean));
  }
  if (focusKey) document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
}

// --- startup -----------------------------------------------------------------------

async function init() {
  state = await loadState();
  render();
  const last = state.meta.lastSyncAt ? Date.parse(state.meta.lastSyncAt) : 0;
  if (Date.now() - last > state.settings.autoSyncMinutes * 60_000) await sync();
}

window.addEventListener('hashchange', () => {
  resetSettingsDraft();
  editingDay = null;
  render();
});

// Another tab changed something: reload and redraw.
browser.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== 'local' || syncing || editingDay) return;
  state = await loadState();
  render();
});

init().catch((e) => {
  document.getElementById('banners').replaceChildren(el('div', { className: 'banner bad' }, `Failed to load: ${e.message}`));
});
