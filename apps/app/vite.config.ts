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
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "react";
          if (id.includes("/motion") || id.includes("/framer-motion")) return "motion";
          if (id.includes("/@radix-ui/") || id.includes("/vaul/")) return "radix";
          if (id.includes("/lucide-react/")) return "icons";
          return "vendor";
        },
      },
    },
  },
});
