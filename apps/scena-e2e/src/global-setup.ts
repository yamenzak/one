/**
 * Pre-flight the one piece of local config the suite cannot work without.
 *
 * `apps/scena/.dev.vars` carries `ENVIRONMENT=development`, and that single
 * variable is what makes the mock mailer *deliver* — to the console, and more
 * usefully for us to Better Auth's `verification` table — instead of failing
 * closed. Without it every sign-in dies at the first step with a message about
 * email providers, an error that reads like a product bug and is not one.
 *
 * Created from the checked-in example rather than left to the developer, because
 * "one command from a clean checkout" is the point.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { DEVICE_URL } from "./env.js";

const DEV_VARS = new URL("../../scena/.dev.vars", import.meta.url).pathname;
const EXAMPLE = new URL("../../scena/.dev.vars.example", import.meta.url).pathname;

export default function globalSetup(): void {
  buildPlayer();
  if (existsSync(DEV_VARS)) return;
  if (!existsSync(EXAMPLE)) {
    throw new Error(`Missing ${EXAMPLE} — cannot bootstrap apps/scena/.dev.vars for the E2E run.`);
  }
  copyFileSync(EXAMPLE, DEV_VARS);
  console.log("[e2e] created apps/scena/.dev.vars from .dev.vars.example (ENVIRONMENT=development)");
}

/**
 * BUILD THE PLAYER AGAINST THIS SUITE'S WORKER, HERE AND NOT IN THE webServer
 * COMMAND.
 *
 * `API_BASE` is baked in at build time — the player is a separate origin and
 * cannot say `/api/…` — so a player built for production and served here calls
 * `scena.4dl.app` from a test and reserves nothing. It failed exactly that way
 * once: `reuseExistingServer` is true locally, so a wrangler already listening
 * on the player's port meant Playwright never ran the command that would have
 * rebuilt it, and the suite drove yesterday's bundle. `globalSetup` always runs.
 *
 * ⚠️ And the base is the DEVICE DOOR (`play.`), not the dashboard's origin. The
 * pairing, manifest and asset routes answer there and `wrong_door` everywhere
 * else — the player's first run against this suite reported itself "offline"
 * for exactly that reason, which is a symptom two steps removed from its cause.
 */
function buildPlayer(): void {
  execFileSync("pnpm", ["--filter", "@scena/player", "build"], {
    cwd: new URL("../../..", import.meta.url).pathname,
    env: { ...process.env, VITE_API_BASE: DEVICE_URL },
    stdio: process.env.E2E_SERVER_LOGS ? "inherit" : "ignore",
  });
  console.log(`[e2e] built @scena/player against ${DEVICE_URL}`);
}
