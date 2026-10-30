process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, mix, palette, accentAdjusted, isHex } from '../src/ui/color.js';
import { THEMES, ACCENT_COLORS, neonVars } from '../src/ui/theme.js';

test('contrast and mix', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.ok(isHex('#a1B2c3') && !isHex('red') && !isHex('#abc'));
});

test('every theme and accent stays readable in light and dark', () => {
  const combos = [
    ...Object.entries(THEMES).filter(([, t]) => t.tint).map(([k, t]) => [k, t]),
    ...Object.entries(ACCENT_COLORS).map(([k, accent]) => [`accent ${k}`, { tint: '#8a94a3', accent }]),
    ['ugly custom', { tint: '#ffff00', accent: '#ffff66' }],
    ['dark custom', { tint: '#000000', accent: '#111111' }],
  ];
  for (const [name, t] of combos) {
    for (const dark of [false, true]) {
      const p = palette(t, dark);
      const where = `${name} ${dark ? 'dark' : 'light'}`;
      assert.ok(contrast(p['--text'], p['--bg']) >= 7, `${where}: text`);
      assert.ok(contrast(p['--muted'], p['--surface-2']) >= 4.5, `${where}: muted`);
      assert.ok(contrast(p['--accent'], p['--surface']) >= 4.5, `${where}: accent ${p['--accent']}`);
      assert.ok(contrast(p['--on-accent'], p['--accent']) >= 4.5, `${where}: on-accent`);
    }
  }
});

test('Neon is readable, with your glow colors too (even a dark pick)', () => {
  for (const [glow, bg] of [[undefined, undefined], ['#220044', '#ffffff'], ['#ff00aa', '#ffff00'], ['#22d3ee', '#000000']]) {
    const p = neonVars({ neonGlow: glow, neonGlow2: '#110022', neonBg: bg });
    assert.ok(contrast(p['--text'], p['--bg']) >= 7, `${bg}: text`);
    assert.ok(contrast(p['--muted'], p['--surface-2']) >= 4.5, `${bg}: muted`);
    assert.ok(contrast(p['--accent'], p['--surface']) >= 4.5, `${glow}: accent`);
    assert.ok(contrast(p['--on-accent'], p['--accent']) >= 4.5, `${glow}: on-accent`);
  }
  const p = THEMES.neon.vars;
  assert.ok(contrast(p['--text'], p['--bg']) >= 7);
  assert.ok(contrast(p['--muted'], p['--surface-2']) >= 4.5);
  assert.ok(contrast(p['--accent'], p['--surface']) >= 4.5);
  assert.ok(contrast(p['--on-accent'], p['--accent']) >= 4.5);
});

test('custom picker: says when an accent had to be adjusted', () => {
  assert.equal(accentAdjusted({ tint: '#2563c9', accent: '#1d4ed8' }, false), false);
  assert.equal(accentAdjusted({ tint: '#2563c9', accent: '#ffff66' }, false), true);
});
