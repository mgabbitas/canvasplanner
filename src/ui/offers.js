// Friendly one-time questions at the top of This week: on a holiday, "dress up for
// holidays?" (asked once ever); when fall or the Christmas season starts, "switch to
// the seasonal theme?" (once per season each year).
import { seasonToOffer, holidayToAsk, SEASONS, HOLIDAYS } from '../planner/seasons.js';
import { toLocalDate } from '../planner/dates.js';
import { validateSettings } from '../storage/schema.js';
import { el } from './dom.js';
import { app, saveState } from './app.js';

const SEASON_LINE = { fall: 'Fall is here.', christmas: "It's the Christmas season." };

function setSettings(patch) {
  return saveState({ settings: validateSettings({ ...app.state.settings, ...patch }, app.state.settings) });
}

export function renderThemeOffer() {
  const s = app.state.settings;
  const today = toLocalDate(Date.now());
  const holiday = holidayToAsk(s, today);
  if (holiday) {
    return el('div', { className: 'banner offer', 'data-key': 'holiday-offer' },
      el('span', {}, `Happy ${HOLIDAYS[holiday].replace(/^the /, '')}! Want the planner to dress up on holidays? Just for the day.`),
      el('span', { className: 'offer-buttons' },
        el('button', { className: 'primary', 'data-key': 'holiday-yes', onclick: () => setSettings({ holidayLooks: true }) }, 'Yes'),
        el('button', { 'data-key': 'holiday-no', onclick: () => setSettings({ holidayLooks: false }) }, 'No thanks')));
  }
  const season = seasonToOffer(s, today);
  if (!season) return null;
  const answered = [...s.seasonAnswered, `${season}-${today.slice(0, 4)}`];
  return el('div', { className: 'banner offer', 'data-key': 'season-offer' },
    el('span', {}, `${SEASON_LINE[season]} Switch to the ${SEASONS[season]} theme?`),
    el('span', { className: 'offer-buttons' },
      el('button', { className: 'primary', 'data-key': 'season-yes', onclick: () => setSettings({ look: season, seasonAnswered: answered }) }, 'Switch'),
      el('button', { 'data-key': 'season-later', onclick: () => setSettings({ seasonAnswered: answered }) }, 'Not now'),
      el('button', { className: 'link', 'data-key': 'season-never', onclick: () => setSettings({ seasonOffers: false }) }, "Don't ask again")));
}
