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
import { GROUND_CSS } from "../src/tokens/ground.js";
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
   * ⚠️ A CEILING ON THE FLOOR, NOT A FLOOR ON IT. `GROUND.dark.background` is
   * 0.055 and the argument for not going lower is `CURTAIN.edge`'s: an OLED
   * switches a pure black pixel off and the boundary reads as a hole. What this
   * asks is the other direction — that the darkest part of a night ACTUALLY
   * gets dark. Measured at 0.072–0.094; 0.11 leaves real room and still fails
   * the 0.13-ish flat wash this replaced.
   */
  const FLOOR = 0.11;

  /**
   * ⚠️ AND A RANGE, WHICH IS THE HALF "DARK" ALONE DOES NOT BUY. A ground can be
   * deep and completely flat — that is a black rectangle, and it is what most
   * dark themes are. Measured after the depth stage: 0.085–0.334. 0.075 is under
   * every one of them and above the 0.057–0.064 the flattest families reported
   * while the crush was inert.
   */
  const RANGE = 0.075;

  it.each(NAMES)("%s reaches a real floor and a real range", async (family) => {
    const lit = await seen(family);
    expect(lit.floor, `${family}'s darkest tenth sits at ${lit.floor.toFixed(3)} — `
      + `a night that never gets dark`).toBeLessThan(FLOOR);
    expect(lit.spread, `${family} spans ${lit.spread} from p01 to p99 — a flat `
      + `field with a slight bias, which is a wash rather than a lit room`)
      .toBeGreaterThan(RANGE);
  }, 60_000);
});
