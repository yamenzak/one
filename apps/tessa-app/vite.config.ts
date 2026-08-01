import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Deliberately plain, and worth saying why.
 *
 * Kova's config carries a MediaPipe wasm plugin and a full PWA/Background-Sync
 * setup. Neither belongs here yet: Tessa's offline story is Phase 3 (TESSA.md
 * §5) and its scanning is a barcode read, not an on-device vision model. Adding
 * a service worker before the offline WRITE path exists would cache an app shell
 * that then fails every mutation the moment it is actually used without signal —
 * worse than being honestly online-only.
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
