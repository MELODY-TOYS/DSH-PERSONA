import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url));

test('detail background asset is an MP4 shipped with the package', () => {
  const asset = read('assets/brand/persona-loop.mp4');
  assert.equal(asset.subarray(4, 12).toString(), 'ftypisom');
  assert.ok(JSON.parse(read('package.json')).files.includes('assets/brand'));
});
test('production entry includes the ocean observer and original video asset', () => {
  const build = read('scripts/build-preview.mjs').toString();
  const entry = read('src/branding/detail-background.mjs').toString();
  const source = read('src/branding/ocean-detail.mjs').toString();
  const client = read('src/adapters/dsh/client.mjs').toString();
  assert.ok(build.includes('data:video/mp4;base64'));
  assert.ok(build.includes("pack('src/adapters/dsh/client.mjs', ['react'])"));
  assert.ok(client.includes('installDetailBackgroundObserver'));
  assert.ok(entry.includes('assets/brand/persona-loop.mp4'));
  assert.ok(entry.includes('installOceanDetails'));
  assert.ok(source.includes('video.loop = true'));
  assert.ok(source.includes('video.muted = video.defaultMuted = true'));
  assert.ok(!source.includes('video.controls = true'));
});
test('native component page retains its form without a brand banner', () => {
  const settings = read('src/components/settings-page.mjs').toString();
  assert.ok(!settings.includes('createBrandCover'));
  assert.ok(!settings.includes('dsp-brand-cover'));
});
