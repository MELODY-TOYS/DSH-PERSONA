/** Browser regression fixture with in-memory settings. No Host or model request is made. */
import { mountPromptSettings } from '../../src/modules/prompts/settings-view.mjs';
import { PromptSettingsController } from '../../src/modules/prompts/config-controller.mjs';
import { defaultAvatarSettings } from '../../src/modules/avatar/settings.mjs';
import { defaultPromptSettings } from '../../src/modules/prompts/settings.mjs';
function scope(value) {
  let snapshot = { status: 'ready', revision: 1, writable: true, value: { document: JSON.stringify(value) } };
  const listeners = new Set(); let fail = false;
  return {
    getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    change(value) { snapshot = { ...snapshot, revision: snapshot.revision + 1, value: { document: JSON.stringify(value) } }; for (const fn of listeners) fn(); },
    fail(value) { fail = value; },
    unavailable() { snapshot = { ...snapshot, status: 'unavailable' }; for (const fn of listeners) fn(); },
    async mutate(ops, revision) {
      if (fail) throw new Error('保存失败，修改已保留。');
      if (revision !== snapshot.revision) throw new Error('配置已更新。');
      this.change(JSON.parse(ops[0].value));
    },
  };
}
const identity = { ...defaultAvatarSettings(), library: { schemaVersion: 2, personas: [
  { id: 'deepseek', revision: 1, name: 'DeepSeek', avatar: null, models: [{ provider: 'subscription-a', model: 'deepseek' }, { provider: 'subscription-b', model: 'deepseek' }] },
  { id: 'custom', revision: 1, name: '自定义', avatar: null, models: [] },
] } };
const prompts = scope(defaultPromptSettings()), personas = scope(identity);
const controller = new PromptSettingsController(prompts, personas, async () => ({ ok: true, value: { groups: [
  { id: 'subscription-a', name: '订阅 A', models: [{ id: 'deepseek', name: 'DeepSeek' }] },
  { id: 'subscription-b', name: '订阅 B', models: [{ id: 'deepseek', name: 'DeepSeek' }] },
  { id: 'local', name: '本地', models: [{ id: 'other', name: '原生模型' }] },
], failures: [] } }));
let view, off;
function mount() {
  view = mountPromptSettings(document.querySelector('#fixture'), controller);
  off = controller.subscribe(() => view.render(controller.getSnapshot())); view.render(controller.getSnapshot());
}
mount(); void controller.refreshCatalog();
window.promptFixture = {
  prompts, personas, controller,
  reopen() { off(); view.dispose(); mount(); },
  dispose() { off(); view.dispose(); controller.dispose(); },
};
