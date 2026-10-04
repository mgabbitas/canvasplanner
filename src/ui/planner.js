// New-tab planner page. Views by URL hash: '' this week, #next, #stats, #settings[/tab].
// All Canvas text goes in via textContent (see dom.js), never innerHTML.
import { plan, planNextWeek, canPullItem } from '../planner/plan.js';
import { estimate } from '../planner/estimate.js';
import { planningWeek, toLocalDate } from '../planner/dates.js';
import { loadState, save } from '../storage/store.js';
import { pruneWeekState, validateLog } from '../storage/schema.js';
import { SIZES } from '../storage/defaults.js';
import { runSync } from '../sync/run.js';
import { el, select, dayLabel, dueLabel, minutesLabel, readInt } from './dom.js';
import { renderSettings, resetSettingsDraft } from './settings.js';
import { renderStats } from './statsview.js';
import { showToast, logForm } from './toast.js';
import { icon } from './icons.js';
import { courseColor, applyTheme } from './theme.js';

let state = null;
let syncing = false;
let syncMessage = null;
let editingDay = null; // date whose capacity is being edited
let pullSize = 'M'; // amount picked in the "pull about …" control
let thisWeekPlan = null; // latest plan for this week (pull gate, pull candidates)
let selectedDay = null; // day shown in the Day layout (null = first day, i.e. today)
let navOpen = false; // sidebar open on narrow screens

function view() {
  const h = location.hash;
  if (h === '#settings' || h.startsWith('#settings/')) return 'settings';
  return ({ '#next': 'next', '#stats': 'stats' })[h] ?? 'this';
}
const settingsTab = () => location.hash.split('/')[1] ?? '';

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

// --- done, undo, and time logging -------------------------------------------------

/** The day an item was finished: logged day, else Canvas submission day, else today. */
function finishDay(item) {
  if (item.log?.finishedOn) return item.log.finishedOn;
  if (item.canvasDone && item.submittedAt) return toLocalDate(item.submittedAt);
  return toLocalDate(Date.now());
}

function openLog(item, toast = null) {
  const t = toast ?? showToast({ message: '' });
  const estimateMinutes = estimate(item, state.settings).minutes;
  t.setContent(logForm({
    title: item.title,
    minutes: item.log?.minutes ?? (estimateMinutes || null),
    difficulty: item.log?.difficulty ?? null,
    onSave: ({ minutes, difficulty }) => {
      const log = validateLog({ minutes, difficulty, finishedOn: finishDay(item) });
      t.close();
      updateItem(item.id, { log });
      if (log) showToast({ message: `Logged ${log.minutes ? minutesLabel(log.minutes) : 'difficulty'} for "${item.title}".`, duration: 4000 });
    },
    onCancel: () => t.close(),
  }));
}

/** Check an item off, with a toast offering Undo and Log time. */
function markDone(item) {
  const before = { manualDone: item.manualDone, log: item.log };
  updateItem(item.id, { manualDone: true });
  const t = showToast({
    message: `Done: ${item.title}`,
    actions: [
      { label: 'Undo', onclick: () => { t.close(); updateItem(item.id, before); } },
      ...(item.inClass ? [] : [{ label: 'Log time', onclick: () => openLog(state.items[item.id], t) }]),
    ],
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
  const auto = estimate({ ...item, minutesOverride: null, inClass: false }, state.settings);
  const autoLabel = auto.inClass ? 'In class (auto)' : `${minutesLabel(auto.minutes)} auto`;
  const choices = [...new Set([...MINUTE_CHOICES, item.minutesOverride].filter(Boolean))].sort((a, b) => a - b);
  const value = item.minutesOverride ? String(item.minutesOverride) : item.inClass ? 'inclass' : '';
  return select(
    [['', autoLabel], ['inclass', 'In class (0m)'], ...choices.map((m) => [String(m), minutesLabel(m)])],
    value,
    {
      className: `chip size${value ? ' set' : ''}`,
      title: `Estimate from ${SOURCE_LABEL[entry.source]}. Pick minutes, or "In class" for an activity done in class.`,
      'aria-label': `Minutes for "${item.title}"`,
      'data-key': `minutes-${item.id}`,
      onchange: (e) => {
        const v = e.target.value;
        if (v === 'inclass') return updateItem(item.id, { inClass: true, minutesOverride: null });
        return updateItem(item.id, { inClass: false, minutesOverride: v ? Number(v) : null });
      },
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
function itemRow(entry, kind = 'plan', { upNext = false, showCourse = true } = {}) {
  const { item } = entry;
  const done = kind === 'done';
  const checkbox = el('input', {
    type: 'checkbox',
    checked: done,
    disabled: (done && !entry.canUncheck) || kind === 'dismissed',
    'aria-label': `Mark "${item.title}" ${done ? 'not done' : 'done'}`,
    title: done && !entry.canUncheck ? 'Submitted in Canvas' : '',
    'data-key': `done-${item.id}`,
    onchange: (e) => (e.target.checked ? markDone(item) : updateItem(item.id, { manualDone: false })),
  });
  const title = item.url
    ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'title' }, item.title)
    : el('span', { className: 'title' }, item.title);

  const chips = [];
  if (upNext) chips.push(el('span', { className: 'chip next' }, 'up next'));
  if (entry.inClass) chips.push(el('span', { className: 'chip' }, 'in class'));
  if (entry.overdue) chips.push(el('span', { className: 'chip bad' }, 'overdue'));
  else if (entry.dueToday && kind !== 'done') chips.push(el('span', { className: 'chip bad' }, 'due today'));
  else if (entry.dueTomorrow && kind !== 'done') chips.push(el('span', { className: 'chip warn' }, 'due tomorrow'));
  else if (entry.behind && kind === 'plan') chips.push(el('span', { className: 'chip warn' }, 'behind plan'));
  if (entry.notOpenYet) chips.push(el('span', { className: 'chip' }, `opens ${dayLabel(entry.unlockDate, { weekday: 'short', month: 'short', day: 'numeric' })}`));
  if (item.prevDueAt) chips.push(el('span', { className: 'chip warn', title: `Was due ${dueLabel(item.prevDueAt)}` }, 'due date changed'));
  if (entry.pulledIn && kind === 'plan') chips.push(el('span', { className: 'chip' }, 'pulled in'));

  const pull = thisWeekPlan?.pull;
  const actions = [];
  if (kind === 'plan' && entry.overdue) {
    actions.push(el('button', { onclick: () => updateItem(item.id, { dismissed: true }), title: 'Hide this overdue item', 'data-key': `dismiss-${item.id}` }, 'Dismiss'));
  }
  if (kind === 'plan' && entry.pulledIn) {
    actions.push(el('button', { onclick: () => updateItem(item.id, { pulledIn: false }), title: 'Move back to its own week', 'data-key': `back-${item.id}` }, 'Send back'));
  }
  if (kind === 'next' && !entry.inClass) {
    const ok = pull && canPullItem(pull, entry.minutes);
    actions.push(el('button', {
      disabled: !ok, 'data-key': `pull-${item.id}`,
      title: ok ? 'Plan this in this week' : pullBlockedText(pull, entry.minutes),
      onclick: () => updateItem(item.id, { pulledIn: true }),
    }, 'Pull →'));
  }
  if (kind === 'dismissed') {
    actions.push(el('button', { onclick: () => updateItem(item.id, { dismissed: false }), 'data-key': `restore-${item.id}` }, 'Restore'));
  }
  if (kind === 'done' && !entry.inClass) {
    const l = item.log;
    actions.push(el('button', {
      className: l ? 'link logged' : '', 'data-key': `log-${item.id}`,
      title: l ? 'Edit the logged time' : 'How long did it take?',
      onclick: () => openLog(item),
    }, l ? `logged ${[l.minutes ? minutesLabel(l.minutes) : null, l.difficulty ? `${l.difficulty}/5` : null].filter(Boolean).join(' · ')}` : 'Log time'));
  }
  if (kind === 'plan' || kind === 'next') actions.push(pinButton(item));
  actions.push(kind === 'plan' || kind === 'next'
    ? minutesControl(entry)
    : el('span', { className: 'chip' }, minutesLabel(entry.minutes)));

  return el('li', {
    className: `item${done ? ' done' : ''}${upNext ? ' up-next' : ''}${!done && (entry.dueToday || entry.overdue) ? ' urgent' : ''}`,
    style: `--course:${courseColor(item.courseId, state.settings, state.courses)}`,
  },
    checkbox,
    title,
    el('div', { className: 'right' }, actions),
    el('div', { className: 'sub' },
      showCourse ? el('span', { className: 'course' }, el('span', { className: 'dot', 'aria-hidden': 'true' }), courseName(item.courseId)) : null,
      item.dueAt ? el('span', {}, `due ${dueLabel(item.dueAt)}`) : null,
      ...chips,
    ),
  );
}

// --- header, banners, pull bar, forecast ---------------------------------------------

const NAV = [
  ['', 'this', 'This week', 'week'],
  ['next', 'next', 'Next week', 'next'],
  ['stats', 'stats', 'Stats', 'stats'],
  ['settings', 'settings', 'Settings', 'settings'],
];

function setNavOpen(open) {
  navOpen = open;
  document.getElementById('app').classList.toggle('nav-open', open);
  document.getElementById('scrim').hidden = !open;
  document.querySelector('[data-key="menu"]')?.setAttribute('aria-expanded', String(open));
}

function renderSidebar() {
  const v = view();
  const meta = state.meta;
  const status = syncing
    ? el('span', {}, 'Syncing…')
    : (syncMessage || meta.lastError)
      ? el('span', { className: 'error' }, syncMessage || meta.lastError)
      : el('span', {}, meta.lastSyncAt ? `Synced ${timeAgo(meta.lastSyncAt)}` : 'Never synced');

  const courses = Object.keys(state.courses)
    .filter((id) => state.settings.courses[id]?.include !== false)
    .sort((a, b) => courseName(a).localeCompare(courseName(b)));

  return [
    el('div', { className: 'brand' },
      el('span', { className: 'logo', 'aria-hidden': 'true' }, 'C'),
      el('span', {}, 'Canvas Planner'),
      el('button', { className: 'icon-btn close-nav', 'aria-label': 'Close menu', onclick: () => setNavOpen(false) }, icon('close')),
    ),
    el('nav', { className: 'nav', 'aria-label': 'Views' }, NAV.map(([hash, key, label, ic]) => el('a', {
      href: `#${hash}`, className: `nav-link${v === key ? ' active' : ''}`, 'aria-current': v === key ? 'page' : null,
      'data-key': `nav-${key}`,
      onclick: (e) => { e.preventDefault(); setNavOpen(false); location.hash = hash; },
    }, icon(ic), el('span', {}, label)))),
    courses.length ? el('div', { className: 'side-section' },
      el('h2', {}, 'Classes'),
      el('ul', { className: 'legend' }, courses.map((id) => el('li', {},
        el('span', { className: 'dot', style: `--course:${courseColor(id, state.settings, state.courses)}`, 'aria-hidden': 'true' }),
        el('span', { className: 'legend-name' }, courseName(id)))))) : null,
    el('div', { className: 'side-sync' },
      el('div', { className: 'sync-status' }, status),
      el('button', { onclick: sync, disabled: syncing, 'data-key': 'sync' }, icon('sync'), el('span', {}, syncing ? 'Syncing…' : 'Sync now')),
    ),
  ];
}

const homework = (entries) => entries.filter((e) => !e.inClass);
const itemCount = (entries) => {
  const n = homework(entries).length;
  return `${n} item${n === 1 ? '' : 's'}`;
};

function renderHeader(p) {
  const v = view();
  const week = p.week;
  const weekView = v === 'this' || v === 'next';
  const title = v === 'settings' ? 'Settings' : v === 'stats' ? 'Your stats'
    : `Week of ${dayLabel(week.start, { month: 'long', day: 'numeric' })}`;

  const menuBtn = el('button', {
    className: 'icon-btn menu-btn', 'aria-label': 'Menu', 'aria-expanded': String(navOpen), 'data-key': 'menu',
    onclick: () => setNavOpen(!navOpen),
  }, icon('menu'));

  let subtitle = null;
  if (v === 'settings') subtitle = el('p', { className: 'subtitle' }, 'Changes save automatically.');
  if (v === 'stats') subtitle = el('p', { className: 'subtitle' }, 'How long your work actually takes, from the times you log.');
  if (weekView) {
    const today = v === 'this' ? p.days.find((d) => d.date === p.today) : null;
    const parts = [];
    if (today) parts.push(el('strong', {}, `Today: ${itemCount(today.items)} · ${minutesLabel(today.load)}`));
    const dueToday = v === 'this' ? homework(p.days.flatMap((d) => d.items)).filter((e) => e.dueToday || e.overdue).length : 0;
    if (dueToday) parts.push(el('span', { className: 'urgent-text' }, `${dueToday} due today`));
    if (v === 'next') parts.push(el('span', {}, 'Projected plan'));
    subtitle = el('div', { className: 'subtitle-row' },
      el('p', { className: 'subtitle' }, ...parts.flatMap((x, i) => (i ? [' · ', x] : [x]))),
      el('div', { className: 'target' },
        el('span', { className: 'muted' }, 'Finish by'),
        el('button', {
          disabled: !week.canRemoveDay, 'aria-label': 'Target one day earlier', 'data-key': 'remove-day',
          title: 'Target one day earlier', onclick: () => changeExtraDays(week.start, -1),
        }, '−'),
        el('strong', {}, dayLabel(week.cutoff, { weekday: 'short', month: 'short', day: 'numeric' })),
        el('button', {
          disabled: !week.canAddDay, 'aria-label': 'Give yourself one more day', 'data-key': 'add-day',
          title: 'Give yourself one more day', onclick: () => changeExtraDays(week.start, 1),
        }, '+'),
      ),
    );
  }

  return [
    el('div', { className: 'title-row' }, menuBtn, el('h1', {}, title)),
    subtitle,
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

function pullBlockedText(pull, minutes) {
  if (!pull) return '';
  if (pull.blockedReason === 'week') return 'Pulling unlocks when this week\'s own work is done. You can turn this off in Settings.';
  if (pull.blockedReason === 'cap') return `You already have ${minutesLabel(pull.pulledMinutes)} of unfinished pulled work (the limit is ${minutesLabel(pull.capMinutes)}). Finish some, or raise the limit in Settings.`;
  return `Only ${minutesLabel(pull.remainingMinutes)} of pull room left${minutes ? ` (this needs ${minutesLabel(minutes)})` : ''}. Finish some pulled work, or raise the limit in Settings.`;
}

function renderPullCard() {
  const { pull } = thisWeekPlan;
  const day = pull.nextDay;
  const bySize = pull.bySize[pullSize] ?? [];
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
      select(SIZES.map((z) => [z, `About ${minutesLabel(state.settings.sizeMinutes[z])}`]), pullSize, {
        'aria-label': 'Amount of work to pull', 'data-key': 'pull-size',
        onchange: (e) => { pullSize = e.target.value; render(); },
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

function renderForecast(p) {
  const max = Math.max(1, ...p.forecast.map((f) => f.minutes));
  return el('details', {
    className: 'panel forecast', open: state.settings.showForecast, 'data-key': 'forecast',
    ontoggle: (e) => {
      if (e.target.open !== state.settings.showForecast) {
        saveState({ settings: { ...state.settings, showForecast: e.target.open } });
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

/** Tabs: Week (every day) then one per day, each with its count and load. */
function renderDayLayout(p, kind) {
  const days = p.days;
  const ids = ['week', ...days.map((d) => d.date)];
  const selected = ids.includes(selectedDay) ? selectedDay : days[0].date;
  const pick = (id) => {
    selectedDay = id;
    render();
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
        className: 'class-group', style: `--course:${courseColor(courseId, state.settings, state.courses)}`,
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

function panel(title, entries, kind, open = false, note = '') {
  if (!entries.length) return null;
  return el('details', { className: 'panel', open },
    el('summary', {}, `${title} (${entries.length})`, note ? el('span', { className: 'summary-note' }, note) : null),
    el('ul', { className: 'items' }, entries.map((e) => itemRow(e, kind))),
  );
}

// --- settings view hooks ---------------------------------------------------------

const settingsContext = () => ({
  state,
  saveState,
  render,
  tab: settingsTab(),
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
  applyTheme(state.settings);
  $('sidebar').replaceChildren(...renderSidebar().filter(Boolean));
  $('header').replaceChildren(...renderHeader(p).filter(Boolean));
  const fill = (id, nodes) => $(id).replaceChildren(...nodes.filter(Boolean));
  const days = (kind) => renderDayLayout(p, kind);
  let rail = [];
  if (v === 'settings') {
    fill('banners', []);
    fill('days', renderSettings(settingsContext()));
    fill('extras', []);
  } else if (v === 'stats') {
    fill('banners', []);
    fill('days', renderStats({ state, saveState, courseName, finishDay, openLog: (i) => openLog(i) }));
    fill('extras', []);
  } else if (v === 'next') {
    fill('banners', renderBanners(p));
    fill('days', days('next'));
    fill('extras', [panel("Won't fit by next week's target day", p.overflow, 'next', true)]);
    rail = [renderPullCard(), renderForecast(thisWeekPlan)];
  } else {
    fill('banners', renderBanners(p));
    fill('days', days('plan'));
    fill('extras', [
      panel("Won't fit by the target day", p.overflow, 'plan', true),
      panel('At risk', p.atRisk, 'plan', true),
      panel('Done this week', p.done, 'done', false, (() => {
        const n = p.done.filter((e) => !e.item.log && !e.inClass).length;
        return n ? `${n} need${n === 1 ? 's' : ''} a time` : '';
      })()),
    ]);
    rail = [
      renderForecast(p),
      panel('No due date', p.noDueDate, 'plan'),
      panel('Dismissed', p.dismissed, 'dismissed'),
    ];
  }
  fill('rail', rail);
  $('content').classList.toggle('no-rail', !rail.filter(Boolean).length);
  if (focusKey) document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
}

// --- startup -----------------------------------------------------------------------

async function init() {
  state = await loadState();
  render();
  // Opened by the background script after a Canvas visit (?sync=1): always sync.
  const forced = new URLSearchParams(location.search).has('sync');
  if (forced) history.replaceState(null, '', location.pathname + location.hash);
  const last = state.meta.lastSyncAt ? Date.parse(state.meta.lastSyncAt) : 0;
  if (forced || Date.now() - last > state.settings.autoSyncMinutes * 60_000) await sync();
}

document.getElementById('scrim').addEventListener('click', () => setNavOpen(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && navOpen) setNavOpen(false); });

window.addEventListener('hashchange', () => {
  if (view() !== 'settings') resetSettingsDraft(); // keep unsaved rules across settings tabs
  editingDay = null;
  selectedDay = null;
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
