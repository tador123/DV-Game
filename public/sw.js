// Dark Survivors — Service Worker (offline + PWA install support)
const CACHE_NAME = 'dark-survivors-v20a';
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

// Fetch: network-first for everything (fall back to cache if offline)
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request).then((response) => {
            // Update cache with fresh version
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
            }
            return response;
        }).catch(() => {
            return caches.match(e.request).then((cached) => {
                return cached || new Response('Offline', { status: 503 });
            });
        })
    );
});
