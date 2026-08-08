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
import { api, createCentre, newParty, signIn, uniqueEmail } from "../src/app.js";
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

  /*
    LOOK AND FEEL — `@4dl/ui`'s brand editor, which this app did not have.

    It was four controls: a colour input, a logo URL and two sign-in strings.
    The package had shipped presets, a derived palette, surface tint, radius,
    elevation, hairline weight and a per-token grid all along, over the same
    `Branding` type in the same column Kova keeps a twenty-field brand in — and
    exactly one app could reach any of it. This is the picture that says a
    practice now gets what a studio gets.
  */
  await test.step("look and feel", async () => {
    // Not scoped to a `main` landmark: Tessa's `Screen` does not render one.
    await visit(page, `${base}/settings?s=brand`, page.getByText("Shape & depth"));
    await shoot(page, project, "brand", { settle: 600 });
  });

  /*
    THE CENTRE'S OWN COLOUR, applied — and this step exists because it was not.

    `main.tsx` mounted `<ThemeProvider branding={null}>`, so the accent a centre
    picks in Settings → Look and feel was stored, cached, shipped to the browser
    and then discarded. The form saved and nothing changed. Every layer had a
    test and every layer passed; the defect lived in the one argument nobody
    asserted on, which is exactly the class of bug a photograph catches and a
    diff does not.

    So the sweep now SETS a brand colour through the real settings route and
    photographs the app wearing it. A regression here is a picture in Tessa's
    green where the picture should be violet — visible at a glance, in the
    review, without reading a line of code.
  */
  await test.step("a branded centre", async () => {
    /*
      Through the page, not `context.request`: the driver process does its own
      DNS and cannot see this suite's `.localhost` resolver (`api` in src/app.ts
      says so at length). It also THROWS on a refusal rather than swallowing it
      — a seed that failed quietly would produce a perfectly plausible
      photograph of the unbranded app filed under the id that promises
      otherwise, which is the trap this file's own header describes.
    */
    await visit(page, `${base}/`, shell);
    await api(page, "PATCH", "/api/settings", { branding: { primary: "#7c5cff" } });
    await page.reload();
    await visit(page, `${base}/`, shell);
    await shoot(page, project, "branded", { settle: 700 });
  });

  await context.close();
});
