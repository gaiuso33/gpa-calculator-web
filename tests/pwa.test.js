'use strict';
/* Guards the PWA setup (Jira #20): manifest valid, icons real, and the service worker's
   precache list in sync with what index.html actually loads. */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));

const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');
const swSrc = read('sw.js');

const shell = (() => {
  const m = swSrc.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(m, 'APP_SHELL not found in sw.js');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
})();

const pngSize = f => {                       // IHDR: width/height are bytes 16–23
  const b = fs.readFileSync(path.join(root, f));
  assert.equal(b.slice(1, 4).toString(), 'PNG', `${f} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('web app manifest', () => {
  it('has the fields Chrome needs for installability', () => {
    for (const k of ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color', 'icons']) {
      assert.ok(manifest[k], `missing "${k}"`);
    }
    assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display));
  });

  it('declares a 192px and a 512px icon, plus a maskable one', () => {
    const has = (size, purpose) =>
      manifest.icons.some(i => i.sizes === size && (i.purpose || 'any').split(' ').includes(purpose));
    assert.ok(has('192x192', 'any'), '192 icon');
    assert.ok(has('512x512', 'any'), '512 icon');
    assert.ok(manifest.icons.some(i => (i.purpose || '').includes('maskable')), 'maskable icon');
  });

  it('every icon file exists and matches its declared size', () => {
    for (const icon of manifest.icons) {
      assert.ok(exists(icon.src), `${icon.src} is missing`);
      const [w, h] = icon.sizes.split('x').map(Number);
      assert.deepEqual(pngSize(icon.src), [w, h], icon.src);
    }
  });
});

describe('index.html', () => {
  it('links the manifest, theme colour, touch icon and pwa.js', () => {
    assert.match(html, /<link[^>]+rel="manifest"[^>]+manifest\.webmanifest/);
    assert.match(html, /<meta[^>]+name="theme-color"/);
    assert.match(html, /<link[^>]+rel="apple-touch-icon"/);
    assert.match(html, /src="js\/pwa\.js"/);
    assert.match(html, /id="install-btn"/);
  });
});

describe('service worker precache list', () => {
  const local = ref => ref === './' ? 'index.html' : ref;

  it('only lists files that exist', () => {
    for (const f of shell) assert.ok(exists(local(f)), `${f} is in APP_SHELL but not on disk`);
  });

  it('contains the manifest and every manifest icon', () => {
    assert.ok(shell.includes('manifest.webmanifest'));
    for (const icon of manifest.icons) assert.ok(shell.includes(icon.src), `${icon.src} not cached`);
  });

  it('contains every local file that index.html loads', () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map(m => m[1])
      .filter(r => !/^(https?:|data:|mailto:|\/\/)/.test(r));
    assert.ok(refs.length > 0);
    for (const r of refs) assert.ok(shell.includes(r), `index.html loads "${r}" but sw.js does not precache it`);
  });
});
