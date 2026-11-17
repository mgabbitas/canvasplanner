// Falling snow (Christmas) and leaves (Fall, Thanksgiving): a fixed layer of small shapes
// moved by CSS animations, behind the page's panels so it only shows in open
// background. Never shown with reduced motion, never catches clicks, and rebuilt only
// when the look or the amount changes.

const KINDS = { christmas: 'snow', fall: 'leaves', thanksgiving: 'leaves' };
// Shapes on screen for Effects: off, light, normal, lots.
const COUNT = { snow: [0, 35, 65, 110], leaves: [0, 4, 9, 16] };
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const between = (a, b) => a + Math.random() * (b - a);

let shown = null; // "kind-count" currently on screen

// --- pause when idle -----------------------------------------------------------------
// A planner tab left open shouldn't keep animating: after a minute with no mouse,
// keyboard or scrolling (or while the tab is hidden) the page gets data-idle, which
// pauses the falling shapes and the holiday splash in CSS. Any input resumes them.
const IDLE_MS = 60_000;
let lastActive = 0;
let idleTimer = null;

function setIdle(idle) {
  const root = document.documentElement;
  if (idle) root.dataset.idle = '';
  else delete root.dataset.idle;
}

function checkIdle() {
  idleTimer = null;
  const left = lastActive + IDLE_MS - Date.now();
  if (left > 0) idleTimer = setTimeout(checkIdle, left); // input since the timer was set
  else setIdle(true);
}

function active() {
  lastActive = Date.now(); // cheap: mousemove only stores the time
  if (idleTimer) return;
  setIdle(false);
  idleTimer = setTimeout(checkIdle, IDLE_MS);
}

/** Start watching for idle (once, at startup). */
export function watchIdle() {
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'focus']) {
    addEventListener(type, active, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(idleTimer);
      idleTimer = null;
      setIdle(true);
    } else active();
  });
  active();
}

// Christmas Day: more snow than the rest of December (still off when Effects is Off).
const HOLIDAY_EXTRA = { christmasday: 1.7 };

export function updateDecorations(look, settings, holiday = null) {
  const kind = reducedMotion() ? null : KINDS[look] ?? null;
  const count = kind ? Math.round((COUNT[kind][settings.effects] ?? 0) * (HOLIDAY_EXTRA[holiday] ?? 1)) : 0;
  const key = count ? `${kind}-${count}` : null;
  if (key === shown) return;
  shown = key;
  document.getElementById('decor')?.remove();
  if (!key) return;
  const layer = document.createElement('div');
  layer.id = 'decor';
  layer.className = `decor ${kind}`;
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    let size, duration, delay;
    if (kind === 'snow') {
      // Near flakes are bigger and faster, far ones small and slow: reads as depth.
      const near = Math.random();
      size = 2 + near * 6;
      duration = 16 - near * 8 + between(-1.5, 1.5);
      delay = -between(0, duration); // already falling when the page opens
      p.style.opacity = (0.45 + near * 0.5).toFixed(2);
    } else {
      // Few and slow, with long gaps, so leaves drift by now and then.
      size = between(12, 18);
      duration = between(14, 22);
      delay = between(-duration, 30);
    }
    p.style.left = `${between(-2, 100).toFixed(1)}%`;
    p.style.animationDuration = `${duration.toFixed(1)}s`;
    p.style.animationDelay = `${delay.toFixed(1)}s`;
    p.style.setProperty('--size', `${size.toFixed(1)}px`);
    p.style.setProperty('--sway', `${between(-60, 60).toFixed(0)}px`);
    p.dataset.hue = String(i % 3);
    layer.append(p);
  }
  document.body.prepend(layer);
}
