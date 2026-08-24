// Portholes — service worker
// Caches the app shell (this site's own pages) plus a small allowlist of
// static third-party assets so the app can still open with no signal.
// Firestore/Auth network traffic is deliberately never touched here —
// the app's own online/offline handling covers that already.

const CACHE_VERSION = 'portholes-v1';

const APP_SHELL = [
  'index2.html',
  'test1.html',
  'test2.html',
  'test3.html',
  'test4.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// Static, rarely-changing third-party hosts it's safe to cache.
// Anything on googleapis.com/firebaseio.com NOT in this list (i.e. the
// actual Firestore/Auth API calls) is left completely untouched below.
const CACHEABLE_HOSTS = [
  'www.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.warn('Portholes SW: precache failed', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Live Firestore / Auth / any other Google API traffic — never intercept.
  const isGoogleApi = url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('firebaseio.com');
  if (isGoogleApi && !CACHEABLE_HOSTS.includes(url.hostname)) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableThirdParty = CACHEABLE_HOSTS.includes(url.hostname);
  if (!isSameOrigin && !isCacheableThirdParty) return;

  // Cache-first, refreshing the cache in the background from the network
  // (so a stale copy is shown at most once before the next load picks up
  // whatever changed).
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
