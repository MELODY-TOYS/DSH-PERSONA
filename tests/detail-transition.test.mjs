import test from 'node:test';
import assert from 'node:assert/strict';
import { createOceanTransition } from '../src/branding/ocean-transition.mjs';

function fixture() {
  const win = new EventTarget(); win.performance = { now: () => 0 };
  const doc = new EventTarget(); doc.defaultView = win; doc.hidden = false;
  const host = new EventTarget(); host.ownerDocument = doc; host.isConnected = true;
  const preference = new EventTarget(); preference.matches = false;
  const abort = new AbortController(), animations = [];
  const node = key => ({
    getAttribute(name) { return name === 'data-plugin-detail' ? key : null; },
    animate(frames, options) {
      const motion = { frames, options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
      animations.push(motion); return motion;
    },
  });
  return { preference, host, doc, abort, animations, node, transition: createOceanTransition(host, preference, { signal: abort.signal }) };
}

test('native navigation needs no cloned DOM, hidden content, timer or interaction overlay', () => {
  const f = fixture(), source = f.node('package'), destination = f.node('component');
  f.transition.begin(source, null, 'forward');
  assert.equal(f.animations.length, 0);
  f.transition.arrive(source); assert.equal(f.animations.length, 0);
  f.transition.arrive(destination); assert.equal(f.animations.length, 1);
  assert.equal(f.animations[0].options.duration, 180);
  assert.ok(f.animations[0].frames[0].opacity > 0);
  f.transition.arrive(destination); assert.equal(f.animations.length, 1);
  f.abort.abort(); assert.equal(f.animations[0].cancelled, true);
});

test('rapid back navigation cancels the previous motion and reverses its direction', () => {
  const f = fixture(), source = f.node('package'), destination = f.node('component');
  f.transition.begin(source, null, 'forward'); f.transition.arrive(destination);
  f.transition.begin(destination, null, 'back'); f.transition.arrive(source);
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.animations[1].cancelled, false);
  assert.equal(f.animations[1].frames[0].transform, 'translateX(-8px)');
  f.abort.abort();
});

test('live reduced motion cancels animation without hiding a page and prevents later motion', () => {
  const f = fixture(), source = f.node('package'), destination = f.node('component');
  f.transition.begin(source, null, 'forward'); f.transition.arrive(destination);
  f.preference.matches = true; f.preference.dispatchEvent(new Event('change'));
  assert.equal(f.animations[0].cancelled, true);
  f.transition.begin(destination, null, 'back'); f.transition.arrive(source);
  assert.equal(f.animations.length, 1); f.abort.abort();
});

test('scrolling cancels motion and disposal rejects a late arrival', () => {
  const f = fixture(), source = f.node('package'), destination = f.node('component');
  f.transition.begin(source, null, 'forward'); f.transition.arrive(destination);
  f.host.dispatchEvent(new Event('wheel')); assert.equal(f.transition.active, false);
  f.transition.begin(destination, null, 'back'); f.abort.abort(); f.transition.arrive(source);
  assert.equal(f.animations.length, 1);
});
