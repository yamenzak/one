/**
 * ONEINVENTORY'S SCREENS, HELD TO ITS MANIFEST.
 *
 * ⚠️ A DECLARED SCREEN THAT DRAWS NOTHING IS THE FAILURE THIS CATCHES, and it is
 * invisible without a check: `AppSurface` answers an unmounted route with an
 * honest notice, so a screen nobody built looks like a screen somebody has not
 * finished. Rendering every declared route and asserting it produced its own
 * heading is what makes "the product draws its screens" a fact rather than a
 * claim.
 *
 * ⚠️ AND THE ROUTES COME FROM THE MANIFEST. A test with its own list is a test
 * that passes while the manifest grows a screen nobody drew.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { ready } from "@engine/design";
import { describe, expect, it } from "vitest";
import { INVENTORY } from "../src/index.js";
import { INVENTORY_ROUTES, InventoryScreen, Scan, type Seen } from "../src/screens/index.js";
import { LINES, PLACES, EMPTY_PLACE } from "../src/screens/sample.js";

const html = (route: string) => renderToStaticMarkup(<InventoryScreen route={route} />);

describe("OneInventory draws every screen it declares", () => {
  it("names the same routes the manifest does", () => {
    expect([...INVENTORY_ROUTES].sort())
      .toEqual((INVENTORY.screens ?? []).map((s) => s.route).sort());
    expect(INVENTORY_ROUTES.length).toBeGreaterThan(3);
  });

  /*
    ⚠️ A SCREEN ABOUT ONE THING IS NAMED AFTER THAT THING, NOT AFTER ITSELF. The
    nav calls it "A product" because a nav cannot know which; the page calls it
    by the product's own name, because that is what somebody arriving is looking
    at. These are the two routes whose heading is their subject, named here with
    the word each must carry.
  */
  const SUBJECT: Readonly<Record<string, string>> = {
    "/thing": LINES[0]?.name ?? "",
    "/where": PLACES.find((p) => p.id === EMPTY_PLACE)?.name ?? "",
  };

  it("renders something for every declared route", () => {
    for (const route of INVENTORY_ROUTES) {
      /* ⚠️ NOT `length > 0` — an empty `<div>` passes that. A heading is what
         proves a screen drew rather than a wrapper. */
      const label = SUBJECT[route]
        ?? (INVENTORY.screens ?? []).find((s) => s.route === route)?.label
        ?? "";
      expect(html(route), route).toContain(label);
    }
  });

  it("falls back rather than rendering a blank", () => {
    expect(html("/not-a-route")).toContain("Stock");
  });
});

/**
 * WHAT THE STOCK LIST SAYS ABOUT A NUMBER.
 *
 * ⚠️ THE INK IS THE ONE CHANNEL A MONOCHROME INTERFACE HAS LEFT, so a line that
 * is out or under its level says so in the VALUE rather than in a chip beside
 * it. That is a decision no compiler can hold: the ink is an attribute on a
 * span, and dropping it renders a perfectly ordinary list in which nothing is
 * wrong with anything.
 */
describe("a line that is out or low says so", () => {
  const out = renderToStaticMarkup(<InventoryScreen route="/" />);

  it("marks the line that ran out as danger", () => {
    expect(LINES.some((l) => l.quantity === 0)).toBe(true);
    expect(out).toContain('data-ink="danger"');
  });

  it("marks a line under its level as a warning", () => {
    expect(LINES.some((l) => l.par !== undefined && l.quantity > 0 && l.quantity < l.par))
      .toBe(true);
    expect(out).toContain('data-ink="warning"');
  });

  /*
    ⚠️ AND A LINE NOBODY HAS TOUCHED SAYS SO IN WORDS. "Last seen" is the app
    admitting a number may be fiction — hiding staleness is how people stop
    believing a system — and it is said only where it is worth saying, so a
    suite that only checked it appeared would pass with it on every row.
  */
  it("says which lines have not been seen in a while, and only those", () => {
    expect(out.match(/not seen in a while/g)?.length).toBe(2);
  });
});

/**
 * THE TREE DESCENDS RATHER THAN INDENTING.
 *
 * ⚠️ SIX LEVELS OF INDENTATION IS 144px OF A 390px PHONE, which is why this
 * component draws one level at a time with a trail above it. What a render can
 * check is that the ROOT draws the top of the tree rather than every node —
 * eleven rows of a location list is the shape this design exists to refuse.
 */
describe("the location tree", () => {
  it("shows the top of the tree, not every place in it", () => {
    const out = renderToStaticMarkup(<InventoryScreen route="/" />);
    const site = PLACES.find((p) => p.of === null);
    expect(site).toBeDefined();
    expect(out).toContain(site?.name ?? "");

    /*
      ⚠️ ASSERTED ON THE LINE COUNTS RATHER THAN ON THE NAMES, and the first
      version of this check was wrong for exactly the reason worth writing down:
      a shelf's NAME is on the page whether or not the tree drew it, because
      every stock row says where it is. The count under a tree row is the only
      string a tree node has to itself.
    */
    const rows = PLACES.filter((p) => p.of !== null);
    expect(rows.length).toBeGreaterThan(5);
    /* ⚠️ THE WHOLE ELEMENT, NOT THE SUBSTRING. "112 lines" contains "12 lines",
       so a bare `toContain` reported the root's own count as a shelf's — a check
       finding a bug in itself before it found one in the code. */
    for (const below of rows) {
      expect(out, below.name).not.toContain(`>${below.lines} lines<`);
    }
    expect(out).toContain(`>${site?.lines} lines<`);
  });
});

/**
 * WHAT A SCAN TURNED OUT TO BE DECIDES THE WHOLE SCREEN.
 *
 * ⚠️ THREE OUTCOMES, THREE DIFFERENT ACTS, and the one that matters most is the
 * one nobody designs: a code this workspace has never seen. Answering it is what
 * teaches the catalogue, so a screen that treated it as a failure would make the
 * product's main gesture look broken on the day somebody starts.
 */
describe("the scan screen", () => {
  const seen = (of: Partial<Seen>): Seen => ({
    found: false, kind: "gtin", value: "05000112637922", ours: "",
    product: "", name: "", tracking: "", unit: "", pack: 1,
    lot: "", expiry: "", needs: "", ...of,
  });

  const drawn = (of: Seen | null) => renderToStaticMarkup(
    <Scan
      of={ready(of)}
      products={[{ id: "t-glove", label: "Nitrile gloves, blue" }]}
      onRead={() => undefined}
      onOpen={() => undefined}
      onPlace={() => undefined}
      onLearn={() => undefined}
      again={() => undefined}
    />,
  );

  it("asks what an unknown code is, rather than refusing it", () => {
    const out = drawn(seen({}));
    expect(out).toContain("What is this?");
    expect(out).toContain("Attach this code");
  });

  it("shows a known product and offers to open it", () => {
    const out = drawn(seen({ found: true, name: "Nitrile gloves, blue", product: "t-glove" }));
    expect(out).toContain("Nitrile gloves, blue");
    expect(out).toContain("Open it");
  });

  /* ⚠️ A SHELF LABEL IS A DESTINATION, NOT A RESULT — the session goes there,
     which is what turns a two-hour count into forty minutes. */
  it("treats one of our own shelf labels as somewhere to go", () => {
    const out = drawn(seen({ ours: "location", kind: "ours", value: "ONE-L-4K2P" }));
    expect(out).toContain("Go to this place");
    expect(out).toContain("ONE-L-4K2P");
  });

  /*
    ⚠️ THE PACK LEVEL IS SAID ONLY WHERE IT IS NOT ONE. On a single box it is
    noise on every row; where it is ten it is the difference between adding one
    carton and adding ten gloves.
  */
  it("says how many a carton holds, and says nothing for a single box", () => {
    expect(drawn(seen({ found: true, pack: 10, unit: "glove" }))).toContain("10 glove");
    expect(drawn(seen({ found: true, pack: 1, unit: "glove" }))).not.toContain("This one holds");
  });

  /* ⚠️ WHAT THE LABEL DID NOT CARRY, SAID BEFORE THE SCREEN THAT WILL ASK FOR
     IT. A plain barcode on a batched product means two questions are coming. */
  it("says what a poor label is missing", () => {
    const out = drawn(seen({ found: true, tracking: "batched", needs: "lot,expiry" }));
    expect(out).toContain("does not carry the lot or the expiry");
  });

  /* ⚠️ NOTHING SCANNED YET IS NOT AN EMPTY STATE — the camera above is the whole
     screen at that moment, and a "nothing here" card under a live viewfinder
     reads as a fault rather than as a beginning. */
  it("draws no empty state before anything has been scanned", () => {
    const out = drawn(null);
    expect(out).toContain("Whatever you scan will appear here");
    expect(out).not.toContain("What is this?");
  });

  /* ⚠️ AND THE FIELD IS ALWAYS THERE. Most warehouse scanners are keyboard
     wedges: they type into whatever has the caret and press Enter, so a visible
     field IS the hardware integration. */
  it("always offers the typed lane, camera or no camera", () => {
    expect(drawn(null)).toContain('name="code"');
  });
});
