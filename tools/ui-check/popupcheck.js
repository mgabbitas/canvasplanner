// Clicks through the toolbar popup and POSTs a report to the check server (run.mjs).
const report = { steps: [], errors: [] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $$ = (sel) => [...document.querySelectorAll(sel)];
function check(name, ok, detail = '') { report.steps.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); }
const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));

async function run() {
  for (let i = 0; i < 100 && !document.querySelector('.popup-head'); i++) await wait(30);
  const rows = $$('.popup-item');
  check('popup lists today', rows.length > 0, `${rows.length} items`);
  check('popup count', /\d+ left/.test(document.querySelector('[data-key="popup-count"]')?.textContent ?? ''),
    document.querySelector('[data-key="popup-count"]')?.textContent);
  check('popup items colored by class', rows.every((r) => r.style.getPropertyValue('--course')));
  check('popup due labels', rows.every((r) => /due|overdue/.test(r.querySelector('.popup-sub')?.textContent ?? '')),
    rows[0]?.querySelector('.popup-sub')?.textContent);

  const box = document.querySelector('.popup-item input[type=checkbox]');
  const id = box.getAttribute('data-key').replace('done-', '');
  box.checked = true; fire(box, 'change'); await wait(250);
  const saved = window.__store.items[id];
  check('popup check saves like the page', saved?.manualDone === true && /^\d{4}-\d{2}-\d{2}$/.test(saved?.doneOn ?? ''), JSON.stringify({ m: saved?.manualDone, d: saved?.doneOn }));
  check('checked item stays listed', $$('.popup-item').length === rows.length && !!document.querySelector('.popup-item.done'));
  check('done today counted', /done today/.test(document.querySelector('[data-key="popup-count"]')?.textContent ?? ''));
  const again = document.querySelector(`[data-key="done-${id}"]`);
  again.checked = false; fire(again, 'change'); await wait(250);
  check('popup uncheck restores', window.__store.items[id]?.manualDone === false && window.__store.items[id]?.doneOn === null);

  window.close = () => { window.__closed = true; }; // keep the test window open
  document.querySelector('[data-key="open-planner"]').click(); await wait(100);
  check('open planner', (window.__opened ?? []).some((u) => u.includes('src/ui/planner.html')) && window.__closed, (window.__opened ?? []).join());
}
run().catch((e) => report.errors.push(`harness: ${e.stack}`)).finally(() => {
  report.errors = [...new Set([...report.errors, ...window.__errors])];
  window.__realFetch('/report', { method: 'POST', body: JSON.stringify(report) });
});
