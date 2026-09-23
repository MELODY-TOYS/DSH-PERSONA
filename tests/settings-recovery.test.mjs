import test from 'node:test';
import assert from 'node:assert/strict';
import { ComponentSettingsController } from '../src/core/component-settings.mjs';
import { registerPersonaSettings } from '../src/adapters/dsh/register-settings.mjs';
import { registerPromptSettings } from '../src/adapters/dsh/register-prompts.mjs';
import { AVATAR_NAMESPACE, defaultAvatarSettings } from '../src/modules/avatar/settings.mjs';
import { PROMPTS_NAMESPACE } from '../src/modules/prompts/settings.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const parse = value => ({ name: value.name });
const defaults = () => ({ name: 'A' });

function scope(initial = defaults()) {
  let snapshot = { status: 'ready', writable: true, revision: 1, sourceId: 'host-a',
    value: { document: JSON.stringify(initial) } };
  let fail = false, gate;
  const listeners = new Set(), writes = [];
  const publish = () => { for (const listener of listeners) listener(); };
  return {
    writes, listeners,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    fail(value) { fail = value; },
    hold() { gate = Promise.withResolvers(); return gate; },
    replace(value, revision = snapshot.revision + 1, sourceId = snapshot.sourceId) {
      snapshot = { ...snapshot, revision, sourceId, value: { document: JSON.stringify(value) } };
      publish();
    },
    async mutate(ops, revision) {
      writes.push({ value: JSON.parse(ops[0].value), revision });
      if (gate) { const pending = gate; gate = undefined; await pending.promise; }
      if (fail) throw new Error('保存失败。');
      assert.equal(revision, snapshot.revision);
      snapshot = { ...snapshot, revision: revision + 1, value: { document: ops[0].value } };
      publish();
    },
  };
}
function controller(t, source) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const value = new ComponentSettingsController(source, { parse, defaults });
  t.after(() => value.dispose());
  return value;
}

test('reverting an idle draft follows subsequent saved changes without a conflict', t => {
  const source = scope(), c = controller(t, source);
  c.edit(value => { value.name = 'B'; });
  c.edit(value => { value.name = 'A'; });
  source.replace({ name: 'C' });
  assert.equal(c.getSnapshot().value.name, 'C');
  assert.equal(c.getSnapshot().dirty, false);
  assert.equal(c.getSnapshot().conflicted, false);
  t.mock.timers.tick(1_000);
  assert.equal(source.writes.length, 0);
});

test('reverting while a save is in flight writes the restored value after settlement', async t => {
  const source = scope(), pending = source.hold(), c = controller(t, source);
  c.edit(value => { value.name = 'B'; });
  const saving = c.save();
  c.edit(value => { value.name = 'A'; });
  pending.resolve();
  assert.equal(await saving, true);
  assert.equal(c.getSnapshot().value.name, 'A');
  assert.equal(c.getSnapshot().dirty, true);
  t.mock.timers.tick(500);
  await flush();
  assert.deepEqual(source.writes.map(row => row.value.name), ['B', 'A']);
  assert.equal(JSON.parse(source.getSnapshot().value.document).name, 'A');
  assert.equal(c.getSnapshot().dirty, false);
});

test('reverting a failed draft releases its old revision', async t => {
  const source = scope(), c = controller(t, source);
  source.fail(true);
  c.edit(value => { value.name = 'B'; });
  assert.equal(await c.save(), false);
  c.edit(value => { value.name = 'A'; });
  source.replace({ name: 'C' });
  assert.equal(c.getSnapshot().value.name, 'C');
  assert.equal(c.getSnapshot().conflicted, false);
  assert.equal(c.getSnapshot().error, '');
});

test('an identical revision on another source cannot authorize an old draft', async t => {
  const source = scope(), c = controller(t, source);
  c.edit(value => { value.name = 'B'; });
  source.replace({ name: 'A' }, 1, 'host-b');
  assert.equal(c.getSnapshot().value.name, 'B');
  assert.equal(c.getSnapshot().conflicted, true);
  t.mock.timers.tick(1_000);
  assert.equal(await c.save(), false);
  assert.equal(source.writes.length, 0);
});

test('a source change during a write cannot acknowledge or rebase the newer draft', async t => {
  const source = scope(), pending = source.hold(), c = controller(t, source);
  c.edit(value => { value.name = 'B'; });
  const saving = c.save();
  c.edit(value => { value.name = 'C'; });
  source.replace({ name: 'A' }, 1, 'host-b');
  pending.resolve();
  assert.equal(await saving, false);
  assert.equal(c.getSnapshot().value.name, 'C');
  assert.equal(c.getSnapshot().saved, false);
  assert.equal(c.getSnapshot().conflicted, true);
  t.mock.timers.tick(1_000);
  assert.equal(source.writes.length, 1);
});

function registration(t, kind) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const avatar = scope(defaultAvatarSettings());
  const prompts = scope({ version: 1, rules: [{ id: 'rule', name: 'A', prompt: 'literal {{provider}}',
    targets: [{ kind: 'model', provider: 'p', model: 'm' }] }] });
  const effects = [], events = new Set();
  const on = (name, fn) => { const entry = { name, fn }; events.add(entry); return () => events.delete(entry); };
  const ctx = {
    settingsScope: { bind({ namespace }) { return namespace === AVATAR_NAMESPACE ? avatar : prompts; } },
    remote: { $host: { home: 'host-a' }, $on: on,
      session: { modelCatalog: async () => ({ ok: true, value: { groups: [], failures: [] } }) } },
    on,
    effect(fn) { effects.push(fn()); },
    slots: { inject(_name, fn) { effects.push(fn()); }, register() { return () => {}; } },
  };
  const dispose = () => { for (const off of effects.splice(0).reverse()) off?.(); };
  t.after(dispose);
  const c = kind === 'avatar' ? registerPersonaSettings(ctx, () => null) : registerPromptSettings(ctx, () => null);
  return {
    c, avatar, prompts, events, dispose,
    source: kind === 'avatar' ? avatar : prompts,
    edit(name) { c.edit(value => { if (kind === 'avatar') value.user.name = name; else value.rules[0].name = name; }); },
    name() { const value = c.getSnapshot().value; return kind === 'avatar' ? value.user.name : value.rules[0].name; },
    reconnect(home = 'host-a') {
      ctx.remote.$host = { home };
      for (const event of [...events]) if (event.name === 'connection/reset') event.fn();
    },
  };
}

for (const kind of ['avatar', 'prompts']) {
  test(`${kind}: reconnect retains a queued draft and the next save uses it`, async t => {
    const f = registration(t, kind);
    f.edit('本地草稿'); f.reconnect();
    assert.equal(f.name(), '本地草稿');
    assert.equal(f.source.writes.length, 0);
    t.mock.timers.tick(500);
    await flush();
    assert.equal(f.source.writes.length, 1);
    const saved = JSON.parse(f.source.getSnapshot().value.document);
    assert.equal(kind === 'avatar' ? saved.user.name : saved.rules[0].name, '本地草稿');
  });

  test(`${kind}: reconnect retains a failed draft until explicit retry`, async t => {
    const f = registration(t, kind);
    f.source.fail(true); f.edit('待重试');
    assert.equal(await f.c.save(), false);
    f.reconnect();
    assert.equal(f.name(), '待重试');
    assert.match(f.c.getSnapshot().error, /失败/);
    t.mock.timers.tick(1_000);
    assert.equal(f.source.writes.length, 1);
    f.source.fail(false);
    assert.equal(await f.c.save(), true);
    assert.equal(f.source.writes.length, 2);
  });

  test(`${kind}: reconnect and a newer remote revision preserve the local conflict`, async t => {
    const f = registration(t, kind);
    f.edit('本地草稿'); f.reconnect();
    const next = JSON.parse(f.source.getSnapshot().value.document);
    if (kind === 'avatar') next.user.name = '远端'; else next.rules[0].name = '远端';
    f.source.replace(next);
    assert.equal(f.name(), '本地草稿');
    assert.equal(f.c.getSnapshot().conflicted, true);
    t.mock.timers.tick(1_000);
    assert.equal(await f.c.save(), false);
    assert.equal(f.source.writes.length, 0);
  });

  test(`${kind}: a different Host cannot receive a queued draft with the same revision`, async t => {
    const f = registration(t, kind);
    f.edit('留在原宿主'); f.reconnect('host-b');
    assert.equal(f.name(), '留在原宿主');
    assert.equal(f.c.getSnapshot().conflicted, true);
    t.mock.timers.tick(1_000);
    assert.equal(await f.c.save(), false);
    assert.equal(f.source.writes.length, 0);
  });

  test(`${kind}: disposal detaches reconnect observers and cancels queued writes`, t => {
    const f = registration(t, kind);
    f.edit('未提交'); f.dispose(); f.reconnect();
    t.mock.timers.tick(1_000);
    assert.equal(f.source.writes.length, 0);
    assert.equal(f.events.size, 0);
    assert.equal(f.avatar.listeners.size, 0);
    assert.equal(f.prompts.listeners.size, 0);
  });
}
