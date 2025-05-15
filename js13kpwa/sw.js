self.importScripts('data/games.js');

/**
 * Optimized Service Worker Implementation
 * Focuses on providing offline functionality using a network-first approach
 * Updates cache with latest network sources
 */

// Cache names
const CACHE_NAMES = {
  static: 'static-cache-v3',
  dynamic: 'dynamic-cache-v2'
}

// Core static assets to precache.
// These assets are cached on service worker installation, ensuring they are available
// for the very first load, even if the user is offline.
// Note: cache.addAll() does not support glob patterns like './assets/**'.
// If specific assets from a directory are needed for precaching, they must be listed explicitly
// or this array should be populated by a build process that resolves such patterns.
// For simplicity, './assets/**' is removed here; add specific, critical asset paths if needed.
const CORE_ASSETS = [
  './', // Represents the root path, often serving index.html
  './index.html', // The main HTML file
  './favicon.ico', // Application favicon
  './apple-touch-icon.png', // Apple touch icon
  './pwa-192x192.png', // PWA icon
  './pwa-512x512.png', // PWA icon
  './manifest.webmanifest' // Web app manifest
  // Add other critical assets here, e.g., './css/style.css', './js/main.js'
  // './assets/**' was removed as it's not standard for cache.addAll.
  // List specific critical assets from your assets folder if they must be precached.
]

// Install event - precache core assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...')
  event.waitUntil(
    caches
      .open(CACHE_NAMES.static)
      .then((cache) => {
        console.log('[Service Worker] Precaching core assets')
        return cache.addAll(CORE_ASSETS)
      })
      .catch((error) => {
        console.error('[Service Worker] Precaching failed:', error)
      })
  )
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated')
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !Object.values(CACHE_NAMES).includes(key))
            .map((oldKey) => caches.delete(oldKey))
        )
      )
  )
  // Ensure the new service worker takes control of all clients immediately.
  return self.clients.claim()
})

/**
 * Network-first strategy with cache fallback
 * @param {Request} request
 * @param {string} cacheName
 * @returns {Promise<Response>}
 */
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch {
    console.log('[Service Worker] Network failed, falling back to cache')
    const cached = await caches.match(request)
    if (cached) return cached

    if (request.url.includes('/api/') || request.url.includes('/graphql')) {
      return new Response(
        JSON.stringify({ offline: true, message: 'Offline: data unavailable.' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (request.mode === 'navigate') {
      return caches.match('./index.html')
    }

    return new Response('Resource unavailable offline', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}

/**
 * Stale-while-revalidate strategy
 * Responds from cache if available, then updates cache from network.
 * If not in cache, fetches from network, caches, and responds.
 * @param {Request} request
 * @param {string} cacheName
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)

  // Fetch from network in parallel to update cache.
  const networkFetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone())
      }
      return networkResponse
    })
    .catch((error) => {
      console.warn('[Service Worker] Network fetch failed for staleWhileRevalidate:', error)
      if (!cachedResponse) throw error
      return cachedResponse
    })

  // Return cached response immediately if available, otherwise wait for network.
  return cachedResponse || networkFetchPromise
}

// Fetch handler - applies appropriate caching strategies to all GET requests from same origin
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignore non-GET requests and cross-origin requests.
  // if (url.origin !== self.location.origin || request.method !== 'GET') return
  if (request.method !== 'GET') return

  // Handle navigation requests (e.g., index.html) with network-first.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CACHE_NAMES.static))
    return
  }

  // Handle static assets (CSS, JS, images, fonts) with stale-while-revalidate.
  const isStaticAsset =
    ['style', 'script', 'font', 'image'].includes(request.destination) ||
    /\.(svg|css|js|json|woff2?|ttf|eot|wasm|png|jpe?g|gif)$/.test(url.pathname)

  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.static))
    return
  }

  // Handle API requests with network-first.
  if (url.pathname.includes('/api/') || url.pathname.includes('/graphql')) {
    event.respondWith(networkFirst(request, CACHE_NAMES.dynamic))
    return
  }

  // Default handling for any other GET requests.
  event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.dynamic))
})

// Listen for online/offline status messages
self.addEventListener('message', (event) => {
  if (event.data?.type === 'NETWORK_STATUS') {
    console.log(`[Service Worker] Network is now ${event.data.isOnline ? 'online' : 'offline'}`)
  }
})


