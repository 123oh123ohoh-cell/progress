const CACHE = 'progress-v3';

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

// ── Push notifications ──────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch(e) {}

  const title   = data.title || 'Progress';
  const options = {
    body:              data.body || '',
    icon:              '/images/nearheader.png',
    badge:             '/images/nearheader.png',
    tag:               data.tag  || 'progress-notif',
    renotify:          true,   // vibrate even if same tag
    requireInteraction: false, // auto-dismiss after a few seconds
    silent:            false,  // play sound + vibrate
    vibrate:           [150, 75, 150, 75, 300], // double-tap pattern
    data:              { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});