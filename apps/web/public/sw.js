// Hand-written service worker. Network-first for navigations (always try the
// live app, fall back to the cached shell when offline); versioned cache —
// BUMP CACHE_NAME to force-clear stale clients on the next visit.
const CACHE_NAME = 'mbh-shell-v4';
const SHELL = ['/', '/app', '/manifest.webmanifest', '/icon-192.png'];

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
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never touch the API — dispatch must always hit the network (or fail so
  // the offline queue owns the retry). Leave other origins (Firebase, map
  // tiles) to the network too: they are not ours to serve stale.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
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

  // Everything else we serve ourselves: cache-first, and cache what we fetch.
  // Without that last part an installed app opened cold with no signal got the
  // shell HTML and then failed on the script tag it points at — the built
  // assets are content-hashed, so their names are not known ahead of time and
  // nothing here could precache them. They are immutable, so caching on first
  // sight is safe: a new build asks for new filenames.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          // Only store a response we actually own and that succeeded.
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});
