/**
 * THE EVENT VOCABULARY — what can happen to a tracked thing, and what it means.
 *
 * The schema's invariant is that no route may change a state column without
 * writing the ledger row that justifies it. This module is the half of that
 * which needs no database: which events exist, which kinds of thing they apply
 * to, what they do to a quantity, and which of them are one-way doors.
 *
 * Keeping it pure is not tidiness. The arithmetic below is where a stock count
 * silently goes wrong, and the only way to be sure about it is to be able to
 * test every branch without a database in the way.
 */

/** The three identity granularities (TESSA.md §3.1). */
export type TrackedKind = "lot" | "unit" | "pack";

export type EventName =
  | "received"
  | "moved"
  | "opened"
  | "consumed"
  | "wasted"
  | "cleaned"
  | "packed"
  | "loaded"
  | "sterilised"
  | "released"
  | "quarantined"
  | "issued"
  | "returned"
  | "cleared"
  | "retired";

/** How an event moves a lot's quantity. `none` ⇒ the event does not touch it. */
export type QuantityEffect = "increase" | "decrease" | "none";

export interface EventSpec {
  /** Which granularities this event is meaningful for. */
  kinds: readonly TrackedKind[];
  quantity: QuantityEffect;
  /**
   * A one-way door: after this, the thing has no further life.
   *
   * Named because the app must refuse to move, consume or re-release something
   * that is finished. Without it a retired instrument can be packed into a tray
   * — the kind of error that is obvious in a sentence and invisible in a table.
   */
  terminal?: boolean;
  /** Human label, used in history views and audit exports. */
  label: string;
}

export const EVENTS: Record<EventName, EventSpec> = {
  received: { kinds: ["lot", "unit"], quantity: "increase", label: "Received" },
  moved: { kinds: ["lot", "unit", "pack"], quantity: "none", label: "Moved" },
  // Opening a LOT starts the post-opening clock; opening a PACK commits the
  // whole thing and returns its units to the dirty pool. Same word, two
  // consequences — which is why the projection is per-kind, not per-event.
  opened: { kinds: ["lot", "pack"], quantity: "none", label: "Opened" },
  consumed: { kinds: ["lot"], quantity: "decrease", label: "Used" },
  wasted: { kinds: ["lot"], quantity: "decrease", label: "Discarded" },
  /**
   * The step that closes the CSSD loop: a dirty instrument becomes available
   * again.
   *
   * It has to be an event somebody performs, not a status a route may set,
   * because without it an instrument that came out of an opened tray is stuck in
   * `dirty` forever — and the pressure to "just set it back to clean" is exactly
   * how an instrument gets from a patient into the next tray unreprocessed.
   */
  cleaned: { kinds: ["unit"], quantity: "none", label: "Reprocessed" },
  // Applies to a UNIT as well as the pack, and both halves are needed. The pack
  // gets "this tray was assembled"; each instrument gets "I went into tray T on
  // Tuesday", which is the half a recall reads backwards — from a failed load to
  // the instruments that were in it.
  packed: { kinds: ["unit", "pack"], quantity: "none", label: "Packed" },
  // Into the machine. A separate event from `sterilised` because a load that is
  // still running has trays committed to it that nothing else may touch, and
  // "which trays were in cycle 47" has to be answerable before the cycle ends —
  // otherwise a load that fails mid-run has no recoverable membership.
  loaded: { kinds: ["pack"], quantity: "none", label: "Loaded" },
  sterilised: { kinds: ["pack"], quantity: "none", label: "Sterilised" },
  released: { kinds: ["pack"], quantity: "none", label: "Released" },
  quarantined: { kinds: ["lot", "unit", "pack"], quantity: "none", label: "Quarantined" },
  issued: { kinds: ["unit", "pack"], quantity: "none", label: "Issued" },
  returned: { kinds: ["unit", "pack"], quantity: "none", label: "Returned" },
  /**
   * A quarantine lifted, by a person.
   *
   * Its counterpart matters more than it does: without a way back, quarantine is
   * a one-way door, and a one-way door is one people stop walking through. See
   * `isFrozen` — freezing is reversible precisely so that freezing stays cheap.
   *
   * ⚠️ What it must NEVER do is return something to a READY state. A tray from a
   * failed load goes back to `packed` (reprocess it), an instrument to `dirty`,
   * a lot to `active` — the app's projection decides, and every one of those
   * lands in "needs work" rather than "good to go". Clearing a quarantine
   * straight back to `sterile` would let a failed load onto a shelf with one
   * click, which is the exact accident the quarantine was for.
   */
  cleared: { kinds: ["lot", "unit", "pack"], quantity: "none", label: "Quarantine lifted" },
  retired: { kinds: ["unit"], quantity: "none", terminal: true, label: "Retired" },
};

export const isEventName = (v: string): v is EventName => v in EVENTS;

/** Does this event mean anything for this kind of thing? */
export function eventAppliesTo(event: EventName, kind: TrackedKind): boolean {
  return EVENTS[event].kinds.includes(kind);
}

export type QuantityResult =
  | { ok: true; next: number }
  | { ok: false; reason: "not_applicable" | "bad_delta" | "insufficient" | "not_divisible" };

/**
 * The new quantity after an event, or why it cannot happen.
 *
 * ── The three refusals, and why each is a refusal rather than a clamp ───────
 *
 * INSUFFICIENT. Consuming more than remains does not silently floor at zero. A
 * negative or clamped stock level is a lie that compounds: the shelf is empty,
 * the app says 0 either way, and the *discrepancy* — the thing that tells a
 * manager their count is wrong or something walked — is destroyed. Refusing
 * makes the person reconcile it while they are standing in front of the shelf.
 *
 * BAD DELTA. A zero or negative delta on an event that means "some amount
 * happened" is a caller bug, and accepting it writes a ledger row that asserts
 * nothing. The ledger is an audit trail; a no-op entry in it is noise that looks
 * like evidence.
 *
 * NOT DIVISIBLE. A `discrete` item is counted in whole units, so consuming 0.5
 * of a scalpel is not a rounding question — it is a sign the caller has the
 * wrong item, and rounding would hide that.
 */
export function nextQuantity(
  current: number,
  event: EventName,
  delta: number,
  opts: { divisible?: boolean } = {},
): QuantityResult {
  const effect = EVENTS[event].quantity;
  if (effect === "none") return { ok: false, reason: "not_applicable" };
  if (!Number.isFinite(delta) || delta <= 0) return { ok: false, reason: "bad_delta" };
  if (!opts.divisible && !Number.isInteger(delta)) return { ok: false, reason: "not_divisible" };

  if (effect === "increase") return { ok: true, next: round(current + delta) };

  const next = round(current - delta);
  if (next < 0) return { ok: false, reason: "insufficient" };
  return { ok: true, next };
}

/**
 * Quantities are stored as REAL for divisible items (half a bottle), and binary
 * floating point does not represent 0.1 exactly. Rounding to three decimals
 * keeps `0.3 - 0.1 - 0.1 - 0.1` at 0 rather than 2.7e-17, which would read as
 * "some left" forever and never let the lot close.
 */
const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * May this thing still take part in anything?
 *
 * The statuses are the app's, but the RULE is the domain's: a terminal status is
 * final, and the check belongs in one place rather than at each of the dozen
 * call sites that would each have to remember the list.
 */
const FINISHED = new Set(["retired", "consumed", "discarded", "opened", "expired"]);
export const isFinished = (status: string): boolean => FINISHED.has(status);

/**
 * A quarantined thing is NOT finished — it is frozen.
 *
 * Kept separate because the difference is the whole recall story: quarantine is
 * reversible by a human decision (TESSA.md Rule 2) and a retired instrument is
 * not. Collapsing them would make a recall permanent, which would in turn make
 * people reluctant to quarantine — the opposite of what the feature is for.
 */
export const isFrozen = (status: string): boolean => status === "quarantined";
