// Fake WebExtension APIs for testing the page outside the extension.
(() => {
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push(`rejection: ${e.reason?.stack || e.reason}`));
  const origError = console.error;
  console.error = (...a) => { window.__errors.push(`console.error: ${a.join(' ')}`); origError(...a); };
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/data.json', false);
  xhr.send();
  const q = new URLSearchParams(location.search);
  // ?empty: first run. ?loginerror / ?noaccess: first run after a failed sync.
  const failed = q.has('loginerror') ? "Canvas didn't recognize your login (HTTP 401)."
    : q.has('noaccess') ? "Planner for Canvas isn't allowed to read Canvas yet" : null;
  const store = failed ? { meta: { lastSyncAt: null, lastError: failed } }
    : q.has('empty') ? {} : JSON.parse(xhr.responseText);
  // ?date=2026-10-31: pretend it's that day (noon), for holiday screenshots.
  if (q.get('date')) {
    const shift = new Date(`${q.get('date')}T12:00:00`).getTime() - Date.now();
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + shift;
  }
  // ?look=fall&mode=dark: start in a theme (for screenshots).
  if (q.get('look') && store.settings) store.settings.look = q.get('look');
  if (q.get('mode') && store.settings) store.settings.theme = q.get('mode');
  if (q.has('holiday') && store.settings) store.settings.holidayLooks = true;
  // ?newuser: a fresh install that just synced (gets the tour, not What's new).
  if (q.has('newuser')) store.onboarding = { seenVersion: '1.3.0', toured: false };
  // ?roomy: 8 hours every day, so today isn't over capacity.
  if (q.has('roomy') && store.settings) store.settings.capacity = Array(7).fill(480);
  // ?somedone: check off three items due in the next week today (to see the done part of the bars).
  if (q.has('somedone') && store.items) {
    const now = Date.now();
    const today = new Date(now - new Date(now).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    Object.values(store.items).filter((i) => !i.canvasDone && i.dueAt && Date.parse(i.dueAt) > now && Date.parse(i.dueAt) < now + 7 * 864e5)
      .slice(0, 3).forEach((i) => { i.manualDone = true; i.doneOn = today; });
  }
  window.__store = store;
  const listeners = [];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  window.browser = {
    storage: {
      local: {
        get: async () => clone(store),
        set: async (o) => { Object.assign(store, clone(o)); setTimeout(() => listeners.forEach((l) => l(o, 'local')), 0); },
        clear: async () => { for (const k of Object.keys(store)) delete store[k]; },
      },
      session: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: { getURL: (p) => `/${p}`, id: 'test', getManifest: () => ({ version: '1.3.0' }) },
    permissions: { contains: async () => !q.has('noaccess'), request: async () => true },
    tabs: { create: async (o) => { (window.__opened ??= []).push(o.url); } },
  };
  // Never call the real Canvas from the harness.
  window.__realFetch = window.fetch.bind(window);
  window.fetch = async () => {
    if (q.has('loginerror')) return new Response('{"status":"unauthenticated"}', { status: 401 });
    throw new TypeError('fetch blocked in harness');
  };
})();
