/**
 * Pre-cache before first paint (BLUEPRINT §8).
 *
 * "Start playout only once the current cycle's assets are cached → displays
 * like TV, no loading spinner." We fetch every asset the manifest references;
 * the Service Worker's cache-first handler stores each one by its (immutable,
 * content-addressed) url, so a later reload — even offline — serves them
 * locally. The manifest JSON itself is persisted separately (localStorage),
 * since it's cross-origin and short-lived on the wire.
 *
 * Content-hash addressing means an unchanged asset is already cached and its
 * fetch resolves from the SW without touching the network.
 */

import type { Manifest } from "@scena/manifest";
import { saveManifest } from "./store.js";

/** Must match ASSET_CACHE in sw.ts — page and SW share the same Cache Storage. */
const ASSET_CACHE = "scena-assets-v1";

export interface PrecacheResult {
  total: number;
  cached: number;
  failed: number;
}

/**
 * Warm the cache for a manifest and persist it. We write to Cache Storage
 * directly from the page rather than relying on the Service Worker to intercept
 * — the SW may not yet control this load, but it reads the same named cache on
 * the next one. Resolves when every asset has been attempted; failures are
 * tolerated so one bad asset can't block the whole screen from starting.
 */
/** How many assets to fetch at once. Bounded so a weak TV never spikes RAM +
 *  bandwidth pulling every video/image at boot — a few streams in flight, the
 *  rest queued. (A big channel on 512 MB hardware would OOM fetching all at once.) */
const PRECACHE_CONCURRENCY = 3;

export async function precacheManifest(manifest: Manifest): Promise<PrecacheResult> {
  saveManifest(manifest);

  const urls = uniqueAssetUrls(manifest);
  const cache = "caches" in globalThis ? await caches.open(ASSET_CACHE) : null;

  let cached = 0;
  let failed = 0;
  let next = 0;

  // A fixed pool of workers drains the queue; each streams the body straight to
  // Cache Storage (no res.clone(), which would double-buffer the whole asset in
  // RAM). At most PRECACHE_CONCURRENCY assets are ever resident at once.
  async function worker(): Promise<void> {
    while (next < urls.length) {
      const url = urls[next++];
      if (url === undefined) continue;
      try {
        // Content-addressed urls are immutable: a hit means already cached.
        if (cache && (await cache.match(url))) { cached++; continue; }
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) throw new Error(`${res.status}`);
        if (cache) await cache.put(url, res); // consumes the body (streamed)
        else await res.arrayBuffer().catch(() => {}); // no cache → drain, don't leak
        cached++;
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PRECACHE_CONCURRENCY, urls.length) }, worker));

  return { total: urls.length, cached, failed };
}

function uniqueAssetUrls(manifest: Manifest): string[] {
  // The assets[] table is the complete pre-cache set (§8): every image, video,
  // audio, and font file the manifest references, each with a fetchable url.
  // Fonts appear here by hash too, so text never pops on first paint.
  const seen = new Set<string>();
  for (const a of manifest.assets) if (a.url) seen.add(a.url);
  return [...seen];
}
