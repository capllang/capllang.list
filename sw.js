const CACHE_NAME = 'capllang-shell-v10';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/favicon.ico',
  '/assets/qris.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Semua API selalu langsung ke jaringan.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  // Navigasi: utamakan versi online, shell cache hanya sebagai fallback offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async response => {
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(async () =>
          (await caches.match('/index.html')) ||
          (await caches.match('/'))
        )
    );
    return;
  }

  // Asset statis: tampilkan cache dengan cepat, tetapi selalu revalidasi
  // agar app.js/styles.css tidak membeku pada versi lama.
  const networkPromise = fetch(request)
    .then(async response => {
      if (
        response &&
        response.status === 200 &&
        response.type === 'basic'
      ) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    });

  // Dipasang saat event masih aktif agar browser memberi waktu pada
  // revalidasi background sampai selesai.
  event.waitUntil(networkPromise.catch(() => undefined));

  event.respondWith(
    caches.match(request)
      .then(cached => cached || networkPromise)
      .catch(() => networkPromise)
  );
});
