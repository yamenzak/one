/**
 * THE SCREENSHOT SUITE — a separate config, on purpose.
 *
 * `playwright.config.ts` is the launch gate: golden paths, no retries, run on
 * every push. This one is a PRODUCTION LINE for images — it builds a furnished
 * workspace, pairs two real screens, sweeps every surface at four viewport ×
 * theme combinations and takes minutes. Merging the two would make the gate slow
 * and the image run gated, and both would then be run less often than they
 * should be.
 *
 * What it shares with the gate is everything that matters: the same workers, the
 * same `*.localhost` topology, the same fixtures, the same real API, the same
 * real player on the real device door. The images are of the product, not of a
 * mock of it.
 *
 *     pnpm --filter @scena/e2e shots
 *
 * Output: `apps/scena-e2e/shots-out/<project>/<id>.png`, gitignored.
 *
 * ── The development platform-admin lane is ON here, and OFF in the gate ──────
 *
 * The demo workspace needs a bigger plan than the baseline, or the fleet caps at
 * one screen, the boards screen renders a locked card and the sources screen
 * says "not in plan" — a screenshot run of a SMALLER product than the one being
 * sold, which is the most flattering possible mistake and the hardest to notice,
 * because every individual picture looks fine.
 *
 * The comp goes through the ordinary `/api/billing/change-plan` endpoint, which
 * without Stripe configured admits only a platform admin. So the worker runs
 * with `--var ADMIN_EMAILS:` — an EMPTY allow-list, which is what makes
 * `isPlatformAdminFor` fall back to `ENVIRONMENT === "development"`.
 *
 * ⚠️ The GATE must never have that lane: its whole value is running against the
 * authorization the product ships, and a gate that hands itself platform admin
 * cannot see an authorization bug. `wall.config.ts` makes the same split for the
 * same reason, and so does Kova between its two configs.
 */

import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, PLAYER_PORT, ROOT_URL, SETUP_URL } from "./src/env.js";

const logLevel = process.env.E2E_SERVER_LOGS ? "info" : "warn";

/**
 * Desktop first — Scena's dashboard is an operator tool used at a desk, which is
 * the opposite of Kova's phone-first PWA. The narrow viewport is still
 * photographed: the nav collapses and the builder canvas reflows, and both are
 * chrome nobody looks at unless there is a picture of it.
 */
const DESKTOP = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };
const NARROW = { ...devices["Desktop Chrome"], viewport: { width: 430, height: 932 }, isMobile: false, hasTouch: true };
/*
  TABLET — §11.2's own band, and the one nothing photographed. An operator with
  an iPad in a venue is a real Scena user, and 834 is where the sidebar appears
  (`md`) while the pointer is still a finger: the only width with both. Between
  a 430 phone and a 1440 desk it was designed entirely by inference.
*/
const TABLET = { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 }, isMobile: false, hasTouch: true };

export default defineConfig({
  testDir: "./shots",
  globalSetup: "./src/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Building the world is a workspace, two paired screens and a dozen POSTs,
  // then the sweep itself.
  timeout: 900_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: SETUP_URL,
    launchOptions: { args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] },
    // Blocked on the DASHBOARD only. The player registers its own Service Worker
    // and needs it: `use` here does not reach the player's contexts, which are
    // opened from `browser.newContext()` in `src/screen.ts`.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "off",
    // A shot is never taken on failure: a half-rendered screen written into the
    // image directory is worse than a missing one, because it looks finished.
    screenshot: "off",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // Deterministic across machines: a device pixel ratio of 1 keeps every image
    // the same size as the last run, so a diff is a real change.
    deviceScaleFactor: 1,
  },
  /**
   * Four projects, and the theme is in the NAME.
   *
   * The spec reads it back (`test.info().project.name`) and pins local storage
   * before the app boots — `initTheme()` runs at module scope, so a theme set
   * after load photographs one frame of the wrong palette.
   */
  projects: [
    { name: "desktop-dark", use: DESKTOP },
    { name: "desktop-light", use: DESKTOP },
    { name: "tablet-dark", use: TABLET },
    { name: "narrow-dark", use: NARROW },
    { name: "narrow-light", use: NARROW },
  ],
  webServer: [
    {
      command: `pnpm --filter @4dl/scena exec wrangler dev --local --log-level ${logLevel} --port ${APP_PORT} --inspector-port 9231 --var ADMIN_EMAILS:`,
      url: `${ROOT_URL}/health`,
      cwd: "../..",
      timeout: 180_000,
      // Never reuse: a worker already up is almost certainly the gate's, whose
      // real `ADMIN_EMAILS` would refuse the comp — and the run would then
      // photograph the free plan under the names of the paid screens.
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
