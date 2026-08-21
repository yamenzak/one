/**
 * COUNTING A SHELF — the arithmetic, with no database in it.
 *
 * ⚠️ DOUBLE COUNTING IS PREVENTED BY SCOPE, NOT BY IDENTITY, and that is the
 * whole design. You cannot tell one generic barcode from another and you do not
 * need to: a session belongs to ONE shelf, everything scanned while it is open
 * belongs there, and the same code thirty times is thirty items. You do not
 * count a shelf twice for the reason you never did on paper — you ticked the
 * shelf off.
 *
 * ⚠️ AND MISSING A SHELF ENTIRELY IS FAR MORE COMMON THAN COUNTING ONE TWICE,
 * and much more damaging: the number for a shelf nobody visited is simply the
 * last one anybody wrote down, and it goes on being trusted. That is what
 * `coverage` is for.
 *
 * ⚠️ CLOSING IS THE DANGEROUS PART. Everything the count did not find on that
 * shelf goes to ZERO — which is the point of counting, and is also how a session
 * somebody abandoned half way through empties a rack. So a close is explicit, it
 * reports what it is about to do, and every line of it becomes a CORRECTION in
 * the history naming the session that caused it. A count never silently
 * overwrites.
 */

import { daysBetween, type Day } from "@engine/kernel";

/* ---------------------------------------------------------------- stutter --- */

/**
 * ⚠️ THE SAME CODE THREE TIMES IN TWO SECONDS IS ONE ITEM AND A JUMPY FINGER,
 * and it is FLAGGED rather than blocked. A trigger held down against a pallet of
 * identical boxes is also three reads in two seconds, and it is three boxes — so
 * a product that refused the third would be a product that undercounts every
 * bulk delivery, silently, in the direction nobody checks.
 */
const STUTTER_MS = 2_000;
const STUTTER_READS = 3;

export const stuttering = (at: readonly number[], now: number): boolean =>
  at.filter((was) => now - was < STUTTER_MS).length >= STUTTER_READS - 1;

/* ---------------------------------------------------------------- settling --- */

/** One line of what a session found, or of what the shelf is recorded as. */
export interface Line {
  readonly product: string;
  /** Empty where the product is not batched. */
  readonly batch: string;
  readonly quantity: number;
}

/**
 * WHAT CLOSING A COUNT WOULD CHANGE — one row per disagreement, and nothing else.
 *
 * ⚠️ ONLY THE DIFFERENCES, WHICH IS WHAT MAKES A CLOSE READABLE. A shelf of two
 * hundred lines where four are wrong is a screen with four rows on it; listing
 * the other hundred and ninety-six as "correct" buries the only thing anybody
 * has to decide about.
 */
export interface Change {
  readonly product: string;
  readonly batch: string;
  /** What the system thought. */
  readonly was: number;
  /** What the count found. */
  readonly found: number;
  /** ⚠️ Signed, and it is what the correction will move the balance BY. */
  readonly delta: number;
}

/* ⚠️ A SEPARATOR THAT CANNOT APPEAR IN EITHER HALF, written as an escape. Two
   ids joined with nothing between them collide the moment one ends where the
   next begins — and a raw control character in source is a byte nobody reviewing
   a diff can see, which `legible` refuses. */
const keyOf = (of: Line) => `${of.product}\u0000${of.batch}`;

/**
 * ⚠️ EVERYTHING THE COUNT DID NOT FIND GOES TO ZERO, and this is the one rule in
 * the product that destroys a number rather than adding one. It is correct — a
 * shelf that was counted and did not have it does not have it — and it is why
 * this function exists to be READ before it is applied.
 *
 * ⚠️ AND A PRODUCT FOUND THAT NOTHING SAID WAS THERE IS A CHANGE TOO. Somebody
 * put it on the wrong shelf, or it was never received; either way the count is
 * the more recent evidence and the difference is what a person has to see.
 */
export function settleCount(
  found: readonly Line[], held: readonly Line[],
): readonly Change[] {
  const counted = new Map<string, Line>();
  for (const line of found) {
    const at = counted.get(keyOf(line));
    /* ⚠️ ACCUMULATED RATHER THAN REPLACED. The same code thirty times is thirty
       items — a tally that took the last value would count one. */
    counted.set(keyOf(line), at
      ? { ...line, quantity: at.quantity + line.quantity }
      : line);
  }

  const out: Change[] = [];
  const seen = new Set<string>();

  for (const line of held) {
    seen.add(keyOf(line));
    const was = line.quantity;
    const now = counted.get(keyOf(line))?.quantity ?? 0;
    if (now === was) continue;
    out.push({ product: line.product, batch: line.batch, was, found: now, delta: now - was });
  }

  for (const [key, line] of counted) {
    if (seen.has(key)) continue;
    out.push({
      product: line.product, batch: line.batch,
      was: 0, found: line.quantity, delta: line.quantity,
    });
  }

  /* ⚠️ THE BIGGEST DISAGREEMENT FIRST, because that is the one worth looking at
     hardest — and a list ordered by product id is ordered by nothing. */
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/* --------------------------------------------------------------- coverage --- */

export interface Covered {
  readonly location: string;
  readonly name: string;
  /** The day it was last counted, or empty for never. */
  readonly on: string;
  /** How long ago, in days. `null` where it has never been counted. */
  readonly days: number | null;
}

/**
 * WHICH SHELVES HAVE NOT BEEN COUNTED — the half of a stocktake nobody builds.
 *
 * ⚠️ NEVER-COUNTED SORTS FIRST AND IS NOT "A LONG TIME AGO". A shelf nobody has
 * ever visited and one counted two years ago are different problems: the second
 * has a number somebody once checked, and the first has one nobody has ever
 * seen. Folding them together by treating never as a very large number would put
 * the more dangerous one in the middle of the list.
 */
export function coverage(
  places: readonly { readonly id: string; readonly name: string }[],
  counted: Readonly<Record<string, string>>,
  today: string,
): readonly Covered[] {
  const out = places.map((p): Covered => {
    const on = counted[p.id] ?? "";
    return {
      location: p.id,
      name: p.name,
      on,
      days: on ? daysBetween(on as Day, today as Day) : null,
    };
  });

  return out.sort((a, b) => {
    if (a.days === null && b.days === null) return a.name < b.name ? -1 : 1;
    if (a.days === null) return -1;
    if (b.days === null) return 1;
    return b.days - a.days;
  });
}
