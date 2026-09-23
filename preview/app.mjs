import { installBrandIcons, installPreviewFavicon } from '../src/branding/brand.mjs';
import { installDetailBackgroundObserver } from '../src/branding/detail-background.mjs';
/** Local preview of the DSH plugin list and configuration page. */
import { AvatarSettingsController } from '../src/modules/avatar/config-controller.mjs';
import { defaultAvatarSettings, parseAvatarSettings } from '../src/modules/avatar/settings.mjs';
import { mountPersonaSettings } from '../src/components/settings-page.mjs';

const demoGroups = [
  { id: 'demo-subscription-a', name: '订阅 A · 演示', models: [{ id: 'deepseek', name: 'DeepSeek' }] },
  { id: 'demo-subscription-b', name: '订阅 B · 演示', models: [{ id: 'deepseek', name: 'DeepSeek' }] },
  { id: 'demo-api', name: 'API 渠道 · 演示', models: [{ id: 'deepseek', name: 'DeepSeek' }, { id: 'model-b', name: '模型 B' }] },
  { id: 'demo-local', name: '本地 · 演示', models: [{ id: 'local', name: '本地模型' }] },
];
// Preview model labels are separate from saved Persona settings.
const demoDefault = defaultAvatarSettings();
// The preview stores its data separately from host settings.
const storageKey = 'dsh-persona:plugin-settings:v3';
const watchers = new Set();
let snapshot = { status: 'ready', writable: true, revision: 0, value: { document: JSON.stringify(demoDefault) } };
let enabled = true, mounted = null, controller = null, unsubscribe = null;
let disposeIcons = installBrandIcons();
const disposeFavicon = installPreviewFavicon();
let disposeBackground = installDetailBackgroundObserver();
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  disposeIcons?.(); disposeFavicon(); disposeBackground?.(); leaveSettings();
});
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) { const saved = JSON.parse(raw); parseAvatarSettings(JSON.parse(saved.value.document)); snapshot = saved; }
} catch { document.querySelector('#preview-note').textContent = '配置页预览 · 浏览器存储当前不可用'; }
const scope = {
  getSnapshot: () => snapshot,
  subscribe: listener => { watchers.add(listener); return () => watchers.delete(listener); },
  async mutate(operations, revision) {
    if (revision !== snapshot.revision) throw new Error('配置已在其他窗口更新，请重新载入。');
    const config = parseAvatarSettings(JSON.parse(operations[0].value));
    const next = { status: 'ready', writable: true, revision: snapshot.revision + 1, value: { document: JSON.stringify(config) } };
    // Storage failure is a failed save, never a false success.
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { throw new Error('浏览器无法保存配置（存储已满或不可用），修改已保留。'); }
    snapshot = next;
    for (const listener of watchers) listener();
  },
};
window.addEventListener('storage', event => {
  if (event.key !== storageKey || !event.newValue) return;
  try { const next = JSON.parse(event.newValue); parseAvatarSettings(JSON.parse(next.value.document)); snapshot = next; for (const listener of watchers) listener(); } catch { /* The current readable revision is retained. */ }
});
function leaveSettings() {
  mounted?.dispose(); mounted = null; unsubscribe?.(); unsubscribe = null;
  controller?.discard(); controller?.dispose(); controller = null;
}
function showPage(page) {
  leaveSettings();
  document.querySelector('#plugin-list').hidden = page !== 'list';
  document.querySelector('#plugin-detail').hidden = page !== 'detail';
  if (page === 'detail' && enabled) {
    controller = new AvatarSettingsController(scope, async () => ({ ok: true, value: { groups: demoGroups, failures: [] } }));
    mounted = mountPersonaSettings(document.querySelector('#component-slot'), { avatar: controller });
    unsubscribe = controller.subscribe(() => mounted?.render({ avatar: controller.getSnapshot() }));
    mounted.render({ avatar: controller.getSnapshot() }); void controller.refreshCatalog();
  }
  document.querySelector('#disabled-note').hidden = enabled;
  document.querySelector('#plugin-on').checked = enabled;
  document.querySelector('#card-status').textContent = enabled ? '已启用' : '已停用';
  document.querySelector('main').scrollTop = 0;
}
document.querySelector('#open-persona').addEventListener('click', () => { showPage('detail'); document.querySelector('#detail-title').focus(); });
document.querySelector('#back-to-plugins').addEventListener('click', () => { showPage('list'); document.querySelector('#open-persona').focus(); });
document.querySelector('#nav-plugins').addEventListener('click', () => showPage('list'));
document.querySelector('#plugin-on').addEventListener('change', event => { enabled = event.target.checked; disposeIcons?.(); disposeBackground?.(); disposeIcons = enabled ? installBrandIcons() : null; disposeBackground = enabled ? installDetailBackgroundObserver() : null; showPage('detail'); });
document.querySelector('#theme-toggle').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
});
showPage('list');
