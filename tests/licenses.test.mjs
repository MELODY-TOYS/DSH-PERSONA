import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Standalone outputs may be copied without the package's separate notice files.
test('browser distributions retain the full project and third-party licenses', () => {
  const licenses = ['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(path =>
    readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').trim());
  for (const path of ['lib/client.js', 'preview/standalone.html']) {
    const output = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    for (const license of licenses) assert.ok(output.includes(license), `${path} is missing a license`);
  }
});
