/* ===== RAMAN AI – Service Worker (sw.js) ===== */
const CACHE_NAME = 'raman-ai-v2.6';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './session_mgr.css',
  './app.js',
  './mcp_agent_worker.js',
  './ble_telemetry.js',
  './fhir_exporter.js',
  './zkp_verifier.js',
  './webgpu_volumetric.js',
  './webgpu_pkpd.js',
  './hybrid_search.js',
  './vision_diagnostics.js',
  './federated_learning.js',
  './quantized_slm.js',
  './ui_responsive_agent.js',
  './favicon.svg',
  './human_body_map.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Pre-caching non-fatal warning:', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Network-First for core web assets to ensure fresh UI and styles, fallback to cache offline
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});