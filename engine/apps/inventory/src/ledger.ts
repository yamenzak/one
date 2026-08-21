/**
 * WHAT A MOVEMENT DOES TO A BALANCE — the arithmetic, with no database in it.
 *
 * ⚠️ IT IS PURE SO THAT THE RULES CAN BE PROVED RATHER THAN EXERCISED. Whether
 * taking twelve from eight is refused, and whether a correction may land on a
 * negative number, are questions about arithmetic; asked through a handler they
 * need a shard, a session and a workspace, and the answer arrives mixed up with
 * whether the SQL was right.
 *
 * ⚠️ AND THE REFUSAL IS A VALUE, NEVER A THROW. That is what lets one function
 * be the chokepoint AND the thing a screen can ask before it offers a control —
 * a rule that can only be discovered by attempting it is a rule every surface
 * has to re-implement to stay ahead of.
 */

import { dayPlus, type Day } from "@engine/kernel";

/* ------------------------------------------------------------------ ladder --- */

/**
 * HOW DEEPLY ONE PRODUCT IS TRACKED, shallowest first.
 *
 * ⚠️ IT IS PER PRODUCT AND NEVER PER WORKSPACE, which is the whole answer to
 * "one app for a basement and a hospital". A pharmacy holds screws it counts and
 * vaccines it batches; forcing either depth on the other is what makes an
 * inventory product usable in exactly one kind of building.
 *
 * ⚠️ AND THE ORDER IS LOAD-BEARING — see `promotes`. Going deeper is safe
 * because the shallower record is a true statement of what was known; going
 * shallower throws away what was recorded and has to say so.
 */
export const LADDER = ["listed", "counted", "batched", "itemised", "assembled"] as const;
export type Tracking = typeof LADDER[number];

/**
 * ⚠️ PROMOTION IS SAFE, DEMOTION LOSES HISTORY. Forty gloves become forty gloves
 * in an unrecorded batch, which is honest and is what actually happened; going
 * back the other way discards the batches, their expiries and their suppliers,
 * and no arrangement of the data can put them back.
 */
export const promotes = (from: Tracking, to: Tracking): boolean =>
  LADDER.indexOf(to) > LADDER.indexOf(from);

/* ------------------------------------------------------------------ moves --- */

/**
 * WHAT CAN HAPPEN TO A BALANCE, AND THE LIST IS CLOSED.
 *
 * ⚠️ TAKING AND CORRECTING ARE SEPARATE MOVES RATHER THAN ONE SIGNED NUMBER, and
 * that is the product's sharpest modelling decision. Collapsed into a delta they
 * are indistinguishable in the history — so "we used 40 gloves this month" and
 * "somebody wrote the number down wrong twice" become the same report, and the
 * one measure that says whether the system is being used at all is gone.
 */
export const MOVES = ["received", "taken", "adjusted"] as const;
export type Move = typeof MOVES[number];

/** ⚠️ Signed, because a ledger of resulting balances cannot be replayed. */
export const applyMove = (move: Move, quantity: number): number =>
  (move === "taken" ? -Math.abs(quantity) : move === "received" ? Math.abs(quantity) : quantity);

/**
 * WHY THIS MOVEMENT CANNOT HAPPEN, or nothing.
 *
 * ⚠️ IT REFUSES RATHER THAN CLAMPING, AND THE REASON IS EVIDENCE. Taking twelve
 * from a shelf holding eight is a mis-scan, a different shelf, or a count that
 * was already wrong — every one of which is worth knowing. Landing silently on
 * zero destroys the only signal that any of them happened, and leaves a balance
 * that agrees with nothing.
 *
 * ⚠️ AND A CORRECTION MAY NOT REACH A NEGATIVE EITHER. "Minus three gloves" is
 * not a state a shelf can be in; a correction that would produce one is somebody
 * correcting the wrong line.
 */
export const refuseMove = (move: Move, was: number, step: number): string | null => {
  if (!Number.isFinite(step) || step === 0) return "Say how many";
  if (move === "received" && step < 0) return "Say how many";
  const now = was + step;
  if (now < 0) return `There ${was === 1 ? "is" : "are"} only ${was}`;
  return null;
};

/* ----------------------------------------------------------------- expiry --- */

/**
 * WHEN A BATCH ACTUALLY ENDS — the earliest of three clocks, and WHICH one won.
 *
 * ⚠️ THE ANSWER IS NEVER JUST A DATE. A shelf that says "expires Tuesday" and
 * cannot say why is a shelf nobody trusts, and the three reasons want different
 * actions: a printed date is the manufacturer's, an opened one is somebody's
 * decision this morning, and a processed one belongs to a run that can be
 * revoked by a result arriving later.
 *
 * ⚠️ AND EVERY CLOCK IS COUNTED IN LOCAL DAYS. `2026-08-20` plus seven days is
 * `2026-08-27` wherever the person is standing — arithmetic on an instant lands
 * a day out on one side of Greenwich or the other, and the wrong side is the one
 * that expires stock late.
 */
export type Clock = "printed" | "opened" | "processed";

export interface Clocks {
  readonly printed?: string | null;
  readonly opened?: { readonly on: string; readonly days: number } | null;
  readonly processed?: { readonly on: string; readonly days: number } | null;
}

/**
 * ⚠️ THE KERNEL'S, NOT THIS FILE'S. Moving a calendar date is the same operation
 * for a shelf life, a due date, a grace period and a retention window — and the
 * second product to write it would write it slightly differently, which is a
 * whole day, in one hemisphere, on the day the clocks change.
 */
const addDays = (day: string, days: number): string => dayPlus(day as Day, days);

export const effectiveExpiry = (
  clocks: Clocks,
): { readonly on: string; readonly by: Clock } | null => {
  const runs: { on: string; by: Clock }[] = [];
  if (clocks.printed) runs.push({ on: clocks.printed, by: "printed" });
  if (clocks.opened) runs.push({ on: addDays(clocks.opened.on, clocks.opened.days), by: "opened" });
  if (clocks.processed) {
    runs.push({ on: addDays(clocks.processed.on, clocks.processed.days), by: "processed" });
  }
  if (!runs.length) return null;
  /* ⚠️ THE EARLIEST WINS, AND A TIE GOES TO THE PRINTED DATE. Both are true; the
     one a person can check against the box in their hand is the one to name. */
  return runs.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))[0]!;
};
