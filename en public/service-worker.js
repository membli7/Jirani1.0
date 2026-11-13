"use strict";

const CACHE_NAME = "jirani-chama-shell-v1";
const APP_SHELL = [
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

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_SHELL).catch(() => undefined))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith("jirani-chama-") && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then(cache => cache.put(url.pathname, copy));
      }
      return response;
    }).catch(async () => (await caches.match(url.pathname)) || (await caches.match("/")) || Response.error()));
    return;
  }

  if (!/\.(?:js|css|svg|png|webp|woff2?)$/i.test(url.pathname)) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => {
    const update = fetch(request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    });
    return cached || update;
  }));
});

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
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      return existing.navigate ? existing.navigate("/") : undefined;
    }
    return self.clients.openWindow("/");
  }));
});
