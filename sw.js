const CACHE_NAME = 'capllang-shell-v26';

const APP_SHELL = [
  '/',
  '/index.html',

  '/css/01-foundation.css',
  '/css/02-responsive-layout.css',
  '/css/03-compact-dashboard.css',
  '/css/04-visual-refresh.css',
  '/css/05-row-alignment.css',
  '/css/06-saas-redesign.css',

  '/js/01-core.js',
  '/js/02-data.js',
  '/js/03-auth.js',
  '/js/04-records.js',
  '/js/05-render.js',
  '/js/06-ui-init.js',
  '/js/07-saas-ui.js',

  '/favicon.ico',
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

  // Asset statis: utamakan jaringan agar HTML baru tidak dipasangkan
  // dengan JS/CSS lama setelah deployment. Cache hanya menjadi fallback
  // saat jaringan benar-benar gagal.
  event.respondWith(
    fetch(request)
      .then(async response => {
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || Response.error();
      })
  );
});
