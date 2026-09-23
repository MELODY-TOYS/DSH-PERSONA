import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseAt, coverRadius, waterContour, twinContour, maskGeometry } from '../src/branding/transition-geometry.mjs';

test('incoming starts halfway through the outgoing cover', () => {
  assert.deepEqual(phaseAt(0), { cover: 0, reveal: 0, done: false, timedOut: false });
  assert.equal(phaseAt(149).reveal, 0);
  const p = phaseAt(230); assert.ok(p.cover > p.reveal && p.reveal > 0);
  assert.equal(phaseAt(300).cover, 1); assert.ok(phaseAt(300).reveal < 1);
  assert.equal(phaseAt(500).done, true);
});
test('no reveal gets ahead of the old-page removal', () => {
  for (let t = 0; t <= 520; t += .37) { const p = phaseAt(t); assert.ok(p.reveal <= p.cover && p.reveal >= 0); }
});
test('late arrival holds a solid cover, then resumes its own reveal', () => {
  assert.equal(phaseAt(650, 700).reveal, 0);
  assert.equal(phaseAt(750, 700).done, false);
  assert.equal(phaseAt(1050, 700).done, true);
  assert.equal(phaseAt(1401, Infinity).timedOut, true);
});
test('covering radius includes each viewport corner at an off-centre origin', () => {
  assert.equal(coverRadius(400, 300, 0, 0), 500);
  const r = coverRadius(1280, 900, 224, 450);
  for (const x of [0, 1280]) for (const y of [0, 900]) assert.ok(Math.hypot(x - 224, y - 450) <= r);
});
test('water shape varies at sub-frame timestamps, not a frame index', () => {
  const a = maskGeometry(1280, 900, { x: .3, y: .5 }, 'forward', .345);
  const b = maskGeometry(1280, 900, { x: .3, y: .5 }, 'forward', .3451);
  assert.notEqual(a, b); assert.ok(!/NaN|Infinity/.test(a + b));
  assert.equal(waterContour(0, 0, 0, 0), 'M0 0Z');
});
test('return geometry handles disjoint, overlapping and contained discs', () => {
  const a = { x: 100, y: 100 }, b = { x: 160, y: 100 };
  assert.equal((twinContour(a, b, 10, 10).match(/M/g) ?? []).length, 2);
  assert.equal((twinContour(a, b, 60, 60).match(/M/g) ?? []).length, 1);
  assert.equal((twinContour(a, b, 200, 20).match(/M/g) ?? []).length, 1);
  assert.ok(!/NaN|Infinity/.test(twinContour(a, a, 60, 60)));
});
test('narrow and ultrawide mask paths stay finite', () => {
  for (const [width, height] of [[272, 804], [2400, 500], [1, 1]]) {
    for (const direction of ['back', 'forward']) for (const p of [0, .01, .5, .999, 1]) {
      const path = maskGeometry(width, height, { x: .3, y: .5 }, direction, p, 48, -300);
      assert.ok(!/NaN|Infinity/.test(path));
    }
  }
});
