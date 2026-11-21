// The one-time review invite (1.7): a line under the check-off toast once you've used
// the planner for a while. Shown once ever: link, No thanks or letting it fade all count.
import { reviewInviteDue } from '../planner/ahead.js';
import { toLocalDate } from '../planner/dates.js';
import { validateSettings } from '../storage/schema.js';
import { el } from './dom.js';
import { addToToast } from './toast.js';
import { app, saveState } from './app.js';

const STORE_PAGE = {
  firefox: 'https://addons.mozilla.org/firefox/addon/planner-for-canvas/',
  chrome: 'https://chromewebstore.google.com/detail/planner-for-canvas/fmcaoocclnfmadbecebgjhhgmnbiahho',
};

/** After a check-off: add the invite to the open toast, if it's time. */
export function maybeInviteReview() {
  const s = app.state.settings;
  if (s.reviewAsked || !s.funMessages) return;
  if (!reviewInviteDue(Object.values(app.state.items), toLocalDate(Date.now()))) return;
  const line = el('div', { className: 'toast-review', 'data-key': 'review-invite' },
    el('span', {}, 'Finding the planner useful? A short review helps other students find it.'),
    el('a', {
      href: location.protocol === 'moz-extension:' ? STORE_PAGE.firefox : STORE_PAGE.chrome,
      target: '_blank', rel: 'noopener noreferrer', 'data-key': 'review-link', onclick: () => line.remove(),
    }, 'Leave a review'),
    el('button', { 'data-key': 'review-no', onclick: () => line.remove() }, 'No thanks'));
  if (!addToToast(line)) return;
  saveState({ settings: validateSettings({ ...s, reviewAsked: true }, s) });
}
