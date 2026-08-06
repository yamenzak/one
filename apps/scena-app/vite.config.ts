import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dashboard is served same-origin with the API in production (one worker).
// In dev, proxy the API surface to the local wrangler dev server so the session
// cookie is same-origin here too. Override the port with the API_DEV_TARGET env
// var (read lazily to avoid needing Node types in this config).
const apiTarget = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.API_DEV_TARGET ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true, ws: true },
      "/health": { target: apiTarget, changeOrigin: true },
    },
  },
  build: { target: "es2022" },
});
