// Amana OSHC — Service Worker
// Enables PWA install prompt and caches app shell for faster repeat loads.
// This is intentionally minimal — the app requires API access so full offline
// mode is not supported.

const CACHE_NAME = "amana-v2";

// App shell assets to cache on install
const APP_SHELL = ["/dashboard", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only cache GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith("http") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // A short allowlist of parent GETs gets network-first-with-fallback:
  // the school gate is exactly where reception dies, and "where in the
  // school are we / what's booked / what's on this week" are the
  // questions being asked there. Fresh whenever online — the cache is
  // only ever what you saw last time, never served in preference.
  // Everything else under /api/ stays uncached: bookings POSTs, auth,
  // and anything whose staleness could mislead.
  const OFFLINE_OK = [
    "/api/parent/centres",
    "/api/parent/bookings",
    "/api/parent/daily-info",
    "/api/parent/today",
  ];
  if (url.pathname.startsWith("/api/")) {
    if (!OFFLINE_OK.some((p) => url.pathname === p)) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Network-first strategy: try network, fall back to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── Push Notifications ─────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || "Amana OSHC";
    const options = {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url || "/parent" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Ignore malformed push payloads
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/parent";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab if open
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open new tab
        return self.clients.openWindow(url);
      })
  );
});
