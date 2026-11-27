const CACHE_VERSION = 'notebase-shell-v4';
const SHELL_URLS = ['/', '/results', '/logo.png?v=2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.all(
        SHELL_URLS.map((url) => cache.add(url).catch(() => null))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API routes (real-time data & server deletion sync live in JS/localStorage)
  if (url.pathname.startsWith('/api/')) return;

  // Immutable Next.js hashed assets: Cache-First for instant cold/warm starts
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          throw err;
        }
      })
    );
    return;
  }

  // Page navigations ('/' and '/results?...'): Network-First so updates appear immediately online,
  // falling back cleanly to cached app shell when offline (ignoring query string for /results).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const shellKey = url.pathname === '/results' ? '/results' : url.pathname;
            cache.put(shellKey, response.clone());
          }
          return response;
        } catch {
          const fallbackPath = url.pathname === '/results' ? '/results' : url.pathname;
          const exact = await cache.match(request, { ignoreSearch: true });
          if (exact) return exact;
          const shell = await cache.match(fallbackPath, { ignoreSearch: true });
          if (shell) return shell;
          return cache.match('/');
        }
      })
    );
    return;
  }

  // For Next.js RSC client-side transitions, always try network first and never serve stale HTML
  if (request.headers.get('RSC')) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match(request)) || Response.error();
      })
    );
    return;
  }

  // Other same-origin static assets (logo, manifest, chunks): Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
