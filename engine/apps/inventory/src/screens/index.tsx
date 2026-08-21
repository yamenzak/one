/**
 * ONEINVENTORY'S BROWSER HALF — the screens, and the ground they are looked at on.
 *
 * ⚠️ SEPARATE FROM THE MANIFEST ON PURPOSE. `../index.ts` is imported by the
 * WORKER, and a worker that imported React would pay for it in startup CPU on
 * every cold start (D3). The manifest declares the screens; this is what draws
 * them, and only a browser ever loads it.
 *
 * ⚠️ EVERY SCREEN TAKES ITS DATA AS PROPS, WHICH IS WHAT MAKES THIS A GROUND.
 * Nothing here fetches, so any screen renders with no session, no worker and no
 * database — which is how anybody looks at the interface at all. An inventory is
 * the hardest product in this repo to photograph any other way: the interesting
 * states are a line that ran out, one nobody has touched since spring, and a
 * shelf somebody labelled and never filled, and reaching all three through a
 * real database means four hours of data entry before the first screenshot.
 *
 * ⚠️ AND THE STATE LIVES HERE RATHER THAN IN THE SCREENS. A screen that owned
 * its own place-in-the-tree could not be rendered into a chosen one, and
 * rendering a chosen state is the whole reason this file exists.
 */

import * as React from "react";
import { ready, type Loaded } from "@engine/design";
import { INVENTORY } from "../index.js";
import { LINES, PLACES, EMPTY_PLACE, type Line, type Place } from "./sample.js";
import { Ask, type Answer } from "./Ask.js";
import { Count, type Change, type Counted, type Uncovered } from "./Count.js";
import { Item, type Kept } from "./Item.js";
import { Kit, type Member, type Missing } from "./Kit.js";
import { Receive } from "./Receive.js";
import { Scan, type Guess, type Seen } from "./Scan.js";
import { Start } from "./Start.js";
import { Stock } from "./Stock.js";
import { Thing, type Batch, type Movement } from "./Thing.js";
import { Where } from "./Where.js";

export { Ask, Count, Item, Kit, Receive, Scan, Start, Stock, Thing, Where };
export * from "./sample.js";
export type {
  Answer, Batch, Change, Counted, Guess, Kept, Member, Missing, Movement, Seen,
  Uncovered,
};

const nothing = () => undefined;

/**
 * ⚠️ THE ROUTES COME FROM THE MANIFEST, NOT FROM A LIST HERE. A second list is a
 * second answer to "what screens does this app have", and they drift in the
 * direction nobody notices — a screen declared and never drawn renders a notice,
 * which reads as unfinished rather than as a mistake.
 */
export const INVENTORY_ROUTES: readonly string[] =
  (INVENTORY.screens ?? []).map((s) => s.route);

/** What ticks the guide, and how many times. Sample, like everything else here. */
const DONE = ["location.created", "product.created"];
const COUNTS = { "product.created": 12, "stock.received": 40 };
const HELD = new Set([
  "product:read", "product:write", "location:read", "location:write",
  "stock:read", "stock:move", "stock:adjust", "ledger:read",
]);

/**
 * ⚠️ A CODE THIS WORKSPACE HAS NEVER SEEN, which is the state the whole learning
 * path exists for and the one a real database would take four hours of data
 * entry to reach. The carrier brought a lot and an expiry, so the card shows
 * what a good label buys even before anybody knows what the product is.
 */
const SCANNED: Seen = {
  found: false, kind: "gs1", value: "05000112637922", ours: "",
  product: "", name: "", tracking: "", unit: "", pack: 1,
  lot: "A5B7", expiry: "2027-03-31", needs: "",
};

/**
 * ⚠️ ONE PRODUCT'S HISTORY, AND IT IS A DISAGREEMENT RATHER THAN A TIDY LIST.
 * Two receipts, a take, and a correction that says why — because the pair the
 * screen exists to keep apart is "we used forty" against "somebody wrote it down
 * wrong", and a history made only of receipts shows neither.
 */
const HISTORY: readonly Movement[] = [
  { id: "m4", move: "adjusted", delta: -60, at: "2026-08-20T09:12:00.000Z",
    who: "Dana", where: "A1", reason: "Counted the shelf — two boxes were never received",
    capture: "typed" },
  { id: "m3", move: "taken", delta: -400, at: "2026-08-14T07:05:00.000Z",
    who: "Ruth", where: "A1", capture: "scanned" },
  { id: "m2", move: "received", delta: 800, at: "2026-08-02T13:40:00.000Z",
    who: "Dana", where: "A1", capture: "scanned" },
  { id: "m1", move: "received", delta: 860, at: "2026-07-19T10:15:00.000Z",
    who: "Dana", where: "A1", capture: "ai-assisted" },
];

/**
 * ⚠️ THREE DELIVERIES OF ONE PRODUCT, AND ALL THREE STANDINGS AT ONCE. A list
 * where everything is fine photographs as a list nobody needs; what this screen
 * has to survive is the box that went out last week sitting above the one that
 * goes next Tuesday — and the one whose 2028 date is beaten by having been
 * opened, which is the case a person does not expect.
 */
const BATCHES: readonly Batch[] = [
  { id: "b3", lot: "A5B7", on: "2026-08-14", by: "printed", standing: "gone",
    days: -7, opened: false },
  { id: "b1", lot: "C0921", on: "2026-08-25", by: "opened", standing: "soon",
    days: 4, opened: true },
  { id: "b2", lot: "C1144", on: "2027-03-31", by: "printed", standing: "fine",
    days: 222, opened: false },
];

/**
 * ⚠️ A COUNT MID-FLIGHT, WITH ONE OF EACH KIND OF DISAGREEMENT IN IT. A session
 * where everything agrees photographs as a list of correct numbers and teaches
 * nothing; what a person has to be able to read at a glance is a shelf that is
 * short, one that has more than anybody thought, and one nobody has found at all.
 */
const COUNTED: readonly Counted[] = [
  { id: "t-glove", name: "Nitrile gloves, blue", unit: "glove", found: 1_180, expected: 1_200 },
  { id: "t-screw", name: "Screws, M4 × 20", unit: "box", found: 140, expected: 137 },
  { id: "t-tape", name: "Masking tape, 50 mm", unit: "roll", found: 6, expected: null },
];

const CHANGES: readonly Change[] = [
  { product: "t-glove", name: "Nitrile gloves, blue", was: 1_200, found: 1_180, delta: -20 },
  { product: "t-paper", name: "A4 paper", was: 5, found: 0, delta: -5 },
  { product: "t-screw", name: "Screws, M4 × 20", was: 137, found: 140, delta: 3 },
];

/**
 * ⚠️ A SHELF NOBODY HAS EVER COUNTED, ONE COUNTED YEARS AGO, AND ONE DONE TODAY.
 * The first two are different problems and the third is what a covered shelf
 * looks like — a list where everything is stale teaches nothing about the order.
 */
const UNCOUNTED: readonly Uncovered[] = [
  { location: "p-b2", name: "B2", days: null },
  { location: "p-a3", name: "A3 — flammables", days: 412 },
  { location: "p-bench", name: "Bench", days: 0 },
];

/**
 * ⚠️ ONE OBJECT WITH A LIFE ON IT, AND IT IS OUT WITH SOMEBODY. An item sitting
 * on a shelf with nothing booked photographs as a name and a blank card; what
 * this screen exists for is the drill somebody borrowed, the inspection that is
 * overdue and the count of services beside them.
 */
const KEPT: Kept = {
  id: "u-drill", code: "ONE-U-4K2PX9M", name: "Hammer drill, 18 V",
  product: "t-drill", serial: "DW-884213", life: "issued",
  where: "Van 2 · Rack", holder: "Ana Ruiz", issued: "2026-08-11",
  due: "2026-08-18", standing: "gone", days: -3, services: 4,
  retired: "", note: "",
};

/**
 * ⚠️ ONE MOVEMENT PER ACT, WHICH IS WHAT AN OBJECT'S HISTORY IS. It came in, it
 * went out, it came back, it went out again — the same four verbs a quantity
 * has, over one thing, which is the whole claim of the itemised rung.
 */
const ITEM_HISTORY: readonly Movement[] = [
  { id: "i3", move: "taken", delta: -1, at: "2026-08-11T06:50:00.000Z",
    who: "Ana", where: "Van 2 · Rack", reason: "Issued to Ana Ruiz", capture: "typed" },
  { id: "i2", move: "received", delta: 1, at: "2026-07-30T15:20:00.000Z",
    who: "Dana", where: "Van 2 · Rack", reason: "Back from Ana Ruiz", capture: "typed" },
  { id: "i1", move: "received", delta: 1, at: "2026-05-04T08:00:00.000Z",
    who: "Dana", where: "Van 2 · Rack", capture: "scanned" },
];

/**
 * ⚠️ A TRAY MID-ASSEMBLY, WITH BOTH KINDS OF WRONG IN IT AT ONCE. One thing
 * missing and one thing in it that does not belong is the state the check exists
 * for — a complete tray photographs as a tidy list and teaches nothing about
 * which half of the screen a person reads first.
 */
const MEMBERS: readonly Member[] = [
  { id: "u-scissors", name: "Scissors, straight", code: "ONE-U-8J1QW4", stray: false },
  { id: "u-forceps", name: "Forceps, 14 cm", code: "ONE-U-2M7RT0", stray: false },
  { id: "u-probe", name: "Probe, blunt", code: "ONE-U-5D3KL8", stray: true },
];

const MISSING: readonly Missing[] = [
  { product: "t-clamp", name: "Clamp, curved", want: 2, have: 0 },
  { product: "t-forceps", name: "Forceps, 14 cm", want: 2, have: 1 },
];

/**
 * ⚠️ WHAT A MODEL MADE OF A CODE NOBODY HAD SEEN, with the rung and its REASON,
 * because that pair is the whole claim: a suggestion somebody agrees with in
 * half a second, or does not. A guess with no reason on it is a magic answer.
 */
const GUESSED: Guess = {
  name: "Isopropanol 99%, 1 L", brand: "Fisher", category: "Solvents",
  unit: "bottle", pack: 1, tracking: "batched",
  why: "It carries an expiry date and a flammable pictogram",
  storage: "Keep below 25°C, away from ignition sources",
  hazards: ["Flammable liquid", "Serious eye irritation"],
};

/**
 * ⚠️ AN ANSWER THAT NAMES A PLACE, which is the whole difference between asking
 * in words and searching. And it read fewer lines than the workspace holds — the
 * bound is the state worth photographing, because an answer that does not say it
 * is bounded is "you have none" over a shelf that has some.
 */
const ANSWERED: Answer = {
  answer: "Yes — 6 rolls of masking tape on the Bench, and 4 more in Rack A · A2.",
  looked: 2,
};

/** ⚠️ Everything at or below a place, which is what a tree row promises. */
const under = (places: readonly Place[], here: string | null): ReadonlySet<string> => {
  const held = new Set<string>();
  if (!here) return held;
  held.add(here);
  /* Bounded by the node count: a parent pointer somebody typed in a circle must
     not hang the screen it is drawn on. */
  for (let pass = 0; pass < places.length; pass++) {
    for (const p of places) {
      if (p.of && held.has(p.of)) held.add(p.id);
    }
  }
  return held;
};

/**
 * Every screen with the sample world behind it, keyed by its declared route.
 * This is what the test ground renders and what a screenshot sweep walks.
 */
export function InventoryScreen({ route, onGo }: {
  readonly route: string;
  /** ⚠️ Absent on the ground, where there is no router to go anywhere with. */
  readonly onGo?: (route: string) => void;
}) {
  /* ⚠️ WHERE THE READER IS IN THE TREE — an address in the real app and state
     here, because this file is the ground rather than a router. */
  const [here, setHere] = React.useState<string | null>(null);
  const go = onGo ?? nothing;

  /* ⚠️ THE NAME COMES FROM THE MANIFEST. A screen titled by its own file is a
     screen whose name and whose nav entry are two facts that can disagree. */
  const title = (INVENTORY.screens ?? []).find((sc) => sc.route === route)?.label;

  const reach = under(PLACES, here);
  const lines: Loaded<readonly Line[]> = ready(
    here ? LINES.filter((l) => reach.has(l.where)) : LINES);

  switch (route) {
    /* ⚠️ THE SHELF NOBODY HAS FILLED, WHICH IS THE SECOND SCREEN ANYBODY SEES.
       A place with a name and nothing on it is a real state rather than an
       omission, and the ground would never reach it by accident. */
    case "/where": {
      const place = PLACES.find((p) => p.id === EMPTY_PLACE) ?? PLACES[0] as Place;
      return (
        <Where
          place={place}
          places={PLACES}
          of={ready(LINES.filter((l) => l.where === place.id))}
          again={nothing}
          back={() => go("/")}
          onGo={setHere}
          onOpen={() => go("/thing")}
          onLabel={nothing}
          onCopy={nothing}
        />
      );
    }
    /* ⚠️ THE LINE WITH THE MOST HISTORY, because the history is the half of this
       screen worth looking at — a product with one receipt on it photographs as
       a heading and a row. */
    case "/thing":
      return (
        <Thing
          line={LINES[0] as Line}
          history={ready(HISTORY)}
          batches={BATCHES}
          /* ⚠️ EMPTY, BECAUSE THIS ONE IS A BATCHED PRODUCT. A counted or
             batched thing has a number and no named ones — the ground draws the
             product it has rather than a mixture no rung produces. */
          pieces={[]}
          again={nothing}
          back={() => go("/")}
          onTake={nothing}
          onOpen={nothing}
          onPiece={nothing}
        />
      );
    /* ⚠️ THE GROUND SHOWS THE ANSWER RATHER THAN THE CAMERA'S FIRST SECOND. A
       viewfinder photographs as a black rectangle with no permission behind it,
       so what is worth looking at here is the card under it — and the state that
       matters most is the one nobody designs: a code this workspace has never
       seen. */
    case "/scan":
      return (
        <Scan
          title={title}
          of={ready(SCANNED)}
          products={LINES.map((l) => ({ id: l.product, label: l.name }))}
          /* ⚠️ THE SUGGESTION IS ON THE GROUND, because it is the state worth
             looking at: a code nobody has seen, filled in by a model, waiting
             for somebody to agree with it. `null` would photograph as the
             screen before anybody pressed anything. */
          guess={ready(GUESSED)}
          onRead={nothing}
          onOpen={() => go("/thing")}
          onPlace={() => go("/where")}
          onLearn={nothing}
          onIdentify={nothing}
          onLabel={nothing}
          onAdd={nothing}
          again={nothing}
        />
      );
    /* ⚠️ ANSWERED RATHER THAN EMPTY, and the answer names a place — which is the
       whole difference between this and a search box. */
    case "/ask":
      return (
        <Ask
          title={title}
          of={ready(ANSWERED)}
          lines={LINES.length}
          onAsk={nothing}
          again={nothing}
        />
      );
    /* ⚠️ MID-FLOW, WITH THE INTERESTING SCAN IN IT. A receive screen photographed
       at step one is a camera and nothing else; what is worth looking at is a
       code nobody has seen sitting over a shelf that is already set, which is
       the state rule 3 exists for. */
    case "/receive":
      return (
        <Receive
          title={title}
          place={{ id: "p-a1", name: "Rack A · A1" }}
          seen={SCANNED}
          onRead={nothing}
          onForget={nothing}
          onReceive={nothing}
          onUndo={nothing}
        />
      );
    case "/count":
      return (
        <Count
          title={title}
          place={{ id: "p-a1", name: "Rack A · A1" }}
          blind={false}
          onBlind={nothing}
          counting
          of={ready(COUNTED)}
          changes={CHANGES}
          stutter="That code read three times in two seconds — check it is three things"
          uncounted={UNCOUNTED}
          onGo={nothing}
          onRead={nothing}
          onStart={nothing}
          onClose={nothing}
          again={nothing}
        />
      );
    /* ⚠️ THE ONE THAT IS OUT AND OVERDUE, because a held item with nothing
       booked is a name and two blank rows. Every act this screen has is decided
       by the standing, so the ground shows the standing that has the most. */
    case "/item":
      return (
        <Item
          of={KEPT}
          history={ready(ITEM_HISTORY)}
          again={nothing}
          back={() => go("/thing")}
          onIssue={nothing}
          onReturn={nothing}
          onServe={nothing}
          onRetire={nothing}
        />
      );
    /* ⚠️ MID-ASSEMBLY, SHORT ONE THING AND HOLDING ONE THAT DOES NOT BELONG. A
       complete tray is a tidy list; this is the state the check exists for. */
    case "/kit":
      return (
        <Kit
          title={title}
          name="Minor surgery tray"
          code="ONE-K-7QP2XL9"
          state="open"
          built=""
          where="Theatre 1 · Store"
          of={ready(MEMBERS)}
          missing={MISSING}
          again={nothing}
          back={() => go("/thing")}
          onRead={nothing}
          onOpen={() => go("/item")}
          onTake={nothing}
          onBuild={nothing}
          onBreak={nothing}
        />
      );
    case "/start":
      return <Start title={title} done={DONE} counts={COUNTS} held={HELD} onGo={go} />;
    /* ⚠️ THE DEFAULT IS THE APP'S FIRST DECLARED SCREEN, not a blank. An
       unrecognised route rendering nothing is the same picture as a page that
       failed to load, and only one of them gets reported. */
    default:
      return (
        <Stock
          title={title ?? "Stock"}
          of={lines}
          places={PLACES}
          here={here}
          again={nothing}
          onGo={setHere}
          onOpen={() => go("/thing")}
          onAdd={nothing}
        />
      );
  }
}
