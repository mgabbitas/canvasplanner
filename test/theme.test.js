process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseColorKey, CLASS_COLORS, ACCENTS } from '../src/ui/theme.js';
import { validateSettings } from '../src/storage/schema.js';

const courses = { 434496: { name: 'Atoms' }, 422484: { name: 'Intro' }, 48558: { name: 'Majors' } };

test('class colors: stable by course id, picked color wins', () => {
  const s = validateSettings({});
  assert.equal(courseColorKey('48558', s, courses), 'blue'); // lowest id first
  assert.equal(courseColorKey('422484', s, courses), 'orange');
  assert.equal(courseColorKey('434496', s, courses), 'green');
  const picked = validateSettings({ courses: { 422484: { color: 'pink' } } });
  assert.equal(courseColorKey('422484', picked, courses), 'pink');
  assert.ok(CLASS_COLORS[courseColorKey('999', s, courses)]); // unknown course still gets a color
});

test('appearance settings validate and fall back', () => {
  const s = validateSettings({ theme: 'neon', accent: 'gold', courses: { 1: { color: 'chartreuse' } } });
  assert.equal(s.theme, 'system');
  assert.equal(s.accent, 'blue');
  assert.equal(s.courses['1'].color, null);
  const ok = validateSettings({ theme: 'dark', accent: 'teal' });
  assert.deepEqual([ok.theme, ok.accent], ['dark', 'teal']);
  // Schema's accent list matches the UI's.
  for (const a of Object.keys(ACCENTS)) assert.equal(validateSettings({ accent: a }).accent, a);
  for (const c of Object.keys(CLASS_COLORS)) assert.equal(validateSettings({ courses: { 1: { color: c } } }).courses['1'].color, c);
});
