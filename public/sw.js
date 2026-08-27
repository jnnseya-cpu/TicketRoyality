/* eslint-disable no-restricted-globals */
/**
 * Service worker.
 *
 * The caching strategy is deliberately conservative, because on a ticketing platform a
 * stale response is not a cosmetic problem. A cached "12 tickets left" sells an event
 * that is full; a cached ticket page shows a QR for a ticket that was transferred or
 * refunded; a cached dashboard shows someone the previous account's data after a
 * logout on a shared phone.
 *
 * So the rules are:
 *
 *   never cached   /api, /webhooks, /dashboard, /account, /cart, /checkout, and any
 *                  request that is not a GET
 *   network-first  documents (HTML), falling back to the cache and then to /offline,
 *                  so a page you have already visited still opens on the Underground
 *   cache-first    /_next/static and /icons — content-hashed or immutable, so serving
 *                  them from disk cannot serve the wrong thing
 *
 * Bump CACHE_VERSION to invalidate everything at once.
 */

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `tr-static-${CACHE_VERSION}`;
const PAGE_CACHE = `tr-pages-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline';

/** Paths whose responses must never be written to a cache. */
const NEVER_CACHE = [
  '/api/',
  '/webhooks/',
  '/dashboard',
  '/account',
  '/cart',
  '/checkout',
  '/login',
  '/register',
  '/forgot-password',
];

function isPrivate(pathname) {
  return NEVER_CACHE.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      // A failed precache must not abort the install: the worker is still useful for
      // everything else, and an install loop is worse than a missing offline page.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('tr-') && !key.endsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Lets the page tell a waiting worker to take over immediately, which is what the
 * "update available" prompt calls.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET. A cached POST would replay a payment.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only. Google Maps embeds and model providers manage their own caching,
  // and proxying a third party through here would break their auth.
  if (url.origin !== self.location.origin) return;

  if (isPrivate(url.pathname)) return;

  // Immutable assets: content-hashed by the build, so the cached copy is always right.
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Documents: network first so prices and availability are never stale, cache as a
  // fallback so a page already visited still opens without signal.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        })
    );
  }
});
