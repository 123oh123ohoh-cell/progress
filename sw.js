const CACHE = 'progress-v2';

const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/data.js',
  '/offline.html',
  '/write.html',
  '/post.html',
  '/profile.html',
  '/chat.html',
  '/user.html',
  '/signup.html',
  '/404.html',
  '/images/nearheader.png',
  '/images/etc1.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;
  if (request.method !== 'GET') return;
  const isSameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!isSameOrigin && !isFont) return;

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(res => {
            if (res && res.status === 200) cache.put(request, res.clone());
            return res;
          })
          .catch(() => {
            if (cached) return cached;
            if (request.mode === 'navigate') return cache.match('/offline.html');
            return new Response('Offline', { status: 503 });
          });
        return cached || networkFetch;
      })
    )
  );
});