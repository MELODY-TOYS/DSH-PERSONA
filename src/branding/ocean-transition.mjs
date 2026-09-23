const pageKey = node => node?.getAttribute('data-plugin-detail') ?? node?.getAttribute('data-plugin-row-detail');

/** Native navigation stays immediate. Animate the incoming page without cloning or hiding controls. */
export function createOceanTransition(host, preference, { signal } = {}) {
  const doc = host.ownerDocument, win = doc.defaultView;
  const abort = new AbortController();
  let disposed = false, pending = null, animation = null;
  function clear() {
    pending = null;
    animation?.cancel(); animation = null;
  }
  function begin(detail, _button, direction) {
    clear();
    if (disposed || preference.matches || doc.hidden || !host.isConnected) return;
    pending = { key: pageKey(detail), direction, time: win.performance.now() };
  }
  function arrive(node) {
    if (!pending || pageKey(node) === pending.key) return;
    const next = pending; pending = null;
    if (disposed || preference.matches || doc.hidden || !node.animate || win.performance.now() - next.time > 1000) return;
    const distance = next.direction === 'back' ? -8 : 8;
    const motion = node.animate([
      { opacity: .65, transform: `translateX(${distance}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' });
    animation = motion;
    motion.finished.then(() => { if (animation === motion) { motion.cancel(); animation = null; } }, () => {});
  }
  preference.addEventListener('change', () => { if (preference.matches) clear(); }, { signal: abort.signal });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) clear(); }, { signal: abort.signal });
  win.addEventListener('resize', clear, { signal: abort.signal });
  host.addEventListener('wheel', clear, { signal: abort.signal, passive: true });
  host.addEventListener('touchmove', clear, { signal: abort.signal, passive: true });
  function dispose() { if (disposed) return; disposed = true; clear(); abort.abort(); }
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) dispose();
  return { begin, arrive, cancel: clear, get active() { return !!animation; }, dispose };
}
