/** Display names and avatars grouped by exact model routes. No model-facing settings. */
export const SCHEMA_VERSION = 2;
const MAX_AVATAR_LENGTH = 1_000_000;
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label}: expected object`);
  return value;
}
function text(value, label, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError(`${label}: invalid text`);
  return value.trim();
}
function array(value, label, max = 512) {
  if (!Array.isArray(value) || value.length > max) throw new TypeError(`${label}: invalid array`);
  return value;
}
export function parseModel(value) {
  const m = record(value, 'model');
  return { provider: text(m.provider, 'provider', 256), model: text(m.model, 'model', 512) };
}
/** Exact tuple, independent of labels and separators inside provider or model names. */
export function modelKey(value) { const m = parseModel(value); return JSON.stringify([m.provider, m.model]); }
export function parseIdentity(value) {
  const p = record(value, 'identity'), name = text(p.name, 'identity.name', 80), avatar = p.avatar ?? null;
  if (avatar !== null && (typeof avatar !== 'string' || avatar.length > MAX_AVATAR_LENGTH ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar))) {
    throw new TypeError('avatar: only bounded raster data URLs are allowed');
  }
  return { name, avatar };
}
export function parsePersona(value) {
  const p = record(value, 'persona');
  if (!Number.isSafeInteger(p.revision) || p.revision < 1) throw new TypeError('persona.revision: invalid');
  // Reject mixed identity formats to avoid silently discarding user data.
  if ('userOverride' in p || 'user' in p || 'assistant' in p || 'title' in p) throw new TypeError('Persona 配置含不支持的字段；用户配置需独立保存。');
  const models = array(p.models, 'persona.models').map(parseModel), seen = new Set();
  for (const model of models) {
    const key = modelKey(model);
    if (seen.has(key)) throw new TypeError('persona.models: duplicate model');
    seen.add(key);
  }
  return { id: text(p.id, 'persona.id', 128), revision: p.revision, ...parseIdentity(p), models };
}
/** An empty library is valid. There is no default or inferred display assignment. */
export function parseState(value) {
  const v = record(value, 'state');
  if (v.schemaVersion !== SCHEMA_VERSION) throw new TypeError('Unsupported persona schema version');
  if ('user' in v || 'defaultPersonaId' in v || 'modelDefaults' in v) throw new TypeError('模型关联规则格式不受支持，请在各 Persona 的 models 中配置关联。');
  const personas = array(v.personas, 'personas', 128).map(parsePersona), ids = new Set(), routes = new Set();
  for (const p of personas) {
    if (ids.has(p.id)) throw new TypeError('Duplicate persona id');
    ids.add(p.id);
    for (const model of p.models) {
      const key = modelKey(model);
      if (routes.has(key)) throw new TypeError('该模型已关联其他 Persona，请先确认更改关联。');
      routes.add(key);
    }
  }
  return { schemaVersion: SCHEMA_VERSION, personas };
}
/** Only a user's explicit exact-route association takes effect. null preserves host display. */
export function resolvePersona(state, model) {
  const key = modelKey(model);
  return state.personas.find(p => p.models.some(m => modelKey(m) === key)) ?? null;
}
export function savePersona(state, input) {
  const old = state.personas.find(p => p.id === input.id);
  const p = parsePersona({ ...input, revision: old ? old.revision + 1 : 1 });
  return parseState({ ...state, personas: old ? state.personas.map(row => row.id === p.id ? p : row) : [...state.personas, p] });
}
/** Reassignment is refused until the caller records an explicit confirmation. */
export function assignModels(state, personaId, models, { confirmMove = false } = {}) {
  const current = parseState(state), target = current.personas.find(p => p.id === personaId);
  if (!target) throw new Error('Unknown persona');
  const wanted = new Map(array(models, 'models').map(parseModel).map(m => [modelKey(m), m]));
  const moves = current.personas.filter(p => p.id !== personaId && p.models.some(m => wanted.has(modelKey(m))));
  if (moves.length && !confirmMove) throw new Error('请确认将模型从其他 Persona 移到当前 Persona。');
  const personas = current.personas.map(p => {
    const next = p.id === personaId
      ? [...new Map([...p.models, ...wanted.values()].map(m => [modelKey(m), m])).values()]
      : p.models.filter(m => !wanted.has(modelKey(m)));
    return JSON.stringify(next) === JSON.stringify(p.models) ? p : { ...p, models: next, revision: p.revision + 1 };
  });
  return parseState({ ...current, personas });
}
export function unassignModel(state, personaId, model) {
  const p = state.personas.find(p => p.id === personaId);
  if (!p) throw new Error('Unknown persona');
  return savePersona(state, { ...p, models: p.models.filter(m => modelKey(m) !== modelKey(model)) });
}
export function deletePersona(state, personaId) {
  if (!state.personas.some(p => p.id === personaId)) throw new Error('Unknown persona');
  return parseState({ ...state, personas: state.personas.filter(p => p.id !== personaId) });
}
/** Create an immutable display snapshot from separate user and model settings. */
export function captureIdentity(state, user, model) {
  const p = resolvePersona(state, model);
  return Object.freeze({ personaId: p?.id ?? null, personaRevision: p?.revision ?? null,
    user: Object.freeze(parseIdentity(user)),
    assistant: p ? Object.freeze(parseIdentity(p)) : null,
    model: Object.freeze(parseModel(model)) });
}
