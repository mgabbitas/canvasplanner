process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, holidayOf, thanksgiving, activeLook, seasonToOffer, holidayToAsk } from '../src/planner/seasons.js';

const settings = (over = {}) => ({ look: 'plain', holidayLooks: null, seasonOffers: true, seasonAnswered: [], ...over });

test('seasons and holidays by date', () => {
  assert.deepEqual(['2026-09-21', '2026-09-22', '2026-11-30', '2026-12-01', '2026-12-26', '2026-12-27'].map(seasonOf),
    [null, 'fall', 'fall', 'christmas', 'christmas', null]);
  assert.deepEqual([thanksgiving('2026'), thanksgiving('2027'), thanksgiving('2029')], ['2026-11-26', '2027-11-25', '2029-11-22']);
  assert.deepEqual(['2026-10-31', '2026-11-26', '2026-12-25', '2027-07-04', '2026-11-25'].map(holidayOf),
    ['halloween', 'thanksgiving', 'christmasday', 'july4', null]);
});

test('holiday looks: only on the day, only if you said yes', () => {
  assert.equal(activeLook(settings({ look: 'ocean' }), '2026-10-31'), 'ocean');
  assert.equal(activeLook(settings({ look: 'ocean', holidayLooks: true }), '2026-10-31'), 'halloween');
  assert.equal(activeLook(settings({ look: 'ocean', holidayLooks: true }), '2026-11-01'), 'ocean');
  assert.equal(activeLook(settings({ holidayLooks: true }), '2026-12-25'), 'christmas');
  assert.equal(holidayToAsk(settings(), '2026-10-31'), 'halloween');
  assert.equal(holidayToAsk(settings({ holidayLooks: false }), '2026-10-31'), null);
  assert.equal(holidayToAsk(settings(), '2026-10-30'), null);
});

test('season offers: in season, not already using it, once per season per year', () => {
  assert.equal(seasonToOffer(settings(), '2026-10-29'), 'fall');
  assert.equal(seasonToOffer(settings({ look: 'fall' }), '2026-10-29'), null);
  assert.equal(seasonToOffer(settings({ seasonAnswered: ['fall-2026'] }), '2026-10-29'), null);
  assert.equal(seasonToOffer(settings({ seasonAnswered: ['fall-2025'] }), '2026-10-29'), 'fall');
  assert.equal(seasonToOffer(settings({ seasonOffers: false }), '2026-10-29'), null);
  assert.equal(seasonToOffer(settings(), '2026-08-01'), null);
});
