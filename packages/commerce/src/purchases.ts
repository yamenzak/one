/**
 * PURCHASE INTENTS — the platform's only view of money it never touches.
 *
 * A tenant is paid on their own merchant account. The platform therefore cannot
 * ask "did this settle?"; it can only be TOLD, by one of exactly two authorities:
 *
 *   a signed notification from the tenant's provider, or
 *   the tenant, by hand.
 *
 * Both converge here, on purpose. A single settle path is what stops the manual
 * lane from being a second-class shortcut that skips the checks the automated
 * one performs — and it is why `manual` can absorb every provider that has no
 * adapter, every provider whose webhook was never configured, and every payment
 * that arrived as cash.
 *
 * ── The four rules, each of which exists because of a specific failure ──────
 *
 * IDEMPOTENCE      A provider that retries a delivery must not grant twice.
 *                  Enforced on `external_id` by a UNIQUE index, and re-checked
 *                  here so the caller gets `already` rather than an exception.
 * TENANT BINDING   An intent is settled only by ITS tenant's provider. Without
 *                  this, one tenant's webhook secret could settle another
 *                  tenant's intents — every studio's catalogue behind whichever
 *                  tenant has the weakest secret.
 * AMOUNT TRUTH     What the provider says was PAID wins over what we asked for.
 *                  A mis-pasted link (the wrong package's) charges the wrong
 *                  amount, and recording our expectation would hide it forever.
 * TERMINAL ONCE    A settled intent never re-opens. A refund is recorded against
 *                  it but does not return it to `pending`, or a replayed "paid"
 *                  after a refund would silently re-grant.
 */

import type { PaymentEvent } from "./providers.js";

export type IntentStatus = "pending" | "paid" | "refunded" | "disputed" | "canceled";

export interface PurchaseIntent {
  id: string;
  tenant_id: string;
  subject_id: string;
  package_id: string;
  provider: string;
  status: IntentStatus;
  amount_cents: number;
  currency: string;
  external_id: string | null;
  settled_at: string | null;
  settled_by: string | null;
}

/** What the caller should do next. `already` means: do nothing, and say so. */
export type SettleOutcome =
  | { kind: "granted"; intent: PurchaseIntent; amountCents: number; mismatch: boolean }
  | { kind: "already" }
  | { kind: "unmatched"; reference: string | null }
  | { kind: "flagged"; intent: PurchaseIntent; status: "refunded" | "disputed" };

/** Marker written into `settled_by` when a provider settled it, not a person. */
export const SETTLED_BY_PROVIDER = "provider";

/**
 * Apply ONE verified event to one tenant's intents.
 *
 * `tenantId` is the tenant whose provider config verified the event — never a
 * value read out of the event itself. That is the tenant-binding rule: an
 * attacker who compromises one tenant's signing secret can forge events all day
 * and reach no other tenant's rows.
 */
export async function settleEvent(
  db: D1Database,
  tenantId: string,
  event: PaymentEvent,
  nowIso: string,
): Promise<SettleOutcome> {
  if (event.kind === "refunded" || event.kind === "disputed") {
    // Keyed on the provider's id, because a refund names the PAYMENT, not our
    // reference — the customer's original checkout session is long gone.
    const row = await db
      .prepare("SELECT * FROM purchase_intents WHERE tenant_id = ? AND external_id = ?")
      .bind(tenantId, event.externalId)
      .first<PurchaseIntent>();
    if (!row) return { kind: "unmatched", reference: null };
    const status = event.kind === "refunded" ? "refunded" : "disputed";
    await db
      .prepare("UPDATE purchase_intents SET status = ?, note = ? WHERE id = ?")
      .bind(status, `${status} at ${nowIso}`, row.id)
      .run();
    // Deliberately NOT revoking access here. Days already consumed are not
    // recoverable, partial refunds are common, and a dispute is not yet a loss.
    // The tenant decides — the same call the Connect rail used to make.
    return { kind: "flagged", intent: row, status };
  }

  const reference = event.reference;
  const row = await db
    .prepare("SELECT * FROM purchase_intents WHERE id = ? AND tenant_id = ?")
    .bind(reference, tenantId)
    .first<PurchaseIntent>();
  // An authentic payment we cannot place. Never an error: the customer really
  // did pay. The caller surfaces it on the tenant's reconciliation list.
  if (!row) return { kind: "unmatched", reference };

  if (row.status !== "pending") {
    // Includes the retry case (already paid) AND the replay-after-refund case,
    // which is exactly why this is checked before the external_id claim.
    return { kind: "already" };
  }

  // Claim the provider's id first. The UNIQUE index makes this the point where
  // two concurrent deliveries of the same event are resolved: the loser's write
  // fails and it reports `already` rather than granting a second time.
  try {
    await db
      .prepare("UPDATE purchase_intents SET status = 'paid', external_id = ?, amount_cents = ?, currency = ?, settled_at = ?, settled_by = ? WHERE id = ? AND status = 'pending'")
      .bind(event.externalId, event.amountCents, event.currency, nowIso, SETTLED_BY_PROVIDER, row.id)
      .run();
  } catch {
    return { kind: "already" };
  }

  return {
    kind: "granted",
    intent: row,
    amountCents: event.amountCents,
    // Surfaced, never corrected. A mismatch means the tenant's link and their
    // package disagree, which only they can fix — and which they will not know
    // about unless we say so.
    mismatch: event.amountCents !== row.amount_cents,
  };
}

/**
 * The tenant settling it themselves — cash, transfer, or a payment their
 * provider never told us about.
 *
 * Takes the same path and the same terminal-once rule as a webhook. `settledBy`
 * records WHICH person, because this is the one lane where a human asserts money
 * arrived and that assertion should be attributable.
 */
export async function settleManually(
  db: D1Database,
  tenantId: string,
  intentId: string,
  settledBy: string,
  nowIso: string,
): Promise<SettleOutcome> {
  const row = await db
    .prepare("SELECT * FROM purchase_intents WHERE id = ? AND tenant_id = ?")
    .bind(intentId, tenantId)
    .first<PurchaseIntent>();
  if (!row) return { kind: "unmatched", reference: intentId };
  if (row.status !== "pending") return { kind: "already" };
  await db
    .prepare("UPDATE purchase_intents SET status = 'paid', settled_at = ?, settled_by = ? WHERE id = ? AND status = 'pending'")
    .bind(nowIso, settledBy, row.id)
    .run();
  return { kind: "granted", intent: row, amountCents: row.amount_cents, mismatch: false };
}
