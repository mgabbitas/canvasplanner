process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));

test('manifest only requests allowed permissions', () => {
  const allowed = ['storage', 'alarms'];
  for (const p of manifest.permissions ?? []) {
    assert.ok(allowed.includes(p), `permission not allowed: ${p}`);
  }
  assert.deepEqual(manifest.host_permissions, ['https://byui.instructure.com/*']);
  assert.equal(manifest.optional_permissions, undefined);
});

test('content scripts only run on the Canvas host and read nothing', () => {
  for (const cs of manifest.content_scripts ?? []) {
    assert.deepEqual(cs.matches, ['https://byui.instructure.com/*']);
    assert.equal(cs.all_frames ?? false, false);
    for (const file of cs.js) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /document\.|innerHTML|cookie|localStorage/, `${file} must not read the page`);
    }
  }
});
