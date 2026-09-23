/** Small click bursts: real bubbles, not radial click rings. */
export function mountOceanBubbles(host, preference, { signal } = {}) {
  const doc = host.ownerDocument, win = doc.defaultView;
  const layer = doc.createElement('div'); layer.className = 'dso-bubble-layer'; layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
  doc.body.append(layer);
  let disposed = false, serial = 0;

  const cancelAll = () => { layer.getAnimations({ subtree: true }).forEach(a => a.cancel()); layer.replaceChildren(); };
  preference.addEventListener('change', () => { if (preference.matches) cancelAll(); }, { signal });

  function burst(target, { count = 7, spread = 56, rise = 90, strong = false } = {}) {
    if (disposed || preference.matches || doc.hidden || !target?.isConnected) return;
    const hostRect = host.getBoundingClientRect(), rect = target.getBoundingClientRect();
    layer.style.left = `${hostRect.left}px`; layer.style.top = `${hostRect.top}px`;
    layer.style.width = `${host.clientWidth}px`; layer.style.height = `${host.clientHeight}px`;
    const originX = rect.left + rect.width * .52 - hostRect.left;
    const originY = rect.top + rect.height * .56 - hostRect.top;
    for (let i = 0; i < count; i++) {
      const seed = ++serial;
      const bubble = doc.createElement('span'); bubble.className = 'dso-bubble';
      const size = (strong ? 5 : 3) + ((seed * 7) % (strong ? 18 : 11));
      const dx = (((seed * 47) % 101) / 100 - .5) * spread;
      const drift = (((seed * 29) % 101) / 100 - .5) * spread * .55;
      const lift = rise * (.72 + ((seed * 17) % 37) / 100);
      bubble.style.left = `${originX - size / 2}px`; bubble.style.top = `${originY - size / 2}px`;
      bubble.style.width = bubble.style.height = `${size}px`;
      layer.append(bubble);
      const duration = 520 + ((seed * 53) % 380) + (strong ? 130 : 0);
      const delay = (seed * 23) % (strong ? 120 : 65);
      const animation = bubble.animate([
        { transform: 'translate3d(0,0,0) scale(.62)', opacity: 0 },
        { offset: .12, transform: `translate3d(${dx * .18}px,${-lift * .1}px,0) scale(1)`, opacity: strong ? .92 : .66 },
        { offset: .58, transform: `translate3d(${dx}px,${-lift * .56}px,0) scale(.96)`, opacity: strong ? .72 : .5 },
        { transform: `translate3d(${dx + drift}px,${-lift}px,0) scale(.84)`, opacity: 0 },
      ], { duration, delay, easing: 'cubic-bezier(.2,.72,.24,1)', fill: 'both' });
      animation.finished.catch(() => {}).finally(() => bubble.remove());
    }
  }

  signal?.addEventListener('abort', () => { if (!disposed) { disposed = true; cancelAll(); layer.remove(); } }, { once: true });
  return { burst, dispose() { if (disposed) return; disposed = true; cancelAll(); layer.remove(); } };
}
