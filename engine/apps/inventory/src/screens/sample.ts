/**
 * A WORKSPACE WITH THINGS IN IT — written down, so a screen can be looked at.
 *
 * ⚠️ IT IS A WORKSHOP RATHER THAN A DEMO. Three sites would show the tree and
 * teach nothing; what a screen has to survive is one real place with a hundred
 * and ten items on eleven shelves, some of which ran out, one of which nobody
 * has touched in four months. Every defect this product will have is visible in
 * a list like that and invisible in a list of three.
 *
 * ⚠️ AND THE NUMBERS ARE AWKWARD ON PURPOSE. A column of 10, 20 and 30 lines up
 * whatever the alignment is wrong; 4, 137 and 1,200 does not, which is the only
 * way to find out whether a figure column shares a right edge.
 */

/* ⚠️ THE SAME FUNCTION THE OPERATION USES, NOT A PHRASE TYPED HERE. A fixture
   with its own wording photographs a sentence the product does not say — which
   is the one failure a picture cannot reveal, because it looks correct. */
import { saysDue } from "../ledger.js";

export type Tracking = "listed" | "counted" | "batched" | "itemised" | "assembled";

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly of?: string | null;
  readonly kind: string;
  /** How many product lines sit here, including everything below it. */
  readonly lines: number;
  /** ⚠️ Ours, always — a shelf has no manufacturer. Prefixed so the camera knows
      instantly that what it is holding is a PLACE rather than a thing, which is
      what lets it move the session instead of adding stock. */
  readonly code?: string;
}

export interface Line {
  readonly id: string;
  readonly product: string;
  readonly name: string;
  readonly brand?: string;
  readonly where: string;
  readonly whereName: string;
  readonly quantity: number;
  readonly unit: string;
  readonly par?: number;
  readonly tracking: Tracking;
  /** ⚠️ When this line last moved — see `stock.seen`. */
  readonly seen: string;
  /**
   * ⚠️ AN ADDRESS, NOT A MEDIA ID. What the product was photographed as, already
   * resolved to something an `<img>` can take — `linesOf` does that once with the
   * door's `file`, so a screen never learns the shape of a route and the sample
   * world can be written without one.
   */
  readonly photo?: string;
}

export const PLACES: readonly Place[] = [
  { id: "p-site", name: "Bracken Road", of: null, kind: "site", lines: 95 },
  { id: "p-store", name: "Main store", of: "p-site", kind: "room", lines: 70 },
  { id: "p-floor", name: "Shop floor", of: "p-site", kind: "room", lines: 25 },
  { id: "p-a", name: "Rack A", of: "p-store", kind: "rack", lines: 24 },
  { id: "p-b", name: "Rack B", of: "p-store", kind: "rack", lines: 46 },
  { id: "p-a1", name: "A1", of: "p-a", kind: "shelf", lines: 12, code: "ONE-L-4K2P" },
  { id: "p-a2", name: "A2", of: "p-a", kind: "shelf", lines: 0 },
  { id: "p-a3", name: "A3 — flammables", of: "p-a", kind: "shelf", lines: 12, code: "ONE-L-9WQX" },
  { id: "p-b1", name: "B1", of: "p-b", kind: "shelf", lines: 23 },
  { id: "p-b2", name: "B2", of: "p-b", kind: "shelf", lines: 23 },
  { id: "p-bench", name: "Bench", of: "p-floor", kind: "bin", lines: 25 },
];

export const LINES: readonly Line[] = [
  { id: "s1", product: "t-glove", name: "Nitrile gloves, blue", brand: "Ansell",
    where: "p-a1", whereName: "A1", quantity: 1_200, unit: "glove", par: 400,
    tracking: "batched", seen: "2026-08-20T09:12:00.000Z" },
  { id: "s2", product: "t-resin", name: "Casting resin, clear", brand: "Smooth-On",
    where: "p-a3", whereName: "A3 — flammables", quantity: 4, unit: "tin", par: 6,
    tracking: "batched", seen: "2026-08-19T16:40:00.000Z" },
  { id: "s3", product: "t-screw", name: "Screws, M4 × 20", brand: "",
    where: "p-b1", whereName: "B1", quantity: 137, unit: "box", par: 20,
    tracking: "counted", seen: "2026-08-18T11:02:00.000Z" },
  { id: "s4", product: "t-wrench", name: "Torque wrench", brand: "Norbar",
    where: "p-bench", whereName: "Bench", quantity: 1, unit: "item",
    tracking: "itemised", seen: "2026-04-14T08:30:00.000Z" },
  { id: "s5", product: "t-paper", name: "A4 paper", brand: "",
    where: "p-b2", whereName: "B2", quantity: 0, unit: "ream", par: 5,
    tracking: "counted", seen: "2026-08-11T14:55:00.000Z" },
  { id: "s6", product: "t-ladder", name: "Step ladder, 2.4 m", brand: "Zarges",
    where: "p-floor", whereName: "Shop floor", quantity: 1, unit: "item",
    tracking: "listed", seen: "2026-01-06T10:00:00.000Z" },
  /* ⚠️ A SECOND EMPTY LINE, AND IT IS NOT PADDING. One zero draws a list of one
     row, which is the state that looks like a bug rather than like a list — and
     the two of them are deliberately far apart in time, because a shelf emptied
     yesterday and one emptied in the spring are the same number and completely
     different problems. */
  { id: "s7", product: "t-tie", name: "Cable ties, 200 mm", brand: "HellermannTyton",
    where: "p-b1", whereName: "B1", quantity: 0, unit: "bag", par: 4,
    tracking: "counted", seen: "2026-05-02T09:20:00.000Z" },
];

/**
 * THE CATALOGUE ROWS THEMSELVES — what the products ARE, beside where they sit.
 *
 * ⚠️ WRITTEN OUT RATHER THAN DERIVED FROM `LINES`, WHICH IS THE POINT. A product
 * exists whether or not it is on a shelf, and half of what a product page shows
 * — how it is tracked, what it is packed in, how to store it — is not on a stock
 * line at all. Building the catalogue by mapping over the lines produced a
 * fixture where every product was on a shelf and none of them had a shelf life,
 * which is a workspace this product does not have.
 *
 * ⚠️ AND ONE OF THEM CARRIES PROSE. Storage and handling are absent on most
 * products and are the two facts that matter most on the few that have them —
 * the solvent is the row that proves a screen drawing them looks right, and
 * every other row proves it looks right without.
 */
export interface Thing {
  readonly id: string;
  readonly name: string;
  readonly brand?: string;
  readonly unit: string;
  readonly tracking: Tracking;
  readonly par?: number;
  readonly storage?: string;
  readonly handling?: string;
}

export const THINGS: readonly Thing[] = [
  { id: "t-glove", name: "Nitrile gloves, blue", brand: "Ansell", unit: "glove",
    tracking: "batched", par: 400 },
  { id: "t-resin", name: "Casting resin, clear", brand: "Smooth-On", unit: "tin",
    tracking: "batched", par: 6,
    storage: "Keep below 25 °C, away from direct sun. Once opened, use within 28 days.",
    handling: "Wear gloves and eye protection. Mix in a ventilated space." },
  { id: "t-screw", name: "Screws, M4 × 20", unit: "box", tracking: "counted", par: 20 },
  { id: "t-wrench", name: "Torque wrench", brand: "Norbar", unit: "item", tracking: "itemised" },
  { id: "t-paper", name: "A4 paper", unit: "ream", tracking: "counted", par: 5 },
  { id: "t-ladder", name: "Step ladder, 2.4 m", brand: "Zarges", unit: "item", tracking: "listed" },
  { id: "t-tie", name: "Cable ties, 200 mm", brand: "HellermannTyton", unit: "bag",
    tracking: "counted", par: 4 },
];

/**
 * A SHELF SOMEBODY IS PART WAY THROUGH COUNTING.
 *
 * ⚠️ OPEN SESSIONS ONLY, WHICH IS THE STATE THE PRODUCT SHOWS. A closed count is
 * history and reads on a different screen; what a workspace needs to see at a
 * glance is the shelf whose numbers nobody's read is settled on yet.
 *
 * ⚠️ AND ONE OF THEM IS BLIND. Whether the expected number was hidden cannot be
 * changed once counting has started, so somebody taking a session over has to
 * know which kind they walked into — which means the sample has to have both.
 */
export interface Counting {
  readonly id: string;
  readonly where: string;
  readonly whereName: string;
  readonly day: string;
  readonly blind: boolean;
}

export const COUNTS: readonly Counting[] = [
  { id: "c1", where: "p-b1", whereName: "B1", day: "2026-08-24", blind: true },
  { id: "c2", where: "p-bench", whereName: "Bench", day: "2026-08-26", blind: false },
];

/** ⚠️ What the ground shows for a place with nothing in it — a real state, not
    an omission. A shelf somebody labelled and has not filled yet is the second
    screen anybody sees. */
export const EMPTY_PLACE = "p-a2";

/**
 * DELIVERIES WITH A CLOCK ON THEM, AND ONE OF THEM HAS ALREADY GONE.
 *
 * ⚠️ THE SHAPE IS `batch.due`'S ANSWER, NOT THE `batch` TABLE'S. This view is
 * ASKED — an operation resolves four clocks against the workspace's own warning
 * window and hands back rows that exist nowhere in the database — so a fixture
 * built out of columns would draw the right headings over six blank cells.
 *
 * ⚠️ AND `by` IS THE FIELD THE PICTURE IS FOR. Which clock decided is genuinely
 * surprising often enough to matter: the resin is out next week because somebody
 * OPENED it, on a tin whose printed date is years away. A sample where every row
 * said `printed` would photograph a screen whose most interesting column is a
 * constant.
 *
 * ⚠️ ONE IS ALREADY PAST, BECAUSE THE FIGURE ABOVE THE LIST COUNTS EXACTLY
 * THOSE. A fixture with none would photograph a hero reading 0 over a list of
 * twelve — a true state, and the one that shows least about whether the screen
 * works.
 */
export interface Running {
  readonly id: string;
  readonly product: string;
  readonly name: string;
  readonly lot: string;
  readonly on: string;
  /** ⚠️ Which of the four clocks decided — `printed`, `made`, `opened`, `used`. */
  readonly by: string;
  readonly standing: "gone" | "soon" | "fine";
  /** ⚠️ Signed: "four days ago" and "in four days" are one question. */
  readonly days: number;
  /** ⚠️ The countdown as a sentence, with the clock — see `saysDue`. */
  readonly says: string;
}

export const RUNNING: readonly Running[] = [
  { id: "b-glove-1", product: "t-glove", name: "Nitrile gloves, blue", lot: "4471",
    on: "2026-08-25", by: "printed", standing: "gone", days: -2,
    says: saysDue(-2, "printed") },
  { id: "b-resin-1", product: "t-resin", name: "Casting resin, clear", lot: "R-19",
    on: "2026-09-03", by: "opened", standing: "soon", days: 7,
    says: saysDue(7, "opened") },
  { id: "b-glove-2", product: "t-glove", name: "Nitrile gloves, blue", lot: "4472",
    on: "2026-09-14", by: "printed", standing: "soon", days: 18,
    says: saysDue(18, "printed") },
  { id: "b-resin-2", product: "t-resin", name: "Casting resin, clear", lot: "R-22",
    on: "2026-09-20", by: "made", standing: "soon", days: 24,
    says: saysDue(24, "made") },
];
