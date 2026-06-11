/* Service Worker — app-shell cache only. No game state is cached. */
const CACHE = 'maze-v2';

self.addEventListener('install', event => {
  self.skipWaiting();
  // Pre-cache only the root shell; Vite assets will be cached on first fetch.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(['/'])));
});

self.addEventListener('activate', event => {
  // Remove any old cache versions
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // Stale-while-revalidate: serve cached immediately, update cache in background
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      const networkPromise = fetch(event.request).then(res => {
        if (res && res.ok) cache.put(event.request, res.clone());
        return res;
      }).catch(() => null);
      return cached ?? await networkPromise;
    }),
  );
});
