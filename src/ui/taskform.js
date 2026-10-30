// Add / edit your own tasks in a dialog. A task belongs to a class; with no due date
// it floats (any time this week); repeating tasks are a series with a copy per day.
import { taskItem, syncSeries, dropFutureCopies } from '../planner/tasks.js';
import { toLocalDate } from '../planner/dates.js';
import { validateTaskSeries } from '../storage/schema.js';
import { el, select, WEEKDAYS, minutesLabel } from './dom.js';
import { showToast } from './toast.js';
import { MINUTE_CHOICES } from './items.js';
import { app, saveState, courseName } from './app.js';

const MAX_TITLE = 200;
const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const today = () => toLocalDate(Date.now());

/** Classes you can add tasks to: the ones being planned, by name. */
const classOptions = () => Object.keys(app.state.courses)
  .filter((id) => app.state.settings.courses[id]?.include !== false)
  .sort((a, b) => courseName(a).localeCompare(courseName(b)))
  .map((id) => [id, courseName(id)]);

/**
 * Open the form. Pass `item` to edit a one-off task, `seriesId` to edit a repeating
 * task, or neither to add one (`courseId` preselects a class).
 */
export function openTaskForm({ item = null, seriesId = null, courseId = null } = {}) {
  const series = seriesId ? app.state.taskSeries[seriesId] : null;
  const editing = Boolean(item || series);
  const src = series ?? (item ? {
    courseId: item.courseId, title: item.title, minutes: item.minutesOverride ?? 30,
    notes: item.task?.notes ?? '', due: item.dueAt ? toLocalDate(item.dueAt) : '',
  } : { courseId: courseId ?? classOptions()[0]?.[0] ?? '', title: '', minutes: 30, notes: '', due: '' });

  const classes = classOptions();
  if (!classes.length) {
    showToast({ message: 'Sync once so your classes are listed, then add a task.', duration: 5000 });
    return;
  }
  const minuteChoices = [...new Set([...MINUTE_CHOICES, src.minutes])].sort((a, b) => a - b);
  const startWeekday = app.state.settings.weekStartDay;
  const weekOrder = Array.from({ length: 7 }, (_, i) => (startWeekday + i) % 7);

  const classSel = select(classes, String(src.courseId), { 'data-key': 'task-class' });
  const titleIn = el('input', { type: 'text', value: src.title, maxLength: MAX_TITLE, placeholder: 'e.g. Study for the midterm', 'data-key': 'task-title' });
  const minutesSel = select(minuteChoices.map((m) => [String(m), minutesLabel(m)]), String(src.minutes), { 'data-key': 'task-minutes' });
  const dueIn = el('input', { type: 'date', value: src.due ?? '', min: editing ? null : today(), 'data-key': 'task-due' });
  const notesIn = el('textarea', { rows: 3, maxLength: 2000, placeholder: 'Optional', 'data-key': 'task-notes' });
  notesIn.value = src.notes ?? '';
  const repeatIn = el('input', { type: 'checkbox', checked: Boolean(series), disabled: editing, 'data-key': 'task-repeat' });
  const days = weekOrder.map((d) => el('label', { className: 'day-pick' },
    el('input', { type: 'checkbox', value: String(d), checked: series?.weekdays.includes(d) ?? false, 'data-key': `task-day-${d}` }),
    el('span', {}, WEEKDAYS[d].slice(0, 3))));
  const untilIn = el('input', { type: 'date', value: series?.until ?? '', 'data-key': 'task-until' });
  const error = el('p', { className: 'warn-text', role: 'alert' });

  const dueRow = el('label', { className: 'form-row' }, el('span', {}, 'Due date'), dueIn,
    el('small', {}, 'Leave empty to do it any time this week. It carries over until it\'s done.'));
  const repeatRows = el('div', { className: 'repeat-rows' },
    el('div', { className: 'form-row' }, el('span', {}, 'On'), el('div', { className: 'day-picks' }, days)),
    el('label', { className: 'form-row' }, el('span', {}, 'Until'), untilIn, el('small', {}, 'Optional. Leave empty to repeat until you delete it.')));
  const showRepeat = () => { dueRow.hidden = repeatIn.checked; repeatRows.hidden = !repeatIn.checked; };
  repeatIn.addEventListener('change', showRepeat);

  const dialog = el('dialog', { className: 'task-dialog', 'aria-labelledby': 'task-dialog-title' });
  const close = () => { dialog.close(); dialog.remove(); };

  const save = (e) => {
    e.preventDefault();
    const title = titleIn.value.trim().replace(/\s+/g, ' ');
    if (!title) return void (error.textContent = 'Give the task a name.');
    const fields = { courseId: classSel.value, title, minutes: Number(minutesSel.value), notes: notesIn.value.trim() };
    if (repeatIn.checked) {
      const weekdays = days.map((d) => d.querySelector('input')).filter((i) => i.checked).map((i) => Number(i.value));
      if (!weekdays.length) return void (error.textContent = 'Pick at least one day for it to repeat on.');
      const start = series?.start ?? today();
      if (untilIn.value && untilIn.value < start) return void (error.textContent = 'The end date is before it starts.');
      const id = series?.id ?? newId('s');
      const next = validateTaskSeries({ [id]: { ...fields, id, weekdays, start, until: untilIn.value || null } })[id];
      if (!next) return void (error.textContent = 'Check the dates and try again.');
      saveSeries(next);
    } else {
      saveOneOff(item, { ...fields, dueDate: dueIn.value || null });
    }
    close();
  };

  dialog.append(el('form', { method: 'dialog', onsubmit: save },
    el('h2', { id: 'task-dialog-title' }, series ? 'Edit repeating task' : item ? 'Edit task' : 'Add a task'),
    series ? el('p', { className: 'hint' }, 'Changes apply from today on. Days already done keep their check.') : null,
    el('label', { className: 'form-row' }, el('span', {}, 'Class'), classSel),
    el('label', { className: 'form-row' }, el('span', {}, 'Task'), titleIn),
    el('label', { className: 'form-row' }, el('span', {}, 'Time'), minutesSel),
    editing ? null : el('label', { className: 'form-row check-row' }, repeatIn, el('span', {}, 'Repeats every week')),
    dueRow,
    repeatRows,
    el('label', { className: 'form-row' }, el('span', {}, 'Notes'), notesIn),
    error,
    el('div', { className: 'form-buttons' },
      editing ? el('button', {
        type: 'button', className: 'danger', 'data-key': 'task-delete',
        onclick: () => { close(); series ? deleteSeries(series) : deleteOneOff(item); },
      }, 'Delete') : null,
      el('span', { className: 'spacer' }),
      el('button', { type: 'button', onclick: close, 'data-key': 'task-cancel' }, 'Cancel'),
      el('button', { type: 'submit', className: 'primary', 'data-key': 'task-save' }, editing ? 'Save' : 'Add task')),
  ));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  showRepeat();
  dialog.showModal();
  titleIn.focus();
}

function saveOneOff(item, { courseId, title, minutes, notes, dueDate }) {
  const items = { ...app.state.items };
  if (item) {
    const fresh = taskItem({ id: item.id, courseId, title, minutes, dueDate, notes });
    // Keep what you've done with it (checks, logged time, moves); a changed due date
    // clears a move that may no longer fit.
    items[item.id] = {
      ...item, courseId: fresh.courseId, title, minutesOverride: minutes, dueAt: fresh.dueAt,
      plannedOn: fresh.dueAt === item.dueAt ? item.plannedOn : null, task: fresh.task,
    };
  } else {
    const id = newId('t');
    items[id] = taskItem({ id, courseId, title, minutes, dueDate, notes });
  }
  saveState({ items });
  if (!item) showToast({ message: `Added: ${title}`, duration: 3000 });
}

function saveSeries(series) {
  const taskSeries = { ...app.state.taskSeries, [series.id]: series };
  const items = syncSeries(dropFutureCopies(app.state.items, series.id, today()), taskSeries, today(), app.state.settings);
  saveState({ taskSeries, items });
}

function deleteOneOff(item) {
  const before = app.state.items;
  const items = { ...before };
  delete items[item.id];
  saveState({ items });
  const t = showToast({
    message: `Deleted task: ${item.title}`,
    actions: [{ label: 'Undo', onclick: () => { t.close(); saveState({ items: { ...app.state.items, [item.id]: item } }); } }],
  });
}

/** Delete a repeating task: its future copies go, done ones stay in your history. */
function deleteSeries(series) {
  const beforeItems = app.state.items;
  const taskSeries = { ...app.state.taskSeries };
  delete taskSeries[series.id];
  saveState({ taskSeries, items: dropFutureCopies(beforeItems, series.id, today()) });
  const t = showToast({
    message: `Deleted repeating task: ${series.title}`,
    actions: [{
      label: 'Undo',
      onclick: () => { t.close(); saveState({ taskSeries: { ...app.state.taskSeries, [series.id]: series }, items: { ...app.state.items, ...pick(beforeItems, series.id) } }); },
    }],
  });
}

const pick = (items, seriesId) => Object.fromEntries(Object.entries(items).filter(([, i]) => i.task?.seriesId === seriesId));
