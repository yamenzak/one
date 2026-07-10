import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Same-origin in prod (the api worker serves this app); proxied in dev.
      "/api": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },
  build: { sourcemap: true },
});
