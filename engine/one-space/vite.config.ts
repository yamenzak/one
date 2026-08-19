import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { design } from "@engine/design/vite";

/**
 * THE SPACE'S BUILD.
 *
 * ⚠️ `dist/` IS WHAT THE WORKER SERVES, and the worker's `assets.directory`
 * points at it by filesystem path — which is not a package dependency, so
 * `turbo.json` declares that edge by hand. Without it the worker's suite boots
 * against a missing directory and aborts reporting "no tests", which reads as a
 * pass.
 */
export default defineConfig({
  /*
    ⚠️ `design()` IS NOT COSMETIC — it keeps 1.19 MB of compiled JSON-schema
    validator out of the bundle, and it refuses rather than skips if the modules
    it stubs ever move. See `@engine/design/vite`.

    ⚠️ AND `entryUnder` IS A CEILING SOMEBODY HAS TO RAISE. The entry chunk is
    what every visitor downloads on every door before anything is drawn; it
    reached 407 kB without any one commit being at fault, which is how weight
    always arrives. 376 kB today; a screen that would push it over belongs
    behind a dynamic import (`src/console/parts.tsx` is the pattern), and a number
    raised here is a number somebody reads in review.
  */
  plugins: [react(), tailwindcss(), design({ entryUnder: 390 })],
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
