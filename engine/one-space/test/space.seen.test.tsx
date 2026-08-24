/**
 * THE SPACE'S OWN THIRTY-NINE SCREENS, MEASURED IN A BROWSER.
 *
 * ⚠️ THE SWEEP BESIDE THIS MEASURES THE GROUND'S TEN ROUTES, AND THE GROUND IS A
 * PRODUCT. What that proves is that the chrome a product wears is sound; what it
 * has never said anything about is the twenty screens in the operator console
 * and the nineteen in the account centre — the surfaces with the most controls
 * per page in this deployment, drawn by sixty-two files, measured by nothing.
 *
 * ⚠️ THE LIST IS DERIVED, NOT TYPED. `OF_CONSOLE`, `OF_AI` and
 * `OF_WORKSPACE_SCREEN` are the same constants the router dispatches on, and
 * `pathOf` is the same function that builds every link — so a screen added
 * tomorrow is measured tomorrow, and a screen that cannot be addressed fails
 * here rather than being quietly absent from a hand-kept list.
 *
 * ⚠️ AND WHAT IS MEASURED IS THE SCREEN AS IT ARRIVES — see `space.mount.tsx`
 * for exactly what that covers and what it does not. Every one of these draws
 * its declared skeleton, which is what an operator sees on every cold open, and
 * is the state this deployment has photographs of and had no measurements of.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DESK, ENOUGH_TO_RANK, PHONE, SCALE_CEILING,
  contrastOf, geometryOf, isLarge, mounted, sayTwins, strayTwins, scaleOf,
  stylesheet, tooSmall, unreadable,
} from "@engine/design/measuring";
import {
  OF_AI, OF_CONSOLE, OF_WORKSPACE_SCREEN, pathOf, type Where,
} from "../src/space/where.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "space.mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

/**
 * ⚠️ A WORKSPACE SCREEN NEEDS A SLUG AND A CONSOLE ONE DOES NOT, which is the
 * whole difference between the two halves of the space: one is about a workspace
 * somebody holds and the other is about the deployment. The slug is a fixture
 * because no workspace exists here — what is under test is the screen's
 * geometry, not its content.
 */
const WHERE: readonly Where[] = [
  { at: "console" },
  ...OF_CONSOLE.map((at) => ({ at }) as Where),
  ...OF_AI.map((at) => ({ at }) as Where),
  { at: "you" }, { at: "inbox" }, { at: "told" }, { at: "data" },
  { at: "formats" }, { at: "looks" }, { at: "agreed" }, { at: "workspaces" },
  /* ⚠️ AND THE ID FIXTURE IS NOT SPARE — `tried` addresses ONE invitation, so
     without it `pathOf` builds `/tried/undefined` and the sweep measures a
     screen looking up a record called "undefined". It passed, which is the
     point: a route built out of a missing field is still a route. */
  ...OF_WORKSPACE_SCREEN.map((at) =>
    ({ at, slug: "a-workspace", id: "an-invitation" }) as Where),
];

const ROUTES = WHERE.map(pathOf);

const at = (route: string, viewport: { width: number; height: number },
  theme: "dark" | "light" = "dark") =>
  geometryOf(browser, { code, route }, css, viewport, theme);

describe("every screen the space draws itself", () => {
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
});

describe("every control the space asks for", () => {
  for (const route of ROUTES) {
    it(`is big enough for a finger: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const small = tooSmall(seen.targets);
      expect(small, `${route}: ${small.map((t) => `"${t.text}" is ${t.height}px tall`).join(", ")}`)
        .toEqual([]);
    }, 30_000);
  }
});

describe("the type the space sets", () => {
  for (const route of ROUTES) {
    it(`is a scale with a top: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const scale = scaleOf(seen.type);
      expect(scale.sizes.length,
        `${route} sets ${scale.sizes.length} sizes — ${scale.sizes.join(", ")}px`)
        .toBeLessThanOrEqual(SCALE_CEILING);
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
  ⚠️ AND NOTHING IN THE CROWN IS CUT OFF. Truncating a row is often right — a
  workspace name has to end somewhere — and never right in the crown, where the
  words are the only thing saying which of thirty-nine screens this is. An
  operator arriving at "Payment and cred…" has to open it to find out what it
  was. Body text is deliberately not asked about here for the same reason the
  frame sweep gives: a list truncating a value is the layout doing its job.
*/
describe("what the space's crown says", () => {
  for (const route of ROUTES) {
    it(`says all of it: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const chrome = seen.cut.filter((one) => one.where !== "");
      expect(chrome, chrome.map((c) => `${route} — ${c.where}: "${c.text}" cut by ${c.by}px`)
        .join(", ")).toEqual([]);
    }, 30_000);
  }
});

describe("everything the space says can be read", () => {
  for (const route of ROUTES) {
    for (const theme of ["dark", "light"] as const) {
      it(`in ${theme}: ${route}`, async () => {
        const seen = await at(route, PHONE, theme);
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
  ⚠️ AND NO NAME IS USED TWICE. An `id` is HTML's one namespace: `getElementById`
  takes the first match and stops, and so does every `aria-labelledby`,
  `aria-controls` and `<label for>` resolved through it — so a duplicate hands a
  screen reader the wrong element for a control, on a page that photographs
  perfectly. It is also what a control wrapped in a second pressable comes out
  as, which is the fault that put this reading here (`Geometry.twins`).
*/
describe("every name the space puts in the document", () => {
  for (const route of ROUTES) {
    it(`calls each of them one thing: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const stray = strayTwins(seen.twins);
      expect(stray, `${route}: ${sayTwins(stray)}`).toEqual([]);
    }, 30_000);
  }
});
