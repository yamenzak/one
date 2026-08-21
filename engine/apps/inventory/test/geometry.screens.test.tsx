/**
 * EVERY SCREEN THIS PRODUCT HAS, MEASURED IN A BROWSER.
 *
 * ⚠️ THE DESIGN SYSTEM'S OWN GEOMETRY SUITE MEASURES SPECIMENS, AND A SPECIMEN
 * IS AN ARRANGEMENT BUILT TO PASS THE RULE. It proves `Group` insets its rows
 * once and `Stack` spaces its blocks by the scale; it cannot say whether the
 * screen somebody opens on a phone pushes the page sideways, because no product
 * screen is in it. This is that sweep — the real components, the real ground
 * data, the stylesheet that actually ships.
 *
 * ⚠️ AND WHAT IS ASSERTED IS WHAT A STATIC CHECK CANNOT SEE. Not "which class
 * was written" — every other guard in this repository reads source — but the
 * pixels a stylesheet, a flex container and four reasonable components produced
 * between them. Overflow and a control too small to hit are both computed
 * values, and both are invisible until somebody complains.
 *
 * ⚠️ AT TWO WIDTHS, BECAUSE THEY FAIL DIFFERENTLY. A phone finds the row that
 * wraps and the table that will not fit; a desk finds the fixed width nobody
 * noticed and the layout that was only ever looked at small.
 *
 * ⚠️ THE MEASURING IS THE PACKAGE'S AND THE ROUTES ARE THE PRODUCT'S. A copy of
 * `geometryOf` here would be a second answer to what counts as off-canvas, and
 * the exemptions are the whole subtlety — see there.
 *
 * ⚠️ AND IN THE FRAME, MOUNTED FOR REAL. A screen measured on its own leaves out
 * the half a product cannot opt out of — the crown, the nav, the room reserved
 * for the island — and a screen rendered to a STRING leaves out everything an
 * effect puts there, which for a sub-page is its entire crown. Six of these
 * nineteen are sub-pages, so a third of the product would be measured with the
 * one bar somebody always sees missing from the page.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESK, FINGER, PHONE, geometryOf, mounted, stylesheet, tooSmall } from "@engine/design/measuring";
import { INVENTORY_ROUTES } from "../src/screens/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "..", "shots", "mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

const at = (route: string, viewport: { width: number; height: number }) =>
  geometryOf(browser, { code, route }, css, viewport);

describe("every screen, at a phone width", () => {
  for (const route of INVENTORY_ROUTES) {
    it(`does not push the page sideways: ${route}`, async () => {
      const seen = await at(route, PHONE);
      expect(seen.worst, `${route}: <${seen.worst?.tag}> reaches ${seen.worst?.right}px `
        + `("${seen.worst?.text}") past a ${PHONE.width}px viewport`).toBeNull();
      expect(seen.spill, `${route} scrolls ${seen.spill}px sideways`).toBe(0);
    }, 30_000);
  }
});

describe("every screen, at a desk width", () => {
  for (const route of INVENTORY_ROUTES) {
    it(`does not push the page sideways: ${route}`, async () => {
      const seen = await at(route, DESK);
      expect(seen.worst, `${route}: <${seen.worst?.tag}> reaches ${seen.worst?.right}px `
        + `("${seen.worst?.text}") past a ${DESK.width}px viewport`).toBeNull();
      expect(seen.spill, `${route} scrolls ${seen.spill}px sideways`).toBe(0);
    }, 30_000);
  }
});

/*
  ⚠️ THIS IS THE ONE THAT FOUND SOMETHING. `ROW.tap` calls 44px non-negotiable
  and every row obeyed it; the library's controls did not — 40px, 36 above the
  breakpoint, 32 for `sm` — so the rule the tokens state was true of the rows and
  false of the things people press, in a product used one-handed while the other
  hand holds a box. The floor is one rule in `one-space/src/styles.css`; this is
  what says it is still there and still reaches every control.
*/
describe("every control somebody has to hit", () => {
  for (const route of INVENTORY_ROUTES) {
    it(`is big enough for a finger: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const small = tooSmall(seen.targets);
      expect(small, `${route}: ${small.map((t) => `"${t.text}" is ${t.height}px tall`).join(", ")}`)
        .toEqual([]);
    }, 30_000);
  }
});

/* --------------------------------------------------------------- controls --- */

/*
  ⚠️ THE RULES ARE SHOWN FAILING. Both are arrangements a screen could plausibly
  arrive at — a fixed width somebody typed while looking at a desk, and a control
  sized by its own text — and a sweep that passed them would be a sweep measuring
  nothing.
*/
describe("the measurements bite", () => {
  it("sees a fixed width that does not fit a phone", async () => {
    const seen = await geometryOf(
      browser, <div style={{ width: 900, height: 20, background: "#333" }}>Too wide</div>,
      css, PHONE);
    expect(seen.worst).not.toBeNull();
    expect(seen.spill).toBeGreaterThan(0);
  }, 30_000);

  it("sees a control too small to hit", async () => {
    const seen = await geometryOf(
      browser, <span role="button" style={{ display: "block", height: 20, width: 20 }}>x</span>,
      css, PHONE);
    expect(seen.targets.filter((t) => t.height < FINGER)).toHaveLength(1);
  }, 30_000);

  /* ⚠️ AND IT DOES NOT FIRE ON WIDE CONTENT THAT SCROLLS ITSELF, which is the
     correct answer for a table and the one exemption the rule allows. */
  it("leaves a container that scrolls its own content alone", async () => {
    const seen = await geometryOf(
      browser,
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <div style={{ width: 900, height: 20, background: "#333" }}>Wide, and it says so</div>
      </div>,
      css, PHONE,
    );
    expect(seen.worst).toBeNull();
    expect(seen.spill).toBe(0);
  }, 30_000);
});
