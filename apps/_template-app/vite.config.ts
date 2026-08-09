import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Deliberately plain — and the OFFLINE question is a decision to make, not a
 * plugin to remember.
 *
 * `@4dl/app-kit/pwa`'s `offlinePwa()` is one call away and this template does
 * not take it, because taking it by default would be the wrong answer for two
 * of the three apps in this repo. What offline currently buys is an app-shell
 * precache and a Background-Sync replay of failed writes. Neither is free:
 *
 *   1. **Nothing caches API reads.** A precached app opens on a dead radio into
 *      empty screens full of load errors — marginally better than the browser's
 *      error page, and not "the app works offline".
 *   2. **Caching reads is the part that would help, and it can be DANGEROUS.**
 *      A stale answer is worse than no answer wherever the product's whole job
 *      is that the answer is current. Kova can serve a stale meal plan; a
 *      sterile-supply app cannot serve a stale disposition.
 *   3. **A queued write must be IDEMPOTENT.** Background Sync replays minutes or
 *      hours later against a world that has moved on. Kova's queued writes are
 *      upserts keyed on (client, day); a state-machine transition that mints an
 *      id or refuses an already-open row is not replayable. See rule 3 in
 *      `@4dl/app-kit/pwa`.
 *
 * So: answer it, in writing, in this file — either `offlinePwa({ queueName,
 * queuedPaths })` with the idempotent paths named, or a paragraph saying why
 * not. Both are a decision; the absence of both is the thing to avoid.
 *
 * ⚠️ The dev proxy points at `wrangler dev`, and the app is SERVED by that
 * worker in production and in tests (the worker's `assets` binding). Drive
 * :8787, not this port — see `main.tsx` for why.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5373,
    proxy: { "/api": "http://localhost:8787", "/health": "http://localhost:8787" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
