import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Deliberately plain, and worth saying why — the reason has got SHARPER, not
 * weaker, now that the mechanism is available.
 *
 * `@4dl/app-kit/pwa`'s `offlinePwa()` is one call away, and Tessa still does not
 * take it. Re-examined 2026-08-02, because "a scanner used on a shop floor is
 * the app that needs offline most" is an obvious thing to believe and it does
 * not survive looking at what offline currently BUYS:
 *
 *   1. **Nothing caches API reads.** Neither app does — `offlinePwa` precaches
 *      the shell and queues writes, and that is all. A precached Tessa would
 *      open on a dead radio into empty screens full of load errors. That is
 *      marginally better than a browser error page and it is not "the scanner
 *      works".
 *   2. **Caching reads is the part that would help, and here it is DANGEROUS.**
 *      A stale "sterile, expires November" for a tray recalled ten minutes ago
 *      is precisely the failure this product exists to prevent. Kova can serve a
 *      stale meal plan; a sterile-supply app cannot serve a stale disposition.
 *   3. **No write here is safe to replay.** Every mutation goes through
 *      `applyEvents` as a state-machine transition — `POST /cycles` mints a new
 *      load id, `packs/:id/open` refuses a tray that is already open. Background
 *      Sync replays minutes or hours later against a world that has moved on.
 *      Kova's queued writes are idempotent upserts keyed on (client, day); none
 *      of Tessa's are. See rule 3 in `@4dl/app-kit/pwa`.
 *
 * So the offline story here is a real design question about STALENESS and
 * conflict — TESSA.md §5, Phase 3 — not a missing plugin. When it is answered,
 * the plugin is `offlinePwa({ queueName, queuedPaths })` and the reasoning it
 * carries is already written down.
 *
 * The MediaPipe wasm plugin is not here either: Tessa's scanning is a barcode
 * read, not an on-device vision model.
 *
 * The dev proxy points at `wrangler dev`, and the app is SERVED by that worker in
 * production and in tests (`apps/tessa/wrangler.jsonc` assets). Drive :8787, not
 * :5173 — see apps/tessa-app/README-ish note in main.tsx about Better Auth and
 * cross-origin POSTs.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5273,
    proxy: { "/api": "http://localhost:8787", "/health": "http://localhost:8787" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
