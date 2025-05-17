/**
 * Optimized Service Worker Implementation
 * Focuses on providing offline functionality using a network-first approach
 * Updates cache with latest network sources
 */

// Cache names - Increment version to force refresh
const CACHE_NAMES = {
  static: "static-cache-v15", // Incremented version number
  dynamic: "dynamic-cache-v8",
};

// Core static assets to precache - only include assets confirmed to exist
const CORE_ASSETS = [
  "./", // Root path (index.html)
  "./favicon.ico", // This was confirmed to exist from your logs
];
const swversion = "v15"; // Update this version when making changes to the service worker
// Install event - precache core assets
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing...", swversion);

  // Use a streamlined caching approach focused on core assets
  event.waitUntil(
    (async () => {
      try {
        // Open the cache
        const cache = await caches.open(CACHE_NAMES.static);
        console.log("[Service Worker] Cache opened:", CACHE_NAMES.static);

        // Log what we're about to cache
        console.log("[Service Worker] Precaching assets:", CORE_ASSETS);

        // Add core assets with error reporting
        try {
          await cache.addAll(CORE_ASSETS);
          console.log(
            "[Service Worker] Assets successfully cached in",
            CACHE_NAMES.static
          );

          // List all cached items to confirm
          const keys = await cache.keys();
          console.log(
            `[Service Worker] ${CACHE_NAMES.static} now contains:`,
            keys.map((req) => req.url)
          );
        } catch (error) {
          console.error("[Service Worker] Failed to cache assets:", error);
          throw error; // Re-throw to fail the installation
        }

        console.log("[Service Worker] Installation complete");
        return true; // Explicitly return success
      } catch (mainError) {
        console.error("[Service Worker] Installation failed:", mainError);
        return Promise.reject(mainError); // Explicitly reject on failure
      }
    })()
  );

  // Take control immediately
  self.skipWaiting();
});

// Activate event - clean up old caches and immediately claim clients
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activated");
  self.clients.claim(); // Take control of all clients immediately
  setTimeout(() => {
    checkForUpdates();
    console.log("[Service Worker] Checking for updates...");
  }, 5000); // Use setTimeout to ensure this runs after the activate event
});

// Network-first strategy with cache fallback
async function networkFirst(request, cacheName) {
  const requestUrl = request.url;
  console.log(`[Service Worker] NetworkFirst: Fetching ${requestUrl}`);

  try {
    const networkResponse = await fetch(request);
    console.log(
      `[Service Worker] NetworkFirst: Network response for ${requestUrl}`,
      `status: ${networkResponse.status}`
    );

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      console.log(
        `[Service Worker] NetworkFirst: Caching response for ${requestUrl} in ${cacheName}`
      );
      await cache.put(request, networkResponse.clone());
      console.log(
        `[Service Worker] NetworkFirst: Successfully cached ${requestUrl}`
      );
    } else {
      console.warn(
        `[Service Worker] NetworkFirst: Bad response (${networkResponse.status}) for ${requestUrl}`
      );
    }
    return networkResponse;
  } catch (error) {
    console.log(
      `[Service Worker] NetworkFirst: Network failed for ${requestUrl}`,
      error
    );
    console.log(
      `[Service Worker] NetworkFirst: Falling back to cache for ${requestUrl}`
    );

    const cached = await caches.match(request);
    if (cached) {
      console.log(
        `[Service Worker] NetworkFirst: Serving from cache for ${requestUrl}`
      );
      return cached;
    }

    console.log(
      `[Service Worker] NetworkFirst: No cache found for ${requestUrl}`
    );
    if (request.url.includes("/api/") || request.url.includes("/graphql")) {
      console.log(
        `[Service Worker] NetworkFirst: Serving offline API response for ${requestUrl}`
      );
      return new Response(
        JSON.stringify({
          offline: true,
          message: "Offline: data unavailable.",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (request.mode === "navigate") {
      console.log(
        `[Service Worker] NetworkFirst: Serving index.html for navigation to ${requestUrl}`
      );
      return caches.match("./index.html");
    }

    console.log(
      `[Service Worker] NetworkFirst: Serving generic offline response for ${requestUrl}`
    );
    return new Response("Resource unavailable offline", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request, cacheName) {
  const requestUrl = request.url;
  console.log(`[Service Worker] StaleWhileRevalidate: Handling ${requestUrl}`);

  const cache = await caches.open(cacheName);

  // Try to get the response from cache.
  const cachedResponsePromise = cache.match(request);
  // Simultaneously, fetch the response from the network.
  const networkResponsePromise = fetch(request);

  // If a cached response is found, return it immediately.
  // In the background, update the cache with the network response.
  const cachedResponse = await cachedResponsePromise;
  if (cachedResponse) {
    console.log(
      `[Service Worker] StaleWhileRevalidate: Cache hit for ${requestUrl}. Returning cached response.`
    );

    // Don't wait for the network to respond to update the cache (non-blocking).
    // This ensures the user gets the cached content fast.
    networkResponsePromise
      .then((networkResponse) => {
        if (networkResponse.ok) {
          console.log(
            `[Service Worker] StaleWhileRevalidate: Background update - Caching network response for ${requestUrl}`
          );
          // Clone the response before putting it in the cache, as the body can only be consumed once.
          cache.put(request, networkResponse.clone()).catch((err) => {
            console.error(
              `[Service Worker] StaleWhileRevalidate: Background cache put failed for ${requestUrl}`,
              err
            );
          });
        } else {
          console.warn(
            `[Service Worker] StaleWhileRevalidate: Background update - Network request for ${requestUrl} failed with status ${networkResponse.status}. Not updating cache.`
          );
        }
      })
      .catch((error) => {
        // This catch is for the background network request.
        // The user has already received the cached response, so this error is for logging/debugging.
        console.warn(
          `[Service Worker] StaleWhileRevalidate: Background network fetch for cache update failed for ${requestUrl}`,
          error
        );
      });

    return cachedResponse;
  }

  // If no cached response is found, wait for the network response.
  console.log(
    `[Service Worker] StaleWhileRevalidate: Cache miss for ${requestUrl}. Waiting for network response.`
  );
  try {
    const networkResponse = await networkResponsePromise;
    // If the network request is successful, cache it before returning.
    if (networkResponse.ok) {
      console.log(
        `[Service Worker] StaleWhileRevalidate: Caching network response for ${requestUrl}`
      );
      // Clone the response before putting it in the cache.
      cache.put(request, networkResponse.clone()).catch((err) => {
        console.error(
          `[Service Worker] StaleWhileRevalidate: Cache put failed for ${requestUrl}`,
          err
        );
      });
    }
    return networkResponse;
  } catch (error) {
    // This error occurs if the network fetch fails and there was no cached response.
    console.error(
      `[Service Worker] StaleWhileRevalidate: Network fetch failed for ${requestUrl} and no cache available.`,
      error
    );
    // At this point, you might want to return a generic fallback page or error response,
    // especially for navigation requests. For now, we re-throw.
    throw error;
  }
}

// Fetch handler - slightly modified to ensure cache status is logged
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests
  if (request.method !== "GET") return;

  // Log all fetch operations to help with debugging
  console.log(`[Service Worker] Fetch: ${request.url}`);

  // Handle navigation requests (e.g., index.html) with network-first.
  if (request.mode === "navigate") {
    console.log(`[Service Worker] Navigation request: ${request.url}`);
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.static));
    return;
  }

  // Handle static assets with stale-while-revalidate.
  const isStaticAsset =
    ["style", "script", "font", "image"].includes(request.destination) ||
    /\.(svg|css|js|json|woff2?|ttf|eot|wasm|png|jpe?g|gif)$/.test(url.pathname);

  if (isStaticAsset) {
    console.log(`[Service Worker] Static asset request: ${request.url}`);
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.static));
    return;
  }

  // Handle API requests with network-first.
  if (url.pathname.includes("/api/") || url.pathname.includes("/graphql")) {
    console.log(`[Service Worker] API request: ${request.url}`);
    event.respondWith(networkFirst(request, CACHE_NAMES.dynamic));
    return;
  }

  // Default handling for any other GET requests.
  console.log(`[Service Worker] Default handling: ${request.url}`);
  event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.dynamic));
});

// Listen for online/offline status messages
self.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "NETWORK_STATUS") {
    console.log(
      `[Service Worker] Network is now ${
        event.data.isOnline ? "online" : "offline"
      }`
    );
  } else if (event.data && event.data.type === "CLEAR_UPDATES") {
    console.log(
      "[Service Worker] Received CLEAR_UPDATES message. Deleting ALL caches."
    );

    // Get all cache keys
    const keys = await caches.keys();
    console.log("[Service Worker] All cache keys to be deleted:", keys);

    // Delete ALL caches
    await Promise.all(
      keys.map((key) => {
        console.log(`[Service Worker] Deleting cache: ${key}`);
        return caches.delete(key);
      })
    );
    console.log("[Service Worker] All caches deleted.");
  }
});

async function checkForUpdates() {
  try {
    // Get all clients
    const clients = await self.clients.matchAll();

    // Notify each client about the update
    clients.forEach((client) => {
      client.postMessage({
        type: "UPDATE_AVAILABLE",
      });
    });

    console.log("[Service Worker] Update notification sent to clients");
  } catch (error) {
    console.error("[Service Worker] Error checking for updates:", error);
  }
}
