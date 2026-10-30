process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHost, isCanvasUrl, onSchool } from '../src/sync/school.js';

test('school address: what people type becomes a Canvas host', () => {
  for (const input of ['byui', 'BYUI.instructure.com', ' https://byui.instructure.com/courses/1?x=2 ', 'byui.instructure.com/']) {
    assert.equal(normalizeHost(input), 'byui.instructure.com', input);
  }
  assert.equal(normalizeHost('uofu.beta.instructure.com'), 'uofu.beta.instructure.com');
  assert.equal(normalizeHost('canvas.instructure.com'), 'canvas.instructure.com'); // free-for-teacher Canvas is real Canvas
  for (const bad of ['community.instructure.com', 'https://status.instructure.com/', '', 'canvas.byui.edu', 'evil.com', 'instructure.com', 'www.instructure.com', 'byui.instructure.com.evil.com',
    'by ui', '-bad.instructure.com', 'a..instructure.com', 'javascript:alert(1)']) {
    assert.equal(normalizeHost(bad), null, bad);
  }
});

test('Canvas links: https on an instructure.com host only', () => {
  assert.ok(isCanvasUrl('https://byui.instructure.com/courses/1/assignments/2'));
  assert.ok(isCanvasUrl('https://other.instructure.com/courses/1'));
  for (const bad of ['http://byui.instructure.com/x', 'https://byui.instructure.com.evil.com/x', 'https://evil.com/byui.instructure.com/',
    'javascript:alert(1)', 'https://user@byui.instructure.com/', 'https://byui.instructure.com:8443/', null]) {
    assert.equal(isCanvasUrl(bad), false, String(bad));
  }
  assert.ok(onSchool('https://byui.instructure.com/courses', 'byui.instructure.com'));
  assert.equal(onSchool('https://other.instructure.com/courses', 'byui.instructure.com'), false);
  assert.equal(onSchool('https://byui.instructure.com/', null), false);
});
