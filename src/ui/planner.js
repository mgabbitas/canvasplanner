// New-tab planner page: the plan view, plus the settings view at #settings.
// All Canvas text goes in via textContent (see dom.js), never innerHTML.
import { plan } from '../planner/plan.js';
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

const isSettingsView = () => location.hash === '#settings';

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
  manual: 'size you picked', rule: 'one of your estimate rules', stated: 'instructor-stated time',
  type: 'assignment type default', default: 'default size',
};

// --- state changes ---------------------------------------------------------------

async function saveState(partial) {
  Object.assign(state, partial);
  await save(partial);
  render();
}

const updateItem = (id, patch) => saveState({ items: { ...state.items, [id]: { ...state.items[id], ...patch } } });

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

// --- plan view -------------------------------------------------------------------

function sizeControl(entry) {
  const { item } = entry;
  const sizes = state.settings.sizeMinutes;
  const auto = estimate({ ...item, sizeOverride: null }, state.settings).minutes;
  return select(
    [['', `${minutesLabel(auto)} auto`], ...SIZES.map((s) => [s, `${s} · ${minutesLabel(sizes[s])}`])],
    item.sizeOverride ?? '',
    {
      className: `chip size${item.sizeOverride ? ' set' : ''}`,
      title: `Estimate from ${SOURCE_LABEL[entry.source]}. Pick a size to change it.`,
      'aria-label': `Size of "${item.title}"`,
      'data-key': `size-${item.id}`,
      onchange: (e) => updateItem(item.id, { sizeOverride: e.target.value || null }),
    },
  );
}

function itemRow(entry, { done = false } = {}) {
  const { item } = entry;
  const checkbox = el('input', {
    type: 'checkbox',
    checked: done,
    disabled: done && !entry.canUncheck,
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
  else if (entry.behind && !done) chips.push(el('span', { className: 'chip warn' }, 'behind plan'));
  if (entry.notOpenYet) chips.push(el('span', { className: 'chip' }, `opens ${dayLabel(entry.unlockDate, { weekday: 'short', month: 'short', day: 'numeric' })}`));
  if (item.prevDueAt) chips.push(el('span', { className: 'chip warn', title: `Was due ${dueLabel(item.prevDueAt)}` }, 'due date changed'));
  if (entry.pulledIn) chips.push(el('span', { className: 'chip' }, 'pulled in'));

  const right = el('div', { className: 'right' },
    entry.overdue && !done
      ? el('button', { onclick: () => updateItem(item.id, { dismissed: true }), title: 'Hide this overdue item' }, 'Dismiss')
      : null,
    done ? el('span', { className: 'chip' }, minutesLabel(entry.minutes)) : sizeControl(entry),
  );

  return el('li', { className: `item${done ? ' done' : ''}` },
    checkbox,
    title,
    right,
    el('div', { className: 'sub' },
      el('span', {}, courseName(item.courseId)),
      item.dueAt ? el('span', {}, `due ${dueLabel(item.dueAt)}`) : null,
      ...chips,
    ),
  );
}

function renderHeader(p) {
  const { week } = p;
  const meta = state.meta;
  const status = syncing
    ? el('span', {}, 'Syncing…')
    : (syncMessage || meta.lastError)
      ? el('span', { className: 'error' }, syncMessage || meta.lastError)
      : el('span', {}, meta.lastSyncAt ? `Synced ${timeAgo(meta.lastSyncAt)}` : 'Never synced');

  return [
    el('h1', {}, isSettingsView() ? 'Settings' : `Week of ${dayLabel(week.start, { month: 'short', day: 'numeric' })}`),
    isSettingsView() ? null : el('div', { className: 'target' },
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
      isSettingsView()
        ? el('button', { onclick: () => { location.hash = ''; } }, 'Back to plan')
        : el('button', { onclick: () => { location.hash = 'settings'; }, 'aria-label': 'Settings', title: 'Settings' }, '⚙'),
    ),
  ];
}

function renderBanners(p) {
  const out = [];
  const sum = (list) => list.reduce((s, e) => s + e.minutes, 0);
  const target = dayLabel(p.week.cutoff, { weekday: 'long' });
  if (p.overdue.length) {
    out.push(el('div', { className: 'banner bad' },
      `${p.overdue.length} overdue item${p.overdue.length > 1 ? 's' : ''} (${minutesLabel(sum(p.overdue))}) scheduled today.`));
  }
  if (p.behind) {
    out.push(el('div', { className: 'banner warn' },
      `${target} has passed. Remaining work is scheduled as soon as possible.`));
  }
  if (p.overflow.length) {
    out.push(el('div', { className: 'banner warn' },
      el('span', {}, `${p.overflow.length} item${p.overflow.length > 1 ? 's' : ''}, ${minutesLabel(p.overflowMinutes)} won't fit by ${target}.`),
      p.week.canAddDay ? el('button', { onclick: () => changeExtraDays(p.week.start, 1) }, 'Add a day') : null,
    ));
  }
  if (p.atRisk.length) {
    out.push(el('div', { className: 'banner bad' },
      `${p.atRisk.length} item${p.atRisk.length > 1 ? 's' : ''} (${minutesLabel(p.atRiskMinutes)}) may not fit before they're due.`));
  }
  return out;
}

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

function renderDay(day, today) {
  const pct = day.capacity ? Math.min(100, (day.load / day.capacity) * 100) : 0;
  const heading = dayLabel(day.date) + (day.date === today ? ' · Today' : '');
  return el('section', { className: `day${day.over ? ' over' : ''}${day.blocked ? ' blocked' : ''}` },
    el('div', { className: 'day-head' },
      el('h2', {}, heading),
      el('span', { className: 'load' },
        day.blocked && day.capacity > 0 ? 'blocked · ' : `${minutesLabel(day.load)} / `,
        ...capacityControl(day)),
    ),
    day.blocked ? null : el('div', { className: 'bar' }, el('div', { style: `width:${pct}%` })),
    day.items.length
      ? el('ul', { className: 'items' }, day.items.map((e) => itemRow(e)))
      : el('p', { className: 'empty' }, day.blocked ? 'No work planned on this day.' : 'Nothing planned.'),
  );
}

function panel(title, entries, opts = {}) {
  if (!entries.length) return null;
  return el('details', { className: 'panel', open: opts.open },
    el('summary', {}, `${title} (${entries.length})`),
    el('ul', { className: 'items' }, entries.map((e) => itemRow(e, opts))),
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

  const p = plan({ items: state.items, settings: state.settings, weekState: state.weekState, now: Date.now() });
  document.getElementById('header').replaceChildren(...renderHeader(p).filter(Boolean));
  if (isSettingsView()) {
    document.getElementById('banners').replaceChildren();
    document.getElementById('days').replaceChildren(...renderSettings(settingsContext()));
    document.getElementById('extras').replaceChildren();
  } else {
    document.getElementById('banners').replaceChildren(...renderBanners(p));
    document.getElementById('days').replaceChildren(...p.days.map((d) => renderDay(d, p.today)));
    document.getElementById('extras').replaceChildren(...[
      panel("Won't fit by the target day", p.overflow, { open: true }),
      panel('At risk', p.atRisk, { open: true }),
      panel('No due date', p.noDueDate),
      panel('Done this week', p.done, { done: true }),
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
