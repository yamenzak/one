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
import { dayPlus, type Day } from "@engine/kernel";
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

/**
 * A MONTH OF MOVEMENTS, ADDED UP FOUR WAYS.
 *
 * ⚠️ ONE OPERATION'S FIVE ANSWERS, WHICH IS FIVE VIEWS OVER ONE ROW SHAPE EACH —
 * see `stock.report`. Nothing here is a table: consumption, shrinkage, the
 * recorded share and what to buy are readings of the same ledger over the same
 * period, so a fixture built out of `ledger` columns would draw five sets of
 * correct headings over blank cells.
 *
 * ⚠️ AND THE SHARE IS DELIBERATELY NOT FLATTERING. A photograph of 100 %
 * recorded is a picture of the one workspace this figure has nothing to say
 * about — the screen exists because the number is usually in the eighties, and
 * the sentence under it only appears when it is.
 */
export interface Told {
  readonly recorded: number;
  readonly inferred: number;
  readonly share: number;
  readonly sharePct: number;
  readonly says: string;
}

export const TOLD: readonly Told[] = [{
  recorded: 412,
  inferred: 96,
  share: 412 / 508,
  sharePct: 81,
  /* ⚠️ THE MIDDLE BRANCH OF THE THREE, which is the one a real workspace lands
     on and the only one that says anything — see `stock.report`. */
  says: "The rest went unscanned, and a count found it gone",
}];

/**
 * ⚠️ SOONEST TO RUN OUT FIRST, AND THE `why` COLUMN IS WHY THAT ORDER IS NOT
 * "HOW LITTLE IS LEFT" — see `reorder`. The gloves have more on the shelf than
 * the resin and are still first, because they go through faster and the supplier
 * takes longer: exactly the row a list sorted by quantity puts at the bottom.
 */
export interface Buying {
  readonly product: string;
  readonly name: string;
  readonly onHand: number;
  readonly order: number;
  readonly unit: string;
  readonly says: string;
}

export const BUYING: readonly Buying[] = [
  { product: "t-glove", name: "Nitrile gloves, blue", onHand: 260, order: 900,
    unit: "glove", says: "4 days left · runs out first · Ansell" },
  { product: "t-paper", name: "A4 paper", onHand: 2, order: 9,
    unit: "ream", says: "6 days left · runs out first · Viking" },
  { product: "t-resin", name: "Casting resin, clear", onHand: 4, order: 6,
    unit: "tin", says: "19 days left · below the line · Smooth-On" },
  { product: "t-tie", name: "Cable ties, 200 mm", onHand: 1, order: 4,
    unit: "bag", says: "Not moving · below the line" },
];

/** ⚠️ Biggest first, which is the only order this list has — see `usageIn`. */
export interface Left {
  readonly product: string;
  readonly name: string;
  readonly quantity: number;
}

export const LEFT: readonly Left[] = [
  { product: "t-glove", name: "Nitrile gloves, blue", quantity: 1_840 },
  { product: "t-screw", name: "Screws, M4 × 20", quantity: 46 },
  { product: "t-paper", name: "A4 paper", quantity: 23 },
  { product: "t-resin", name: "Casting resin, clear", quantity: 11 },
];

/**
 * ⚠️ ONE ROW SHORT AND ONE BOTH WAYS, because those are two different findings
 * and netting them off loses the second entirely — see `lossesIn`. A shelf that
 * is forty short and thirty-eight over is somebody counting badly; a shelf that
 * is only ever short is something else.
 */
export interface Wrong {
  readonly product: string;
  readonly name: string;
  readonly says: string;
}

export const WRONG: readonly Wrong[] = [
  { product: "t-glove", name: "Nitrile gloves, blue", says: "40 short · 38 over" },
  { product: "t-screw", name: "Screws, M4 × 20", says: "12 short" },
];

/**
 * ⚠️ ONE BUCKET PER DAY INCLUDING THE EMPTY ONES — see `dailyIn`. The two flat
 * stretches are weekends, and they are the reason the gaps have to be in the
 * data rather than skipped: a line drawn only through the days something
 * happened makes a quiet fortnight look like a busy one.
 */
export interface Ran {
  readonly day: Day;
  readonly quantity: number;
}

export const DAILY: readonly Ran[] = [
  74, 91, 68, 0, 0, 102, 88, 96, 71, 0, 0, 84, 119, 77, 63, 0, 0,
  90, 105, 82, 69, 0, 0, 97, 76, 88, 111, 0, 0, 79,
].map((quantity, i) => ({
  /* ⚠️ THE DAYS ARE REAL AND CONSECUTIVE, because the chart's x is the POSITION
     and a fixture with a gap in the dates would still draw an even line — which
     is a picture that agrees with a bug. `dayPlus` rather than a slice off an
     instant: a calendar day is not a substring of a timestamp (D7). */
  day: dayPlus("2026-07-29" as Day, i),
  quantity,
}));

/**
 * A SHELF PART WAY THROUGH BEING COUNTED, AND WHAT IT DISAGREES WITH.
 *
 * ⚠️ THE TALLY IS NOT THE SHELF, and the two fixtures are separate for the same
 * reason the tables are — see `tally`. Until the session closes this is what
 * somebody has scanned; the balance is still whatever `stock` says, and a board
 * that answered both from one list would photograph a half-finished count as
 * fact.
 *
 * ⚠️ AND THEY DISAGREE ON PURPOSE, IN BOTH DIRECTIONS AND IN THE THIRD WAY. One
 * line is short, one is over, and one was not found at all — which is the row
 * that goes to zero, the one closing a count destroys, and therefore the one a
 * photograph of this screen most has to show.
 */
export interface Counted {
  readonly id: string;
  readonly product: string;
  readonly "product.name": string;
  readonly quantity: number;
}

export const COUNTED: readonly Counted[] = [
  { id: "tly-1", product: "t-glove", "product.name": "Nitrile gloves, blue", quantity: 380 },
  { id: "tly-2", product: "t-screw", "product.name": "Screws, M4 × 20", quantity: 26 },
  { id: "tly-3", product: "t-tie", "product.name": "Cable ties, 200 mm", quantity: 7 },
];

export interface Disagrees {
  readonly product: string;
  readonly name: string;
  readonly says: string;
  readonly delta: number;
}

export const DISAGREES: readonly Disagrees[] = [
  { product: "t-glove", name: "Nitrile gloves, blue", says: "380 found, 20 short", delta: -20 },
  { product: "t-screw", name: "Screws, M4 × 20", says: "26 found, 2 more than the books",
    delta: 2 },
  { product: "t-paper", name: "A4 paper", says: "2 on the books, none found", delta: -2 },
];
