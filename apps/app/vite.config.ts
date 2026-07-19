import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
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
  plugins: [react(), tailwindcss(), mediapipeWasm()],
  server: {
    port: 5173,
    proxy: {
      // Same-origin in prod (the api worker serves this app); proxied in dev.
      "/api": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },
  // No manualChunks: splitting React into its own chunk broke module init
  // order (useLayoutEffect undefined in Radix). Vite's default chunking is
  // safe; just raise the size warning threshold.
  build: { sourcemap: true, chunkSizeWarningLimit: 1200 },
});
