import styles from './ocean-detail.css';
import { createOceanTransition } from './ocean-transition.mjs';
import { installClickBubbles } from './click-bubbles.mjs';

const DETAIL = '[data-plugin-detail="dsh-persona"], [data-plugin-row-detail^="dsh-persona#"]';

/** Preserve one video across this package's native detail pages. */
export function installOceanDetails(doc, { artwork, loopVideo }) {
  const win = doc.defaultView;
  if (!win || !doc.body) return () => {};
  const abort = new AbortController(), preference = win.matchMedia('(prefers-reduced-motion: reduce)');
  const style = doc.createElement('style'); style.dataset.dsoStyle = ''; style.textContent = styles; doc.head.append(style);
  let current = null, currentKey = null, host = null, scene = null, disposed = false;
  const marks = new Map();
  function mark(node, attribute, value = '') {
    if (!node) return;
    if (!marks.has(node)) marks.set(node, new Map());
    if (!marks.get(node).has(attribute)) marks.get(node).set(attribute, node.getAttribute(attribute));
    if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
  }
  function restore() {
    for (const [node, attrs] of marks) for (const [attribute, value] of attrs) {
      if (value === null) node.removeAttribute(attribute); else node.setAttribute(attribute, value);
    }
    marks.clear();
  }
  function mountScene(owner) {
    const previousHost = owner.getAttribute('data-dso-host');
    owner.setAttribute('data-dso-host', '');
    const layer = doc.createElement('div'); layer.className = 'dso-layer'; layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
    const image = doc.createElement('img'); image.className = 'dso-art'; image.alt = ''; image.src = artwork;
    const video = doc.createElement('video'); video.className = 'dso-video'; video.muted = video.defaultMuted = true;
    video.loop = true; video.playsInline = true; video.preload = 'metadata'; video.disablePictureInPicture = true;
    const local = new AbortController(); let dead = false;
    function setVideoReady(ready) {
      video.toggleAttribute('data-ready', ready);
      image.hidden = ready;
    }
    layer.append(image, video); owner.prepend(layer);
    const transition = createOceanTransition(owner, preference, { signal: local.signal });
    const bubbles = installClickBubbles(owner, preference, { signal: local.signal, getDetail: () => current });
    function resize() {
      if (dead) return;
      const r = owner.getBoundingClientRect();
      layer.style.left = `${r.left}px`; layer.style.top = `${r.top}px`;
      layer.style.width = `${owner.clientWidth}px`; layer.style.height = `${owner.clientHeight}px`;
      bubbles.resize();
    }
    function syncVideo() {
      if (dead) return;
      if (preference.matches || doc.hidden) { video.pause(); if (preference.matches) setVideoReady(false); return; }
      if (!loopVideo) return;
      if (!video.hasAttribute('src')) video.src = loopVideo;
      video.play()?.catch(() => { if (!dead) setVideoReady(false); });
    }
    video.addEventListener('playing', () => { if (!dead && !preference.matches && !doc.hidden) setVideoReady(true); }, { signal: local.signal });
    video.addEventListener('error', () => { if (!dead) setVideoReady(false); }, { signal: local.signal });
    preference.addEventListener('change', syncVideo, { signal: local.signal });
    doc.addEventListener('visibilitychange', syncVideo, { signal: local.signal });
    const observer = new win.ResizeObserver(resize); observer.observe(owner);
    win.addEventListener('resize', resize, { signal: local.signal });
    win.addEventListener('scroll', resize, { signal: local.signal, capture: true, passive: true });
    resize(); syncVideo();
    return { transition, layer, resize, resume: syncVideo, dispose() {
      if (dead) return; dead = true; local.abort(); observer.disconnect(); transition.dispose(); bubbles.dispose();
      video.pause(); video.removeAttribute('src'); video.load(); image.removeAttribute('src'); layer.remove();
      if (previousHost === null) owner.removeAttribute('data-dso-host'); else owner.setAttribute('data-dso-host', previousHost);
    } };
  }
  function decorate(detail) {
    mark(detail, 'data-dso-detail', detail.hasAttribute('data-plugin-detail') ? 'package' : 'component');
    const crumb = detail.querySelector(':scope > button'); mark(crumb, 'data-dso-part', 'crumb');
    const head = crumb?.nextElementSibling; mark(head, 'data-dso-part', 'head');
    mark(head?.querySelector(':scope > span[aria-hidden=true]'), 'data-dso-part', 'icon');
    const title = detail.querySelector(':scope > div > div > h3');
    mark(title, 'data-dso-part', 'title'); mark(title?.parentElement.parentElement, 'data-dso-part', 'identity');
    for (const row of detail.querySelectorAll('[data-plugin-row]')) {
      const line = row.firstElementChild, main = line?.querySelector(':scope > div');
      mark(line, 'data-dso-part', 'row-line'); mark(main, 'data-dso-part', 'row-main');
      mark(main?.querySelector('button'), 'data-dso-open');
    }
  }
  function sync() {
    if (disposed) return;
    const next = [...doc.querySelectorAll(DETAIL)].find(n => !n.closest('[hidden]')) ?? null;
    const nextKey = next?.getAttribute('data-plugin-detail') ?? next?.getAttribute('data-plugin-row-detail') ?? null;
    if (next === current && nextKey === currentKey) { if (next) decorate(next); return; }
    restore(); current = next; currentKey = nextKey;
    const owner = next?.parentElement ?? null;
    if (host !== owner) { scene?.dispose(); scene = null; host = owner; }
    if (!next) return;
    if (!scene) scene = mountScene(owner);
    else if (!scene.layer.isConnected) owner.prepend(scene.layer);
    scene.layer.dataset.page = next.hasAttribute('data-plugin-detail') ? 'package' : 'component';
    decorate(next); scene.resize(); scene.resume(); scene.transition.arrive(next);
  }
  doc.addEventListener('click', event => {
    if (!current?.contains(event.target)) return;
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const back = button.getAttribute('data-dso-part') === 'crumb';
    if (!button.hasAttribute('data-dso-open') && !back) return;
    if (back && current.hasAttribute('data-plugin-detail')) return;
    scene?.transition.begin(current, button, back ? 'back' : 'forward');
  }, { capture: true, signal: abort.signal });
  const observer = new win.MutationObserver(records => {
    const relevant = current
      ? !current.isConnected || records.some(r => current.contains(r.target) || r.target.contains?.(current))
      : records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches?.(DETAIL) || n.querySelector?.(DETAIL))) ||
        (r.type === 'attributes' && (r.target.matches?.(DETAIL) || r.target.querySelector?.(DETAIL))));
    if (relevant) sync();
  });
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-plugin-detail', 'data-plugin-row-detail'] });
  sync();
  return () => {
    if (disposed) return; disposed = true; abort.abort(); observer.disconnect(); restore(); scene?.dispose(); style.remove(); current = host = scene = null;
  };
}
