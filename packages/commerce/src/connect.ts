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
  /*
    TWO SOURCES, AND BOTH ARE LOAD-BEARING.

    The LEDGER (`subject_package_grants`) is the real answer: one row per package
    ever given to this customer, whatever absorbed its days. It exists because
    access QUEUES — a repeat purchase folds into the live subscription row, which
    keeps the FIRST package's `package_id` — so the column below records only the
    package that happened to open the row. Every later one was invisible, and a
    once-per-customer package could therefore be sold to the same person without
    limit, stacking days each time.

    The COLUMN is still consulted because the ledger starts empty on an existing
    deployment. Dropping the column check would re-open every once-only package
    for every customer who already bought one. Ledger ∪ column: nothing that was
    true yesterday becomes false today.

    `excludeSubId` skips rows belonging to ONE recurring subscription, so a
    redelivered checkout for that same subscription tops its own runway up
    instead of reading as a repeat purchase.
  */
  const ledger = excludeSubId
    ? await db.prepare("SELECT 1 AS x FROM subject_package_grants WHERE subject_id = ? AND package_id = ? AND (subscription_id IS NULL OR subscription_id NOT IN (SELECT id FROM subject_subscriptions WHERE stripe_sub_id = ?)) LIMIT 1").bind(subjectId, packageId, excludeSubId).first()
    : await db.prepare("SELECT 1 AS x FROM subject_package_grants WHERE subject_id = ? AND package_id = ? LIMIT 1").bind(subjectId, packageId).first();
  if (ledger) return true;
  const row = excludeSubId
    ? await db.prepare("SELECT 1 AS x FROM subject_subscriptions WHERE subject_id = ? AND package_id = ? AND (stripe_sub_id IS NULL OR stripe_sub_id <> ?) LIMIT 1").bind(subjectId, packageId, excludeSubId).first()
    : await db.prepare("SELECT 1 AS x FROM subject_subscriptions WHERE subject_id = ? AND package_id = ? LIMIT 1").bind(subjectId, packageId).first();
  return !!row;
}

/** How a package reached a customer. `code` is a redemption top-up, which is
 *  recorded for history but is never a "purchase" of the package. */
export type GrantSource = "admin" | "stripe" | "provider" | "manual" | "renewal" | "code";

/**
 * Append to the grant ledger. Called by EVERY path that applies a package's
 * budgets to a customer — the staff grant (new row and extend alike), both
 * webhook lanes, and the manual confirmation.
 *
 * Deliberately fire-and-forget-safe but NOT silent: the caller awaits it, and a
 * failure propagates. A grant whose ledger row is missing is a grant that
 * `once_per_customer` cannot see, which is the whole defect this replaces.
 */
export async function recordPackageGrant(
  db: D1Database,
  row: {
    id: string;
    tenantId: string;
    subjectId: string;
    packageId: string;
    subscriptionId: string | null;
    source: GrantSource;
    days: unknown;
    actorUserId?: string | null;
    at: string;
  },
): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO subject_package_grants (id, tenant_id, subject_id, package_id, subscription_id, source, days_json, actor_user_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.tenantId, row.subjectId, row.packageId, row.subscriptionId, row.source, JSON.stringify(row.days ?? []), row.actorUserId ?? null, row.at)
    .run();
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

/**
 * Mirror a connected account's capability flags onto tenant_settings.
 *
 * ── Why the REASON is stored and not just the flags ─────────────────────────
 *
 * `charges_enabled = 0` is the same value whether the seller simply has not
 * finished onboarding yet, or Stripe has restricted them for suspected fraud.
 * Those two need opposite responses from the platform — one is a nudge, the
 * other is the earliest warning we get that a seller may generate chargebacks
 * we are liable for — and storing only the boolean makes them indistinguishable
 * without a manual trip to the Stripe dashboard for each account.
 *
 * `requirements.disabled_reason` is Stripe's own word for which it is
 * (`requirements.past_due`, `rejected.fraud`, `under_review`, …), so it is kept
 * verbatim rather than interpreted here: a shared package should not be in the
 * business of deciding which of Stripe's reasons are alarming. The app reads it
 * and decides.
 */
export async function syncConnectAccount(
  db: D1Database,
  a: {
    id?: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    requirements?: { disabled_reason?: string | null } | null;
  },
): Promise<void> {
  if (!a.id) return;
  await db.prepare("UPDATE tenant_settings SET charges_enabled = ?, payouts_enabled = ?, details_submitted = ?, connect_disabled_reason = ?, updated_at = ? WHERE stripe_account_id = ?")
    .bind(
      a.charges_enabled ? 1 : 0,
      a.payouts_enabled ? 1 : 0,
      a.details_submitted ? 1 : 0,
      a.requirements?.disabled_reason ?? null,
      nowIso(),
      a.id,
    )
    .run();
}
