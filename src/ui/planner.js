// New-tab planner page. Views by URL hash: '' this week, #next, #stats, #settings[/tab].
// All Canvas text goes in via textContent (see dom.js), never innerHTML. The pieces
// live in app.js (state), shell.js, week.js, items.js, settings.js and statsview.js.
import { plan, planNextWeek } from '../planner/plan.js';
import { loadState } from '../storage/store.js';
import { el } from './dom.js';
import { renderSettings, resetSettingsDraft } from './settings.js';
import { renderStats } from './statsview.js';
import { renderClass, emptyClassFilter } from './classview.js';
import { applyTheme } from './theme.js';
import { app, view, settingsTab, classId, saveState, sync, courseName } from './app.js';
import { finishDay, openLog, panel } from './items.js';
import { setNavOpen, renderSidebar, renderHeader, renderWelcome } from './shell.js';
import { renderBanners, renderPullCard, renderForecast, renderDayLayout, renderExams } from './week.js';

// --- settings view hooks ---------------------------------------------------------

const settingsContext = () => ({
  state: app.state,
  saveState,
  render,
  tab: settingsTab(),
  afterClear: async () => {
    app.state = await loadState();
    app.syncMessage = null;
    location.hash = '';
    render();
    sync();
  },
});

// --- render ------------------------------------------------------------------------

// Every module redraws through app.render().
app.render = render;

function render() {
  if (!app.state) return;
  // Re-rendering replaces the DOM; put keyboard focus back where it was.
  const focusKey = document.activeElement?.getAttribute?.('data-key');

  const args = { items: app.state.items, settings: app.state.settings, weekState: app.state.weekState, now: Date.now() };
  app.thisWeekPlan = plan(args);
  const v = view();
  const p = v === 'next' ? planNextWeek(args) : app.thisWeekPlan;

  const $ = (id) => document.getElementById(id);
  applyTheme(app.state.settings);
  $('sidebar').replaceChildren(...renderSidebar().filter(Boolean));
  $('header').replaceChildren(...renderHeader(p).filter(Boolean));
  const fill = (id, nodes) => $(id).replaceChildren(...nodes.filter(Boolean));
  const days = (kind) => renderDayLayout(p, kind);
  let rail = [];
  if (v === 'settings') {
    fill('banners', []);
    fill('days', renderSettings(settingsContext()));
    fill('extras', []);
  } else if (v === 'stats') {
    fill('banners', []);
    fill('days', renderStats({ state: app.state, saveState, courseName, finishDay, openLog: (i) => openLog(i) }));
    fill('extras', []);
  } else if (v === 'class') {
    fill('banners', []);
    fill('days', renderClass(classId()));
    fill('extras', []);
  } else if (!app.state.meta.lastSyncAt && !Object.keys(app.state.items).length) {
    fill('banners', []);
    fill('days', [renderWelcome()]);
    fill('extras', []);
  } else if (v === 'next') {
    fill('banners', renderBanners(p));
    fill('days', days('next'));
    fill('extras', [panel("Won't fit by next week's target day", p.overflow, 'next', true)]);
    rail = [renderPullCard(), renderForecast(app.thisWeekPlan), renderExams(p, 'next week')];
  } else {
    fill('banners', renderBanners(p));
    fill('days', days('plan'));
    fill('extras', [
      panel("Won't fit by the target day", p.overflow, 'plan', true),
      panel('At risk', p.atRisk, 'plan', true),
      panel('Done this week', p.done, 'done', false, (() => {
        const n = p.done.filter((e) => !e.item.log && !e.inClass).length;
        return n ? `${n} need${n === 1 ? 's' : ''} a time` : '';
      })()),
    ]);
    rail = [
      renderForecast(p),
      renderExams(p, 'this week'),
      panel('No due date', p.noDueDate, 'plan'),
      panel('Dismissed', p.dismissed, 'dismissed'),
    ];
  }
  fill('rail', rail);
  $('content').classList.toggle('no-rail', !rail.filter(Boolean).length);
  const focused = focusKey ? document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`) : null;
  focused?.focus();
  // Typing in a filter re-renders; keep the caret at the end.
  if (focused?.type === 'search') focused.setSelectionRange(focused.value.length, focused.value.length);
}

// --- startup -----------------------------------------------------------------------

async function init() {
  app.state = await loadState();
  render();
  // Opened by the background script after a Canvas visit (?sync=1): always sync.
  const forced = new URLSearchParams(location.search).has('sync');
  if (forced) history.replaceState(null, '', location.pathname + location.hash);
  const last = app.state.meta.lastSyncAt ? Date.parse(app.state.meta.lastSyncAt) : 0;
  if (forced || Date.now() - last > app.state.settings.autoSyncMinutes * 60_000) await sync();
}

document.getElementById('scrim').addEventListener('click', () => setNavOpen(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.navOpen) setNavOpen(false); });

// Item ⋮ menus: one open at a time; a click outside or Escape closes it.
const openMenus = () => document.querySelectorAll('details.item-menu[open]');
document.addEventListener('click', (e) => {
  for (const m of openMenus()) if (!m.contains(e.target)) m.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const m of openMenus()) { m.open = false; m.querySelector('summary').focus(); }
});

window.addEventListener('hashchange', () => {
  if (view() !== 'settings') resetSettingsDraft(); // keep unsaved rules across settings tabs
  app.editingDay = null;
  app.selectedDay = null;
  app.classFilter = emptyClassFilter();
  render();
});

// Another tab changed something: reload and redraw.
browser.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== 'local' || app.syncing || app.editingDay) return;
  app.state = await loadState();
  render();
});

init().catch((e) => {
  document.getElementById('banners').replaceChildren(el('div', { className: 'banner bad' }, `Failed to load: ${e.message}`));
});
