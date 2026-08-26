/**
 * EVERY SCREEN THIS PRODUCT HAS, PHOTOGRAPHED.
 *
 * ⚠️ SEPARATE FROM THE TEST SUITE, AND RUN WHEN IMAGES ARE WANTED. It is
 * nineteen screens at two widths in two themes — seventy-six pages in a real
 * browser — which is minutes rather than seconds, and nothing about it is a
 * question with a pass or a fail. Putting it in `test` would make every run of
 * the gate pay for pictures nobody asked for.
 *
 * ⚠️ FROM THE GROUND, WHICH IS THE ONLY WAY THIS PRODUCT IS PHOTOGRAPHABLE AT
 * ALL. The states worth showing are a line that ran out, a shelf somebody
 * labelled and never filled, and a code the workspace has never seen — and
 * reaching all three through a real database is four hours of data entry before
 * the first image. `screens/sample.ts` is that afternoon, written down once.
 *
 * ⚠️ AND IN THE FRAME, BECAUSE THAT IS WHAT SOMEBODY SEES. A screen photographed
 * on its own is a photograph of a component: no world behind it, no crown, no
 * nav, and a dock floating where the page happens to end.
 *
 * ⚠️ MOUNTED FOR REAL RATHER THAN RENDERED TO A STRING. A sub-page publishes its
 * name and its way back into the shell's crown from a layout effect, which a
 * static render never runs — so six of these nineteen would photograph with
 * nothing at all saying where somebody is. See `mounted`.
 *
 * ⚠️ BOTH THEMES, BECAUSE THEY ARE TWO DESIGNS RATHER THAN ONE INVERTED. Light
 * is where a glass surface stops being glass and a hairline disappears, and it
 * is the mode nobody working on the product runs.
 *
 * ⚠️ IT ASSERTS THE FILES EXIST AND ARE NOT BLANK. A photography run that prints
 * encouraging lines and writes an empty PNG is the same silent success this
 * repository is a catalogue of — and an image is the one artefact nobody diffs.
 */

import { mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESK, PHONE, mounted, shoot, stylesheet } from "@engine/design/measuring";
import { inventory as INVENTORY } from "../src/index.js";

/**
 * ⚠️ THE MANIFEST, AND IT MUST BECOME THE RENDERER TOO. This walked the routes
 * and drew each through the app's own board — so a screen ported to a declared
 * body went on being photographed as the hand-written file of the same name,
 * while the product drew the declaration. Eighty-four images were taken of
 * screens no customer could open, filed under the ids of the ones they could,
 * and every check reported green. A photograph of the previous design under the
 * current name is worse than no photograph: one is a gap somebody fills, the
 * other is evidence somebody trusts.
 *
 * ⚠️ SO A BODY AND A STORY ARE PHOTOGRAPHED THROUGH THE ENGINE, from the
 * declaration, which is the only way the image is of the screen rather than of a
 * file sharing its name. A session draws itself and is photographed from the
 * board. Both halves land as the screens do.
 */
const DECLARED: readonly string[] = (INVENTORY().screens ?? []).map((one) => one.route);

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "shots-out");

/** ⚠️ A route is a path; a filename is not. `/` is the one that needs a name. */
const idOf = (route: string): string =>
  route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");

/**
 * ⚠️ A TALLER PHONE THAN THE MEASURING USES. 844 is the real device and the
 * right number for asking whether something fits; a photograph cut off at the
 * fold shows two rows of a list that has eleven, and what the screen is for is
 * below it.
 */
const TALL = { width: PHONE.width, height: 1_200 } as const;
const WIDE = { width: DESK.width, height: DESK.height } as const;

const LOOKS = [
  ["phone-dark", TALL, "dark"],
  ["phone-light", TALL, "light"],
  ["desk-dark", WIDE, "dark"],
  ["desk-light", WIDE, "light"],
] as const;

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "mount.tsx"));
  browser = await chromium.launch();
  /* ⚠️ CLEARED FIRST, so a screen that was deleted does not leave a photograph
     of itself in a sweep somebody reads as current. */
  rmSync(OUT, { recursive: true, force: true });
  for (const [look] of LOOKS) mkdirSync(join(OUT, look), { recursive: true });
}, 120_000);
afterAll(async () => { await browser?.close(); });

describe("OneInventory, photographed", () => {
  for (const [look, viewport, theme] of LOOKS) {
    for (const route of DECLARED) {
      it(`${look}: ${route}`, async () => {
        const to = join(OUT, look, `${idOf(route)}.png`);
        await shoot(browser, { code, route }, css, viewport, theme, to);
        /* ⚠️ A blank page encodes to a few hundred bytes. Anything the size of a
           real screen is several thousand. */
        expect(statSync(to).size, `${to} is blank`).toBeGreaterThan(5_000);
      }, 60_000);
    }
  }

  /* ⚠️ AND THE SWEEP FOUND SOMETHING TO SWEEP. Nineteen assertions that never
     ran would report exactly as green as nineteen that passed. */
  /* ⚠️ AND THE SWEEP FOUND SOMETHING TO SWEEP. Assertions that never ran report
     exactly as green as assertions that passed — which is the whole reason this
     one exists. It is FAILING while the surface is rewritten, and that is the
     correct answer to "did you photograph every screen" when there are none. */
  it("photographed every screen the manifest declares", () => {
    expect(DECLARED.length).toBeGreaterThan(15);
  });
});
