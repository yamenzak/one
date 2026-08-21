/**
 * WHAT THE HISTORY ADDS UP TO.
 *
 * ⚠️ EVERY NUMBER HERE IS DERIVED FROM THE LEDGER AND NOTHING IS STORED. A
 * report with its own table is a second answer to a question the movements
 * already answer, and the second answer is the one that drifts — a correction
 * made in March changes what February consumed, and a stored figure does not
 * learn that. The ledger is append-only precisely so this can be a projection.
 *
 * ⚠️ AND THE SHARPEST NUMBER IN THE WHOLE PRODUCT IS `told`. "Sixty-one per cent
 * of what left this month was recorded; thirty-nine per cent was found missing
 * by a count" is the honest measure of whether the system is actually being
 * used — and it is the one figure an inventory product is never willing to
 * show, because it is the one that makes the product look bad. Hiding it does
 * not make the stock come back; it makes every other number on the screen
 * unfalsifiable.
 *
 * ⚠️ CONSUMPTION AND CORRECTION MUST NEVER BLUR. Somebody took it, or the number
 * was wrong — those are different events with different causes and different
 * people behind them, and an app that summed them reports theft as usage and
 * usage as theft.
 *
 * Pure. No I/O, no DOM.
 */

/* ⚠️ THE KERNEL'S CALENDAR ARITHMETIC, because a shelf life, a due date, a grace
   period and a report's period are the same operation — and the second product
   to write it would write it slightly differently, which is a whole day, in one
   hemisphere, on the day the clocks change. */
import { dayPlus, daysBetween, type Day } from "@engine/kernel";

/* ⚠️ THE ID PREFIX IS WHAT SAYS WHAT CAUSED A MOVEMENT, because `against` is one
   column rather than four — a reader asks "what caused this", never "which of
   four kinds of cause". A correction closed by a count session carries that
   session's id, and that is the only way to tell inferred consumption from a
   keeper deciding a number was wrong. */
export const BY_COUNT = /^cnt_/;

export interface Entry {
  readonly move: string;
  readonly product: string;
  /** ⚠️ Signed: what the balance moved BY, never what it became. */
  readonly delta: number;
  readonly day: string;
  /** What caused it — a count, a job, a run, or nothing. */
  readonly against: string;
}

/* --------------------------------------------------------------- how known --- */

/**
 * HOW MUCH OF WHAT LEFT WAS ACTUALLY RECORDED.
 *
 * ⚠️ THE THIRD WAY IS LEGITIMATE AND THE APP MUST NOT SHAME ANYBODY FOR IT.
 * Nobody logged it and the count found it gone — that is the basement and the
 * busy factory, and a product that refused to count it would simply be a product
 * whose numbers are wrong. What it does instead is LABEL it, so a manager can
 * see the ratio and decide whether the scanning is worth pushing.
 */
export interface Told {
  /** Somebody scanned it out. */
  readonly recorded: number;
  /** Nobody did; a count found it gone. */
  readonly inferred: number;
  /** ⚠️ 0–1, and 0 where nothing left at all — never a division by zero. */
  readonly share: number;
}

export function toldIn(entries: readonly Entry[]): Told {
  let recorded = 0;
  let inferred = 0;
  for (const one of entries) {
    if (one.move === "taken") recorded += Math.abs(one.delta);
    /* ⚠️ ONLY THE NEGATIVE HALF OF A COUNT'S CORRECTIONS IS CONSUMPTION. A count
       that FOUND stock is a number that was wrong in the other direction, and
       adding it to consumption would report a good day's tidying as usage. */
    else if (one.move === "adjusted" && one.delta < 0 && BY_COUNT.test(one.against)) {
      inferred += Math.abs(one.delta);
    }
  }
  const total = recorded + inferred;
  return { recorded, inferred, share: total ? recorded / total : 0 };
}

/* ---------------------------------------------------------------- what left --- */

export interface Used {
  readonly product: string;
  /** Recorded and inferred together — what actually left the shelf. */
  readonly quantity: number;
}

/**
 * ⚠️ WHAT LEFT, PER PRODUCT, AND IT INCLUDES WHAT NOBODY LOGGED. A consumption
 * report over the `taken` events alone is a report about how well people scan,
 * and it is already `told`'s job to say that. This one is about the stock.
 *
 * ⚠️ SORTED BY QUANTITY, WHICH IS THE ONLY ORDER THIS LIST HAS. Alphabetical
 * makes somebody read every row to find the one that matters.
 */
export function usageIn(entries: readonly Entry[]): readonly Used[] {
  const per = new Map<string, number>();
  for (const one of entries) {
    const left = one.move === "taken"
      ? Math.abs(one.delta)
      : one.move === "adjusted" && one.delta < 0 && BY_COUNT.test(one.against)
        ? Math.abs(one.delta)
        : 0;
    if (left) per.set(one.product, (per.get(one.product) ?? 0) + left);
  }
  return [...per.entries()]
    .map(([product, quantity]) => ({ product, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}

/* ---------------------------------------------------------------- shrinkage --- */

export interface Loss {
  readonly product: string;
  /** Corrections DOWN, absolute. Stock that was not there. */
  readonly lost: number;
  /** Corrections UP. Stock that was there and nobody knew. */
  readonly found: number;
}

/**
 * WHAT THE NUMBERS WERE WRONG BY, IN BOTH DIRECTIONS.
 *
 * ⚠️ BOTH DIRECTIONS, BECAUSE ONLY ONE OF THEM IS SHRINKAGE AND A REPORT SHOWING
 * ONLY THAT ONE IS AN ACCUSATION. A shelf that is repeatedly short AND
 * repeatedly over is a shelf somebody is counting badly or a product being
 * confused with another; a shelf that is only ever short is something else
 * entirely. Netting them off loses the distinction completely.
 *
 * ⚠️ AND IT COVERS EVERY CORRECTION, not only the ones a count caused. A keeper
 * adjusting by hand with a reason is exactly as much a discrepancy as one a
 * count found — the reason is on the movement, and the report is about the size.
 */
export function lossesIn(entries: readonly Entry[]): readonly Loss[] {
  const per = new Map<string, { lost: number; found: number }>();
  for (const one of entries) {
    if (one.move !== "adjusted") continue;
    const at = per.get(one.product) ?? { lost: 0, found: 0 };
    if (one.delta < 0) at.lost += Math.abs(one.delta);
    else at.found += one.delta;
    per.set(one.product, at);
  }
  return [...per.entries()]
    .map(([product, of]) => ({ product, ...of }))
    .sort((a, b) => (b.lost + b.found) - (a.lost + a.found));
}

/* ------------------------------------------------------------------ reorder --- */

export interface Stocked {
  readonly product: string;
  readonly onHand: number;
  /** What the workspace said to be told below. Zero where nothing was said. */
  readonly par: number;
  /** What left over the period, from `usageIn`. */
  readonly used: number;
}

export interface Buy {
  readonly product: string;
  readonly onHand: number;
  /** ⚠️ How many days the shelf lasts at this rate. `Infinity` where nothing moved. */
  readonly cover: number;
  /** How many to order. Never negative, and rounded UP — half a box is a box. */
  readonly order: number;
  /** ⚠️ Why it is on the list, so nobody has to work the arithmetic out. */
  readonly why: "runs out first" | "below the line";
}

/**
 * WHAT TO BUY, AND WHY.
 *
 * ⚠️ THE QUESTION IS "WILL IT LAST UNTIL A DELIVERY ARRIVES", NOT "IS IT LOW".
 * A product with two weeks of stock and a three-week lead time is out before the
 * order lands; one with two days of stock and a next-day supplier is fine. A
 * report ordered by "how little is left" puts those in the wrong order, which is
 * how a store room runs out of the one thing that takes a month to get.
 *
 * ⚠️ AND THE PAR LEVEL IS A FLOOR RATHER THAN A TRIGGER. It is what the
 * workspace wants left on the shelf when the delivery arrives — so it is added
 * to what will be consumed, never compared against what is there.
 *
 * ⚠️ A PRODUCT THAT NEVER MOVES IS NOT ORDERED. Zero consumption gives infinite
 * cover, which is the honest answer: whatever is on the shelf will still be
 * there. It appears only if it is under a par level somebody deliberately set.
 */
export function reorder(
  rows: readonly Stocked[], overDays: number, leadDays: number,
): readonly Buy[] {
  const days = Math.max(1, Math.trunc(overDays));
  const lead = Math.max(0, Math.trunc(leadDays));
  const out: Buy[] = [];

  for (const row of rows) {
    const perDay = row.used / days;
    const cover = perDay > 0 ? row.onHand / perDay : Infinity;
    /* ⚠️ WHAT WILL BE GONE BY THE TIME IT ARRIVES, PLUS WHAT SHOULD STILL BE
       THERE WHEN IT DOES. */
    const wants = perDay * lead + row.par;
    const order = Math.max(0, Math.ceil(wants - row.onHand));
    if (!order) continue;
    out.push({
      product: row.product,
      onHand: row.onHand,
      cover,
      order,
      /* ⚠️ THE REASON IS THE SHARPER OF THE TWO. "Runs out first" is a fact
         about the lead time and is the one somebody acts on today; "below the
         line" is a standing preference and can wait for the next order. */
      why: perDay > 0 && cover < lead ? "runs out first" : "below the line",
    });
  }

  /* ⚠️ SOONEST TO RUN OUT FIRST, WHICH IS THE ORDER A BUYER WORKS IN. */
  return out.sort((a, b) => a.cover - b.cover);
}

/* ------------------------------------------------------------------- a day --- */

/**
 * ⚠️ ONE BUCKET PER DAY, INCLUDING THE EMPTY ONES. A line chart drawn from only
 * the days something happened compresses a quiet fortnight into one step and
 * makes a flat month look like a busy one — the gaps are the shape.
 */
export interface Daily { readonly day: string; readonly quantity: number }

export function dailyIn(
  entries: readonly Entry[], from: string, to: string,
): readonly Daily[] {
  const per = new Map<string, number>();
  for (const one of entries) {
    const left = one.move === "taken"
      ? Math.abs(one.delta)
      : one.move === "adjusted" && one.delta < 0 && BY_COUNT.test(one.against)
        ? Math.abs(one.delta)
        : 0;
    if (left) per.set(one.day, (per.get(one.day) ?? 0) + left);
  }

  /* ⚠️ WALKED ON THE CALENDAR, NEVER ON A CLOCK. Adding 86,400,000 to an instant
     is right where the offset does not change and wrong where it does — and a
     month boundary is not a string operation either, so `2026-08-31` plus a day
     read as text is `2026-08-32`. The kernel's `dayPlus` is the one correct
     answer, and it is shared for exactly this reason.

     ⚠️ AND IT IS BOUNDED. A caller with a backwards or decade-long range must not
     be able to ask for a hundred thousand buckets to be drawn into a chart. */
  const MOST = 400;
  const span = daysBetween(from as Day, to as Day);
  if (!Number.isFinite(span) || span < 0) return [];

  const out: Daily[] = [];
  for (let i = 0; i <= Math.min(span, MOST - 1); i++) {
    const day = dayPlus(from as Day, i);
    out.push({ day, quantity: per.get(day) ?? 0 });
  }
  return out;
}
