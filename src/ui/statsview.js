// Stats view (#stats): how long things actually take, from logged times.
import { computeStats, suggestRules, applySuggestion, MIN_LOGS_FOR_SUGGESTION } from '../planner/stats.js';
import { validateSettings } from '../storage/schema.js';
import { el, WEEKDAYS, TYPE_LABELS, minutesLabel, dayLabel } from './dom.js';

const NEEDS_TIME_DAYS = 30;

function section(title, ...children) {
  return el('section', { className: 'panel stats' }, el('h2', {}, title), ...children);
}

const pct = (x) => `${Math.round(x * 100)}%`;
const diff = (d) => (d == null ? '—' : `${d} / 5`);

function statTable(rows, nameOf, nameHeader) {
  if (!rows.length) return el('p', { className: 'hint' }, 'Nothing logged yet.');
  return el('table', { className: 'stat-table' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, nameHeader),
      el('th', { scope: 'col' }, 'Logged'),
      el('th', { scope: 'col' }, 'Average time'),
      el('th', { scope: 'col' }, 'Estimate'),
      el('th', { scope: 'col' }, 'Difficulty'),
      el('th', { scope: 'col' }, 'Total'),
    )),
    el('tbody', {}, rows.map((r) => el('tr', {},
      el('th', { scope: 'row' }, nameOf(r.key)),
      el('td', {}, String(r.count)),
      el('td', {}, minutesLabel(r.avgMinutes)),
      el('td', { className: r.avgEstimate - r.avgMinutes >= 5 ? 'good' : r.avgMinutes - r.avgEstimate >= 5 ? 'bad' : '' }, minutesLabel(r.avgEstimate)),
      el('td', {}, diff(r.avgDifficulty)),
      el('td', {}, minutesLabel(r.totalMinutes)),
    ))),
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

  const summary = o.count
    ? el('div', { className: 'stat-cards' },
      el('div', { className: 'stat-card' }, el('strong', {}, String(o.count)), el('span', {}, 'items logged')),
      el('div', { className: 'stat-card' }, el('strong', {}, minutesLabel(o.totalMinutes)), el('span', {}, 'total time')),
      el('div', { className: 'stat-card' }, el('strong', {}, minutesLabel(o.avgMinutes)), el('span', {}, 'average per item')),
      o.actualVsEstimate != null
        ? el('div', { className: 'stat-card' }, el('strong', {}, pct(o.actualVsEstimate)), el('span', {}, 'of estimated time'))
        : null,
      el('div', { className: 'stat-card' }, el('strong', {}, diff(o.avgDifficulty)), el('span', {}, 'average difficulty')),
    )
    : el('p', { className: 'hint' }, 'No logged times yet. When you check an item off, choose "Log time" in the message at the bottom, or log finished items from the list below.');

  const maxShare = Math.max(0.0001, ...stats.byWeekday.map((d) => d.share));
  const order = Array.from({ length: 7 }, (_, i) => (state.settings.weekStartDay + i) % 7);
  const weekdays = el('ol', { className: 'wk-bars' }, order.map((d) => {
    const w = stats.byWeekday[d];
    const text = `${WEEKDAYS[d]}: ${w.count ? `${minutesLabel(w.totalMinutes)} over ${w.count} item${w.count === 1 ? '' : 's'} (${pct(w.share)} of your time)` : 'nothing logged'}`;
    return el('li', { title: text },
      el('span', { className: 'wk-name' }, WEEKDAYS[d].slice(0, 3)),
      el('span', { className: 'wk-bar', 'aria-hidden': 'true' }, el('span', { style: `width:${(w.share / maxShare) * 100}%` })),
      el('span', { className: 'wk-val' }, w.count ? `${minutesLabel(w.totalMinutes)} · ${pct(w.share)}` : '—'),
      el('span', { className: 'visually-hidden' }, text),
    );
  }));

  const suggestionList = suggestions.length
    ? el('ul', { className: 'suggestions' }, suggestions.map((s) => {
      const what = [ctx.courseName(s.courseId), s.type ? TYPE_LABELS[s.type] : null, s.keyword ? `title contains "${s.keyword}"` : null]
        .filter(Boolean).join(' · ');
      return el('li', {},
        el('div', {},
          el('strong', {}, what),
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

  return [
    section('Overview', summary),
    section('By class', statTable(stats.byCourse, ctx.courseName, 'Class')),
    section('By assignment type', statTable(stats.byType, (t) => TYPE_LABELS[t] ?? t, 'Type')),
    section('By day you finished', el('p', { className: 'hint' }, 'Share of your logged time by weekday.'), weekdays),
    section('Suggested estimate rules', suggestionList),
    section(`Finished in the last ${NEEDS_TIME_DAYS} days without a time (${needTime.length})`,
      needTime.length
        ? el('ul', { className: 'items' }, needTime.map((i) => el('li', { className: 'item done' },
          el('span', {}, ''),
          el('span', { className: 'title' }, i.title),
          el('div', { className: 'right' }, el('button', { onclick: () => ctx.openLog(i), 'data-key': `log-${i.id}` }, 'Log time')),
          el('div', { className: 'sub' },
            el('span', {}, ctx.courseName(i.courseId)),
            el('span', {}, `finished ${dayLabel(ctx.finishDay(i), { weekday: 'short', month: 'short', day: 'numeric' })}`)),
        )))
        : el('p', { className: 'hint' }, 'All caught up.')),
  ];
}
