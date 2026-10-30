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
  // Any school's Canvas (decided 2026-10-29): *.instructure.com only, never broader.
  assert.deepEqual(manifest.host_permissions, ['https://*.instructure.com/*']);
  assert.equal(manifest.optional_permissions, undefined);
});

test('content scripts only run on the Canvas host and read nothing', () => {
  for (const cs of manifest.content_scripts ?? []) {
    assert.deepEqual(cs.matches, ['https://*.instructure.com/*']);
    assert.equal(cs.all_frames ?? false, false);
    for (const file of cs.js) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /document\.|innerHTML|cookie|localStorage/, `${file} must not read the page`);
    }
  }
});

test('packaging never includes Canvas data or signing credentials', async () => {
  const { default: config } = await import('../web-ext-config.mjs');
  for (const path of ['test', '.amo.env']) assert.ok(config.ignoreFiles.includes(path), `${path} must be ignored`);
  const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  for (const line of ['.amo.env', 'test/fixtures/*.json']) assert.ok(gitignore.split('\n').includes(line), `${line} must be gitignored`);
});
