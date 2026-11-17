process.env.TZ = 'America/Denver';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Just enough of a page for decor.js's idle watcher: window/document listeners and
// the root element's data attributes.
const listeners = {};
const docListeners = {};
const root = { dataset: {} };
globalThis.addEventListener = (type, fn) => { listeners[type] = fn; };
globalThis.document = {
  documentElement: root,
  visibilityState: 'visible',
  addEventListener: (type, fn) => { docListeners[type] = fn; },
};

test('animations pause after a minute without input, or while the tab is hidden', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { watchIdle } = await import('../src/ui/decor.js');
  const idle = () => 'idle' in root.dataset;
  watchIdle();
  assert.equal(idle(), false);
  mock.timers.tick(59_000);
  assert.equal(idle(), false);
  listeners.pointermove(); // input at 59 s pushes the pause back a minute
  mock.timers.tick(30_000);
  assert.equal(idle(), false);
  mock.timers.tick(30_000);
  assert.equal(idle(), true);
  listeners.keydown(); // any input resumes
  assert.equal(idle(), false);
  document.visibilityState = 'hidden';
  docListeners.visibilitychange();
  assert.equal(idle(), true);
  document.visibilityState = 'visible';
  docListeners.visibilitychange();
  assert.equal(idle(), false);
  mock.timers.reset();
});
