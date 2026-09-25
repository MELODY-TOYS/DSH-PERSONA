import { initials } from '../index.mjs';
import { CHAT_AVATAR_SIZE, defaultAvatarSettings, parseAvatarSettings } from '../settings.mjs';
import { resolvePersona } from '../../../core/persona.mjs';
import { modelForNode } from '../../../adapters/dsh/model-history.mjs';
import styles from './messages.css';

const MARKERS = '[data-chat-flow], [data-chat-flow-key], [data-chat-node-key], [data-submission-echo], [data-pending-steering]';
// A process group repeats the step's reasoning part in a nested flow; the response part carries the reply.
const ROWS = [
  '[data-chat-flow] > [data-chat-flow-kind="user"]',
  '[data-chat-flow] > [data-chat-flow-kind="steering"]',
  '[data-chat-flow] > [data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"])',
  '[data-chat-flow] > [data-submission-echo]',
  '[data-chat-flow] > [data-pending-steering]',
].join(',');
const OWN_ATTRIBUTES = ['data-dsp-chat-role', 'data-dsp-chat-name', 'data-dsp-chat-initials', 'data-dsp-chat-image'];
/** A grouped part's flow key is not a node key; data-chat-node-key always names the node. */
const nodeKey = row => row.dataset.chatNodeKey ?? row.dataset.chatFlowKey;

/**
 * Decorate DSH 0.1.7's semantic row containers without replacing renderers or moving their children.
 * Only confirmed settings are used. The disposer restores the native rows and cancels pending work.
 */
export function decorateChat(root, { settings, chat, models }) {
  const doc = root.ownerDocument, win = doc.defaultView;
  if (!win || !root.matches('[data-conversation-scroll]') || root.hasAttribute('data-dsp-chat-scope')) return () => {};
  let disposed = false, frame = 0, lastDocument, config = null;
  const rows = new Map(), images = new Map(), nodeSubscriptions = new Map();
  const style = doc.createElement('style'); style.dataset.dspChatStyle = '';
  style.textContent = styles.replaceAll('__AVATAR_SIZE__', String(CHAT_AVATAR_SIZE));
  doc.head.append(style); root.setAttribute('data-dsp-chat-scope', '');

  function schedule() {
    if (!disposed && !frame) frame = win.requestAnimationFrame(refresh);
  }
  function forget(row) {
    const previous = rows.get(row);
    if (!previous) return;
    for (const name of OWN_ATTRIBUTES) row.removeAttribute(name);
    row.style.removeProperty('--dsp-message-avatar');
    if (previous.group && row.getAttribute('role') === 'group') row.removeAttribute('role');
    if (previous.label && row.getAttribute('aria-label') === previous.name) row.removeAttribute('aria-label');
    rows.delete(row);
  }
  function imageReady(avatar) {
    if (!avatar) return false;
    let record = images.get(avatar);
    if (!record) {
      const image = doc.createElement('img');
      record = { image, ready: false }; images.set(avatar, record);
      image.onload = () => { if (!disposed) { record.ready = true; schedule(); } };
      image.onerror = () => { if (!disposed) { record.ready = false; schedule(); } };
      image.src = avatar;
    }
    return record.ready;
  }
  function readSettings() {
    const snapshot = settings.getSnapshot();
    if (snapshot.status !== 'ready') { config = null; lastDocument = undefined; return; }
    const document = snapshot.value?.document;
    if (config && document === lastDocument) return;
    lastDocument = document;
    try {
      if (document !== undefined && (typeof document !== 'string' || document.length > 4_000_000)) throw new TypeError('Invalid settings document');
      config = parseAvatarSettings(document === undefined ? defaultAvatarSettings() : JSON.parse(document));
    } catch { config = null; }
    const retained = new Set(config ? [config.user.avatar, ...config.library.personas.map(p => p.avatar)] : []);
    for (const [avatar, { image }] of images) if (!retained.has(avatar)) {
      image.onload = image.onerror = null; image.removeAttribute('src'); images.delete(avatar);
    }
  }
  function nodeRouteKey(source) {
    const route = modelForNode(source.getSnapshot(), models.getSnapshot());
    return route ? JSON.stringify([route.provider, route.model]) : null;
  }
  // Chat publishes node changes separately from list order. Unattributed rows need subscriptions too.
  function watchNodes(current, candidates) {
    const wanted = new Map();
    if (current) for (const row of candidates) {
      const key = nodeKey(row);
      if (row.dataset.chatFlowKind !== 'assistant-step' || !key) continue;
      wanted.set(key, current.nodes.source(key));
    }
    for (const [key, entry] of nodeSubscriptions) if (wanted.get(key) !== entry.source) {
      entry.off(); nodeSubscriptions.delete(key);
    }
    for (const [key, source] of wanted) {
      const existing = nodeSubscriptions.get(key);
      if (existing) { existing.route = nodeRouteKey(source); continue; }
      const entry = { source, route: nodeRouteKey(source), off: null };
      entry.off = source.subscribe(() => {
        if (disposed) return;
        const route = nodeRouteKey(source);
        // Token deltas keep the same model; only attribution changes require a DOM refresh.
        if (route !== entry.route) { entry.route = route; schedule(); }
      });
      nodeSubscriptions.set(key, entry);
    }
  }
  function refresh() {
    frame = 0;
    if (disposed) return;
    readSettings();
    const current = chat.getSnapshot(), history = models.getSnapshot();
    const candidates = new Set([...root.querySelectorAll(ROWS)]
      .filter(row => row.closest('[data-conversation-scroll]') === root));
    watchNodes(current, candidates);
    for (const row of rows.keys()) if (!candidates.has(row) || !config) forget(row);
    if (!config) return;
    for (const row of candidates) {
      const role = row.dataset.chatFlowKind === 'assistant-step' ? 'assistant' : 'user';
      let identity = config.user;
      if (role === 'assistant') {
        const node = current?.nodes.get(nodeKey(row));
        const route = modelForNode(node, history);
        identity = route ? resolvePersona(config.library, route) : null;
      }
      if (!identity) { forget(row); continue; }
      const ready = imageReady(identity.avatar), before = rows.get(row);
      if (before && before.name === identity.name && before.avatar === identity.avatar && before.ready === ready && before.role === role) continue;
      const record = { name: identity.name, avatar: identity.avatar, role, ready,
        group: before?.group ?? !row.hasAttribute('role'),
        label: before?.label ?? !row.hasAttribute('aria-label') };
      if (record.group) row.setAttribute('role', 'group');
      if (record.label) row.setAttribute('aria-label', identity.name);
      row.setAttribute('data-dsp-chat-role', role);
      row.setAttribute('data-dsp-chat-name', identity.name);
      row.setAttribute('data-dsp-chat-initials', initials(identity.name));
      if (ready) {
        row.style.setProperty('--dsp-message-avatar', `url("${identity.avatar}")`);
        row.setAttribute('data-dsp-chat-image', '');
      } else {
        row.style.removeProperty('--dsp-message-avatar'); row.removeAttribute('data-dsp-chat-image');
      }
      rows.set(row, record);
    }
  }
  // Streaming text mutations do not need a rescan; row insertion/removal and identity changes do.
  const relevant = node => node.nodeType === 1 && (node.matches(MARKERS) || node.querySelector(MARKERS));
  const observer = new win.MutationObserver(changes => {
    if (changes.some(change => change.type === 'attributes'
      || [...change.addedNodes, ...change.removedNodes].some(relevant))) schedule();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-chat-flow-key', 'data-chat-node-key', 'data-chat-group-part', 'data-chat-flow-kind', 'data-submission-echo', 'data-pending-steering'] });
  let lastOrder, lastNodes, lastModels;
  const onChat = () => {
    const current = chat.getSnapshot();
    if (current?.order !== lastOrder || current?.nodes !== lastNodes) {
      lastOrder = current?.order; lastNodes = current?.nodes; schedule();
    }
  };
  const onModels = () => {
    const value = models.getSnapshot();
    if (value !== lastModels) { lastModels = value; schedule(); }
  };
  const off = [settings.subscribe(schedule), chat.subscribe(onChat), models.subscribe(onModels)];
  refresh();
  return () => {
    if (disposed) return;
    disposed = true; observer.disconnect();
    if (frame) win.cancelAnimationFrame(frame);
    for (const unsubscribe of off) unsubscribe();
    for (const entry of nodeSubscriptions.values()) entry.off();
    nodeSubscriptions.clear();
    for (const row of rows.keys()) forget(row);
    for (const { image } of images.values()) { image.onload = image.onerror = null; image.removeAttribute('src'); }
    images.clear(); style.remove(); root.removeAttribute('data-dsp-chat-scope');
  };
}
