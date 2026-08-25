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
];

/** ⚠️ What the ground shows for a place with nothing in it — a real state, not
    an omission. A shelf somebody labelled and has not filled yet is the second
    screen anybody sees. */
export const EMPTY_PLACE = "p-a2";
