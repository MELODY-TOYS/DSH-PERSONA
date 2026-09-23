import { createLowBubbles } from './bubble-low.mjs';
import { createHighBubbles } from './bubble-high.mjs';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** Owns both renderers; only the current plugin detail can emit and no input is intercepted. */
export function installClickBubbles(owner, preference, {
  signal, getDetail, factories = { low: createLowBubbles, high: createHighBubbles },
} = {}) {
  const doc = owner.ownerDocument, win = doc.defaultView, abort = new AbortController();
  const overlay = doc.createElement('div'); overlay.className = 'dsp-click-bubbles';
  overlay.setAttribute('aria-hidden', 'true'); overlay.inert = true; owner.append(overlay);
  let renderer = null, canvas = null, frame = 0, last = 0, disposed = false, failedHigh = false;
  let width = 1, height = 1, left = 0, top = 0, ratio = 1, lastPointer = -Infinity, clicks = 0, light = false;
  const particles = [], pointer = { x: 0, y: 0 };
  const mode = () => preference.matches || failedHigh ? 'low' : 'high';
  function clear() {
    win.cancelAnimationFrame(frame); frame = 0; particles.length = 0;
    renderer?.clear(); overlay.dataset.active = '0';
  }
  function release() {
    clear(); renderer?.dispose(); renderer = null; canvas?.remove(); canvas = null;
  }
  function resize() {
    if (disposed) return;
    if (!overlay.isConnected) owner.append(overlay);
    const r = owner.getBoundingClientRect(); left = r.left; top = r.top;
    const w = Math.max(1, owner.clientWidth), h = Math.max(1, owner.clientHeight), dpr = Math.min(win.devicePixelRatio || 1, 2);
    overlay.style.left = `${left}px`; overlay.style.top = `${top}px`;
    overlay.style.width = `${w}px`; overlay.style.height = `${h}px`;
    if (w !== width || h !== height || dpr !== ratio) { width = w; height = h; ratio = dpr; renderer?.resize(width, height, ratio); }
  }
  function ensure() {
    if (renderer) return true;
    canvas = doc.createElement('canvas'); overlay.append(canvas); overlay.dataset.quality = mode();
    try { renderer = factories[mode()](canvas); renderer.resize(width, height, ratio); return true; }
    catch {
      renderer?.dispose(); renderer = null; canvas.remove(); canvas = null;
      if (!failedHigh && !preference.matches) { failedHigh = true; return ensure(); }
      return false;
    }
  }
  function theme() {
    const color = win.getComputedStyle(getDetail?.() || owner).color;
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    light = !!channels && channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 < (color.startsWith('color(') ? .5 : 128);
  }
  function states() {
    return particles.filter(p => p.age >= 0).map(p => {
      if (p.reduced) return { x: p.x + p.dx, y: p.y + p.dy, r: p.r, wobble: 0, alpha: (1 - smooth(p.age / p.life)) * p.depth, age: 0, phase: p.phase };
      const t = clamp(p.age / p.life), fade = smooth((t - .7) / .3), travel = 1 - Math.exp(-p.age / 180);
      const grow = 1 - Math.pow(1 - clamp(p.age / 135), 3);
      return {
        x: p.x + p.dx * travel + Math.sin(t * 5 + p.phase) * 3.4 * t,
        y: p.y + p.dy * travel - 32 * t * t,
        r: p.r * (.18 + .82 * grow) * (1 + fade * .1),
        wobble: Math.sin(p.age / 71) * Math.exp(-p.age / 225) * .13,
        alpha: smooth(p.age / 32) * (1 - fade) * p.depth, age: p.age, phase: p.phase,
      };
    });
  }
  function tick(now) {
    frame = 0;
    if (disposed || doc.hidden || !owner.isConnected) { clear(); return; }
    const dt = Math.min(now - last, 48); last = now;
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].age += dt;
      if (particles[i].age >= particles[i].life) particles.splice(i, 1);
    }
    try { renderer?.draw(states(), { width, height, light, pointer }); }
    catch {
      renderer?.dispose(); renderer = null; canvas?.remove(); canvas = null;
      if (mode() === 'high') { failedHigh = true; if (ensure()) renderer.draw(states(), { width, height, light, pointer }); }
      else particles.length = 0;
    }
    overlay.dataset.active = String(particles.length);
    if (particles.length) frame = win.requestAnimationFrame(tick); else renderer?.clear();
  }
  function emit(x, y) {
    if (disposed || doc.hidden || !owner.isConnected) return;
    resize(); if (!ensure()) return; theme();
    const reduced = preference.matches, side = ++clicks % 2 ? 1 : -1;
    const specs = reduced
      ? [[8, 3, -4, 200, 0, .85], [4, -7, 2, 180, 0, .65]]
      : [[19, 19 * side, -34, 1160, 0, 1], [11, -26 * side, -21, 940, 24, .88], [6, 41 * side, -18, 760, 42, .83], [3.5, -12 * side, -48, 835, 59, .7]];
    for (const [r, dx, dy, life, delay, depth] of specs) particles.push({ x, y, r, dx, dy, life, age: -delay, depth, reduced, phase: Math.random() * Math.PI * 2 });
    if (particles.length > 32) particles.splice(0, particles.length - 32);
    if (!frame) { last = win.performance.now(); frame = win.requestAnimationFrame(tick); }
  }
  const inside = target => {
    const detail = getDetail?.();
    return !!target?.closest && !!detail && owner.contains(detail) && owner.contains(target)
      && (detail.contains(target) || !target.closest('[data-plugin-detail], [data-plugin-row-detail]'))
      && !target.closest('[disabled], [inert], dialog');
  };
  owner.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || !inside(event.target)) return;
    resize(); lastPointer = win.performance.now(); emit(event.clientX - left, event.clientY - top);
  }, { signal: abort.signal, capture: true, passive: true });
  owner.addEventListener('click', event => {
    if (event.detail !== 0 || win.performance.now() - lastPointer < 180 || !inside(event.target)) return;
    const target = event.target.closest('button, input, summary, a'); if (!target) return;
    resize(); const r = target.getBoundingClientRect(); emit(r.left + r.width / 2 - left, r.top + r.height / 2 - top);
  }, { signal: abort.signal, capture: true, passive: true });
  owner.addEventListener('pointermove', event => {
    if (!frame || preference.matches) return;
    pointer.x = (event.clientX - left) / width - .5; pointer.y = .5 - (event.clientY - top) / height;
  }, { signal: abort.signal, passive: true });
  owner.addEventListener('pointerleave', () => { pointer.x = pointer.y = 0; }, { signal: abort.signal });
  preference.addEventListener('change', () => { release(); overlay.dataset.quality = mode(); }, { signal: abort.signal });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) clear(); }, { signal: abort.signal });
  win.addEventListener('scroll', clear, { signal: abort.signal, capture: true, passive: true });
  function dispose() { if (disposed) return; disposed = true; release(); abort.abort(); overlay.remove(); }
  signal?.addEventListener('abort', dispose, { once: true });
  resize(); overlay.dataset.quality = mode();
  if (signal?.aborted) dispose();
  return { resize, clear, dispose };
}
