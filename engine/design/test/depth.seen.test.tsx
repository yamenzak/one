/**
 * HOW DEEP A NIGHT IS, MEASURED — because nothing else in this repository can
 * see a ground at all.
 *
 * ⚠️ THE AMBIENCE HAD NO CHECK OVER ITS LIGHT, ONLY OVER ITS MOTION. `sky.seen`
 * compares two screenshots byte for byte, which answers "did anything move";
 * `scene.test.mjs` reads the declarations. A ground that is flat, crushed, blown
 * out or beautifully lit passes all of them identically, and "the dark theme
 * looks grey" is not a claim any of them can be pointed at.
 *
 * ⚠️ SO THE ASSERTIONS ARE PERCENTILES OF A REAL SCREEN, IN OKLab L — the space
 * `ground.ts` states every tier in. Measured before this existed: the night
 * families spanned 0.064–0.151 from p01 to p99 with their median almost exactly
 * halfway between, which is the histogram of a WASH. A lit scene is
 * bottom-weighted with a tail into the highlights.
 *
 * ⚠️ AND THE FIRST TEST IS ABOUT LAYER ORDER, WHICH IS THE BUG THIS ACTUALLY
 * HAD. `background-image` reads topmost first and every family's last layer is
 * OPAQUE, so the depth crush appended after them was painted underneath
 * something with no transparency: present in the string, applied to nothing, and
 * reporting numbers identical to four decimal places across all nine families. A
 * measurement alone would have called that "no change" rather than "no effect".
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FAMILIES, render } from "../src/scene/index.js";
import { ambienceStylesheet, worldCss } from "../src/tokens/ambience.js";
import { GROUND, GROUND_CSS } from "../src/tokens/ground.js";
import { litness } from "../src/measure/index.js";

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

const NAMES = Object.keys(FAMILIES) as (keyof typeof FAMILIES)[];

/** ⚠️ Any palette — depth is about VALUE, which no hue changes. */
const PALETTE = { deep: "#101010", lit: "#b0b0b0" } as const;

describe("the crush is on top of the world, not under it", () => {
  it.each(NAMES)("%s draws its depth first", (family) => {
    const made = render({
      family: FAMILIES[family].night, seed: "measured", still: true,
      palette: PALETTE as never,
    } as never);
    const first = made.ground.split("), ")[0] ?? "";
    /* ⚠️ THE CRUSH IS THE ONLY LAYER MADE OF `rgb(0 0 0 / …)` — every other one
       in the engine is mixed from the world's own colours, deliberately (see
       `depth`), so this identifies it without the engine having to label it. */
    expect(first, `${family}'s first ground layer is not the depth crush, so the `
      + `family's own opaque base is painted over it and it reaches nothing`)
      .toMatch(/radial-gradient\([^)]*rgb\(0 0 0 \/ 0\)/);
  });
});

describe("a night is deep and lit", () => {
  const seen = async (family: keyof typeof FAMILIES) => {
    const made = worldCss(
      { family, seed: "measured", ...PALETTE } as never,
      { night: true, density: "even", still: true },
    );
    const vars = Object.entries(made.css).map(([k, v]) => `${k}:${v}`).join(";");
    return litness(
      browser,
      `<div data-sky="${family}" style="position:fixed;inset:0;${vars}">`
      + `<svg width="100%" height="100%">${made.field}</svg></div>`,
      ":root{--brand:oklch(0.72 0.01 66);--ease-smooth:cubic-bezier(.4,0,.2,1)}"
      + "html,body{height:100%;margin:0;background:var(--background)}"
      + `\n${GROUND_CSS}\n${ambienceStylesheet()}`,
      { width: 900, height: 700 }, "dark",
    );
  };

  /**
   * ⚠️ A CEILING ON THE FLOOR, NOT A FLOOR ON IT — and it is stated AGAINST THE
   * PAGE rather than as a number, because a constant here is a copy of where the
   * ground happened to be when it was written. What this asks is that a night
   * casts real SHADOW: the darkest tenth of a lit world has to be genuinely
   * below the ground it is drawn on, which is the one thing the depth crush is
   * for and the one thing an inert crush cannot produce. A world whose layers
   * only ADD light lands at or above the page and fails here.
   *
   * ⚠️ THE MARGIN IS SMALL ON PURPOSE. What is being asked is direction with
   * enough size to be findable, not a quota of darkness — a family free to reach
   * a stated depth is a family that has to, and they are not one mood. Measured
   * across the nine at 0.031–0.039 below the page.
   */
  const UNDER = 0.02;
  const FLOOR = GROUND.dark.background - UNDER;

  /**
   * ⚠️ AND A RANGE, WHICH IS THE HALF "DARK" ALONE DOES NOT BUY. A ground can be
   * deep and completely flat — that is a black rectangle, and it is what most
   * dark themes are. Measured after the depth stage: 0.085–0.334. 0.075 is under
   * every one of them and above the 0.057–0.064 the flattest families reported
   * while the crush was inert.
   */
  const RANGE = 0.075;

  /**
   * THE TWO THAT DO NOT, NAMED — because the alternative is a looser number for
   * all nine, and that is how a check stops catching the seven it still holds.
   *
   * ⚠️ NEITHER IS CAUSED BY THE GROUND, AND BOTH WERE ALWAYS TRUE. The crush is
   * an alpha over whatever the family drew, so what it REACHES has always been
   * decided by how light that family's own last layer is — and while the page
   * sat near black, everything measured dark enough to pass whether the crush
   * bit or not. Lifting the floor did not break these; it stopped hiding them.
   *
   * ⚠️ `tint` IS A WASH BY CONSTRUCTION — it is the one family with a hue of its
   * own, its base is the lightest here, and 77% of black over it still lands
   * near the page. `space` paints a picture across the whole frame at an even
   * density, which is a flat field by definition. Closing either means the
   * family drawing its own falloff, not the engine turning the crush up: past
   * this the corner stops reading as distance for the other seven.
   *
   * ⚠️ AND THE LIST CAN ONLY SHRINK. Each is asserted to FAIL, so a family that
   * starts meeting the floor turns this red until it is deleted — an exemption
   * that cannot rot into a permanent one.
   */
  const SHORT: Partial<Record<keyof typeof FAMILIES, "floor" | "spread">> = {
    tint: "floor",
    space: "spread",
  };

  it.each(NAMES)("%s reaches a real floor and a real range", async (family) => {
    const lit = await seen(family);
    const short = SHORT[family];

    if (short !== "floor") {
      expect(lit.floor, `${family}'s darkest tenth sits at ${lit.floor.toFixed(3)} — `
        + `a night that never gets dark`).toBeLessThan(FLOOR);
    } else {
      expect(lit.floor, `${family} now reaches ${lit.floor.toFixed(3)}, under the `
        + `${FLOOR.toFixed(3)} floor — delete it from SHORT, which may only shrink`)
        .toBeGreaterThanOrEqual(FLOOR);
    }

    if (short !== "spread") {
      expect(lit.spread, `${family} spans ${lit.spread} from p01 to p99 — a flat `
        + `field with a slight bias, which is a wash rather than a lit room`)
        .toBeGreaterThan(RANGE);
    } else {
      expect(lit.spread, `${family} now spans ${lit.spread}, over the ${RANGE} range — `
        + `delete it from SHORT, which may only shrink`).toBeLessThanOrEqual(RANGE);
    }
  }, 60_000);
});
