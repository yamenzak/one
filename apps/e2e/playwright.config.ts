/**
 * Playwright E2E — the golden paths (SPEC §12).
 *
 * ── Which origin the suite drives, and why it is NOT the Vite dev server ──────
 *
 * The app is driven at :8787 — the `wrangler dev` worker, which serves the built
 * SPA from `apps/app/dist` via its `assets` binding AND the API at the same
 * origin. That is exactly the production topology (SPEC §3: one origin, so the
 * Better Auth cookie is same-origin with no CORS).
 *
 * The Vite dev server at :5173 (`pnpm dev`) proxies `/api` to :8787, which makes
 * the browser Origin (`http://localhost:5173`) differ from the worker's. Better
 * Auth 1.6.23 rejects that with 403 INVALID_ORIGIN on every *cookie-bearing*
 * auth POST, despite `apps/api/src/auth.ts` explicitly listing the dev origins in
 * `trustedOrigins` — that option is not honoured by this version, so only the
 * request's own origin is ever trusted. Cookieless calls (OTP send, OTP verify)
 * pass, so sign-in works and then `POST /api/auth/organization/create` 403s:
 * on :5173 an owner cannot create a studio at all. Driving :8787 sidesteps a
 * dev-proxy-only defect instead of encoding it, and tests the shape that ships.
 *
 * ── Other load-bearing choices ───────────────────────────────────────────────
 *
 *  • `wrangler dev --local`. Without it the `ai` binding in
 *    `apps/api/wrangler.jsonc` forces a REMOTE binding session and wrangler
 *    refuses to start without Cloudflare credentials — the suite would be
 *    unrunnable on any machine that has never run `wrangler login`. `--local`
 *    disables remote bindings; none of these paths call Workers AI.
 *  • `apps/api/.dev.vars` must exist (globalSetup creates it). Its
 *    `ENVIRONMENT=development` is what makes the mock mailer deliver rather than
 *    fail closed, and the emailed OTP is the only sign-in factor there is.
 *  • `serviceWorkers: "block"`. The production build ships a Workbox SW that
 *    precaches the shell and background-syncs failed log POSTs. Left enabled it
 *    would serve a stale shell across runs and could queue-and-swallow a write.
 *    The offline lane deserves its own test; it must not sit under these.
 *  • One worker, serially. The specs are hermetic (unique emails per run) but
 *    share one Miniflare D1 file and one worker process; parallelising saves
 *    seconds and costs determinism, the wrong trade for a launch gate.
 */

import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, APP_URL } from "./src/env.js";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./src/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // A golden path is dozens of round-trips through a cold worker. The default
  // 30s is not enough headroom, and a too-tight cap shows up as "flaky" instead
  // of as the real diagnosis.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: APP_URL,
    // Phone-shaped: the app is a mobile-first PWA and both the coach and client
    // surfaces render the bottom tab bar at this width. A desktop viewport swaps
    // in the nav rail — a different set of controls to drive.
    ...devices["Pixel 7"],
    // Real mouse events: touch emulation makes Radix dropdowns/drawers need
    // gesture sequences that add nothing to what these paths are checking.
    isMobile: false,
    hasTouch: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: `pnpm --filter @mossa/api exec wrangler dev --local --log-level ${process.env.E2E_SERVER_LOGS ? "info" : "warn"} --port ${APP_PORT}`,
      url: `${APP_URL}/health`,
      cwd: "../..",
      timeout: 180_000,
      // Locally, reuse whatever `wrangler dev` is already up. In CI always boot a
      // fresh one so a half-dead server can't be mistaken for a passing gate.
      reuseExistingServer: !process.env.CI,
      // Piped, but quiet: `--log-level warn` drops wrangler's per-request log
      // (which otherwise drowns the test output) while keeping anything that
      // explains a failed boot. `E2E_SERVER_LOGS=1 pnpm e2e` turns the request
      // log back on when you need to see what the worker did.
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
