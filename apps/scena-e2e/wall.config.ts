/**
 * THE VIDEO-WALL SUITE — a separate config, and not for speed.
 *
 * `playwright.config.ts` is the launch gate: paths a real person walks, run on
 * every push, against **the authorization the product ships**. This one needs
 * one thing the gate must never have, so it cannot live there.
 *
 * ── Why a wall needs an operator ────────────────────────────────────────────
 *
 * Scena's `free` plan allows ONE paired screen. That is correct — a video wall
 * is what people pay for — and it means the two-screens spec cannot run on the
 * plan a fresh workspace lands on. The second `pair/claim` is refused with
 * `plan limit reached (1 screen)`, which is the product working.
 *
 * There is exactly one way to a bigger plan without Stripe: a platform admin
 * switching it (`billing-routes.ts` — "A paid plan can't be granted for free:
 * without Stripe configured, only a platform admin may comp a tenant"). So this
 * config runs the worker with **`ADMIN_EMAILS` empty**, which makes
 * `isPlatformAdminFor` fall back to `ENVIRONMENT === "development"` and lets the
 * suite's own owner comp their workspace onto `starter` (3 screens).
 *
 * ⚠️ **The gate must never do that.** Its whole value is running against the
 * real authorization; a gate that hands itself platform admin is a gate that
 * cannot see an authorization bug. Kova draws the same line between
 * `playwright.config.ts` and `shots.config.ts`, for the same reason and in the
 * same words.
 *
 *     pnpm --filter @scena/e2e wall
 *
 * Everything else it shares with the gate — same worker, same ports, same
 * `*.localhost` topology, same fixtures, same real API. The screens are real
 * screens; only the plan is arranged.
 */

import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
import { APP_PORT, PLAYER_PORT, ROOT_URL } from "./src/env.js";

const logLevel = process.env.E2E_SERVER_LOGS ? "info" : "warn";

export default defineConfig({
  ...base,
  testDir: "./wall",
  webServer: [
    {
      // `--var ADMIN_EMAILS:` — an EMPTY allow-list, which is what turns the
      // development platform-admin lane on. Passed on the command line rather
      // than written into `.dev.vars`, so it cannot leak into anyone's ordinary
      // `pnpm dev` or into the gate.
      command: `pnpm --filter @4dl/scena exec wrangler dev --local --log-level ${logLevel} --port ${APP_PORT} --inspector-port 9231 --var ADMIN_EMAILS:`,
      url: `${ROOT_URL}/health`,
      cwd: "../..",
      timeout: 180_000,
      // Never reuse: a worker already up is almost certainly the GATE's, which
      // has a real `ADMIN_EMAILS` and would refuse the comp — as a 402 three
      // steps into a spec about clocks.
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `pnpm --filter @scena/player exec wrangler dev --local --log-level ${logLevel} --port ${PLAYER_PORT} --inspector-port 9232`,
      url: `http://localhost:${PLAYER_PORT}/`,
      cwd: "../..",
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
