const SVG = 'http://www.w3.org/2000/svg';
const SELECTOR = '[data-dso-open], .dsp-persona-item, .dsp-prompts-rule';

/** One two-layer selector follows existing buttons. It is inert and never delays navigation. */
export function mountOceanCursor(detail, host, water, preference) {
  const doc = detail.ownerDocument, win = doc.defaultView, abort = new AbortController();
  const layer = doc.createElement('div'); layer.className = 'dso-cursor-layer'; layer.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS(SVG, 'svg'); svg.classList.add('dso-cursor'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
  for (const name of ['refraction', 'highlight']) {
    const polygon = doc.createElementNS(SVG, 'polygon'); polygon.setAttribute('class', `dso-${name}`); polygon.setAttribute('points', name === 'refraction' ? '0,12 97,0 100,87 3,100' : '1,2 98,9 99,98 0,89'); svg.append(polygon);
  }
  layer.append(svg); detail.append(layer);
  let active = null, activeKey = null, scheduled = 0, previousSelection = null, disposed = false;
  const motions = new Set();
  const key = node => node?.dataset.persona ?? node?.dataset.rule ?? node?.getAttribute('aria-label') ?? null;
  const setHidden = value => { if (layer.hidden !== value) layer.hidden = value; };
  const available = node => node && !node.disabled && node.getClientRects().length && !node.closest('[hidden]');
  function stop() { for (const a of motions) a.cancel(); motions.clear(); }
  function place() {
    scheduled = 0;
    if (disposed || !active?.isConnected || !available(active)) { setHidden(true); return; }
    const h = host.getBoundingClientRect(), box = active.hasAttribute('data-dso-open') ? active.closest('[data-plugin-row]').getBoundingClientRect() : active.getBoundingClientRect();
    layer.style.cssText = `left:${h.left}px;top:${h.top}px;width:${host.clientWidth}px;height:${host.clientHeight}px;`;
    const large = active.hasAttribute('data-dso-open');
    svg.style.left = `${box.left - h.left - 4}px`; svg.style.top = `${box.top - h.top - 4}px`;
    svg.style.width = `${box.width + 8}px`; svg.style.height = `${box.height + 8}px`;
    svg.classList.toggle('dso-cursor-large', large); setHidden(false);
  }
  const schedule = () => { if (!scheduled && !disposed) scheduled = win.requestAnimationFrame(place); };
  function choose(node, respond = true) {
    if (!available(node)) return;
    if (active === node) return;
    active?.removeAttribute('data-dso-focused'); active = node; active.setAttribute('data-dso-focused', '');
    const nextKey = key(node), changed = nextKey !== activeKey; activeKey = nextKey;
    if (respond) place(); else schedule();
    if (changed && respond) {
      const h = host.getBoundingClientRect(), r = node.getBoundingClientRect();
      water.focus((r.left + r.width * .5 - h.left) / h.width, (r.top + r.height * .5 - h.top) / h.height);
      if (!preference.matches) {
        const a = svg.animate([{ transform: 'scale(.975)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.3,1)' });
        motions.add(a); a.finished.then(() => motions.delete(a), () => motions.delete(a));
      }
    }
  }
  function refresh() {
    const selected = detail.querySelector('.dsp-persona-item[aria-current=true], .dsp-prompts-rule[aria-current=true]');
    const selectedKey = key(selected);
    if (selected && selectedKey !== previousSelection) { const hadSelection = previousSelection !== null; previousSelection = selectedKey; choose(selected, hadSelection); }
    else if (active && !active.isConnected) {
      const replacement = [...detail.querySelectorAll(SELECTOR)].find(n => key(n) === activeKey);
      if (replacement) choose(replacement, false); else if (selected) choose(selected); else { active = null; setHidden(true); }
    } else if (!active) choose(selected ?? detail.querySelector('[data-dso-open]'), false);
    schedule();
  }
  for (const type of ['pointerover', 'focusin']) detail.addEventListener(type, e => {
    const target = e.target.closest?.(SELECTOR);
    if (detail.contains(target)) choose(target);
  }, { signal: abort.signal });
  detail.addEventListener('animationend', schedule, { signal: abort.signal });
  host.addEventListener('scroll', schedule, { capture: true, passive: true, signal: abort.signal });
  win.addEventListener('resize', schedule, { signal: abort.signal });
  preference.addEventListener('change', () => { stop(); place(); }, { signal: abort.signal });
  const size = new win.ResizeObserver(schedule); size.observe(detail); size.observe(host);
  refresh();
  return { refresh, dispose() { if (disposed) return; disposed = true; abort.abort(); size.disconnect(); win.cancelAnimationFrame(scheduled); stop(); active?.removeAttribute('data-dso-focused'); layer.remove(); } };
}
