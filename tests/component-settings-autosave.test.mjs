import test from 'node:test';
import assert from 'node:assert/strict';
import { ComponentSettingsController } from '../src/core/component-settings.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const parse = value => {
  if (!value || typeof value.name !== 'string' || !value.name.trim()) throw new TypeError('名称不能为空。');
  return { name: value.name };
};
const defaults = () => ({ name: '初始' });

function scope(initial = defaults()) {
  let snapshot = { status: 'ready', revision: 1, writable: true, value: { document: JSON.stringify(initial) } };
  const listeners = new Set(), writes = [];
  let fail = false, firstGate = null;
  return {
    writes,
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setFail(value) { fail = value; },
    holdFirst() { firstGate = Promise.withResolvers(); return firstGate; },
    remote(value) {
      snapshot = { ...snapshot, revision: snapshot.revision + 1, value: { document: JSON.stringify(value) } };
      for (const fn of listeners) fn();
    },
    async mutate(ops, revision) {
      writes.push({ value: JSON.parse(ops[0].value), revision });
      if (writes.length === 1 && firstGate) await firstGate.promise;
      if (fail) throw new Error('保存失败，修改已保留。');
      if (revision !== snapshot.revision) throw new Error('配置已更新。');
      snapshot = { ...snapshot, revision: revision + 1, value: { document: ops[0].value } };
      for (const fn of listeners) fn();
    },
  };
}

function createController(t, source) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new ComponentSettingsController(source, { parse, defaults });
  t.after(() => controller.dispose());
  return controller;
}

test('valid edits debounce into one automatic save', async t => {
  const source = scope(), controller = createController(t, source);
  controller.edit(value => { value.name = '第一次'; });
  t.mock.timers.tick(400);
  assert.equal(source.writes.length, 0);
  controller.edit(value => { value.name = '第二次'; });
  t.mock.timers.tick(499);
  assert.equal(source.writes.length, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(controller.getSnapshot().saved, true);
  assert.equal(source.writes.length, 1);
  assert.equal(source.writes[0].value.name, '第二次');
  assert.equal(JSON.parse(source.getSnapshot().value.document).name, '第二次');
});

test('invalid drafts wait until the value becomes valid', async t => {
  const source = scope(), controller = createController(t, source);
  controller.edit(value => { value.name = ''; });
  t.mock.timers.tick(5_000);
  assert.equal(source.writes.length, 0);
  assert.match(controller.getSnapshot().validationError, /名称不能为空/);
  controller.edit(value => { value.name = '有效'; });
  t.mock.timers.tick(500);
  await flush();
  assert.equal(controller.getSnapshot().saved, true);
  assert.equal(source.writes.length, 1);
  assert.equal(source.writes[0].value.name, '有效');
});

test('editing during an in-flight save queues the newer draft', async t => {
  const source = scope(), gate = source.holdFirst();
  t.after(() => gate.resolve());
  const controller = createController(t, source);
  controller.edit(value => { value.name = '第一版'; });
  t.mock.timers.tick(500);
  assert.equal(source.writes.length, 1);
  assert.equal(controller.getSnapshot().saving, true);
  controller.edit(value => { value.name = '第二版'; });
  t.mock.timers.tick(5_000);
  assert.equal(source.writes.length, 1);
  assert.equal(controller.getSnapshot().value.name, '第二版');
  gate.resolve();
  await flush();
  t.mock.timers.tick(500);
  await flush();
  assert.equal(controller.getSnapshot().saved, true);
  assert.deepEqual(source.writes.map(row => row.value.name), ['第一版', '第二版']);
  assert.equal(controller.getSnapshot().value.name, '第二版');
  assert.equal(JSON.parse(source.getSnapshot().value.document).name, '第二版');
});

test('normalizing a confirmed save preserves edits made while it was in flight', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const source = scope(), gate = source.holdFirst();
  t.after(() => gate.resolve());
  const controller = new ComponentSettingsController(source, {
    parse: value => ({ ...parse(value), name: value.name.trim() }), defaults,
  });
  t.after(() => controller.dispose());
  controller.edit(value => { value.name = '  第一版  '; });
  const firstSave = controller.save();
  assert.equal(source.writes.length, 1);
  assert.equal(controller.getSnapshot().saving, true);
  controller.edit(value => { value.name = '  第二版  '; });
  gate.resolve();
  assert.equal(await firstSave, true);
  assert.equal(controller.getSnapshot().value.name, '  第二版  ');
  assert.equal(controller.getSnapshot().dirty, true);
  assert.equal(await controller.save(), true);
  assert.deepEqual(source.writes.map(row => row.value.name), ['第一版', '第二版']);
  assert.equal(controller.getSnapshot().value.name, '第二版');
  assert.equal(controller.getSnapshot().saved, true);
  t.mock.timers.tick(5_000);
  assert.equal(source.writes.length, 2);
});

test('a failed automatic save keeps the draft and explicit retry can recover', async t => {
  const source = scope(); source.setFail(true);
  const controller = createController(t, source);
  controller.edit(value => { value.name = '保留'; });
  t.mock.timers.tick(500);
  await flush();
  assert.match(controller.getSnapshot().error, /保存失败/);
  assert.equal(controller.getSnapshot().dirty, true);
  assert.equal(controller.getSnapshot().value.name, '保留');
  const writesAfterFailure = source.writes.length;
  t.mock.timers.tick(5_000);
  assert.equal(source.writes.length, writesAfterFailure, 'failure must not create a retry loop');
  source.setFail(false);
  assert.equal(await controller.save(), true);
  assert.equal(controller.getSnapshot().saved, true);
});

test('a concurrent remote revision blocks automatic overwrite', t => {
  const source = scope(), controller = createController(t, source);
  controller.edit(value => { value.name = '本地'; });
  source.remote({ name: '远端' });
  t.mock.timers.tick(5_000);
  assert.equal(source.writes.length, 0);
  assert.equal(controller.getSnapshot().conflicted, true);
  assert.equal(controller.getSnapshot().value.name, '本地');
  assert.equal(JSON.parse(source.getSnapshot().value.document).name, '远端');
});

test('dispose cancels a queued automatic save', t => {
  const source = scope(), controller = createController(t, source);
  controller.edit(value => { value.name = '不会写入'; });
  controller.dispose();
  t.mock.timers.tick(5_000);
  assert.equal(source.writes.length, 0);
});
