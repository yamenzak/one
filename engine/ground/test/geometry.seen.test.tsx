/**
 * THE REFERENCE APP'S SCREENS, MEASURED IN A BROWSER — the same sweep, asked of
 * the app whose whole job is to be the ground.
 *
 * ⚠️ A GUARD THAT ASKS ONE PRODUCT THE QUESTION IS THE ONE THAT GETS WAIVED. The
 * measuring is `@engine/design/measuring`'s, so a third app is fifteen lines and
 * its own route list — and the day one of them is missing the sweep, that is a
 * thing somebody chose rather than a thing nobody thought of.
 *
 * ⚠️ AND GROUND IS WHERE A NEW SCREEN IS TRIED FIRST. A layout fault caught here
 * is caught before it is copied into a product; caught only in the product, it
 * is already in the reference somebody copies from.
 */

import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DESK, PHONE, geometryOf, mixedHeads, mounted, sayHeads, sayTwins, strayTwins, stylesheet, tooSmall,
} from "@engine/design/measuring";
import { GROUND_ROUTES } from "../src/screens/index.js";

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(import.meta.dirname, "..", "src", "screens", "board-entry.tsx"));
  browser = await chromium.launch();
}, 120_000);
afterAll(async () => { await browser?.close(); });

/**
 * ⚠️ THE BOARD, NOT THE COMPONENT — the same mount the photographs use, and the
 * reason is a fault this sweep could not see. It measured `GroundScreen`, which
 * hands every route to a hand-WRITTEN component; a screen ported to a
 * declaration is drawn by the renderer instead, so its layout was measured by
 * nothing at all. A declared body whose grid overflowed a phone passed sixty
 * green assertions, because the thing being measured was a file that shares its
 * name.
 *
 * ⚠️ AND IT MEASURES THE CHROME WITH IT, which is the other half. A screen that
 * fits at 390 by itself can still be pushed sideways by the crown, the dock and
 * the room reserved for the island — none of which is in a screen's own render.
 */
const at = (route: string, viewport: { width: number; height: number }) =>
  geometryOf(browser, { code, route }, css, viewport);

describe("every screen, at both widths", () => {
  for (const route of GROUND_ROUTES) {
    for (const [name, viewport] of [["a phone", PHONE], ["a desk", DESK]] as const) {
      it(`does not push the page sideways on ${name}: ${route}`, async () => {
        const seen = await at(route, viewport);
        expect(seen.worst, `${route}: <${seen.worst?.tag}> reaches ${seen.worst?.right}px `
          + `("${seen.worst?.text}") past a ${viewport.width}px viewport`).toBeNull();
        expect(seen.spill, `${route} scrolls ${seen.spill}px sideways`).toBe(0);
      }, 30_000);
    }
  }
});

describe("every control somebody has to hit", () => {
  for (const route of GROUND_ROUTES) {
    it(`is big enough for a finger: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const small = tooSmall(seen.targets);
      expect(small, `${route}: ${small.map((t) => `"${t.text}" is ${t.height}px tall`).join(", ")}`)
        .toEqual([]);
    }, 30_000);
  }
});

/*
  ⚠️ AND NOTHING IN THE CHROME IS CUT OFF. Truncation is often right — a product
  name in a row has to end somewhere — and never right in the island, where the
  words ARE what the press does. "Import 3 …" is a control nobody can act on with
  confidence and it looks entirely deliberate, so nothing anywhere reports it:
  the label is a string in a manifest, the button is the library's, and the
  ellipsis is the layout's own decision taken at 390 pixels.
*/
describe("what the chrome says", () => {
  for (const route of GROUND_ROUTES) {
    it(`says all of it: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const chrome = seen.cut.filter((one) => one.where !== "");
      expect(chrome, chrome.map((c) => `${c.where}: "${c.text}" cut by ${c.by}px`).join(", "))
        .toEqual([]);
    }, 30_000);
  }
});

/*
  ⚠️ AND NO NAME IS USED TWICE. An `id` is HTML's one namespace: `getElementById`
  takes the first match and stops, and so does every `aria-labelledby`,
  `aria-controls` and `<label for>` resolved through it — so a duplicate hands a
  screen reader the wrong element for a control, on a page that photographs
  perfectly. It is also what a control wrapped in a second pressable comes out
  as, which is the fault that put this reading here (`Geometry.twins`).
*/
describe("every name the ground puts in the document", () => {
  for (const route of GROUND_ROUTES) {
    it(`calls each of them one thing: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const stray = strayTwins(seen.twins);
      expect(stray, `${route}: ${sayTwins(stray)}`).toEqual([]);
    }, 30_000);
  }
});

/*
  ⚠️ AND A COLUMN OF HEADINGS AGREES WITH ITSELF — see `Geometry.heads`. It is
  asked of the ground as well as of the product because the ground is where a
  new screen is tried first: a mixed column caught here is caught before it is
  copied, and caught only in the product it is already in the reference.
*/
describe("the headings on every ground screen", () => {
  for (const route of GROUND_ROUTES) {
    it(`agree about whether they carry a line: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const mixed = mixedHeads(seen.heads);
      expect(mixed, `${route}: ${sayHeads(mixed)}`).toEqual([]);
    }, 30_000);
  }
});
