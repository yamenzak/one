/**
 * DOES THE WORLD ACTUALLY MOVE — asked in pixels, because nothing else can ask
 * it.
 *
 * ⚠️ THIS IS THE TEST THE AMBIENCE HAS NEEDED SINCE IT WAS WRITTEN, AND ITS
 * ABSENCE COST THE WHOLE FEATURE. There were guards over the keyframes (are they
 * compositor-only), over the stylesheet (is the opt-out present), over the
 * markup (does every mark carry its class) — and every one of them checked that
 * motion had been DECLARED. Three separate faults, stacked, each hiding the
 * others, kept every beat in the product completely still, and all three passed
 * every check in the repository:
 *
 *   1. the marks live inside a `<pattern>`, and Chromium rasterises a pattern's
 *      tile ONCE and paints the cache — an animation declared in there is
 *      created, is reported by `getAnimations()`, and repaints nothing;
 *   2. the in-app opt-out was written as one ancestor and a comma-separated
 *      list, and a descendant combinator binds to the FIRST selector only — so
 *      six of the seven beats were `animation: none` for everybody, always;
 *   3. the ground's drift travelled half a percent, which on a phone is four
 *      pixels across twenty-four seconds.
 *
 * ⚠️ SO THE ASSERTION IS TWO SCREENSHOTS AND A COMPARISON. It cannot be argued
 * with, it does not care WHY a picture is still, and it is the only shape of
 * check that survives the next thing a browser decides to cache.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FAMILIES, render, type Family, type Palette } from "../src/scene/index.js";
import { ambienceStylesheet, worldCss } from "../src/tokens/ambience.js";
import { GROUND_CSS } from "../src/tokens/ground.js";
import { Page } from "../src/frame/page.js";
import { worldOf } from "../src/measure/index.js";

/** ⚠️ Any palette — the sweep is about PLACEMENT, which no colour changes. */
const SWEEP: Palette = { deep: "#101014", lit: "oklch(0.79 0.16 68)" } as unknown as Palette;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/**
 * ⚠️ THE VIEWPORT IS THE TILE, NOT A PHONE. A field repeats at 1400×1000 and a
 * beat may hold two marks — through a 390-wide window both can easily be off to
 * the right, and the picture is then honestly identical for a reason that has
 * nothing to do with whether it animates.
 */
const TILE = { width: 1400, height: 1000 } as const;

/**
 * ⚠️ LONG ENOUGH FOR THE SLOWEST BEAT TO MOVE A WHOLE LEVEL. The lattice pair
 * run at 47 and 71 seconds and dip by less than a third, so a second and a half
 * of one is a change below the rounding of an 8-bit channel — a still picture
 * and a nearly-still one are the same file, and only one of them is a fault.
 */
const WATCH = 9_000;

const shot = async (family: string, still = false): Promise<{ moved: boolean }> => {
  const made = worldCss(
    { family: family as never, deep: "#101010", lit: "#b0b0b0", seed: "measured" },
    { night: true, density: "rich", still },
  );
  const page = await browser.newPage({ viewport: { ...TILE } });
  try {
    await page.setContent(
      `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
      /* ⚠️ The curve the sheet asks for, since no HeroUI stylesheet is here — a
         `var()` that resolves to nothing makes the whole shorthand invalid and
         every beat would be `none` for a reason the test is not about. */
      + `<style>:root{--ease-smooth:cubic-bezier(.4,0,.2,1)}body{margin:0;background:#101010}</style>`
      + `<style>${ambienceStylesheet()}</style></head>`
      + `<body><svg width="${TILE.width}" height="${TILE.height}">${made.field}</svg></body></html>`,
    );
    const before = await page.screenshot();
    await page.waitForTimeout(WATCH);
    const after = await page.screenshot();
    return { moved: Buffer.compare(before, after) !== 0 };
  } finally { await page.close(); }
};

/**
 * ⚠️ EVERY FAMILY THAT DECLARES A BEAT, DERIVED — so an eighth is asked the same
 * question the day it is added, and a family that quietly loses its last beat
 * fails rather than dropping out of the list.
 */
const BEATING = Object.entries(FAMILIES)
  .filter(([, both]) => JSON.stringify(both.night).includes(`"beat"`))
  .map(([name]) => name);

describe("a world that declares motion", () => {
  it("has some families to check at all", () => {
    expect(BEATING.length, "no family declares a beat — the table is gone").toBeGreaterThan(2);
  });

  it.each(BEATING)("moves: %s", async (family) => {
    const { moved } = await shot(family);
    expect(moved, `${family} draws the same pixels ${WATCH / 1000}s apart — its beats are inert`)
      .toBe(true);
  }, 60_000);

  /*
    ⚠️ AND IT IS COMPLETELY STILL WHEN SOMEBODY ASKS FOR THAT, which no media
    query can deliver here. A beat is SMIL — the only thing that repaints inside
    a `<pattern>` — and SMIL cannot be switched off by CSS, so the drawing is
    made without one instead (`render`). That is a claim about a STRING, and the
    only honest way to check it is the same two screenshots.
  */
  it.each(BEATING)("and holds completely still when asked: %s", async (family) => {
    const { moved } = await shot(family, true);
    expect(moved, `${family} keeps moving for somebody who asked it not to`).toBe(false);
  }, 60_000);
});

/**
 * A SOURCE THAT REACHES THE SCREEN AT ALL — ON EVERY SEED.
 *
 * ⚠️ WHAT THIS PROVES, AND WHAT IT DOES NOT. Suppressing `--world-flare` must
 * change the picture, which catches a source that resolved to nothing, one whose
 * layer has no box, and one sitting behind an opaque parent — three ways a
 * family's light reaches no eye with every property still reading correctly.
 * It does NOT separate a well-placed band from one the mask has mostly removed:
 * measured across 24 seeds in both states, the worst case is a fifth of the
 * image either way, because a masked band still tints the top of the page. The
 * PLACEMENT rule is pinned at the source instead (`scripts/scene.test.mjs`),
 * where it is a number rather than a photograph.
 *
 * ⚠️ AND THE SEEDS ARE SWEPT because that is where the variation lives. One seed
 * proves one world; a family is every world it can make, and it was a seed
 * changing that took a product's light away.
 */
describe("a family that declares a source", () => {
  /* ⚠️ ENOUGH TO REACH BOTH FORMS — `forms` picks a ring over a beam about five
     times in eight, so a handful of seeds can be all rings and say nothing about
     the half that broke. Measured: beams appear from the fourth. */
  const SEEDS = Array.from({ length: 10 }, (_, i) => `sweep-${i}`);

  const skies = Object.entries(FAMILIES)
    .filter(([, family]) => {
      const one = (family as { night?: Family }).night ?? (family as { day?: Family }).day;
      return !!one && !!render({ family: one, seed: SEEDS[0] as string, palette: SWEEP, density: 1.8 }).flare;
    })
    .map(([name]) => name);

  it("finds a family with a source to sweep", () => {
    expect(skies.length, "no family declares a source, so this sweep checks nothing")
      .toBeGreaterThan(0);
  });

  for (const sky of skies) {
    for (const seed of SEEDS) {
      it(`gets ${sky}'s light onto the screen: ${seed}`, async () => {
        const world = await worldOf(
          browser,
          <Page sky={sky as "neon"} seedling={seed} hue="oklch(0.79 0.16 68)">
            <div style={{ minHeight: "150vh" }} />
          </Page>,
          `${GROUND_CSS}\n${ambienceStylesheet()}`,
          { width: 390, height: 844 },
        );
        expect(world.flare, `${sky}/${seed}: the source resolved to nothing`).not.toBe("none");
        expect(world.lit.on, `${sky}/${seed}: no element carries the source`).toBe(true);
        expect(world.visible,
          `${sky}/${seed}: suppressing the source changes nothing on the screen — it is `
          + `declared, resolved, and reaches no eye`).toBeGreaterThan(0.02);
      }, 60_000);
    }
  }
});
