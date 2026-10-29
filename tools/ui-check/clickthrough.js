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
  check('header streak counters', $$('#header .streak').length === 2, $$('#header .streak').map((x) => x.textContent).join(' | '));
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  check('today recorded for streak', Array.isArray(window.__store.dayLog?.[todayKey]?.left), JSON.stringify(window.__store.dayLog?.[todayKey]));
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
  // Exams card (depends on today's date, so only when the fixture has one that week).
  document.querySelector('[data-key="daytab-week"]')?.click(); await wait(150);
  const examBtn = document.querySelector('.day [data-key^="exam-"]');
  const examCount = () => $$('#rail .exams li').length;
  if (examBtn && examCount()) {
    const eid = examBtn.getAttribute('data-key').replace('exam-', '');
    const n = examCount();
    examBtn.click(); await wait(200);
    check('not an exam', window.__store.items[eid]?.notExam === true && examCount() === n - 1, `${n} -> ${examCount()}`);
    document.querySelector(`[data-key="exam-${eid}"]`)?.click(); await wait(200);
    check("it's an exam again", window.__store.items[eid]?.notExam === false && examCount() === n);
  } else {
    check('exams card hidden when none', !document.querySelector('#rail .exams'));
  }

  // Class view: open from the sidebar, filter, set all shown, undo.
  const classLink = document.querySelector('.legend-link');
  const cid = classLink.getAttribute('data-key').replace('class-', '');
  classLink.click(); await wait(250);
  check('class view opens', location.hash === `#class/${cid}` && classLink.textContent.trim() === document.querySelector('#header h1')?.textContent.trim(), document.querySelector('#header h1')?.textContent);
  check('class link active', !!document.querySelector(`[data-key="class-${cid}"].active`));
  const rowsAll = $$('#days .item').length;
  check('class view lists items', rowsAll > 0, `${rowsAll} items`);
  const firstTitle = document.querySelector('#days .item .title')?.textContent ?? '';
  const filter = document.querySelector('[data-key="class-filter"]');
  filter.focus(); filter.value = firstTitle.slice(0, 6); fire(filter, 'input'); await wait(150);
  const rowsShown = $$('#days .item').length;
  check('class filter narrows', rowsShown >= 1 && rowsShown <= rowsAll && document.activeElement?.getAttribute('data-key') === 'class-filter', `${rowsShown} of ${rowsAll}`);
  const shownIds = $$('#days .item input[type=checkbox]').map((b) => b.getAttribute('data-key').replace('done-', ''));
  const prevMinutes = shownIds.map((i) => [window.__store.items[i].minutesOverride, window.__store.items[i].inClass]);
  const setTo = document.querySelector('[data-key="class-set-to"]');
  setTo.value = 'inclass'; fire(setTo, 'change'); await wait(100);
  document.querySelector('[data-key="class-apply"]').click(); await wait(250);
  check('set all shown', shownIds.every((i) => window.__store.items[i].inClass === true), document.querySelector('.toast-msg')?.textContent);
  document.querySelector('[data-key="toast-Undo"]')?.click(); await wait(250);
  check('set all undo', shownIds.every((i, n) => window.__store.items[i].minutesOverride === prevMinutes[n][0] && window.__store.items[i].inClass === prevMinutes[n][1]));

  // Stats.
  await go('#stats');
  check('stats: cards', !!document.querySelector('.stat-cards'));
  check('stats: tables', $$('.stat-table').length === 2);
  check('stats: overview first with streaks', $$('.panel.stats h2')[0]?.textContent === 'Overview' && !!document.querySelector('.streak-cards'));
  check('stats: class rows colored', $$('.stat-table')[0]?.querySelector('tbody tr[style*="--course"] .dot') != null);
  check('stats: vs estimate in words', $$('.stat-table .vs').every((v) => /faster|slower|about right/.test(v.textContent)));
  check('stats: 7 weekday columns', $$('ol.wk-cols li').length === 7);
  const order = $$('.panel.stats h2').map((h) => h.textContent);
  check('stats: no suggestions section', !order.includes('Suggested estimate rules'), order.join(' | '));

  // Settings tabs.
  for (const tab of ['week', 'rules', 'classes', 'appearance', 'general', 'data']) {
    await go(`#settings/${tab}`);
    check(`settings/${tab}`, $$('.panel.settings').length > 0 && document.querySelector('nav.subtabs .tab.active')?.getAttribute('href') === `#settings/${tab}`);
  }
  await go('#settings/estimates');
  check('old tab link lands on Rules', document.querySelector('nav.subtabs .tab.active')?.getAttribute('href') === '#settings/rules');

  // Week: day cards.
  await go('#settings/week');
  check('week: 7 day cards', $$('.daycard').length === 7);
  check('week: target card highlighted', $$('.daycard.target').length === 1 && !!document.querySelector('[data-key="day-3"].target'));
  const fri = document.querySelector('[data-key="target-5"]');
  fri.checked = true; fire(fri, 'change'); await wait(200);
  check('week: finish by Friday', window.__store.settings.targetDay === 5 && !!document.querySelector('[data-key="day-5"].target'));
  const thuSlider = document.querySelector('[data-key="cap-4"]');
  thuSlider.value = '150'; fire(thuSlider, 'input');
  check('week: slider label updates live', document.querySelector('[data-key="day-4"] .daycard-hours')?.textContent === '2h 30m',
    document.querySelector('[data-key="day-4"] .daycard-hours')?.textContent);
  fire(thuSlider, 'change'); await wait(200);
  check('week: slider saves', window.__store.settings.capacity[4] === 150);
  const sunOff = document.querySelector('[data-key="block-0"]');
  sunOff.checked = true; fire(sunOff, 'change'); await wait(200);
  check('week: day off greys the card', window.__store.settings.blockedWeekdays.includes(0)
    && !!document.querySelector('[data-key="day-0"].off') && document.querySelector('[data-key="cap-0"]').disabled);
  check('week: advanced closed', !document.querySelector('[data-key="adv-week"]').open);
  await go('#settings/appearance');
  document.querySelector('[data-key="theme-dark"]').click(); await wait(200);
  check('theme dark', document.documentElement.dataset.theme === 'dark');
  document.querySelector('[data-key="accent-teal"]').click(); await wait(200);
  check('accent teal', document.documentElement.dataset.accent === 'teal');
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const plainBg = css('--bg');
  document.querySelector('[data-key="look-ocean"]').click(); await wait(200);
  check('theme ocean', document.documentElement.dataset.look === 'ocean' && css('--bg') !== plainBg && !document.querySelector('[data-key="accent-teal"]'), css('--bg'));
  document.querySelector('[data-key="look-custom"]').click(); await wait(200);
  const pick = document.querySelector('[data-key="customAccent"]');
  pick.value = '#ffff66'; fire(pick, 'change'); await wait(200);
  // The page is in dark mode here, where pale yellow is readable as is; light mode adjusts it, hence the note.
  check('custom accent saved, contrast note', window.__store.settings.customAccent === '#ffff66' && !!document.querySelector('[data-key="contrast-note"]'));
  const holidays = document.querySelector('[data-key="holidayLooks"]');
  holidays.checked = true; fire(holidays, 'change'); await wait(200);
  check('holiday looks on', window.__store.settings.holidayLooks === true);
  document.querySelector('[data-key="look-plain"]').click(); await wait(200);
  check('back to plain', document.documentElement.dataset.look === 'plain' || document.documentElement.dataset.look !== 'custom');
  await go('#settings/rules');
  const rulesBefore = JSON.stringify(window.__store.settings.estimateRules);
  document.querySelector('[data-key="r0-del"]').click(); await wait(200);
  check('delete rule', window.__store.settings.estimateRules.length === JSON.parse(rulesBefore).length - 1, document.querySelector('.toast-msg')?.textContent);
  document.querySelector('[data-key="toast-Undo"]')?.click(); await wait(200);
  check('undo rule delete', JSON.stringify(window.__store.settings.estimateRules) === rulesBefore);
  document.querySelector('[data-key="add-rule"]').click(); await wait(150);
  check('add rule shows incomplete row', !!document.querySelector('.rule.incomplete'));
  check('type defaults on All classes', $$('.type-grid .field').length === 5);
  check('suggestions live on Rules', !!document.querySelector('.suggest-box, .suggest-empty'));
  // Log three quizzes in one class at 90m each, so a rule gets suggested, then apply it.
  {
    const items = structuredClone(window.__store.items);
    const quizzes = Object.values(items).filter((i) => i.type === 'quiz' && !i.log);
    const course = quizzes.find((q) => quizzes.filter((x) => x.courseId === q.courseId).length >= 3)?.courseId;
    for (const q of quizzes.filter((x) => x.courseId === course).slice(0, 3)) {
      items[q.id] = { ...q, manualDone: true, log: { minutes: 90, difficulty: 3, finishedOn: '2026-10-20' } };
    }
    await browser.storage.local.set({ items }); await wait(300);
    const pickAll = document.querySelector('[data-key="rules-class"]');
    pickAll.value = ''; fire(pickAll, 'change'); await wait(150);
    const apply = document.querySelector(`.suggest-box [data-key^="apply-${course}-"]`);
    check('suggestion shown on Rules', !!apply, course);
    apply?.click(); await wait(200);
    const label = apply?.textContent;
    const minutes = Number(label?.match(/(\d+)h/)?.[1] ?? 0) * 60 + Number(label?.match(/(\d+)m/)?.[1] ?? 0);
    check('apply adds the class rule', window.__store.settings.estimateRules.some((r) => r.courseId === course && r.minutes === minutes),
      `${label} → ${JSON.stringify(window.__store.settings.estimateRules.filter((r) => r.courseId === course))}`);
  }
  const typeQuiz = document.querySelector('[data-key="type-quiz"]');
  typeQuiz.value = '30'; fire(typeQuiz, 'change'); await wait(200);
  check('type default saves minutes', window.__store.settings.typeDefaults.quiz === 30);
  // Pick a class: its own card, colored, and new rules belong to it but wait for an edit.
  const classPick = document.querySelector('[data-key="rules-class"]');
  const classId = classPick.options[1].value;
  classPick.value = classId; fire(classPick, 'change'); await wait(150);
  check('class rules card', !!document.querySelector('.rule-card[style*="--course"]') && !document.querySelector('.type-grid'));
  const rulesCount = window.__store.settings.estimateRules.length;
  document.querySelector('[data-key="add-rule"]').click(); await wait(150);
  check('new class rule not saved yet', window.__store.settings.estimateRules.length === rulesCount);
  const newRow = $$('.rule-card .rule').at(-1);
  const kw = newRow.querySelector('input[type=text]');
  kw.value = 'lab'; fire(kw, 'change'); await wait(200);
  const saved = window.__store.settings.estimateRules.at(-1);
  check('class rule saved after edit', window.__store.settings.estimateRules.length === rulesCount + 1
    && saved.courseId === classId && saved.keyword === 'lab' && saved.minutes === 30, JSON.stringify(saved));
  const valuePick = $$('.rule-card .rule').at(-1).querySelector('select[data-key$="-value"]');
  valuePick.value = 'custom'; fire(valuePick, 'change'); await wait(200);
  check('custom time shows a minutes box', !!$$('.rule-card .rule').at(-1).querySelector('input[type=number]'));
  await go('#settings/classes');
  const sw = document.querySelector('ul.courses .swatch:not(.on)');
  sw.click(); await wait(200);
  check('class color pick', Object.values(window.__store.settings.courses).some((c) => c.color));

  // Turn the pull gate off, then pull an item and send it back.
  await go('#settings/general');
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
  for (let i = 0; i < 150; i++) {
    const b = $$('.day .item:not(.done) input[type=checkbox]:not(:disabled)')
      .find((x) => ![...x.closest('.item').querySelectorAll('.chip')].some((c) => c.textContent === 'in class'));
    if (!b) break;
    b.checked = true; fire(b, 'change'); await wait(80);
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
  await checkTasks();
  report.errors = window.__errors;
}

// Your own tasks: add a floating one, edit it, add a repeating one, delete with undo.
async function checkTasks() {
  const tasks = () => Object.values(window.__store.items).filter((i) => i.task);
  const form = () => document.querySelector('dialog.task-dialog');
  const set = (key, value) => { const n = form().querySelector(`[data-key="${key}"]`); n.value = value; fire(n, 'change'); };
  document.querySelector('[data-key="add-task"]').click(); await wait(100);
  check('task form opens', !!form()?.open);
  form().querySelector('[data-key="task-save"]').click(); await wait(100);
  check('task needs a name', !!form()?.open && /name/.test(form().querySelector('[role="alert"]').textContent));
  set('task-title', 'Study for the midterm');
  set('task-minutes', '60');
  form().querySelector('textarea').value = 'Chapters 4-6';
  form().querySelector('[data-key="task-save"]').click(); await wait(250);
  const added = tasks().find((t) => t.title === 'Study for the midterm');
  check('task added', !!added && added.minutesOverride === 60 && added.task.floating && added.task.notes === 'Chapters 4-6' && !form());
  document.querySelector('[data-key="daytab-week"]').click(); await wait(150);
  const row = document.querySelector(`[data-key="task-${added?.id}"]`)?.closest('.item');
  check('task planned this week with tags and notes', !!row && /task/.test(row.textContent) && /this week/.test(row.textContent) && /Chapters 4-6/.test(row.textContent));
  row?.querySelector('.task-title').click(); await wait(100);
  check('task edit form', form()?.querySelector('h2')?.textContent === 'Edit task' && form().querySelector('[data-key="task-title"]').value === 'Study for the midterm');
  set('task-title', 'Study for midterm 2');
  form().querySelector('[data-key="task-save"]').click(); await wait(250);
  check('task edited', window.__store.items[added.id]?.title === 'Study for midterm 2');

  // Repeating, Mon/Wed/Fri: copies appear, each its own item.
  document.querySelector('[data-key="add-task"]').click(); await wait(100);
  set('task-title', 'Physics review');
  const repeat = form().querySelector('[data-key="task-repeat"]');
  repeat.checked = true; fire(repeat, 'change'); await wait(50);
  check('repeat shows days, hides due date', !form().querySelector('.repeat-rows').hidden && form().querySelector('[data-key="task-due"]').closest('.form-row').hidden);
  form().querySelector('[data-key="task-save"]').click(); await wait(100);
  check('repeat needs a day', /day/.test(form().querySelector('[role="alert"]').textContent));
  for (const d of [1, 3, 5]) form().querySelector(`[data-key="task-day-${d}"]`).checked = true;
  form().querySelector('[data-key="task-save"]').click(); await wait(300);
  const seriesId = Object.keys(window.__store.taskSeries ?? {})[0];
  const copies = tasks().filter((t) => t.task.seriesId === seriesId);
  check('repeating task makes copies', !!seriesId && copies.length >= 2 && copies.every((c) => [1, 3, 5].includes(new Date(c.dueAt).getDay())), `${copies.length} copies`);

  // Delete the one-off from its form, then undo.
  document.querySelector(`[data-key="task-${added.id}"]`)?.click(); await wait(100);
  form().querySelector('[data-key="task-delete"]').click(); await wait(250);
  check('task deleted', !window.__store.items[added.id]);
  document.querySelector('[data-key="toast-Undo"]')?.click(); await wait(250);
  check('task delete undo', !!window.__store.items[added.id]);

  // Split the task (1h) into 3 parts: three rows on different days, checked off one at a time.
  document.querySelector('[data-key="daytab-week"]').click(); await wait(150);
  document.querySelector(`[data-key="menu-${added.id}"]`)?.click(); await wait(50);
  document.querySelector(`[data-key="split-${added.id}-3"]`)?.click(); await wait(250);
  check('split saved', window.__store.items[added.id]?.splitParts === 3);
  const partRows = $$(`[data-key^="done-${added.id}#"]`);
  const partDays = partRows.map((b) => b.closest('.day')?.getAttribute('data-date') ?? b.closest('section')?.textContent.slice(0, 12));
  check('three part rows', partRows.length === 3 && /part 1 of 3/.test(partRows[0].closest('.item').textContent), `${partRows.length} rows`);
  partRows[0].checked = true; fire(partRows[0], 'change'); await wait(250);
  check('part checked off', window.__store.items[added.id]?.partsDone?.length === 1 && !window.__store.items[added.id]?.manualDone);
  check('two parts left', $$(`[data-key^="done-${added.id}#"]`).length === 2, partDays.join(' | '));
  document.querySelector('[data-key="toast-Undo"]')?.click(); await wait(250);
  check('part undo', !window.__store.items[added.id]?.partsDone);
}

run().catch((e) => report.errors.push(`harness: ${e.stack}`)).finally(() => {
  report.errors = [...new Set([...report.errors, ...window.__errors])];
  window.__realFetch('/report', { method: 'POST', body: JSON.stringify(report) });
});
