// sw.js - Service Worker
const CACHE_NAME = 'maintenance-app-cache-v15';
const getScopedUrl = (path) => new URL(path, self.registration.scope).toString();

// El evento 'install' se dispara la primera vez que se visita la página
// o cuando se detecta una nueva versión del Service Worker.
// Aquí precacheamos los archivos fundamentales del "app shell".
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install event');
  // La instalación no se considera completa hasta que la promesa se resuelva.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching app shell');
      // Precargamos los archivos esenciales. La raíz '/' es crucial para la carga inicial.
      // Los logos y el manifiesto (si lo hubiera) también son importantes.
      return cache.addAll([
        getScopedUrl('./'),
        getScopedUrl('./index.html'),
        getScopedUrl('./MacrisLogo.png'),
        getScopedUrl('./Macris-horizontal.png')
        // Se ha eliminado '/index.css' porque no existe en la raíz de la compilación.
        // Los archivos JS y CSS con hash (ej. index-DgRWgOPN.js)
        // se cachearán dinámicamente en el evento 'fetch'.
      ]);
    })
  );
});

// El evento 'activate' se dispara después de la instalación.
// Es un buen lugar para limpiar cachés antiguos de versiones anteriores.
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Si el nombre del caché no es el actual, lo eliminamos.
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Forza al SW activado a tomar control inmediato de la página.
  return self.clients.claim();
});

// El evento 'fetch' intercepta TODAS las peticiones de red de la aplicación.
self.addEventListener('fetch', (event) => {
  // Ignoramos las peticiones que no son GET, ya que no se pueden cachear.
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Ignorar peticiones a Supabase y APIs de Google para que siempre vayan a la red.
  if (event.request.url.includes('supabase.co') || event.request.url.includes('googleapis.com')) {
      return;
  }

  // Estrategia: Cache-First, falling back to Network
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Intentar buscar la respuesta en el caché.
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        // Si se encuentra en el caché, la devolvemos inmediatamente.
        return cachedResponse;
      }

      // 2. Si no está en el caché, ir a la red.
      try {
        const networkResponse = await fetch(event.request);
        
        // 3. Si la respuesta de la red es válida, la guardamos en el caché para la próxima vez.
        if (networkResponse.ok) {
           // Hacemos una copia de la respuesta porque los cuerpos de respuesta solo se pueden leer una vez.
          await cache.put(event.request, networkResponse.clone());
        }
        
        // 4. Devolvemos la respuesta de la red.
        return networkResponse;
      } catch (error) {
        // Si tanto el caché como la red fallan (ej. offline y el recurso no está cacheado),
        // este error se propagará, pero no debería ocurrir para el app shell si la primera visita fue online.
        console.error('[Service Worker] Fetch failed; could not retrieve from cache or network:', event.request.url, error);
        throw error;
      }
    })
  );
});
