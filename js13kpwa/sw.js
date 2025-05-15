/**
 * Optimized Service Worker Implementation
 * Focuses on providing offline functionality using a network-first approach
 * Updates cache with latest network sources
 */

// Cache names
const CACHE_NAMES = {
  static: 'static-cache-v7', // Adjusted version number
  dynamic: 'dynamic-cache-v7'
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

  // Use a two-phase caching approach with better error handling and reporting
  event.waitUntil(
    (async () => {
      try {
        // Open the cache
        const cache = await caches.open(CACHE_NAMES.static)
        console.log('[Service Worker] Cache opened')

        // Log what we're about to cache
        console.log('[Service Worker] Precaching core assets:', CORE_ASSETS)

        // Add core assets first with better error reporting
        try {
          await cache.addAll(CORE_ASSETS)
          console.log('[Service Worker] Core assets successfully cached')
        } catch (error) {
          console.error('[Service Worker] Failed to cache core assets:', error)
          throw error // Re-throw to fail the installation
        }

        // Then try to add additional assets individually with detailed logging
        console.log('[Service Worker] Attempting to cache additional assets:', ADDITIONAL_ASSETS)

        // Process additional assets one by one for better error isolation
        for (const asset of ADDITIONAL_ASSETS) {
          try {
            const response = await fetch(asset)
            if (response.ok) {
              await cache.put(asset, response)
              console.log(`[Service Worker] Successfully cached: ${asset}`)
            } else {
              console.warn(`[Service Worker] Failed to cache (status ${response.status}): ${asset}`)
            }
          } catch (err) {
            console.warn(`[Service Worker] Failed to fetch: ${asset}`, err)
          }
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
