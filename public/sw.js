const CACHE_NAME = 'map-offline-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // ПЕРЕХВАТЫВАЕМ ТОЛЬКО КАРТЫ. 
    // Если это НЕ тайл OSM и НЕ наш фейковый порт 9999 - ВООБЩЕ НИЧЕГО НЕ ДЕЛАЕМ.
    if (!url.hostname.includes('tile.openstreetmap.org') && url.port !== '9999') {
        return; 
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            let cacheKey;
            if (url.port === '9999') {
                const parts = url.pathname.split('/'); 
                cacheKey = `https://a.tile.openstreetmap.org/${parts[2]}/${parts[3]}/${parts[4]}`;
            } else {
                cacheKey = url.origin + url.pathname;
            }
            
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) return cachedResponse;
            
            if (url.port === '9999') {
                return new Response('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', {
                    headers: { 'Content-Type': 'image/png' }
                });
            }

            try {
                const networkResponse = await fetch(event.request, { mode: 'cors' });
                if (networkResponse.ok) {
                    cache.put(cacheKey, networkResponse.clone());
                }
                return networkResponse;
            } catch (err) {
                return new Response('Offline', { status: 503 });
            }
        })
    );
});
