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
  const store = new URLSearchParams(location.search).has('empty') ? {} : JSON.parse(xhr.responseText);
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
    runtime: { getURL: (p) => `/${p}`, id: 'test' },
  };
  // Never call the real Canvas from the harness.
  window.__realFetch = window.fetch.bind(window);
  window.fetch = async () => { throw new TypeError('fetch blocked in harness'); };
})();
