import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * THE HUB'S BUILD.
 *
 * ⚠️ `dist/` IS WHAT THE WORKER SERVES, and the worker's `assets.directory`
 * points at it by filesystem path — which is not a package dependency, so
 * `turbo.json` declares that edge by hand. Without it the worker's suite boots
 * against a missing directory and aborts reporting "no tests", which reads as a
 * pass.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    /*
      ⚠️ EVERY DOOR IS A SUBDOMAIN, SO THE DEV SERVER HAS TO ANSWER TO ALL OF
      THEM. Vite refuses a Host it was not told about, and `setup.localhost` is a
      different Host from `localhost` — without this, the setup door in
      development is a blank page with a message in the terminal.
    */
    allowedHosts: [".localhost"],
    proxy: {
      /* ⚠️ Proxied rather than same-origin, so the cookie the worker sets is
         accepted: a session issued for `localhost` is not sent to `:5173` by
         some browsers, and the door topology has to survive dev. */
      "/api": { target: "http://localhost:8080", changeOrigin: false },
      "/health": { target: "http://localhost:8080", changeOrigin: false },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
