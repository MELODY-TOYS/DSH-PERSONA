import { ComponentSettingsController } from '../../core/component-settings.mjs';
import { parseAvatarSettings } from '../avatar/settings.mjs';
import { parseModel } from '../../core/persona.mjs';
import { defaultPromptSettings, parsePromptSettings, targetKey } from './settings.mjs';

/** Catalogue labels are presentation only. Saved targets always retain exact IDs. */
export function promptCandidates(groups, library, rules) {
  const entries = new Map();
  for (const persona of library.personas) {
    const target = { kind: 'persona', personaId: persona.id }, key = targetKey(target);
    entries.set(key, { key, target, name: persona.name, detail: `${persona.models.length} 个模型`, available: true });
  }
  for (const group of groups) for (const model of group.models) {
    const target = { kind: 'model', ...parseModel({ provider: group.id, model: model.id }) }, key = targetKey(target);
    entries.set(key, { key, target, name: model.name || model.id, detail: `${group.name || group.id} · ${group.id} / ${model.id}`, available: true });
  }
  for (const rule of rules) for (const target of rule.targets) {
    const key = targetKey(target);
    if (!entries.has(key)) entries.set(key, { key, target, available: false,
      name: target.kind === 'persona' ? '已删除或不可用的 Persona' : target.model,
      detail: target.kind === 'persona' ? target.personaId : `${target.provider} / ${target.model}` });
  }
  return [...entries.values()];
}

export class PromptSettingsController {
  #scope; #personas; #draft; #catalog; #groups = []; #selected = null;
  #status = 'idle'; #partial = false; #catalogError = ''; #listeners = new Set();
  #off; #snapshot; #disposed = false; #generation = 0; #wasUnavailable = false;
  constructor(scope, personas, catalog) {
    this.#scope = scope; this.#personas = personas; this.#catalog = catalog;
    this.#draft = new ComponentSettingsController(scope, { parse: parsePromptSettings, defaults: defaultPromptSettings });
    this.#off = [this.#draft.subscribe(() => this.#publish()), personas.subscribe(() => this.#publish())];
    this.#publish();
  }
  getSnapshot = () => this.#snapshot;
  subscribe = listener => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  #publish() {
    if (this.#disposed) return;
    const unavailable = this.#scope.getSnapshot().status === 'unavailable';
    if (unavailable && !this.#wasUnavailable) {
      this.#wasUnavailable = true; this.#draft.discard(); return;
    }
    this.#wasUnavailable = unavailable;
    const draft = this.#draft.getSnapshot(), rules = draft.value?.rules ?? [];
    let library = { schemaVersion: 2, personas: [] }, libraryError = '';
    const source = this.#personas.getSnapshot();
    try {
      if (source.status !== 'ready') throw new Error('Persona 组暂不可用。');
      const document = source.value?.document;
      if (typeof document !== 'string' || document.length > 4_000_000) throw new Error('Persona 配置文档无效。');
      library = parseAvatarSettings(JSON.parse(document)).library;
    } catch (error) { libraryError = error.message; }
    if (!rules.some(rule => rule.id === this.#selected)) this.#selected = rules[0]?.id ?? null;
    this.#snapshot = { ...draft, selectedId: this.#selected, library, libraryError,
      unavailable,
      candidates: promptCandidates(this.#groups, library, rules),
      catalogStatus: this.#status, catalogPartial: this.#partial, catalogError: this.#catalogError };
    for (const listener of this.#listeners) listener();
  }
  edit = change => this.#draft.edit(change);
  save = () => this.#draft.save();
  discard = () => this.#draft.discard();
  select = id => { if (this.#snapshot.value?.rules.some(rule => rule.id === id)) { this.#selected = id; this.#publish(); } };
  refreshCatalog = async () => {
    if (this.#disposed) return;
    const generation = ++this.#generation;
    this.#status = 'loading'; this.#catalogError = ''; this.#publish();
    try {
      const response = await this.#catalog();
      if (this.#disposed || generation !== this.#generation) return;
      if (!response?.ok || !Array.isArray(response.value?.groups)) throw new Error('模型目录读取失败，请重试。');
      promptCandidates(response.value.groups, { personas: [] }, []);
      this.#groups = response.value.groups; this.#partial = Boolean(response.value.failures?.length); this.#status = 'ready';
    } catch (error) {
      if (this.#disposed || generation !== this.#generation) return;
      this.#status = 'error'; this.#catalogError = error.message;
    }
    this.#publish();
  };
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true; this.#generation++;
    for (const off of this.#off) off();
    this.#draft.dispose(); this.#listeners.clear();
  }
}
