import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ComponentSettingsController } from '../src/core/component-settings.mjs';
import { AvatarSettingsController, avatarModelCandidates } from '../src/modules/avatar/config-controller.mjs';
import { defaultAvatarSettings, parseAvatarSettings, AVATAR_NAMESPACE } from '../src/modules/avatar/settings.mjs';
import { registerPersonaSettings } from '../src/adapters/dsh/register-settings.mjs';
import { components, reservedComponents } from '../src/modules/components.mjs';

function configured() {
  const c = defaultAvatarSettings();
  c.library.personas.push({ id: 'p1', revision: 1, name: '测试显示', avatar: null, models: [] });
  return c;
}
function scopeFixture(options = {}) {
  let state = { status: 'ready', writable: options.writable ?? true, revision: 3, value: { document: JSON.stringify(configured()) } };
  const listeners = new Set(), writes = [];
  return {
    writes, listeners, getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    remoteChange(config = configured()) { state = { ...state, revision: state.revision + 1, value: { document: JSON.stringify(config) } }; for (const fn of listeners) fn(); },
    setRaw(raw) { state = { ...state, value: { document: raw } }; for (const fn of listeners) fn(); },
    async mutate(operations, revision) {
      writes.push({ operations, revision });
      assert.equal(revision, state.revision);
      if (options.reject) throw new Error('模拟保存失败');
      if (options.ignore) return;
      state = { ...state, revision: state.revision + 1, value: { document: operations[0].value } };
      for (const fn of listeners) fn();
    },
  };
}
const makeController = scope => new ComponentSettingsController(scope, { defaults: defaultAvatarSettings, parse: parseAvatarSettings });
const changeName = name => c => { c.library.personas[0].name = name; };
const catalog = async () => ({ ok: true, value: { groups: [{ id: 'p', name: '提供方', models: [{ id: 'm1', name: '模型一' }, { id: 'm2', name: '模型二' }] }], failures: [] } });

test('component draft only writes on explicit save, with original namespace revision', async () => {
  const scope = scopeFixture(), controller = makeController(scope);
  controller.edit(changeName('新名字')); assert.equal(scope.writes.length, 0); assert.equal(controller.getSnapshot().dirty, true);
  assert.equal(await controller.save(), true); assert.equal(scope.writes.length, 1);
  assert.equal(scope.writes[0].revision, 3); assert.deepEqual(scope.writes[0].operations[0].path, ['document']);
  assert.equal(controller.getSnapshot().saved, true); assert.equal(controller.getSnapshot().dirty, false); controller.dispose();
});
test('leaving a component discards unsaved fields', () => {
  const scope = scopeFixture(), c = makeController(scope); c.edit(changeName('未保存')); c.discard();
  assert.equal(c.getSnapshot().value.library.personas[0].name, '测试显示'); assert.equal(scope.writes.length, 0); c.dispose();
});
test('invalid fields stay visible and block save', async () => {
  const scope = scopeFixture(), c = makeController(scope); c.edit(changeName(''));
  assert.match(c.getSnapshot().validationError, /不能为空/); assert.equal(c.getSnapshot().value.library.personas[0].name, '');
  assert.equal(await c.save(), false); assert.equal(scope.writes.length, 0); c.dispose();
});
test('normalization is reflected only after the host confirms', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const scope = scopeFixture(), c = makeController(scope);
  t.after(() => c.dispose());
  c.edit(changeName('  hello  '));
  assert.equal(c.getSnapshot().value.library.personas[0].name, '  hello  ');
  assert.equal(await c.save(), true);
  assert.equal(c.getSnapshot().value.library.personas[0].name, 'hello');
  assert.equal(c.getSnapshot().dirty, false);
  assert.equal(c.getSnapshot().saved, true);
  t.mock.timers.tick(5_000);
  assert.equal(scope.writes.length, 1);
});
test('revision conflict refuses write and retains the local draft', async () => {
  const scope = scopeFixture(), c = makeController(scope); c.edit(changeName('本地'));
  const remote = configured(); remote.library.personas[0].name = '远端'; scope.remoteChange(remote);
  assert.equal(c.getSnapshot().conflicted, true); assert.equal(await c.save(), false); assert.equal(scope.writes.length, 0);
  assert.equal(c.getSnapshot().value.library.personas[0].name, '本地');
  c.discard(); assert.equal(c.getSnapshot().value.library.personas[0].name, '远端'); c.dispose();
});
test('failed save keeps draft and reports failure', async () => {
  const scope = scopeFixture({ reject: true }), c = makeController(scope); c.edit(changeName('待重试'));
  assert.equal(await c.save(), false); assert.equal(c.getSnapshot().dirty, true); assert.match(c.getSnapshot().error, /失败/); c.dispose();
});
test('resolved mutation without confirmed saved value is not success', async () => {
  const scope = scopeFixture({ ignore: true }), c = makeController(scope); c.edit(changeName('待确认'));
  assert.equal(await c.save(), false); assert.equal(c.getSnapshot().saved, false); assert.match(c.getSnapshot().error, /确认/); c.dispose();
});
test('read-only scope cannot stage or save', async () => {
  const scope = scopeFixture({ writable: false }), c = makeController(scope); c.edit(changeName('禁止'));
  assert.equal(c.getSnapshot().dirty, false); assert.equal(await c.save(), false); assert.equal(scope.writes.length, 0); c.dispose();
});
test('corrupt persisted state is not overwritten by defaults', async () => {
  const scope = scopeFixture(); scope.setRaw('{oops'); const c = makeController(scope);
  assert.equal(c.getSnapshot().available, false); assert.match(c.getSnapshot().error, /无法读取/);
  c.edit(changeName('不可写')); assert.equal(await c.save(), false); assert.equal(scope.writes.length, 0); c.dispose();
});
test('component namespace and settings validation are independent of future components', () => {
  assert.equal(AVATAR_NAMESPACE, 'dsh-persona-avatar'); assert.deepEqual(components.map(c => c.id), ['avatar', 'prompts']);
  assert.equal(reservedComponents.every(c => c.status === 'reserved'), true);
  const old = { ...configured(), version: 2, enabled: false, showUser: false, showAssistant: false, showNames: false, size: 28 };
  const next = parseAvatarSettings(old);
  assert.equal(next.version, 3); assert.equal('size' in next, false); assert.equal('enabled' in next, false);
});
test('one persona retains multiple routes, including a vanished provider', () => {
  const c = configured(); c.library.personas[0].models = [{ provider: 'p', model: 'm1' }, { provider: 'gone', model: 'm2' }];
  const rows = avatarModelCandidates([{ id: 'p', name: 'P', models: [{ id: 'm1', name: 'M1' }] }], c.library);
  assert.equal(rows.length, 2); assert.equal(rows[1].available, false); assert.equal(rows[1].provider, 'gone');
});
test('catalog refresh uses real provider/model identities and preserves edits', async () => {
  const scope = scopeFixture(), c = new AvatarSettingsController(scope, catalog); c.edit(changeName('编辑中'));
  await c.refreshCatalog(); assert.equal(c.getSnapshot().candidates.length, 2);
  assert.equal(c.getSnapshot().candidates[0].provider, 'p'); assert.equal(c.getSnapshot().value.library.personas[0].name, '编辑中'); c.dispose();
});
test('late catalog response after disposal publishes nothing', async () => {
  let finish; const source = scopeFixture();
  const c = new AvatarSettingsController(source, () => new Promise(resolve => { finish = resolve; }));
  let notifications = 0; c.subscribe(() => notifications++); const request = c.refreshCatalog(); c.dispose(); const after = notifications;
  finish(await catalog()); await request; assert.equal(notifications, after); assert.equal(source.listeners.size, 0);
});
test('older catalog request cannot overwrite a newer directory', async () => {
  const source = scopeFixture(), pending = [];
  const c = new AvatarSettingsController(source, () => new Promise(resolve => pending.push(resolve)));
  const first = c.refreshCatalog(), second = c.refreshCatalog(); pending[1](await catalog()); await second;
  pending[0]({ ok: true, value: { groups: [], failures: [] } }); await first;
  assert.equal(c.getSnapshot().candidates.length, 2); c.dispose();
});
function contextFixture() {
  const scope = scopeFixture(), entries = [], effects = [], events = new Set();
  const listen = (name, fn) => { const entry = { name, fn }; events.add(entry); return () => events.delete(entry); };
  const ctx = {
    settingsScope: { bind(options) { assert.equal(options.namespace, AVATAR_NAMESPACE); return scope; } },
    effect(fn) { effects.push(fn()); }, on: listen,
    remote: { session: { modelCatalog: catalog }, $on: listen },
    slots: {
      inject(name, fn) { assert.equal(name, 'plugins.row.config'); effects.push(fn()); },
      register(options, component) { entries.push({ options, component }); return () => { entries.length = 0; }; },
    },
  };
  return { ctx, entries, events, scope, dispose() { for (const off of effects.reverse()) off?.(); } };
}
test('Persona settings register on the Persona row and unload subscriptions', async () => {
  const f = contextFixture(), component = () => null; registerPersonaSettings(f.ctx, component);
  await Promise.resolve(); assert.equal(f.entries.length, 1); const [entry] = f.entries;
  assert.equal(entry.options.name, 'plugins.row.config'); assert.equal(entry.options.key, 'dsh-persona#dsh-persona');
  assert.ok(entry.options.inject().hooks.avatarSettings); assert.equal(entry.component, component);
  f.dispose(); assert.equal(f.entries.length, 0); assert.equal(f.events.size, 0); assert.equal(f.scope.listeners.size, 0);
});
test('built native lazy factory shares React and has no DOM or registration effects before apply', () => {
  const script = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'); let registration;
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } } });
  assert.equal(registration.id, 'dsh-persona'); const imports = [];
  const exports = registration.factory(spec => { imports.push(spec); if (spec !== 'react') throw new Error(spec); return {}; });
  assert.deepEqual(imports, ['react']); assert.equal(typeof exports.apply, 'function');
  const summary = exports.PersonaPluginConfig({ view: 'summary' });
  assert.equal(typeof summary, 'string');
  assert.ok(summary.trim().length > 0); // Summary renders without mounting the form or requiring DOM.
});
test('manifest package key, bundle row and native artifact agree', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.equal(pkg.name, 'dsh-persona'); assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.engines.dsh, '0.1.6-alpha.2'); assert.match(patch, /name: dsh-persona/);
  assert.equal(pkg.exports['./client'], './lib/client.js'); assert.equal(pkg.dsh.client.platform, 'web');
  assert.ok(!readFileSync(new URL('../src/adapters/dsh/register-settings.mjs', import.meta.url), 'utf8').includes('plugins.bundle.config'));
});
