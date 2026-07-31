/**
 * Force the app to pick up a new deploy, from inside the app.
 *
 * Why this exists: the PWA precaches its own shell (Workbox, see vite.config.ts),
 * so a stale build can keep serving after a deploy. On desktop you can unregister
 * the service worker from DevTools — on iOS Safari and Android Chrome there is no
 * such affordance, so a user on a phone has no way out of a cached build. That is
 * not a hypothetical: it is exactly how a freshly-deployed admin screen appeared
 * to be missing its new fields.
 *
 * What it deliberately does NOT touch: localStorage and sessionStorage. The
 * session cookie lives outside both, but the cached `/api/context` payload, the
 * theme, and the nav preferences are all kept — a user asking for "reload the app"
 * is not asking to be signed out or to lose their settings. Contrast
 * `clearAppStorage()` in session.tsx, which is the sign-out path and is meant to
 * wipe that state.
 */

/** Best-effort: unregister every service worker and drop every Cache Storage
 *  entry, then hard-reload. Each step is independently guarded because a failure
 *  in one must not prevent the reload — a reload alone still helps. */
export async function hardRefresh(): Promise<void> {
  // 1) Unregister the service worker so the next load fetches a fresh shell
  //    rather than being served the precached one.
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* no SW support, or a browser that refuses enumeration — carry on */
  }

  // 2) Drop the precache + runtime caches. Without this the new service worker
  //    can still be handed the old hashed assets out of Cache Storage.
  try {
    if ("caches" in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* Cache Storage unavailable (private mode on some browsers) — carry on */
  }

  // 3) Reload. Bypassing the HTTP cache matters as much as the SW: index.html
  //    itself can be held by the browser cache. A cache-busting query on the
  //    document URL is the only approach that works consistently across iOS
  //    Safari and Android Chrome — `location.reload(true)` is long-deprecated and
  //    ignored, and replace() avoids leaving the busted URL in history.
  const url = new URL(window.location.href);
  url.searchParams.set("_reload", String(Date.now()));
  window.location.replace(url.toString());
}

/** Strip the cache-buster the reload above added, so it never ends up shared or
 *  bookmarked. Called once on boot; a no-op when the param isn't present. */
export function stripReloadParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_reload")) return;
    url.searchParams.delete("_reload");
    window.history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
  } catch {
    /* history unavailable — harmless, the param is inert */
  }
}
