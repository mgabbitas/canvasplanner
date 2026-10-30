// One toast at a time, bottom of the page (like Gmail's "Undo"). It closes itself
// after a while, but never while the mouse or keyboard focus is on it.
import { el } from './dom.js';

let current = null;

export function closeToast() {
  if (!current) return;
  clearTimeout(current.timer);
  current.node.remove();
  current = null;
}

/**
 * showToast({ message, actions: [{ label, onclick }], duration })
 * Returns { setContent(nodes), close() }. setContent stops the auto-close timer.
 */
export function showToast({ message, actions = [], duration = 10_000 }) {
  closeToast();
  const region = document.getElementById('toasts');
  const body = el('div', { className: 'toast-body' },
    el('span', { className: 'toast-msg' }, message),
    actions.map((a) => el('button', { onclick: a.onclick, 'data-key': `toast-${a.label}` }, a.label)),
    el('button', { className: 'toast-close', 'aria-label': 'Close', onclick: closeToast }, '✕'),
  );
  const node = el('div', { className: 'toast' }, body); // #toasts is the live region
  const toast = { node, timer: null, sticky: false };
  const start = () => {
    clearTimeout(toast.timer);
    if (!toast.sticky) toast.timer = setTimeout(() => current === toast && closeToast(), duration);
  };
  node.addEventListener('mouseenter', () => clearTimeout(toast.timer));
  node.addEventListener('mouseleave', start);
  node.addEventListener('focusin', () => clearTimeout(toast.timer));
  node.addEventListener('focusout', (e) => { if (!node.contains(e.relatedTarget)) start(); });
  region.append(node);
  current = toast;
  start();
  return {
    setContent(...children) {
      toast.sticky = true;
      clearTimeout(toast.timer);
      body.replaceChildren(...children.flat());
    },
    close: () => current === toast && closeToast(),
  };
}

/** A cheerful line: added on top of the open toast (keeping its Undo), else a toast of its own. */
export function celebrate(text) {
  if (current) {
    current.node.querySelector('.toast-celebrate')?.remove();
    current.node.prepend(el('div', { className: 'toast-celebrate', 'data-key': 'celebrate' }, text));
    return;
  }
  showToast({ message: text, duration: 6000 });
}

const DIFFICULTY_WORDS = ['', 'very easy', 'easy', 'medium', 'hard', 'very hard'];

/**
 * Time + difficulty form. Both optional; difficulty only counts once you move it.
 * onSave({ minutes, difficulty }) / onCancel().
 */
export function logForm({ title, minutes, difficulty, onSave, onCancel }) {
  let touched = difficulty != null;
  const minutesInput = el('input', {
    // step 1: with min 1 a step of 5 would only accept 1, 6, 11... and block Save.
    type: 'number', min: 1, max: 1440, step: 1, value: minutes ?? '', className: 'log-minutes',
    'aria-label': 'Minutes it took', 'data-key': 'log-minutes',
  });
  const value = el('span', { className: 'log-diff-value' }, touched ? `${difficulty} · ${DIFFICULTY_WORDS[difficulty]}` : 'not set');
  const slider = el('input', {
    type: 'range', min: 1, max: 5, step: 1, value: difficulty ?? 3, className: 'log-diff',
    'aria-label': 'Difficulty, 1 very easy to 5 very hard', 'data-key': 'log-diff',
    oninput: (e) => { touched = true; value.textContent = `${e.target.value} · ${DIFFICULTY_WORDS[e.target.value]}`; },
  });
  const save = () => {
    const m = Number(minutesInput.value);
    onSave({
      minutes: Number.isFinite(m) && m > 0 ? Math.round(m) : null,
      difficulty: touched ? Number(slider.value) : null,
    });
  };
  queueMicrotask(() => { minutesInput.focus(); minutesInput.select(); });
  return el('form', {
    className: 'log-form',
    onsubmit: (e) => { e.preventDefault(); save(); },
    onkeydown: (e) => { if (e.key === 'Escape') onCancel(); },
  },
    el('div', { className: 'log-title' }, `How did "${title}" go?`),
    el('label', {}, 'Time ', minutesInput, ' min'),
    el('label', { className: 'log-diff-label' }, 'Difficulty ', el('span', { className: 'muted' }, 'easy'), slider, el('span', { className: 'muted' }, 'hard'), value),
    el('div', { className: 'log-buttons' },
      el('button', { type: 'submit', className: 'primary' }, 'Save'),
      el('button', { type: 'button', onclick: onCancel }, 'Skip'),
    ),
  );
}
