// New-tab planner page. All Canvas text goes in via textContent, never innerHTML.
import { plan } from '../planner/plan.js';
import { loadState, save } from '../storage/store.js';
import { runSync } from '../sync/run.js';

let state = null;
let syncing = false;
let syncMessage = null;

// --- tiny DOM helper -------------------------------------------------------

/** el('button', { className: 'x', onclick: fn }, 'text', childNode) */
function el(tag, props = {}, ...children) {
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

// --- formatting ------------------------------------------------------------

const dayLabel = (date, opts = { weekday: 'long', month: 'short', day: 'numeric' }) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, opts);
};
const dueLabel = (iso) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const minutesLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

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
  manual: 'size you set', stated: 'instructor-stated time', keyword: 'title keyword rule',
  type: 'assignment type default', default: 'default size',
};

// --- state changes -----------------------------------------------------------

async function updateItem(id, patch) {
  state.items[id] = { ...state.items[id], ...patch };
  await save({ items: state.items });
  render();
}

async function changeExtraDays(weekStart, delta, current) {
  state.weekState[weekStart] = { extraDays: Math.max(0, current + delta) };
  await save({ weekState: state.weekState });
  render();
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

// --- rendering ---------------------------------------------------------------

function itemRow(entry, { done = false } = {}) {
  const { item } = entry;
  const checkbox = el('input', {
    type: 'checkbox',
    checked: done,
    disabled: done && !entry.canUncheck,
    'aria-label': `Mark "${item.title}" ${done ? 'not done' : 'done'}`,
    title: done && !entry.canUncheck ? 'Submitted in Canvas' : '',
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
    el('span', { className: 'chip', title: `Estimate from ${SOURCE_LABEL[entry.source]}` }, minutesLabel(entry.minutes)),
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
    el('h1', {}, `Week of ${dayLabel(week.start, { month: 'short', day: 'numeric' })}`),
    el('div', { className: 'target' },
      el('span', {}, `Target: ${dayLabel(week.cutoff, { weekday: 'long' })}`),
      el('button', {
        disabled: !p.week.canRemoveDay, 'aria-label': 'Remove a day',
        onclick: () => changeExtraDays(week.start, -1, week.extraDays),
      }, '−'),
      el('button', {
        disabled: !p.week.canAddDay, 'aria-label': 'Add a day',
        onclick: () => changeExtraDays(week.start, 1, week.extraDays),
      }, '+'),
    ),
    el('div', { className: 'sync' }, status, el('button', { onclick: sync, disabled: syncing }, 'Sync now')),
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
      p.week.canAddDay
        ? el('button', { onclick: () => changeExtraDays(p.week.start, 1, p.week.extraDays) }, 'Add a day')
        : null,
    ));
  }
  if (p.atRisk.length) {
    out.push(el('div', { className: 'banner bad' },
      `${p.atRisk.length} item${p.atRisk.length > 1 ? 's' : ''} (${minutesLabel(p.atRiskMinutes)}) may not fit before they're due.`));
  }
  return out;
}

function renderDay(day, today) {
  const pct = day.capacity ? Math.min(100, (day.load / day.capacity) * 100) : 0;
  const heading = dayLabel(day.date) + (day.date === today ? ' · Today' : '');
  return el('section', { className: `day${day.over ? ' over' : ''}${day.blocked ? ' blocked' : ''}` },
    el('div', { className: 'day-head' },
      el('h2', {}, heading),
      el('span', { className: 'load' }, day.blocked ? 'blocked' : `${minutesLabel(day.load)} / ${minutesLabel(day.capacity)}`),
    ),
    day.blocked ? null : el('div', { className: 'bar' }, el('div', { style: `width:${pct}%` })),
    day.items.length
      ? el('ul', { className: 'items' }, day.items.map((e) => itemRow(e)))
      : el('p', { className: 'empty' }, day.blocked ? '' : 'Nothing planned.'),
  );
}

function panel(title, entries, opts = {}) {
  if (!entries.length) return null;
  return el('details', { className: 'panel', open: opts.open },
    el('summary', {}, `${title} (${entries.length})`),
    el('ul', { className: 'items' }, entries.map((e) => itemRow(e, opts))),
  );
}

function render() {
  if (!state) return;
  const p = plan({ items: state.items, settings: state.settings, weekState: state.weekState, now: Date.now() });
  document.getElementById('header').replaceChildren(...renderHeader(p));
  document.getElementById('banners').replaceChildren(...renderBanners(p));
  document.getElementById('days').replaceChildren(...p.days.map((d) => renderDay(d, p.today)));
  document.getElementById('extras').replaceChildren(...[
    panel("Won't fit by the target day", p.overflow, { open: true }),
    panel('At risk', p.atRisk, { open: true }),
    panel('No due date', p.noDueDate),
    panel('Done this week', p.done, { done: true }),
  ].filter(Boolean));
}

// --- startup -----------------------------------------------------------------

async function init() {
  state = await loadState();
  render();
  const last = state.meta.lastSyncAt ? Date.parse(state.meta.lastSyncAt) : 0;
  if (Date.now() - last > state.settings.autoSyncMinutes * 60_000) await sync();
}

// Another tab changed something: reload and redraw.
browser.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== 'local' || syncing) return;
  state = await loadState();
  render();
});

init().catch((e) => {
  document.getElementById('banners').replaceChildren(el('div', { className: 'banner bad' }, `Failed to load: ${e.message}`));
});
