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
import { Case, type Used } from "./Case.js";
import { Run, type Covered } from "./Run.js";
import { Work, type Jobs, type Runs } from "./Work.js";
import { Due, type Dated } from "./Due.js";
import { Labels, type Labelled } from "./Labels.js";
import { Reports, type Reported } from "./Reports.js";
import { WORDS } from "../words.js";
import { Count, type Change, type Counted, type Uncovered } from "./Count.js";
import { Item, type Kept } from "./Item.js";
import { Kit, type Member, type Missing } from "./Kit.js";
import { Receive, keyOf, type Noted } from "./Receive.js";
import { Scan, type Guess, type Seen } from "./Scan.js";
import { Start } from "./Start.js";
import { Stock } from "./Stock.js";
import { Home } from "./Home.js";
import { Thing, type Batch, type Movement } from "./Thing.js";
import { Where } from "./Where.js";
import { Import, MAPPABLE, type Seen as Seeing } from "./Import.js";
import { Suppliers, type Supplier } from "./Suppliers.js";

export {
  Ask, Case, Count, Due, Item, Kit, Labels, Receive, Reports, Run, Scan, Start, Stock,
  Thing, Where, Work,
};
export * from "./sample.js";
export type {
  Answer, Batch, Change, Counted, Covered, Guess, Jobs, Kept, Member, Missing,
  Movement, Noted, Runs, Seen, Uncovered, Used,
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
/* ⚠️ TWO AXES: what the workspace has ever done, and what THIS person has —
   the specimen shows somebody invited into a shelf that was already set up. */
const RAISED = { workspace: ["location.created", "product.created"], person: [] };
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

/**
 * ⚠️ A DELIVERY NOTE AS A MODEL READ IT, and not a tidy one. A page carries lines
 * with a lot and a date, lines with neither, and lines whose code nobody here has
 * ever seen — and the screen has to be readable with all three on it at once.
 */
const NOTED: readonly Noted[] = [
  { code: "05000112637922", name: "Nitrile gloves, blue", quantity: 8,
    lot: "A5B7", expiry: "2027-03-31" },
  { code: "", name: "Masking tape, 50 mm", quantity: 12, lot: "", expiry: "" },
  { code: "04012345678901", name: "Isopropanol 99%, 1 L", quantity: 4,
    lot: "C0921", expiry: "2028-01-31" },
  { code: "", name: "Screws, M4 × 20", quantity: 2, lot: "", expiry: "" },
];

/**
 * ⚠️ SIXTY-ONE PER CENT RECORDED, WHICH IS A REAL WORKSPACE AND NOT A GOOD ONE.
 * A ground at a hundred per cent would photograph the one month nobody needs a
 * report for — and the whole reason this figure leads the screen is that it is
 * the number an inventory product is never willing to show.
 */
const REPORTED: Reported = {
  told: { recorded: 610, inferred: 390, share: 0.61 },
  used: [
    { product: "p-glove", name: "Nitrile gloves, M", quantity: 640 },
    { product: "p-ipa", name: "Isopropanol 99%", quantity: 210 },
    { product: "p-tape", name: "Masking tape, 50 mm", quantity: 96 },
    { product: "p-oil", name: "Cutting fluid, 5 L", quantity: 54 },
  ],
  /* ⚠️ ONE SHELF SHORT AND ONE BOTH WAYS, because a report that netted the two
     directions off would draw the second as almost fine. */
  losses: [
    { product: "p-glove", name: "Nitrile gloves, M", lost: 84, found: 0 },
    { product: "p-screw", name: "Screws, M4 × 20", lost: 40, found: 38 },
  ],
  /* ⚠️ THE FAST ONE FIRST EVEN THOUGH IT HAS MORE ON THE SHELF, which is the
     ordering the whole reorder report turns on. */
  /* ⚠️ ONE WITH A SUPPLIER AND ONE WITHOUT, because "who to ring" has to look
     right on a row where nobody has said. */
  buy: [
    { product: "p-glove", name: "Nitrile gloves, M", onHand: 64, cover: 3,
      order: 90, why: "runs out first", unit: "box", supplier: "Medline" },
    { product: "p-ext", name: "Fire extinguisher, CO₂ 5 kg", onHand: 1, cover: Infinity,
      order: 3, why: "below the line", unit: "item", supplier: "" },
  ],
  daily: Array.from({ length: 30 }, (_, i) => ({
    day: `2026-07-${String(23 + i).padStart(2, "0")}`,
    /* ⚠️ QUIET WEEKENDS AND A WEEKDAY THAT DRIFTS, because the gaps are the
       shape of a working month and the days between them are not noise. A
       modulo scattered the weekdays across the full range, which drew a
       sawtooth — and a chart that looks like a rendering fault is a poor
       photograph of a chart that works. */
    quantity: i % 7 === 5 || i % 7 === 6 ? 0 : 26 + Math.round(9 * Math.sin(i / 2.6)),
  })),
};

/**
 * ⚠️ A PREVIEW WITH ALL THREE VERDICTS IN IT, AND A REFUSAL THAT IS NOT THE LAST
 * ROW. The whole reason this screen exists is that an import can be wrong in a
 * way that looks like success — a ground showing four clean new products
 * photographs the case nobody needed a preview for.
 *
 * ⚠️ AND THE MAPPING IS DELIBERATELY IMPERFECT. `supplier` is unmapped because
 * the sheet has no such column, which is what the "Leave it out" option looks
 * like when it is the honest answer rather than a correction.
 */
const SEEN_SHEET: Seeing = {
  header: ["product name", "brand", "ean", "qty", "shelf"],
  columns: { name: 0, brand: 1, code: 2, quantity: 3, location: 4 },
  tally: { new: 2, update: 1, refused: 1 },
  rows: [
    { line: 2, verdict: "new", why: "", name: "Nitrile gloves, M", code: "5012345678900",
      location: "Store room", supplier: "Medline", quantity: 40 },
    { line: 3, verdict: "update", why: "", name: "Isopropanol 99%", code: "5012345678917",
      location: "Cabinet 2", supplier: "", quantity: 6 },
    /* ⚠️ THE ONE THAT MATTERS: a quantity with nowhere to put it. Imported
       anyway it would be a product created without its stock, and half an import
       is worse than none. */
    { line: 4, verdict: "refused", why: "A quantity with no place", name: "Masking tape",
      code: "", location: "", supplier: "", quantity: 12 },
    { line: 5, verdict: "new", why: "", name: "Cutting fluid, 5 L", code: "",
      location: "Bay 1", supplier: "", quantity: 4 },
  ],
};

/**
 * ⚠️ ONE WITH A LEAD TIME AND ONE WITHOUT, because the row has to read right in
 * both — a supplier nobody has asked how long they take falls back to the
 * workspace's number, and the list is where somebody notices they should ask.
 */
const SUPPLYING: readonly Supplier[] = [
  { id: "s-1", name: "Medline", contact: "Dana", email: "orders@medline.example",
    phone: "+49 30 1234 5678", account: "MED-4471", leadDays: 3, note: "",
    products: 42 },
  { id: "s-2", name: "Kaufmann Chemie", contact: "", email: "", phone: "+49 89 22 33 44",
    account: "", leadDays: 21, note: "Solvents only", products: 8 },
  { id: "s-3", name: "The hardware shop on the corner", contact: "", email: "",
    phone: "", account: "", leadDays: null, note: "", products: 1 },
];

/**
 * ⚠️ A CLASSIFIED SUBSTANCE AND AN ORDINARY ONE, because the decant label has to
 * look right with and without diamonds. The first is what a workshop actually
 * pours into a bottle; the second is the case where a hazard section would be an
 * empty band across a 62 mm label if the layout assumed one.
 */
const TO_LABEL: readonly Labelled[] = [
  {
    id: "p-ipa", name: "Isopropanol 99%", code: "ONE-P-7QP2XL9", under: "Reagent grade",
    /* ⚠️ THREE, AND ONE OF THEM IS A PHRASE. Every hazard on this bottle was a
       single word, so a diamond printing only a name's FIRST word looked correct
       on the one screen anybody photographs — and "Gas under pressure" would
       have read "Gas" on a real cylinder. GHS08 is the phrase, and isopropanol
       genuinely carries it. */
    hazards: ["GHS02", "GHS07", "GHS08"], signal: "danger",
    hazardText: "Highly flammable liquid and vapour. Causes serious eye irritation.",
    precautions: "Keep away from heat. Wear eye protection. IF IN EYES: rinse cautiously.",
  },
  {
    id: "p-oil", name: "Cutting fluid, 5 L", code: "ONE-P-4K2PB81", under: "Workshop",
    hazards: [], signal: "", hazardText: "", precautions: "",
  },
];

/**
 * ⚠️ ONE GONE, ONE GOING, ONE FINE — and the middle one is out of date because it
 * was OPENED, not because of the date printed on it. That row is the reason the
 * screen says which clock won: a box with a 2028 date on it that somebody opened
 * last month is the answer people find surprising, and a fixture without one
 * teaches the wrong thing about the column.
 */
const DATED: readonly Dated[] = [
  { id: "b-1", product: "p-milk", name: "Milk, 2 L", which: "Lot 4471",
    on: "2026-08-19", standing: "gone", days: -2, by: "printed" },
  { id: "b-2", product: "p-lube", name: "Cutting fluid, 5 L", which: "Lot C0921",
    on: "2026-08-27", standing: "soon", days: 6, by: "opened" },
  { id: "b-3", product: "p-ipa", name: "Isopropanol 99%, 1 L", which: "Lot C0922",
    on: "2028-01-31", standing: "fine", days: 528, by: "printed" },
];

/* ⚠️ A SERVICE THAT IS ALREADY OVERDUE, because that is the row somebody has to
   book somebody else for — and it is a different working day from a carton of
   milk, which is why it is not in the list above. */
const SERVICES: readonly Dated[] = [
  { id: "u-1", product: "p-ext", name: "Fire extinguisher, CO₂ 5 kg",
    which: "Serial FX-88231", on: "2026-08-11", standing: "gone", days: -10, by: "" },
];

/**
 * ⚠️ A DAY WITH ALL FIVE STANDINGS IN IT, because the screen is a triage list and
 * a list where everything is fine teaches nothing about the order. The one
 * waiting to be released is the only row anybody has to act on, and it is what
 * this fixture exists to put at the top.
 */
const RUNNING: readonly Runs[] = [
  { id: "r-2", kind: "Autoclave 134°C", machine: "Autoclave 1", state: "ended",
    started: "2026-08-21", items: 6 },
  { id: "r-1", kind: "Autoclave 134°C", machine: "Autoclave 2", state: "open",
    started: "2026-08-21", items: 4 },
  { id: "r-0", kind: "Annual calibration", machine: "Torque bench", state: "released",
    started: "2026-08-14", items: 2 },
  { id: "r-x", kind: "Autoclave 134°C", machine: "Autoclave 1", state: "recalled",
    started: "2026-08-07", items: 5 },
];

/**
 * ⚠️ A JOB THAT ACQUIRED A CONCERN AFTER IT CLOSED, which is the whole reason the
 * trace is a query. Nothing about the job changed; a recall landed on a lot it
 * used, and the LIST learned it.
 */
const CASES: readonly Jobs[] = [
  { id: "j-2", ref: "WO-4471", label: "Bay 3 service", state: "open",
    opened: "2026-08-21", doubted: 0 },
  { id: "j-1", ref: "WO-4468", label: "Bay 1 service", state: "closed",
    opened: "2026-08-07", doubted: 2 },
];

/**
 * ⚠️ ONE OF EACH VERDICT, INCLUDING THE ONE THAT HAS TO BE EXACT. "Unfrozen —
 * still not released" is the whole quarantine rule in four words, and a fixture
 * without it photographs a screen that never has to say the difficult thing.
 */
const COVERED: readonly Covered[] = [
  { batch: "b-1", lot: "A5B7", name: "Instrument tray, minor", verdict: "released",
    reason: "", quantity: 4 },
  { batch: "b-2", lot: "C0921", name: "Instrument tray, minor", verdict: "failed",
    reason: "Indicator did not turn", quantity: 2 },
  { batch: "b-3", lot: "C1144", name: "Gauze packs", verdict: "lifted",
    reason: "Re-wrapped and queued for the next cycle", quantity: 12 },
  { batch: "b-4", lot: "D0102", name: "Forceps set", verdict: "pending",
    reason: "", quantity: 1 },
];

/** ⚠️ Two lines in question out of five — the state the screen is for. */
const USED: readonly Used[] = [
  { movement: "u-5", product: "t-tray", name: "Instrument tray, minor", quantity: 1,
    lot: "C0921", at: "2026-08-07T09:20:00.000Z", doubt: "held" },
  { movement: "u-4", product: "t-gauze", name: "Gauze packs", quantity: 6,
    lot: "C1144", at: "2026-08-07T09:22:00.000Z", doubt: "not released" },
  { movement: "u-3", product: "t-glove", name: "Nitrile gloves, blue", quantity: 4,
    lot: "", at: "2026-08-07T09:24:00.000Z", doubt: "" },
  { movement: "u-2", product: "t-swab", name: "Swabs", quantity: 10,
    lot: "", at: "2026-08-07T09:25:00.000Z", doubt: "" },
];

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
    /*
      ⚠️ A WORKSPACE WITH SOMETHING WRONG WITH IT, WHICH IS THE ONLY HOME WORTH
      PHOTOGRAPHING. A ground where nothing is running out, no count is open and
      no run is waiting draws the one state this screen was not built for — and
      the empty case is a single note, which is not a picture of the screen.

      ⚠️ AND THE CHECKLIST IS STILL UNFINISHED, from the same `RAISED` every
      other specimen uses: somebody invited into a shelf that was already set up,
      whose own first delivery is still in front of them.
    */
    case "/":
      return (
        <Home
          title={title}
          said={WORDS.clinic.said}
          of={ready({ lines: LINES.length, products: 214, places: PLACES.length })}
          again={nothing}
          needs={{ due: 6, counts: 1, runs: 2 }}
          moving={ready({
            share: REPORTED.told.share,
            out: REPORTED.told.recorded,
            short: REPORTED.losses.reduce((n, one) => n + one.lost, 0),
            buy: REPORTED.buy.length,
            daily: REPORTED.daily,
          })}
          raised={RAISED}
          held={HELD}
          onGo={go}
          onReceive={() => go("/receive")}
          onLabels={() => go("/labels")}
          onImport={() => go("/import")}
          onSuppliers={() => go("/suppliers")}
          onDue={() => go("/due")}
          onCounts={() => go("/count")}
          onRuns={() => go("/work")}
          onReports={() => go("/reports")}
          onStart={() => go("/start")}
        />
      );
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
          onLabel={nothing}
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
          /* ⚠️ A NOTE HALF WORKED THROUGH, which is the state worth looking at:
             one line ticked, three to go. A fresh list photographs as a list. */
          note={ready(NOTED)}
          done={new Set([keyOf(NOTED[0] as Noted)])}
          onRead={nothing}
          onForget={nothing}
          onReceive={nothing}
          onUndo={nothing}
          onNote={nothing}
          onLine={nothing}
          again={nothing}
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
    /*
      ⚠️ THE THREE STANDINGS AT ONCE, BECAUSE THE SCREEN IS A TRIAGE LIST. One
      already out of date, one inside the window, one that is simply dated — and
      a service beside them, which is the whole reason the sections are apart.
    */
    /*
      ⚠️ THE DECANT SHAPE, WITH A REAL CLASSIFICATION ON IT. A ground drawing the
      plain tag would photograph the easy half — the whole reason this screen
      exists is the bottle somebody poured solvent into, and a fixture without a
      signal word and two diamonds teaches nothing about the label that matters.
    */
    /*
      ⚠️ A MONTH WHERE THE SYSTEM IS ONLY PARTLY BEING USED, because that is the
      state this screen exists to make visible. A ground showing a perfect
      hundred per cent photographs the one case nobody needs a report for.
    */
    case "/reports":
      return (
        <Reports
          title={title}
          of={ready(REPORTED)}
          span="month"
          onSpan={nothing}
          again={nothing}
          onOpen={() => go("/thing")}
          onSuppliers={nothing}
        />
      );
    case "/labels":
      return (
        <Labels
          title={title}
          of={ready(TO_LABEL)}
          subject="thing"
          onSubject={nothing}
          picked={TO_LABEL.map((one) => one.id)}
          onPicked={nothing}
          template="decant"
          onTemplate={nothing}
          today="2026-08-21"
          again={nothing}
          onPrint={nothing}
        />
      );
    case "/due":
      return (
        <Due
          title={title}
          of={ready(DATED)}
          services={SERVICES}
          again={nothing}
          onOpen={() => go("/thing")}
          onItem={() => go("/item")}
        />
      );
    /* ⚠️ THE DAY WITH SOMETHING WAITING IN IT. A run that finished and nobody has
       released is the one row on this screen that is waiting for a person. */
    case "/work":
      return (
        <Work
          title={title}
          of={ready(RUNNING)}
          jobs={CASES}
          again={nothing}
          onRun={() => go("/run")}
          onJob={() => go("/case")}
          onStart={nothing}
        />
      );
    /* ⚠️ FINISHED AND UNRELEASED, with one of every verdict below it — the state
       where the screen has to say the difficult thing about a lifted item. */
    case "/run":
      return (
        <Run
          of={ready(COVERED)}
          kind="Autoclave 134°C"
          machine="Autoclave 1"
          state="ended"
          started="2026-08-21"
          ended="2026-08-21T07:40:00.000Z"
          released=""
          evidence="Printout 4471 · Indicator lot 22B"
          again={nothing}
          back={() => go("/work")}
          onEnd={nothing}
          onRelease={nothing}
          onFail={nothing}
          onRecall={nothing}
          onLift={nothing}
        />
      );
    /* ⚠️ CLOSED, AND IN DOUBT — the state that proves the trace is a query. */
    case "/case":
      return (
        <Case
          of={ready(USED)}
          ref="WO-4468"
          label="Bay 1 service"
          state="closed"
          opened="2026-08-07"
          closed="2026-08-07"
          again={nothing}
          back={() => go("/work")}
          onClose={nothing}
          onOpenProduct={() => go("/thing")}
        />
      );
    /* ⚠️ THE MIDDLE STEP, WHICH IS THE ONLY ONE WORTH PHOTOGRAPHING. A paste box
       is a paste box; the mapping over a preview with a refusal in it is the
       screen — and it is what somebody has to be able to read at a glance. */
    case "/import":
      return (
        <Import
          title={title}
          text="product name,brand,ean,qty,shelf"
          onText={nothing}
          seen={SEEN_SHEET}
          fields={MAPPABLE}
          columns={SEEN_SHEET.columns}
          onColumn={nothing}
          done={null}
          busy={false}
          onSee={nothing}
          onImport={nothing}
          onAgain={nothing}
        />
      );
    case "/suppliers":
      return (
        <Suppliers
          title={title}
          of={ready(SUPPLYING)}
          standingDays={7}
          editing={null}
          busy={false}
          again={nothing}
          onOpen={nothing}
          onNew={nothing}
          onClose={nothing}
          onSave={nothing}
        />
      );
    case "/start":
      return (
        <Start
          title={title}
          /* ⚠️ A CLINIC RATHER THAN THE PLAIN ONE, because the profile is the
             thing this screen makes visible and the default says nothing about
             it. */
          said={WORDS.clinic.said}
          /* ⚠️ NOTHING SAID YET, so the ground shows the recognition rather
             than the absence of it — the state worth photographing. */
          raised={RAISED} counts={COUNTS} already={[]} held={HELD} onGo={go}
        />
      );
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
          /*
            ⚠️ MORE THAN IS DRAWN, DELIBERATELY. The one state worth
            photographing here is a page that is not the whole list — a ground
            where the two numbers agree photographs the case the footer never
            appears in.

            ⚠️ AND IT IS THE PLACE'S OWN COUNT, not a bigger number. Written by
            hand it was 214 under a header reading "112 lines" — the same
            quantity twice, on one screen, disagreeing. A demo is read as a
            claim about the product.
          */
          total={PLACES.find((p) => p.id === here)?.lines
            ?? PLACES.find((p) => p.of === null)?.lines ?? 0}
          more
          onMore={nothing}
          again={nothing}
          onGo={setHere}
          onOpen={() => go("/thing")}
          onAdd={() => go("/receive")}
          onImport={() => go("/import")}
          held={HELD}
        />
      );
  }
}
