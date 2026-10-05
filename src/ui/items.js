// Item rows and what you can do to an item: check off (with undo), log time,
// change minutes, pin, pull, send back, dismiss, restore.
import { canPullItem } from '../planner/plan.js';
import { estimate } from '../planner/estimate.js';
import { toLocalDate, addDays } from '../planner/dates.js';
import { validateLog } from '../storage/schema.js';
import { el, select, dayLabel, dueLabel, minutesLabel } from './dom.js';
import { showToast, logForm } from './toast.js';
import { courseColor } from './theme.js';
import { app, courseName, SOURCE_LABEL, updateItem } from './app.js';

// --- done, undo, and time logging -------------------------------------------------

/** The day an item was finished: logged day, else Canvas submission day, else today. */
export function finishDay(item) {
  if (item.log?.finishedOn) return item.log.finishedOn;
  if (item.canvasDone && item.submittedAt) return toLocalDate(item.submittedAt);
  return toLocalDate(Date.now());
}

export function openLog(item, toast = null) {
  const t = toast ?? showToast({ message: '' });
  const estimateMinutes = estimate(item, app.state.settings).minutes;
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
export function markDone(item) {
  const before = { manualDone: item.manualDone, log: item.log };
  updateItem(item.id, { manualDone: true });
  const t = showToast({
    message: `Done: ${item.title}`,
    actions: [
      { label: 'Undo', onclick: () => { t.close(); updateItem(item.id, before); } },
      ...(item.inClass ? [] : [{ label: 'Log time', onclick: () => openLog(app.state.items[item.id], t) }]),
    ],
  });
}

// --- item rows ---------------------------------------------------------------------

// Minutes you can pick for an item: 5, 10, then every 15 min up to 4 h, then 5, 6, 8 h.
const MINUTE_CHOICES = [5, 10, ...Array.from({ length: 16 }, (_, i) => (i + 1) * 15), 300, 360, 480];

function minutesControl(entry) {
  const { item } = entry;
  const auto = estimate({ ...item, minutesOverride: null, inClass: false }, app.state.settings);
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
export function itemRow(entry, kind = 'plan', { upNext = false, showCourse = true } = {}) {
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

  // The Next week projection plans as if it were already next week, so its flags are
  // relative to that day; urgency chips always use the real date.
  const realToday = toLocalDate(Date.now());
  const urgency = kind === 'next'
    ? { dueToday: entry.dueDay === realToday, dueTomorrow: entry.dueDay === addDays(realToday, 1) }
    : entry;
  const chips = [];
  if (upNext) chips.push(el('span', { className: 'chip next' }, 'up next'));
  if (entry.inClass) chips.push(el('span', { className: 'chip' }, 'in class'));
  if (entry.overdue) chips.push(el('span', { className: 'chip bad' }, 'overdue'));
  else if (urgency.dueToday && kind !== 'done') chips.push(el('span', { className: 'chip bad' }, 'due today'));
  else if (urgency.dueTomorrow && kind !== 'done') chips.push(el('span', { className: 'chip warn' }, 'due tomorrow'));
  else if (entry.behind && kind === 'plan') chips.push(el('span', { className: 'chip warn' }, 'behind plan'));
  if (entry.notOpenYet) chips.push(el('span', { className: 'chip' }, `opens ${dayLabel(entry.unlockDate, { weekday: 'short', month: 'short', day: 'numeric' })}`));
  if (item.prevDueAt) chips.push(el('span', { className: 'chip warn', title: `Was due ${dueLabel(item.prevDueAt)}` }, 'due date changed'));
  if (entry.pulledIn && kind === 'plan') chips.push(el('span', { className: 'chip' }, 'pulled in'));

  const pull = app.thisWeekPlan?.pull;
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
    className: `item${done ? ' done' : ''}${upNext ? ' up-next' : ''}${!done && (urgency.dueToday || entry.overdue) ? ' urgent' : ''}`,
    style: `--course:${courseColor(item.courseId, app.state.settings, app.state.courses)}`,
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

export function pullBlockedText(pull, minutes) {
  if (!pull) return '';
  if (pull.blockedReason === 'week') return 'Pulling unlocks when this week\'s own work is done. You can turn this off in Settings.';
  if (pull.blockedReason === 'cap') return `You already have ${minutesLabel(pull.pulledMinutes)} of unfinished pulled work (the limit is ${minutesLabel(pull.capMinutes)}). Finish some, or raise the limit in Settings.`;
  return `Only ${minutesLabel(pull.remainingMinutes)} of pull room left${minutes ? ` (this needs ${minutesLabel(minutes)})` : ''}. Finish some pulled work, or raise the limit in Settings.`;
}

export function panel(title, entries, kind, open = false, note = '') {
  if (!entries.length) return null;
  return el('details', { className: 'panel', open },
    el('summary', {}, `${title} (${entries.length})`, note ? el('span', { className: 'summary-note' }, note) : null),
    el('ul', { className: 'items' }, entries.map((e) => itemRow(e, kind))),
  );
}
