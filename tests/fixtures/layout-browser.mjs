/** Actual component views and controllers; only the Host scopes and model directory are in memory. */
import { mountAvatarSettings } from '../../src/modules/avatar/settings-view.mjs';
import { AvatarSettingsController } from '../../src/modules/avatar/config-controller.mjs';
import { mountPromptSettings } from '../../src/modules/prompts/settings-view.mjs';
import { PromptSettingsController } from '../../src/modules/prompts/config-controller.mjs';
import { defaultAvatarSettings } from '../../src/modules/avatar/settings.mjs';

function scope(value) {
  let snapshot = { status: 'ready', revision: 1, writable: true, value: { document: JSON.stringify(value) } };
  const listeners = new Set();
  let failure = false, held = false, release = null;
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    change(value) { snapshot = { ...snapshot, revision: snapshot.revision + 1, value: { document: JSON.stringify(value) } }; notify(); },
    fail(value) { failure = value; },
    hold(value) { held = value; if (!value) { release?.(); release = null; } },
    status(value) { snapshot = { ...snapshot, status: value }; notify(); },
    writable(value) { snapshot = { ...snapshot, writable: value }; notify(); },
    async mutate(ops, revision) {
      if (held) await new Promise(resolve => { release = resolve; });
      if (failure) throw new Error('保存失败，修改已保留。');
      if (revision !== snapshot.revision) throw new Error('配置已更新。');
      this.change(JSON.parse(ops[0].value));
    },
  };
}
const groups = [
  { id: 'subscription-a', name: '订阅 A', models: [{ id: 'deepseek', name: 'DeepSeek' }] },
  { id: 'subscription-b', name: '订阅 B', models: [{ id: 'deepseek', name: 'DeepSeek' }] },
  { id: 'local', name: '本地', models: Array.from({ length: 24 }, (_, i) => ({ id: `model-${i}`, name: `本地模型 ${i + 1}` })) },
];
const catalog = async () => ({ ok: true, value: { groups, failures: [] } });
const identity = { ...defaultAvatarSettings(), library: { schemaVersion: 2, personas: [
  { id: 'deepseek', revision: 1, name: 'DeepSeek', avatar: null, models: [{ provider: 'subscription-a', model: 'deepseek' }] },
  { id: 'custom', revision: 1, name: '自定义', avatar: null, models: [{ provider: 'subscription-b', model: 'deepseek' }] },
] } };
const avatars = scope(identity);
const prompts = scope({ version: 1, rules: [
  { id: 'writing', name: '输出约定', prompt: '使用简短段落。\n保留代码中的 {{variable}}。', targets: [
    { kind: 'persona', personaId: 'deepseek' },
    { kind: 'model', provider: 'subscription-a', model: 'deepseek' },
    { kind: 'model', provider: 'subscription-b', model: 'deepseek' },
  ] },
  { id: 'review', name: '检查输出', prompt: '检查单位、路径和示例是否一致。', targets: [{ kind: 'persona', personaId: 'custom' }] },
] });
const avatarController = new AvatarSettingsController(avatars, catalog);
const promptController = new PromptSettingsController(prompts, avatars, catalog);
const root = document.querySelector('#fixture');
const controls = document.createElement('nav');
controls.setAttribute('aria-label', '测试组件');
controls.style.cssText = 'display:flex;gap:12px;margin-bottom:24px';
root.before(controls);
let view, off, controller, kind;
function mount(next = kind) {
  off?.(); view?.dispose();
  kind = next;
  controller = kind === 'avatar' ? avatarController : promptController;
  view = (kind === 'avatar' ? mountAvatarSettings : mountPromptSettings)(root, controller);
  off = controller.subscribe(() => view.render(controller.getSnapshot()));
  view.render(controller.getSnapshot());
  document.querySelector('header h1').textContent = kind === 'avatar' ? 'Persona' : '提示词';
  document.querySelector('header p').textContent = kind === 'avatar' ? '名称、头像和模型关联。' : '为 Persona 组或原生模型追加提示词。';
  for (const button of controls.children) button.setAttribute('aria-pressed', String(button.dataset.view === kind));
}
for (const [value, label] of [['avatar', 'Persona'], ['prompts', '提示词']]) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.view = value;
  button.style.cssText = 'font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l4);border-radius:8px;padding:6px 14px;cursor:pointer';
  button.onclick = () => mount(value); controls.append(button);
}
mount('avatar');
void avatarController.refreshCatalog(); void promptController.refreshCatalog();
window.layoutFixture = {
  avatars, prompts, avatarController, promptController,
  mount,
  dispose() { off(); view.dispose(); avatarController.dispose(); promptController.dispose(); },
};
