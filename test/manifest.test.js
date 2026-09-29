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
