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

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Fills, Story, ready } from "@engine/design";
import { describe, expect, it } from "vitest";
import { inventory } from "../src/index.js";

/** ⚠️ Built once here — the manifest is a thunk so that a cold isolate is not. */
const INVENTORY = inventory();
import {
  Count, INVENTORY_ROUTES, InventoryScreen, Receive, Scan,
  type Seen, type Uncovered,
} from "../src/screens/index.js";
import { LINES, PLACES, EMPTY_PLACE, type Line } from "../src/screens/sample.js";
import { Stock } from "../src/screens/Stock.js";
import { Ask, type Answer } from "../src/screens/Ask.js";
import { Item, type Kept } from "../src/screens/Item.js";
import type { Guess } from "../src/screens/Scan.js";
import { keyOf, type Noted } from "../src/screens/Receive.js";
import { Move } from "../src/screens/Move.js";
import { Ladder } from "../src/screens/Ladder.js";
import { detailOptions } from "../src/saying.js";
import { Case, type Used } from "../src/screens/Case.js";
import { Run, type Covered } from "../src/screens/Run.js";
import { Work, type Jobs, type Runs } from "../src/screens/Work.js";
import { Kit, type Member, type Missing } from "../src/screens/Kit.js";
import { Due, sayDays, type Dated } from "../src/screens/Due.js";
import { Labels, type Labelled } from "../src/screens/Labels.js";
import { Reports, sayCover, type Reported } from "../src/screens/Reports.js";
import { Import, MAPPABLE, type Done, type Seen as Seeing } from "../src/screens/Import.js";
import { Suppliers, type Supplier } from "../src/screens/Suppliers.js";

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
    /* ⚠️ AND THE TWO NAMED ONES, for the same reason. An item's heading is the
       product it is one of, and a kit's is the tray it is — neither is "An
       item" or "A kit", which is what a nav has to call them. */
    "/item": "Hammer drill, 18 V",
    "/kit": "Minor surgery tray",
    /* ⚠️ AND THE TWO THE REGULATED HALF ADDS. A run is named by what kind of run
       it is; a job by what it is for. Neither is "A run" or "A job", which is
       what a nav has to call them. */
    "/run": "Autoclave 134°C",
    "/case": "Bay 1 service",
  };

  /*
    ⚠️ ONE SCREEN IN A PRODUCT MAY BE NAMELESS, AND IT IS THE ROOT. Everywhere
    else somebody navigated, so the name is how they know they arrived where they
    meant to; nobody navigates to home, and the crown and the bar item a thumb is
    already on both say where they are. A heading there is the width of the
    screen spent on something they knew before they unlocked the phone.

    ⚠️ AND IT IS A RULE RATHER THAN A WAIVER, which is why it is `route === "/"`
    and not a list. A second nameless screen is a screen whose title somebody
    forgot, and the difference between the two has to be structural or the
    exemption grows.
  */
  it("renders something for every declared route", () => {
    for (const route of INVENTORY_ROUTES) {
      /* ⚠️ NOT `length > 0` — an empty `<div>` passes that. A heading is what
         proves a screen drew rather than a wrapper. */
      const label = SUBJECT[route]
        ?? (INVENTORY.screens ?? []).find((s) => s.route === route)?.label
        ?? "";
      expect(html(route), route).toContain(route === "/" ? "On the shelf" : label);
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
  const out = renderToStaticMarkup(<InventoryScreen route="/stock" />);

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
    const out = renderToStaticMarkup(<InventoryScreen route="/stock" />);
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
/* ⚠️ MODULE SCOPE, because two suites drive this screen: what a scan resolved to,
   and what a model made of one. Two copies of the harness is two places to keep
   the prop list right. */
const seen = (of: Partial<Seen>): Seen => ({
  found: false, kind: "gtin", value: "05000112637922", ours: "",
  product: "", name: "", tracking: "", unit: "", pack: 1, rung: "", levels: [],
  lot: "", expiry: "", needs: "", ...of,
});

const drawn = (of: Seen | null, guess: Guess | null = null) => renderToStaticMarkup(
  <Scan
    of={ready(of)}
    products={[{ id: "t-glove", label: "Nitrile gloves, blue" }]}
    guess={ready(guess)}
    onRead={() => undefined}
    onOpen={() => undefined}
    onPlace={() => undefined}
    onLearn={() => undefined}
    onIdentify={() => undefined}
    onLabel={() => undefined}
    onAdd={() => undefined}
    again={() => undefined}
  />,
);

describe("the scan screen", () => {

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

/**
 * THE DELIVERIES ON A PRODUCT'S SCREEN.
 *
 * ⚠️ THE ROW SAYS WHICH CLOCK RAN OUT, and that is the whole point of it. A
 * shelf that says "expires Tuesday" and cannot say why is a shelf nobody trusts
 * — and the surprising case is real: a box printed 2028 that somebody opened
 * last month is out next week, and a screen showing only the printed date would
 * call it fine for two more years.
 */
describe("a batched product's deliveries", () => {
  const out = renderToStaticMarkup(<InventoryScreen route="/thing" />);

  it("says which clock ran out on every row", () => {
    expect(out).toContain("the date on the box");
    expect(out).toContain("when it was opened");
  });

  it("says how near in words, either side of today", () => {
    expect(out).toContain("7 days ago");
    expect(out).toContain("in 4 days");
  });

  /* ⚠️ THE INK IS THE ONE CHANNEL LEFT — a chip beside the figure would be a
     second thing to read saying what the first already says. */
  it("puts what is gone and what is going in the value's own ink", () => {
    expect(out).toContain('data-ink="danger"');
    expect(out).toContain('data-ink="warning"');
  });

  /*
    ⚠️ AND OPENING IS OFFERED ONCE. A second opening restarts a shelf life —
    the most dangerous write in this product — so the control is refused rather
    than becoming a button that argues.

    ⚠️ IT IS DISABLED RATHER THAN ABSENT, and the reason is the column beside
    it. `AmountRow` packs everything after the label to the right, so a row with
    no control put its DATE where the other rows have a button — on the one list
    where three dates are read against each other. The slot stays; what changes
    is whether it can be pressed and what it says.
  */
  it("offers to record an opening only where one has not happened", () => {
    expect(out.match(/>Open</g)?.length).toBe(2);
    expect(out.match(/>Opened</g)?.length).toBe(1);
    /* ⚠️ AND THE REFUSED ONE IS REALLY REFUSED, not merely relabelled. */
    expect(out.match(/data-disabled="true"/g)?.length).toBe(1);
  });
});

/**
 * RECEIVING — the flow that decides whether anybody records anything.
 *
 * ⚠️ THE WORST OUTCOME IN THIS PRODUCT IS SOMEBODY NOT RECORDING SOMETHING
 * because a form demanded a field they did not have, and every assertion here is
 * one of the places that nearly happens: an unknown code, a missing lot, a
 * quantity that carried over from the last item.
 */
describe("receiving", () => {
  const seen = (of: Partial<Seen>): Seen => ({
    found: false, kind: "gtin", value: "05000112637922", ours: "",
    product: "", name: "", tracking: "", unit: "", pack: 1, rung: "", levels: [],
    lot: "", expiry: "", needs: "", ...of,
  });

  const drawn = (place: { id: string; name: string } | null, of: Seen | null) =>
    renderToStaticMarkup(
    <Receive
      place={place}
      seen={of}
      /* ⚠️ NO NOTE HERE. This suite is about the scan-and-quantity flow; the
         photographed page is its own suite with its own harness. */
      note={ready(null)}
      done={new Set()}
      onRead={() => undefined}
      onForget={() => undefined}
      onReceive={() => undefined}
      onNote={() => undefined}
      onLine={() => undefined}
      again={() => undefined}
    />,
  );

  /* ⚠️ THE SHELF FIRST, BECAUSE EVERYTHING AFTER IT LANDS THERE. A session with
     no place is a session about to put twenty things nowhere. */
  it("asks for the shelf before anything else", () => {
    const out = drawn(null, null);
    expect(out).toContain("Scan a shelf label to begin");
    /* ⚠️ ASSERTED ON THE ACT, NOT ON THE WORDS. "How many" is a STEP label and is
       correctly on the page from the first frame — the progress row's whole job
       is showing what is coming. What must not be there yet is the button. */
    expect(out).not.toContain(">Add it<");
  });

  it("keeps the shelf under the name once it has one", () => {
    expect(drawn({ id: "p-a1", name: "Rack A · A1" }, null)).toContain("Rack A · A1");
  });

  /*
    ⚠️ TAKE IT NOW, NAME IT LATER — the plan's third rule, and the one this whole
    screen is shaped around. An unknown code is receivable; a screen that
    insisted on a name first is a screen that loses the delivery.
  */
  it("receives something nobody has named", () => {
    const out = drawn({ id: "p-a1", name: "A1" }, seen({}));
    expect(out).toContain("Something new");
    expect(out).toContain("Put it away now and name it later");
    expect(out).toContain("Add it");
  });

  /* ⚠️ THE PACK LEVEL IS SAID, because "scan a carton, record one" is the
     commonest wrong number in inventory work.

     ⚠️ AND THE FIELD SAYS WHICH THING IT COUNTS. `stock.arrive` multiplies by
     the pack, so this number is cartons and not gloves — a field labelled "How
     many gloves" over one is a right answer typed into the wrong question, and
     it is the shape that put nine hundred tablets on a shelf. See
     `packing.screens.test.tsx` for the arithmetic. */
  it("says what a carton holds, and counts cartons", () => {
    const out = drawn({ id: "p-a1", name: "A1" }, seen({ found: true, pack: 10, unit: "glove" }));
    expect(out).toContain("10 glove");
    expect(out).toContain("Count the packs");
    expect(out).toContain("How many of these");
    expect(out).not.toContain("How many glove");
  });

  /* ⚠️ ONLY WHAT THE LABEL DID NOT CARRY. A DataMatrix arrives with both, and
     asking again would make the good label worthless. */
  it("asks for a lot only where the label did not carry one", () => {
    const asked = drawn({ id: "p-a1", name: "A1" },
      seen({ found: true, tracking: "batched", needs: "lot,expiry" }));
    expect(asked).toContain('name="lot"');
    expect(asked).toContain('name="expiry"');

    const rich = drawn({ id: "p-a1", name: "A1" },
      seen({ found: true, tracking: "batched", lot: "A5B7", expiry: "2027-03-31", needs: "" }));
    expect(rich).not.toContain('name="lot"');
  });
});

/**
 * THE COUNT SESSION.
 *
 * ⚠️ CLOSING ONE IS THE ONLY GESTURE IN THIS PRODUCT THAT TAKES NUMBERS AWAY —
 * everything the session did not find goes to zero — so what is asserted here is
 * that a person sees the differences BEFORE they agree to them, and that the
 * blind choice is honoured rather than merely offered.
 */
describe("counting a shelf", () => {
  const out = renderToStaticMarkup(<InventoryScreen route="/count" />);

  it("shows what was found beside what we thought", () => {
    expect(out).toContain("Nitrile gloves, blue");
    /* ⚠️ THE FIGURE GOES THROUGH `Num`, WHICH IS WHY THIS ASSERTS ON THE MARKUP
       RATHER THAN THE SENTENCE. The first version looked for "We think 1200" and
       found it — the expected number was interpolated into a template string and
       printed ungrouped beside a counted "1,180", two number systems on one row
       in the one place a reader compares hardest. */
    expect(out).toContain("We think <span");
    expect(out).toContain(">1,200</span>");
  });

  /* ⚠️ THE DIFFERENCES ARE ON THE PAGE, not only inside the sheet. "Are you
     sure?" over a list of four numbers is a question somebody can answer; over
     nothing it is a formality people press through. */
  it("puts the disagreements on the page before anybody agrees to them", () => {
    /* ⚠️ ASSERTED ON THE GROUPED FIGURES, which is how the first version of this
       test found a real defect: the expected number was interpolated into a
       template string and printed "1200" beside a counted "1,180" — two number
       systems on one row, in the one place a reader compares hardest. */
    expect(out).toContain("We thought <span");
    expect(out).toContain(">1,180</span>");
    expect(out).toContain("Everything not counted goes to zero");
  });

  /* ⚠️ SAID, NEVER BLOCKED. A trigger held against a pallet of identical boxes
     is three reads in two seconds and it is three boxes. */
  it("says when a code read three times in two seconds", () => {
    expect(out).toContain("read three times in two seconds");
  });

  /*
    ⚠️ A BLIND COUNT WITHHOLDS THE EXPECTED NUMBER RATHER THAN HIDING IT. A
    number sent to the browser and not drawn is a number in the page source, and
    a blind count somebody can read is not a blind count.
  */
  it("withholds the expected number on a blind count", () => {
    const dark = renderToStaticMarkup(
      <Count
        place={{ id: "p-a1", name: "A1" }}
        blind
        onBlind={() => undefined}
        counting
        of={ready([
          { id: "t1", name: "Nitrile gloves, blue", unit: "glove", found: 1_180, expected: null },
        ])}
        changes={[]}
        uncounted={[]}
        onRead={() => undefined}
        onGo={() => undefined}
        onStart={() => undefined}
        onClose={() => undefined}
        again={() => undefined}
      />,
    );
    expect(dark).toContain("1,180");
    expect(dark).not.toContain("We think");
  });

  /* ⚠️ AND THE DOCKED ACT IS THE ONE THAT ADDS. A button that destroys a
     shelf's numbers on one press is the control somebody hits with a glove on. */
  it("does not dock the close", () => {
    expect(out).not.toContain(">Start counting<");
    expect(out).toContain(">Close the shelf<");
  });
});

/**
 * ⚠️ AND THE HALF OF A STOCKTAKE NOBODY BUILDS. Missing a shelf entirely is far
 * commoner than counting one twice and much more damaging: its number is simply
 * the last one anybody wrote down, and it goes on being trusted.
 */
describe("which shelves nobody has counted", () => {
  const idle = (uncounted: readonly Uncovered[]) => renderToStaticMarkup(
    <Count
      place={null}
      blind={false}
      onBlind={() => undefined}
      counting={false}
      of={ready([])}
      changes={[]}
      uncounted={uncounted}
      onRead={() => undefined}
      onStart={() => undefined}
      onClose={() => undefined}
      onGo={() => undefined}
      again={() => undefined}
    />,
  );

  it("says never rather than a very large number of days", () => {
    const out = idle([
      { location: "b2", name: "B2", days: null },
      { location: "a3", name: "A3", days: 412 },
    ]);
    expect(out).toContain("Never counted");
    expect(out).toContain("Counted 412 days ago");
  });

  /* ⚠️ NOT DURING A SESSION. A list of other shelves in front of somebody
     mid-count is the one thing that could make them walk away from the one they
     are standing at. */
  it("is absent while a count is open", () => {
    const out = renderToStaticMarkup(<InventoryScreen route="/count" />);
    expect(out).not.toContain("Nobody has counted these");
  });
});

/**
 * ONE OBJECT, AND THE ACT ITS STANDING MAKES.
 *
 * ⚠️ THE PRIMARY ACT IS A FUNCTION OF THE STANDING AND THERE IS NEVER MORE THAN
 * ONE. A screen offering both "give it to somebody" and "take it back" puts the
 * wrong one under the thumb half the time; a retired object offering either is
 * a button that can only argue. None of that is visible to a compiler — every
 * arrangement renders perfectly well.
 */
describe("one item", () => {
  const kept = (of: Partial<Kept>): Kept => ({
    id: "u1", code: "ONE-U-4K2PX9M", name: "Hammer drill, 18 V", product: "t-drill",
    serial: "DW-884213", life: "held", where: "Van 2 · Rack", holder: "", issued: "",
    due: "", standing: "", days: 0, services: 0, retired: "", note: "", ...of,
  });

  const drawn = (of: Kept) => renderToStaticMarkup(
    <Item
      of={of}
      history={ready([])}
      again={() => undefined}
      back={() => undefined}
      onIssue={() => undefined}
      onReturn={() => undefined}
      onServe={() => undefined}
      onRetire={() => undefined}
    />,
  );

  it("offers to give out what is on the shelf, and nothing else", () => {
    const out = drawn(kept({ life: "held" }));
    expect(out).toContain("Give it to somebody");
    expect(out).not.toContain("Take it back");
  });

  it("offers to take back what is out, and names who has it", () => {
    const out = drawn(kept({ life: "issued", holder: "Ana Ruiz", issued: "2026-08-11" }));
    expect(out).toContain("Take it back");
    expect(out).toContain("Ana Ruiz");
    expect(out).not.toContain("Give it to somebody");
  });

  /* ⚠️ A RETIRED OBJECT HAS NOTHING TO OFFER, and the reason is on the screen
     rather than only in the history — somebody arriving at it is asking why. */
  it("offers a retired one neither, and says why it went", () => {
    const out = drawn(kept({ life: "retired", retired: "2026-06-02", note: "Dropped" }));
    expect(out).not.toContain("Give it to somebody");
    expect(out).not.toContain("Take it back");
    expect(out).toContain("Dropped");
  });

  /* ⚠️ AND RETIRING IS OFFERED ONLY WHERE IT IS POSSIBLE. Something out with
     somebody has to come back first — the operation refuses it, so a button
     for it would be one that only ever argues. */
  it("offers to retire only what is on the shelf", () => {
    expect(drawn(kept({ life: "held" }))).toContain("Retire it");
    expect(drawn(kept({ life: "issued", holder: "Ana" }))).not.toContain("Retire it");
  });

  /*
    ⚠️ THE SERVICE DATE WEARS THE ONE CHANNEL A MONOCHROME INTERFACE HAS LEFT,
    and an overdue inspection is the whole reason the asset rung exists. The ink
    is an attribute on a span: dropping it renders a perfectly ordinary row in
    which nothing is wrong with anything.
  */
  it("marks an overdue service, and says so in days", () => {
    const out = drawn(kept({ due: "2026-08-18", standing: "gone", days: -3 }));
    expect(out).toContain('data-ink="danger"');
    expect(out).toContain("3 days ago");
  });

  /* ⚠️ AND NOTHING BOOKED IS SAID RATHER THAN LEFT BLANK. An empty row reads as
     a screen that failed to load one. */
  it("says when nothing is booked", () => {
    expect(drawn(kept({}))).toContain("Nothing is booked");
  });
});

/**
 * ONE KIT, AND THE TWO KINDS OF WRONG IT CAN BE.
 *
 * ⚠️ SHORT AND STRAY ARE NOT THE SAME SEVERITY, and the screen has to say both.
 * Short means the tray cannot do its job, so the act that would call it complete
 * is ABSENT rather than disabled — a button that can only refuse is a button
 * somebody presses to find out why. A stray is worth seeing every time and is
 * never a reason to strand anybody.
 */
describe("one kit", () => {
  const drawn = (of: {
    state?: "open" | "built" | "broken";
    members?: readonly Member[];
    missing?: readonly Missing[];
  }) => renderToStaticMarkup(
    <Kit
      name="Minor surgery tray"
      code="ONE-K-7QP2XL9"
      state={of.state ?? "open"}
      built=""
      where="Theatre 1 · Store"
      of={ready(of.members ?? [])}
      missing={of.missing ?? []}
      again={() => undefined}
      back={() => undefined}
      onRead={() => undefined}
      onOpen={() => undefined}
      onTake={() => undefined}
      onBuild={() => undefined}
      onBreak={() => undefined}
    />,
  );

  const CLAMP: Member = { id: "u1", name: "Clamp, curved", code: "ONE-U-1", stray: false };
  const PROBE: Member = { id: "u9", name: "Probe, blunt", code: "ONE-U-9", stray: true };

  it("offers to finish a complete one", () => {
    expect(drawn({ members: [CLAMP] })).toContain("It is complete");
  });

  it("withholds that while anything is missing, and says what", () => {
    const out = drawn({
      members: [CLAMP],
      missing: [{ product: "t-scissors", name: "Scissors, straight", want: 1, have: 0 }],
    });
    expect(out).not.toContain("It is complete");
    expect(out).toContain("Scissors, straight");
    expect(out).toContain("Still needed");
  });

  /* ⚠️ AND A PARTIAL LINE SAYS HOW MANY OF HOW MANY. "Missing forceps" sends
     somebody looking for two when one is already in the tray. */
  it("says how many of a line are already in it", () => {
    const out = drawn({ missing: [{ product: "t-f", name: "Forceps", want: 2, have: 1 }] });
    expect(out).toContain("1 of 2 in it");
  });

  /* ⚠️ THE STRAY IS SAID ON ITS OWN ROW rather than counted in a summary — the
     person is holding the tray and has to take one particular thing out. */
  it("marks what does not belong, on the row it does not belong on", () => {
    const out = drawn({ members: [CLAMP, PROBE] });
    expect(out).toContain("Does not belong in this kit");
    /* ⚠️ AND IT DOES NOT BLOCK. A studio may have a reason; refusing over one is
       how a rule gets worked around. */
    expect(out).toContain("It is complete");
  });

  /* ⚠️ TAKING SOMETHING OUT OF A BUILT KIT UN-BUILDS IT, and saying so before
     somebody presses is what stops it being a surprise. */
  it("warns that opening a built kit undoes the claim", () => {
    expect(drawn({ state: "built", members: [CLAMP] }))
      .toContain("Taking anything out makes it incomplete again");
  });

  /* ⚠️ A BROKEN KIT IS FINISHED. Offering to break it again, or to take
     something out of it, would be offering what the operation refuses. */
  it("offers nothing on one that was broken up", () => {
    const out = drawn({ state: "broken", members: [CLAMP] });
    expect(out).not.toContain("Break it up");
    expect(out).not.toContain("Take out");
  });
});


/**
 * WHAT A MODEL SUGGESTED, AND THAT IT IS A SUGGESTION.
 *
 * ⚠️ A FILLED-IN CARD IS INDISTINGUISHABLE FROM A RECORD unless the screen says
 * otherwise, and this one is one press from becoming a record. The rung without
 * its reason is a magic answer; a hazard filled in rather than shown is a legal
 * document nobody checked. Neither is visible to a compiler — both render
 * perfectly well.
 */
describe("what a model made of a scan", () => {
  const GUESS: Guess = {
    name: "Isopropanol 99%, 1 L", brand: "Fisher", category: "Solvents",
    unit: "bottle", pack: 1, tracking: "batched",
    why: "It carries an expiry date and a flammable pictogram",
    storage: "Keep below 25°C", hazards: ["Flammable liquid"],
  };

  const unknown = seen({});

  it("says the card was filled in by a model", () => {
    const out = drawn(unknown, GUESS);
    expect(out).toContain("Filled in by a model");
    expect(out).toContain("Isopropanol 99%, 1 L");
  });

  /* ⚠️ THE RUNG CARRIES ITS REASON. "Batched" alone is something somebody
     accepts because the app said so; with the reason it is something they
     agree with, or spot as wrong. */
  it("says why it picked that rung", () => {
    expect(drawn(unknown, GUESS)).toContain("It carries an expiry date");
    expect(drawn(unknown, GUESS)).toContain("Batched");
  });

  /* ⚠️ A HAZARD IS SHOWN AND NEVER FILLED. A wrong class on a printed label is
     a legal document that is wrong, and the person who printed it answers for
     it — so the row hedges, and says to check. */
  it("hedges the hazards and points at the label", () => {
    const out = drawn(unknown, GUESS);
    expect(out).toContain("check the label");
    expect(out).toContain('data-ink="warning"');
  });

  /* ⚠️ THE SUGGESTION TAKES THE DOCK, because it is then the thing on the
     screen — and attaching the code to something that already exists stays in
     the card for when the guess is wrong. */
  it("offers to add it, rather than to attach the code", () => {
    expect(drawn(unknown, GUESS)).toContain("Add it");
    expect(drawn(unknown, null)).toContain("Attach this code");
  });

  /* ⚠️ AND ASKING IS A PRESS RATHER THAN AUTOMATIC. A question costs credits,
     and asking one on every unknown scan spends them on the codes somebody was
     only checking. */
  it("offers to ask, and asks nothing by itself", () => {
    const out = drawn(unknown, null);
    expect(out).toContain("Ask what it is");
    expect(out).not.toContain("Filled in by a model");
  });
});

/**
 * ASKING IN WORDS, AND THE BOUND ON WHAT IT READ.
 *
 * ⚠️ A BOUNDED SUMMARY THAT DOES NOT SAY IT IS BOUNDED IS THE WORST ANSWER THIS
 * SCREEN COULD GIVE. "You have none" over a shelf that has some, because the two
 * hundred lines the model was shown did not include it — confident, wrong, and
 * with nothing on the screen to suggest otherwise.
 */
describe("asking in words", () => {
  const drawnAsk = (of: Answer | null, lines: number) => renderToStaticMarkup(
    <Ask of={ready(of)} lines={lines} onAsk={() => undefined} again={() => undefined} />,
  );

  it("shows the answer", () => {
    expect(drawnAsk({ answer: "Yes — 6 rolls on the Bench.", looked: 40 }, 40))
      .toContain("6 rolls on the Bench");
  });

  it("says so when it read fewer lines than the workspace holds", () => {
    const out = drawnAsk({ answer: "I cannot see any.", looked: 200 }, 4_000);
    /* ⚠️ THE SENTENCE NAMES ITS SUBJECT. "Read 200 of your 4,000 lines" under
       a heading that says The answer leaves who read them to the reader. */
    expect(out).toContain("Answered from ");
    expect(out).toContain('data-ink="warning"');
    /* ⚠️ GROUPED, BECAUSE IT IS A NUMBER SOMEBODY COMPARES. "200 of your 4000"
       puts two figures in two number systems on one line, which is the one
       place a reader compares hardest. */
    expect(out).toContain(">4,000<");
    expect(out).not.toContain("4000 lines");
  });

  /* ⚠️ AND SAYS NOTHING WHERE IT READ EVERYTHING. On a workspace of forty lines
     the bound is invisible, and mentioning it is noise on every answer. */
  it("says nothing about a bound it did not reach", () => {
    expect(drawnAsk({ answer: "Yes.", looked: 40 }, 40)).not.toContain("of your");
  });

  /* ⚠️ NOTHING ASKED YET IS A BEGINNING, NOT AN EMPTY STATE. The examples are
     the whole content of the screen at that moment — and pressing one asks it,
     because an example somebody has to retype is one they ignore. */
  it("offers what people ask rather than an empty state", () => {
    const out = drawnAsk(null, 40);
    expect(out).toContain("Do we have any blue resin");
    expect(out).toContain("The answer will appear here");
  });
});


/**
 * A DELIVERY NOTE IS A WORKLIST, NOT A WRITE.
 *
 * ⚠️ ONE PHOTOGRAPH INSTEAD OF THIRTY SCANS is the whole value at a goods-in
 * desk — and a quantity read off a creased page is exactly the consequence a
 * model may not commit. So the lines FILL the row above and the ordinary act
 * records them: every line confirmed, by a gesture somebody already knows.
 *
 * ⚠️ AND THE TICK IS THE POINT OF THE LIST. Thirty lines with no record of which
 * are done is a page somebody loses their place in, and then works through
 * twice — which is a doubled delivery, silently, in the direction nobody checks.
 */
describe("a photographed delivery note", () => {
  const LINES: readonly Noted[] = [
    { code: "05000112637922", name: "Nitrile gloves, blue", quantity: 8,
      lot: "A5B7", expiry: "2027-03-31" },
    { code: "", name: "Masking tape, 50 mm", quantity: 12, lot: "", expiry: "" },
  ];

  const AT = { id: "p-a1", name: "Rack A · A1" };

  /* ⚠️ ITS OWN HARNESS, because the module-scope `drawn` draws the SCAN screen —
     two suites, two screens, and one name for both is a test that passes while
     asserting about the wrong page. */
  const receiving = (
    place: { id: string; name: string } | null,
    note: readonly Noted[] | null,
    done: ReadonlySet<string> = new Set(),
  ) => renderToStaticMarkup(
    <Receive
      place={place}
      seen={null}
      note={ready(note)}
      done={done}
      onRead={() => undefined}
      onForget={() => undefined}
      onReceive={() => undefined}
      onNote={() => undefined}
      onLine={() => undefined}
      again={() => undefined}
    />,
  );

  it("lists what it read, and says a model read it", () => {
    const out = receiving(AT, LINES);
    expect(out).toContain("Nitrile gloves, blue");
    expect(out).toContain("Masking tape, 50 mm");
    expect(out).toContain("Read by a model");
  });

  it("offers each line to the row above rather than recording it", () => {
    const out = receiving(AT, LINES);
    expect(out.match(/Use it/g)?.length).toBe(2);
  });

  /* ⚠️ A LINE ALREADY RECORDED IS TICKED AND OFFERS NOTHING. A button that
     would receive it a second time is the doubled delivery this list exists to
     prevent. */
  it("ticks what has been added, and stops offering it", () => {
    const out = receiving(AT, LINES, new Set([keyOf(LINES[0] as Noted)]));
    expect(out).toContain("Added");
    expect(out.match(/Use it/g)?.length).toBe(1);
  });

  /* ⚠️ AN EMPTY LIST IS A CORRECT ANSWER — a photograph of a wall, or a page
     nothing could be read off. Saying so beats a card that is simply absent. */
  it("says when nothing could be read off the page", () => {
    expect(receiving(AT, [])).toContain("Nothing could be read off that");
  });

  /* ⚠️ AND IT IS ABSENT UNTIL THERE IS A SHELF, for the reason everything else
     on this screen is: a session with no place is about to put a whole
     delivery nowhere. */
  it("is not offered before a shelf is scanned", () => {
    expect(receiving(null, null)).not.toContain("Photograph the delivery note");
    expect(receiving(AT, null)).toContain("Photograph the delivery note");
  });
});

/**
 * A RUN THAT FINISHED AND NOBODY RELEASED.
 *
 * ⚠️ IT IS THE ONE ROW IN THE PRODUCT THAT IS WAITING FOR A PERSON, and the whole
 * rail is worth nothing if the screen does not say so. "Finished" is what the
 * machine did; a load sitting in an autoclave that reads as done is exactly the
 * outcome the gap between ending and releasing exists to prevent.
 */
describe("the work screen", () => {
  const RUNS_LIST: readonly Runs[] = [
    { id: "r-2", kind: "Autoclave 134°C", machine: "Autoclave 1", state: "ended",
      started: "2026-08-21", items: 6 },
    { id: "r-1", kind: "Annual calibration", machine: "Bench", state: "released",
      started: "2026-08-14", items: 2 },
  ];

  const working = (runs: readonly Runs[], jobs: readonly Jobs[] = []) =>
    renderToStaticMarkup(
      <Work
        of={ready(runs)}
        jobs={jobs}
        again={() => undefined}
        onRun={() => undefined}
        onJob={() => undefined}
        onStart={() => undefined}
      />,
    );

  it("puts what is waiting for somebody in its own section", () => {
    const out = working(RUNS_LIST);
    expect(out).toContain("Waiting for somebody");
    expect(out).toContain("6 in it");
  });

  /* ⚠️ AND SAYS NOTHING ABOUT WAITING WHERE NOTHING IS. A permanent section
     headed "waiting" that is always empty is a heading people stop reading. */
  it("says nothing about waiting where nothing is", () => {
    const out = working(RUNS_LIST.filter((r) => r.state !== "ended"));
    expect(out).not.toContain("Waiting for somebody");
  });

  /*
    ⚠️ A JOB THAT ACQUIRED A CONCERN SAYS SO IN THE LIST. Nothing about the job
    changed — a recall landed on a lot it used — and the whole point of reading
    it backwards is that the list learns it too.
  */
  it("marks a job whose consumption is now in doubt", () => {
    const out = working(RUNS_LIST, [
      { id: "j-1", ref: "WO-4468", label: "Bay 1", state: "closed",
        opened: "2026-08-07", doubted: 2 },
    ]);
    expect(out).toContain("2 of what it used is in doubt");
    expect(out).toContain('data-ink="danger"');
  });
});

/**
 * THE RELEASE LADDER, ON A SCREEN.
 *
 * ⚠️ "UNFROZEN — STILL NOT RELEASED" IS THE RULE IN FOUR WORDS, and anything
 * shorter reads as "fine now", which is precisely what it is not. A tray whose
 * steriliser failed is not sterile because somebody pressed a button, and the
 * only place that can be said is the row.
 */
describe("one run", () => {
  const COVER: readonly Covered[] = [
    { batch: "b-1", lot: "A5B7", name: "Tray", verdict: "released", reason: "", quantity: 4 },
    { batch: "b-2", lot: "C0921", name: "Tray", verdict: "failed",
      reason: "Indicator did not turn", quantity: 2 },
    { batch: "b-3", lot: "C1144", name: "Gauze", verdict: "lifted",
      reason: "Re-wrapped", quantity: 12 },
  ];

  const running = (state: RunState) =>
    renderToStaticMarkup(
      <Run
        of={ready(COVER)}
        kind="Autoclave 134°C"
        machine="Autoclave 1"
        state={state}
        started="2026-08-21"
        ended="2026-08-21T07:40:00.000Z"
        released=""
        evidence="Printout 4471"
        again={() => undefined}
        back={() => undefined}
        onEnd={() => undefined}
        onRelease={() => undefined}
        onFail={() => undefined}
        onRecall={() => undefined}
        onLift={() => undefined}
      />,
    );

  /* ⚠️ ENDING IS NOT RELEASING, AND THE SCREEN SAYS IT IN WORDS. */
  it("says a finished run has released nothing", () => {
    const out = running("ended");
    expect(out).toContain("nobody has released it");
    expect(out).toContain("Release it");
  });

  it("offers to finish an open one, and to release nothing", () => {
    const out = running("open");
    expect(out).toContain("It has finished");
    expect(out).not.toContain("Release it");
  });

  /*
    ⚠️ THE LIFTED ROW SAYS BOTH HALVES. Unfrozen is the good news and still not
    released is the one that matters.

    ⚠️ AND THEY ARE IN DIFFERENT PLACES, which is what keeps the first one
    readable. The verdict is one word in a column of four verdicts read against
    each other; the caveat is a sentence under the row, beside the lot and the
    reason. Written as one string it was wide enough to wrap the item's own name
    onto four lines.
  */
  it("says a lifted item is unfrozen and still not released", () => {
    const out = running("ended");
    expect(out).toContain("Unfrozen");
    expect(out).toContain("still not released");
    expect(out).not.toContain("Unfrozen — still not released");
  });

  /* ⚠️ AND THE CAVEAT GOES WHEN IT STOPS BEING TRUE. An item whose freeze was
     lifted IS released once the run is, so a row still saying otherwise would
     be the screen contradicting the standing above it. */
  it("stops saying so once the run is released", () => {
    expect(running("released")).not.toContain("still not released");
  });

  /* ⚠️ AND UNFREEZING IS OFFERED ONLY ON WHAT IS FROZEN — anything else is a
     release arriving through the wrong door. */
  it("offers to unfreeze only what is frozen", () => {
    expect(running("ended").match(/Unfreeze<\/span>|>Unfreeze</g)?.length).toBe(1);
  });

  /* ⚠️ FAILING AND CALLING BACK ARE THE SAME CARD IN TWO STANDINGS, and the
     difference between them is an inconvenience and a phone call. */
  it("fails what nobody relied on, and calls back what somebody did", () => {
    expect(running("ended")).toContain("Fail it");
    expect(running("ended")).toContain("Nothing has been released");
    expect(running("released")).toContain("Call it back");
    expect(running("released")).toContain("cannot be frozen");
  });
});

type RunState = "open" | "ended" | "released" | "failed" | "recalled";

/**
 * A JOB READ BACKWARDS.
 *
 * ⚠️ THE DOUBT IS THE ANSWER AND IT GOES FIRST. Somebody opening a closed job is
 * almost always opening it because they were told to — putting the two lines in
 * question under a list of everything the job used is putting the answer under
 * the working.
 */
describe("one job", () => {
  const USED_LIST: readonly Used[] = [
    { movement: "u-2", product: "t-tray", name: "Tray", quantity: 1, lot: "C0921",
      at: "2026-08-07T09:20:00.000Z", doubt: "held" },
    { movement: "u-1", product: "t-glove", name: "Gloves", quantity: 4, lot: "",
      at: "2026-08-07T09:24:00.000Z", doubt: "" },
  ];

  const casing = (used: readonly Used[], state: "open" | "closed" = "closed") =>
    renderToStaticMarkup(
      <Case
        of={ready(used)}
        ref="WO-4468"
        label="Bay 1 service"
        state={state}
        opened="2026-08-07"
        closed={state === "closed" ? "2026-08-07" : ""}
        again={() => undefined}
        back={() => undefined}
        onClose={() => undefined}
        onOpenProduct={() => undefined}
      />,
    );

  it("puts what is in doubt above what it used", () => {
    const out = casing(USED_LIST);
    expect(out.indexOf("In doubt")).toBeLessThan(out.indexOf("What it used"));
    expect(out).toContain("That lot is frozen");
  });

  /* ⚠️ AND "NOTHING IS IN DOUBT" IS A REAL ANSWER. An absent section is
     indistinguishable from one that failed to load. */
  it("says so when nothing it used is in question", () => {
    const out = casing(USED_LIST.filter((u) => !u.doubt));
    expect(out).toContain("Nothing it used is in question");
    expect(out).not.toContain("In doubt");
  });

  /* ⚠️ A CLOSED JOB IS STILL READ, and saying so is the point: closing is not
     archiving, and the trace keeps answering long after the work finished. */
  it("says a closed job keeps answering", () => {
    expect(casing(USED_LIST)).toContain("a recall next month");
    expect(casing(USED_LIST, "open")).toContain("Close it");
  });
});

describe("what runs out", () => {
  const DATED_LIST: readonly Dated[] = [
    { id: "b-2", product: "p-lube", name: "Cutting fluid, 5 L", which: "Lot C0921",
      on: "2026-08-27", standing: "soon", days: 6, by: "opened" },
    { id: "b-1", product: "p-milk", name: "Milk, 2 L", which: "Lot 4471",
      on: "2026-08-19", standing: "gone", days: -2, by: "printed" },
  ];

  const SERVICE_LIST: readonly Dated[] = [
    { id: "u-1", product: "p-ext", name: "Fire extinguisher", which: "Serial FX-88231",
      on: "2026-08-11", standing: "gone", days: -10, by: "" },
  ];

  const running = (
    rows: readonly Dated[] = DATED_LIST, services: readonly Dated[] = SERVICE_LIST,
  ) =>
    renderToStaticMarkup(
      <Due
        title="Running out"
        of={ready(rows)}
        services={services}
        again={() => undefined}
        onOpen={() => undefined}
        onItem={() => undefined}
      />,
    );

  /*
    ⚠️ OUT OF DATE ABOVE EVERYTHING, EVEN WHEN ITS DATE IS NOT THE SOONEST. Those
    rows are a rule rather than a plan — nothing there may be used — and a list
    ordered purely by date buries them under whatever was recorded with an older
    date and is perfectly fine.
  */
  it("puts what is already out of date above what is going", () => {
    const out = running();
    expect(out.indexOf("Out of date")).toBeLessThan(out.indexOf("Expiring"));
    expect(out.indexOf("Milk, 2 L")).toBeLessThan(out.indexOf("Cutting fluid, 5 L"));
  });

  /*
    ⚠️ AND IT SAYS WHICH CLOCK WON. A shelf that says "expires Tuesday" and
    cannot say why is a shelf nobody trusts — and a box printed 2028 that
    somebody opened last month is out next week, which is the answer people find
    surprising often enough for the column to earn its width.
  */
  it("says why a date is the date", () => {
    expect(running()).toContain("since it was opened");
    expect(running()).toContain("printed on it");
  });

  /* ⚠️ THE DAYS IN WORDS RATHER THAN AS A SIGNED NUMBER. "−2" is arithmetic;
     "2 days ago" is what somebody reads at arm's length in a cold store. */
  it("says the days in words", () => {
    expect(running()).toContain("2 days ago");
    expect(running()).toContain("in 6 days");
    expect(sayDays(0)).toBe("today");
    expect(sayDays(-1)).toBe("yesterday");
    expect(sayDays(1)).toBe("tomorrow");
  });

  /*
    ⚠️ A SERVICE IS NOT AN EXPIRY AND STAYS IN ITS OWN SECTION. An extinguisher's
    inspection and a carton of cream are the same arithmetic and completely
    different working days; mixed into one list somebody reads every row to find
    out which kind of problem they are looking at.
  */
  it("keeps a service apart from an expiry", () => {
    const out = running();
    expect(out).toContain("Due for a service");
    expect(out.indexOf("Expiring")).toBeLessThan(out.indexOf("Due for a service"));
    /* ⚠️ AND NEVER SAYS A CLOCK WON. "Printed on it" over an inspection date is
       a sentence that is simply not true. */
    expect(running([], SERVICE_LIST)).not.toContain("printed on it");
  });

  /* ⚠️ AN EMPTY SECTION IS SAID, because an absent one is indistinguishable
     from one that failed to load — and "nothing due" is a real answer to the
     question somebody arrived with. */
  it("says so where there is nothing in a section", () => {
    const out = running(DATED_LIST, []);
    expect(out).toContain("Nothing due");
    expect(running([{ ...DATED_LIST[1]! }], [])).toContain("Nothing expiring soon");
  });

  /*
    ⚠️ SOON AND LATER ARE SEPARATE HEADINGS, and this is what says so. One
    section called "Expiring" held both, so a tin good for another eighteen
    months sat under a heading that means act on this — and the screen's first
    list, which somebody actually has to work through, was buried under it.
  */
  it("keeps what is soon apart from what is merely dated", () => {
    const later: Dated = {
      id: "b-3", product: "p-ipa", name: "Isopropanol 99%, 1 L", which: "Lot C0922",
      on: "2028-01-31", standing: "fine", days: 528, by: "printed",
    };
    const out = running([...DATED_LIST, later], []);
    expect(out).toContain("Expiring soon");
    expect(out).toContain("Later");
    /* ⚠️ AND THE LATER ONE IS ABSENT WHEN THERE IS NONE, rather than an empty
       heading — the section is the answer to a question nobody asked here. */
    expect(running(DATED_LIST, [])).not.toContain("Later");
  });

  /* ⚠️ AND NOTHING AT ALL IS THE EMPTY SCREEN, which needs BOTH lists empty —
     a screen drawing "nothing running out" over an overdue extinguisher is the
     worst answer this surface could give. */
  it("is only empty when both clocks are", () => {
    expect(running([], [])).toContain("Nothing running out");
    expect(running([], SERVICE_LIST)).not.toContain("Nothing running out");
  });
});

describe("the label sheet", () => {
  const HAZARDOUS: Labelled = {
    id: "p-ipa", name: "Isopropanol 99%", code: "ONE-P-7QP2XL9", under: "Reagent grade",
    hazards: ["GHS02", "GHS07"], signal: "danger",
    hazardText: "Highly flammable liquid and vapour.",
    precautions: "Keep away from heat.",
  };
  const PLAIN: Labelled = {
    id: "p-oil", name: "Cutting fluid, 5 L", code: "ONE-P-4K2PB81", under: "Workshop",
    hazards: [], signal: "", hazardText: "", precautions: "",
  };

  const sheet = (
    rows: readonly Labelled[], template: "tag" | "decant" | "opened" = "decant",
    subject: "place" | "thing" | "item" | "kit" = "thing",
  ) =>
    renderToStaticMarkup(
      <Labels
        title="Labels"
        of={ready(rows)}
        subject={subject}
        onSubject={() => undefined}
        picked={rows.map((one) => one.id)}
        onPicked={() => undefined}
        template={template}
        onTemplate={() => undefined}
        today="2026-08-21"
        again={() => undefined}
        onPrint={() => undefined}
      />,
    );

  /*
    ⚠️ THE DECANT LABEL IS THE WHOLE REASON THIS SCREEN EXISTS. Pour solvent from
    a drum into a bottle and that bottle needs its own label — the signal word,
    the hazards and the statements, verbatim.
  */
  it("puts the signal word, the hazards and the statements on a decant label", () => {
    const out = sheet([HAZARDOUS]);
    expect(out).toContain("DANGER");
    expect(out).toContain("Flammable");
    expect(out).toContain("Highly flammable liquid and vapour.");
    expect(out).toContain("Keep away from heat.");
  });

  /*
    ⚠️ AND IT SAYS WHAT IT IS NOT. The nine GHS marks are published artwork with
    an exact geometry; the diamond here names the hazard and makes no claim to be
    the pictogram. A product that let somebody assume otherwise would be one
    whose labels fail an inspection.
  */
  it("says the diamond is not the regulated pictogram", () => {
    expect(sheet([HAZARDOUS])).toContain("not the regulated pictogram");
    /* ⚠️ SAID ONLY WHERE THERE IS A CLASSIFICATION — a disclaimer on a sheet of
       shelf tags is a sentence that trains people to skip disclaimers. */
    expect(sheet([PLAIN])).not.toContain("not the regulated pictogram");
  });

  /*
    ⚠️ THE PRECEDENCE RULE IS REPORTED WHERE THE LABEL IS PRINTED, which is the
    only surface that can — the editor is generated from the declaration and
    knows nothing about GHS. "Harmful" beside "Acutely toxic" tells a reader the
    harm is minor while the diamond next to it says it can kill.
  */
  it("names a classification that contradicts itself", () => {
    const out = sheet([{ ...HAZARDOUS, hazards: ["GHS06", "GHS07"] }]);
    expect(out).toContain("Worth a second look");
    expect(out).toContain("the stronger one stands alone");
    /* ⚠️ AND NAMES WHICH PRODUCT, because a sheet of forty with one wrong is
       otherwise a hunt. */
    expect(out).toContain("Isopropanol 99%");
  });

  /* ⚠️ A CLEAN CLASSIFICATION SAYS NOTHING. A warning on every product is a
     warning nobody reads by the second day. */
  it("says nothing about a classification that holds together", () => {
    expect(sheet([HAZARDOUS])).not.toContain("Worth a second look");
    expect(sheet([PLAIN])).not.toContain("Worth a second look");
  });

  /*
    ⚠️ THE DECANT SHAPE IS OFFERED FOR PRODUCTS AND NOWHERE ELSE. A shelf has no
    classification and a tool has no statements; a template list offering all
    three everywhere produces a mostly-empty 62 mm label for a rack.
  */
  it("offers the decant shape only where there is something to classify", () => {
    expect(sheet([PLAIN], "tag", "thing")).toContain("Decant");
    expect(sheet([PLAIN], "tag", "place")).not.toContain("Decant");
  });

  /* ⚠️ A CODE IS PRINTED IN WORDS AS WELL AS IN THE SYMBOL. A camera fails — a
     cracked lens, a dead battery, a label under frost — and the string is what
     somebody types into the search box instead. */
  it("prints the code as text beside the symbol", () => {
    expect(sheet([PLAIN], "tag")).toContain("ONE-P-4K2PB81");
  });

  /* ⚠️ AND MINTING IS SAID BEFORE THE BUTTON IS PRESSED. Printing is what gives
     a place its code, and somebody choosing four hundred shelves should know
     that is what the button does before it does it four hundred times. */
  it("says that printing is what mints a label", () => {
    expect(sheet([PLAIN], "tag", "place")).toContain("gets one when you print");
    expect(sheet([PLAIN], "tag", "item")).not.toContain("gets one when you print");
  });
});

describe("the reports", () => {
  const SAID: Reported = {
    told: { recorded: 610, inferred: 390, share: 0.61 },
    used: [{ product: "p-glove", name: "Nitrile gloves, M", quantity: 640 }],
    losses: [{ product: "p-screw", name: "Screws, M4 × 20", lost: 40, found: 38 }],
    buy: [{
      product: "p-glove", name: "Nitrile gloves, M", onHand: 64, cover: 3,
      order: 90, why: "runs out first", unit: "box", supplier: "Medline",
    }],
    daily: [{ day: "2026-08-20", quantity: 12 }, { day: "2026-08-21", quantity: 0 }],
  };

  const reporting = (said: Reported = SAID) =>
    renderToStaticMarkup(
      <Reports
        title="Reports"
        of={ready(said)}
        span="month"
        onSpan={() => undefined}
        onSuppliers={() => undefined}
        again={() => undefined}
        onOpen={() => undefined}
      />,
    );

  /*
    ⚠️ THE HERO IS THE NUMBER THAT MAKES THE PRODUCT LOOK BAD, and that is the
    decision this screen is built on. How much left is a fact about the business;
    how much of it anybody wrote down is a fact about whether these figures mean
    anything at all — and only one of those two changes what somebody does on
    Monday.
  */
  it("leads with how much of what left was actually recorded", () => {
    const out = reporting();
    expect(out).toContain("Recorded");
    expect(out).toContain("61");
    /* ⚠️ AND SAYS WHAT THE REST WAS, because a percentage on its own is a score
       and nobody knows what to do with a score. */
    expect(out).toContain("a count found it missing");
  });

  /* ⚠️ A PERIOD WITH NOTHING IN IT SAYS SO RATHER THAN SHOWING A ZERO. "61% of
     nothing" is a sentence that means nothing. */
  it("says plainly when nothing left the shelves", () => {
    const out = reporting({
      ...SAID, told: { recorded: 0, inferred: 0, share: 0 }, used: [],
    });
    expect(out).toContain("Nothing left the shelves in this period");
  });

  /*
    ⚠️ SHORT AND OVER STAY APART. A shelf that is forty short and thirty-eight
    over is a shelf somebody is counting badly, or two products being confused
    with each other; netted, it is a shelf that is two out and looks fine.
  */
  it("keeps what was short apart from what was over", () => {
    const out = reporting();
    expect(out).toContain("40 short · 38 over");
  });

  /*
    ⚠️ THE REORDER ROW SAYS HOW LONG IT LASTS, NOT HOW LITTLE IS LEFT. A product
    with two weeks of stock and a three-week lead time is gone before the order
    lands, and the row has to be readable as that rather than as a quantity.
  */
  it("says how long a thing lasts and why it is on the list", () => {
    const out = reporting();
    expect(out).toContain("3 days left");
    expect(out).toContain("runs out first");
  });

  /* ⚠️ AND A THING THAT NEVER MOVES READS AS "NOT MOVING" RATHER THAN "∞". An
     infinity symbol is showing somebody a division rather than an answer. */
  it("says a dormant thing is not moving", () => {
    expect(sayCover(Infinity)).toBe("Not moving");
    expect(sayCover(0.4)).toBe("Gone today");
    expect(sayCover(12.9)).toBe("12 days left");
  });

  /* ⚠️ NOTHING TO BUY IS A REAL ANSWER AND IT IS THE GOOD ONE. An absent section
     is indistinguishable from one that failed to load. */
  it("says so when everything lasts", () => {
    expect(reporting({ ...SAID, buy: [] }))
      .toContain("Everything lasts longer than a delivery takes");
  });

  /* ⚠️ AND A QUIET PERIOD IS NOT AN EMPTY SCREEN. The reorder list reads the par
     levels rather than the movements, so there is still something to say — and
     "nothing moved" is itself the answer somebody came for. */
  it("draws itself over a period where nothing happened", () => {
    const out = reporting({
      told: { recorded: 0, inferred: 0, share: 0 }, used: [], losses: [],
      buy: SAID.buy, daily: [],
    });
    expect(out).toContain("Nitrile gloves, M");
    expect(out).not.toContain("Nothing to report yet");
  });
});

/* ------------------------------------------------------------------ import --- */

describe("the import", () => {
  const SEEN: Seeing = {
    header: ["product name", "brand", "ean", "qty", "shelf"],
    columns: { name: 0, brand: 1, code: 2, quantity: 3, location: 4 },
    tally: { new: 2, update: 1, refused: 1 },
    rows: [
      { line: 2, verdict: "new", why: "", name: "Nitrile gloves, M", code: "5012345678900",
        location: "Store room", supplier: "Medline", quantity: 40 },
      { line: 3, verdict: "update", why: "", name: "Isopropanol 99%", code: "",
        location: "Cabinet 2", supplier: "", quantity: 6 },
      { line: 4, verdict: "refused", why: "A quantity with no place", name: "Masking tape",
        code: "", location: "", supplier: "", quantity: 12 },
      { line: 5, verdict: "new", why: "", name: "Cutting fluid, 5 L", code: "",
        location: "Bay 1", supplier: "", quantity: 4 },
    ],
  };

  const importing = (seen: Seeing | null = SEEN, done: Done | null = null) =>
    renderToStaticMarkup(
      <Import
        title="Import"
        text="product name,brand,ean,qty,shelf"
        onText={() => undefined}
        seen={seen}
        fields={MAPPABLE}
        columns={seen?.columns ?? {}}
        onColumn={() => undefined}
        done={done}
        busy={false}
        onSee={() => undefined}
        onImport={() => undefined}
        onAgain={() => undefined}
      />,
    );

  /*
    ⚠️ THE BUTTON SAYS WHAT PRESSING IT DOES, WITH THE NUMBER IN IT. "Import" is
    a control somebody presses to find out; "Import 3 products" is a decision
    they have already made by the time their thumb lands — which is the whole
    difference between a preview and a confirmation dialogue.
  */
  it("names the number in the button", () => {
    expect(importing()).toContain("Import 3");
  });

  /* ⚠️ AND WITH NOTHING TO DO IT SAYS SO RATHER THAN OFFERING THE PRESS. */
  it("refuses to offer an import of nothing", () => {
    const out = importing({ ...SEEN, tally: { new: 0, update: 0, refused: 4 } });
    expect(out).toContain("Nothing to do");
  });

  /*
    ⚠️ EVERY REFUSED ROW IS NAMED WITH ITS LINE NUMBER, WHICH IS THE POINT OF THE
    SCREEN. An import that quietly skipped eleven of eight hundred is discovered
    months later by somebody looking for one of them, with no record anywhere of
    what happened — and the line number is what makes it fixable in the file
    somebody still has open.
  */
  it("names a refused row, its line and its reason", () => {
    const out = importing();
    expect(out).toContain("Line 4");
    expect(out).toContain("A quantity with no place");
  });

  /* ⚠️ AND THE MAPPING IS ON THE SCREEN BEFORE THE ROWS. A guess that put the
     supplier's name in the product name is only catchable here. */
  it("shows the mapping it guessed", () => {
    const out = importing();
    expect(out).toContain("Which column is which");
    expect(out).toContain("product name");
  });

  /* ⚠️ THE PASTE STEP IS THE PASTE STEP. Before a preview there is nothing to
     map and no rows to show, and drawing either would be a form full of empty
     controls. */
  it("shows only the box before anything has been read", () => {
    const out = importing(null);
    expect(out).toContain("Paste them here");
    expect(out).not.toContain("Which column is which");
  });

  /*
    ⚠️ THE REFUSALS SURVIVE THE SUCCESS SCREEN. A green "412 imported" with
    eleven rows silently missing is the exact failure this whole path exists to
    prevent, and the last screen is where somebody would stop reading.
  */
  it("still names what was refused after the import ran", () => {
    const out = importing(SEEN, {
      made: 2, changed: 1, received: 3, learned: 1,
      refused: ['Line 4: no place called "Bay 9"'],
    });
    expect(out).toContain("1 row was not imported");
    /* ⚠️ Compared without the quotes, which `renderToStaticMarkup` escapes. */
    expect(out).toContain("Line 4: no place called");
    expect(out).toContain("Bay 9");
    expect(out).toContain("One supplier was added");
  });
});

/* --------------------------------------------------------------- suppliers --- */

describe("the suppliers", () => {
  const ROWS: readonly Supplier[] = [
    { id: "s-1", name: "Medline", contact: "Dana", email: "", phone: "+49 30 1234",
      account: "MED-4471", leadDays: 3, note: "", products: 42 },
    { id: "s-2", name: "The hardware shop", contact: "", email: "", phone: "",
      account: "", leadDays: null, note: "", products: 1 },
  ];

  const listing = (rows: readonly Supplier[] = ROWS) =>
    renderToStaticMarkup(
      <Suppliers
        title="Suppliers"
        of={ready(rows)}
        standingDays={7}
        editing={null}
        busy={false}
        again={() => undefined}
        onOpen={() => undefined}
        onNew={() => undefined}
        onClose={() => undefined}
        onSave={() => undefined}
      />,
    );

  /*
    ⚠️ HOW LONG THEY TAKE IS THE FIRST FACT ON THE ROW, because it is the one the
    reorder report reads. A list ordered around names and phone numbers is an
    address book; this is the thing that decides when to order.
  */
  it("leads with how long a delivery takes", () => {
    expect(listing()).toContain("3 days");
  });

  /*
    ⚠️ AND A BLANK ONE SAYS WHAT IT FALLS BACK TO. Read as "today" — which is how
    an empty number field is read by everybody — every product they supply drops
    off the reorder list until the shelf is empty.
  */
  it("says what a blank lead time falls back to", () => {
    expect(listing()).toContain("7 days by default");
  });

  /* ⚠️ AND HOW MANY PRODUCTS NAME THEM, because a supplier nothing comes from is
     a row to delete and there is no other way to tell. */
  it("says how many products come from them", () => {
    const out = listing();
    expect(out).toContain("42 products");
    expect(out).toContain("1 product");
  });

  /* ⚠️ AN EMPTY LIST POINTS AT THE IMPORT, because a workspace that has just
     arrived has a spreadsheet with a supplier column in it and no idea that
     bringing it in fills this screen. */
  it("points an empty list at the import", () => {
    expect(listing([])).toContain("import a spreadsheet");
  });
});

/* ------------------------------------------------------------------- pages --- */

describe("a list that is a page", () => {
  /*
    ⚠️ A LIST THAT CANNOT SAY WHAT IT IS A LIST OF LIES BY OMISSION. Fifty rows
    out of two hundred is indistinguishable from a collection of fifty, and the
    screen drawing it says "fifty products" with complete confidence — in a
    product whose entire purpose is answering how many there are.
  */
  const stocking = (total: number, more: boolean) =>
    renderToStaticMarkup(
      <Stock
        title="Stock"
        of={ready(LINES)}
        places={PLACES}
        here={null}
        total={total}
        more={more}
        onMore={() => undefined}
        again={() => undefined}
        onImport={() => undefined}
        held={new Set(["product:write"])}
        onGo={() => undefined}
        onOpen={() => undefined}
        onAdd={() => undefined}
      />,
    );

  it("says what it is a page of, and offers the rest", () => {
    const out = stocking(214, true);
    expect(out).toContain("Show more");
    expect(out).toContain(`${LINES.length} of 214`);
  });

  /*
    ⚠️ AND SAYS NOTHING WHEN THERE IS NOTHING MORE. "12 of 12" is a sentence
    about arithmetic, and a button that fetches nothing is worse than no button.
  */
  it("says nothing when the page is the whole list", () => {
    const out = stocking(LINES.length, false);
    expect(out).not.toContain("Show more");
    expect(out).not.toContain(" of ");
  });
});

/* ------------------------------------------------------------- a date --- */

/**
 * A DATE ON A SCREEN IS THE READER'S, NOT THE RECORD'S.
 *
 * ⚠️ `2026-08-19` IS WHAT A DATE IS IN A ROW OF A TABLE, and rendering it
 * straight out is the shortest thing to write — so two screens did, while the
 * ones beside them said "Aug 19, 2026". On the run screen the two formats were
 * in ADJACENT rows of one card. Nothing fails: both are dates, both are
 * correct, and the product simply has two calendars.
 *
 * ⚠️ THE PRINTED LABEL IS THE ONE EXEMPTION AND IT IS THE OPPOSITE RULE. A
 * decant sticker goes on a bottle that may be read in another country by
 * somebody who reads dates the other way round; ISO is unambiguous, which is
 * exactly why it is wrong on a screen with a locale and right on a label
 * without one.
 *
 * ⚠️ AND IT READS THE TEXT, NOT THE ATTRIBUTES. A date field's placeholder is
 * ISO because that is the format the field ACCEPTS — it is telling somebody how
 * to type, which is the one place the stored shape is the right thing to show.
 */
const ISO_DAY = /\b\d{4}-\d{2}-\d{2}\b/;

const saidDates = (markup: string): readonly string[] =>
  [...markup.matchAll(/>([^<]+)</g)]
    .map((found) => ISO_DAY.exec(found[1] ?? "")?.[0])
    .filter((one): one is string => one !== undefined);

/** ⚠️ Written down rather than skipped — a silent exemption is a rule with a hole. */
const PRINTS_ISO = new Set(["/labels"]);

describe("what a date looks like", () => {
  for (const route of INVENTORY_ROUTES) {
    if (PRINTS_ISO.has(route)) continue;
    it(`is said in the reader's calendar: ${route}`, () => {
      const found = saidDates(renderToStaticMarkup(<InventoryScreen route={route} />));
      expect(found, `${route} shows ${found.join(", ")} — a stored day, not a said one`)
        .toEqual([]);
    });
  }

  /* ⚠️ AND THE SWEEP CAN SEE ONE, or every assertion above is about a screen
     with no dates on it. The label sheet is where ISO is correct. */
  it("still finds the one place ISO belongs", () => {
    expect(saidDates(renderToStaticMarkup(<InventoryScreen route="/labels" />)).length)
      .toBeGreaterThan(0);
  });
});

/* --------------------------------------------------- packaging and moving --- */

/**
 * THE LADDER ON THE SCREENS THAT USE IT.
 *
 * ⚠️ THE ARITHMETIC IS PROVED IN `packing.test.ts` AND THIS IS NOT THAT. What is
 * asserted here is what a person is asked and what they are told — a field
 * labelled in the wrong unit is a right answer typed into the wrong question,
 * and that is the shape that put nine hundred tablets on a shelf.
 *
 * ⚠️ AND A PICKER WITH ONE ENTRY IS A CONTROL ASKING A QUESTION IT HAS ALREADY
 * ANSWERED. Most products have no ladder, so the common case is the one where
 * none of this is drawn at all.
 */
describe("saying how many, in the words somebody is holding", () => {
  const AMOXI = [
    { name: "sheet", per: 10 },
    { name: "box", per: 3 },
  ];

  const line: Line = {
    id: "s-amx", product: "t-amx", name: "Amoxicillin 500mg", where: "p-a1",
    whereName: "A1", quantity: 97, unit: "tablet", tracking: "counted",
    seen: "2026-08-20T09:00:00.000Z",
  };

  const moving = (of: Partial<React.ComponentProps<typeof Move>> = {}) =>
    renderToStaticMarkup(
      <Move
        line={line}
        levels={AMOXI}
        shelves={[{ id: "p-b1", name: "B1" }]}
        onMove={() => undefined}
        back={() => undefined}
        {...of}
      />,
    );

  /*
    ⚠️ THE PICKER OFFERS THE BASE UNIT TOO. A ladder of "sheet" and "box" cannot
    express a handful of loose tablets, which is the state a shelf is in for most
    of the month — leaving it out makes the one thing the product is always
    counted in the one thing nobody can choose.
  */
  it("offers every rung and the base unit", () => {
    const out = moving();
    for (const word of ["tablet", "sheet", "box"]) expect(out).toContain(word);
  });

  it("draws no picker at all where the product has no ladder", () => {
    const out = moving({ levels: [] });
    expect(out).not.toContain("Counted in");
    expect(out).toContain("How many tablet");
  });

  /* ⚠️ THE SHELF IT IS ON IS NOT A DESTINATION. A move to where it already is
     writes two rows that cancel — the balance would be right, which is exactly
     why the picker must not offer it. */
  it("says so rather than offering nowhere to put it", () => {
    const out = moving({ shelves: [] });
    expect(out).toContain("nowhere else to put it");
  });

  it("names what is being moved and the shelf it leaves", () => {
    const out = moving();
    expect(out).toContain("Amoxicillin 500mg");
    expect(out).toContain("A1");
  });

  /*
    ⚠️ THE LABEL NAMES THE RUNG BELOW, which is the whole ergonomics of the
    editor. "How many sheets in a box" is a question somebody can answer; "how
    many tablets in a box" is a multiplication they should not be doing, and
    reading `per` as base units is silently wrong by a factor of the rung below.
  */
  it("asks each number in the pack below it, never in single units", () => {
    const out = renderToStaticMarkup(
      <Ladder unit="tablet" levels={AMOXI} onChange={() => undefined} />,
    );
    expect(out).toContain("How many tablets in one sheet?");
    expect(out).toContain("How many sheets in one box?");
    /* ⚠️ NEVER THE MULTIPLIED-OUT NUMBER. A box holds 3 sheets, not 30 tablets,
       and asking for the second is asking somebody to do arithmetic the screen
       is about to do anyway — wrongly, the first time they get it wrong. */
    expect(out).not.toContain("How many tablets in one box");
  });

  /*
    ⚠️ EVERY LABEL IS BUILT FROM WHAT IS ALREADY TYPED, AND THIS IS THE
    ASSERTION THAT SAYS SO. Reported as "I tried changing box and it didn't":
    the fields were headed "The smallest one has a name" and placeholdered
    "sheet"/"box" — fixed strings that stayed put whatever anybody counted in,
    so the control read as broken at exactly the moment somebody corrected
    themselves.
  */
  it("re-words itself around the unit somebody actually typed", () => {
    const out = renderToStaticMarkup(
      <Ladder unit="metre" levels={[{ name: "reel", per: 50 }]} onChange={() => undefined} />,
    );
    expect(out).toContain("What are the metres packed in?");
    expect(out).toContain("How many metres in one reel?");
    expect(out).toContain("Your totals stay in metres");
    expect(out).not.toContain("tablet");
    expect(out).not.toContain("sheet");
  });

  /* ⚠️ AND THE FEAR IT ANSWERS IS REAL. Somebody describing packaging wonders
     whether the numbers on their shelves are about to turn into something else.
     They are not, and one sentence under the control is where that belongs. */
  it("says the totals do not change, in the plural", () => {
    const out = renderToStaticMarkup(
      <Ladder unit="tablet" levels={AMOXI} onChange={() => undefined} />,
    );
    expect(out).toContain("Your totals stay in tablets");
  });

  it("invites a pack rather than assuming one", () => {
    const out = renderToStaticMarkup(
      <Ladder unit="tablet" levels={[]} onChange={() => undefined} />,
    );
    expect(out).toContain("Add the pack");
    expect(out).not.toContain("How many");
    /* ⚠️ AND SAYS NOTHING ABOUT TOTALS EITHER — a reassurance about a change
       nobody has made yet is a sentence that plants the worry it answers. */
    expect(out).not.toContain("Your totals stay");
  });
});

/* ------------------------------------------------------- registering a thing --- */

/**
 * ⚠️ THREE THINGS ABOUT THE FLOW ITSELF, ALL OF THEM REPORTED BY SOMEBODY USING
 * IT. What the wizard ASKS is the product; how many screens it takes to ask it
 * is the difference between a tool and an induction.
 */
describe("the register flow", () => {
  const register = () => html("/register");

  /*
    ⚠️ THE CAMERA AND THE NAME ARE ONE SCREEN. Asked separately, "start with a
    photo?" is a question about a feature to somebody who has not seen the form
    it fills in — and a step whose whole content is optional teaches people that
    this flow is a row of Next buttons.
  */
  it("opens with the camera and the name together", () => {
    const out = register();
    expect(out).toContain("What is it?");
    expect(out).toContain("Take a photo");
    expect(out).toContain("Name");
    expect(out).not.toContain("Start with a photo?");
  });

  /*
    ⚠️ AND NOTHING ANNOUNCES THE MODEL OVER THE WHOLE FLOW. A banner saying the
    photos were read sat above every question for the rest of the wizard, where
    the thing it is about is nine screens behind. What a model wrote is checkable
    at the review, which is where it is checked.
  */
  it("says nothing about a model over the question", () => {
    expect(register()).not.toContain("Read from the photos");
  });
});

/**
 * ⚠️ THE UNIT WAS THE FIELD PEOPLE FILLED IN WRONG, and the label was why. Asked
 * as "One is called", it takes the product's name, or the pack, or the plural —
 * all reasonable answers to those three words. Set inside the sentence it ends
 * up in, the shape of the right answer is visible before anybody types.
 */
describe("the unit is asked inside its own sentence", () => {
  const unit = () => renderToStaticMarkup(
    <Fills before="We have twelve" blank="boxes" after="of Nitrile gloves">
      <span />
    </Fills>,
  );

  it("puts the answer in the sentence it will be read in", () => {
    const out = unit();
    expect(out).toContain("We have twelve");
    expect(out).toContain("boxes");
    expect(out).toContain("of Nitrile gloves");
  });

  /* ⚠️ THE BLANK IS DRAWN WHETHER OR NOT IT IS FILLED — a rule that appears on
     the first keystroke takes the shape of the sentence with it. */
  it("draws the blank before there is an answer", () => {
    const out = renderToStaticMarkup(
      <Fills before="We have twelve" blank="" after="of it" waiting="……" />,
    );
    expect(out).toContain("……");
    expect(out).toContain('data-blank="waiting"');
  });
});

/**
 * ⚠️ THE FOUR RUNGS ARE THE HARDEST WORDING IN THE PRODUCT, and they were
 * written about an abstract thing. "Deliveries stay apart" is a rule somebody
 * has to apply to what is in their hand; naming the thing applies it for them.
 */
describe("what level of detail to keep, in the words of the thing", () => {
  it("names the product and counts in the unit somebody typed", () => {
    const said = detailOptions("box", "Nitrile gloves");
    const help = Object.fromEntries(said.map((o) => [o.id, o.help]));
    expect(help.listed).toContain("Nitrile gloves is on the list");
    expect(help.counted).toContain("in boxes");
    expect(help.batched).toContain("Deliveries of Nitrile gloves");
    expect(help.itemised).toContain("Each box has its own number");
  });

  /* ⚠️ THE EXAMPLES SURVIVE THE SUBSTITUTION. They are how somebody recognises
     which rung is theirs, and a sentence about their own product with no
     comparison in it is a sentence they still have to reason about. */
  it("keeps the kinds of thing each rung suits", () => {
    const help = detailOptions("litre", "Wall paint").map((o) => o.help).join(" ");
    expect(help).toContain("Screws, paper, gloves");
    expect(help).toContain("Medicine, food, chemicals, paint");
    expect(help).toContain("Machines, tools, laptops, gas cylinders");
  });

  /* ⚠️ AND IT READS WITH NOTHING FILLED IN. This step is reachable before the
     name is typed, and a sentence with a hole in it is worse than a general one. */
  it("reads as a general sentence before anything is named", () => {
    const help = Object.fromEntries(detailOptions("", "").map((o) => [o.id, o.help]));
    expect(help.listed).toContain("it is on the list");
    expect(help.itemised).toContain("Each one has its own number");
    expect(help.batched).not.toContain("of  ");
  });
});

/**
 * ⚠️ THE CASE'S BARCODE IS SCANNED WHERE THE CASE IS DESCRIBED, which removes a
 * multiplication the flow used to ask for. What it must not do is become a
 * second list of codes.
 */
describe("a barcode on a pack", () => {
  it("is offered on a rung that has a name, and not before", () => {
    const named = renderToStaticMarkup(
      <Ladder
        unit="tablet"
        levels={[{ name: "box", per: 10 }]}
        onChange={() => undefined}
        codeAt={() => null}
        onCode={() => undefined}
      />,
    );
    expect(named).toContain("Or type the number on the box");

    const blank = renderToStaticMarkup(
      <Ladder
        unit="tablet"
        levels={[{ name: "", per: 10 }]}
        onChange={() => undefined}
        codeAt={() => null}
        onCode={() => undefined}
      />,
    );
    expect(blank).not.toContain("Or type the number on");
  });

  /* ⚠️ AND IT IS NOT OFFERED AT ALL WHERE NOBODY WIRED IT — the ladder is used
     on screens that have no codes to attach one to. */
  it("is absent where the screen does not take one", () => {
    const out = renderToStaticMarkup(
      <Ladder unit="tablet" levels={[{ name: "box", per: 10 }]} onChange={() => undefined} />,
    );
    expect(out).not.toContain("Or type the number on");
  });

  /* ⚠️ THE READ CODE IS DRAWN AS THE FACT IT IS, with the way to undo it. */
  it("shows the code it holds, and offers to remove it", () => {
    const out = renderToStaticMarkup(
      <Ladder
        unit="tablet"
        levels={[{ name: "case", per: 4 }]}
        onChange={() => undefined}
        codeAt={() => "5012345678900"}
        onCode={() => undefined}
        onUncode={() => undefined}
      />,
    );
    expect(out).toContain("5012345678900");
    expect(out).toContain("Remove the barcode on the case");
  });
});

/**
 * ⚠️ THE REVIEW IS A SENTENCE ABOUT THE THING, NOT A LIST OF FACTS ABOUT A
 * RECORD. Eight rows of the same shape is a form with the fields removed and it
 * gets scrolled past; one paragraph is read in a pass, and a wrong word in a
 * sentence stands out in a way a wrong row never does.
 */
describe("the review reads as one sentence", () => {
  const review = () => renderToStaticMarkup(
    <Story
      asks={[
        { id: "a", ask: "What is it?", part: { lead: "This is", said: "Nitrile gloves" }, children: null },
        { id: "b", ask: "What is one?", part: { lead: "counted in", said: "boxes" }, children: null },
        { id: "c", ask: "Where does it live?", part: { lead: "keep it", said: null }, children: null },
        { id: "d", ask: "Any barcodes?", says: "Two barcodes", children: null },
      ]}
      at="review"
      onGo={() => undefined}
      does={{ op: "product.register", label: "Add it", onDo: () => undefined }}
      review={{ lead: <img src="data:," alt="The main picture" /> }}
    />,
  );

  it("joins the answered parts into one line", () => {
    const out = review();
    expect(out).toContain("This is");
    expect(out).toContain("Nitrile gloves");
    expect(out).toContain("counted in");
    expect(out).toContain("boxes");
  });

  /* ⚠️ AN UNANSWERED PART IS A VISIBLE GAP IN THE SENTENCE, which is the whole
     reason a review exists: a list of what WAS answered cannot show an omission. */
  it("leaves a blank where nothing was said", () => {
    expect(review()).toContain('data-blank="waiting"');
  });

  /* ⚠️ AND A STEP WITH NO PART KEEPS ITS ROW. A list of barcodes is not a clause,
     and forcing it into one would be prose for its own sake. */
  it("keeps a row for a step that is not in the sentence", () => {
    expect(review()).toContain("Two barcodes");
  });

  /* ⚠️ THE PICTURE IS THE FASTEST CHECK ON THE SCREEN — somebody recognises the
     wrong box before reading a word. */
  it("leads with the main picture", () => {
    expect(review()).toContain("The main picture");
  });
});
