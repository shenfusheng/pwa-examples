/**
 * Optimized Service Worker Implementation
 * Focuses on providing offline functionality using a network-first approach
 * Updates cache with latest network sources
 */

// Cache names - Increment version to force refresh
const CACHE_NAMES = {
  static: 'static-cache-v9', // Incremented version number
  dynamic: 'dynamic-cache-v9'
}

// Core static assets to precache - only include assets confirmed to exist
const CORE_ASSETS = [
  './', // Root path (index.html)
  './index.html', // Explicitly include index.html
  './favicon.ico' // This was confirmed to exist from your logs
]

// Install event - precache core assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...', new Date().toISOString())

  // Use a streamlined caching approach focused on core assets
  event.waitUntil(
    (async () => {
      try {
        // Open the cache
        const cache = await caches.open(CACHE_NAMES.static)
        console.log('[Service Worker] Cache opened:', CACHE_NAMES.static)

        // Log what we're about to cache
        console.log('[Service Worker] Precaching assets:', CORE_ASSETS)

        // Add core assets with error reporting
        try {
          await cache.addAll(CORE_ASSETS)
          console.log('[Service Worker] Assets successfully cached in', CACHE_NAMES.static)

          // List all cached items to confirm
          const keys = await cache.keys()
          console.log(
            `[Service Worker] ${CACHE_NAMES.static} now contains:`,
            keys.map((req) => req.url)
          )
        } catch (error) {
          console.error('[Service Worker] Failed to cache assets:', error)
          throw error // Re-throw to fail the installation
        }

        console.log('[Service Worker] Installation complete')
        return true // Explicitly return success
      } catch (mainError) {
        console.error('[Service Worker] Installation failed:', mainError)
        return Promise.reject(mainError) // Explicitly reject on failure
      }
    })()
  )

  // Take control immediately
  self.skipWaiting()
})

// Activate event - clean up old caches and immediately claim clients
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated', new Date().toISOString())

  // This ensures faster control of clients
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'SW_ACTIVATED',
        message: 'New service worker activated'
      })
    })
  })

  // Clean up old cache versions
  event.waitUntil(
    (async () => {
      try {
        // Get all cache keys
        const keys = await caches.keys()
        console.log('[Service Worker] All cache keys:', keys)

        // Delete old versions
        await Promise.all(
          keys
            .filter((key) => !Object.values(CACHE_NAMES).includes(key))
            .map((oldKey) => {
              console.log(`[Service Worker] Deleting old cache: ${oldKey}`)
              return caches.delete(oldKey)
            })
        )

        // Check what's in our current cache
        const staticCache = await caches.open(CACHE_NAMES.static)
        const cacheKeys = await staticCache.keys()
        console.log(
          `[Service Worker] ${CACHE_NAMES.static} contains:`,
          cacheKeys.map((req) => req.url)
        )

        // FORCEFUL CLIENT CLAIMING - This makes the service worker take control immediately
        await self.clients.claim()
        console.log('[Service Worker] Clients claimed successfully', new Date().toISOString())

        // Notify the main page that we're ready to handle requests
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'SW_READY',
              message: 'Service worker is ready to handle requests'
            })
          })
        })

        return true
      } catch (error) {
        console.error('[Service Worker] Activation error:', error)
        throw error
      }
    })()
  )
})

// Network-first strategy with cache fallback
async function networkFirst(request, cacheName) {
  const requestUrl = request.url
  console.log(`[Service Worker] NetworkFirst: Fetching ${requestUrl}`)

  try {
    const networkResponse = await fetch(request)
    console.log(
      `[Service Worker] NetworkFirst: Network response for ${requestUrl}`,
      `status: ${networkResponse.status}`
    )

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName)
      console.log(
        `[Service Worker] NetworkFirst: Caching response for ${requestUrl} in ${cacheName}`
      )
      await cache.put(request, networkResponse.clone())
      console.log(`[Service Worker] NetworkFirst: Successfully cached ${requestUrl}`)
    } else {
      console.warn(
        `[Service Worker] NetworkFirst: Bad response (${networkResponse.status}) for ${requestUrl}`
      )
    }
    return networkResponse
  } catch (error) {
    console.log(`[Service Worker] NetworkFirst: Network failed for ${requestUrl}`, error)
    console.log(`[Service Worker] NetworkFirst: Falling back to cache for ${requestUrl}`)

    const cached = await caches.match(request)
    if (cached) {
      console.log(`[Service Worker] NetworkFirst: Serving from cache for ${requestUrl}`)
      return cached
    }

    console.log(`[Service Worker] NetworkFirst: No cache found for ${requestUrl}`)
    if (request.url.includes('/api/') || request.url.includes('/graphql')) {
      console.log(`[Service Worker] NetworkFirst: Serving offline API response for ${requestUrl}`)
      return new Response(
        JSON.stringify({ offline: true, message: 'Offline: data unavailable.' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (request.mode === 'navigate') {
      console.log(
        `[Service Worker] NetworkFirst: Serving index.html for navigation to ${requestUrl}`
      )
      return caches.match('./index.html')
    }

    console.log(`[Service Worker] NetworkFirst: Serving generic offline response for ${requestUrl}`)
    return new Response('Resource unavailable offline', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request, cacheName) {
  const requestUrl = request.url
  console.log(`[Service Worker] StaleWhileRevalidate: Handling ${requestUrl}`)

  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)

  if (cachedResponse) {
    console.log(`[Service Worker] StaleWhileRevalidate: Cache hit for ${requestUrl}`)
  } else {
    console.log(`[Service Worker] StaleWhileRevalidate: Cache miss for ${requestUrl}`)
  }

  // Fetch from network in parallel to update cache.
  const networkFetchPromise = fetch(request)
    .then((networkResponse) => {
      console.log(
        `[Service Worker] StaleWhileRevalidate: Network response for ${requestUrl}`,
        `status: ${networkResponse.status}`
      )

      if (networkResponse.ok) {
        console.log(
          `[Service Worker] StaleWhileRevalidate: Updating cache for ${requestUrl} in ${cacheName}`
        )
        cache
          .put(request, networkResponse.clone())
          .then(() =>
            console.log(`[Service Worker] StaleWhileRevalidate: Cache updated for ${requestUrl}`)
          )
          .catch((err) =>
            console.error(
              `[Service Worker] StaleWhileRevalidate: Failed to update cache for ${requestUrl}`,
              err
            )
          )
      } else {
        console.warn(
          `[Service Worker] StaleWhileRevalidate: Bad response (${networkResponse.status}) for ${requestUrl}`
        )
      }
      return networkResponse
    })
    .catch((error) => {
      console.warn(
        `[Service Worker] StaleWhileRevalidate: Network fetch failed for ${requestUrl}`,
        error
      )
      if (!cachedResponse) {
        console.error(
          `[Service Worker] StaleWhileRevalidate: No cache available as fallback for ${requestUrl}`
        )
        throw error
      }
      console.log(
        `[Service Worker] StaleWhileRevalidate: Using cached response as fallback for ${requestUrl}`
      )
      return cachedResponse
    })

  // Return cached response immediately if available, otherwise wait for network.
  if (cachedResponse) {
    console.log(
      `[Service Worker] StaleWhileRevalidate: Returning cached response for ${requestUrl} while revalidating`
    )
    return cachedResponse
  }
  console.log(
    `[Service Worker] StaleWhileRevalidate: Waiting for network response for ${requestUrl}`
  )
  return networkFetchPromise
}

// Fetch handler - slightly modified to ensure cache status is logged
let firstFetchHandled = false

self.addEventListener('fetch', (event) => {
  if (!firstFetchHandled) {
    console.log(
      '[Service Worker] 🚨 First fetch event received!',
      new Date().toISOString(),
      event.request.url
    )
    firstFetchHandled = true
  }

  const { request } = event
  const url = new URL(request.url)

  // Ignore non-GET requests
  if (request.method !== 'GET') return

  // Log all fetch operations to help with debugging
  console.log(`[Service Worker] Fetch: ${request.url}`)

  // Handle navigation requests (e.g., index.html) with network-first.
  if (request.mode === 'navigate') {
    console.log(`[Service Worker] Navigation request: ${request.url}`)
    event.respondWith(networkFirst(request, CACHE_NAMES.static))
    return
  }

  // Handle static assets with stale-while-revalidate.
  const isStaticAsset =
    ['style', 'script', 'font', 'image'].includes(request.destination) ||
    /\.(svg|css|js|json|woff2?|ttf|eot|wasm|png|jpe?g|gif)$/.test(url.pathname)

  if (isStaticAsset) {
    console.log(`[Service Worker] Static asset request: ${request.url}`)
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.static))
    return
  }

  // Handle API requests with network-first.
  if (url.pathname.includes('/api/') || url.pathname.includes('/graphql')) {
    console.log(`[Service Worker] API request: ${request.url}`)
    event.respondWith(networkFirst(request, CACHE_NAMES.dynamic))
    return
  }

  // Default handling for any other GET requests.
  console.log(`[Service Worker] Default handling: ${request.url}`)
  event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.dynamic))
})

// Add this code to add a bit more insight into what resources are requested during page load
self.addEventListener(
  'fetch',
  (event) => {
    // Record request destinations to see what types of resources are being fetched
    const destination = event.request.destination || 'unknown'
    if (!self._requestStats) {
      self._requestStats = {}
    }

    if (!self._requestStats[destination]) {
      self._requestStats[destination] = 0
    }

    self._requestStats[destination]++

    // Log every 5 requests to prevent console clutter
    if (Object.values(self._requestStats).reduce((a, b) => a + b, 0) % 5 === 0) {
      console.log('[Service Worker] Request statistics:', JSON.stringify(self._requestStats))
    }
  },
  { passive: true }
)

// Listen for online/offline status messages
self.addEventListener('message', (event) => {
  if (event.data?.type === 'NETWORK_STATUS') {
    console.log(`[Service Worker] Network is now ${event.data.isOnline ? 'online' : 'offline'}`)
  }
  // Add a ping-pong mechanism to check if the service worker is responsive
  else if (event.data?.type === 'PING') {
    console.log(`[Service Worker] Received ping`, new Date().toISOString())
    event.source.postMessage({
      type: 'PONG',
      message: 'Service worker is active and responding',
      timestamp: new Date().toISOString()
    })
  }
})
