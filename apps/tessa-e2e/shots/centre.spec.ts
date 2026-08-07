/**
 * THE SWEEP — every tab of a real centre, at three widths.
 *
 * One test rather than one per screen: building a centre costs a sign-in, an
 * OTP and a create, and paying that per screen would make the run long enough
 * that nobody would take it. Inside the test each shot is its own step, so a
 * failure names the screen it happened on.
 *
 * ── A NEW CENTRE, and that is deliberate ────────────────────────────────────
 *
 * These photograph a centre on its first day: every list an empty state, every
 * counter zero. That is a real screen — it is what every customer sees first,
 * it is the hardest one to get right, and nothing else in this repo pictures
 * it.
 *
 * It is also honest. The first version of this file seeded three instruments
 * through the API with `.catch(() => undefined)` on each — so a seed that
 * failed produced exactly these images with a comment above them promising
 * furniture. A swallowed failure that answers with a confident fact is the one
 * pattern this codebase refuses everywhere else; it does not get an exemption
 * for being test code.
 *
 * A furnished sweep is worth having and is a different suite: it needs a real
 * world (instruments, a tray, a load, a case) built through the API and
 * ASSERTED, the way Kova's demo world is. Until that exists, this says what it
 * actually shows.
 */

import { test } from "@playwright/test";
import { shoot, visit } from "../src/shoot.js";
import { createCentre, newParty, signIn, uniqueEmail } from "../src/app.js";
import { centreUrl } from "../src/env.js";

const CENTRE = "Praxis Nord";

test("the centre", async ({ browser }, info) => {
  const project = info.project.name;
  const context = await newParty(browser);
  const page = await context.newPage();

  await signIn(page, uniqueEmail("shots"));
  const slug = await createCentre(context, page, CENTRE);
  const base = centreUrl(slug);

  // The app bar carries the centre's name on every screen, so it is the one
  // element that proves the shell mounted rather than that a screen finished
  // loading. Each shot adds its own wait on top where it has one.
  const shell = page.getByText(CENTRE, { exact: false }).first();

  for (const [path, id] of [
    ["/", "today"],
    ["/stock", "stock"],
    ["/cssd", "cssd"],
    ["/cases", "cases"],
    ["/insights", "insights"],
  ] as const) {
    await test.step(id, async () => {
      await visit(page, `${base}${path}`, shell);
      await shoot(page, project, id, { settle: 700 });
    });
  }

  /*
    THE SCAN SHEET, which is the product's whole premise — Tessa is scan-first,
    and this is the surface a nurse touches with gloves on. It is deliberately
    NOT a tab (a tab is a place you go and stay; scanning is a thing you do to
    the screen you are already on), so nothing would photograph it by accident.
  */
  await test.step("the scan sheet", async () => {
    await visit(page, `${base}/`, shell);
    await page.getByRole("button", { name: "Scan", exact: true }).first().click();
    await shoot(page, project, "scan", { ready: page.getByRole("dialog"), settle: 600 });
    await page.keyboard.press("Escape");
  });

  await test.step("settings", async () => {
    await visit(page, `${base}/settings`);
    await shoot(page, project, "settings", { settle: 600 });
  });

  await context.close();
});
