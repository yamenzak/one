/**
 * THE DUNNING LADDER — what happens between "a payment failed" and "the data is
 * gone", in days from the first missed payment.
 *
 * Three rungs, and the gaps between them are the point: each takes something
 * more away, and the owner is told before every step. A single cliff ("pay by
 * Friday or lose everything") is how you delete a customer who was on holiday.
 *
 *   0    → GRACE     full service, notices only
 *   7    → READ_ONLY the tenant and everyone in it drop to read-only
 *   30   → BLOCKED   the app is withheld; one screen instead
 *   37   → PURGE     tenant and memberships hard-deleted
 *
 * ── Two properties that are not negotiable ─────────────────────────────────
 *
 * **Every rung measures from ONE anchor** — the timestamp of the first failed
 * payment — never from the previous rung. Chaining them means a sweep that skips
 * a day silently extends the ladder, and a sweep that runs twice compresses it.
 *
 * **Reads are never gated, at any rung.** Withholding the product is not the
 * same as holding someone's own data hostage over a bill they did not incur.
 * `resolveHostGate` in `@4dl/tenancy` enforces that; this module only says WHEN.
 *
 * Lives in billing rather than tenancy because it is a payment lifecycle: an app
 * that never bills its tenants has no dunning, while still having a host gate.
 */

/** Days from the first missed payment to each rung. */
export const DUNNING_DAYS = { readOnly: 7, blocked: 30, purge: 37 } as const;

export type DunningRung = "grace" | "read_only" | "blocked" | "purge";

/** Which rung `daysPastDue` has reached. Pure, so the sweep and the UI agree. */
export function dunningRung(daysPastDue: number): DunningRung {
  if (daysPastDue >= DUNNING_DAYS.purge) return "purge";
  if (daysPastDue >= DUNNING_DAYS.blocked) return "blocked";
  if (daysPastDue >= DUNNING_DAYS.readOnly) return "read_only";
  return "grace";
}

/** Days between the app being withheld and the data being deleted — the window
 *  in which everyone affected must be told, and can still export or leave. */
export const PURGE_WARNING_DAYS = DUNNING_DAYS.purge - DUNNING_DAYS.blocked;
