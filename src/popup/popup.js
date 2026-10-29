// Toolbar popup: today's remaining homework with checkboxes, and a link to the planner.
// Checked items stay listed (and can be unchecked) until the popup closes.
import { loadState, save } from '../storage/store.js';
import { todaySummary } from '../planner/today.js';
import { toLocalDate } from '../planner/dates.js';
import { applyTheme, courseColor } from '../ui/theme.js';
import { el, dayLabel, minutesLabel } from '../ui/dom.js';

let state = null;
let shown = []; // entries listed when the popup opened
const checked = new Set();

const courseName = (id) => state.settings.courses[id]?.displayName || state.courses[id]?.name || `Class ${id}`;
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
/** "due today 9:00 AM", "due Fri 11:59 PM", or "overdue (Tue)". */
function dueText(e, today) {
  const day = toLocalDate(e.item.dueAt);
  const weekday = dayLabel(day, { weekday: 'short' });
  if (e.overdue) return `overdue (${weekday})`;
  return `due ${day === today ? 'today' : weekday} ${time(e.item.dueAt)}`;
}
const summary = () => todaySummary({ items: state.items, settings: state.settings, weekState: state.weekState, now: Date.now() });

/** Same change the planner page makes when you check an item off (or uncheck it). */
async function setDone(id, done) {
  state = await loadState(); // the planner may have changed things since we opened
  const item = state.items[id];
  if (!item) return;
  const items = { ...state.items, [id]: { ...item, manualDone: done, doneOn: done ? toLocalDate(Date.now()) : null } };
  state.items = items;
  await save({ items });
  if (done) checked.add(id);
  else checked.delete(id);
  render();
}

function openPlanner() {
  browser.tabs.create({ url: browser.runtime.getURL('src/ui/planner.html') });
  window.close();
}

function render() {
  const { doneCount, date } = summary();
  const left = shown.filter((e) => !checked.has(e.id)).length;
  const synced = Boolean(state.meta.lastSyncAt);

  const list = shown.length
    ? el('ul', { className: 'popup-items' }, shown.map((e) => {
      const isChecked = checked.has(e.id);
      return el('li', { className: `popup-item${isChecked ? ' done' : ''}`, style: `--course:${courseColor(e.item.courseId, state.settings, state.courses)}` },
        el('input', {
          type: 'checkbox', checked: isChecked, 'aria-label': `Done: ${e.item.title}`, 'data-key': `done-${e.id}`,
          onchange: (ev) => setDone(e.id, ev.target.checked),
        }),
        el('div', { className: 'popup-text' },
          e.item.url
            ? el('a', { href: e.item.url, target: '_blank', rel: 'noopener noreferrer', className: 'popup-title' }, e.item.title)
            : el('span', { className: 'popup-title' }, e.item.title),
          el('span', { className: 'popup-sub' },
            courseName(e.item.courseId),
            e.item.dueAt ? ` · ${dueText(e, date)}` : '',
            ` · ${minutesLabel(e.minutes)}`)),
      );
    }))
    : el('p', { className: 'popup-empty' }, synced
      ? 'Nothing left for today.'
      : 'Open the planner and sync to see today\'s work.');

  document.getElementById('popup').replaceChildren(
    el('header', { className: 'popup-head' },
      el('h1', {}, 'Today'),
      el('span', { className: 'muted' }, dayLabel(date, { weekday: 'short', month: 'short', day: 'numeric' }))),
    el('p', { className: 'popup-count', 'data-key': 'popup-count' },
      shown.length ? `${left} left` : null,
      shown.length && doneCount ? ' · ' : null,
      doneCount ? `${doneCount} done today` : null),
    list,
    el('button', { className: 'primary popup-open', onclick: openPlanner, 'data-key': 'open-planner' }, 'Open planner'),
  );
}

state = await loadState();
applyTheme(state.settings);
shown = summary().remaining;
render();
