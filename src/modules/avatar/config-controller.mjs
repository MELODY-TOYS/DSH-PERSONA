import { ComponentSettingsController } from '../../core/component-settings.mjs';
import { modelKey, parseModel } from '../../core/persona.mjs';
import { defaultAvatarSettings, parseAvatarSettings } from './settings.mjs';

/** Join the live catalog with retained routes; unavailable routes remain removable. */
export function avatarModelCandidates(groups, library) {
  const rows = new Map();
  for (const group of groups) for (const model of group.models) {
    const route = parseModel({ provider: group.id, model: model.id });
    rows.set(modelKey(route), { ...route, key: modelKey(route), providerName: group.name,
      modelName: model.name, available: true });
  }
  for (const persona of library.personas) for (const route of persona.models) {
    if (!rows.has(modelKey(route))) rows.set(modelKey(route), { ...route, key: modelKey(route),
      providerName: '当前不可用', modelName: route.model, available: false });
  }
  return [...rows.values()];
}
export class AvatarSettingsController {
  #draft; #catalog; #groups = []; #status = 'idle'; #partial = false; #error = '';
  #selection = null; #listeners = new Set(); #snapshot; #disposed = false; #generation = 0; #unsubscribe;
  constructor(scope, catalog) {
    this.#draft = new ComponentSettingsController(scope, { parse: parseAvatarSettings, defaults: defaultAvatarSettings });
    this.#catalog = catalog;
    this.#unsubscribe = this.#draft.subscribe(() => this.#publish());
    this.#publish();
  }
  getSnapshot = () => this.#snapshot;
  subscribe = listener => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  #publish() {
    if (this.#disposed) return;
    const draft = this.#draft.getSnapshot();
    const library = draft.value?.library;
    if (library && !library.personas.some(p => p.id === this.#selection)) this.#selection = library.personas[0]?.id ?? null;
    this.#snapshot = { ...draft, selectedId: this.#selection,
      candidates: library ? avatarModelCandidates(this.#groups, library) : [],
      catalogStatus: this.#status, catalogPartial: this.#partial, catalogError: this.#error };
    for (const listener of this.#listeners) listener();
  }
  edit = change => this.#draft.edit(change);
  save = () => this.#draft.save();
  discard = () => this.#draft.discard();
  select = id => {
    if (this.#snapshot.value?.library.personas.some(p => p.id === id)) {
      this.#selection = id; this.#publish();
    }
  };
  refreshCatalog = async () => {
    if (this.#disposed) return;
    const generation = ++this.#generation;
    this.#status = 'loading'; this.#error = ''; this.#publish();
    try {
      const result = await this.#catalog();
      if (this.#disposed || generation !== this.#generation) return;
      if (!result?.ok) throw new Error('无法读取模型目录，请重试。');
      const groups = result.value.groups;
      if (!Array.isArray(groups)) throw new Error('模型目录格式不正确。');
      // Parse before replacing the previous known directory.
      avatarModelCandidates(groups, { personas: [] });
      this.#groups = groups; this.#partial = Boolean(result.value.failures?.length); this.#status = 'ready';
    } catch (error) {
      if (this.#disposed || generation !== this.#generation) return;
      this.#status = 'error'; this.#error = error.message;
    }
    this.#publish();
  };
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true; this.#generation++; this.#unsubscribe(); this.#draft.dispose(); this.#listeners.clear();
  }
}
