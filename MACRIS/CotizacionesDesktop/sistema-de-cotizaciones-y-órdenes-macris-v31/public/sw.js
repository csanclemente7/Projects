const CACHE_PREFIX = 'macris-cotizaciones-pwa';
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;

const scopedUrl = (path) => new URL(path, self.registration.scope).toString();

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS.map(scopedUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
            .filter((cacheName) => ![STATIC_CACHE, RUNTIME_CACHE].includes(cacheName))
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

function shouldBypassCache(request) {
  if (request.method !== 'GET') return true;

  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return true;

  const hostname = url.hostname;
  if (hostname.endsWith('supabase.co')) return true;
  if (hostname === 'formsubmit.co') return true;

  return false;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(STATIC_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(scopedUrl('./index.html'), response.clone());
    }
    return response;
  } catch (error) {
    return (
      (await cache.match(request)) ||
      (await cache.match(scopedUrl('./index.html'))) ||
      (await cache.match(scopedUrl('./')))
    );
  }
}

async function cacheFirstAsset(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (shouldBypassCache(request)) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (['script', 'style', 'worker', 'font', 'image', 'manifest'].includes(request.destination)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
