import { defineConfig } from "vite";

// Framework-light PWA (§29.1): no UI framework, minimal shipped JS. The service
// worker is built as a separate entry so it can live at the origin root.
export default defineConfig({
  server: { port: 5173 },
  // A unique id per build, baked into the SW (so a deploy changes sw.js and the
  // browser detects the update) and the app. Enables screens to self-update.
  define: { __BUILD_ID__: JSON.stringify(String(Date.now())) },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: "index.html",
        sw: "src/sw.ts",
      },
      output: {
        // Stable entry names so the Service Worker can precache a known shell
        // (§8). This is a kiosk app served fresh; SW cache versioning busts it.
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name].js"),
        chunkFileNames: "assets/[name].js",
      },
    },
  },
});
