// The Exams card in the side column: each exam, the day you'll take it (when it's open
// for more than one day), and an optional study block the day before.
import { dateRange, toLocalDate, addDays } from '../planner/dates.js';
import { studyTask, studyTaskId } from '../planner/tasks.js';
import { el, select, dayLabel, dueLabel, minutesLabel } from './dom.js';
import { courseColor } from './theme.js';
import { app, courseName, saveState, updateItem } from './app.js';
import { relativeDay, MINUTE_CHOICES } from './items.js';
import { openSplitPicker } from './splitpicker.js';

const MAX_DAY_BUTTONS = 8;
const STUDY_PRESETS = [30, 60, 120];

/** Days you could take it: online exams open for more than one day. */
function takeDays(e) {
  if (e.inClass || !e.lastDay) return [];
  const days = dateRange(e.firstDay, e.lastDay).slice(0, MAX_DAY_BUTTONS);
  return days.length > 1 ? days : [];
}

/** The study task's entry in a plan on screen (for the split picker). */
function studyEntry(id) {
  for (const [p, kind] of [[app.shownPlan, app.shownPlan === app.thisWeekPlan ? 'plan' : 'next'], [app.thisWeekPlan, 'plan']]) {
    const entry = p?.days.flatMap((d) => d.items).find((x) => x.item.id === id && !x.overdue);
    if (entry) return { entry, kind };
  }
  return null;
}

function addStudy(exam, minutes) {
  app.studyOpen = null;
  const task = studyTask(exam, minutes, toLocalDate(Date.now()));
  saveState({ items: { ...app.state.items, [task.id]: task, [exam.id]: { ...exam, studyChoice: 'yes' } } });
}

function removeStudy(exam) {
  const items = { ...app.state.items, [exam.id]: { ...exam, studyChoice: null } };
  delete items[studyTaskId(exam.id)];
  saveState({ items });
}

function dayRow(e, days) {
  const { item } = e;
  return el('div', { className: 'exam-row' },
    el('span', { className: 'exam-q' }, 'When will you take it?'),
    el('div', { className: 'exam-days', role: 'group', 'aria-label': `Day to take ${item.title}` }, days.map((d) => el('button', {
      type: 'button', className: `exam-day${e.movedTo === d ? ' picked' : ''}`, 'aria-pressed': String(e.movedTo === d),
      title: e.movedTo === d ? 'Click again to let the planner pick' : dayLabel(d),
      'data-key': `exam-day-${item.id}-${d}`,
      onclick: () => updateItem(item.id, { plannedOn: e.movedTo === d ? null : d, pinned: false }),
    }, relativeDay(d) === 'Today' || relativeDay(d) === 'Tomorrow' ? relativeDay(d) : dayLabel(d, { weekday: 'short' })))),
    !e.movedTo && e.date ? el('small', { className: 'muted' }, `Planner's pick: ${relativeDay(e.date)}`) : null);
}

function studyRow(e) {
  const exam = e.item;
  const task = app.state.items[studyTaskId(exam.id)];
  if (task) {
    const done = task.manualDone || task.canvasDone;
    const where = studyEntry(task.id);
    return el('div', { className: 'exam-row' },
      el('span', {}, done ? `Studied ✓` : `Study: ${minutesLabel(task.minutesOverride)}, ${task.splitParts ? `in ${task.splitParts} parts` : relativeDay(toLocalDate(task.dueAt))}`),
      done ? null : el('div', { className: 'exam-actions' },
        where ? el('button', { type: 'button', className: 'link', 'data-key': `study-spread-${exam.id}`, onclick: () => openSplitPicker(where.entry, where.kind) },
          task.splitParts ? 'Change days' : 'Spread it out') : null,
        el('button', { type: 'button', className: 'link', 'data-key': `study-remove-${exam.id}`, onclick: () => removeStudy(exam) }, 'Remove')));
  }
  if (exam.studyChoice === 'no') return null;
  if (app.studyOpen === exam.id) {
    const other = select([['', 'Other…'], ...MINUTE_CHOICES.filter((m) => m >= 15).map((m) => [String(m), minutesLabel(m)])], '', {
      'aria-label': 'Other study time', 'data-key': `study-other-${exam.id}`,
      onchange: (ev) => ev.target.value && addStudy(exam, Number(ev.target.value)),
    });
    return el('div', { className: 'exam-row' },
      el('span', { className: 'exam-q' }, 'How long do you want to study?'),
      el('div', { className: 'exam-actions' },
        STUDY_PRESETS.map((m) => el('button', { type: 'button', 'data-key': `study-min-${exam.id}-${m}`, onclick: () => addStudy(exam, m) }, minutesLabel(m))),
        other,
        el('button', { type: 'button', className: 'link', onclick: () => { app.studyOpen = null; app.render(); } }, 'Cancel')));
  }
  return el('div', { className: 'exam-row' },
    el('span', { className: 'exam-q' }, 'Want to plan study time? A little review the day before goes a long way.'),
    el('div', { className: 'exam-actions' },
      el('button', { type: 'button', 'data-key': `study-add-${exam.id}`, onclick: () => { app.studyOpen = exam.id; app.render(); } }, 'Add study time'),
      el('button', { type: 'button', className: 'link', 'data-key': `study-no-${exam.id}`, onclick: () => updateItem(exam.id, { studyChoice: 'no' }) }, 'No thanks')));
}

export function renderExams(p, which) {
  if (!p.exams.length) return null;
  // Real dates: the Next week projection plans as if it were already next week.
  const today = toLocalDate(Date.now());
  return el('section', { className: 'panel exams', 'data-key': 'exams' },
    el('h2', {}, `Exams ${which}`),
    el('ul', { className: 'exam-list' }, p.exams.map((e) => {
      const { item } = e;
      const days = takeDays(e);
      // Study is asked once there's a day to plan it before: a fixed day, or the one you picked.
      const ready = !days.length || e.movedTo;
      return el('li', { style: `--course:${courseColor(item.courseId, app.state.settings, app.state.courses)}` },
        el('span', { className: 'dot', 'aria-hidden': 'true' }),
        el('div', {},
          item.url
            ? el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'exam-title' }, item.title)
            : el('span', { className: 'exam-title' }, item.title),
          el('div', { className: 'muted' }, `${courseName(item.courseId)} · ${dueLabel(item.dueAt)}`,
            e.inClass ? el('span', { className: 'chip' }, 'in class') : null,
            e.dueDay === today ? el('span', { className: 'chip bad' }, 'today')
              : e.dueDay === addDays(today, 1) ? el('span', { className: 'chip warn' }, 'tomorrow') : null),
          days.length ? dayRow(e, days) : null,
          ready ? studyRow(e) : null,
        ),
      );
    })),
    el('p', { className: 'hint' }, 'Found by title. Use ⋮ → Not an exam on an item to remove it.'),
  );
}
