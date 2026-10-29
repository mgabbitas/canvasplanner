// Background: when you visit Canvas, open the planner (first visit per browser
// session) or sync quietly if the data is stale. Also keeps the toolbar badge (today's
// remaining homework) up to date.
import { loadState } from './storage/store.js';
import { runSync } from './sync/run.js';
import { CANVAS } from './sync/canvas.js';
import { todaySummary, badgeText } from './planner/today.js';

let syncing = false;

browser.runtime.onMessage.addListener(async (msg, sender) => {
  // Only our own content script, only from a Canvas page.
  if (msg?.type !== 'canvas-visit' || sender.id !== browser.runtime.id) return;
  if (!String(sender.url ?? '').startsWith(CANVAS + '/')) return;

  const { settings, meta } = await loadState();
  if (settings.openOnCanvasVisit) {
    const { openedThisSession } = await browser.storage.session.get('openedThisSession');
    if (!openedThisSession) {
      await browser.storage.session.set({ openedThisSession: true });
      // The page syncs on open when it sees ?sync=1.
      await browser.tabs.create({ url: browser.runtime.getURL('src/ui/planner.html?sync=1') });
      return;
    }
  }
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
  const text = state.meta.lastSyncAt
    ? badgeText(todaySummary({ items: state.items, settings: state.settings, weekState: state.weekState, now: Date.now() }))
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
