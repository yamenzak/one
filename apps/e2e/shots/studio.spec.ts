/**
 * THE SWEEP — every surface worth photographing, in one seeded studio.
 *
 * One test per persona rather than one per screen, and deliberately so: the
 * demo world costs about a minute to build, and rebuilding it per screen would
 * make the run long enough that nobody would take it. Inside a test, each shot
 * is its own step, so a failure names the screen it happened on.
 *
 * ── The shot ids are an interface ────────────────────────────────────────────
 *
 * `coach-roster`, `client-today`, … are referenced by the Help Center and the
 * marketing site. Renaming one is a content change that has to be made in both
 * places; adding one is free. That is why they are literals here rather than
 * derived from the URL.
 */

import { test } from "@playwright/test";
import { buildDemoWorld, DEMO_STUDIO, prepare, type DemoWorld } from "../src/demo.js";
import { shoot, visit } from "../src/shoot.js";
import { teardown } from "../src/provision.js";

let world: DemoWorld;
let project: string;

test.beforeAll(async ({ browser }, info) => {
  project = info.project.name;
  world = await buildDemoWorld(browser, project.endsWith("light") ? "light" : "dark");
});

test.afterAll(async () => {
  if (world) await teardown(world.studio, world.client);
});

test("the coach's studio", async () => {
  const page = world.studio.page;
  const base = world.studio.base;
  // The app bar carries the studio's name on every screen, so it is the one
  // element that proves the shell mounted rather than that a particular screen
  // finished loading. Each shot adds its own wait on top.
  const shell = page.getByText(DEMO_STUDIO, { exact: false }).first();

  await test.step("today", async () => {
    await visit(page, `${base}/today`, shell);
    await shoot(page, project, "coach-today", { settle: 600 });
  });

  await test.step("roster", async () => {
    await visit(page, `${base}/clients`, shell);
    await shoot(page, project, "coach-roster");
  });

  // `?new=1` opens the create sheet — the same deep link the coach's Today uses,
  // so photographing it needs no clicking and cannot drift from the real one.
  // The same collection in its other view. Set through the preference the app
  // itself writes, not by clicking — the point of the shot is the GRID, and a
  // click that silently missed would produce a second list shot nobody notices.
  await test.step("roster as a grid", async () => {
    await page.evaluate(() => localStorage.setItem("4dl.view.clients", "grid"));
    await visit(page, `${base}/clients`, shell);
    await shoot(page, project, "coach-roster-grid");
    await page.evaluate(() => localStorage.setItem("4dl.view.clients", "list"));
  });

  await test.step("adding a client", async () => {
    await visit(page, `${base}/clients?new=1`, page.getByRole("button", { name: "Send invite" }));
    await shoot(page, project, "coach-add-client");
  });

  await test.step("a client", async () => {
    await visit(page, `${base}/clients/${world.client.id}/overview`, shell);
    await shoot(page, project, "coach-client", { settle: 600 });
  });

  await test.step("the plan", async () => {
    await visit(page, `${base}/clients/${world.client.id}/train`, shell);
    await shoot(page, project, "coach-client-plan");
  });

  await test.step("the library", async () => {
    await visit(page, `${base}/library`, shell);
    await shoot(page, project, "coach-library");
  });

  await test.step("the business", async () => {
    await visit(page, `${base}/business`, shell);
    await shoot(page, project, "coach-business", { settle: 600 });
  });

  // Settings is a FULL-SCREEN route, outside the tab shell — so it has no app
  // bar and the studio's name is not on it. Anchoring on `shell` here waits 30s
  // for something that is correctly absent, which is how this step failed the
  // first time the sweep ran.
  await test.step("settings", async () => {
    await visit(page, `${base}/settings`, page.getByText("Studio name").first());
    await shoot(page, project, "coach-settings");
  });

  await test.step("brand settings", async () => {
    await visit(page, `${base}/settings?s=brand`, page.getByText("Logos & AI coach").first());
    await shoot(page, project, "coach-settings-brand");
  });
});

test("the client's app", async () => {
  const page = world.client.page;
  const base = world.client.base;
  const shell = page.getByText(DEMO_STUDIO, { exact: false }).first();

  await test.step("today", async () => {
    await visit(page, `${base}/today`, shell);
    await shoot(page, project, "client-today", { settle: 800 });
  });

  await test.step("train", async () => {
    await visit(page, `${base}/train`, shell);
    await shoot(page, project, "client-train");
  });

  await test.step("eat", async () => {
    await visit(page, `${base}/eat`, shell);
    await shoot(page, project, "client-eat", { settle: 600 });
  });

  await test.step("wellness", async () => {
    await visit(page, `${base}/wellness`, shell);
    await shoot(page, project, "client-wellness", { settle: 600 });
  });

  await test.step("progress", async () => {
    // Charts draw their paths in; this is the one surface where the settle is
    // load-bearing rather than defensive.
    await visit(page, `${base}/progress`, shell);
    await shoot(page, project, "client-progress", { settle: 1200 });
  });
});

/**
 * The signed-out door, which is the first thing a client of a white-labelled
 * studio ever sees — and the screen most often shown in marketing.
 *
 * Its own context: the two above are signed in, and signing out to take one
 * picture would cost the rest of the sweep.
 */
test("the sign-in screen", async ({ browser }) => {
  const context = await browser.newContext();
  await prepare(context, project.endsWith("light") ? "light" : "dark");
  const page = await context.newPage();
  try {
    await visit(page, `${world.studio.base}/`, page.getByRole("button", { name: /email me a code/i }));
    await shoot(page, project, "sign-in");
  } finally {
    await context.close();
  }
});
