import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionMotion } from '../src/components/settings-motion.mjs';

function fixture(reduced = false) {
  const abort = new AbortController(), preference = new EventTarget(), calls = [];
  preference.matches = reduced;
  const node = { ownerDocument: { defaultView: { matchMedia: () => preference } }, animate(frames, options) {
    const state = { frames, options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
    calls.push(state); return state;
  } };
  return { abort, preference, calls, select: selectionMotion(node, abort.signal) };
}
test('initial selection has no second entrance', () => { const f = fixture(); f.select('a'); assert.equal(f.calls.length, 0); f.abort.abort(); });
test('only a new entity animates; editing its content does not', () => { const f=fixture(); f.select('a'); f.select('b'); f.select('b'); assert.equal(f.calls.length,1); assert.equal(f.calls[0].options.duration,150); f.abort.abort(); });
test('rapid input cancels the previous motion before starting its replacement', () => { const f=fixture(); f.select('a');f.select('b');f.select('c');assert.equal(f.calls[0].cancelled,true);assert.equal(f.calls[1].cancelled,false);f.abort.abort(); });
test('reduced motion prevents the initial animation', () => { const f=fixture(true);f.select('a');f.select('b');assert.equal(f.calls.length,0);f.abort.abort(); });
test('a live preference change cancels in-flight motion', () => { const f=fixture();f.select('a');f.select('b');f.preference.matches=true;f.preference.dispatchEvent(new Event('change'));assert.equal(f.calls[0].cancelled,true);f.abort.abort(); });
test('unmount cancels animation and refuses later selections', () => { const f=fixture();f.select('a');f.select('b');f.abort.abort();f.select('c');assert.equal(f.calls.length,1);assert.equal(f.calls[0].cancelled,true); });
