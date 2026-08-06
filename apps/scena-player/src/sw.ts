/**
 * Service Worker — the offline foundation (BLUEPRINT §8).
 *
 * Cache the app shell (stale-while-revalidate) and cache-first every
 * content-addressed asset — the demo route and real channel media alike, which
 * precache.ts warms into ASSET_CACHE before first paint — so a paired screen
 * keeps painting from cache when the network drops, even offline from a cold
 * reload. Assets are addressed by content hash, so this cache is safe to keep
 * forever (immutable urls). Future work: LRU-evict superseded versions.
 */

/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;

// Baked in per build (vite `define`). Because it's part of sw.js, a new deploy
// changes this file's bytes → the browser detects a Service Worker update →
// the app reloads itself (main.ts). The shell cache is namespaced by it so a
// new build refetches a fresh shell instead of serving the old one forever.
declare const __BUILD_ID__: string;
const BUILD = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

const SHELL_CACHE = `scena-shell-${BUILD}`;
const ASSET_CACHE = "scena-assets-v1"; // content-addressed → stable across builds

/** The app shell — stable paths (see vite.config) so a screen boots offline. */
const SHELL = ["/", "/index.html", "/assets/main.js", "/manifest.webmanifest"];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Precache each shell entry independently — one missing path must not
      // abort the whole install (cache.addAll is all-or-nothing).
      await Promise.allSettled(SHELL.map((path) => cache.add(path)));
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Content-addressed media: cache-first, since a hash's bytes never change.
  // Covers BOTH the demo asset route and real channel assets served from the API
  // (a separate origin). precache.ts warms ASSET_CACHE with these urls before
  // first paint, so an offline reload paints real media from cache — without this
  // the cross-origin `/api/assets/:hash` requests fell through to the network and
  // broke offline playout for every non-demo channel.
  if (url.pathname.includes("/api/assets/") || url.pathname.includes("/api/demo/asset/")) {
    event.respondWith(cacheFirst(ASSET_CACHE, req));
    return;
  }

  // App shell (same-origin navigations + built assets): stale-while-revalidate.
  if (url.origin === sw.location.origin) {
    event.respondWith(staleWhileRevalidate(SHELL_CACHE, req));
  }
});

// `ignoreVary` so a request that carries an Origin header (e.g. a `crossorigin`
// module script, or a CORS asset fetch) still matches an entry cached from a
// request without one. Without this, an offline reload can't find its own JS.
const MATCH_OPTS: CacheQueryOptions = { ignoreVary: true };

async function cacheFirst(cacheName: string, req: Request): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, MATCH_OPTS);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(cacheName: string, req: Request): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, MATCH_OPTS);
  const fetching = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit ?? Response.error());
  return hit ?? fetching;
}
