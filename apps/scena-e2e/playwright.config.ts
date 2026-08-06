/**
 * Playwright E2E for Scena.
 *
 * ── What this suite is for, and what the other one cannot do ────────────────
 *
 * `apps/scena/test` drives the worker through Miniflare and covers the schema,
 * the cascade, the boards, the storage ledger and every refusal — 204 tests.
 * What it structurally cannot see is the BROWSER, and in a signage product the
 * browser is half the system: a pairing code that renders but never claims, a
 * publish that returns 200 while the screen keeps showing the old manifest, two
 * screens that drift apart. None of those is a route bug and none of them fails
 * a server test.
 *
 * ── Load-bearing choices ────────────────────────────────────────────────────
 *
 *  • **Port 8789.** Kova's suite owns 8787, Tessa's 8788. Sharing one would make
 *    whichever ran second drive another product's worker and fail as "element
 *    not found".
 *  • **TWO webServers, and the second one is the product.** The player is its
 *    own worker on its own origin because a screen is a device with a pinned,
 *    Service-Worker-cached URL. Driving it on the dashboard's origin would prove
 *    a topology Scena deliberately does not have.
 *  • `wrangler dev --local`. The `ai` binding otherwise forces a REMOTE binding
 *    session and wrangler refuses to start without Cloudflare credentials —
 *    unrunnable on a machine that has never logged in. None of these paths call
 *    Workers AI.
 *  • `--inspector-port` pinned per worker. `wrangler dev` opens a devtools
 *    inspector on 9229 by DEFAULT, so several workers booting at once race for
 *    it and whichever loses exits with "Address already in use" before serving a
 *    single request. Playwright reports that as "Process from config.webServer
 *    exited early", which reads as a broken app rather than a port collision.
 *    Kova has none pinned, Tessa took 9230, so Scena takes 9231 and 9232.
 *  • One worker, serially. The specs are hermetic (unique addresses and
 *    workspace names per run) but share one Miniflare D1 file; parallelising
 *    saves seconds and costs determinism.
 *  • `serviceWorkers: "block"` on the DASHBOARD. Not on the player — see the
 *    two-screens spec, which needs the real offline shell.
 */

import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, PLAYER_PORT, ROOT_URL, SETUP_URL } from "./src/env.js";

const logLevel = process.env.E2E_SERVER_LOGS ? "info" : "warn";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./src/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // A golden path is dozens of round-trips through a cold worker, and the
  // two-screens path waits on real playout. A too-tight cap shows up as
  // "flaky" instead of as the real diagnosis.
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: SETUP_URL,
    // Desktop-shaped: Scena's dashboard is an operator tool used at a desk, and
    // the nav rail and the builder canvas are what these specs drive. Kova's
    // suite is phone-shaped for the opposite reason.
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    // Chromium resolves `.localhost` internally, but pin it: the whole topology
    // is subdomains of it, and a build that decided otherwise would fail as an
    // unexplained navigation error.
    launchOptions: { args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
    actionTimeout: 25_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: `pnpm --filter @4dl/scena exec wrangler dev --local --log-level ${logLevel} --port ${APP_PORT} --inspector-port 9231`,
      // `/health` is dependency-free and answers on every door, including the
      // root that exists before any workspace does.
      url: `${ROOT_URL}/health`,
      cwd: "../..",
      timeout: 180_000,
      // Locally reuse a running dev server; in CI always boot fresh, so a
      // half-dead server cannot be mistaken for a passing gate.
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Assets-only: `apps/scena-player/wrangler.jsonc` has no `main`, so this
      // is wrangler serving `dist` and nothing else. It still has to be a
      // worker rather than `vite preview`, because the Service Worker
      // registration and the cache scope are what the offline half depends on.
      // Built by `globalSetup`, against this suite's port — see there for why
      // it cannot be built here.
      command: `pnpm --filter @scena/player exec wrangler dev --local --log-level ${logLevel} --port ${PLAYER_PORT} --inspector-port 9232`,
      url: `http://localhost:${PLAYER_PORT}/`,
      cwd: "../..",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
