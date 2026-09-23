/** Change only on selection identity; typing and auto-save preserve the settled surface. */
export function selectionMotion(node, signal) {
  const win = node.ownerDocument.defaultView;
  const preference = win?.matchMedia('(prefers-reduced-motion: reduce)');
  let selected = null, animation = null;
  const cancel = () => { animation?.cancel(); animation = null; };
  signal.addEventListener('abort', cancel, { once: true });
  preference?.addEventListener('change', () => { if (preference.matches) cancel(); }, { signal });
  return id => {
    if (signal.aborted || id === selected) return;
    const entering = selected !== null && id !== null;
    selected = id; cancel();
    if (!entering || preference?.matches || !node.animate) return;
    const computed = win?.getComputedStyle?.(node);
    const duration = Number.parseFloat(computed?.getPropertyValue('--dsp-motion-enter')) || 150;
    const easing = computed?.getPropertyValue('--dsp-motion-ease')?.trim() || 'cubic-bezier(.2,.7,.2,1)';
    const next = node.animate([
      { opacity: .65, transform: 'translateY(4px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration, easing });
    animation = next;
    next.finished.then(() => { if (animation === next) cancel(); }, () => {});
  };
}
