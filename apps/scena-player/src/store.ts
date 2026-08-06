/**
 * Local persistence for offline cold-boot (BLUEPRINT §8).
 *
 * A screen that reloads while disconnected must still know *what* to play and
 * *where in the timeline* it is. We persist two things:
 *   - the last manifest (so playout can resume with no network), and
 *   - a wall-clock bridge for the synced clock (see the clock note below).
 */

import { safeParseManifest, type Manifest } from "@scena/manifest";

const MANIFEST_KEY = "scena.manifest";
const CLOCK_KEY = "scena.clock";
const LEASE_KEY = "scena.lease";
/** Content asset cache name — must match ASSET_CACHE in sw.ts / precache.ts. */
const ASSET_CACHE = "scena-assets-v1";

/**
 * How long an offline screen may keep playing its last channel without any live
 * server contact (§8 offline-first, but bounded). Every heartbeat while online
 * renews the lease; a genuinely offline screen keeps running through outages far
 * longer than any real network blip, but a device that is *deliberately* kept
 * offline after being unpaired/removed can't play forever — closing the "unplug
 * it to dodge the screen limit" hole. Online, the server is always authoritative
 * and reconciles instantly, so the lease only ever gates a disconnected boot.
 */
export const OFFLINE_LEASE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/* --------------------------------- manifest ------------------------------- */

export function saveManifest(manifest: Manifest): void {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  } catch {
    /* storage full / unavailable — offline reload just won't have a manifest */
  }
}

export function loadManifest(): Manifest | null {
  const raw = localStorage.getItem(MANIFEST_KEY);
  if (!raw) return null;
  try {
    const parsed = safeParseManifest(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/* ----------------------------------- clock -------------------------------- */

/**
 * The synced clock is normally derived from the monotonic clock
 * (performance.now() + offset, §7) so a wonky device wall-clock can't jump
 * playout mid-session. But performance.now() resets to ~0 on every page load,
 * so it can't survive a reload. To cold-boot offline we persist a *wall-clock*
 * bridge — `serverTime − Date.now()` at last sync — and use `Date.now() +
 * bridge` until a live sync converges again. Small drift accrues between the
 * last sync and the reload; it's corrected on reconnect.
 */
export function saveClockBridge(serverMinusWall: number): void {
  try {
    localStorage.setItem(CLOCK_KEY, String(serverMinusWall));
  } catch {
    /* non-fatal */
  }
}

export function loadClockBridge(): number | null {
  const raw = localStorage.getItem(CLOCK_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------- lease --------------------------------- */

/** Renew the offline-play lease — call on every live server contact. */
export function renewLease(now: number): void {
  try {
    localStorage.setItem(LEASE_KEY, String(now));
  } catch {
    /* non-fatal */
  }
}

/**
 * Whether the cached channel may still play offline. True if we've had live
 * server contact within OFFLINE_LEASE_MS. A missing lease (never synced) is
 * treated as expired — a screen that has never reached the server does not get
 * to play a manifest that only exists in its cache.
 */
export function leaseValid(now: number): boolean {
  const raw = localStorage.getItem(LEASE_KEY);
  if (raw === null) return false;
  const ts = Number(raw);
  return Number.isFinite(ts) && now - ts < OFFLINE_LEASE_MS;
}

/* --------------------------------- teardown ------------------------------- */

/**
 * Deauthorize this screen: erase the cached channel, its assets, the clock
 * bridge, and the lease so nothing can replay after an unpair/remove. The
 * reservation (this screen's DO id) is kept so it re-pairs as the *same* device
 * — matching the code the dashboard shows — rather than orphaning a D1 row.
 */
export async function wipeCachedContent(): Promise<void> {
  for (const k of [MANIFEST_KEY, CLOCK_KEY, LEASE_KEY]) {
    try { localStorage.removeItem(k); } catch { /* non-fatal */ }
  }
  try {
    if ("caches" in globalThis) await caches.delete(ASSET_CACHE);
  } catch {
    /* Cache Storage unavailable — localStorage wipe still deauthorizes playout */
  }
}

/**
 * Nuclear reset (the `?reset` escape hatch): drop EVERYTHING this origin holds —
 * the reservation, cached channel, clock, lease, and every Cache Storage bucket
 * (app shell included) — so the next load fetches a fresh build and reserves a
 * brand-new screen identity. The one reliable way to un-stick a device that is
 * running a build too old to honor a remote unpair.
 */
export async function hardReset(): Promise<void> {
  for (const k of [MANIFEST_KEY, CLOCK_KEY, LEASE_KEY, "scena.screen"]) {
    try { localStorage.removeItem(k); } catch { /* non-fatal */ }
  }
  try {
    if ("caches" in globalThis) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    /* non-fatal */
  }
}
