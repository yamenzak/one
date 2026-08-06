/**
 * Scena dashboard service worker — the minimum needed to make the app
 * installable, plus a conservative offline shell. Vite content-hashes assets, so
 * cache-first for them is safe; navigations stay network-first so a deploy is
 * always picked up, falling back to the cached shell only when offline. The API
 * is never touched.
 */
const CACHE = "scena-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(["/"]).catch(() => {}); // cache the app shell for offline nav
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // leave cross-origin (fonts/API) alone
  if (url.pathname.startsWith("/api")) return;         // never cache the API

  // Navigations: network-first, cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  // Hashed static assets: cache-first (immutable), warm the cache on first hit.
  if (/\.(?:js|css|woff2?|png|svg|webmanifest|ico)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    })());
  }
});
