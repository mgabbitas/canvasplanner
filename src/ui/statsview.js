// Stats view (#stats): how long things actually take, from logged times.
import { computeStats, suggestRules, applySuggestion, MIN_LOGS_FOR_SUGGESTION } from '../planner/stats.js';
import { validateSettings } from '../storage/schema.js';
import { el, WEEKDAYS, TYPE_LABELS, minutesLabel, dayLabel } from './dom.js';
import { courseColor } from './theme.js';
import { streaks } from './app.js';

const NEEDS_TIME_DAYS = 30;

function section(title, ...children) {
  return el('section', { className: 'panel stats' }, el('h2', {}, title), ...children);
}

const pct = (x) => `${Math.round(x * 100)}%`;
const diff = (d) => (d == null ? '—' : `${d} / 5`);

/** "23m faster" / "4m slower" / "about right": your average against the estimate. */
function versusEstimate(r) {
  const gap = r.avgMinutes - r.avgEstimate;
  if (Math.abs(gap) < 5) return el('span', { className: 'vs' }, 'about right');
  return el('span', { className: `vs ${gap < 0 ? 'good' : 'bad'}` }, `${minutesLabel(Math.abs(gap))} ${gap < 0 ? 'faster' : 'slower'}`);
}

/**
 * One row per class or type: name, a bar for its share of all logged time (in the
 * class color when there is one), then the numbers.
 */
function statTable(rows, { nameOf, colorOf, header }) {
  if (!rows.length) return el('p', { className: 'hint' }, 'Nothing logged yet.');
  const total = rows.reduce((sum, r) => sum + r.totalMinutes, 0) || 1;
  const most = Math.max(...rows.map((r) => r.totalMinutes), 1);
  return el('table', { className: 'stat-table' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, header),
      el('th', { scope: 'col', className: 'share-col' }, 'Share of your time'),
      el('th', { scope: 'col', className: 'num' }, 'Logged'),
      el('th', { scope: 'col', className: 'num' }, 'Average'),
      el('th', { scope: 'col' }, 'vs estimate'),
      el('th', { scope: 'col', className: 'num' }, 'Difficulty'),
    )),
    el('tbody', {}, rows.map((r) => {
      const color = colorOf?.(r.key);
      const share = `${minutesLabel(r.totalMinutes)} · ${pct(r.totalMinutes / total)}`;
      return el('tr', { style: color ? `--course:${color}` : null },
        el('th', { scope: 'row' },
          el('span', { className: 'name-cell' }, color ? el('span', { className: 'dot', 'aria-hidden': 'true' }) : null, nameOf(r.key))),
        el('td', { className: 'share-col', title: `${nameOf(r.key)}: ${share} of your logged time` },
          el('span', { className: 'share' },
            el('span', { className: 'share-bar', 'aria-hidden': 'true' }, el('span', { style: `width:${(r.totalMinutes / most) * 100}%` })),
            el('span', { className: 'share-val' }, share))),
        el('td', { className: 'num' }, String(r.count)),
        el('td', { className: 'num' }, minutesLabel(r.avgMinutes)),
        el('td', { title: `Estimate ${minutesLabel(r.avgEstimate)}` }, versusEstimate(r)),
        el('td', { className: 'num' }, diff(r.avgDifficulty)),
      );
    })),
  );
}

/**
 * ctx: { state, saveState, courseName(id), finishDay(item), openLog(item) }
 */
export function renderStats(ctx) {
  const { state } = ctx;
  const stats = computeStats({ items: state.items, settings: state.settings });
  const suggestions = suggestRules({ items: state.items, settings: state.settings });
  const o = stats.overall;

  const card = (value, label, sub = null) => el('div', { className: 'stat-card' },
    el('strong', {}, String(value)), el('span', {}, label), sub ? el('small', {}, sub) : null);
  const summary = o.count
    ? el('div', { className: 'stat-cards' },
      card(o.count, 'items logged'),
      card(minutesLabel(o.totalMinutes), 'total time'),
      card(minutesLabel(o.avgMinutes), 'average per item'),
      o.actualVsEstimate != null ? card(pct(o.actualVsEstimate), 'of estimated time') : null,
      card(diff(o.avgDifficulty), 'average difficulty'),
    )
    : el('p', { className: 'hint' }, 'No logged times yet. When you check an item off, choose "Log time" in the message at the bottom, or log finished items from the list below.');
  const colorOf = (id) => courseColor(id, state.settings, state.courses);
  const dot = (id) => (id ? el('span', { className: 'dot', style: `--course:${colorOf(id)}`, 'aria-hidden': 'true' }) : null);

  // Columns, one per weekday in week order; the tallest day fills the height.
  const maxShare = Math.max(0.0001, ...stats.byWeekday.map((d) => d.share));
  const order = Array.from({ length: 7 }, (_, i) => (state.settings.weekStartDay + i) % 7);
  const weekdays = el('ol', { className: 'wk-cols' }, order.map((d) => {
    const w = stats.byWeekday[d];
    const text = `${WEEKDAYS[d]}: ${w.count ? `${minutesLabel(w.totalMinutes)} over ${w.count} item${w.count === 1 ? '' : 's'} (${pct(w.share)} of your time)` : 'nothing logged'}`;
    return el('li', { title: text },
      el('span', { className: 'wk-val', 'aria-hidden': 'true' }, w.count ? pct(w.share) : '—'),
      el('span', { className: 'wk-col', 'aria-hidden': 'true' }, el('span', { style: `height:${(w.share / maxShare) * 100}%` })),
      el('span', { className: 'wk-name', 'aria-hidden': 'true' }, WEEKDAYS[d].slice(0, 3)),
      el('span', { className: 'visually-hidden' }, text),
    );
  }));

  const suggestionList = suggestions.length
    ? el('ul', { className: 'suggestions' }, suggestions.map((s) => {
      const what = [ctx.courseName(s.courseId), s.type ? TYPE_LABELS[s.type] : null, s.keyword ? `title contains "${s.keyword}"` : null]
        .filter(Boolean).join(' · ');
      return el('li', {},
        el('div', {},
          el('strong', { className: 'name-cell' }, dot(s.courseId), what),
          el('div', { className: 'hint' }, `You average ${minutesLabel(s.avgMinutes)} over ${s.count} logged; the estimate is ${minutesLabel(s.currentMinutes)}.`),
        ),
        el('button', {
          className: 'primary', 'data-key': `apply-${s.courseId}-${s.type}-${s.keyword}`,
          onclick: () => ctx.saveState({
            settings: validateSettings({ ...state.settings, estimateRules: applySuggestion(state.settings.estimateRules, s) }, state.settings),
          }),
        }, `Apply: ${minutesLabel(s.minutes)}`),
      );
    }))
    : el('p', { className: 'hint' }, `Suggestions appear once a class has ${MIN_LOGS_FOR_SUGGESTION}+ logged items of one kind whose average is 5+ minutes off the estimate.`);

  const since = (() => {
    const d = new Date();
    d.setDate(d.getDate() - NEEDS_TIME_DAYS);
    return d.toISOString();
  })();
  const needTime = Object.values(state.items)
    .filter((i) => (i.manualDone || i.canvasDone) && !i.log && !i.hidden && !i.inClass && (i.submittedAt ?? i.dueAt ?? '') >= since)
    .sort((a, b) => (b.submittedAt ?? b.dueAt ?? '').localeCompare(a.submittedAt ?? a.dueAt ?? ''));

  const { days, weeks } = streaks();
  const streakCards = el('div', { className: 'stat-cards streak-cards' },
    card(weeks.current, weeks.current === 1 ? 'week on target' : 'weeks on target', `Best: ${weeks.best}`),
    card(days.current, days.current === 1 ? 'day on plan' : 'days on plan', `Best: ${days.best}`),
  );
  const streakHelp = el('details', { className: 'stat-help' },
    el('summary', {}, 'How streaks work'),
    el('p', { className: 'hint' }, 'A week is on target when everything due in it was done by the target day. A day is on plan when you finished everything planned for it. Days with nothing planned, and days you didn\'t open the planner, don\'t break a streak.'));

  return [
    section('Overview', streakCards, streakHelp, summary),
    section('By class', statTable(stats.byCourse, { nameOf: ctx.courseName, colorOf, header: 'Class' })),
    section('By assignment type', statTable(stats.byType, { nameOf: (t) => TYPE_LABELS[t] ?? t, header: 'Type' })),
    section('By day you finished', el('p', { className: 'hint' }, 'Share of your logged time by weekday.'), weekdays),
    section('Suggested estimate rules', suggestionList),
    section(`Finished in the last ${NEEDS_TIME_DAYS} days without a time (${needTime.length})`,
      needTime.length
        ? el('ul', { className: 'items' }, needTime.map((i) => el('li', { className: 'item done' },
          el('span', {}, ''),
          el('span', { className: 'title' }, i.title),
          el('div', { className: 'right' }, el('button', { onclick: () => ctx.openLog(i), 'data-key': `log-${i.id}` }, 'Log time')),
          el('div', { className: 'sub' },
            el('span', { className: 'name-cell' }, dot(i.courseId), ctx.courseName(i.courseId)),
            el('span', {}, `finished ${dayLabel(ctx.finishDay(i), { weekday: 'short', month: 'short', day: 'numeric' })}`)),
        )))
        : el('p', { className: 'hint' }, 'All caught up.')),
  ];
}
