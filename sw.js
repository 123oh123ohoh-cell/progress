// Progress — Service Worker
// Strategy:
//   • Static shell (HTML, CSS, JS, images) → cache-first, update in background
//   • API calls (/api/*)                   → network-only (always fresh)
//   • WebSocket (/ws/*)                    → pass through (SW can't handle WS)
//   • Fonts (Google Fonts)                 → cache-first (they never change)
//   • Supabase media                       → network-first (user-uploaded content)

const CACHE_NAME = 'progress-v1';

// Pages and assets to pre-cache on install so the app loads instantly
// even on slow connections, and the shell works offline.
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/data.js',
  '/write.html',
  '/post.html',
  '/profile.html',
  '/chat.html',
  '/user.html',
  '/signup.html',
  '/users.html',
  '/admin.html',
  '/404.html',
  '/images/nearheader.png',
  '/images/etc1.png',
  '/images/404page.png',
];

// ── Install: pre-cache the shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()) // activate immediately, don't wait for old SW to die
      .catch(() => {}) // don't fail install if a resource is missing
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // take control of open tabs immediately
  );
});

// ── Fetch: serve from cache, update in background ─────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never intercept API or WebSocket requests — always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
    return; // let the browser handle it normally
  }

  // 2. Never intercept POST/PUT/PATCH/DELETE — only cache-safe GET requests
  if (request.method !== 'GET') return;

  // 3. Cross-origin requests that aren't fonts — network only
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!isSameOrigin && !isGoogleFont) return;

  // 4. Cache-first with background revalidation (stale-while-revalidate)
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        // Kick off a network fetch to keep the cache fresh
        const networkFetch = fetch(request)
          .then(response => {
            // Only cache valid responses
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        // Return cached version immediately if available,
        // otherwise wait for the network (first load or uncached resource)
        return cached || networkFetch;
      })
    )
  );
});