import assert from 'node:assert/strict';
import test from 'node:test';
import { en, zh } from '../src/locales.mjs';

const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('built-in locale dictionaries keep the same keys and template parameters', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const key of Object.keys(zh)) {
    assert.deepEqual(placeholders(en[key]), placeholders(zh[key]), key);
  }
});
