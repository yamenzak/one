/**
 * THE CONNECTED-ACCOUNT RAIL's own reconciliation helpers.
 *
 * A tenant sells to its own customers on its own Stripe account, and these are
 * the questions that arise on that rail and nowhere else: may this customer buy
 * this package at all, have they bought it before, how does an N-installment
 * plan split one package's runway, and how is an installment subscription
 * cancelled once it has been paid off.
 *
 * They came out of the app's `stripe-routes.ts` alongside the platform rail's
 * (`@4dl/billing/webhook.ts`). Splitting them apart is what makes the file's two
 * halves legible: one bills the tenant, the other lets the tenant bill someone
 * else, and until now they were interleaved.
 *
 * Deliberately NOT here: what a purchase GRANTS. That is the budget builder, and
 * the scopes it fills are the app's registry.
 */

import type { HasDb } from "@4dl/core";
import { nowIso } from "@4dl/core";

/**
 * Cancel one subscription on the tenant's OWN connected account.
 *
 * Injected rather than imported, and this is the one invariant it protects:
 * `@4dl/commerce` sits BESIDE `@4dl/billing`, never on it — an app can take
 * either without the other. The Stripe client lives in billing because that is
 * where the platform rail is; reaching for it here would make every app that
 * sells access to its own customers also depend on a payment provider for its
 * OWN subscription, which it may not have.
 *
 * Returns whether the cancel actually went through. `false` is not an error —
 * see the caller.
 */
export type CancelOnConnectedAccount = (
  connectedAccountId: string,
  stripeSubId: string,
) => Promise<boolean>;
import type { Budget } from "./budgets.js";

/**
 * May this SUBJECT buy this package directly (self-checkout)?
 *
 * Three visibilities: `marketplace` is public; the RESTRICTED one is buyable
 * only by the subject it names; anything else is grant-only — staff assigns it
 * and nobody can buy it. A blocked package reads as "not found" at checkout, so
 * it is never an oracle for what another subject was offered.
 *
 * The restricted visibility's stored VALUE is a parameter, because it is data in
 * an app's database (Kova's rows say `client_specific`) and renaming it would be
 * a migration, not an edit. The default matches nothing on purpose: an app that
 * forgets to pass it gets grant-only, which fails closed.
 */
export function purchaseBlocked(
  pkg: { visibility: string; restricted_subject_id: string | null },
  subjectId: string,
  restrictedVisibility = "\u0000none",
): boolean {
  if (pkg.visibility === "marketplace") return false;
  if (pkg.visibility === restrictedVisibility) return !(pkg.restricted_subject_id && pkg.restricted_subject_id === subjectId);
  return true;
}

/**
 * Has this SUBJECT ever held this package before? The `once_per_customer` test,
 * shared by both paid checkout paths and the webhook grant, with the same
 * semantics as the staff-grant path (any row, whatever its status — an intro
 * offer is once, not once-at-a-time).
 *
 * `excludeSubId` skips the row belonging to a Stripe subscription we're already
 * processing, so a webhook redelivery / renewal of that same subscription is not
 * mistaken for a second purchase.
 */
export async function hasPriorPurchase(db: D1Database, subjectId: string, packageId: string, excludeSubId: string | null = null): Promise<boolean> {
  const row = excludeSubId
    ? await db.prepare("SELECT 1 AS x FROM subject_subscriptions WHERE subject_id = ? AND package_id = ? AND (stripe_sub_id IS NULL OR stripe_sub_id <> ?) LIMIT 1").bind(subjectId, packageId, excludeSubId).first()
    : await db.prepare("SELECT 1 AS x FROM subject_subscriptions WHERE subject_id = ? AND package_id = ? LIMIT 1").bind(subjectId, packageId).first();
  return !!row;
}

/** Per-cycle share of a package's runway for an N-installment plan: each
 *  payment unlocks days/N (min 1). N<=1 leaves the specs untouched. */
export function scaleSpecs(specs: { feature: Budget["feature"]; days: number }[], n: number): { feature: Budget["feature"]; days: number }[] {
  return n > 1 ? specs.map((s) => ({ ...s, days: Math.max(1, Math.round(s.days / n)) })) : specs;
}

/** Stop an installment plan after its final payment: cancel the Stripe
 *  subscription on the connected account, and only clear `stripe_sub_id` once
 *  the cancel actually succeeded. Cancel-before-unlink means a failed cancel
 *  leaves the row resolvable so a stray invoice hits the `alreadyDone` guard
 *  (no extra grant) and the cancel is retried, rather than billing on with a
 *  dangling, unresolvable subscription. */
export async function cancelInstallmentSub(
  db: D1Database,
  tenantId: string,
  stripeSubId: string,
  rowId: string,
  cancel: CancelOnConnectedAccount,
): Promise<void> {
  const settings = await db.prepare("SELECT stripe_account_id FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ stripe_account_id: string | null }>();
  const canceled = settings?.stripe_account_id ? await cancel(settings.stripe_account_id, stripeSubId) : true;
  if (canceled) await db.prepare("UPDATE subject_subscriptions SET stripe_sub_id = NULL WHERE id = ?").bind(rowId).run();
}

/** Mirror a connected account's capability flags onto tenant_settings. */
export async function syncConnectAccount(db: D1Database, a: { id?: string; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean }): Promise<void> {
  if (!a.id) return;
  await db.prepare("UPDATE tenant_settings SET charges_enabled = ?, payouts_enabled = ?, details_submitted = ?, updated_at = ? WHERE stripe_account_id = ?")
    .bind(a.charges_enabled ? 1 : 0, a.payouts_enabled ? 1 : 0, a.details_submitted ? 1 : 0, nowIso(), a.id)
    .run();
}
