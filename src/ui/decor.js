// Falling snow (Christmas) and the occasional falling leaf (Fall, Thanksgiving): a fixed
// layer of small shapes moved by CSS animations. Never shown with reduced motion,
// never catches clicks, and rebuilt only when the look changes.

const KINDS = { christmas: 'snow', fall: 'leaves', thanksgiving: 'leaves' };
const COUNT = { snow: 28, leaves: 7 };
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const between = (a, b) => a + Math.random() * (b - a);

let shown = null; // the kind currently on screen

export function updateDecorations(look, settings) {
  const kind = settings.decorations && !reducedMotion() ? KINDS[look] ?? null : null;
  if (kind === shown) return;
  shown = kind;
  document.getElementById('decor')?.remove();
  if (!kind) return;
  const layer = document.createElement('div');
  layer.id = 'decor';
  layer.className = `decor ${kind}`;
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < COUNT[kind]; i++) {
    const p = document.createElement('span');
    // Leaves are few and slow, with long gaps, so one drifts by now and then.
    const duration = kind === 'snow' ? between(9, 18) : between(14, 22);
    const delay = kind === 'snow' ? -between(0, 18) : between(0, 40);
    p.style.cssText = `left:${between(0, 100).toFixed(1)}%;animation-duration:${duration.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s;`
      + `--size:${(kind === 'snow' ? between(3, 7) : between(12, 18)).toFixed(1)}px;--sway:${between(-40, 40).toFixed(0)}px;--hue:${i % 3}`;
    layer.append(p);
  }
  document.body.append(layer);
}
