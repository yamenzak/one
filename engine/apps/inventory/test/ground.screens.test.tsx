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
import {
  Count, INVENTORY_ROUTES, InventoryScreen, Receive, Scan,
  type Seen, type Uncovered,
} from "../src/screens/index.js";
import { LINES, PLACES, EMPTY_PLACE } from "../src/screens/sample.js";
import { Ask, type Answer } from "../src/screens/Ask.js";
import { Item, type Kept } from "../src/screens/Item.js";
import type { Guess } from "../src/screens/Scan.js";
import { Kit, type Member, type Missing } from "../src/screens/Kit.js";

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
/* ⚠️ MODULE SCOPE, because two suites drive this screen: what a scan resolved to,
   and what a model made of one. Two copies of the harness is two places to keep
   the prop list right. */
const seen = (of: Partial<Seen>): Seen => ({
  found: false, kind: "gtin", value: "05000112637922", ours: "",
  product: "", name: "", tracking: "", unit: "", pack: 1,
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
    the most dangerous write in this product — so the control disappears rather
    than becoming a button that argues.
  */
  it("offers to record an opening only where one has not happened", () => {
    expect(out.match(/>Opened</g)?.length).toBe(2);
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
    product: "", name: "", tracking: "", unit: "", pack: 1,
    lot: "", expiry: "", needs: "", ...of,
  });

  const drawn = (place: { id: string; name: string } | null, of: Seen | null) =>
    renderToStaticMarkup(
      <Receive
        place={place}
        seen={of}
        onRead={() => undefined}
        onForget={() => undefined}
        onReceive={() => undefined}
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
     commonest wrong number in inventory work. */
  it("says what a carton holds", () => {
    const out = drawn({ id: "p-a1", name: "A1" }, seen({ found: true, pack: 10, unit: "glove" }));
    expect(out).toContain("10 glove");
    expect(out).toContain("Scanning it adds that many");
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
    expect(out).toContain("Read ");
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
