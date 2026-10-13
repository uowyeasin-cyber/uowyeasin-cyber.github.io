// Offline support: the app shell is saved at install, everything else
// (course and problem data, the Python runtime) is saved the first time it loads.
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const DATA = 'data-v1';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'js-worker.js', 'py-worker.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function fromCacheFirst(req, cacheName) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

// App files: answer from the cache at once, refresh it in the background.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  if (hit) { fresh.catch(() => {}); return hit; }
  return fresh.catch(async () => (await cache.match('index.html')) || Response.error());
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/data/') || url.pathname.includes('/pyodide/')) return e.respondWith(fromCacheFirst(req, DATA));
  if (req.mode === 'navigate') return e.respondWith(staleWhileRevalidate(new Request('index.html')));
  e.respondWith(staleWhileRevalidate(req));
});
