process.env.TZ = 'America/Denver';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCanvas, applySync, parseNextLink, AuthError, CANVAS } from '../src/sync/canvas.js';
import { migrate } from '../src/storage/schema.js';

const json = (data, { status = 200, headers = {}, prefix = '' } = {}) =>
  new Response(prefix + JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

const assignment = (id, over = {}) => ({
  id, name: `A${id}`, due_at: '2026-10-04T05:59:00Z', submission_types: ['online_upload'],
  submission: { workflow_state: 'unsubmitted' }, html_url: `${CANVAS}/courses/1/assignments/${id}`, ...over,
});

/** Fake Canvas: routes map a path prefix to a list of responses returned in order. */
function fakeCanvas(routes) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const path = url.slice(CANVAS.length);
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    const r = routes[key].shift();
    return typeof r === 'function' ? r() : r;
  };
  const sleeps = [];
  return { fetchImpl, sleep: async (ms) => sleeps.push(ms), calls, sleeps };
}

test('parseNextLink', () => {
  const h = `<${CANVAS}/api/v1/x?page=1>; rel="current",<${CANVAS}/api/v1/x?page=2>; rel="next"`;
  assert.equal(parseNextLink(h), `${CANVAS}/api/v1/x?page=2`);
  assert.equal(parseNextLink(null), null);
  assert.equal(parseNextLink('<https://evil.example/x>; rel="next"'), null);
});

test('follows pagination, strips while(1);, sends credentials, skips restricted courses', async () => {
  const fake = fakeCanvas({
    '/api/v1/courses?': [json([
      { id: 1, name: 'Physics' }, { id: 2, access_restricted_by_date: true }, { id: 3, name: '' },
    ], { prefix: 'while(1);' })],
    '/api/v1/courses/1/assignments': [
      json([assignment(10)], { headers: { link: `<${CANVAS}/api/v1/courses/1/assignments?page=2>; rel="next"` } }),
      json([assignment(11)]),
    ],
  });
  const r = await fetchCanvas(fake);
  assert.deepEqual(r.courses, [{ id: '1', name: 'Physics' }]);
  assert.deepEqual(r.results[0].items.map((i) => i.id), ['10', '11']);
  assert.ok(fake.calls.every((c) => c.opts.credentials === 'include'));
  assert.ok(fake.calls.every((c) => c.url.startsWith(CANVAS + '/api/v1/')));
});

test('login page or 401 is an AuthError', async () => {
  const html = new Response('<!DOCTYPE html><html>Log in</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  await assert.rejects(fetchCanvas(fakeCanvas({ '/api/v1/courses?': [html] })), AuthError);
  await assert.rejects(fetchCanvas(fakeCanvas({ '/api/v1/courses?': [json({}, { status: 401 })] })), AuthError);
});

test('backs off on 429, then succeeds', async () => {
  const fake = fakeCanvas({
    '/api/v1/courses?': [json({}, { status: 429, headers: { 'retry-after': '2' } }), json({}, { status: 429 }), json([])],
  });
  await fetchCanvas(fake);
  assert.deepEqual(fake.sleeps, [2000, 2000]);
});

test('one course failing keeps its items untouched and reports the error', async () => {
  const fake = fakeCanvas({
    '/api/v1/courses?': [json([{ id: 1, name: 'Physics' }, { id: 2, name: 'Chem' }])],
    '/api/v1/courses/1/assignments': [json({ errors: [] }, { status: 500 })],
    '/api/v1/courses/2/assignments': [json([assignment(20, { name: 'New title' })])],
  });
  const r = await fetchCanvas(fake);
  assert.deepEqual(fake.sleeps, [300]); // delay between courses

  const state = migrate({
    items: {
      10: { courseId: '1', title: 'Old physics', manualDone: true },
      20: { courseId: '2', title: 'Old chem', pinned: true },
      30: { courseId: '7', title: 'Dropped course' },
    },
  });
  const next = applySync(state, r, '2026-09-30T18:00:00.000Z');
  assert.equal(next.items['10'].title, 'Old physics');
  assert.equal(next.items['10'].manualDone, true);
  assert.equal(next.items['20'].title, 'New title');
  assert.equal(next.items['20'].pinned, true);
  assert.equal(next.items['30'].hidden, true);
  assert.match(next.meta.lastError, /Physics: Canvas returned HTTP 500/);
  assert.equal(next.meta.lastSyncAt, '2026-09-30T18:00:00.000Z');
  assert.deepEqual(next.courses, { 1: { name: 'Physics' }, 2: { name: 'Chem' } });
});

test('session expiring mid-sync aborts the whole sync', async () => {
  const fake = fakeCanvas({
    '/api/v1/courses?': [json([{ id: 1, name: 'Physics' }])],
    '/api/v1/courses/1/assignments': [json({}, { status: 403 })],
  });
  await assert.rejects(fetchCanvas(fake), AuthError);
});
