/**
 * WHEN DOES THIS EXPIRE — and which of the three clocks got there first.
 *
 * A thing on a shelf in a medical centre is running up to three countdowns at
 * once, and the earliest one wins:
 *
 *   PRINTED    the manufacturer's date, off the label or GS1 AI (17)
 *   OPENED     opened_at + post-opening days, for anything with a shortened life
 *              once the seal is broken (multi-dose vials, opened solutions)
 *   STERILE    sterilised_at + sterile shelf life, for a reprocessed pack
 *
 * ── Why the middle one is the dangerous one ─────────────────────────────────
 *
 * A multi-dose vial can be printed 2027 and be unusable 28 days after opening.
 * A system that shows the printed date is not merely imprecise, it is confidently
 * wrong at exactly the moment someone is deciding whether to use it — and it is
 * wrong in the unsafe direction. Every field below exists because leaving one out
 * produces a date that looks authoritative and is too late.
 *
 * ── Why the reason is returned, not just the date ───────────────────────────
 *
 * "Expires in 3 days" and "expires in 3 days BECAUSE it was opened on Monday"
 * lead to different actions: the second one can be checked, disputed, or fixed
 * by correcting the opening date. A bare date gives a nurse nothing to argue
 * with, so the caller always gets the winning clock alongside the answer.
 *
 * Everything here is total and pure — no clock, no I/O. `now` is a parameter for
 * the same reason it is in gs1.ts: a date rule whose boundaries cannot be tested
 * is a date rule nobody should trust.
 */

/** Which clock produced the effective expiry. */
export type ExpiryReason = "printed" | "opened" | "sterile";

export interface ExpiryInputs {
  /** Manufacturer's printed expiry, ISO `YYYY-MM-DD`. */
  printed?: string | null;
  /** When the seal was broken. ISO date or timestamp — see `isoToMs`. */
  openedAt?: string | null;
  /** Shelf life after opening. Absent or 0 ⇒ opening does not shorten it. */
  postOpeningDays?: number | null;
  /** When the pack came out of the autoclave. ISO date or timestamp. */
  sterilisedAt?: string | null;
  /** Sterile shelf life in days. Absent or 0 ⇒ no sterile clock. */
  sterileShelfDays?: number | null;
}

export interface EffectiveExpiry {
  /** ISO `YYYY-MM-DD`, or null when nothing expires. */
  at: string | null;
  /** Which clock won. Null exactly when `at` is null. */
  reason: ExpiryReason | null;
  /**
   * Every clock that was running, earliest first.
   *
   * Surfaced so a UI can explain a surprise — "printed 2027-04-01, but opened
   * 2026-01-02 (+28d)" — without recomputing. A date the holder disagrees with
   * is a date they need to see the working for.
   */
  clocks: { at: string; reason: ExpiryReason }[];
}

const DAY_MS = 86_400_000;

/**
 * ISO date → UTC ms. Null for anything unparseable, never a throw or a NaN.
 *
 * Accepts a full timestamp as well as a bare date, and truncates to the calendar
 * day. That is not laxity, it is the shape of the data: `printed` is copied off
 * a label and is genuinely a date, while `openedAt` and `sterilisedAt` are
 * MOMENTS — the ledger records the time of day because an audit trail that says
 * only "Tuesday" cannot be reconciled against a case list, and discarding the
 * time at the source to please this function would cost more than it gains.
 *
 * A date-only parser was the first version, and it failed silently in the worst
 * possible way: `opened_at` arrived as `2026-08-01T15:54:51.198Z`, was rejected,
 * the opened clock never started, and the shelf confidently showed the printed
 * 2027 date for a vial that was unusable in seven days. Strictness that drops an
 * input is not safety.
 *
 * ⚠️ The truncation is to the UTC day, while shelf life is counted in a clinic's
 * local days — see TESSA.md §7 for why that is recorded as a known limit rather
 * than papered over here.
 */
function isoToMs(iso: string | null | undefined): number | null {
  const day = iso ? /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(iso)?.[1] : undefined;
  if (!day) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

const msToIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * The earliest of the three clocks.
 *
 * A missing input is a clock that is not running — NOT a clock that expired.
 * That distinction is the whole safety of the function: treating an absent
 * `openedAt` as "opened at epoch" would mark the entire stock room expired, and
 * treating an absent `printed` as "never expires" is right, because a thing with
 * no printed date genuinely has no printed expiry.
 */
export function effectiveExpiry(input: ExpiryInputs): EffectiveExpiry {
  const clocks: { at: string; reason: ExpiryReason }[] = [];

  const printed = isoToMs(input.printed);
  if (printed !== null) clocks.push({ at: msToIso(printed), reason: "printed" });

  const opened = isoToMs(input.openedAt);
  const postDays = input.postOpeningDays ?? 0;
  // Both halves required. A post-opening rule on an unopened item is not yet
  // running, and an opening date on an item with no post-opening rule shortens
  // nothing.
  if (opened !== null && postDays > 0) {
    clocks.push({ at: msToIso(opened + postDays * DAY_MS), reason: "opened" });
  }

  const sterilised = isoToMs(input.sterilisedAt);
  const sterileDays = input.sterileShelfDays ?? 0;
  if (sterilised !== null && sterileDays > 0) {
    clocks.push({ at: msToIso(sterilised + sterileDays * DAY_MS), reason: "sterile" });
  }

  if (clocks.length === 0) return { at: null, reason: null, clocks };

  clocks.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const winner = clocks[0]!;
  return { at: winner.at, reason: winner.reason, clocks };
}

export type ExpiryStatus = "none" | "ok" | "soon" | "expired";

/**
 * Expiry as a traffic light.
 *
 * ── The boundary is deliberate: expiry day is still USABLE ──────────────────
 *
 * A printed expiry of 2027-01-31 means the item is good *through* the 31st, not
 * up to the start of it. Off-by-one here throws away a day of stock across every
 * item in the building, and — worse in the other direction — a system that
 * expired things a day late would be handing out lapsed stock. The comparison is
 * therefore `today > expiry`, not `>=`, and it is tested at exactly that edge.
 *
 * `warnDays` is per-caller because urgency is not universal: a month's warning is
 * right for a stock room reorder and useless on a tray being opened now.
 */
export function expiryStatus(at: string | null, today: string, warnDays = 30): ExpiryStatus {
  const expiry = isoToMs(at);
  const now = isoToMs(today);
  if (expiry === null || now === null) return "none";
  if (now > expiry) return "expired";
  if (expiry - now <= warnDays * DAY_MS) return "soon";
  return "ok";
}

/**
 * Whole days from `today` until expiry. Negative once it has lapsed.
 *
 * Signed on purpose: "expired 3 days ago" is a different conversation from
 * "expires in 3 days", and collapsing the sign to zero loses the one number an
 * auditor asks for.
 */
export function daysUntilExpiry(at: string | null, today: string): number | null {
  const expiry = isoToMs(at);
  const now = isoToMs(today);
  if (expiry === null || now === null) return null;
  return Math.round((expiry - now) / DAY_MS);
}

/**
 * May this be used right now?
 *
 * A thin, deliberately boring wrapper — but it is the single place the app asks
 * the question, so the answer cannot drift between the scan screen and the case
 * screen. Note what it does NOT do: it never overrides, and it has no "expired
 * but probably fine" branch. Per TESSA.md Rule 2, a human may record a decision
 * to use something anyway; this function does not make that decision for them.
 */
export function isUsable(at: string | null, today: string): boolean {
  return expiryStatus(at, today) !== "expired";
}
