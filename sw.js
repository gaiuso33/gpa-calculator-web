/* GPA Calculator Pro — service worker (Jira #12, #17, #20)
 * Every file the app needs is self-hosted, so the whole app is precached on
 * install and works fully offline. Serve cache-first, refresh in the background.
 * Bump CACHE_VERSION whenever shipped files change.
 */
const CACHE_VERSION = 'gpapro-v3';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/fonts.css',
  'js/app.js',
  'js/pwa.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'assets/vendor/jspdf.plugin.autotable.min.js',
  'assets/vendor/jspdf.umd.min.js',
  'assets/fonts/plus-jakarta-sans-latin-300-normal.woff2',
  'assets/fonts/plus-jakarta-sans-latin-400-italic.woff2',
  'assets/fonts/plus-jakarta-sans-latin-400-normal.woff2',
  'assets/fonts/plus-jakarta-sans-latin-500-normal.woff2',
  'assets/fonts/plus-jakarta-sans-latin-600-normal.woff2',
  'assets/fonts/sora-latin-300-normal.woff2',
  'assets/fonts/sora-latin-400-normal.woff2',
  'assets/fonts/sora-latin-600-normal.woff2',
  'assets/fonts/sora-latin-700-normal.woff2',
  'assets/fonts/sora-latin-800-normal.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;   // never touch third-party requests

  event.respondWith((async () => {
    const cache  = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);

    const refresh = fetch(req)
      .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);

    if (cached) { event.waitUntil(refresh); return cached; }

    const fresh = await refresh;
    if (fresh) return fresh;

    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});
