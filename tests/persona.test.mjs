import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseState, modelKey, resolvePersona, captureIdentity, savePersona, assignModels,
  unassignModel, deletePersona, parsePersona, parseIdentity } from '../src/core/persona.mjs';
import { defaultAvatarSettings, parseAvatarSettings } from '../src/modules/avatar/settings.mjs';
import { ModuleRegistry } from '../src/core/modules.mjs';
import { initials } from '../src/modules/avatar/index.mjs';
const A = { provider: 'subscription-a', model: 'deepseek' };
const B = { provider: 'subscription-b', model: 'deepseek' };
const C = { provider: 'other', model: 'model-c' };
const USER = { name: '测试用户', avatar: null };
function fixture() { return parseState({ schemaVersion: 2, personas: [
  { id: 'ds', revision: 1, name: 'DeepSeek', avatar: null, models: [A, B] },
  { id: 'other', revision: 1, name: '自定义名称', avatar: null, models: [C] },
] }); }

test('fresh install starts with an empty Persona collection and a separate user', () => {
  const c = defaultAvatarSettings(); assert.deepEqual(c.library.personas, []);
  assert.deepEqual(c.user, { name: '你', avatar: null });
  assert.equal('user' in c.library, false); assert.equal('defaultPersonaId' in c.library, false);
  assert.deepEqual(parseAvatarSettings(c), c);
});
test('several subscriptions with the same model label share one user-named Persona', () => {
  const c = fixture(); assert.equal(resolvePersona(c, A).id, 'ds'); assert.equal(resolvePersona(c, B).name, 'DeepSeek');
});
test('arbitrary models can all share one Persona by explicit assignment', () => {
  const c = assignModels(fixture(), 'ds', [A, B, C], { confirmMove: true });
  for (const m of [A, B, C]) assert.equal(resolvePersona(c, m).name, 'DeepSeek');
  assert.equal(c.personas[1].models.length, 0);
});
test('unknown model keeps host display without a default assignment', () => {
  assert.equal(resolvePersona(fixture(), { provider: 'new', model: 'new' }), null);
  assert.equal(resolvePersona({ schemaVersion: 2, personas: [] }, A), null);
});
test('providers with the same model name remain distinct exact routes', () => assert.notEqual(modelKey(A), modelKey(B)));
test('separator-containing identifiers do not collide', () => assert.notEqual(modelKey({ provider: 'a/b', model: 'c' }), modelKey({ provider: 'a', model: 'b/c' })));
test('moving a model between Personas requires explicit confirmation', () => {
  const c = fixture(); assert.throws(() => assignModels(c, 'other', [A]), /确认/);
  assert.equal(resolvePersona(c, A).id, 'ds');
  const next = assignModels(c, 'other', [A], { confirmMove: true });
  assert.equal(resolvePersona(next, A).id, 'other'); assert.equal(resolvePersona(next, B).id, 'ds');
});
test('select all uses only supplied current routes and does not create a wildcard', () => {
  const c = assignModels(fixture(), 'ds', [C], { confirmMove: true });
  assert.equal(c.personas[0].models.length, 3);
  assert.equal(resolvePersona(c, { provider: 'future', model: 'deepseek' }), null);
});
test('unassigning restores host display and does not select a different Persona', () => {
  const c = unassignModel(fixture(), 'ds', A); assert.equal(resolvePersona(c, A), null);
  assert.equal(resolvePersona(c, B).id, 'ds');
});
test('all Personas may be deleted while the user stays independently editable', () => {
  let c = fixture(); c = deletePersona(deletePersona(c, 'ds'), 'other');
  assert.deepEqual(c.personas, []); const snapshot = captureIdentity(c, USER, A);
  assert.equal(snapshot.user.name, USER.name); assert.equal(snapshot.assistant, null);
});
test('Persona has only a display identity and exact model associations', () => {
  assert.deepEqual(Object.keys(parsePersona(fixture().personas[0])).sort(), ['avatar','id','models','name','revision']);
  assert.throws(() => parsePersona({ ...fixture().personas[0], userOverride: USER }), /用户/);
});
test('changing AI display never changes user identity', () => {
  const before = fixture(); const c = savePersona(before, { ...before.personas[0], name: '统一显示' });
  assert.deepEqual(captureIdentity(c, USER, A).user, USER);
  assert.deepEqual(captureIdentity(c, USER, C).user, USER);
  assert.deepEqual(before, fixture());
});
test('changing user display never mutates a Persona', () => {
  const c = fixture(); const editedUser = { name: '新的用户名', avatar: null };
  assert.deepEqual(captureIdentity(c, editedUser, B).user, editedUser);
  assert.deepEqual(c, fixture());
});
test('optional snapshot keeps actual route and user independently', () => {
  const s = captureIdentity(fixture(), USER, B); assert.deepEqual(s.model, B); assert.deepEqual(s.user, USER);
});
test('editing Persona does not alter captured display', () => {
  const c = fixture(), before = captureIdentity(c, USER, A);
  const after = savePersona(c, { ...c.personas[0], name: '别名' });
  assert.equal(before.assistant.name, 'DeepSeek'); assert.equal(captureIdentity(after, USER, A).assistant.name, '别名');
  assert.equal(after.personas[0].revision, 2);
});
test('snapshot is immutable', () => assert.throws(() => { captureIdentity(fixture(), USER, A).assistant.name = 'changed'; }, TypeError));
test('different Personas can intentionally have the same display name', () => {
  const c = fixture(); c.personas[1].name = 'DeepSeek'; assert.equal(parseState(c).personas.length, 2);
});
test('empty associated model list is valid', () => {
  const c = fixture(); c.personas[0].models = []; assert.equal(parseState(c).personas[0].models.length, 0);
});
test('schema rejects unsupported versions and library-level assignment rules', () => {
  assert.throws(() => parseState({ ...fixture(), schemaVersion: 3 }), /schema/);
  assert.throws(() => parseState({ ...fixture(), defaultPersonaId: 'ds' }), /规则/);
});
test('unsupported settings format is rejected', () => {
  assert.throws(() => parseAvatarSettings({ version: 1, library: {} }), /不支持/);
});
test('schema rejects duplicate Persona IDs', () => {
  const c = fixture(); c.personas.push(c.personas[0]); assert.throws(() => parseState(c), /Duplicate/);
});
test('schema refuses ambiguous display assignments instead of picking a preferred Persona', () => {
  const c = fixture(); c.personas[1].models.push(A); assert.throws(() => parseState(c), /已关联/);
});
test('schema rejects duplicate models within one Persona', () => {
  const c = fixture(); c.personas[0].models.push(A); assert.throws(() => parseState(c), /duplicate model/);
});
test('avatar rejects remote URLs, executable SVG and oversized payloads', () => {
  for (const avatar of ['https://example.com/avatar.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,' + 'A'.repeat(1_000_001)]) {
    assert.throws(() => parseIdentity({ name: 'x', avatar }), /avatar/);
  }
});
test('raster data URL is accepted as a reference; image decoding is a separate browser step', () => assert.equal(parseIdentity({ name: 'x', avatar: 'data:image/png;base64,AAAA' }).name, 'x'));
test('unicode fallback does not split grapheme clusters', () => {
  assert.equal(initials('泉水'), '泉水'); assert.equal(initials('  alex '), 'AL'); assert.equal(initials('👩‍💻'), '👩‍💻');
});
test('registry rejects duplicates and reserved module activation', () => {
  const r = new ModuleRegistry(); r.register({ id: 'next', title: 'Next', apiVersion: 1, status: 'reserved' });
  assert.throws(() => r.enable('next', {}), /unavailable/);
  assert.throws(() => r.register({ id: 'next', apiVersion: 1, status: 'reserved' }), /Duplicate/);
});
test('registry enables and disables once', () => {
  let mounts = 0, disposals = 0; const r = new ModuleRegistry();
  r.register({ id: 'avatar', apiVersion: 1, status: 'available', activate() { mounts++; return () => { disposals++; }; } });
  r.enable('avatar', {}); r.enable('avatar', {}); r.disable('avatar'); r.disable('avatar');
  assert.equal(mounts, 1); assert.equal(disposals, 1);
});
test('registry unloads in reverse order and continues on cleanup failure', () => {
  const calls = []; const r = new ModuleRegistry();
  for (const id of ['a', 'b']) r.register({ id, apiVersion: 1, status: 'available', activate() { return () => { calls.push(id); if (id === 'b') throw Error('b'); }; } });
  r.enable('a', {}); r.enable('b', {}); assert.throws(() => r.dispose(), AggregateError); assert.deepEqual(calls, ['b', 'a']);
  r.dispose();
});
test('failed module activation is not marked active', () => {
  const r = new ModuleRegistry(); r.register({ id: 'bad', apiVersion: 1, status: 'available', activate() { throw Error('no'); } });
  assert.throws(() => r.enable('bad', {}), /no/); assert.equal(r.list()[0].active, false);
});
