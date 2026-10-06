// Bicho Master Pro - Service Worker v10.0 (Anti-Stale Cache / Network-First)
const CACHE_NAME = 'bicho-master-pwa-v10';
const PRECACHE_ASSETS = [
  '/manifest.json?v=10.0',
  '/css/style.css',
  '/img/favicon.png?v=108.0',
  '/img/eagle_radar_badge.png',
  '/img/eagle_radar_icon.png',
  '/img/icon-192.png?v=2.0',
  '/img/icon-512.png?v=2.0'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache notice:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  // Limpa TODOS os caches antigos para garantir que NENHUM script antigo seja servido
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Apagando cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. APIs e requisições dinâmicas: NUNCA usam cache (tempo real estrito)
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // 2. Navegação HTML e scripts JS: SEMPRE Network First (garante sempre código e dados mais recentes!)
  const isCodeOrPage = event.request.mode === 'navigate' || 
                       url.pathname.endsWith('.html') || 
                       url.pathname.endsWith('.js') || 
                       url.pathname.startsWith('/js/');

  if (isCodeOrPage) {
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

  // 3. Imagens e assets estáticos: Cache First com fallback de rede
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    })
  );
});
