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
import { saysDue, saysMove } from "../ledger.js";
import { saysLine } from "../ordering.js";
import { landing, saysOrderWorth } from "../costing.js";

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
   * ⚠️ WHAT THE LINE IS WORTH, IN MINOR UNITS — the derivation `stock.lines`
   * does, written here rather than a rate, because a fixture that carried a
   * milli rate would be a second copy of the arithmetic and could disagree with
   * the one that ships.
   *
   * ⚠️ AND TWO LINES DELIBERATELY HAVE NONE. A world where everything is priced
   * photographs a total that is always whole, and the one reading this shape
   * exists to prevent — a confident figure over a catalogue nobody has finished
   * costing — would never appear in a picture.
   */
  readonly worth?: number;
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
    tracking: "batched", seen: "2026-08-20T09:12:00.000Z", worth: 8_400 },
  { id: "s2", product: "t-resin", name: "Casting resin, clear", brand: "Smooth-On",
    where: "p-a3", whereName: "A3 — flammables", quantity: 4, unit: "tin", par: 6,
    tracking: "batched", seen: "2026-08-19T16:40:00.000Z", worth: 9_560 },
  { id: "s3", product: "t-screw", name: "Screws, M4 × 20", brand: "",
    where: "p-b1", whereName: "B1", quantity: 137, unit: "box", par: 20,
    tracking: "counted", seen: "2026-08-18T11:02:00.000Z", worth: 4_795 },
  { id: "s4", product: "t-wrench", name: "Torque wrench", brand: "Norbar",
    where: "p-bench", whereName: "Bench", quantity: 1, unit: "item",
    tracking: "itemised", seen: "2026-04-14T08:30:00.000Z", worth: 21_900 },
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
 * WHAT A SCAN WILL FIND — the code book, which is the table every camera path in
 * this product resolves against.
 *
 * ⚠️ ONE PRODUCT WEARS SEVERAL, AND THAT IS THE WHOLE REASON IT IS A TABLE. The
 * resin has the GTIN off its tin, the wholesaler's part number, and one of ours
 * minted for the decanted bottle — three strings, one thing, and a screen that
 * showed only the first would be a screen somebody uses to conclude the other
 * two are missing.
 *
 * ⚠️ AND THE PACK SIZE VARIES ACROSS THEM, WHICH IS THE FIGURE THE PICTURE HAS TO
 * MAKE VISIBLE. The carton barcode on the gloves means a hundred; the one on the
 * box means one. Scanning the wrong one is a hundred-fold error in a quantity
 * nobody questions, so a sample where every `pack` were `1` would photograph the
 * column as noise.
 */
export interface Coded {
  readonly id: string;
  readonly product: string;
  readonly value: string;
  readonly kind: "gtin" | "gs1" | "national" | "part" | "ours" | "other";
  readonly pack: number;
}

export const CODES: readonly Coded[] = [
  { id: "c1", product: "t-resin", value: "5060123456789", kind: "gtin", pack: 1 },
  { id: "c2", product: "t-resin", value: "SM-RES-CLR-1L", kind: "part", pack: 1 },
  { id: "c3", product: "t-resin", value: "ONE-P-7T4M", kind: "ours", pack: 1 },
  { id: "c4", product: "t-glove", value: "4022234567891", kind: "gtin", pack: 1 },
  { id: "c5", product: "t-glove", value: "14022234567898", kind: "gtin", pack: 100 },
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

/**
 * A MORNING OF MOVEMENTS, AS THE HISTORY READS THEM BACK.
 *
 * ⚠️ THE SHAPE IS `stock.history`'S ANSWER, NOT THE `ledger` TABLE'S — the row's
 * middle slot is a SENTENCE the operation composed, because the verb depends on
 * the move and the direction on the sign. A fixture built out of columns would
 * photograph the right headings over the wrong reading.
 *
 * ⚠️ AND THE TRANSFER IS TWO ROWS, which is the pair the sentence exists to tell
 * apart: the same carton, the same verb, opposite signs, opposite words. A
 * sample with only one half photographs the one case that cannot go wrong.
 */
export interface Moving {
  readonly id: string;
  readonly product: string;
  readonly name: string;
  readonly says: string;
  readonly at: string;
}

export const MOVING: readonly Moving[] = [
  { id: "lg-1", product: "t-glove", name: "Nitrile gloves, blue",
    says: saysMove("taken", -40, "A3 — flammables"), at: "2026-08-27T08:41:00.000Z" },
  { id: "lg-2", product: "t-resin", name: "Casting resin, clear",
    says: saysMove("moved", 6, "Bench"), at: "2026-08-27T08:12:00.000Z" },
  { id: "lg-3", product: "t-resin", name: "Casting resin, clear",
    says: saysMove("moved", -6, "A3 — flammables"), at: "2026-08-27T08:12:00.000Z" },
  { id: "lg-4", product: "t-screw", name: "Screws, M4 × 20",
    says: saysMove("adjusted", -3, "B1"), at: "2026-08-26T16:55:00.000Z" },
  { id: "lg-5", product: "t-paper", name: "A4 paper",
    says: saysMove("received", 24, "Bench"), at: "2026-08-26T09:02:00.000Z" },
];

/**
 * RUNS, AND THE ONE THE DETAIL PAGE OPENS ON IS THE ONE AWAITING A DECISION.
 *
 * ⚠️ EVERY STANDING IS HERE, WHICH IS WHAT MAKES THE LIST WORTH PHOTOGRAPHING.
 * `state` is the column somebody scans, and a sample where every row said the
 * same word would be a picture of a list that has one job and cannot be seen
 * doing it. Five words, five rows.
 *
 * ⚠️ AND THE RECORD IS `ended` RATHER THAN `open` OR `released`, deliberately.
 * Each standing draws a DIFFERENT set of act cards — `refuseRun` is what decides
 * which — and there is exactly one where somebody owes the screen a decision.
 * A board opening on `open` photographs a page with two ordinary rows on it; one
 * opening on `released` photographs a page with almost none. What the rail is
 * FOR is the moment between them.
 */
export interface Run {
  readonly id: string;
  readonly kind: string;
  readonly machine: string;
  readonly state: "open" | "ended" | "released" | "failed" | "recalled";
  readonly started: string;
  readonly evidence: string;
}

export const RUNS: readonly Run[] = [
  { id: "r-1", kind: "Autoclave cycle", machine: "Autoclave 2", state: "ended",
    started: "2026-08-27", evidence: "Indicator strip 8841" },
  { id: "r-2", kind: "Autoclave cycle", machine: "Autoclave 1", state: "open",
    started: "2026-08-27", evidence: "" },
  { id: "r-3", kind: "Resin cure", machine: "Oven B", state: "released",
    started: "2026-08-26", evidence: "Cure log 220-4" },
  { id: "r-4", kind: "Autoclave cycle", machine: "Autoclave 2", state: "failed",
    started: "2026-08-25", evidence: "Indicator strip 8836 — did not turn" },
  { id: "r-5", kind: "Scale calibration", machine: "Bench scale", state: "recalled",
    started: "2026-08-21", evidence: "Certificate C-118" },
];

/**
 * WHAT ONE RUN COVERS — the deliveries held under it, and where each one stands.
 *
 * ⚠️ THE VERDICT DIFFERS BETWEEN TWO ROWS OF THE SAME RUN, which is the state
 * this list exists to be able to show. A recall reaches what is still on a shelf
 * and not what has been used, and a lift is per delivery — so a sample where
 * every verdict agreed would photograph the one case the column is never needed
 * for.
 *
 * ⚠️ AND THE SHAPE IS THE JOINED ONE. `batch.lot` and `batch.printed` are what
 * the declaration names and what `joinRows` answers with; a fixture holding
 * `batch` alone would draw two blank cells under two correct headings.
 */
export interface RunItem {
  readonly id: string;
  readonly process: string;
  readonly batch: string;
  readonly "batch.lot": string;
  readonly "batch.printed": string;
  readonly verdict: "pending" | "released" | "failed" | "lifted";
}

export const RUN_ITEMS: readonly RunItem[] = [
  { id: "ri-1", process: "r-1", batch: "b-tray-1", "batch.lot": "TR-0912",
    "batch.printed": "2027-02-01", verdict: "pending" },
  { id: "ri-2", process: "r-1", batch: "b-tray-2", "batch.lot": "TR-0913",
    "batch.printed": "2027-02-01", verdict: "pending" },
  { id: "ri-3", process: "r-1", batch: "b-glove-1", "batch.lot": "4471",
    "batch.printed": "2026-08-25", verdict: "lifted" },
  { id: "ri-4", process: "r-3", batch: "b-resin-1", "batch.lot": "RS-2204",
    "batch.printed": "2029-04-30", verdict: "released" },
];

/**
 * WHO A WORKSPACE BUYS FROM, AND WHAT IS ON ORDER WITH THEM.
 *
 * ⚠️ THE PAGE THIS FURNISHES IS THE ONE THAT WAS EMPTY FOR MONTHS. `supplier`
 * and `sourcing` have been written by the register flow since OI-14 with nothing
 * reading them back; a board that answered both with nothing would photograph
 * the state that was the bug.
 *
 * ⚠️ AND THE ORDER THE DETAIL PAGE OPENS ON IS `placed`, for the reason the run
 * board picks `ended`: every act card is `when`-gated, so which row it opens on
 * decides which half of the screen is photographed at all. `placed` is the one
 * standing where a delivery can land AND the order can still be closed short —
 * the two acts the rail exists for.
 */
export interface Ordered {
  readonly id: string;
  readonly supplier: string;
  readonly "supplier.name": string;
  readonly state: "draft" | "placed" | "part" | "closed" | "cancelled";
  readonly raised: string;
  readonly ref: string;
  readonly due: string;
  /** ⚠️ Minor units, the whole van, spread by value at receipt — see `landed`. */
  readonly carriage: number;
}

export const SUPPLIERS = [
  { id: "sup-1", name: "Harbour Supplies", contact: "Dana Whitlock",
    email: "dana@harbour.example", phone: "+44 20 7946 0102", account: "HW-4471",
    leadDays: 5 },
  { id: "sup-2", name: "Northgate Chemicals", contact: "Ravi Menon",
    email: "orders@northgate.example", phone: "+44 161 496 0311", account: "NG-88",
    leadDays: 12 },
] as const;

/* ⚠️ THE ORDER THE DETAIL PAGE OPENS ON CARRIES A CARRIAGE, because the whole
   point of the figure is that it is larger than the sum of the lines. A fixture
   where every order paid nothing for freight would photograph the one case the
   spread never runs on. */
export const ORDERS: readonly Ordered[] = [
  { id: "ord-1", supplier: "sup-1", "supplier.name": "Harbour Supplies",
    state: "placed", raised: "2026-08-26", ref: "HS-99120", due: "2026-09-01",
    carriage: 3_600 },
  { id: "ord-2", supplier: "sup-2", "supplier.name": "Northgate Chemicals",
    state: "part", raised: "2026-08-21", ref: "NG-4402", due: "2026-08-28",
    carriage: 0 },
  { id: "ord-3", supplier: "sup-1", "supplier.name": "Harbour Supplies",
    state: "closed", raised: "2026-08-11", ref: "HS-98771", due: "2026-08-18",
    carriage: 0 },
  { id: "ord-4", supplier: "sup-2", "supplier.name": "Northgate Chemicals",
    state: "draft", raised: "2026-08-27", ref: "", due: "", carriage: 0 },
];

/**
 * ⚠️ ORDERED AND ARRIVED DISAGREE ON EVERY ROW BUT ONE, which is the state this
 * list exists to show. A fixture where the two columns matched would photograph
 * the one case nobody opens an order to check.
 */
/*
  ⚠️ THE SHAPE `buying.lines` ANSWERS WITH, NOT THE TABLE'S — the view is ASKED,
  so a fixture built out of columns would draw the right headings over blank
  cells. `says` is the sentence the screen exists to show.

  ⚠️ AND `worth` IS DERIVED BY THE SAME `landing` THE SERVER USES, never typed.
  A hand-written total is a photograph of arithmetic nobody ran: it agrees with
  the code on the day it is written and drifts silently every time the spread
  changes. One line here has no price on purpose, because "a total is the sum of
  what is known" is a sentence that needs a fixture to say it in.
*/
const ORDER_QUOTES = [
  { id: "oln-1", buying: "ord-1", product: "t-glove", name: "Nitrile gloves, blue",
    asked: 20, had: 0, cost: 8_400 },
  { id: "oln-2", buying: "ord-1", product: "t-paper", name: "A4 paper",
    asked: 8, had: 3, cost: 2_560 },
  { id: "oln-3", buying: "ord-2", product: "t-resin", name: "Casting resin, clear",
    asked: 12, had: 12, cost: 14_400 },
  { id: "oln-4", buying: "ord-2", product: "t-screw", name: "Screws, M4 × 20",
    asked: 500, had: 520, cost: null },
] as const;

export const ORDER_LINES = ORDER_QUOTES.map((one) => {
  const order = ORDERS.find((each) => each.id === one.buying);
  const kin = ORDER_QUOTES.filter((each) => each.buying === one.buying);
  const at = landing(kin, order?.carriage ?? 0);
  return {
    id: one.id, buying: one.buying, product: one.product, name: one.name,
    says: saysLine(one), left: Math.max(0, one.asked - one.had),
    worth: at.of.get(one.id) ?? null,
  };
});

/** ⚠️ The order's own total, from the same `landing` — see `ORDER_LINES`. */
export const ORDER_WORTH = ORDERS.map((order) => {
  const kin = ORDER_QUOTES.filter((each) => each.buying === order.id);
  const priced = kin.filter((each) => each.cost !== null).length;
  return {
    buying: order.id,
    total: landing(kin, order.carriage).total,
    carriage: order.carriage,
    says: saysOrderWorth(priced, kin.length - priced, order.carriage),
  };
});

/** ⚠️ What a supplier supplies, with THEIR reference — see `sourcing`. */
export const SUPPLIES = [
  { id: "src-1", supplier: "sup-1", product: "t-glove", "product.name": "Nitrile gloves, blue",
    ref: "NIT-BL-M", leadDays: 5 },
  { id: "src-2", supplier: "sup-1", product: "t-paper", "product.name": "A4 paper",
    ref: "PAP-A4-80", leadDays: 3 },
] as const;

/**
 * THINGS THAT ARE ONE OF A KIND, AND THE SETS MADE OF THEM.
 *
 * ⚠️ ALL THREE LIVES ARE HERE, because `life` is the column somebody scans and a
 * fixture where every row said the same word would photograph a list that has
 * one job and cannot be seen doing it.
 *
 * ⚠️ AND THE ONE THE DETAIL PAGE OPENS ON IS `issued`, for the reason the run
 * board picks `ended`: every act card is `when`-gated, so which row it opens on
 * decides which half of the screen is photographed. `issued` draws the taking-
 * back act AND the servicing pair — the two groups the page is built around.
 */
export const ITEMS = [
  { id: "u-1", code: "ONE-U-4471", "product.name": "Cordless drill", product: "t-drill",
    life: "issued", holder: "Ana Ruiz", issued: "2026-08-24", due: "2026-09-04",
    serial: "DW-88210" },
  { id: "u-2", code: "ONE-U-4472", "product.name": "Torque wrench", product: "t-wrench",
    life: "held", holder: "", issued: "", due: "2026-08-30", serial: "TW-1180" },
  { id: "u-3", code: "ONE-U-4473", "product.name": "Bench multimeter", product: "t-meter",
    life: "retired", holder: "", issued: "", due: "", serial: "FL-77" },
] as const;

/** ⚠️ `unit.due`'s answer, not the table's — the view is ASKED. */
export const DUE_FOR_SERVICE = [
  { id: "u-2", code: "ONE-U-4472", product: "t-wrench", name: "Torque wrench",
    serial: "TW-1180", on: "2026-08-30", standing: "soon", days: 3,
    says: saysDue(3, "used") },
  { id: "u-1", code: "ONE-U-4471", product: "t-drill", name: "Cordless drill",
    serial: "DW-88210", on: "2026-09-04", standing: "soon", days: 8,
    says: saysDue(8, "used") },
] as const;

export const KIT_ROWS = [
  { id: "k-1", code: "ONE-K-0091", state: "open", product: "t-tray",
    "product.name": "Minor procedures tray", built: "" },
  { id: "k-2", code: "ONE-K-0092", state: "built", product: "t-tray",
    "product.name": "Minor procedures tray", built: "2026-08-25" },
] as const;

/**
 * ⚠️ THE OPEN ONE IS SHORT, WHICH IS WHAT THE SCREEN IS FOR. A fixture whose
 * every tray was complete would photograph the state that needs no screen — and
 * "what is missing" drawn empty over a tray missing a clamp is the failure the
 * whole check exists to prevent.
 */
export const KIT_MEMBERS = [
  { id: "u-4", kit: "k-1", product: "t-forceps", name: "Artery forceps",
    code: "ONE-U-5510", stray: false },
  { id: "u-5", kit: "k-1", product: "t-scissors", name: "Mayo scissors",
    code: "ONE-U-5511", stray: false },
] as const;

export const KIT_SHORT = [
  { kit: "k-1", product: "t-clamp", name: "Towel clamp", want: 2 },
] as const;

/**
 * WHAT THE WORKSPACE WAS CONSUMING STOCK FOR.
 *
 * ⚠️ THE REFERENCES ARE A CLINIC'S AND THE LABELS ARE ENGLISH, which is the
 * whole shape of this collection: what makes `job` general is that the reference
 * is a label the workspace chose, not a record this app holds. A fixture of
 * invented ids would photograph the one thing that is never on the screen.
 *
 * ⚠️ AND ONE IS OPEN AND ONE IS CLOSED, because the acts on the detail page are
 * gated on the standing. A fixture of open jobs alone photographs a screen that
 * can never be seen without its controls.
 */
export const JOBS = [
  { id: "job-1", ref: "CASE-4471", label: "Minor procedure, room 2",
    state: "open", opened: "2026-08-26", closed: "" },
  { id: "job-2", ref: "CASE-4468", label: "Dressing change",
    state: "closed", opened: "2026-08-24", closed: "2026-08-24" },
  { id: "job-3", ref: "WO-1189", label: "Bench calibration",
    state: "closed", opened: "2026-08-19", closed: "2026-08-20" },
] as const;

/**
 * ⚠️ ONE LINE IS IN DOUBT AND TWO ARE NOT, which is the state the trace exists
 * to show. A fixture where every lot was clean would photograph the case nobody
 * opens a job to check, and one where every lot was held would make the alarm
 * read as the ordinary colour of the screen.
 *
 * ⚠️ AND `says` IS THE HANDLER'S SENTENCE — see `saysUsed`. Written out here
 * rather than composed, because a fixture that reproduced the arithmetic would
 * be a second implementation of it that can agree with the screen and disagree
 * with the ledger.
 */
export const JOB_USED = [
  { id: "l-9", product: "t-glove", name: "Nitrile gloves, blue",
    says: "4 taken · lot NG-2211" },
  { id: "l-10", product: "t-resin", name: "Casting resin, clear",
    says: "1 taken · lot CR-0043 — the lot is held" },
  { id: "l-11", product: "t-paper", name: "A4 paper", says: "2 taken" },
] as const;

/**
 * THE WORDS THIS WORKSPACE FILES THINGS UNDER.
 *
 * ⚠️ ALL THREE SOURCES ARE HERE, because `source` is the column that decides
 * what to do on the day the list needs tidying — a word a model invented and a
 * word somebody typed deserve different amounts of trust, and a fixture of one
 * kind photographs a list that cannot be seen making the distinction.
 */
export const WORDS = [
  { id: "tag-1", name: "Consumable", source: "typed" },
  { id: "tag-2", name: "Protective equipment", source: "typed" },
  { id: "tag-3", name: "Single use", source: "ai-assisted" },
  { id: "tag-4", name: "Stationery", source: "imported" },
] as const;

/** One product, one word — the join that makes a rename land in one place. */
export const FILINGS = [
  { id: "tgg-1", product: "t-glove", "product.name": "Nitrile gloves, blue",
    tag: "tag-1", "tag.name": "Consumable" },
  { id: "tgg-2", product: "t-glove", "product.name": "Nitrile gloves, blue",
    tag: "tag-2", "tag.name": "Protective equipment" },
  { id: "tgg-3", product: "t-glove", "product.name": "Nitrile gloves, blue",
    tag: "tag-3", "tag.name": "Single use" },
  { id: "tgg-4", product: "t-paper", "product.name": "A4 paper",
    tag: "tag-4", "tag.name": "Stationery" },
] as const;
