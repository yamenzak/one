/**
 * EVERY SCREEN THIS PRODUCT HAS, MEASURED IN A BROWSER.
 *
 * ⚠️ THE DESIGN SYSTEM'S OWN GEOMETRY SUITE MEASURES SPECIMENS, AND A SPECIMEN
 * IS AN ARRANGEMENT BUILT TO PASS THE RULE. It proves `Group` insets its rows
 * once and `Stack` spaces its blocks by the scale; it cannot say whether the
 * screen somebody opens on a phone pushes the page sideways, because no product
 * screen is in it. This is that sweep — the real components, the real ground
 * data, the stylesheet that actually ships.
 *
 * ⚠️ AND WHAT IS ASSERTED IS WHAT A STATIC CHECK CANNOT SEE. Not "which class
 * was written" — every other guard in this repository reads source — but the
 * pixels a stylesheet, a flex container and four reasonable components produced
 * between them. Overflow and a control too small to hit are both computed
 * values, and both are invisible until somebody complains.
 *
 * ⚠️ AT TWO WIDTHS, BECAUSE THEY FAIL DIFFERENTLY. A phone finds the row that
 * wraps and the table that will not fit; a desk finds the fixed width nobody
 * noticed and the layout that was only ever looked at small.
 *
 * ⚠️ THE MEASURING IS THE PACKAGE'S AND THE ROUTES ARE THE PRODUCT'S. A copy of
 * `geometryOf` here would be a second answer to what counts as off-canvas, and
 * the exemptions are the whole subtlety — see there.
 *
 * ⚠️ AND IN THE FRAME, MOUNTED FOR REAL. A screen measured on its own leaves out
 * the half a product cannot opt out of — the crown, the nav, the room reserved
 * for the island — and a screen rendered to a STRING leaves out everything an
 * effect puts there, which for a sub-page is its entire crown.
 *
 * ⚠️ AND IT WALKS WHAT THE PRODUCT DRAWS, WHICH IS WHY IT CAME BACK WITH THE
 * SCREENS RATHER THAN SURVIVING THEM. This suite once mounted a hand-written
 * component per route while the app drew a declaration of the same name, so a
 * declared body was measured by nothing at all and every assertion was about a
 * file that shared a screen's name. `InventoryGround` renders the declared body
 * through the renderer now, and the routes come off the manifest.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DESK, ENOUGH_TO_RANK, FINGER, PHONE, SCALE_CEILING,
  contrastOf, geometryOf, isLarge, mixedHeads, mounted, outOfGutter, outOfRhythm,
  sayHeads, sayTwins, strayTwins, scaleOf,
  stylesheet, tooSmall, unreadable,
} from "@engine/design/measuring";
import { INVENTORY_ROUTES, INVENTORY_SURFACES } from "../src/screens/index.js";

/*
  ⚠️ THE TRAYS ARE SWEPT WITH THE SCREENS, because a drawer is not less of a
  surface for being reachable from a row instead of an address. Walking the
  manifest's routes alone left every non-route surface drawn by nothing and
  measured by nothing — its first contact with a real viewport would have been a
  customer's, on a phone, holding a box.
*/
const EVERY = [...INVENTORY_ROUTES, ...INVENTORY_SURFACES.map((id) => `surface:${id}`)];

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "..", "shots", "mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

const at = (route: string, viewport: { width: number; height: number }) =>
  geometryOf(browser, { code, route }, css, viewport);

describe("every screen, at a phone width", () => {
  for (const route of EVERY) {
    it(`does not push the page sideways: ${route}`, async () => {
      const seen = await at(route, PHONE);
      expect(seen.worst, `${route}: <${seen.worst?.tag}> reaches ${seen.worst?.right}px `
        + `("${seen.worst?.text}") past a ${PHONE.width}px viewport`).toBeNull();
      expect(seen.spill, `${route} scrolls ${seen.spill}px sideways`).toBe(0);
    }, 30_000);
  }
});

describe("every screen, at a desk width", () => {
  for (const route of EVERY) {
    it(`does not push the page sideways: ${route}`, async () => {
      const seen = await at(route, DESK);
      expect(seen.worst, `${route}: <${seen.worst?.tag}> reaches ${seen.worst?.right}px `
        + `("${seen.worst?.text}") past a ${DESK.width}px viewport`).toBeNull();
      expect(seen.spill, `${route} scrolls ${seen.spill}px sideways`).toBe(0);
    }, 30_000);
  }
});

/*
  ⚠️ THIS IS THE ONE THAT FOUND SOMETHING. `ROW.tap` calls 44px non-negotiable
  and every row obeyed it; the library's controls did not — 40px, 36 above the
  breakpoint, 32 for `sm` — so the rule the tokens state was true of the rows and
  false of the things people press, in a product used one-handed while the other
  hand holds a box. The floor is one rule in `one-space/src/styles.css`; this is
  what says it is still there and still reaches every control.
*/
describe("every control somebody has to hit", () => {
  for (const route of EVERY) {
    it(`is big enough for a finger: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const small = tooSmall(seen.targets);
      expect(small, `${route}: ${small.map((t) => `"${t.text}" is ${t.height}px tall`).join(", ")}`)
        .toEqual([]);
    }, 30_000);
  }
});

/*
  ⚠️ AND THE TYPE IS A SCALE, WHICH IS THE ONE THING ABOUT A SCREEN RATHER THAN
  ABOUT AN ELEMENT ON IT. Every check above finds one thing in the wrong place;
  this one asks whether the page was designed. A screen naming eight roles breaks
  no rule anywhere — `motion` refuses a screen that writes `text-2xl` and has
  nothing to say about one that reaches for a different role per block — and the
  result is a page where nothing is emphatic because everything is.
*/
describe("the type on every screen", () => {
  for (const route of EVERY) {
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
  ⚠️ AND EVERY WORD ON EVERY SCREEN CAN BE READ, IN BOTH THEMES. This is the
  third pixel fact after spacing and type, and it is the one a palette cannot
  promise: a token says `--warning` on `--surface`, and what a reader gets is
  that pair after a `color-mix`, a theme and a workspace's own brand have each
  had a turn.

  ⚠️ IT FOUND SIXTY-ONE. The worst was the library's amber used as INK on a
  card — **1.94:1**, on the sentence "It may be flammable liquid, serious eye
  damage" — and the widest was `--muted` in light at 3.46, which is every second
  line, every hint and every caption in the product, on every screen. Both had
  shipped since the palette was written, and neither is visible to anybody who
  works in dark.

  ⚠️ BOTH THEMES, SEPARATELY, BECAUSE THEY FAIL DIFFERENTLY AND ONE OF THEM IS
  THE ONE NOBODY LOOKS AT. Dark had one fault class; light had four.
*/
describe("everything on a screen can be read", () => {
  for (const route of EVERY) {
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

/* --------------------------------------------------------------- controls --- */

/*
  ⚠️ THE RULES ARE SHOWN FAILING. Both are arrangements a screen could plausibly
  arrive at — a fixed width somebody typed while looking at a desk, and a control
  sized by its own text — and a sweep that passed them would be a sweep measuring
  nothing.
*/
describe("the measurements bite", () => {
  it("sees a fixed width that does not fit a phone", async () => {
    const seen = await geometryOf(
      browser, <div style={{ width: 900, height: 20, background: "#333" }}>Too wide</div>,
      css, PHONE);
    expect(seen.worst).not.toBeNull();
    expect(seen.spill).toBeGreaterThan(0);
  }, 30_000);

  it("sees a control too small to hit", async () => {
    const seen = await geometryOf(
      browser, <span role="button" style={{ display: "block", height: 20, width: 20 }}>x</span>,
      css, PHONE);
    expect(seen.targets.filter((t) => t.height < FINGER)).toHaveLength(1);
  }, 30_000);

  /* ⚠️ THE SCALE CHECK SHOWN FAILING, BOTH WAYS. A page of eight sizes and a
     page where the largest type is the size of everything else are the two
     shapes the rule is about, and a reading that passed either would be a
     reading of nothing. */
  it("sees a page with no scale", async () => {
    const seen = await geometryOf(
      browser,
      <div>{[11, 13, 15, 17, 19, 21, 23, 25].map((px) => (
        <p key={px} style={{ fontSize: px }}>A line</p>
      ))}</div>,
      css, PHONE,
    );
    expect(scaleOf(seen.type).sizes.length).toBeGreaterThan(SCALE_CEILING);
  }, 30_000);

  it("sees a page with no top", async () => {
    const seen = await geometryOf(
      browser,
      <div>{["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"].map((word) => (
        <p key={word} style={{ fontSize: 16 }}>{word}</p>
      ))}</div>,
      css, PHONE,
    );
    const scale = scaleOf(seen.type);
    expect(scale.pieces).toBeGreaterThanOrEqual(ENOUGH_TO_RANK);
    expect(scale.sizes[0]).toBe(scale.commonest);
  }, 30_000);

  /* ⚠️ AND THE CONTRAST READING SHOWN FAILING, on a pair nobody would ship and
     every reading here would have to catch. */
  it("sees text nobody can read", async () => {
    const seen = await geometryOf(
      browser,
      <div style={{ background: "#f4f4f4", color: "#b8b8b8", padding: 8 }}>Barely there</div>,
      css, PHONE,
    );
    expect(unreadable(seen.ink)).toHaveLength(1);
  }, 30_000);

  /* ⚠️ AND IT DOES NOT FIRE ON WIDE CONTENT THAT SCROLLS ITSELF, which is the
     correct answer for a table and the one exemption the rule allows. */
  it("leaves a container that scrolls its own content alone", async () => {
    const seen = await geometryOf(
      browser,
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <div style={{ width: 900, height: 20, background: "#333" }}>Wide, and it says so</div>
      </div>,
      css, PHONE,
    );
    expect(seen.worst).toBeNull();
    expect(seen.spill).toBe(0);
  }, 30_000);
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
  for (const route of EVERY) {
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
describe("every name a screen puts in the document", () => {
  for (const route of EVERY) {
    it(`calls each of them one thing: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const stray = strayTwins(seen.twins);
      expect(stray, `${route}: ${sayTwins(stray)}`).toEqual([]);
    }, 30_000);
  }
});

/*
  ⚠️ AND A COLUMN OF HEADINGS AGREES WITH ITSELF. Three cards in a stack where
  ONE has a line under its name reads as "this is the important one", for a
  reason nobody chose — and every heading in it is individually right, which is
  why no component can catch it and why it survived a whole redesign. See
  `Geometry.heads` for the rule and `mixedHeads` for why three rather than two.
*/
describe("the headings on every screen", () => {
  for (const route of EVERY) {
    it(`agree about whether they carry a line: ${route}`, async () => {
      const seen = await at(route, PHONE);
      const mixed = mixedHeads(seen.heads);
      expect(mixed, `${route}: ${sayHeads(mixed)}`).toEqual([]);
    }, 30_000);
  }
});

/**
 * ONE COLUMN, ONE GUTTER, ONE RHYTHM — see `Geometry.column`.
 *
 * ⚠️ NO COMPONENT CAN ASK THIS, WHICH IS WHY IT IS HERE AND NOT A CLASS CHECK.
 * A screen is a hero, a narrowing, its blocks and its way out, each drawn by
 * something that knows only its own children — so the space BETWEEN them is
 * nobody's, and every part can be right while the column reads as two rhythms.
 * That is what it did: a stacked body opened a second `data-blocks` container
 * inside the frame's, and a screen's gaps changed part way down for no reason a
 * reader could see.
 */
describe("the column on every screen", () => {
  for (const route of EVERY) {
    it(`sits at one gutter: ${route}`, async () => {
      const odd = outOfGutter((await at(route, PHONE)).column, PHONE.width);
      expect(odd, `${route}: ${odd.map((o) => `[${o.left}..${o.right}] "${o.text}"`).join(" · ")}`)
        .toEqual([]);
    }, 30_000);

    it(`keeps one rhythm down it: ${route}`, async () => {
      const gaps = outOfRhythm((await at(route, PHONE)).column);
      expect(gaps, `${route}: gaps of ${gaps.join("px, ")}px in one column`).toEqual([]);
    }, 30_000);
  }
});
