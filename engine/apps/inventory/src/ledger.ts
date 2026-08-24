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

import { dayPlus, daysBetween, type Day } from "@engine/kernel";

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
/**
 * ⚠️ AND `undone` IS A FOURTH RATHER THAN A NEGATIVE `received`, for exactly the
 * same reason. Somebody scanning the wrong shelf and pressing undo is not a
 * consumption; folded into `taken` it would show up in every usage report as
 * stock that went out, and the shrinkage number nobody can explain would be
 * partly made of people correcting themselves within a minute.
 */
export const MOVES = ["received", "taken", "adjusted", "undone"] as const;
export type Move = typeof MOVES[number];

/**
 * ⚠️ Signed, because a ledger of resulting balances cannot be replayed.
 *
 * ⚠️ `adjusted` AND `undone` TAKE THE SIGN THEY WERE GIVEN. A correction may go
 * either way, and an undo is by definition the exact opposite of one particular
 * movement — the caller has that number and this function does not.
 */
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
 * cannot say why is a shelf nobody trusts, and the four reasons want different
 * actions: a printed date is the manufacturer's, a made one is counted from when
 * it was made and can be checked against the box, an opened one is somebody's
 * decision this morning, and a processed one belongs to a run that can be
 * revoked by a result arriving later.
 *
 * ⚠️ AND EVERY CLOCK IS COUNTED IN LOCAL DAYS. `2026-08-20` plus seven days is
 * `2026-08-27` wherever the person is standing — arithmetic on an instant lands
 * a day out on one side of Greenwich or the other, and the wrong side is the one
 * that expires stock late.
 */
export type Clock = "printed" | "made" | "opened" | "processed";

export interface Clocks {
  readonly printed?: string | null;
  /**
   * ⚠️ THE ONE THE BOX OFTEN CARRIES INSTEAD OF A DATE. "MFD 2026-03-14" with
   * "24 months from manufacture" on the back is a complete shelf life, and it
   * is how most of the world outside EU retail labels a product — so a delivery
   * that arrives with only a manufacture date had no expiry at all, and the
   * sweep that exists to catch expiring stock never saw it.
   *
   * ⚠️ THE DAYS ARE THE PRODUCT'S AND THE DATE IS THE BATCH'S, which is the
   * whole reason this is a pair rather than a date. Two deliveries of one thing
   * were made on different days and expire on different days; how long it keeps
   * is a fact about the thing.
   */
  readonly made?: { readonly on: string; readonly days: number } | null;
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
  if (clocks.made) runs.push({ on: addDays(clocks.made.on, clocks.made.days), by: "made" });
  if (clocks.opened) runs.push({ on: addDays(clocks.opened.on, clocks.opened.days), by: "opened" });
  if (clocks.processed) {
    runs.push({ on: addDays(clocks.processed.on, clocks.processed.days), by: "processed" });
  }
  if (!runs.length) return null;
  /* ⚠️ THE EARLIEST WINS, AND A TIE GOES TO THE PRINTED DATE. Both are true; the
     one a person can check against the box in their hand is the one to name. */
  return runs.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))[0]!;
};

/**
 * WHERE A BATCH STANDS TODAY — gone, going, or fine.
 *
 * ⚠️ "TODAY" IS THE DEVICE'S LOCAL DAY, NEVER THE SERVER'S. A shelf life is
 * counted in calendar days where the shelf is: a server in another timezone
 * calls a box expired the evening before it is, or — the direction that
 * matters — calls an expired box current for another few hours.
 *
 * ⚠️ AND `soon` IS A NUMBER THE WORKSPACE CHOOSES, because it is a decision
 * about a business rather than about a date. A kitchen wants three days; a
 * pharmacy wants ninety; a workshop counting solvents wants a month. Fixed at
 * thirty, two of those three read a useless list.
 */
export type Standing = "gone" | "soon" | "fine";

export const standingOf = (on: string, today: string, warnDays: number): Standing => {
  const left = daysBetween(today as Day, on as Day);
  /* ⚠️ ZERO IS `soon`, NOT `gone`. A box that expires TODAY is still usable
     today in every regime that governs one — and telling somebody it has gone
     while the date on it says otherwise is how an app stops being believed. */
  if (left < 0) return "gone";
  return left <= warnDays ? "soon" : "fine";
};

/** ⚠️ Signed, because "four days ago" and "in four days" are one question. */
export const daysLeft = (on: string, today: string): number =>
  daysBetween(today as Day, on as Day);


/**
 * WHAT CROSSED A LINE TODAY — the one question a nightly sweep may ask.
 *
 * ⚠️ A SWEEP THAT TELLS PEOPLE ABOUT A STATE TELLS THEM EVERY MORNING FOR A
 * MONTH, and the third morning is the one where somebody switches notifications
 * off. What is worth an interruption is the CROSSING — the day a box entered the
 * warning window, and the day it went out of date. A state belongs on a list, on
 * a screen, where looking at it is somebody's decision.
 *
 * ⚠️ SO THE ANSWER IS ARITHMETIC AND NOTHING IS REMEMBERED. No column to write,
 * no row to keep in step with an expiry somebody corrects, and a sweep run twice
 * in one day names exactly the same things both times — which is what makes the
 * job honestly re-runnable rather than re-runnable with an apology.
 *
 * ⚠️ AND `since` IS WHY A SHORT-DATED DELIVERY IS NOT SILENTLY SKIPPED. Cream
 * with three days on it, in a workspace warning thirty days ahead, has no day on
 * which it crosses from outside the window to inside — it arrives inside. An
 * exact match would file the batch most worth mentioning under nothing at all,
 * so the crossing day is the LATER of "the window opened" and "we got it".
 *
 * ⚠️ IT IS OPTIONAL BECAUSE A SERVICE INTERVAL IS NOT A DELIVERY. A due date is
 * set once and counted forward, so its window always opens while the machine is
 * already here; anchoring it on a row's own edit date would re-announce an
 * inspection every time somebody fixed a typo on the item.
 *
 * ⚠️ MINUS ONE IS `gone`, NOT ZERO. `standingOf` calls the printed day itself
 * `soon` — a box that expires today is usable today under every regime that
 * governs one — so out-of-date begins the morning after.
 *
 * ⚠️ AND A MISSED PASS IS A CROSSING NOBODY HEARS ABOUT. That is the cost of
 * remembering nothing, and it is why the run record is the thing to watch: a job
 * that has gone quiet is the failure the scheduler exists to make visible, and
 * this is that failure wearing a shelf's clothes.
 */
export const crossedOn = (
  of: { readonly on: string; readonly since?: string | null },
  today: string,
  warnDays: number,
): "soon" | "gone" | null => {
  const left = daysBetween(today as Day, of.on as Day);
  if (left === -1) return "gone";
  /* ⚠️ Anything already gone crossed on some earlier day and is the screen's
     business now. Saying it again every morning is the noise this exists to
     avoid. */
  if (left < 0) return null;
  const opens = addDays(of.on, -warnDays);
  /* ⚠️ LEXICOGRAPHIC IS CHRONOLOGICAL ON `YYYY-MM-DD`, which is the whole reason
     every date in this product is stored that way. */
  const entered = of.since && of.since > opens ? of.since : opens;
  return today === entered ? "soon" : null;
};
