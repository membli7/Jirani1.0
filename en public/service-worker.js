// Updated service worker with versioned cache and update messaging
"use strict";

// Fetch the current version of the app from version.json
const VERSION_URL = "/version.json";
let CACHE_NAME = "jirani-chama-shell"; // will be appended with version
let APP_SHELL = [
  "/",
  "/profile.html",
  "/member-login.html",
  "/register.html",
  "/manifest.webmanifest",
  "/brand-mark.svg",
  "/brand-lockup.svg",
  "/assets/app-icon-180.png",
  "/assets/app-icon-192.png",
  "/assets/app-icon-512.png",
  "/chama.css",
  "/landing-theme.css",
];

// Helper to get version and update CACHE_NAME
async function getCacheName() {
  try {
    const resp = await fetch(VERSION_URL, {cache: "no-store"});
    if (resp.ok) {
      const json = await resp.json();
      const ver = json.version || "unknown";
      return `${CACHE_NAME}-${ver}`;
    }
  } catch (e) {
    // ignore errors, fallback to default
  }
  return CACHE_NAME;
}

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const name = await getCacheName();
      const cache = await caches.open(name);
      await cache.addAll(APP_SHELL);
      // Force waiting service worker to activate immediately
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const currentName = await getCacheName();
      const keys = await caches.keys();
      await Promise.all(
        keys.map(key => {
          if (key !== currentName && key.startsWith(CACHE_NAME)) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Do not cache API or upload paths
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  // Navigation requests – network first, fallback to cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match("/")) || Response.error())
    );
    return;
  }

  // Static assets – cache first, then network update
  if (!/\.(?:js|css|svg|png|webp|woff2?)$/i.test(url.pathname)) return;
  event.respondWith(
    caches.match(request, {ignoreSearch: true}).then(cached => {
      const update = fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || update;
    })
  );
});

// Push handling unchanged
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text?.() || "You have a new Chama notification." }; }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 100) : "Jirani Chama";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 300) : "You have a new Chama notification.";
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 180) : "jirani-chama-notification";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/assets/app-icon-192.png",
    badge: "/assets/app-icon-180.png",
    tag,
    renotify: false,
    data: { url: "/" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({type: "window", includeUncontrolled: true}).then(async clients => {
      const existing = clients.find(c => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        return existing.navigate ? existing.navigate("/") : undefined;
      }
      return self.clients.openWindow("/");
    })
  );
});

// Listen for message from client to trigger immediate update
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
