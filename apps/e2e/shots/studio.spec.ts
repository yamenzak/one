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
import { buildDemoWorld, DEMO_CLIENT, DEMO_STUDIO, prepare, type DemoWorld } from "../src/demo.js";
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

  // The section menu — the control that replaced the icon rail. Opened rather
  // than described, because the whole claim is that six sections read better
  // with words than as six glyphs, and only a picture settles that.
  await test.step("the client's sections", async () => {
    await visit(page, `${base}/clients/${world.client.id}/overview`, shell);
    await page.getByRole("button", { name: new RegExp(DEMO_CLIENT, "i") }).first().click();
    await shoot(page, project, "coach-client-sections", { ready: page.getByText("Go to") });
    await page.keyboard.press("Escape");
  });

  await test.step("the client's goal", async () => {
    await visit(page, `${base}/clients/${world.client.id}/goals`, page.getByText("Body snapshot").first());
    await shoot(page, project, "coach-client-goals", { settle: 1200 });
  });

  // The composer. It is a sheet now rather than a permanent form in the middle
  // of the screen, which is the whole claim — so it gets its own picture.
  await test.step("setting a new phase", async () => {
    await visit(page, `${base}/clients/${world.client.id}/goals`, page.getByText("Body snapshot").first());
    await page.getByRole("button", { name: /new phase|set a goal/i }).first().click();
    await shoot(page, project, "coach-client-goal-new", { ready: page.getByLabel("Phase label"), settle: 400 });
    await page.keyboard.press("Escape");
  });

  // `/train` is not one of the client's subtabs — `ClientDetail` falls back to
  // `today` for anything it does not recognise, so this shot was a SECOND
  // picture of Today filed under the name of the plans screen. The tab values
  // are `today | plans | goals | progress | report | manage`.
  await test.step("the plans", async () => {
    await visit(page, `${base}/clients/${world.client.id}/plans`, shell);
    await shoot(page, project, "coach-client-plans");
  });

  // The two BUILDERS. They are where a coach spends the most time and they had
  // no picture at all — so a redesign of either shipped unphotographed, which is
  // the one thing §16 exists to prevent. Both are deep-linked: the routes are
  // real (`Shell.tsx`), and the plan ids come from the demo world.
  await test.step("the workout builder", async () => {
    await visit(page, `${base}/clients/${world.client.id}/plans/workout/${world.planId}`, page.getByLabel("Day name"));
    await shoot(page, project, "coach-workout-builder", { settle: 600 });
  });

  // The block list, which is the whole point of the day and sits below the
  // header at phone height. Scrolled to rather than cropped from a full-page
  // shot: what matters is how the collapsed blocks read as a list.
  await test.step("the workout builder's blocks", async () => {
    await visit(page, `${base}/clients/${world.client.id}/plans/workout/${world.planId}`, page.getByLabel("Day name"));
    await page.mouse.wheel(0, 620);
    await shoot(page, project, "coach-workout-blocks", { settle: 600 });
  });

  await test.step("the meal builder", async () => {
    await visit(page, `${base}/clients/${world.client.id}/plans/meal/${world.mealPlanId}`, page.getByText("Daily plan health"));
    await shoot(page, project, "coach-meal-builder", { settle: 600 });
  });

  // The other KIND of meal plan. It is a different screen — one meal per slot,
  // no options rail — so photographing only the bank would document half the
  // feature.
  await test.step("the meal builder · a fixed day", async () => {
    await visit(page, `${base}/clients/${world.client.id}/plans/meal/${world.fixedMealPlanId}`, page.getByText("one meal per slot"));
    await shoot(page, project, "coach-meal-builder-fixed", { settle: 600 });
  });

  await test.step("the report", async () => {
    await visit(page, `${base}/clients/${world.client.id}/report`, shell);
    await shoot(page, project, "coach-client-report", { settle: 1200 });
  });

  // MANAGE had no picture, and it is the tab that holds access, supplements,
  // labs and the offboarding index — i.e. everything a coach does TO a client
  // rather than for one. Its supplements and labs lists were rebuilt from
  // hand-rolled boxes into `Group`/`Row`, which is exactly the class of change
  // §16 says must not ship unphotographed.
  await test.step("managing a client", async () => {
    await visit(page, `${base}/clients/${world.client.id}/manage`, shell);
    await shoot(page, project, "coach-client-manage", { settle: 900 });
  });

  // The clinical lists, which sit below the check-in review and therefore below
  // the fold at phone height. Scrolled to rather than cropped from the shot
  // above: the claim is that supplements and labs now read as one scannable
  // list each, and that is only visible where they are.
  await test.step("a client's supplements and labs", async () => {
    await visit(page, `${base}/clients/${world.client.id}/manage`, shell);
    await page.getByText("Supplements").first().scrollIntoViewIfNeeded();
    await shoot(page, project, "coach-client-clinical", { settle: 600 });
  });

  // All four tabs — they are four collections of the same shape now, and the
  // only way that claim survives is if all four are photographed.
  for (const [tab, id] of [["exercises", "coach-library"], ["foods", "coach-library-foods"], ["templates", "coach-library-templates"], ["content", "coach-library-content"]] as const) {
    await test.step(`the library · ${tab}`, async () => {
      await visit(page, `${base}/library/${tab}`, shell);
      await shoot(page, project, id);
    });
  }

  await test.step("the library's filters", async () => {
    await visit(page, `${base}/library/exercises`, shell);
    await page.getByRole("button", { name: /^Filters/ }).first().click();
    await shoot(page, project, "coach-library-filter", { ready: page.getByText("Muscle group") });
    await page.keyboard.press("Escape");
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
