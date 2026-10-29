// Item rows and what you can do to an item: check off (with undo), log time,
// change minutes, the ⋮ menu (move to a day, pin, dismiss), pull, send back, restore.
import { canPullItem, doneDay, looksLikeExam, checkOffPatch, MAX_PARTS } from '../planner/plan.js';
import { estimate } from '../planner/estimate.js';
import { toLocalDate, addDays, dateRange, minDate } from '../planner/dates.js';
import { validateLog } from '../storage/schema.js';
import { el, select, dayLabel, dueLabel, minutesLabel } from './dom.js';
import { showToast, logForm } from './toast.js';
import { courseColor } from './theme.js';
import { app, courseName, SOURCE_LABEL, updateItem } from './app.js';
import { openTaskForm } from './taskform.js';

// --- done, undo, and time logging -------------------------------------------------

/** The day an item was finished: logged day, else the day it was checked off or submitted, else today. */
export function finishDay(item) {
  return item.log?.finishedOn ?? doneDay(item) ?? toLocalDate(Date.now());
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

/** Check an item (or the next part of a split item) off, with a toast offering Undo and Log time. */
export function markDone(item) {
  const before = { manualDone: item.manualDone, log: item.log, doneOn: item.doneOn, partsDone: item.partsDone };
  const patch = checkOffPatch(item, toLocalDate(Date.now()));
  updateItem(item.id, patch);
  const finished = Boolean(patch.manualDone);
  const t = showToast({
    message: finished ? `Done: ${item.title}` : `Done: part ${patch.partsDone.length} of ${item.splitParts} of ${item.title}`,
    actions: [
      { label: 'Undo', onclick: () => { t.close(); updateItem(item.id, before); } },
      ...(item.inClass || !finished ? [] : [{ label: 'Log time', onclick: () => openLog(app.state.items[item.id], t) }]),
    ],
  });
}

/** Uncheck a finished item; a split item gets its last part back. */
const uncheck = (item) => updateItem(item.id, {
  manualDone: false, doneOn: null,
  ...(item.splitParts ? { partsDone: item.partsDone?.slice(0, -1).length ? item.partsDone.slice(0, -1) : null } : {}),
});

/** "Split across days": 2-4 parts (up to 8 for long items), or back to one piece. */
function splitMenu(entry) {
  const { item } = entry;
  const total = estimate(item, app.state.settings).minutes;
  if (entry.inClass || entry.overdue || total < 10) return [];
  const most = Math.min(MAX_PARTS, Math.max(4, Math.floor(total / 30)));
  const out = [el('div', { className: 'menu-label' }, 'Split across days')];
  for (let n = 2; n <= most; n++) {
    out.push(el('button', {
      role: 'menuitem', disabled: item.splitParts === n || (item.partsDone?.length ?? 0) >= n, 'data-key': `split-${item.id}-${n}`,
      onclick: () => updateItem(item.id, { splitParts: n, plannedOn: null, pinned: false }),
    }, `${n} parts · ${minutesLabel(Math.ceil(total / n))} each`, item.splitParts === n ? el('span', { className: 'muted' }, ' · now') : null));
  }
  if (item.splitParts && !item.partsDone?.length) {
    out.push(el('button', { role: 'menuitem', 'data-key': `unsplit-${item.id}`, onclick: () => updateItem(item.id, { splitParts: null }) }, "Don't split"));
  }
  out.push(el('hr'));
  return out;
}

// --- item rows ---------------------------------------------------------------------

// Minutes you can pick for an item: 5, 10, then every 15 min up to 4 h, then 5, 6, 8 h.
export const MINUTE_CHOICES = [5, 10, ...Array.from({ length: 16 }, (_, i) => (i + 1) * 15), 300, 360, 480];

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

/** Hide an item from the plan, with Undo. Restore it from the Dismissed panel. */
export function dismiss(item) {
  updateItem(item.id, { dismissed: true });
  const t = showToast({
    message: `Dismissed: ${item.title}`,
    actions: [{ label: 'Undo', onclick: () => { t.close(); updateItem(item.id, { dismissed: false }); } }],
  });
}

const shortDay = (date) => dayLabel(date, { weekday: 'short', month: 'short', day: 'numeric' });

/** "Today", "Tomorrow", or a short date. */
export function relativeDay(date) {
  const today = toLocalDate(Date.now());
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return shortDay(date);
}

/** Days this item can be moved to: from when it opens to its last work day, within this week. */
function moveDays(entry) {
  const week = app.thisWeekPlan?.week;
  if (!week || !entry.lastDay || entry.overdue || entry.inClass || entry.part) return [];
  return dateRange(entry.firstDay, minDate(entry.lastDay, week.end));
}

/** The ⋮ menu: move to a day, pin to the due day, dismiss. */
function itemMenu(entry, kind) {
  const { item } = entry;
  const choose = (patch) => updateItem(item.id, patch);
  const entries = [];
  if (item.task) {
    entries.push(el('button', { role: 'menuitem', 'data-key': `edit-${item.id}`, onclick: () => editTask(item) },
      item.task.seriesId ? 'Edit repeating task' : 'Edit task'));
    entries.push(el('hr'));
  }
  const days = kind === 'plan' ? moveDays(entry) : [];
  if (days.length) {
    entries.push(el('div', { className: 'menu-label' }, 'Move to'));
    for (const d of days) {
      const here = d === entry.date;
      entries.push(el('button', {
        role: 'menuitem', disabled: here, 'data-key': `move-${item.id}-${d}`,
        onclick: () => choose({ plannedOn: d, pinned: false }),
      }, relativeDay(d), here ? el('span', { className: 'muted' }, ' · planned') : null));
    }
    if (entry.movedTo) {
      entries.push(el('button', {
        role: 'menuitem', 'data-key': `unmove-${item.id}`, onclick: () => choose({ plannedOn: null }),
      }, 'Let the planner decide'));
    }
    entries.push(el('hr'));
  }
  if (kind === 'plan' || kind === 'next') entries.push(...splitMenu(entry));
  if (editable(kind) && entry.lastDay && !entry.overdue && !entry.inClass && !entry.part) {
    entries.push(el('button', {
      role: 'menuitem', 'data-key': `pin-${item.id}`,
      onclick: () => choose(item.pinned ? { pinned: false } : { pinned: true, plannedOn: null }),
    }, item.pinned ? 'Unpin' : 'Pin to due day'));
  }
  if (looksLikeExam(item)) {
    entries.push(el('button', {
      role: 'menuitem', 'data-key': `exam-${item.id}`,
      title: item.notExam ? 'List it under Exams again' : 'Stop listing it under Exams',
      onclick: () => choose({ notExam: !item.notExam }),
    }, item.notExam ? "It's an exam" : 'Not an exam'));
  }
  entries.push(el('button', {
    role: 'menuitem', 'data-key': `dismiss-${item.id}`, title: 'Hide it from the plan. Restore it from Dismissed.',
    onclick: () => dismiss(item),
  }, 'Dismiss'));
  return el('details', { className: 'item-menu' },
    el('summary', { 'aria-label': `More actions for "${item.title}"`, title: 'More actions', 'data-key': `menu-${entry.id}` }, '⋮'),
    el('div', { className: 'menu', role: 'menu' }, entries),
  );
}

const editTask = (item) => openTaskForm(item.task.seriesId ? { seriesId: item.task.seriesId } : { item });

// Rows whose minutes, pin and dismiss can be changed.
const editable = (kind) => kind === 'plan' || kind === 'next' || kind === 'class';

/** One item. kind: 'plan' (this week), 'next' (next week), 'class', 'done', 'dismissed'. */
export function itemRow(entry, kind = 'plan', { upNext = false, showCourse = true } = {}) {
  const { item } = entry;
  const done = kind === 'done';
  const checkbox = el('input', {
    type: 'checkbox',
    checked: done,
    disabled: (done && !entry.canUncheck) || kind === 'dismissed',
    'aria-label': `Mark "${item.title}" ${done ? 'not done' : 'done'}`,
    title: done && !entry.canUncheck ? 'Submitted in Canvas' : '',
    'data-key': `done-${entry.part ? entry.id : item.id}`,
    onchange: (e) => (e.target.checked ? markDone(item) : uncheck(item)),
  });
  const canEditTask = item.task && (!item.task.seriesId || app.state.taskSeries?.[item.task.seriesId]);
  const title = item.url
    ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'title' }, item.title)
    : canEditTask
      ? el('button', { className: 'title task-title', title: 'Edit this task', 'data-key': `task-${item.id}`, onclick: () => editTask(item) }, item.title)
      : el('span', { className: 'title' }, item.title);

  // The Next week projection plans as if it were already next week, so its flags are
  // relative to that day; urgency chips always use the real date.
  const realToday = toLocalDate(Date.now());
  const urgency = kind === 'next'
    ? { dueToday: entry.dueDay === realToday, dueTomorrow: entry.dueDay === addDays(realToday, 1) }
    : entry;
  const chips = [];
  if (upNext) chips.push(el('span', { className: 'chip next' }, 'up next'));
  if (entry.part) chips.push(el('span', { className: 'chip task', title: 'Split across days. Use ⋮ to change.' }, `part ${entry.part.n} of ${entry.part.of}`));
  if (item.task) {
    chips.push(el('span', { className: 'chip task', title: 'Your own task' }, item.task.seriesId ? 'repeats' : 'task'));
    if (entry.floating && kind !== 'done') chips.push(el('span', { className: 'chip', title: 'No due date: any time this week' }, 'this week'));
  }
  if (entry.inClass) chips.push(el('span', { className: 'chip' }, 'in class'));
  if (entry.overdue) chips.push(el('span', { className: 'chip bad' }, 'overdue'));
  else if (urgency.dueToday && kind !== 'done') chips.push(el('span', { className: 'chip bad' }, 'due today'));
  else if (urgency.dueTomorrow && kind !== 'done') chips.push(el('span', { className: 'chip warn' }, 'due tomorrow'));
  else if (entry.behind && kind === 'plan') chips.push(el('span', { className: 'chip warn' }, 'behind plan'));
  if (entry.notOpenYet) chips.push(el('span', { className: 'chip' }, `opens ${dayLabel(entry.unlockDate, { weekday: 'short', month: 'short', day: 'numeric' })}`));
  if (item.prevDueAt) chips.push(el('span', { className: 'chip warn', title: `Was due ${dueLabel(item.prevDueAt)}` }, 'due date changed'));
  if (entry.pulledIn && kind === 'plan') chips.push(el('span', { className: 'chip' }, 'pulled in'));
  if (entry.movedTo && kind === 'plan') chips.push(el('span', { className: 'chip', title: 'You moved this here. Use ⋮ to change it.' }, 'moved'));
  else if (item.pinned && entry.lastDay && editable(kind)) chips.push(el('span', { className: 'chip', title: 'Pinned to its due day. Use ⋮ to unpin.' }, 'pinned'));

  const pull = app.thisWeekPlan?.pull;
  const actions = [];
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
  // A part shows its own share; the item's time is changed on the whole (⋮ → Don't split).
  actions.push(editable(kind) && !entry.part
    ? minutesControl(entry)
    : el('span', { className: 'chip', title: entry.part ? `Part of ${minutesLabel(entry.minutes * entry.part.of)}` : '' }, minutesLabel(entry.minutes)));
  if (editable(kind)) actions.push(itemMenu(entry, kind));

  return el('li', {
    className: `item${done ? ' done' : ''}${upNext ? ' up-next' : ''}${!done && (urgency.dueToday || entry.overdue) ? ' urgent' : ''}`,
    style: `--course:${courseColor(item.courseId, app.state.settings, app.state.courses)}`,
  },
    checkbox,
    title,
    el('div', { className: 'right' }, actions),
    el('div', { className: 'sub' },
      showCourse ? el('span', { className: 'course' }, el('span', { className: 'dot', 'aria-hidden': 'true' }), courseName(item.courseId)) : null,
      item.dueAt && !item.task ? el('span', {}, `due ${dueLabel(item.dueAt)}`) : null,
      item.dueAt && item.task && !item.task.seriesId ? el('span', {}, `due ${dayLabel(toLocalDate(item.dueAt), { weekday: 'short', month: 'short', day: 'numeric' })}`) : null,
      ...chips,
    ),
    item.task?.notes ? el('div', { className: 'notes' }, item.task.notes) : null,
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
