/**
 * THE REFERENCE APP'S SCREENS, MEASURED IN A BROWSER — the same sweep, asked of
 * the app whose whole job is to be the ground.
 *
 * ⚠️ A GUARD THAT ASKS ONE PRODUCT THE QUESTION IS THE ONE THAT GETS WAIVED. The
 * measuring is `@engine/design/measuring`'s, so a third app is fifteen lines and
 * its own route list — and the day one of them is missing the sweep, that is a
 * thing somebody chose rather than a thing nobody thought of.
 *
 * ⚠️ AND HELLO IS WHERE A NEW SCREEN IS TRIED FIRST. A layout fault caught here
 * is caught before it is copied into a product; caught only in the product, it
 * is already in the reference somebody copies from.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESK, PHONE, geometryOf, stylesheet, tooSmall } from "@engine/design/measuring";
import { HELLO_ROUTES, HelloScreen } from "../src/screens/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

const at = (route: string, viewport: { width: number; height: number }) =>
  geometryOf(browser, <HelloScreen route={route} />, css, viewport);

describe("every screen, at both widths", () => {
  for (const route of HELLO_ROUTES) {
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
  for (const route of HELLO_ROUTES) {
    it(`is big enough for a finger: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const small = tooSmall(seen.targets);
      expect(small, `${route}: ${small.map((t) => `"${t.text}" is ${t.height}px tall`).join(", ")}`)
        .toEqual([]);
    }, 30_000);
  }
});
