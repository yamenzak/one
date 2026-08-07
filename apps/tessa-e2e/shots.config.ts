/**
 * TESSA'S SCREENSHOT SUITE — the app that had none.
 *
 * Kova and Scena have been photographed for months; Tessa never has. That is
 * not a cosmetic gap. Twice in one afternoon this pass made a confident claim
 * about a width nobody had a picture of, and was wrong both times — once about
 * Kova's tablet band (which was already correct) and once about Scena's widget
 * builder (which was worse than assumed). A surface with no photograph is a
 * surface designed by inference, and inference is what those two claims were.
 *
 * Three widths, dark only. Light is a real mode and worth adding, but the first
 * question is whether the LAYOUT holds at each width, and doubling the run to
 * answer a colour question would make the suite too slow to run.
 *
 * Deliberately separate from the gate (`playwright.config.ts`): that runs on
 * every push and must stay fast; this is run when images are wanted. The two
 * share the webServer block, the resolver rules and the `.dev.vars` bootstrap —
 * this file is that config with different projects and its own testDir, so a
 * change to how the worker boots cannot apply to one and not the other.
 *
 * ⚠️ Its own inspector port (9233). `wrangler dev` opens one on 9229 by default
 * and every suite past the first has to pin its own, or whichever boots second
 * exits with "Address already in use" and Playwright reports it as an app that
 * would not start.
 */

import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, ROOT_URL } from "./src/env.js";


/*
  Phone first — Tessa is used standing at a bench with gloves on, which is the
  case the whole product is shaped around. `hasTouch` on all three: even at desk
  width this is a touch product, and hover states must stay behind
  `pointer: fine` (UI-LANGUAGE §11.4 rule 4).
*/
const PHONE = { ...devices["Pixel 7"], isMobile: false, hasTouch: true };
/** An iPad upright — a rail and a finger at the same time (§11.2). */
const TABLET = { viewport: { width: 834, height: 1112 }, isMobile: false, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: true };

export default defineConfig({
  testDir: "./shots",
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
  projects: [
    { name: "phone-dark", use: PHONE },
    { name: "tablet-dark", use: TABLET },
    { name: "desktop-dark", use: DESKTOP },
  ],
  webServer: [
    {
      // `--inspector-port` pinned per app, and not by taste: `wrangler dev`
      // opens a devtools inspector on 9229 by DEFAULT, so two suites booting at
      // once — which is exactly what `pnpm e2e` does, one turbo task per app —
      // race for it and whichever loses exits with "Address already in use"
      // before serving a single request. Playwright then reports
      // "Process from config.webServer exited early", which reads as a broken
      // app rather than as a port collision between two unrelated products.
      command: `pnpm --filter @4dl/tessa exec wrangler dev --local --log-level ${process.env.E2E_SERVER_LOGS ? "info" : "warn"} --port ${APP_PORT} --inspector-port 9233`,
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
