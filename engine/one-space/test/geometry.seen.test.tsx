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
import {
  DESK, ENOUGH_TO_RANK, PHONE, SCALE_CEILING,
  contrastOf, geometryOf, isLarge, mounted, sayTwins, scaleOf,
  stylesheet, tooSmall, unreadable,
} from "@engine/design/measuring";
import { GROUND } from "@engine/ground";

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

const ROUTES = GROUND.screens.map((s) => s.route);

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

/*
  ⚠️ AND THE TYPE ON IT IS A SCALE RATHER THAN AN ACCRETION. Every other check in
  this file is about one element being in the wrong place; this one is about the
  screen as a whole, and it is the one thing that separates a page somebody
  designed from a page assembled out of locally defensible decisions. Nothing
  else can ask it: `motion` refuses a screen that writes its own `text-2xl`, and
  a screen that names eight ROLES breaks no rule at all.

  ⚠️ AND A TOP, WHICH IS THE OTHER HALF. A screen where the largest type is the
  size everything else is has no hierarchy — the reader's eye has nowhere to land
  and every element is equally important, which is the same as none being.
*/
describe("the type on a screen", () => {
  for (const route of ROUTES) {
    it(`is a scale with a top: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const scale = scaleOf(seen.type);
      expect(scale.sizes.length,
        `${route} sets ${scale.sizes.length} sizes — ${scale.sizes.join(", ")}px`)
        .toBeLessThanOrEqual(SCALE_CEILING);
      /* ⚠️ ONLY WHERE THERE IS A BODY TO OUTRANK — see `ENOUGH_TO_RANK`. */
      if (scale.pieces >= ENOUGH_TO_RANK) {
        expect(scale.sizes[0] ?? 0,
          `${route}'s largest type is ${scale.sizes[0]}px and most of its `
          + `${scale.pieces} pieces are ${scale.commonest}px — nothing outranks the body`)
          .toBeGreaterThan(scale.commonest);
      }
    }, 30_000);
  }
});

/*
  ⚠️ AND EVERY WORD IN THE FRAME CAN BE READ, IN BOTH THEMES. The crown, the hem
  and the bar are the half of every screen a product cannot opt out of, so a
  shortfall there is a shortfall on every screen in every product at once.
*/
describe("everything in the frame can be read", () => {
  for (const route of ROUTES) {
    for (const theme of ["dark", "light"] as const) {
      it(`in ${theme}: ${route}`, async () => {
        const seen = await geometryOf(browser, { code, route }, css, PHONE, theme);
        const short = unreadable(seen.ink);
        expect(short, short.map((one) =>
          `"${one.text}" is ${contrastOf(one)?.toFixed(2)}:1 at ${one.px}px/${one.weight}`
          + ` (needs ${isLarge(one.px, one.weight) ? 3 : 4.5}) — ${one.ink} on ${one.on}`)
          .join("; ")).toEqual([]);
      }, 30_000);
    }
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
  for (const route of ROUTES) {
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
describe("every name the frame puts in the document", () => {
  for (const route of ROUTES) {
    it(`calls each of them one thing: ${route}`, async () => {
      const seen = await at(route, PHONE);
      expect(seen.twins, `${route}: ${sayTwins(seen.twins)}`).toEqual([]);
    }, 30_000);
  }
});
