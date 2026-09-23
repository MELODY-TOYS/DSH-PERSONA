import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionMotion } from '../src/components/settings-motion.mjs';

function fixture() {
  const signal = new AbortController();
  const preference = new EventTarget(); preference.matches = false;
  const animations = [];
  const win = {
    matchMedia: () => preference,
    getComputedStyle: () => ({ getPropertyValue: key => key === '--dsp-motion-enter' ? '150ms' : 'ease' }),
  };
  const node = {
    ownerDocument: { defaultView: win },
    animate(frames, options) {
      let resolve, reject;
      const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
      const animation = { frames, options, finished, cancelled: false,
        complete: resolve, cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
      animations.push(animation); return animation;
    },
  };
  return { signal, preference, animations, node, update: selectionMotion(node, signal.signal) };
}

test('only a change between selected entities starts a fade', () => {
  const f = fixture();
  f.update('one'); f.update('one');
  assert.equal(f.animations.length, 0);
  f.update('two');
  assert.equal(f.animations.length, 1);
  assert.equal(f.animations[0].options.duration, 150);
  f.update('two');
  assert.equal(f.animations[0].cancelled, false);
  f.update(null);
  assert.equal(f.animations[0].cancelled, true);
  f.signal.abort();
});

test('rapid selection cancels the old fade without cancelling its replacement', async () => {
  const f = fixture();
  f.update('one'); f.update('two'); f.update('three');
  await Promise.resolve();
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.animations[1].cancelled, false);
  f.animations[1].complete();
  await Promise.resolve();
  assert.equal(f.animations[1].cancelled, true);
  f.signal.abort();
});

test('live reduced-motion changes cancel animations and keep later selections immediate', () => {
  const f = fixture();
  f.update('one'); f.update('two');
  f.preference.matches = true; f.preference.dispatchEvent(new Event('change'));
  assert.equal(f.animations[0].cancelled, true);
  f.update('three');
  assert.equal(f.animations.length, 1);
  f.preference.matches = false; f.preference.dispatchEvent(new Event('change'));
  f.update('four');
  assert.equal(f.animations.length, 2);
  f.signal.abort();
});

test('disposal cancels animation and blocks stale updates', () => {
  const f = fixture();
  f.update('one'); f.update('two'); f.signal.abort(); f.update('three');
  assert.equal(f.animations.length, 1);
  assert.equal(f.animations[0].cancelled, true);
});

test('missing Web Animations support does not block selection', () => {
  const f = fixture(); delete f.node.animate;
  assert.doesNotThrow(() => { f.update('one'); f.update('two'); });
  f.signal.abort();
});

test('a queued no-preference notification does not cancel a newly started fade', () => {
  const f = fixture();
  f.update('one'); f.update('two');
  f.preference.dispatchEvent(new Event('change'));
  assert.equal(f.animations[0].cancelled, false);
  f.signal.abort();
});
