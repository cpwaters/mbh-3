// Hand-written service worker. Network-first for navigations (always try the
// live app, fall back to the cached shell when offline); versioned shell
// cache — BUMP CACHE_NAME to force-clear stale clients on the next visit.
const CACHE_NAME = 'mbh-shell-v1';
const SHELL = ['/', '/app', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Never touch the API — dispatch must always hit the network (or fail so
  // the offline queue owns the retry). Only GETs are cacheable anyway.
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/app')))
    );
    return;
  }

  // Other GETs: cache-first for the versioned shell assets.
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
