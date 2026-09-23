import { parseAvatarSettings } from '../modules/avatar/settings.mjs';
import { resolvePersona } from './persona.mjs';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Read committed identities through their owner; consumers cannot change group membership. */
export function createPersonaService(readSection) {
  let document, snapshot;
  const getSnapshot = () => {
    const next = readSection().document;
    if (typeof next !== 'string' || next.length > 4_000_000) throw new TypeError('Persona 配置文档无效。');
    if (next !== document || !snapshot) {
      const parsed = freeze(parseAvatarSettings(JSON.parse(next)));
      document = next; snapshot = parsed;
    }
    return snapshot;
  };
  return Object.freeze({
    apiVersion: 1,
    getSnapshot,
    getUser: () => getSnapshot().user,
    listPersonas: () => getSnapshot().library.personas,
    resolveModel: model => resolvePersona(getSnapshot().library, model),
  });
}
