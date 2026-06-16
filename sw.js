/* World Cup 2026 — Service Worker (v3) */
const VERSION = "wc2026-v8";
const CORE = [
  "./index.html", "./manifest.json",
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
