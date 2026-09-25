import { initials } from '../index.mjs';
import { CHAT_AVATAR_SIZE, defaultAvatarSettings, parseAvatarSettings } from '../settings.mjs';
import { resolvePersona } from '../../../core/persona.mjs';
import { modelForNode } from '../../../adapters/dsh/model-history.mjs';
import styles from './messages.css';

const FLOW = '[data-chat-flow]';
const STEP = '[data-chat-flow-kind="assistant-step"][data-chat-node-key]';
const MARKERS = '[data-chat-flow], [data-chat-flow-key], [data-chat-node-key], [data-chat-turn], [data-submission-echo], [data-pending-steering]';
const USER_KINDS = new Set(['user', 'steering']);
// A trigger opens a Turn without a user message; it separates runs and keeps its native look.
const NEUTRAL_KINDS = new Set(['turn-trigger']);
const OWN_ATTRIBUTES = ['data-dsp-chat-role', 'data-dsp-chat-lead', 'data-dsp-chat-name', 'data-dsp-chat-initials', 'data-dsp-chat-image'];
const VISIBILITY = ['hidden', 'data-turn-process-hidden'];
/** A grouped part's flow key is not a node key; data-chat-node-key always names the node. */
const nodeKey = row => row.dataset.chatNodeKey ?? row.dataset.chatFlowKey;

/** Rows of the outermost flows only; process groups nest their members in another flow. */
function topRows(root) {
  return [...root.querySelectorAll(FLOW)]
    .filter(flow => flow.closest('[data-conversation-scroll]') === root && !root.contains(flow.parentElement.closest(FLOW)))
    .flatMap(flow => [...flow.children]);
}
function side(row) {
  const kind = row.dataset.chatFlowKind;
  if (USER_KINDS.has(kind) || row.hasAttribute('data-submission-echo') || row.hasAttribute('data-pending-steering')) return 'user';
  if (NEUTRAL_KINDS.has(kind) || (kind === undefined && !row.hasAttribute('data-chat-group-key'))) return null;
  // Unknown kinds inside a Turn belong to the reply, so a new DSH wrapper keeps the identity.
  return 'assistant';
}
const visible = row => !VISIBILITY.some(name => row.hasAttribute(name)) && !row.matches(':empty');

/**
 * Split the transcript into identity runs: each user row stands alone; consecutive assistant rows of one
 * Turn form one reply. DSH 0.1.7 renders a reply as a Turn status row, a process group and a response part.
 */
function identityRuns(rows) {
  const runs = [];
  let open = null;
  for (const row of rows) {
    const role = side(row);
    const turn = row.dataset.chatTurn ?? null;
    if (role === 'assistant' && open && open.turn === turn) { open.rows.push(row); continue; }
    open = role === 'assistant' ? { role, turn, rows: [row] } : null;
    if (role) runs.push(open ?? { role, turn, rows: [row] });
  }
  return runs;
}
function firstRecordAfter(seq, history) {
  if (!Number.isFinite(seq)) return null;
  return history.find(record => record.seq > seq)?.model ?? null;
}

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
  // Chat publishes node changes separately from list order. Unattributed steps need subscriptions too.
  function watchNodes(current, keys) {
    const wanted = new Map();
    if (current) for (const key of keys) wanted.set(key, current.nodes.source(key));
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
  /** The first attributed step of a run names its model; a live run without steps yet uses its next request. */
  function runRoute(run, current, history, live) {
    for (const key of run.steps) {
      const route = modelForNode(current?.nodes.get(key), history);
      if (route) return route;
    }
    if (!live || run.steps.length) return null;
    const anchor = run.rows.map(row => row.dataset.chatNodeKey).find(Boolean);
    return anchor === undefined ? null : firstRecordAfter(current?.nodes.get(anchor)?.anchorSeq, history);
  }
  function apply(row, desired) {
    const before = rows.get(row);
    if (before && before.name === desired.name && before.avatar === desired.avatar && before.ready === desired.ready &&
      before.role === desired.role && before.lead === desired.lead) return;
    forget(row);
    const record = { ...desired,
      group: desired.lead && !row.hasAttribute('role'),
      label: desired.lead && !row.hasAttribute('aria-label') };
    if (record.group) row.setAttribute('role', 'group');
    if (record.label) row.setAttribute('aria-label', desired.name);
    row.setAttribute('data-dsp-chat-role', desired.role);
    if (desired.lead) {
      row.setAttribute('data-dsp-chat-lead', '');
      row.setAttribute('data-dsp-chat-name', desired.name);
      row.setAttribute('data-dsp-chat-initials', initials(desired.name));
      if (desired.ready) {
        row.style.setProperty('--dsp-message-avatar', `url("${desired.avatar}")`);
        row.setAttribute('data-dsp-chat-image', '');
      }
    }
    rows.set(row, record);
  }
  function refresh() {
    frame = 0;
    if (disposed) return;
    readSettings();
    const current = chat.getSnapshot(), history = models.getSnapshot();
    const runs = identityRuns(topRows(root));
    for (const run of runs) {
      run.steps = [...new Set(run.role === 'assistant' ? run.rows.flatMap(row =>
        [row, ...row.querySelectorAll(STEP)].filter(el => el.matches(STEP)).map(nodeKey)) : [])];
    }
    watchNodes(current, runs.flatMap(run => run.steps));
    const desired = new Map(), last = runs.findLast(run => run.role === 'assistant');
    if (config) for (const run of runs) {
      let identity = config.user;
      if (run.role === 'assistant') {
        const route = runRoute(run, current, history, run === last);
        identity = route ? resolvePersona(config.library, route) : null;
      }
      if (!identity) continue;
      const ready = imageReady(identity.avatar);
      const lead = run.rows.find(visible);
      for (const row of run.rows) desired.set(row, { name: identity.name, avatar: identity.avatar, role: run.role, ready, lead: row === lead });
    }
    for (const row of rows.keys()) if (!desired.has(row)) forget(row);
    for (const [row, value] of desired) apply(row, value);
  }
  // Streaming text mutations do not need a rescan; row insertion/removal, identity and row visibility changes do.
  const relevant = node => node.nodeType === 1 && (node.matches(MARKERS) || node.querySelector(MARKERS));
  const isRow = node => node.nodeType === 1 && node.parentElement?.matches(FLOW);
  const observer = new win.MutationObserver(changes => {
    if (changes.some(change => change.type === 'attributes'
      ? !VISIBILITY.includes(change.attributeName) || isRow(change.target)
      // A row that DSH filled after rendering it empty can become the visible lead.
      : isRow(change.target) || [...change.addedNodes, ...change.removedNodes].some(relevant))) schedule();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-chat-flow-key', 'data-chat-node-key', 'data-chat-group-key', 'data-chat-flow-kind', 'data-chat-turn',
      'data-submission-echo', 'data-pending-steering', ...VISIBILITY] });
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
