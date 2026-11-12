// Small notes at the top of This week: the late-night nudge, "What's new" after an
// update, and the "days ahead" celebration when you get further ahead.
import { daysAhead, isLateNight, progressCheer } from '../planner/ahead.js';
import { daysBetween } from '../planner/dates.js';
import { save } from '../storage/store.js';
import { el, dayLabel, minutesLabel } from './dom.js';
import { celebrate } from './toast.js';
import { app, plural } from './app.js';

// What's new, by feature version ("1.2" covers 1.2.0, 1.2.1, …). Shown once after
// updating into that version, so bug-fix releases don't hide it.
export const WHATS_NEW = {
  '1.5': [
    'Overdue work now sits in a Catch up list at the top of today, and missing items stay on it until done.',
    'Extra credit only fills spare time, finished-extra days turn gold, and there are cheers for finishing early.',
    'Syncs when you come back to the tab, with a progress bar. "Open Canvas" is in the sidebar.',
  ],
  '1.3': [
    'Works with any school\'s Canvas at an instructure.com address. Yours is in Settings → General → School.',
    'A "Report a problem" link in Settings → General.',
  ],
  '1.2': [
    'Settings redesigned: an hours slider for each day, and rules grouped by class.',
    'A toolbar button with today\'s list and a count on the icon.',
    '+ Add task for your own work, one-off or repeating, and "Split across days" in the ⋮ menu.',
    'Work due Monday morning is now planned the week before.',
    'Themes: preset colors, seasonal Fall and Christmas, a glowing Neon theme, your own colors, and falling snow and leaves.',
    'Load bars show planned time and, in solid color, what you\'ve finished.',
    'Stats cleaned up; suggested rules moved to Settings → Rules.',
  ],
};

const version = () => browser.runtime.getManifest().version;
const feature = (v) => (v ?? '').split('.').slice(0, 2).join('.');
/** Compare "1.2" and "1.10" as versions, not text. */
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || (x[1] ?? 0) - (y[1] ?? 0);
};

/** Late at night (midnight to 4 AM): nothing's getting less late, so go to bed. */
export function renderLateNight() {
  if (!app.state.settings.funMessages || app.lateNightDismissed || !isLateNight(new Date().getHours())) return null;
  return el('div', { className: 'banner offer late-night', 'data-key': 'late-night' },
    el('span', {}, "It's past midnight. Anything due today is already as late as it's going to be. Go to bed; you'll feel better in the morning."),
    el('button', { 'data-key': 'late-night-ok', onclick: () => { app.lateNightDismissed = true; app.render(); } }, 'Good night'));
}

/**
 * "What's new" once after an update: a card at the top until you dismiss it, with the
 * newest version's few lines only (older ones are in the README changelog).
 */
export function renderWhatsNew() {
  const v = feature(version());
  const { seenVersion, toured } = app.state.onboarding;
  if (toured !== true) return null;
  const seen = feature(seenVersion);
  const unseen = Object.keys(WHATS_NEW)
    .filter((k) => newer(k, v) <= 0 && (!seen || newer(k, seen) > 0))
    .sort((a, b) => newer(b, a));
  if (!unseen.length) return null;
  const dismiss = () => {
    app.state.onboarding = { ...app.state.onboarding, seenVersion: version() };
    save({ onboarding: app.state.onboarding }).catch(() => {});
    app.render();
  };
  return el('section', { className: 'panel whats-new', 'data-key': 'whats-new' },
    el('div', { className: 'whats-new-head' },
      el('h2', {}, `What's new in ${unseen[0]}`),
      el('button', { className: 'primary', onclick: dismiss, 'data-key': 'whats-new-ok' }, 'Got it')),
    el('ul', {}, WHATS_NEW[unseen[0]].map((line) => el('li', {}, line))),
    el('p', { className: 'hint' }, 'Want the tour? Settings → General → Take the tour.'));
}

/**
 * First load of this version: someone who already synced is an existing user (no tour,
 * show What's new); a new install gets the tour after the first sync instead.
 */
export async function settleOnboarding() {
  const o = app.state.onboarding;
  if (o.toured !== null) return;
  const existing = Boolean(app.state.meta.lastSyncAt);
  app.state.onboarding = { seenVersion: existing ? o.seenVersion : version(), toured: existing };
  await save({ onboarding: app.state.onboarding });
}

/** "Week done" cheer: how early you finished, then go enjoy it. */
function weekDoneText(p) {
  const early = daysBetween(p.today, p.week.cutoff);
  const target = dayLabel(p.week.cutoff, { weekday: 'long' });
  const when = early > 0 ? `${plural(early, 'day')} before your ${target} target` : 'right on target';
  return `The whole week is done, ${when}! Go touch some grass.`;
}

/**
 * After a render of This week: cheer when progress changes on this page: the week done
 * by the target day, getting further ahead, or clearing today's list.
 */
export function celebrateAhead(p) {
  const { days, weekDone } = daysAhead(p);
  const today = p.days.find((d) => d.date === p.today);
  const now = {
    days, weekDone, onTime: p.today <= p.week.cutoff,
    todayClear: !(today?.items ?? []).some((e) => !e.inClass && !e.optional), doneToday: p.doneToday.count,
    bonus: Boolean(today?.bonus && !today.over),
  };
  const cheer = progressCheer(app.progressSeen, now);
  app.progressSeen = now;
  app.ahead = { days, weekDone };
  if (!cheer || !app.state.settings.funMessages) return;
  celebrate({
    week: weekDoneText(p),
    ahead: `Congrats! You're ${plural(days, 'day')} ahead.`,
    today: "Today's list is done. Nice work!",
    extra: `${minutesLabel(today ? today.doneMinutes - today.capacity : 0)} past your hours today. Above and beyond!`,
  }[cheer]);
}

/** Header line: how far ahead you are, if at all. */
export function aheadText() {
  const a = app.ahead;
  if (!a?.days || !app.state.settings.funMessages) return null;
  return a.weekDone ? 'week done!' : `${plural(a.days, 'day')} ahead`;
}

/** Start the tour once, after the first successful sync of a new install. */
export function maybeStartTour() {
  const { toured } = app.state.onboarding;
  if ((toured !== false && !app.replayTour) || app.touring || !app.state.meta.lastSyncAt || !Object.keys(app.state.items).length) return;
  app.touring = true;
  app.replayTour = false;
  import('./tour.js').then((m) => m.startTour());
}
