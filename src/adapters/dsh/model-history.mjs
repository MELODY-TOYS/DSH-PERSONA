/** Ordinary request headers retain the exact route used by later assistant steps. */
export const MODEL_TARGET = 'dsh-persona-models';
export const EMPTY_MODEL_HISTORY = Object.freeze([]);

export function readModel(value) {
  return value && typeof value.provider === 'string' && value.provider.trim()
    && typeof value.model === 'string' && value.model.trim()
    ? { provider: value.provider, model: value.model } : null;
}

export const modelHeaderDefinition = {
  kind: 'dsh-persona-model-header', target: MODEL_TARGET,
  match: event => event.type === 'request/header' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => ({ seq: match.event.seq, model: readModel(match.event.data?.header?.config) }),
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : {
    key: context.key, id: context.id, kind: 'dsh-persona-model-header',
    target: MODEL_TARGET, data: context.state,
  },
};

export function createModelHistory() {
  const records = new Map();
  const publish = () => Object.freeze([...records.values()].sort((a, b) => a.seq - b.seq));
  return {
    empty: EMPTY_MODEL_HISTORY,
    replace({ nodes }) {
      records.clear();
      for (const node of nodes) records.set(node.key, node.data);
      return publish();
    },
    apply({ upserts }) {
      for (const node of upserts) records.set(node.key, node.data);
      return publish();
    },
  };
}

/** Missing history stays unattributed; the current model selector is not evidence for an older reply. */
export function modelForNode(node, history = EMPTY_MODEL_HISTORY) {
  if (node?.kind !== 'assistant-step') return null;
  const recorded = readModel(node.data?.finalNode?.requestConfig);
  if (recorded) return recorded;
  const seq = node.anchorSeq;
  if (!Number.isFinite(seq)) return null;
  let low = 0, high = history.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (history[middle].seq <= seq) low = middle + 1;
    else high = middle;
  }
  return low ? history[low - 1].model : null;
}
