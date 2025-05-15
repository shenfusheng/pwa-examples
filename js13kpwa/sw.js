
/**
 * Optimized Service Worker Implementation
 * Focuses on providing offline functionality using a network-first approach
 * Updates cache with latest network sources
 */

// Cache names
const CACHE_NAMES = {
  static: 'static-cache-v6', // Adjusted version number
  dynamic: 'dynamic-cache-v6'
}

// Core static assets to precache.
// Minimal list to ensure successful installation while providing basic offline functionality
const CORE_ASSETS = [
  './', // Root path (index.html)
  './index.html' // Explicitly include index.html
]

// Additional assets that should be cached but won't block installation if they fail
const ADDITIONAL_ASSETS = [
  './favicon.ico',
  './apple-touch-icon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './manifest.webmanifest'
]

// Install event - precache core assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...')

  // Use a two-phase caching approach:
  // 1. First, cache essential assets (will fail if any can't be cached)
  // 2. Then, try to cache additional assets (won't fail installation if some can't be cached)
  event.waitUntil(
    caches
      .open(CACHE_NAMES.static)
      .then(async (cache) => {
        console.log('[Service Worker] Precaching core assets')
        // Add core assets first
        await cache.addAll(CORE_ASSETS)

        // Then try to add additional assets individually
        // This way, if any additional asset fails, it won't prevent service worker installation
        const additionalCachePromises = ADDITIONAL_ASSETS.map((asset) =>
          fetch(asset)
            .then((response) => {
              if (response.ok) {
                return cache.put(asset, response)
              }
              console.warn(`[Service Worker] Failed to cache: ${asset}`)
              return Promise.resolve() // Don't fail if this asset can't be cached
            })
            .catch((err) => {
              console.warn(`[Service Worker] Failed to fetch: ${asset}`, err)
              return Promise.resolve() // Don't fail if this asset can't be fetched
            })
        )

        return Promise.all(additionalCachePromises)
      })
      .catch((error) => {
        console.error('[Service Worker] Precaching failed:', error)
      })
  )

  // Take control immediately
  self.skipWaiting()
})

// Activate event - clean up old caches and immediately claim clients
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated')

  // Clean up old cache versions
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !Object.values(CACHE_NAMES).includes(key))
            .map((oldKey) => {
              console.log(`[Service Worker] Deleting old cache: ${oldKey}`)
              return caches.delete(oldKey)
            })
        )
      )
      .then(() => {
        console.log('[Service Worker] Claiming clients')
        return self.clients.claim() // Take control of all pages immediately
      })
  )
})

// Network-first strategy with cache fallback
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

// Stale-while-revalidate strategy
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
