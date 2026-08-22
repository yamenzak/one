/**
 * THE WORLD BEHIND THE SCREEN THE DEPLOYMENT ACTUALLY SERVES.
 *
 * ⚠️ THIS IS THE ONLY SUITE THAT MOUNTS THE LIVE SURFACE, AND IT EXISTS BECAUSE
 * EVERYTHING ELSE MOUNTS A GROUND. `Ground` and every app's own hand `Shell` the
 * manifest's screens unrewritten and the app's own route; the deployment rewrites
 * every screen into `/<app>/…` and has to hand the shell an address in that same
 * space. When it did not, the shell could not find the screen it was DRAWING —
 * so the page had no title, no nav row, no foot and no sky, and the world fell
 * through to the product's default ground. Every suite stayed green, every
 * photograph looked right, and the fault reached a person's phone.
 *
 * ⚠️ AN AMBIENCE IS THE ONE PART OF THE INTERFACE WITH NOTHING TO ASSERT. No
 * text, no box, no control — so a world that resolved to `none` reads exactly
 * like a world that is quiet, and a screen whose sky was never chosen reads
 * exactly like a screen that chose `plain`. That is why these assertions are
 * about PIXELS as well as properties: a `--world-flare` holding a real gradient
 * still paints nothing if its layer has no box or sits behind an opaque parent,
 * and a property-only check would have passed the very bug this was written for.
 *
 * ⚠️ AND IT IS THE REAL MANIFEST, NOT A FIXTURE. What is being checked is that a
 * product's own declarations — `hue`, and a screen's `sky` — survive the whole
 * distance from the manifest to a painted pixel. A fixture would prove the
 * mechanism works for a fixture.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, DESK, mounted, stylesheet, worldOf } from "@engine/design/measuring";
import { INVENTORY } from "@engine/inventory";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "product.mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

/**
 * ⚠️ THE ADDRESSES A BROWSER ACTUALLY HOLDS, WHICH IS THE HALF THAT BROKE. The
 * bare root is where a person with one product lands and is the one address that
 * is not the screen's own route — so it goes first, and every screen naming a
 * sky follows. A screen's world is seeded on its own identity, so each of these
 * is a different world and any one of them can be the invisible one.
 */
const LANDS = [
  { path: "/", sky: (INVENTORY.screens ?? []).find((s) => s.route === "/")?.sky },
  ...(INVENTORY.screens ?? [])
    .filter((s) => s.sky && s.sky !== "plain" && s.route !== "/")
    .map((s) => ({ path: `/${INVENTORY.id}${s.route}`, sky: s.sky })),
].filter((one): one is { path: string; sky: string } => !!one.sky);

describe("the world a person actually opens", () => {
  it("has screens to check at all", () => {
    expect(LANDS.length, "no screen in OneInventory names a sky, so this suite checks nothing")
      .toBeGreaterThan(2);
  });

  for (const { path, sky } of LANDS) {
    it(`draws the sky the manifest names, at ${path}`, async () => {
      const world = await worldOf(browser, { code, route: path }, css, PHONE);

      /*
        ⚠️ THE SHELL FOUND THE SCREEN, WHICH IS THE ROOT OF ALL FOUR SYMPTOMS. A
        missing `data-sky` is not "the ambience is off" — it is the shell unable
        to say which screen it is on, so the title, the nav row and the foot are
        wrong in the same breath.
      */
      expect(world.named, `${path}: the shell found no screen for this address, `
        + `so nothing chose a sky`).toBe(true);
      expect(world.sky, `${path} draws "${world.sky}" and the manifest says "${sky}"`).toBe(sky);
      expect(world.ground, `${path}: the ground resolved to nothing`).not.toBe("none");
    }, 90_000);
  }

  /*
    ⚠️ AND A SOURCE A FAMILY DECLARES IS VISIBLE — ON EVERY SEED, WHICH IS THE
    ASSERTION NOTHING HAD. A family places its light from a seed, and a seed that
    put the source past the flare's steep mask produced a screen with every
    property resolving correctly and no light on it: the gradient was real, the
    element had a box, the background-image was set, and the page was black. The
    only way to see a light is to take it away and check the picture changed.

    ⚠️ AND MOST FAMILIES DECLARE NONE, WHICH IS NOT A FAILURE. `glow` and `etch`
    are a haze in the ground rather than a source on its own layer — so the
    branch here is the pairing itself: a family that declares a source has to
    show it, and one that does not still has to have a ground. Asserting a flare
    on every world would make four quiet families fail for being quiet.
  */
  for (const { path } of LANDS) {
    it(`puts its light on the screen at ${path}, not only in the tokens`, async () => {
      const world = await worldOf(browser, { code, route: path }, css, PHONE);
      if (world.flare === "none") {
        expect(world.lit.on, `${path}: a [data-flare] element for a family with no source`)
          .toBe(false);
        expect(world.ground, `${path}: no source AND no ground is a world that is not there`)
          .not.toBe("none");
        return;
      }
      expect(world.lit.on, `${path}: a source is declared and no [data-flare] element carries it`)
        .toBe(true);
      expect(world.lit.area, `${path}: the flare has no box`).toBeGreaterThan(PHONE.width * 200);
      expect(world.visible, `${path}: suppressing the source changes nothing on the screen — `
        + `the light is drawn and masked away, and every token reads correctly`)
        .toBeGreaterThan(0.02);
    }, 90_000);
  }

  /*
    ⚠️ THE PRODUCT'S COLOUR REACHES THE PAGE, AND `--brand` IS WHERE. Every family
    reads its `lit` slot from it, so a hue that stops here is a world drawn in the
    deployment's own neutral — which is a correct-looking screen of the wrong
    product.
  */
  it("paints the product's own colour, not the deployment's floor", async () => {
    const world = await worldOf(browser, { code, route: "/" }, css, PHONE);
    expect(world.brand.replace(/\s/g, ""),
      `--brand is "${world.brand}" and the manifest declares "${INVENTORY.hue}"`)
      .toBe((INVENTORY.hue ?? "").replace(/\s/g, ""));
    expect(world.wash, "a family publishing a wash left `data-wash` unset").toBe(true);
  }, 90_000);

  /* ⚠️ AND AT A DESK TOO, because the ground is sized in viewport units and a
     layer that lights a phone can be a stripe on a monitor. */
  it("still lights the page at a desk", async () => {
    const world = await worldOf(browser, { code, route: "/" }, css, DESK);
    expect(world.named).toBe(true);
    expect(world.visible, "no light at a desk width").toBeGreaterThan(0.02);
  }, 90_000);
});
