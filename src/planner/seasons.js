// Seasons and holidays for themes. Pure: dates come in as 'YYYY-MM-DD'.
import { weekday } from './dates.js';

export const SEASONS = { fall: 'Fall', christmas: 'Christmas' };
export const HOLIDAYS = { halloween: 'Halloween', thanksgiving: 'Thanksgiving', christmasday: 'Christmas Day', july4: 'the 4th of July' };

/** Fall: Sep 22 – Nov 30. Christmas: Dec 1 – 26. */
export function seasonOf(date) {
  const md = date.slice(5);
  if (md >= '09-22' && md <= '11-30') return 'fall';
  if (md >= '12-01' && md <= '12-26') return 'christmas';
  return null;
}

/** Thanksgiving (US): the fourth Thursday of November. */
export function thanksgiving(year) {
  const first = `${year}-11-01`;
  const day = 1 + ((4 - weekday(first) + 7) % 7) + 21;
  return `${year}-11-${String(day).padStart(2, '0')}`;
}

export function holidayOf(date) {
  const md = date.slice(5);
  if (md === '10-31') return 'halloween';
  if (md === '12-25') return 'christmasday';
  if (md === '07-04') return 'july4';
  if (date === thanksgiving(date.slice(0, 4))) return 'thanksgiving';
  return null;
}

// The look each holiday wears (Christmas Day uses the Christmas theme).
const HOLIDAY_LOOK = { halloween: 'halloween', thanksgiving: 'thanksgiving', christmasday: 'christmas', july4: 'july4' };

/** The theme to show today: a holiday's look if you said yes to holiday looks, else your theme. */
export function activeLook(settings, date) {
  const h = holidayOf(date);
  return h && settings.holidayLooks === true ? HOLIDAY_LOOK[h] : settings.look;
}

/** A season whose theme to offer today, or null: in season, not using it, not answered this year. */
export function seasonToOffer(settings, date) {
  const s = seasonOf(date);
  if (!s || !settings.seasonOffers || settings.look === s) return null;
  return settings.seasonAnswered.includes(`${s}-${date.slice(0, 4)}`) ? null : s;
}

/** A holiday to ask about (once ever): today is one and you haven't said yes or no. */
export const holidayToAsk = (settings, date) => (settings.holidayLooks == null ? holidayOf(date) : null);
