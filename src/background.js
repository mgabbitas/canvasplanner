// Background: when you visit Canvas, open the planner (first visit per browser
// session) or sync quietly if the data is stale. Also keeps the toolbar badge (today's
// remaining homework) up to date.
import './browser.js';
import { loadState } from './storage/store.js';
import { runSync } from './sync/run.js';
import { onSchool, normalizeHost } from './sync/school.js';
import { todaySummary, badgeText } from './planner/today.js';
import { syncSeries } from './planner/tasks.js';
import { toLocalDate } from './planner/dates.js';

let syncing = false;

/** Open the planner, at most once per browser session. Returns whether it opened. */
async function openPlannerOnce(query) {
  const { openedThisSession } = await browser.storage.session.get('openedThisSession');
  if (openedThisSession) return false;
  await browser.storage.session.set({ openedThisSession: true });
  await browser.tabs.create({ url: browser.runtime.getURL(`src/ui/planner.html${query}`) });
  return true;
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  // Only our own content script, only from your school's Canvas.
  if (msg?.type !== 'canvas-visit' || sender.id !== browser.runtime.id) return;
  const { settings, meta, canvas } = await loadState();
  if (!canvas.host) {
    // No school chosen yet: open the planner once with this Canvas filled in to confirm.
    const host = normalizeHost(sender.url);
    if (host && settings.openOnCanvasVisit) await openPlannerOnce(`?school=${encodeURIComponent(host)}`);
    return;
  }
  if (!onSchool(sender.url, canvas.host)) return;
  // The page syncs on open when it sees ?sync=1.
  if (settings.openOnCanvasVisit && await openPlannerOnce('?sync=1')) return;
  const last = meta.lastSyncAt ? Date.parse(meta.lastSyncAt) : 0;
  if (syncing || Date.now() - last <= settings.autoSyncMinutes * 60_000) return;
  syncing = true;
  try {
    await runSync();
  } finally {
    syncing = false;
  }
});

// --- toolbar badge -------------------------------------------------------------------

async function updateBadge() {
  const state = await loadState();
  // Count today's repeat copies even if no page has created them yet (not saved here).
  const items = syncSeries(state.items, state.taskSeries, toLocalDate(Date.now()), state.settings);
  const text = state.meta.lastSyncAt
    ? badgeText(todaySummary({ items, settings: state.settings, weekState: state.weekState, now: Date.now() }))
    : '';
  await browser.action.setBadgeText({ text });
}

// Any saved change (a check-off, a sync, a new day recorded by the planner) can change
// the count; a burst of saves is coalesced into one update.
let badgeTimer = null;
function scheduleBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => updateBadge().catch(() => {}), 200);
}

browser.action.setBadgeBackgroundColor({ color: '#2563c9' });
browser.storage.onChanged.addListener((_changes, area) => { if (area === 'local') scheduleBadge(); });
browser.runtime.onStartup.addListener(scheduleBadge);
browser.runtime.onInstalled.addListener(scheduleBadge);
scheduleBadge();
