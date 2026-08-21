/**
 * THE FRAME, MEASURED — every screen inside the chrome a product cannot opt out
 * of.
 *
 * ⚠️ THE TWO APP SWEEPS MEASURE A SCREEN ON ITS OWN, WHICH LEAVES OUT THE HALF
 * THAT IS ALWAYS THERE. `Shell` picks the world and `Page` mounts it: the scene,
 * the grain, the vignette, the hem, the nav, the crown and the room reserved for
 * the island. A screen that fits at 390 on its own can still be pushed sideways
 * by the chrome around it, and until this suite existed nothing looked.
 *
 * ⚠️ `Ground` IS WHAT THE DEPLOYMENT ACTUALLY MOUNTS, so this is the real
 * arrangement rather than a fixture of one. It is the same `Shell` call
 * `centre/Product.tsx` makes for a live product, with a real manifest.
 *
 * ⚠️ AND IT IS MOUNTED RATHER THAN RENDERED TO A STRING. A sub-page hands its
 * name, its way back and its actions to the shell's crown from a layout effect,
 * and a static render runs no effects — so the crown, which is the one bar on
 * every screen, would be measured on none of them.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESK, PHONE, geometryOf, mounted, stylesheet, tooSmall } from "@engine/design/measuring";
import { HELLO } from "@engine/hello";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "ground.mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

const ROUTES = HELLO.screens.map((s) => s.route);

const at = (route: string, viewport: { width: number; height: number }) =>
  geometryOf(browser, { code, route }, css, viewport);

describe("a screen inside the frame", () => {
  for (const route of ROUTES) {
    for (const [name, viewport] of [["a phone", PHONE], ["a desk", DESK]] as const) {
      it(`does not push the page sideways on ${name}: ${route}`, async () => {
        const seen = await at(route, viewport);
        expect(seen.worst, `${route}: <${seen.worst?.tag}> reaches ${seen.worst?.right}px `
          + `("${seen.worst?.text}") past a ${viewport.width}px viewport`).toBeNull();
        expect(seen.spill, `${route} scrolls ${seen.spill}px sideways`).toBe(0);
      }, 30_000);
    }
  }

  /* ⚠️ THE NAV IS THE ONE EVERY SCREEN SHARES, so a destination too small to hit
     is five destinations too small to hit — and it is the control somebody
     presses more often than anything a product declares. */
  it("gives every control in the chrome a box a finger can hit", async () => {
    const seen = await at(ROUTES[0] ?? "/", PHONE);
    const small = tooSmall(seen.targets);
    expect(small, small.map((t) => `"${t.text}" is ${t.height}px tall`).join(", ")).toEqual([]);
  }, 30_000);
});
