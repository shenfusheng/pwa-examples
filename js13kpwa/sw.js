/**
 * Optimized Service Worker Implementation
 * Focuses on providing offline functionality using a network-first approach
 * Updates cache with latest network sources
 */

// Cache names - Increment version to force refresh
const CACHE_NAMES = {
  static: "static-cache-v13", // Incremented version number
  dynamic: "dynamic-cache-v8",
};

// Core static assets to precache - only include assets confirmed to exist
const CORE_ASSETS = [
  "./", // Root path (index.html)
  "./index.html", // Explicitly include index.html
  "./favicon.ico", // This was confirmed to exist from your logs
];

// Install event - precache core assets
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing");

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
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    console.log(
      `[Service Worker] StaleWhileRevalidate: Cache hit for ${requestUrl}`
    );
  } else {
    console.log(
      `[Service Worker] StaleWhileRevalidate: Cache miss for ${requestUrl}`
    );
  }

  // Fetch from network in parallel to update cache.
  const networkFetchPromise = fetch(request)
    .then((networkResponse) => {
      console.log(
        `[Service Worker] StaleWhileRevalidate: Network response for ${requestUrl}`,
        `status: ${networkResponse.status}`
      );

      if (networkResponse.ok) {
        console.log(
          `[Service Worker] StaleWhileRevalidate: Updating cache for ${requestUrl} in ${cacheName}`
        );
        cache
          .put(request, networkResponse.clone())
          .then(() =>
            console.log(
              `[Service Worker] StaleWhileRevalidate: Cache updated for ${requestUrl}`
            )
          )
          .catch((err) =>
            console.error(
              `[Service Worker] StaleWhileRevalidate: Failed to update cache for ${requestUrl}`,
              err
            )
          );
      } else {
        console.warn(
          `[Service Worker] StaleWhileRevalidate: Bad response (${networkResponse.status}) for ${requestUrl}`
        );
      }
      return networkResponse;
    })
    .catch((error) => {
      console.warn(
        `[Service Worker] StaleWhileRevalidate: Network fetch failed for ${requestUrl}`,
        error
      );
      if (!cachedResponse) {
        console.error(
          `[Service Worker] StaleWhileRevalidate: No cache available as fallback for ${requestUrl}`
        );
        throw error;
      }
      console.log(
        `[Service Worker] StaleWhileRevalidate: Using cached response as fallback for ${requestUrl}`
      );
      return cachedResponse;
    });

  // Return cached response immediately if available, otherwise wait for network.
  if (cachedResponse) {
    console.log(
      `[Service Worker] StaleWhileRevalidate: Returning cached response for ${requestUrl} while revalidating`
    );
    return cachedResponse;
  }
  console.log(
    `[Service Worker] StaleWhileRevalidate: Waiting for network response for ${requestUrl}`
  );
  return networkFetchPromise;
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
self.addEventListener("message", (event) => {
  if (event.data?.type === "NETWORK_STATUS") {
    console.log(
      `[Service Worker] Network is now ${
        event.data.isOnline ? "online" : "offline"
      }`
    );
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

// Listen for messages from the client
self.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "CLEAR_UPDATES") {
    console.log("[Service Worker] Update tracking reset");

    // Delete old cache versions
    // Get all cache keys
    const keys = await caches.keys();
    console.log("[Service Worker] All cache keys:", keys);

    // Delete old versions
    await Promise.all(
      keys
        .filter((key) => !Object.values(CACHE_NAMES).includes(key))
        .map((oldKey) => {
          console.log(`[Service Worker] Deleting old cache: ${oldKey}`);
          return caches.delete(oldKey);
        })
    );
  }
});
