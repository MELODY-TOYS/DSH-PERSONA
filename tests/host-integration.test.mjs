import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { Context } from '@deepseek-ai/cordis';
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit';
import * as avatarHost from '../src/adapters/dsh/host.mjs';
import * as promptsHost from '../src/modules/prompts/host.mjs';
import { importLegacySection, readLegacySection } from '../src/adapters/dsh/live-document.mjs';
import { AVATAR_LEGACY_SECTION, AVATAR_NAMESPACE, defaultAvatarSettings } from '../src/modules/avatar/settings.mjs';
import { PROMPTS_NAMESPACE } from '../src/modules/prompts/settings.mjs';

function avatarDocument(name = 'QA') {
  const avatar = defaultAvatarSettings();
  avatar.library.personas.push({ id: 'qa', revision: 1, name, avatar: null,
    models: [{ provider: 'qa-provider', model: 'qa-model' }] });
  return JSON.stringify(avatar);
}
const promptDocument = JSON.stringify({ version: 1, rules: [{
  id: 'qa-rule', name: 'QA rule', prompt: 'literal {{provider}}',
  targets: [{ kind: 'persona', personaId: 'qa' },
    { kind: 'model', provider: 'qa-provider', model: 'qa-model' }],
}] });

async function fixture(t) {
  const root = new Context();
  t.after(() => root.fiber.dispose());
  root.provide('systemPrompt', {});
  const avatarFiber = root.plugin(avatarHost, { document: avatarDocument() });
  await avatarFiber;
  return { root, avatarFiber };
}
function persona(root) {
  let service;
  return root.plugin({ inject: ['dshPersona'], apply(ctx) { service = ctx.dshPersona; } }).then(() => service);
}

test('Host publishes a callable Persona service through the real Cordis container', async t => {
  const { root } = await fixture(t);
  const service = await persona(root);
  assert.equal(service.apiVersion, 1);
  assert.equal(service.getSnapshot().library.personas[0].id, 'qa');
  assert.equal(service.resolveModel({ provider: 'qa-provider', model: 'qa-model' }).name, 'QA');
  assert.ok(Object.isFrozen(service.getSnapshot()));
});

test('Host prompts consume the provided service once per rule and unload with it', async t => {
  const { root, avatarFiber } = await fixture(t);
  await root.plugin(promptsHost, { document: promptDocument });
  root.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const result = await next();
    return { ...result, variables: { provider: 'qa-provider', model: 'qa-model' } };
  });
  const assemble = () => {
    const assembly = { sections: [], contexts: [], tools: [], variables: {} };
    return root.waterfall('system-prompt/assemble', assembly, { agent: {} },
      () => Promise.resolve(assembly));
  };
  assert.deepEqual((await assemble()).sections, [{
    name: 'dsh-persona:prompt:qa-rule', text: 'literal {{provider}}', interpolate: false,
  }]);
  await avatarFiber.dispose();
  assert.equal(root.get('dshPersona'), undefined);
  assert.deepEqual((await assemble()).sections, []);
});

test('an unsaved entry reads the default document', async t => {
  const root = new Context();
  t.after(() => root.fiber.dispose());
  await root.plugin(avatarHost, {});
  const service = await persona(root);
  assert.deepEqual(service.getSnapshot(), defaultAvatarSettings());
});

test('live document updates reach the service and request a prompt reassembly', async t => {
  const { root, avatarFiber } = await fixture(t);
  const service = await persona(root);
  let changes = 0;
  root.on('system-prompt/change', () => { changes++; });
  updateVolatile(avatarFiber.config.document, createVolatile(avatarDocument('Renamed')));
  root.emit('loader/volatile-update', [['document']]);
  assert.equal(changes, 1);
  assert.equal(service.resolveModel({ provider: 'qa-provider', model: 'qa-model' }).name, 'Renamed');
});

test('writes pass through the component validator before the Loader commits them', async t => {
  const { root, avatarFiber } = await fixture(t);
  const promptsFiber = root.plugin(promptsHost, { document: promptDocument });
  await promptsFiber;
  // The Loader dispatches with the plugin's own fiber, as `plugin(...).ctx.fiber`.
  const check = (fiber, raw) => root.waterfall(fiber.ctx.fiber, 'internal/config', raw, () => raw);
  assert.throws(() => check(avatarFiber, { document: '{oops' }));
  assert.throws(() => check(avatarFiber, { document: JSON.stringify({ version: 9 }) }), /不支持此配置格式/);
  assert.throws(() => check(promptsFiber, { document: JSON.stringify({ version: 1, rules: [{}] }) }));
  const valid = { document: avatarDocument('Next') };
  assert.equal(check(avatarFiber, valid), valid);
  assert.deepEqual(check(avatarFiber, {}), {});
  // Each validator only answers for its own entry.
  const other = root.plugin({ apply() {} });
  await other;
  assert.deepEqual(check(other, { document: '{oops' }), { document: '{oops' });
});

test('the generated settings form stays off for both components', async t => {
  const root = new Context();
  t.after(() => root.fiber.dispose());
  const owners = new Set();
  root.provide('settings', {
    describe: () => [],
    configure(presentation, owner) {
      assert.deepEqual(presentation, { auto: false });
      owners.add(owner);
      return () => owners.delete(owner);
    },
  });
  root.provide('systemPrompt', {});
  const avatarFiber = root.plugin(avatarHost, {});
  await avatarFiber;
  const promptsFiber = root.plugin(promptsHost, {});
  await promptsFiber;
  assert.equal(owners.size, 2);
  assert.ok(owners.has(avatarFiber.ctx.fiber) && owners.has(promptsFiber.ctx.fiber));
  await promptsFiber.dispose();
  assert.equal(owners.size, 1);
  assert.ok(owners.has(avatarFiber.ctx.fiber));
});

async function legacyHome(t, content, name = 'settings.yaml') {
  const home = await mkdtemp(join(tmpdir(), 'dsh-persona-legacy-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  if (content !== undefined) await writeFile(join(home, name), stringify(content));
  return home;
}
function legacyContext({ home, user = {}, revision = 3, update } = {}) {
  const writes = [], warnings = [];
  const settings = {
    describe: () => [{ ns: AVATAR_NAMESPACE, user, revision }],
    async update(ns, patch, expected) {
      writes.push({ ns, patch, expected });
      await update?.();
      user = patch;
    },
  };
  const services = { settings, profileContext: { home }, loader: { await: async () => {} } };
  const ctx = {
    get: name => services[name],
    logger: { info() {}, warn(...args) { warnings.push(args); } },
  };
  return { ctx, writes, warnings };
}
const importAvatar = (ctx, isDisposed = () => false) => importLegacySection(ctx, {
  entryId: AVATAR_NAMESPACE, legacySection: AVATAR_LEGACY_SECTION, isDisposed,
  validate: document => { if (!JSON.parse(document).library) throw new TypeError('invalid'); },
});

test('the DSH 0.1.6 Persona section moves into the dsh-persona entry once', async t => {
  const document = avatarDocument();
  const home = await legacyHome(t, { [AVATAR_LEGACY_SECTION]: { document }, other: { value: 1 } });
  const f = legacyContext({ home });
  await importAvatar(f.ctx);
  assert.deepEqual(f.writes, [{ ns: AVATAR_NAMESPACE, patch: { document }, expected: 3 }]);
  await importAvatar(f.ctx);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.warnings, []);
});

test('the legacy import reads the file DSH 0.1.7 already renamed', async t => {
  const document = avatarDocument();
  const home = await legacyHome(t, { [AVATAR_LEGACY_SECTION]: { document } }, 'settings.yaml.imported');
  assert.equal(await readLegacySection(home, AVATAR_LEGACY_SECTION), document);
  assert.equal(await readLegacySection(home, 'missing'), undefined);
});

test('the legacy import leaves saved, missing and unreadable sections alone', async t => {
  const document = avatarDocument();
  const saved = legacyContext({ home: await legacyHome(t, { [AVATAR_LEGACY_SECTION]: { document } }), user: { document: '{}' } });
  await importAvatar(saved.ctx);
  assert.equal(saved.writes.length, 0);

  const missing = legacyContext({ home: await legacyHome(t) });
  await importAvatar(missing.ctx);
  assert.equal(missing.writes.length, 0);
  assert.deepEqual(missing.warnings, []);

  const invalid = legacyContext({ home: await legacyHome(t, { [AVATAR_LEGACY_SECTION]: { document: '{}' } }) });
  await importAvatar(invalid.ctx);
  assert.equal(invalid.writes.length, 0);
  assert.equal(invalid.warnings.length, 2);

  const disposed = legacyContext({ home: await legacyHome(t, { [AVATAR_LEGACY_SECTION]: { document } }) });
  await importAvatar(disposed.ctx, () => true);
  assert.equal(disposed.writes.length, 0);
});

test('a revision refusal after DSH saved the same section stays quiet', async t => {
  const document = avatarDocument();
  const home = await legacyHome(t, { [AVATAR_LEGACY_SECTION]: { document } });
  const refused = legacyContext({ home, update: () => { throw new Error('changed since it was read'); } });
  refused.ctx.get('settings').describe = (() => {
    let calls = 0;
    return () => [{ ns: AVATAR_NAMESPACE, user: ++calls > 2 ? { document } : {}, revision: 3 }];
  })();
  await importAvatar(refused.ctx);
  assert.deepEqual(refused.warnings, []);

  const failed = legacyContext({ home, update: () => { throw new Error('offline'); } });
  failed.ctx.get('settings').update = async () => { throw new Error('offline'); };
  await importAvatar(failed.ctx);
  assert.equal(failed.warnings.length, 2);
});

test('the prompts entry keeps its DSH 0.1.6 section name', () => {
  assert.equal(PROMPTS_NAMESPACE, 'dsh-persona-prompts');
});
