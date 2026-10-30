// The tour: a few pop-ups pointing at the real page. Loaded only when it runs.
// Steps whose element isn't on screen (e.g. the sidebar on a narrow window) are skipped.
import { save } from '../storage/store.js';
import { el } from './dom.js';
import { app } from './app.js';

const STEPS = [
  ['.day-tabs', 'Your week', 'One tab per day with its items and time. In the bar, the tint is planned and the solid part is done.'],
  ['.item.up-next', 'Up next', 'The most urgent thing today. Work through today\'s list from the top.'],
  ['.day .item input[type=checkbox]', 'Check it off', 'When you finish something, check it. You can log how long it took; Stats learns your pace from that.'],
  ['.day .item-menu summary', 'The ⋮ menu', 'Move an item to another day, pin it to its due day, split it across days, or dismiss it.'],
  ['.subtitle-row .target', 'Finish by', 'The day you aim to have the week\'s work done. − and + give you a day less or more.'],
  ['[data-key="nav-next"]', 'Next week', 'See what\'s coming. When this week is done, pull work forward from there.'],
  ['.panel.forecast', 'What\'s due', 'How much is due each day for the next two weeks, so nothing sneaks up on you.'],
  ['[data-key="add-task"]', 'Your own tasks', 'Add things Canvas doesn\'t track, like studying for a midterm, to any class.'],
  ['.side-sync', 'Sync', 'Pulls your assignments from Canvas. It also happens on its own when you visit Canvas.'],
  ['[data-key="nav-settings"]', 'Settings', 'Your hours each day, how long things take, and themes. You can replay this tour from Settings → General.'],
];

function visible(node) {
  if (!node) return false;
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
}

function markToured() {
  app.touring = false;
  app.state.onboarding = { ...app.state.onboarding, toured: true };
  save({ onboarding: app.state.onboarding }).catch(() => {});
}

export function startTour() {
  const steps = STEPS.filter(([sel]) => visible(document.querySelector(sel)));
  if (!steps.length) return markToured();
  let i = 0;
  const spot = el('div', { className: 'tour-spot' });
  const title = el('h2', { id: 'tour-title' });
  const text = el('p', {});
  const count = el('span', { className: 'muted', 'data-key': 'tour-count' });
  const back = el('button', { 'data-key': 'tour-back', onclick: () => go(i - 1) }, 'Back');
  const next = el('button', { className: 'primary', 'data-key': 'tour-next', onclick: () => (i === steps.length - 1 ? finish() : go(i + 1)) });
  const card = el('div', { className: 'tour-card', role: 'dialog', 'aria-labelledby': 'tour-title', 'aria-live': 'polite' },
    title, text,
    el('div', { className: 'tour-buttons' }, count, el('span', { className: 'spacer' }),
      el('button', { className: 'link', 'data-key': 'tour-skip', onclick: () => finish() }, 'Skip tour'), back, next));
  const layer = el('div', { className: 'tour', 'data-key': 'tour' }, spot, card);
  document.body.append(layer);

  function place() {
    const target = document.querySelector(steps[i][0]);
    if (!target) return;
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const below = r.bottom + 14 + card.offsetHeight < innerHeight;
    card.style.top = `${below ? r.bottom + 14 : Math.max(12, r.top - 14 - card.offsetHeight)}px`;
    card.style.left = `${Math.min(Math.max(12, r.left), innerWidth - card.offsetWidth - 12)}px`;
  }
  function go(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const [sel, heading, body] = steps[i];
    title.textContent = heading;
    text.textContent = body;
    count.textContent = `${i + 1} of ${steps.length}`;
    back.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? 'Done' : 'Next';
    document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    place();
    next.focus();
  }
  const onKey = (e) => {
    if (e.key === 'Escape') finish();
    if (e.key === 'ArrowRight') next.click();
    if (e.key === 'ArrowLeft' && !back.disabled) back.click();
  };
  addEventListener('resize', place);
  addEventListener('scroll', place, true);
  document.addEventListener('keydown', onKey);
  go(0);

  function finish() {
    layer.remove();
    removeEventListener('resize', place);
    removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
    markToured();
  }
}
