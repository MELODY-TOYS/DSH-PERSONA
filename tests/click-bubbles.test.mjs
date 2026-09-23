import test from 'node:test';
import assert from 'node:assert/strict';
import { installClickBubbles } from '../src/branding/click-bubbles.mjs';

function fixture({ reduced = false, failHigh = false, failDraw = false } = {}) {
  const frames = new Map(), calls = [], created = [];
  let now = 0, id = 0;
  const win = new EventTarget();
  win.performance = { now: () => now }; win.devicePixelRatio = 1;
  win.getComputedStyle = () => ({ color: 'rgb(240, 240, 240)' });
  win.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  win.cancelAnimationFrame = frame => frames.delete(frame);
  const doc = new EventTarget(); doc.defaultView = win; doc.hidden = false;
  function element() {
    const node = new EventTarget(); node.style = {}; node.dataset = {}; node.children = []; node.isConnected = false;
    node.setAttribute = () => {};
    node.append = child => { child.remove(); node.children.push(child); child.parentNode = node; child.isConnected = true; };
    node.remove = () => { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(n => n !== node); node.parentNode = null; node.isConnected = false; };
    return node;
  }
  doc.createElement = element;
  const owner = element(); owner.ownerDocument = doc; owner.isConnected = true;
  owner.clientWidth = 500; owner.clientHeight = 600;
  owner.getBoundingClientRect = () => ({ left: 200, top: 20 });
  const target = { closest: selector => selector.startsWith('[disabled]') ? null : target, getBoundingClientRect: () => ({ left: 300, top: 120, width: 50, height: 40 }) };
  const detail = { contains: node => node === target };
  const background = { closest: () => null };
  owner.contains = node => [target, detail, background].includes(node);
  const preference = new EventTarget(); preference.matches = reduced;
  const controller = new AbortController();
  const make = mode => () => {
    calls.push(mode);
    if (mode === 'high' && failHigh) throw new Error('No WebGL');
    const renderer = { mode, disposed: 0, draws: [], resize() {}, clear() {}, dispose() { this.disposed++; }, draw(bubbles) {
      if (mode === 'high' && failDraw) throw new Error('Context lost');
      this.draws.push(structuredClone(bubbles));
    } };
    created.push(renderer); return renderer;
  };
  const api = installClickBubbles(owner, preference, { signal: controller.signal, getDetail: () => detail, factories: { low: make('low'), high: make('high') } });
  function event(type, fields = {}) {
    const e = new Event(type); for (const [key, value] of Object.entries({ target, ...fields })) Object.defineProperty(e, key, { value });
    owner.dispatchEvent(e);
  }
  const press = (fields = {}) => event('pointerdown', { button: 0, isPrimary: true, clientX: 300, clientY: 150, ...fields });
  function step(dt = 16) { now += dt; const queue = [...frames.values()]; frames.clear(); for (const fn of queue) fn(now); }
  const change = value => { preference.matches = value; preference.dispatchEvent(new Event('change')); };
  return { calls, created, owner, doc, win, frames, preference, controller, api, target, background, event, press, step, change };
}

test('only plugin targets initialize high quality; unrelated and secondary clicks are untouched', () => {
  const f = fixture(); assert.deepEqual(f.calls, []);
  f.press({ target: { closest: () => null } }); f.press({ button: 2 }); assert.deepEqual(f.calls, []);
  f.press(); f.step(); assert.deepEqual(f.calls, ['high']);
  assert.ok(f.created[0].draws[0].length > 0);
  f.controller.abort();
});

test('blank package-page background outside the short detail block still emits', () => {
  const f = fixture(); f.press({ target: f.background, clientY: 550 }); f.step(48);
  assert.deepEqual(f.calls, ['high']);
  assert.ok(f.created[0].draws.at(-1).length > 0);
  f.controller.abort();
});

test('reduced motion uses only low quality, with fixed geometry and a short fade', () => {
  const f = fixture({ reduced: true }); f.press(); f.step();
  const first = f.created[0].draws.at(-1); f.step(); const second = f.created[0].draws.at(-1);
  assert.deepEqual(f.calls, ['low']); assert.equal(first.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(first[i].x, second[i].x); assert.equal(first[i].y, second[i].y);
    assert.equal(first[i].r, second[i].r); assert.equal(second[i].wobble, 0);
    assert.ok(second[i].alpha < first[i].alpha);
  }
  for (let i = 0; i < 15; i++) f.step();
  assert.equal(f.frames.size, 0); f.controller.abort();
});

test('live preference changes dispose the previous renderer and cancel pending frames', () => {
  const f = fixture(); f.press(); f.change(true);
  assert.equal(f.created[0].disposed, 1); assert.equal(f.frames.size, 0);
  f.press(); f.step(); assert.deepEqual(f.calls, ['high', 'low']);
  f.change(false); assert.equal(f.created[1].disposed, 1);
  f.press(); assert.deepEqual(f.calls, ['high', 'low', 'high']); f.controller.abort();
});

test('WebGL initialization or rendering failure falls back without retrying every click', () => {
  for (const failure of [{ failHigh: true }, { failDraw: true }]) {
    const f = fixture(failure); f.press(); f.step();
    assert.deepEqual(f.calls, ['high', 'low']);
    f.press(); f.step(); assert.deepEqual(f.calls, ['high', 'low']);
    assert.ok(f.created.at(-1).draws.at(-1).length > 0); f.controller.abort();
  }
});

test('hidden tabs, scroll and disposal clear work; aborted listeners cannot emit', () => {
  const f = fixture(); f.press(); f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.frames.size, 0);
  f.doc.hidden = false; f.press(); f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 0);
  f.press(); f.controller.abort(); f.api.dispose();
  assert.equal(f.frames.size, 0); assert.equal(f.created[0].disposed, 1); assert.equal(f.owner.children.length, 0);
  f.press(); assert.equal(f.frames.size, 0);
});

test('keyboard activation works and a pointer-forwarded label click cannot double emit', () => {
  const f = fixture(); f.press(); f.event('click', { detail: 0 }); f.step(48);
  assert.equal(f.created[0].draws.at(-1).length, 3);
  for (let i = 0; i < 90; i++) f.step();
  f.event('click', { detail: 0 }); f.step(48); assert.equal(f.created[0].draws.at(-1).length, 3);
  f.controller.abort();
});

test('rapid clicks stay bounded and a replaced host child list restores its owned layer', () => {
  const f = fixture(); const overlay = f.owner.children[0]; overlay.remove(); f.api.resize();
  assert.equal(f.owner.children[0], overlay);
  for (let i = 0; i < 100; i++) f.press(); f.step(48);
  assert.ok(f.created[0].draws.at(-1).length <= 32);
  for (let i = 0; i < 90; i++) f.step();
  assert.equal(f.frames.size, 0); f.controller.abort();
});
