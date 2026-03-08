/* ═══════════════════════════════════════════════════
   SnapVideo — Service Worker
   Cache-first strategy for offline PWA support
   ═══════════════════════════════════════════════════ */

const CACHE_NAME = 'snapvideo-v7';

const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// ─── Install: pre-cache all app assets ───
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: clean up old caches ───
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// ─── Fetch: cache-first, falling back to network ───
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip cross-origin requests (e.g., Google Fonts)
    if (!request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(request).then((networkResponse) => {
                // Don't cache video files (too large)
                if (request.url.match(/\.(mp4|mov|webm)$/i)) {
                    return networkResponse;
                }
                // Cache other successful responses
                if (networkResponse.ok) {
                    const cloned = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
                }
                return networkResponse;
            });
        })
    );
});
