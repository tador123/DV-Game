// Dark Survivors — Service Worker (offline + PWA install support)
const CACHE_NAME = 'dark-survivors-v5';
const ASSETS = [
    '/',
    '/index.html',
    '/game.js',
    '/social.js',
    '/bg-music.mp3',
    '/manifest.json'
];

// Install: cache core assets
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first for API, cache-first for assets
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Always go to network for API calls
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', {
            headers: { 'Content-Type': 'application/json' }
        })));
        return;
    }

    // Cache-first for static assets
    e.respondWith(
        caches.match(e.request).then((cached) => {
            const networkFetch = fetch(e.request).then((response) => {
                // Update cache with fresh version
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                return response;
            }).catch(() => cached);

            return cached || networkFetch;
        })
    );
});
