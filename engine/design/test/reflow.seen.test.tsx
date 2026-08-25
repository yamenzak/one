/**
 * A BLOCK REFLOWS BY ITS OWN BOX, MEASURED WITH THE SCREEN HELD STILL.
 *
 * ⚠️ THE FIXED VIEWPORT IS THE WHOLE ASSERTION, AND IT IS WHY THIS COULD NOT BE
 * A STATIC CHECK. A breakpoint and a container query are indistinguishable in
 * every reading that varies the window: both collapse a list on a phone and open
 * it on a desk, so a sweep at two viewport widths reports success either way.
 * Held at ONE width and given two boxes, only a container query can answer
 * differently — a breakpoint says "wide" for both.
 *
 * ⚠️ AND THE FAULT IS NOT HYPOTHETICAL. `Listing` collapsed on `md:`, which is
 * correct while a list is always the width of the page and wrong the moment one
 * sits in a cell of a board: on a 1440px monitor the viewport says wide, so four
 * columns are drawn into 300 pixels and every one of them is a word per line.
 * The reverse costs as much — a list given the whole of a 700px tablet stays a
 * phone list, because the viewport is under the breakpoint.
 *
 * ⚠️ WHAT IS READ IS WHETHER A PART WAS LAID OUT, NEVER WHETHER IT IS THERE.
 * Both halves of a collapse are always in the markup — one is `display:none` —
 * so a check built on `querySelector` finds them at every width and passes over
 * a component that never reflowed at all.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Listing, type Col } from "../src/index.js";
import { html, reflowOf, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
beforeAll(async () => { css = stylesheet(); browser = await chromium.launch(); }, 120_000);
afterAll(async () => { await browser?.close(); });

/* ------------------------------------------------------------- the block --- */

interface Row { readonly id: string; readonly name: string; readonly place: string; readonly count: number }

const ROWS: readonly Row[] = [
  { id: "a", name: "Isopropyl alcohol 99%", place: "Bay 4 · shelf 2", count: 18 },
  { id: "b", name: "Nitrile gloves, medium", place: "Bay 1 · shelf 1", count: 240 },
  { id: "c", name: "Polypropylene sheet 3mm", place: "Rack C", count: 6 },
];

const COLS: readonly Col<Row>[] = [
  { id: "name", label: "What it is", cell: (r) => r.name },
  { id: "place", label: "Where it is", cell: (r) => r.place },
  { id: "count", label: "How many", numeric: true, cell: (r) => String(r.count) },
];

const LIST = html(
  <Listing
    of={{ status: "ready", data: ROWS }}
    cols={COLS}
    rowKey={(r) => r.id}
    label="What is on the shelf"
    asRow={(r) => ({ name: r.name, under: r.place })}
  />,
);

/**
 * ⚠️ ONE VIEWPORT, WIDE ENOUGH THAT EVERY BREAKPOINT IN THE SYSTEM IS SATISFIED.
 * If any of the readings below still depends on the window, this width is the
 * one that makes it say "wide" — so a failure here is a viewport rule surviving
 * rather than a threshold that needs adjusting.
 */
const DESK = { width: 1440, height: 900 } as const;

/** Narrow enough to be a cell of a board; wide enough to be a page. */
const BOXES = [320, 400, 900] as const;

describe("a list decides by its own box, on one unchanging screen", () => {
  it("draws rows in a narrow box and columns in a wide one", async () => {
    const seen = await reflowOf(browser, LIST, css, BOXES, DESK);
    const at = (width: number) => seen.find((r) => r.at === width);

    for (const width of [320, 400] as const) {
      const one = at(width);
      expect(one?.shown, `at ${width}px the list should be rows — a table of three `
        + `columns in ${width} pixels is a word per line`).toEqual(["rows"]);
    }

    expect(at(900)?.shown, "at 900px there is room for the columns, and the rows "
      + "should have stood down rather than being drawn twice").toEqual(["columns"]);
  }, 60_000);

  /*
    ⚠️ THE HEIGHT IS THE SECOND HALF, because "which part is displayed" would
    still pass if both parts were laid out on top of each other. A list that
    genuinely reflowed is a different height in a box half the size.
  */
  it("comes out a different height, which is what reflowing means", async () => {
    const seen = await reflowOf(browser, LIST, css, BOXES, DESK);
    const narrow = seen.find((r) => r.at === 320)?.height ?? 0;
    const wide = seen.find((r) => r.at === 900)?.height ?? 0;
    expect(narrow, "the list measured no height at all, so nothing was drawn").toBeGreaterThan(0);
    expect(wide, "the same list is the same height in a box a third the size — "
      + "which is what a viewport rule does").not.toBe(narrow);
  }, 60_000);

  /*
    ⚠️ AND THE MIDDLE READING IS THE ONE A BREAKPOINT GETS WRONG. 400px is under
    every container threshold and over none of the viewport's, so a `md:` rule at
    this desk width draws columns and a container rule draws rows. It is the
    single measurement that separates the two mechanisms.
  */
  it("is still rows at 400px, where a viewport rule would already be columns", async () => {
    const [narrow] = await reflowOf(browser, LIST, css, [400], DESK);
    expect(narrow?.shown, "400px inside a 1440px window: the viewport says wide and "
      + "the box does not, and the box is the one that decides")
      .toEqual(["rows"]);
  }, 60_000);
});
