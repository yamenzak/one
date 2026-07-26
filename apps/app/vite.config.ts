import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

/**
 * Self-host the MediaPipe (`@mediapipe/tasks-vision`) wasm runtime from
 * node_modules so the on-device body-scan pipeline has NO runtime CDN
 * dependency — the whole point of the feature is that nothing (least of all a
 * possibly-nude camera frame) leaves the device. We serve the wasm at the
 * same-origin path `/mediapipe/wasm/…` in dev (middleware) and copy it into the
 * build output (emitFile) in prod, instead of committing ~22 MB of binaries.
 * The `.task` / `.tflite` models live in `public/models/` (committed, a few MB).
 */
function mediapipeWasm(): Plugin {
  const require = createRequire(import.meta.url);
  // SIMD build + a no-SIMD fallback for low-end devices; the loader picks one.
  // The package blocks `./package.json` but exports each wasm file as a subpath,
  // so we resolve them individually (works through the pnpm symlink store).
  const files = [
    "vision_wasm_internal.js",
    "vision_wasm_internal.wasm",
    "vision_wasm_nosimd_internal.js",
    "vision_wasm_nosimd_internal.wasm",
  ];
  const resolved = new Map<string, string>();
  for (const f of files) {
    try {
      resolved.set(f, require.resolve(`@mediapipe/tasks-vision/${f}`));
    } catch {
      /* not installed — the feature degrades to manual entry at runtime */
    }
  }
  const PREFIX = "/mediapipe/wasm/";
  return {
    name: "mossa-mediapipe-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith(PREFIX)) return next();
        const name = url.slice(PREFIX.length).split("?")[0]!;
        const fp = resolved.get(name);
        if (!fp || !existsSync(fp)) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(readFileSync(fp));
      });
    },
    generateBundle() {
      for (const [f, fp] of resolved) {
        if (existsSync(fp)) this.emitFile({ type: "asset", fileName: `mediapipe/wasm/${f}`, source: readFileSync(fp) });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    mediapipeWasm(),
    // Offline-first PWA (SPEC §3 "gym-basement logging"): precache the built app
    // shell so it opens with no signal, and queue failed log-write POSTs in an
    // IndexedDB Background-Sync queue that replays on reconnect.
    // `manifest: false` because the worker serves /manifest.webmanifest
    // white-labeled per tenant (manifest.ts); we don't want the plugin to emit a
    // second, un-branded manifest.
    //
    // `registerType: "prompt"` (was "autoUpdate" + skipWaiting): with skipWaiting,
    // a deploy activated the new worker inside ALREADY-OPEN tabs and
    // cleanupOutdatedCaches purged the old precache under them — so a client mid-
    // workout hit a 404 on the next lazy chunk import and fell into the
    // ErrorBoundary, losing the session they were logging. Waiting means the new
    // worker sits idle until the tabs on the old one are gone. The tradeoff is that
    // an update lands one reload later, which we make explicit with a dismissible
    // "New version — reload" prompt instead of leaving it invisible.
    // `injectRegister: null` because we register /sw.js ourselves (notices.tsx
    // PwaUpdatePrompt) — the plugin's injected registerSW.js only registers and has
    // no way to tell anyone an update is waiting.
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: false,
      includeAssets: ["icon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // The MediaPipe wasm runtime + on-device models are many MB and load
        // lazily only for the body scan — never precache them.
        globIgnores: ["**/models/**", "**/mediapipe/**"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // `clientsClaim` WITHOUT `skipWaiting` is the combination we want. Claiming
        // only happens when a worker activates: on a FIRST install there's no old
        // worker, so it activates at once and takes over the page — offline works
        // from the very first visit. On an UPDATE, skipWaiting:false leaves the new
        // worker parked until every tab on the old one closes, so it can never
        // purge the precache under a live session (the mid-workout chunk 404).
        clientsClaim: true,
        skipWaiting: false,
        // Serve the cached shell for client-side routes when offline; never for
        // the API, health, or the (worker-served) manifest.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health/, /^\/manifest\.webmanifest/],
        runtimeCaching: [
          {
            // Log-write POSTs (food/water/sets/activity/sleep/mood, check-ins,
            // measurements, body scans, supplement + fasting toggles): try the
            // network, and on failure (offline) enqueue for replay when
            // connectivity returns.
            //
            // `measurements` + `body-scans` were missing, so a weigh-in or a body
            // scan taken in a no-signal gym was lost permanently — the two forms
            // most likely to be filled in exactly there. Both server handlers are
            // `INSERT … ON CONFLICT(client_id, date_local) DO UPDATE`
            // (log-routes.ts /measurements, body-scan-routes.ts /body-scans), i.e.
            // idempotent per client-day, so a duplicate replay upserts rather than
            // double-counting. Keep this in lockstep with QUEUED_POST in src/api.ts.
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === "POST" &&
              /^\/api\/(logs\/|check-ins|measurements|body-scans|supplements\/[^/]+\/log|fasting)/.test(url.pathname),
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "mossa-log-writes",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Same-origin in prod (the api worker serves this app); proxied in dev.
      //
      // The Origin rewrite is load-bearing, not hygiene. Better Auth 1.6.23
      // ignores the `trustedOrigins` array auth.ts passes it and trusts only the
      // request's own origin, so a proxied POST arriving with
      // `Origin: http://localhost:5173` against a worker on :8787 is rejected
      // `INVALID_ORIGIN`. Cookieless calls (OTP send/verify) pass, which is why
      // sign-in appeared to work while "Create workspace", set-active-org and
      // sign-out all failed — the confusing symptom of being able to log in and
      // then do nothing. Presenting the target's own origin makes the dev proxy
      // look same-origin, which is exactly what production is.
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        headers: { origin: "http://localhost:8787" },
      },
      "/health": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  build: {
    // The api worker's assets binding serves everything in dist/ publicly, so
    // `true` shipped ~8.5 MB of .map files — the app's full source, readable by
    // anyone who asked for them. Flip to "hidden" if a build ever needs maps for
    // local debugging without the `//# sourceMappingURL` pointer.
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Code-split the heavy leaf libraries out of the entry chunk to clear
        // the >1200 kB warning. React + Radix + motion stay together in one
        // `react-vendor` chunk on purpose: isolating React into its own chunk
        // previously left useLayoutEffect undefined in Radix (a chunk init-order
        // race), so keeping the whole React ecosystem co-resident avoids it.
        // MediaPipe and the ZXing scanner are React-independent, so they split
        // cleanly.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@mediapipe")) return "mediapipe";
          if (id.includes("@zxing")) return "scanner";
          return "react-vendor";
        },
      },
    },
  },
});
