/**
 * THE CHROME, PHOTOGRAPHED, ON REAL SCREENS IN A REAL BROWSER.
 *
 * ⚠️ THE CROWN AND THE DOCK ARE THE ONE THING EVERY SCREEN SHARES AND THE ONE
 * THING NO SCREEN DRAWS, so nothing that mounts a screen bare can see them —
 * and they are what a person judges the product by before reading a word. This
 * sweep exists so a change to either can be LOOKED AT rather than reasoned
 * about, which is the only way anybody has ever caught a chrome that reads as a
 * different material from the page under it.
 *
 * ⚠️ IT IS A `.seen.` SUITE, SO IT IS OUTSIDE THE GATE. Launching Chromium to
 * take four pictures answers no question a deploy is waiting on. It runs in
 * `pnpm engine:seen`, where somebody is looking at the screens anyway.
 *
 * ⚠️ AND IT ASSERTS A FLOOR RATHER THAN NOTHING. A sweep that only writes files
 * passes just as well when every page renders blank, which is the failure it
 * would be used to rule out. A blank page encodes to a few hundred bytes; a real
 * screen is several thousand.
 */

import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, mounted, shoot, stylesheet } from "@engine/design/measuring";

const OUT = join(import.meta.dirname, "..", "shot-out");
/* ⚠️ TALLER THAN THE MEASURING USES. 844 is the real device and the right
   number for asking whether something fits; a picture cut off at the fold shows
   the crown and not what it sits over. */
const TALL = { width: PHONE.width, height: 1_000 } as const;

/* ⚠️ ONE WITH A DOCK AND ONE WITH AN ACT, because a screen has one or the other
   and the two feet are what this is for — plus WHERE A SUPPORTING FIGURE LEADS,
   because a tile that opens something is only half a claim until the other half
   is a picture. A destination photographed alongside the figure is how "the
   count and the list behind it are one declaration" stops being a sentence. */
const ON = ["/", "/reports", "/pinned"] as const;

let browser: Browser;
let code: string;
let css: string;

beforeAll(async () => {
  browser = await chromium.launch();
  code = await mounted(join(import.meta.dirname, "..", "src", "screens", "board-entry.tsx"));
  css = stylesheet();
  mkdirSync(OUT, { recursive: true });
}, 120_000);
afterAll(async () => { await browser?.close(); });

describe("the chrome, photographed", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const route of ON) {
      it(`${theme}: ${route}`, async () => {
        const to = join(OUT, `${theme}-${route === "/" ? "home" : route.slice(1)}.png`);
        await shoot(browser, { code, route }, css, TALL, theme, to);
        expect(statSync(to).size, `${to} is blank`).toBeGreaterThan(5_000);
      }, 60_000);
    }
  }
});
