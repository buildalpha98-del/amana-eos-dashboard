// Amana OSHC — Service Worker
// Enables PWA install prompt and caches app shell for faster repeat loads.
// This is intentionally minimal — the app requires API access so full offline
// mode is not supported.

const CACHE_NAME = "amana-v1";

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

  // Skip API calls, auth routes, and non-HTTP(S) requests
  const url = new URL(request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    !url.protocol.startsWith("http")
  ) {
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
