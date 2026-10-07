// Clicks through the app and POSTs a report to the check server (tools/ui-check/run.mjs).
const report = { steps: [], errors: [] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(sel, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const n = document.querySelector(sel); if (n) return n; await wait(30); }
  return null;
}
const $$ = (sel) => [...document.querySelectorAll(sel)];
function check(name, ok, detail = '') { report.steps.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); }
const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
async function go(hash) { location.hash = hash; await wait(250); }

async function runEmpty() {
  await waitFor('.welcome');
  check('welcome shown', !!document.querySelector('.welcome'));
  await wait(400); // the automatic first sync fails offline
  check('welcome shows offline error', /Couldn't reach Canvas/.test(document.querySelector('.welcome')?.textContent ?? ''));
  check('welcome sync button', !!document.querySelector('[data-key="welcome-sync"]'));
  report.errors = window.__errors;
}

async function run() {
  if (new URLSearchParams(location.search).has('empty')) return runEmpty();
  await waitFor('.day-tab');
  await wait(300);
  check('day tabs render', $$('.day-tab').length >= 2, `${$$('.day-tab').length} tabs`);
  check('week tab first', $$('.day-tab')[0]?.textContent.startsWith('Week'));
  check('header shows today count', /Today: \d+ items?/.test(document.querySelector('#header')?.textContent ?? ''), document.querySelector('.subtitle')?.textContent);
  check('sidebar nav', $$('.nav-link').length === 4);
  check('class legend', $$('.legend li').length > 0, `${$$('.legend li').length} classes`);
  check('rail forecast', !!document.querySelector('#rail .forecast'));
  check('class groups', $$('.class-group').length > 0, `${$$('.class-group').length} groups`);

  document.querySelector('[data-key="daytab-week"]').click(); await wait(150);
  check('week tab shows all days', $$('.day').length === $$('.day-tab').length - 1, `${$$('.day').length} days`);
  const firstDay = $$('.day-tab')[1]; firstDay.click(); await wait(150);
  check('day tab shows one day', $$('.day').length === 1);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(150);
  check('arrow key moves tab', document.querySelector('.day-tab.active') !== null && document.querySelector('.day-tab.active') !== $$('.day-tab')[1]);
  document.querySelector('[data-key="daytab-week"]').click(); await wait(150);

  // Check off, undo.
  const box = document.querySelector('.day .item input[type=checkbox]:not(:disabled)');
  const id = box?.getAttribute('data-key')?.replace('done-', '');
  box.checked = true; fire(box, 'change'); await wait(200);
  check('check-off toast', !!document.querySelector('.toast'), document.querySelector('.toast-msg')?.textContent);
  check('item marked done', window.__store.items[id]?.manualDone === true);
  document.querySelector('[data-key="toast-Undo"]')?.click(); await wait(200);
  check('undo restores', window.__store.items[id]?.manualDone === false && !document.querySelector('.toast'));

  // Check off, log time.
  const box2 = document.querySelector(`[data-key="done-${id}"]`);
  box2.checked = true; fire(box2, 'change'); await wait(200);
  document.querySelector('[data-key="toast-Log time"]')?.click(); await wait(100);
  const minutes = document.querySelector('.log-minutes');
  check('log form opens', !!minutes);
  minutes.value = '30';
  const slider = document.querySelector('.log-diff'); slider.value = '4'; fire(slider, 'input');
  document.querySelector('.log-form').requestSubmit(); await wait(250);
  check('log saved', window.__store.items[id]?.log?.minutes === 30 && window.__store.items[id]?.log?.difficulty === 4, JSON.stringify(window.__store.items[id]?.log));
  check('check-off records the day', /^\d{4}-\d{2}-\d{2}$/.test(window.__store.items[id]?.doneOn ?? ''));
  check('header shows done today', /✓ \d+ done/.test(document.querySelector('[data-key="done-today"]')?.textContent ?? ''), document.querySelector('[data-key="done-today"]')?.textContent);

  // Minutes dropdown, in-class.
  const sel = document.querySelector('.day select.chip.size');
  const sid = sel.getAttribute('data-key').replace('minutes-', '');
  sel.value = '60'; fire(sel, 'change'); await wait(200);
  check('minutes override', window.__store.items[sid]?.minutesOverride === 60);
  const sel2 = document.querySelector(`[data-key="minutes-${sid}"]`);
  sel2.value = 'inclass'; fire(sel2, 'change'); await wait(200);
  check('in class', window.__store.items[sid]?.inClass === true && window.__store.items[sid]?.minutesOverride === null);

  // Item menu: open, outside click closes, move to another day, back, pin.
  const menuOf = (iid) => document.querySelector(`[data-key="menu-${iid}"]`)?.parentElement;
  const move = document.querySelector('.day .item-menu [data-key^="move-"]:not(:disabled)');
  const mid = move?.getAttribute('data-key').split('-')[1];
  const mdate = move?.getAttribute('data-key').split('-').slice(2).join('-');
  menuOf(mid)?.querySelector('summary').click(); await wait(50);
  check('menu opens', menuOf(mid)?.open === true);
  document.querySelector('#header').click(); await wait(50);
  check('outside click closes menu', menuOf(mid)?.open === false);
  menuOf(mid).querySelector('summary').click(); await wait(50);
  document.querySelector(`[data-key="move-${mid}-${mdate}"]`)?.click(); await wait(250);
  check('move to a day', window.__store.items[mid]?.plannedOn === mdate, `${mid} -> ${mdate}`);
  document.querySelector(`[data-key="daytab-${mdate}"]`)?.click(); await wait(150);
  check('moved item on that day', !!document.querySelector(`.day [data-key="done-${mid}"]`) && /moved/.test(document.querySelector(`[data-key="done-${mid}"]`)?.closest('.item')?.textContent ?? ''));
  document.querySelector('[data-key="daytab-week"]').click(); await wait(150);
  menuOf(mid).querySelector('summary').click(); await wait(50);
  document.querySelector(`[data-key="unmove-${mid}"]`)?.click(); await wait(250);
  check('let the planner decide', window.__store.items[mid]?.plannedOn === null);
  const pin = document.querySelector('.day .item-menu [data-key^="pin-"]');
  const pid = pin.getAttribute('data-key').replace('pin-', '');
  pin.click(); await wait(200);
  check('pin', window.__store.items[pid]?.pinned === true);

  // Day capacity edit.
  const cap = document.querySelector('button.cap');
  const capDate = cap.getAttribute('data-key').replace('cap-', '');
  cap.click(); await wait(100);
  const capInput = document.querySelector('.cap-input');
  capInput.value = '45'; capInput.blur(); await wait(250);
  const ws = Object.values(window.__store.weekState ?? {}).find((w) => w.capacity?.[capDate] != null);
  check('day capacity override', ws?.capacity?.[capDate] === 45);
  const add = document.querySelector('[data-key="add-day"]');
  if (!add.disabled) { add.click(); await wait(200); check('add a day', Object.values(window.__store.weekState).some((w) => w.extraDays >= 1)); }

  // Next week.
  await go('#next');
  check('next: pull card', !!document.querySelector('#rail .pullcard'));
  check('next: day tabs', $$('.day-tab').length >= 2);
  check('next: pull buttons', $$('[data-key^="pull-"]').length > 0);

  // Stats.
  await go('#stats');
  check('stats: cards', !!document.querySelector('.stat-cards'));
  check('stats: tables', $$('.stat-table').length === 2);
  const order = $$('.panel.stats h2').map((h) => h.textContent);
  check('stats: suggestions after weekday', order.indexOf('Suggested estimate rules') > order.indexOf('By day you finished'), order.join(' | '));

  // Settings tabs.
  for (const tab of ['schedule', 'estimates', 'classes', 'appearance', 'behavior', 'data']) {
    await go(`#settings/${tab}`);
    check(`settings/${tab}`, $$('.panel.settings').length > 0 && document.querySelector('nav.subtabs .tab.active')?.getAttribute('href') === `#settings/${tab}`);
  }
  await go('#settings/appearance');
  document.querySelector('[data-key="theme-dark"]').click(); await wait(200);
  check('theme dark', document.documentElement.dataset.theme === 'dark');
  document.querySelector('[data-key="accent-teal"]').click(); await wait(200);
  check('accent teal', document.documentElement.dataset.accent === 'teal');
  await go('#settings/estimates');
  const rulesBefore = JSON.stringify(window.__store.settings.estimateRules);
  document.querySelector('[data-key="r0-del"]').click(); await wait(200);
  check('delete rule', window.__store.settings.estimateRules.length === JSON.parse(rulesBefore).length - 1, document.querySelector('.toast-msg')?.textContent);
  document.querySelector('[data-key="toast-Undo"]')?.click(); await wait(200);
  check('undo rule delete', JSON.stringify(window.__store.settings.estimateRules) === rulesBefore);
  document.querySelector('[data-key="add-rule"]').click(); await wait(150);
  check('add rule shows incomplete row', !!document.querySelector('.rule.incomplete'));
  await go('#settings/classes');
  const sw = document.querySelector('ul.courses .swatch:not(.on)');
  sw.click(); await wait(200);
  check('class color pick', Object.values(window.__store.settings.courses).some((c) => c.color));

  // Turn the pull gate off, then pull an item and send it back.
  await go('#settings/behavior');
  const gate = document.querySelector('[data-key="gatePullOnCompletion"]');
  gate.checked = false; fire(gate, 'change'); await wait(200);
  check('gate off', window.__store.settings.gatePullOnCompletion === false);
  await go('#next');
  const pullBtn = document.querySelector('.day [data-key^="pull-"]:not([disabled])');
  const pulledId = pullBtn?.getAttribute('data-key').replace('pull-', '');
  pullBtn?.click(); await wait(200);
  check('pull single item', window.__store.items[pulledId]?.pulledIn === true, pulledId);
  await go('');
  document.querySelector('[data-key="daytab-week"]').click(); await wait(150);
  const back = document.querySelector(`[data-key="back-${pulledId}"]`);
  check('pulled item in this week', !!back);
  back?.click(); await wait(200);
  check('send back', window.__store.items[pulledId]?.pulledIn === false);

  // Dismiss any item: undo from the toast, then dismiss again and restore from the right column.
  const dismiss = document.querySelector('.day [data-key^="dismiss-"]');
  check('dismiss on any item', !!dismiss);
  if (dismiss) {
    const did = dismiss.getAttribute('data-key').replace('dismiss-', '');
    dismiss.click(); await wait(200);
    check('dismiss', window.__store.items[did]?.dismissed === true);
    document.querySelector('[data-key="toast-Undo"]')?.click(); await wait(200);
    check('dismiss undo', window.__store.items[did]?.dismissed === false);
    document.querySelector(`[data-key="dismiss-${did}"]`)?.click(); await wait(200);
    const restore = document.querySelector(`#rail [data-key="restore-${did}"]`);
    check('dismissed panel in rail', !!restore);
    restore?.click(); await wait(200);
    check('restore', window.__store.items[did]?.dismissed === false);
  }

  // Finish all of today's homework: nothing refills today, and the get-ahead button moves one item in.
  const todayTab = document.querySelector('.day-tab:not(.week)');
  todayTab.click(); await wait(150);
  for (let i = 0; i < 60; i++) {
    const b = document.querySelector('.day .item:not(.done) input[type=checkbox]:not(:disabled)');
    if (!b || /in class/.test(b.closest('.item').textContent)) break;
    b.checked = true; fire(b, 'change'); await wait(120);
  }
  const ahead = document.querySelector('[data-key="ahead"]');
  check('today stays done (no refill)', /0 items/.test(document.querySelector('.day-tab:not(.week)')?.textContent ?? ''), document.querySelector('.day-tab:not(.week)')?.textContent);
  check('get-ahead button', !!ahead, ahead?.textContent);
  if (ahead) {
    const before = Object.values(window.__store.items).filter((it) => it.plannedOn).length;
    ahead.click(); await wait(250);
    check('get-ahead moves one item to today', Object.values(window.__store.items).filter((it) => it.plannedOn).length === before + 1
      && document.querySelectorAll('.day .item input[type=checkbox]:not(:disabled)').length >= 1);
  }
  document.querySelector('[data-key="daytab-week"]').click(); await wait(150);

  // Menu button opens and Escape closes the sidebar.
  document.querySelector('[data-key="menu"]').click(); await wait(100);
  check('menu opens', document.getElementById('app').classList.contains('nav-open'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
  check('escape closes menu', !document.getElementById('app').classList.contains('nav-open'));

  // Sync while offline: plain-language error, nothing changed.
  const before = Object.keys(window.__store.items).length;
  document.querySelector('[data-key="sync"]').click(); await wait(400);
  check('offline sync message', /Couldn't reach Canvas/.test(document.querySelector('.sync-status')?.textContent ?? ''), document.querySelector('.sync-status')?.textContent);
  check('offline sync keeps data', Object.keys(window.__store.items).length === before);

  await go('');
  check('back to this week', $$('.day-tab').length >= 2);
  report.errors = window.__errors;
}

run().catch((e) => report.errors.push(`harness: ${e.stack}`)).finally(() => {
  report.errors = [...new Set([...report.errors, ...window.__errors])];
  window.__realFetch('/report', { method: 'POST', body: JSON.stringify(report) });
});
