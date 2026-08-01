/**
 * Playwright E2E for Tessa.
 *
 * ── What this suite is for, and what the other one cannot do ────────────────
 *
 * `apps/tessa/test` drives the worker through Miniflare and covers the ledger,
 * the recall arithmetic and every refusal. What it structurally cannot see is
 * the browser: a portal whose ref is null on first render, a class name Tailwind
 * never generated, a door that answers 401 to an app that then re-renders the
 * form the person just completed. All three of those were real, all three
 * typechecked, and all three were found by hand. This suite is that hand,
 * automated.
 *
 * ── Load-bearing choices ────────────────────────────────────────────────────
 *
 *  • **Port 8788.** Kova's suite owns 8787. Sharing it would make whichever ran
 *    second drive the other product's worker and fail as "element not found".
 *  • `wrangler dev --local`. The `ai` binding in `apps/tessa/wrangler.jsonc`
 *    otherwise forces a REMOTE binding session, and wrangler refuses to start
 *    without Cloudflare credentials — unrunnable on a machine that has never
 *    logged in. None of these paths call Workers AI.
 *  • `apps/tessa/.dev.vars` must exist (globalSetup creates it from the
 *    example). Its `ENVIRONMENT=development` is what makes the mock mailer
 *    deliver instead of failing closed, and the emailed OTP is the only sign-in
 *    factor there is.
 *  • One worker, serially. The specs are hermetic (unique addresses per run) but
 *    share one Miniflare D1 file; parallelising saves seconds and costs
 *    determinism.
 *  • `serviceWorkers: "block"` even though Tessa ships none yet — so that adding
 *    one later cannot silently start serving a stale shell across runs.
 */

import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, ROOT_URL } from "./src/env.js";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./src/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // A golden path is dozens of round-trips through a cold worker. A too-tight
  // cap shows up as "flaky" instead of as the real diagnosis.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: ROOT_URL,
    // Phone-shaped: Tessa is a scan-first mobile app and the bottom tab bar is
    // what these specs drive. A desktop viewport is a different set of controls.
    ...devices["Pixel 7"],
    // Real mouse events: touch emulation makes Radix drawers need gesture
    // sequences that add nothing to what these paths check.
    isMobile: false,
    hasTouch: true,
    // Chromium resolves `.localhost` internally, but pin it: the whole topology
    // is subdomains of it, and a build that decided otherwise would fail as an
    // unexplained navigation error.
    launchOptions: { args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] },
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
      command: `pnpm --filter @4dl/tessa exec wrangler dev --local --log-level ${process.env.E2E_SERVER_LOGS ? "info" : "warn"} --port ${APP_PORT}`,
      // `/health` is dependency-free and answers on every door, including the
      // root that exists before any centre does.
      url: `${ROOT_URL}/health`,
      cwd: "../..",
      timeout: 180_000,
      // Locally reuse a running dev server; in CI always boot fresh, so a
      // half-dead server cannot be mistaken for a passing gate.
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
