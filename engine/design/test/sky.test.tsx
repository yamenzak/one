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
import { FAMILIES } from "../src/scene/index.js";
import { ambienceStylesheet, worldCss } from "../src/tokens/ambience.js";

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

const shot = async (family: string): Promise<{ moved: boolean }> => {
  const made = worldCss(
    { family: family as never, deep: "#101010", lit: "#b0b0b0", seed: "measured" },
    { night: true, density: "rich" },
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
});
