/**
 * THE OFFLINE BUILD CONFIG — the half of the offline story that is not runtime.
 *
 * `api.ts` already shares the client half: `configureApi({ queuedWrites })`, and
 * the three-way outcome (`QueuedError` | `OfflineError` | an HTTP error) that
 * lets a UI say "saved, will sync" instead of "failed". What was never shared is
 * the service-worker config those errors are ONLY true about — and that config
 * is where every expensive lesson is.
 *
 * Four of them, each of which took out something real:
 *
 * ── 1. `navigateFallback` must be `/`, not `/index.html` ────────────────────
 *
 * Cloudflare Workers Assets defaults to `html_handling: "auto-trailing-slash"`,
 * which answers `/index.html` with a 307 to `/`. The navigation fallback is a
 * precache handler: on a HIT it serves from Cache Storage and all is well, but
 * on a MISS it goes to the network — and a navigation `respondWith()`n a
 * REDIRECTED response is rejected by the browser, so the page load dies as
 * ERR_FAILED. That took out every deep link (`/settings`, `/admin`, …) while `/`
 * kept working, because `/` matches the precache route directly and never
 * reaches the fallback.
 *
 * A precache miss is ordinary, not exotic: iOS evicts Cache Storage under
 * pressure, and an in-app hard-refresh clears it deliberately. So the precached
 * entry and the fallback must BOTH be `/` — which is what `manifestTransforms`
 * below rewrites `index.html` to.
 *
 * ── 2. `clientsClaim` WITHOUT `skipWaiting` ─────────────────────────────────
 *
 * Claiming only happens when a worker activates. On a FIRST install there is no
 * old worker, so it activates at once and takes over the page — offline works
 * from the very first visit. On an UPDATE, `skipWaiting: false` parks the new
 * worker until every tab on the old one closes, so it can never purge the
 * precache under a live session and 404 a chunk mid-task.
 *
 * ── 3. Only queue writes that are SAFE TO REPLAY ────────────────────────────
 *
 * Background Sync replays a POST minutes or hours later, against a world that
 * has moved on. That is correct for an idempotent upsert — a weigh-in keyed on
 * (client, day) replays to the same row — and WRONG for a state-machine
 * transition, which may have been legitimately superseded. `queuedPaths` is
 * therefore required and has no default: an app has to state which of its writes
 * survive being replayed, and the honest answer for some apps is none of them.
 *
 * ── 4. Keep `queuedPaths` in lockstep with `configureApi` ───────────────────
 *
 * They are the same set, expressed twice — once to the service worker at build
 * time, once to the fetch layer at runtime. Drift means the UI says "saved, will
 * sync" for a write nothing is queueing, which is the one lie the three-way
 * outcome exists to prevent. `pwaQueuedWrites` below returns the runtime half
 * from the same source, so an app can pass one constant to both.
 */

/** What the app has to decide, because nothing here can decide it for them. */
export interface OfflinePwaOptions {
  /**
   * The Background-Sync queue name. Namespaced per app — two apps on one origin
   * would otherwise share a queue and replay each other's writes.
   */
  queueName: string;
  /**
   * POST paths whose failure is QUEUED rather than lost. See rule 3: every one
   * of these must be idempotent under replay. An empty array is a valid and
   * sometimes correct answer — the shell still precaches, so the app opens with
   * no signal, and writes simply fail honestly.
   */
  queuedPaths: RegExp;
  /** Extra files to precache beyond the glob (icons, etc.). */
  includeAssets?: string[];
  /**
   * Globs to EXCLUDE from precache. Large lazily-loaded payloads — a wasm
   * runtime, on-device models — belong here: precaching many MB an app may
   * never use is how a first visit times out on a phone.
   */
  globIgnores?: string[];
  /** Per-file precache ceiling. Default 3 MB. */
  maxFileSizeBytes?: number;
  /** How long a queued write is retained, in minutes. Default 24 h. */
  retentionMinutes?: number;
}

/** The `workbox` + plugin options to hand to `VitePWA(...)`. */
export function offlinePwa(opts: OfflinePwaOptions) {
  return {
    // `prompt`, and the app registers /sw.js itself: the plugin's injected
    // registerSW.js only registers and has no way to tell anyone an update is
    // waiting, which is the whole of what a user needs to know.
    registerType: "prompt" as const,
    injectRegister: null,
    // The worker serves the web manifest, so the plugin must not emit one.
    // `as const` — the option's type is `false | ManifestOptions`, and a widened
    // `boolean` does not satisfy it.
    manifest: false as const,
    includeAssets: opts.includeAssets ?? [],
    workbox: {
      globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
      globIgnores: opts.globIgnores ?? [],
      maximumFileSizeToCacheInBytes: opts.maxFileSizeBytes ?? 3 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      // Rule 2 — see the header.
      clientsClaim: true,
      skipWaiting: false,
      // Rule 1 — see the header. `navigateFallback` names a URL that IS in the
      // manifest, because `manifestTransforms` rewrites `index.html` to `/`.
      navigateFallback: "/",
      navigateFallbackDenylist: [/^\/api\//, /^\/health/, /^\/manifest\.webmanifest/],
      manifestTransforms: [
        // Typed structurally rather than against workbox's `ManifestEntry`, so
        // this package needs no workbox dependency of its own. The spread keeps
        // `revision` and `size` intact; only `url` is rewritten.
        (<E extends { url: string }>(entries: E[]) => ({
          manifest: entries.map((e) => (e.url === "index.html" ? { ...e, url: "/" } : e)),
          warnings: [] as string[],
        })) as never,
      ],
      runtimeCaching: [
        {
          // Rule 3 — try the network, and on failure enqueue for replay.
          urlPattern: ({ url, request }: { url: URL; request: Request }) =>
            request.method === "POST" && opts.queuedPaths.test(url.pathname),
          handler: "NetworkOnly" as const,
          method: "POST" as const,
          options: {
            backgroundSync: {
              name: opts.queueName,
              options: { maxRetentionTime: opts.retentionMinutes ?? 24 * 60 },
            },
          },
        },
      ],
    },
  };
}

/**
 * The runtime half of the same decision, for `configureApi`.
 *
 * Exists so an app declares its queued paths ONCE and hands the same constant to
 * the build and to the fetch layer. Drift between the two is the failure mode
 * rule 4 describes, and it is silent in both directions.
 */
export const pwaQueuedWrites = (opts: Pick<OfflinePwaOptions, "queuedPaths">): RegExp => opts.queuedPaths;
