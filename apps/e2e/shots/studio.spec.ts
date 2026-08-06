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

import { expect, test } from "@playwright/test";
import { buildDemoWorld, DEMO_CLIENT, DEMO_STUDIO, prepare, type DemoWorld } from "../src/demo.js";
import { shoot, visit } from "../src/shoot.js";
import { teardown } from "../src/provision.js";
import { carrySessionTo } from "../src/app.js";
import { ADMIN_URL, ROOT_DOMAIN, SETUP_URL } from "../src/env.js";

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
    // 1500 > `PROMPT_GRACE_MS`: the install nudge deliberately says nothing
    // until Chromium has had its beat to fire `beforeinstallprompt`, so a
    // shorter settle photographs a Today screen with the row missing.
    await shoot(page, project, "coach-today", { settle: 1500 });
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

  // The capability sheet — the answer to "what does this client actually get",
  // which the package name above it cannot give. The seeded client is on a
  // workout-only package, so this photographs the interesting half: capabilities
  // ON from the package, and meal ones OFF with the reason the coach can act on.
  await test.step("what a client can do", async () => {
    await visit(page, `${base}/clients/${world.client.id}/manage`, shell);
    await page.getByText("What they can do").click();
    await shoot(page, project, "coach-client-capabilities", { ready: page.getByText("Log own food"), settle: 600 });
    await page.keyboard.press("Escape");
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

  // ALL FOUR BUSINESS TABS. They are in-component state rather than routes, so
  // each one needs a click — and until now only the first had a picture, which
  // is how three of them came to hold every hand-rolled list left in the app.
  for (const tab of ["Packages", "Getting paid", "Staff"] as const) {
    await test.step(`the business · ${tab.toLowerCase()}`, async () => {
      await visit(page, `${base}/business`, shell);
      // `SegmentedControl`'s options are `role="tab"`, not buttons.
      await page.getByRole("tab", { name: tab, exact: true }).first().click();
      await shoot(page, project, `coach-business-${tab.toLowerCase().replace(/ /g, "-")}`, { settle: 900 });
    });
  }

  // The package editor, driven into the state that prompted the coherence check:
  // meal days sold with the meal plan switched off, so the days buy nothing. The
  // warning is computed, not seeded, which is why this drives the controls
  // rather than photographing a fixture.
  await test.step("a package whose days and toggles disagree", async () => {
    await visit(page, `${base}/business`, shell);
    await page.getByRole("tab", { name: "Packages", exact: true }).first().click();
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByLabel("Name").fill("Training + meals");
    // A second budget row, switched to `meal` — the package now sells meal days.
    await page.getByRole("button", { name: "+ Budget" }).click();
    await page.locator("button", { hasText: /^meal$/ }).last().click();
    // …and the meal capabilities off, which is what makes those days dead.
    await page.getByRole("switch").and(page.locator(`xpath=//div[div/div[text()="Meal plan"]]//button`)).click();
    await page.getByRole("switch").and(page.locator(`xpath=//div[div/div[text()="Swap meal options"]]//button`)).click();
    await page.getByText(/those days unlock nothing/).scrollIntoViewIfNeeded();
    await shoot(page, project, "coach-package-contradiction", { ready: page.getByText(/those days unlock nothing/) });
    await page.keyboard.press("Escape");
  });

  // The install nudge's guide sheet. Chromium at a desktop viewport resolves to
  // the `desktop` platform, so this photographs those steps — the iOS copy is
  // the same component with a different row of the GUIDE table.
  await test.step("the install guide", async () => {
    await visit(page, `${base}/today`, shell);
    // Either verb: `beforeinstallprompt` fires in some Chromium builds and not
    // others, and the row says "Install" when it does. Asserting rather than
    // skipping — a step that silently photographs nothing is a step that reports
    // success for a screen nobody has looked at.
    const how = page.getByRole("button", { name: /^(How|Install)$/ }).first();
    // The row holds itself back for `PROMPT_GRACE_MS`, so wait for it rather
    // than asserting on a control that is correctly not there yet.
    await expect(how).toBeVisible({ timeout: 15_000 });
    await how.click();
    await shoot(page, project, "install-guide", { ready: page.getByRole("button", { name: "Not now" }) });
    await page.keyboard.press("Escape");
  });

  await test.step("the business", async () => {
    await visit(page, `${base}/business`, shell);
    await shoot(page, project, "coach-business", { settle: 600 });
  });

  await test.step("credit activity", async () => {
    await visit(page, `${base}/business/credits`, page.getByRole("heading", { name: "Credit activity" }));
    await shoot(page, project, "coach-business-credits", { settle: 900 });
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
    // See coach-today: outlast the install nudge's grace window.
    await shoot(page, project, "client-today", { settle: 1500 });
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

/**
 * THE OPERATOR CONSOLE's per-tenant entitlements, which had never been
 * photographed — and which shipped for months telling the operator, correctly,
 * that a value below the plan "simply won't apply".
 *
 * A studio pinned BELOW its plan is the state worth a picture: it is the one
 * the panel could not previously reach at all, and the row tag plus its undo
 * are the whole of the fix.
 */
test("a studio's entitlements, in the operator console", async () => {
  // The SIGNED-IN context, not a fresh one: the operator door needs the session
  // carried across hosts (`compOntoPlan` does the same), and a new context has
  // no cookies to carry.
  const context = world.studio.context;
  await carrySessionTo(context, SETUP_URL, `admin.${ROOT_DOMAIN}`);
  const page = await context.newPage();
  try {
    await page.goto(`${ADMIN_URL}/health`);
    // Pin two limits below the plan and switch one feature off — computed by the
    // server, so what the shot shows is what the gates enforce.
    const out = await page.evaluate(async ([path, body]: [string, string]) => {
      const res = await fetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body });
      return { ok: res.ok, status: res.status, text: await res.text() };
    }, [`/api/admin/tenants/${world.studio.tenantId}/overrides`, JSON.stringify({
      adjustments: { quotas: { activeClients: 40, staffSeats: 2 }, features: { supplementsLabs: false } },
    })] as [string, string]);
    expect(out.ok, `pinning entitlements failed: ${out.status} ${out.text}`).toBe(true);

    // `?s=<key>` is the console's section param (`use-section.ts`), and the
    // studios section's key is `tenants`.
    await visit(page, `${ADMIN_URL}/?s=tenants`, page.getByText(DEMO_STUDIO).first());
    await page.getByText(DEMO_STUDIO).first().click();
    await page.getByRole("button", { name: /edit entitlements/i }).click();
    await shoot(page, project, "admin-tenant-entitlements", { ready: page.getByText("Active clients"), settle: 600 });
  } finally {
    await page.close();
  }
});
