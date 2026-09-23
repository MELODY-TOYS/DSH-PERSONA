import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultAvatarSettings } from '../src/modules/avatar/settings.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const asset = read('assets/brand/visual.avif');
const data = `data:image/avif;base64,${asset.toString('base64')}`;

// Node does not import raster files; this test substitutes only the asset import.
const source = read('src/branding/brand.mjs').toString()
  .replace("import artwork from '../../assets/brand/visual.avif';", `const artwork = ${JSON.stringify(data)};`);
const brand = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function imageFixture() {
  const appended = [], images = [];
  const doc = {
    head: { append: node => appended.push(node) },
    createElement(tag) {
      const node = { dataset: {}, removeAttribute() {}, remove() {
        const index = appended.indexOf(node); if (index >= 0) appended.splice(index, 1);
      } };
      if (tag === 'img') images.push(node);
      return node;
    },
  };
  return { doc, appended, images };
}

test('native bundle contains the brand image once and the standalone preview is self-contained', () => {
  assert.equal(read('lib/client.js').toString().split(data).length - 1, 1);
  assert.ok(read('preview/standalone.html').toString().includes(data));
});
test('package ships the image, documentation and bundle patch', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.files.includes('assets/brand')); assert.ok(pkg.files.includes('docs/*.md'));
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
});
test('brand artwork never populates user settings or the Persona library', () => {
  const value = defaultAvatarSettings();
  assert.equal(value.user.avatar, null); assert.deepEqual(value.library.personas, []);
  assert.ok(!JSON.stringify(value).includes('data:image'));
});
test('native client owns the icon effect but does not replace the global DSH favicon', () => {
  const client = read('src/adapters/dsh/client.mjs').toString();
  assert.ok(client.includes("ctx.effect(() => installBrandIcons(), 'dsh-persona: project icons')"));
  assert.ok(!client.includes('installPreviewFavicon'));
  for (const selector of brand.ICON_SEATS.split(',\n')) assert.ok(selector.includes('="dsh-persona"'));
});
test('undecodable image never hides the host icon and a successful image does', () => {
  const f = imageFixture(), off = brand.installBrandIcons(f.doc);
  assert.equal(f.appended.length, 0); // No onload means the default SVG remains visible.
  assert.equal(f.images[0].src, data);
  f.images[0].onload(); assert.equal(f.appended.length, 1);
  assert.ok(f.appended[0].textContent.includes('opacity: 0'));
  off(); assert.equal(f.appended.length, 0);
});
test('disposing an icon effect blocks late image completion and tolerates repeated cleanup', () => {
  const f = imageFixture(), off = brand.installBrandIcons(f.doc);
  const late = f.images[0].onload; off(); off(); late();
  assert.equal(f.appended.length, 0); assert.equal(f.images[0].onload, null);
});
