/**
 * THE SCREENSHOT SUITE — a separate config, on purpose.
 *
 * `playwright.config.ts` is the launch gate: three golden paths, no retries, run
 * on every push. This one is a PRODUCTION LINE for images — it seeds a large
 * studio, sweeps every surface at four viewport × theme combinations, and takes
 * a couple of minutes. Merging the two would make the gate slow and the image
 * run gated, and both would then be run less often than they should be.
 *
 * What it shares with the gate is everything that matters: the same worker, the
 * same `*.localhost` topology, the same fixtures, the same real API. The images
 * are of the product, not of a mock of it.
 *
 *   pnpm --filter @kova/e2e shots
 *
 * Output: `apps/e2e/shots-out/<project>/<id>.png`, gitignored. Images that ship
 * (Help Center, marketing) are copied out of there deliberately, by id — see
 * `docs/help/README.md`.
 *
 * ── E2E_DEV_ADMIN is ON here, and OFF in the gate ────────────────────────────
 *
 * The demo studio needs bigger entitlements than the baseline plan, or the
 * roster caps at three and the front desk renders a locked card — a screenshot
 * run of a smaller product than the one being sold, which is the most flattering
 * possible mistake. The grant goes through the real operator route, which needs
 * the development platform-admin lane. The GATE must never have it, because
 * those paths have to run against the authorization the product ships; an image
 * run has no such duty and every screen still resolves its own entitlements.
 */

import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, ROOT_URL, SETUP_URL } from "./src/env.js";

/** Phone first — the product is a mobile-first PWA and that is what most people
 *  see. Desktop swaps the bottom tabs for the nav rail, which is a different
 *  set of chrome and has to be photographed as well as tested. */
const PHONE = { ...devices["Pixel 7"], isMobile: false, hasTouch: true };
/*
  TABLET IS A NAMED WIDTH, NOT "SMALL DESKTOP" (§11.2), and until now nothing
  photographed it — so the 768–1099 band was designed by inference from the two
  ends of it. 834×1112 is an iPad Air held upright, which is the case that band
  is actually about: a rail and a TOUCH pointer at the same time, which no other
  width has. `hasTouch` is what makes that real here rather than a wide phone.
*/
const TABLET = { viewport: { width: 834, height: 1112 }, isMobile: false, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false };

export default defineConfig({
  testDir: "./shots",
  globalSetup: "./src/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Seeding a six-week history through the real API, then sweeping every screen.
  timeout: 600_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: SETUP_URL,
    launchOptions: { args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] },
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
   * The specs read it back (`test.info().project.name`) to pin local storage
   * before the app boots — the mode is read in the theme provider's initial
   * state, so it cannot be set after load without photographing one frame of
   * the wrong theme.
   */
  projects: [
    { name: "phone-dark", use: PHONE },
    { name: "phone-light", use: PHONE },
    { name: "tablet-dark", use: TABLET },
    { name: "desktop-dark", use: DESKTOP },
    { name: "desktop-light", use: DESKTOP },
  ],
  webServer: [
    {
      command: `pnpm --filter @kova/api exec wrangler dev --local --log-level ${process.env.E2E_SERVER_LOGS ? "info" : "warn"} --port ${APP_PORT} --var ADMIN_EMAILS:`,
      url: `${ROOT_URL}/health`,
      cwd: "../..",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
