// Bicho Master Pro - Service Worker v2.0 (Ícone Águia Oficial)
const CACHE_NAME = 'bicho-master-pwa-v3';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json?v=2.0',
  '/css/style.css',
  '/img/favicon.png?v=108.0',
  '/img/eagle_radar_badge.png',
  '/img/eagle_radar_icon.png',
  '/img/icon-192.png?v=2.0',
  '/img/icon-512.png?v=2.0',
  '/img/icon-maskable-192.png?v=2.0',
  '/img/icon-maskable-512.png?v=2.0',
  '/img/apple-touch-icon.png?v=2.0'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache non-critical notice:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // APIs e requisições dinâmicas de autenticação NUNCA usam cache (tempo real estrito)
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Navegação de páginas HTML: Network First com fallback para cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((res) => res || caches.match('/index.html'));
        })
    );
    return;
  }

  // Assets estáticos (css, js, imagens): Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
