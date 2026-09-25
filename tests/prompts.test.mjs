import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultAvatarSettings } from '../src/modules/avatar/settings.mjs';
import { createPersonaService } from '../src/core/persona-service.mjs';
import { defaultPromptSettings, parsePromptSettings, readPromptDocument, matchingPromptRules, targetKey, PROMPTS_NAMESPACE } from '../src/modules/prompts/settings.mjs';
import { installPromptInjection } from '../src/modules/prompts/runtime.mjs';
import { PromptSettingsController, promptCandidates } from '../src/modules/prompts/config-controller.mjs';
import { registerPromptSettings } from '../src/adapters/dsh/register-prompts.mjs';
const A = { provider: 'subscription-a', model: 'deepseek' }, B = { provider: 'subscription-b', model: 'deepseek' }, C = { provider: 'local', model: 'another' };
const single = model => ({ kind: 'model', ...model });
const group = { kind: 'persona', personaId: 'deepseek-group' };
const identity = () => ({ ...defaultAvatarSettings(), library: { schemaVersion: 2, personas: [{ id: group.personaId, revision: 1, name: 'DeepSeek', avatar: null, models: [A, B] }] } });
const rule = (id = 'r1', targets = [group], prompt = 'Keep {{template}} literal.\n\nNext line.') => ({ id, name: id, targets, prompt });
const config = (...rules) => ({ version: 1, rules });
const section = value => ({ document: JSON.stringify(value) });
const catalog = async () => ({ ok: true, value: { groups: [{ id: A.provider, name: '订阅 A', models: [{ id: A.model, name: 'DeepSeek' }] }], failures: [] } });
function scope(value, writable = true) {
  let state = { status: 'ready', value: section(value), revision: 1, writable };
  const listeners = new Set(), writes = [];
  return {
    writes, listeners, getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    replace(value) { state = { ...state, value: section(value), revision: state.revision + 1 }; for (const fn of listeners) fn(); },
    unavailable() { state = { ...state, status: 'unavailable' }; for (const fn of listeners) fn(); },
    async mutate(ops, revision) {
      assert.equal(revision, state.revision); writes.push(ops);
      this.replace(JSON.parse(ops[0].value));
    },
  };
}

// Fused-waterfall contract fixture. The selection listener mirrors installModelSelection
// in DSH dsh-v0.1.6-alpha.2; it is not a live Harness instance.
function runtime(initial = config(rule()), initialIdentity = identity()) {
  let current = initial, personas = initialIdentity;
  const listeners = [], events = [];
  const service = createPersonaService(() => section(personas));
  const ctx = {
    dshPersona: service,
    on(name, callback, options) {
      assert.equal(name, 'system-prompt/assemble');
      options?.prepend ? listeners.unshift(callback) : listeners.push(callback);
      return () => { const i = listeners.indexOf(callback); if (i >= 0) listeners.splice(i, 1); };
    },
    emit: name => events.push(name),
  };
  const off = installPromptInjection(ctx, () => section(current));
  let selection = A, beforeNext = async () => {};
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const selected = selection;
    await beforeNext();
    const resolved = await next();
    return { ...resolved, variables: { ...resolved.variables, ...selected } };
  });
  return {
    ctx, off, events, listeners,
    set: value => { current = value; }, groups: value => { personas = value; },
    select: value => { selection = value; }, delay: fn => { beforeNext = fn; },
    async assemble(context = { agent: { id: 'one' } }, complete = false) {
      const base = { sections: [{ name: 'native', text: 'Native prompt.' }], variables: {}, tools: [{ name: 'bash' }], contexts: [{ name: 'cwd' }] };
      const chain = [...listeners];
      const run = index => index === chain.length ? Promise.resolve(base) : chain[index](base, context, () => run(index + 1));
      const result = await run(0);
      return complete ? { ...result, sections: [base.sections[0]] } : result;
    },
  };
}

test('fresh prompt settings are empty and literal text survives validation', () => {
  assert.deepEqual(defaultPromptSettings(), config());
  const value = config(rule('x', [group], '  {{name}}\n```js\na < b\n```\n'));
  assert.equal(parsePromptSettings(value).rules[0].prompt, value.rules[0].prompt);
});
test('invalid schema, duplicate IDs, missing targets, unknown target kinds and empty prompts reject', () => {
  for (const input of [{}, { version: 2, rules: [] }, config(rule(), rule()), config(rule('x', [])), config(rule('x', [{ kind: 'wildcard' }])), config(rule('x', [group], ' \n ')), config({ ...rule(), name: '' })]) assert.throws(() => parsePromptSettings(input));
});
test('duplicate targets and bounded text/document limits reject', () => {
  assert.throws(() => parsePromptSettings(config(rule('x', [group, group]))), /重复/);
  assert.throws(() => parsePromptSettings(config(rule('x', [group], 'x'.repeat(64_001)))), /64000/);
  assert.throws(() => parsePromptSettings(config(...Array.from({ length: 5 }, (_, i) => rule(String(i), [group], 'x'.repeat(60_000))))), /总长度/);
  assert.throws(() => readPromptDocument({ document: 'x'.repeat(1_000_001) }));
});
test('target kinds and exact provider/model tuples cannot collide', () => {
  assert.notEqual(targetKey(single(A)), targetKey(single(B)));
  assert.notEqual(targetKey(single({ provider: 'a/b', model: 'c' })), targetKey(single({ provider: 'a', model: 'b/c' })));
  assert.notEqual(targetKey(group), targetKey(single({ provider: 'persona', model: group.personaId })));
});
test('a group applies to every current member and never to an unrelated model', () => {
  for (const model of [A, B]) assert.equal(matchingPromptRules(config(rule()), identity().library, model).length, 1);
  assert.equal(matchingPromptRules(config(rule()), identity().library, C).length, 0);
});
test('one rule hitting both group and native model is appended only once', () => {
  assert.equal(matchingPromptRules(config(rule('x', [group, single(A)])), identity().library, A).length, 1);
});
test('multiple rules use persisted list order with no silent override', () => {
  const rules = config(rule('first'), rule('second', [single(A)]));
  assert.deepEqual(matchingPromptRules(rules, identity().library, A).map(r => r.id), ['first', 'second']);
  rules.rules.reverse(); assert.deepEqual(matchingPromptRules(rules, identity().library, A).map(r => r.id), ['second', 'first']);
});
test('native-model targets work without any Persona group', () => {
  assert.equal(matchingPromptRules(config(rule('x', [single(C)])), { personas: [] }, C).length, 1);
});
test('deleted/recreated same-name groups do not inherit the old group target', () => {
  const library = identity().library; library.personas[0].id = 'different-id';
  assert.equal(matchingPromptRules(config(rule()), library, A).length, 0);
});
test('membership edits follow the stable ID; group names are not routing keys', () => {
  const library = identity().library; library.personas[0].name = 'Unified'; library.personas[0].models = [C];
  assert.equal(matchingPromptRules(config(rule()), library, A).length, 0);
  assert.equal(matchingPromptRules(config(rule()), library, C).length, 1);
});
test('Persona service exposes immutable, reference-stable committed data', () => {
  let value = section(identity()); const service = createPersonaService(() => value);
  assert.equal(service.apiVersion, 1); assert.strictEqual(service.getSnapshot(), service.getSnapshot());
  assert.equal(service.resolveModel(A).name, 'DeepSeek');
  assert.throws(() => service.listPersonas()[0].models.push(C));
  const next = identity(); next.library.personas[0].models = [C]; value = section(next);
  assert.equal(service.resolveModel(A), null); assert.equal(service.resolveModel(C).id, group.personaId);
});
test('injection appends after native sections and preserves tools, contexts and literal braces', async () => {
  const f = runtime(); const result = await f.assemble();
  assert.deepEqual(result.sections.map(s => s.name), ['native', 'dsh-persona:prompt:r1']);
  assert.equal(result.sections[1].interpolate, false); assert.equal(result.sections[1].text, rule().prompt);
  assert.deepEqual(result.tools, [{ name: 'bash' }]); assert.deepEqual(result.contexts, [{ name: 'cwd' }]); f.off();
});
test('changed model selection takes effect on the next assembly without old-model leakage', async () => {
  const f = runtime(config(rule('group'), rule('local', [single(C)])));
  assert.equal((await f.assemble()).sections[1].name, 'dsh-persona:prompt:group');
  f.select(C); assert.equal((await f.assemble()).sections[1].name, 'dsh-persona:prompt:local'); f.off();
});
test('a concurrent model switch cannot split the request route and matching prompt', async () => {
  const f = runtime(config(rule('group'), rule('local', [single(C)])));
  let release; f.delay(() => new Promise(resolve => { release = resolve; }));
  const pending = f.assemble(); f.select(C); release();
  const result = await pending; assert.equal(result.variables.provider, A.provider); assert.equal(result.sections[1].name, 'dsh-persona:prompt:group');
  f.delay(async () => {}); assert.equal((await f.assemble()).sections[1].name, 'dsh-persona:prompt:local'); f.off();
});
test('in-flight assembly uses one captured rule and group snapshot', async () => {
  const f = runtime(); let release; f.delay(() => new Promise(resolve => { release = resolve; }));
  const pending = f.assemble(); f.set(config(rule('updated'))); f.groups(defaultAvatarSettings()); release();
  assert.equal((await pending).sections[1].name, 'dsh-persona:prompt:r1');
  f.delay(async () => {}); assert.equal((await f.assemble()).sections.length, 1); f.off();
});
test('repeat steps do not accumulate injected sections and clearing removes future additions', async () => {
  const f = runtime(); for (let i = 0; i < 3; i++) assert.equal((await f.assemble()).sections.length, 2);
  f.set(config()); assert.equal((await f.assemble()).sections.length, 1); f.off();
});
test('parallel agents resolve their own assembly route', async () => {
  const f = runtime(config(rule('a', [single(A)]), rule('b', [single(B)])));
  f.select(A); const first = f.assemble({ agent: { id: 'one' } });
  f.select(B); const second = f.assemble({ agent: { id: 'two' } });
  assert.deepEqual((await Promise.all([first, second])).map(x => x.sections[1].name), ['dsh-persona:prompt:a', 'dsh-persona:prompt:b']); f.off();
});
test('diagnostics, absent route and aborted requests do not receive a prompt', async () => {
  const f = runtime(); assert.equal((await f.assemble({})).sections.length, 1);
  f.select({ provider: '', model: '' }); assert.equal((await f.assemble()).sections.length, 1);
  f.select(A); const abort = new AbortController(); abort.abort();
  assert.equal((await f.assemble({ agent: {}, signal: abort.signal })).sections.length, 1); f.off();
});
test('unloading cancels pending additions and unregisters the listener exactly once', async () => {
  const f = runtime(); let release; f.delay(() => new Promise(resolve => { release = resolve; }));
  const pending = f.assemble(); f.off(); f.off(); release();
  assert.equal((await pending).sections.length, 1); assert.equal(f.listeners.length, 1);
  assert.deepEqual(f.events, ['system-prompt/change', 'system-prompt/change']);
});
test('host complete-prompt enforcement remains authoritative after the waterfall', async () => {
  const f = runtime(); assert.deepEqual((await f.assemble({ agent: {} }, true)).sections, [{ name: 'native', text: 'Native prompt.' }]); f.off();
});
test('catalogue keeps missing selected targets removable without converting their identity', () => {
  const candidates = promptCandidates([], { personas: [] }, [rule('x', [group, single(B)])]);
  assert.equal(candidates.length, 2); assert.ok(candidates.every(row => !row.available));
  assert.deepEqual(candidates.map(row => row.target), [group, single(B)]);
});
test('prompt draft writes only its namespace and leaves Persona data unchanged', async () => {
  const prompts = scope(config()), personas = scope(identity()), controller = new PromptSettingsController(prompts, personas, catalog);
  controller.edit(doc => doc.rules.push(rule())); assert.equal(prompts.writes.length, 0);
  assert.equal(await controller.save(), true); assert.equal(prompts.writes.length, 1); assert.equal(personas.writes.length, 0);
  assert.deepEqual(JSON.parse(personas.getSnapshot().value.document), identity()); controller.dispose();
});
test('invalid drafts, save failure and revision conflicts preserve editor input', async () => {
  const prompts = scope(config(rule())), personas = scope(identity()), controller = new PromptSettingsController(prompts, personas, catalog);
  controller.edit(doc => { doc.rules[0].prompt = ''; }); assert.equal(await controller.save(), false);
  controller.edit(doc => { doc.rules[0].prompt = 'new'; }); prompts.mutate = async () => { throw new Error('save failure'); };
  assert.equal(await controller.save(), false); assert.equal(controller.getSnapshot().value.rules[0].prompt, 'new');
  prompts.replace(config(rule('remote'))); assert.equal(controller.getSnapshot().conflicted, true); assert.equal(await controller.save(), false);
  controller.discard(); assert.equal(controller.getSnapshot().value.rules[0].id, 'remote'); controller.dispose();
});
test('disabled component reports unavailable and cannot write', async () => {
  const prompts = scope(config(rule())), personas = scope(identity()), controller = new PromptSettingsController(prompts, personas, catalog);
  prompts.unavailable(); assert.equal(controller.getSnapshot().unavailable, true); assert.equal(await controller.save(), false); controller.dispose();
});
test('catalogue refresh preserves a draft and ignores responses after disposal', async () => {
  const prompts = scope(config(rule())), personas = scope(identity()); let resolve;
  const controller = new PromptSettingsController(prompts, personas, () => new Promise(r => { resolve = r; }));
  controller.edit(doc => { doc.rules[0].prompt = 'draft'; }); const request = controller.refreshCatalog();
  controller.dispose(); resolve(await catalog()); await request;
  assert.equal(prompts.listeners.size, 0); assert.equal(personas.listeners.size, 0);
});
test('native row settings register under the prompts row and clean up subscriptions', () => {
  const prompts = scope(config()), personas = scope(identity()), entries = [], effects = [];
  const ctx = {
    configForms: { get: entryId => entryId === PROMPTS_NAMESPACE ? prompts : personas },
    effect: fn => effects.push(fn()), on: () => () => {},
    remote: { $on: () => () => {}, session: { modelCatalog: catalog } },
    slots: { inject: (name, fn) => { assert.equal(name, 'plugins.row.config'); effects.push(fn()); }, register: (options, component) => { entries.push({ options, component }); return () => entries.pop(); } },
  };
  registerPromptSettings(ctx, () => null); assert.equal(entries[0].options.key, 'dsh-persona#dsh-persona-prompts');
  for (const off of effects.reverse()) off(); assert.equal(entries.length, 0); assert.equal(personas.listeners.size, 0); assert.equal(prompts.listeners.size, 0);
});
test('bundle declares a second Host component without renaming the existing row', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.equal(pkg.exports['./prompts'], './src/modules/prompts/host.mjs');
  assert.match(patch, /id: dsh-persona\r?\n\s+name: dsh-persona/); assert.match(patch, /id: dsh-persona-prompts\r?\n\s+name: dsh-persona\/prompts/);
});
