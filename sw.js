/* World Cup 2026 — Service Worker (v36) */
const VERSION = "wc2026-v36";
const CORE = [
  "./index.html", "./privacy.html", "./eg.html", "./sa.html", "./guide.html", "./cities.html", "./teams.html", "./manifest.json",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png",
  "./apple-touch-icon.png", "./og-image.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Always go to network first for live results so updates show fast
  if (url.pathname.endsWith("scores.json")) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Network-first for the page itself so new versions show immediately
  if (req.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname === "/" || url.pathname.endsWith("/")) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req).then(m => m || caches.match("./index.html")))
    );
    return;
  }

  // Don't cache cross-origin (weather API, fonts, etc.)
  if (url.origin !== location.origin) return;

  // Stale-while-revalidate for same-origin assets
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return r;
      }).catch(() => cached || caches.match("./index.html"));
      return cached || network;
    })
  );
});

// Focus existing tab (or open one) when a notification is clicked
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (new URL(c.url).pathname.includes("worldcup2026") || new URL(c.url).origin === self.location.origin) {
          return c.focus();
        }
      }
      return self.clients.openWindow("./index.html");
    })
  );
});

// Allow the page to ask the SW to show a notification (used as a fallback path)
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "show-notification" && d.title) {
    self.registration.showNotification(d.title, d.options || {});
  }
});
