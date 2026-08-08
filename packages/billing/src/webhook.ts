/**
 * PROVIDER WEBHOOK RECONCILIATION — the half of the Stripe listener that is the
 * same for every product.
 *
 * A webhook handler is two things wearing one coat. There is the part that reads
 * a provider payload and reconciles it against our own row — idempotency, the
 * shape of an id, which subscription an invoice belongs to, whether a status may
 * overwrite the one we hold, how much of a refund reverses how many credits.
 * None of that knows what the app sells. And there is the part that decides what
 * to TELL people and what to GRANT them, which is entirely the app's registry.
 *
 * This is the first part. The second stayed in the app — see the README for
 * exactly where the line falls and why the route trees did not move with it.
 *
 * ── Two things in here are subtle and were both learned the hard way ─────────
 *
 * `invoiceSubscriptionId` reads THREE places, because Stripe's Basil API version
 * (2025-03-31+) moved `subscription` off the invoice root and onto the line
 * items — and webhook payloads render at the ENDPOINT's dashboard API version,
 * not the one this code pins for its own requests.
 *
 * `LADDER_OWNED` is why a payment webhook cannot stall a dunning ladder. Read
 * its comment before touching the status switch.
 */

import type { HasDb } from "@4dl/core";
import { nowIso, nowMs } from "@4dl/core";
import { stripeCall } from "./stripe.js";

/** Webhook idempotency: the first insert of a Stripe event id processes; a
 *  redelivery finds the row already present (changes = 0) and short-circuits. */
export async function firstSeen(db: D1Database, eventId: string | undefined): Promise<boolean> {
  if (!eventId) return true; // no id (shouldn't happen) → process, don't drop
  const r = await db.prepare("INSERT OR IGNORE INTO stripe_events (id, at) VALUES (?, ?)").bind(eventId, nowMs()).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Release a claimed event id (see the webhook try/catch): a handler that threw
 *  after `firstSeen` claimed the id must delete the row so Stripe's redelivery
 *  is processed instead of short-circuited as a duplicate. Best-effort. */
export async function unmarkSeen(db: D1Database, eventId: string | undefined): Promise<void> {
  if (!eventId) return;
  await db.prepare("DELETE FROM stripe_events WHERE id = ?").bind(eventId).run().catch(() => undefined);
}

/** A Stripe id that may arrive as a bare string or an expanded object. */
export function stripeId(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  return null;
}

/**
 * Resolve the Stripe SUBSCRIPTION id off an Invoice across API-version shapes.
 *
 * `stripe.ts` pins the version of requests WE make, but a webhook payload's
 * shape follows the version stored on the Stripe *endpoint* — which nothing in
 * this repo can set. On an account defaulting to 2025-03-31 ("Basil") or later,
 * `invoice.subscription` is GONE: it moved to
 * `invoice.parent.subscription_details.subscription` (and per-line under
 * `lines.data[].subscription`). Reading only the legacy field meant every
 * renewal invoice resolved to "no subscription", so `renewClientSubscription`
 * was never called — the client's card was charged monthly and their budget was
 * never topped up, with a 200 back to Stripe and no signal anywhere.
 */
export function invoiceSubscriptionId(inv: Record<string, unknown>): string | null {
  const direct = stripeId(inv.subscription);
  if (direct) return direct;
  const parent = inv.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  const fromParent = stripeId(parent?.subscription_details?.subscription);
  if (fromParent) return fromParent;
  const lines = (inv.lines as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  for (const line of lines) {
    const fromLine =
      stripeId(line.subscription) ??
      stripeId((line.parent as { subscription_item_details?: { subscription?: unknown } } | undefined)?.subscription_item_details?.subscription);
    if (fromLine) return fromLine;
  }
  return null;
}

/**
 * Does this Stripe **subscription** object carry a payment method Stripe can
 * actually charge? This is the whole answer to "is this trial paid for".
 *
 * VERIFIED against live Stripe test mode (not inferred from the docs — the bug
 * this closes shipped because the behaviour was assumed). For the exact request
 * `/billing/plan-intent` makes (`default_incomplete` + `trial_period_days` +
 * `save_default_payment_method: on_subscription`):
 *
 *   • at creation, with no card:      status trialing · default_payment_method
 *                                     null · pending_setup_intent "seti_…"
 *                                     (a bare STRING in the webhook payload)
 *   • after the SetupIntent is confirmed (what Stripe.js `confirmSetup` does),
 *     Stripe fires `setup_intent.succeeded` and then, ~1s later,
 *     **`customer.subscription.updated`** carrying
 *     `default_payment_method: "pm_…"` and `pending_setup_intent: null`.
 *
 * That second event is what re-drives activation, so NO new webhook event type
 * has to be subscribed — `customer.subscription.updated` was already handled.
 *
 * So the test is: a trial is paid for unless Stripe is still asking us for a
 * payment method. A SET `pending_setup_intent` is Stripe saying exactly that, and
 * it is the one field that reliably separates the two observed shapes; it clears
 * to `null` the moment a card attaches. An ABSENT `pending_setup_intent` reads as
 * "nothing left to collect" — the hosted-Checkout shape, where the card is taken
 * before the subscription exists. The field has been on Subscription since API
 * version 2019-03-14 and is present on the current one (verified), so absence
 * means "no setup pending", not "old payload". Because webhook payload shape does
 * follow the endpoint's dashboard API version and nothing in this repo sets it
 * (AGENTS.md §5), the shape is checked positively rather than by absence: only an
 * attached payment method counts. The theoretically ambiguous shape — `trialing`,
 * no payment method, no `pending_setup_intent` key at all — does not occur in
 * practice (real payloads carry both keys, verified), and because the check is
 * fail-closed it would be treated as "not payable" if it ever did.
 *
 * Note it is deliberately *not* enough that the customer has a card on file: for
 * a returning owner whose customer already carries a default payment method,
 * Stripe still mints a pending SetupIntent (verified — status
 * `requires_confirmation` rather than `requires_payment_method`) and still leaves
 * the subscription's own `default_payment_method` null. Such a trial only
 * activates once the owner completes the card sheet, which is the safe direction:
 * an unentitled studio with a one-click fix, not an entitled unpaid one.
 */
export function hasPaymentMethod(obj: Record<string, unknown>): boolean {
  // FAIL CLOSED: a positive signal is required, never merely the absence of a
  // negative one. This gates whether a `trialing` subscription is allowed to grant
  // a paid plan and its whole monthly credit grant, and the bug it exists to stop
  // was exactly a card-less trial being entitled — free Light plus 3,000 credits,
  // repeatable once per studio. An earlier version treated "no pending_setup_intent
  // field" as "nothing left to collect", which reads reasonably and is wrong for a
  // money path: any payload shape we did not anticipate would grant.
  //
  // Verified against live Stripe test mode: a trial created the way
  // /billing/plan-intent creates one carries `default_payment_method: null` and a
  // set `pending_setup_intent`; ~1s after Stripe.js confirms the SetupIntent,
  // `customer.subscription.updated` re-fires with `default_payment_method: "pm_…"`
  // and `pending_setup_intent: null`. So the positive signal always arrives — the
  // paid plan is granted a second later, not never.
  //
  // Note a non-trial subscription is unaffected: `status === "active"` activates on
  // its own, and Stripe only reports `active` once money has actually moved.
  return Boolean(stripeId(obj.default_payment_method) || stripeId(obj.default_source));
}

/** Tenant behind a Stripe customer. Takes `unknown` on purpose: webhook objects
 *  that carry no customer (a Dispute) must read as "no tenant", never bind
 *  `undefined` into D1 (which throws and puts the handler into Stripe's retry
 *  loop forever). */
export async function tenantByCustomer(db: D1Database, customerId: unknown): Promise<string | null> {
  const id = stripeId(customerId);
  if (!id) return null;
  const row = await db.prepare("SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = ?").bind(id).first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}

/**
 * Statuses the LADDER or the CLOSE flow owns. A payment-state webhook may never
 * overwrite one.
 *
 * This is the whole reason the two halves can coexist. Stripe owns the raw
 * payment state; `dailySweep` owns the escalation layered on `past_due_at`, and
 * every rung selects on the PREVIOUS rung's status:
 *
 *   past_due  --7d-->  suspended  --30d-->  blocked  --37d-->  purged
 *
 * so a webhook that rewrites the current rung breaks the chain permanently.
 * Stripe's own retry schedule exhausts around day 21 and flips the subscription
 * to `unpaid` — squarely between the 7-day and 30-day rungs. Writing that
 * unconditionally overwrote `suspended`, so `WHERE status = 'suspended'` never
 * matched again and the ladder stalled at read-only forever: the tenant was
 * never blocked, never purged, and their storage was never reclaimed. It failed
 * SAFE (still read-only, nothing deleted) and therefore silently.
 *
 * `closing` is here for the same structural reason from the other direction. It
 * is an OWNER decision carrying its own `delete_at`, and `scheduleTenantClose`
 * cancels the Stripe subscription — which fires `canceled` right back at us. The
 * race was real: land after the UPDATE and the close became a plain
 * cancellation, `WHERE status = 'closing'` stopped matching, and a studio the
 * owner asked us to delete was kept indefinitely.
 */
export const LADDER_OWNED = "'suspended','blocked','canceled','closing'";

/**
 * Reconcile our subscription row against Stripe's authoritative subscription
 * object (fired on `customer.subscription.created|updated`). Stripe owns the raw
 * payment state (active / past_due / unpaid / canceled); our daily cron owns the
 * grace→suspend→delete escalation layered on `past_due_at`, so here we only seed
 * or clear those markers — never fight the cron's windows.
 */
export async function syncStripeSubscription(db: D1Database, obj: Record<string, unknown>): Promise<void> {
  const tenantId = await tenantByCustomer(db, obj.customer);
  if (!tenantId) return;
  const subId = typeof obj.id === "string" ? obj.id : null;
  // Reconcile ONLY the tenant's CURRENT subscription. A stale sub (an old one
  // replaced on an upgrade, still emitting past_due/canceled/updated events)
  // must not move the live plan's status or reclaim the stored sub id. When no
  // sub is stored yet (a fresh inline sub), let it through so it gets adopted.
  const cur = await db.prepare("SELECT stripe_sub_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ stripe_sub_id: string | null }>();
  if (cur?.stripe_sub_id && subId && cur.stripe_sub_id !== subId) return;
  // `current_period_end` moved OFF the Subscription root in Basil (2025-03-31+) and
  // onto each item, and webhook payloads render at the ENDPOINT's dashboard API
  // version — not the version this repo pins for its own requests. Verified against
  // real events on an account defaulting to 2025-11-17.clover: the root field is
  // absent and the value lives at `items.data[].current_period_end`. Reading only
  // the root meant `cpe` was always null, the COALESCE wrote nothing, and the
  // "renews on" date on Business stayed blank until an invoice.paid arrived (that
  // branch reads `period_end`, which does still exist). No money impact — but every
  // synthetic fixture in the suite hand-feeds the pre-Basil shape, so nothing caught
  // it. Read both, newest-period-wins across items.
  const items = (obj.items as { data?: { current_period_end?: unknown }[] } | undefined)?.data ?? [];
  const itemEnd = items
    .map((i) => (typeof i.current_period_end === "number" ? i.current_period_end : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  const cpeEpoch = typeof obj.current_period_end === "number" ? obj.current_period_end : itemEnd;
  const cpe = cpeEpoch > 0 ? new Date(cpeEpoch * 1000).toISOString() : null;
  const now = nowIso();
  await db.prepare("UPDATE subscriptions SET stripe_sub_id = COALESCE(?, stripe_sub_id), current_period_end = COALESCE(?, current_period_end), updated_at = ? WHERE tenant_id = ?").bind(subId, cpe, now, tenantId).run();
  switch (obj.status as string) {
    case "canceled":
      await db.prepare(`UPDATE subscriptions SET status = 'canceled', plan_id = 'free' WHERE tenant_id = ? AND status NOT IN (${LADDER_OWNED})`).bind(tenantId).run();
      break;
    case "unpaid":
      await db.prepare(`UPDATE subscriptions SET status = 'unpaid' WHERE tenant_id = ? AND status NOT IN (${LADDER_OWNED})`).bind(tenantId).run();
      break;
    case "past_due":
      await db.prepare(`UPDATE subscriptions SET status = 'past_due', past_due_at = COALESCE(past_due_at, ?) WHERE tenant_id = ? AND status NOT IN (${LADDER_OWNED})`).bind(now, tenantId).run();
      break;
    case "active":
    case "trialing": {
      // A card-less trial must not be stamped `trialing` either. `status` is read
      // as "this studio has a live subscription" in two places that both cost
      // money: the daily sweep grants the plan's monthly credits to every tenant
      // whose status is `active` or `trialing` (index.ts), and `GET /billing`
      // reports it to the owner. Leave it exactly where it was — like
      // `incomplete` — until a payment method lands and Stripe re-fires
      // `customer.subscription.updated`.
      const st = obj.status as string;
      if (st === "trialing" && !hasPaymentMethod(obj)) break;
      // RECOVERY may overwrite every dunning rung — paying is exactly how a
      // suspended or blocked studio comes back, and clearing all three markers
      // is the point. `closing` is the one exception: that is an OWNER decision
      // with its own 7-day hold and its own undo (`cancelTenantClose`), and a
      // late webhook must not silently cancel it.
      await db.prepare("UPDATE subscriptions SET status = ?, past_due_at = NULL, suspend_at = NULL, delete_at = NULL WHERE tenant_id = ? AND status != 'closing'").bind(st === "trialing" ? "trialing" : "active", tenantId).run();
      break;
    }
    // incomplete / incomplete_expired / paused → leave status untouched.
  }
}

/**
 * Adopt `newSubId` as the tenant's current platform subscription, cancelling any
 * DIFFERENT existing sub at Stripe first. A plan change creates a second Stripe
 * subscription; without this the old one keeps billing (double charge) and its
 * later deleted/past_due events would fight the live plan. Best-effort cancel
 * (a Stripe failure just leaves the old sub to be cleaned up later); the id swap
 * always lands so the lifecycle guards key off the current sub.
 */
export async function supersedePlatformSub(db: D1Database, secretKey: string, tenantId: string, newSubId: string): Promise<void> {
  const row = await db.prepare("SELECT stripe_sub_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ stripe_sub_id: string | null }>();
  const old = row?.stripe_sub_id ?? null;
  if (old && old !== newSubId && secretKey) {
    await stripeCall(secretKey, `subscriptions/${old}`, undefined, { method: "DELETE" }).catch(() => undefined);
  }
  await db.prepare("UPDATE subscriptions SET stripe_sub_id = ? WHERE tenant_id = ?").bind(newSubId, tenantId).run();
}

/**
 * Credits already clawed back for a charge, read off the append-only
 * `credit_ledger` by `ref` (= the charge id). This is what makes repeat
 * refund/dispute events INCREMENTAL: Stripe fires `charge.refunded` for every
 * partial refund and each event carries the CUMULATIVE `amount_refunded`, so
 * without this a second $5 refund on a $100 pack would reverse the whole
 * proportional total a second time. The ledger is the existing record of every
 * credit movement, so no new table is needed — a reversal that never landed
 * (the `purchased` bucket was already drained, so `revokePurchased` clamped to a
 * no-op) also leaves no row, which is correct: nothing was taken, so the next
 * event may still take up to the amount owed and never more.
 */
export async function creditsAlreadyReversed(db: D1Database, tenantId: string, chargeId: string | null): Promise<number> {
  if (!chargeId) return 0;
  const row = await db
    .prepare("SELECT COALESCE(SUM(-delta), 0) AS reversed FROM credit_ledger WHERE tenant_id = ? AND ref = ? AND reason IN ('pack.refund','pack.dispute')")
    .bind(tenantId, chargeId)
    .first<{ reversed: number }>();
  return Math.max(0, Math.floor(row?.reversed ?? 0));
}

/**
 * The charge behind a refund/dispute event, plus how much of it has been
 * reversed so far (in cents).
 *
 * `charge.refunded` delivers the Charge itself. `charge.dispute.created`
 * delivers a **Dispute**: it carries `charge` / `payment_intent`, its own
 * `amount` (the disputed portion), an EMPTY `metadata` and **no `customer`** —
 * so reading `metadata.kova_tenant` / `obj.customer` off it (what this handler
 * used to do) always came up empty. The dispute branch was therefore dead code:
 * a tenant could charge back a credit pack, we'd lose the money, the credits
 * stayed spendable and nobody was told. Resolve the underlying charge first.
 */
export async function resolveReversal(
  obj: Record<string, unknown>,
  eventType: string,
  secretKey: string,
): Promise<{ chargeId: string | null; amountCents: number; reversedCents: number; meta: Record<string, string>; customer: unknown }> {
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  if (eventType !== "charge.dispute.created") {
    // Charge object: `amount_refunded` is CUMULATIVE across every refund so far.
    return {
      chargeId: typeof obj.id === "string" ? obj.id : null,
      amountCents: num(obj.amount),
      reversedCents: num(obj.amount_refunded),
      meta: (obj.metadata as Record<string, string> | undefined) ?? {},
      customer: obj.customer,
    };
  }
  const disputed = num(obj.amount);
  const chargeId = stripeId(obj.charge);
  const piId = stripeId(obj.payment_intent);
  // A failure here THROWS on purpose: the webhook's catch releases the event-id
  // claim and 500s, so Stripe redelivers the dispute instead of us dropping a
  // chargeback we couldn't attribute.
  const src = chargeId
    ? await stripeCall<Record<string, unknown>>(secretKey, `charges/${chargeId}`)
    : piId
      ? await stripeCall<Record<string, unknown>>(secretKey, `payment_intents/${piId}`)
      : null;
  if (!src) throw new Error("dispute carries neither charge nor payment_intent");
  return {
    // Key the reversal ledger off the CHARGE id either way, so a dispute and a
    // partial refund on the same charge share one cumulative total.
    chargeId: chargeId ?? stripeId(src.latest_charge) ?? piId,
    amountCents: num(src.amount),
    // A dispute can follow partial refunds; money reversed = both.
    reversedCents: Math.min(num(src.amount), disputed + num(src.amount_refunded)),
    meta: (src.metadata as Record<string, string> | undefined) ?? {},
    customer: src.customer,
  };
}

/** The credit authority, as much of it as a reversal touches. */
export interface RevocableAuthority {
  revokePurchased(credits: number, reason?: string, ref?: string): Promise<unknown>;
}

export interface ReverseCreditsDeps {
  db: D1Database;
  /** For resolving the charge behind a Dispute — see `resolveReversal`. */
  secretKey: string;
  /**
   * The prefix the checkout stamped, so this reads `<prefix>_tenant` and
   * `<prefix>_credits`. Same value as `StripeBranding.metadataPrefix` and the
   * rail's `metadataPrefix`, and it is LIVE DATA — see the note at each app's
   * `STRIPE_BRANDING`.
   */
  metadataPrefix: string;
  /** This tenant's credit authority, already bound. */
  authority: (tenantId: string) => Promise<RevocableAuthority>;
}

export interface ReversalOutcome {
  tenantId: string;
  /** A chargeback rather than a refund — the app's copy differs. */
  disputed: boolean;
  /** Credits THIS event actually clawed back. 0 when the total was already settled. */
  reversed: number;
  chargeId: string | null;
}

/**
 * MONEY WENT BACK; THE CREDITS HAVE TO GO WITH IT.
 *
 * `charge.refunded` and `charge.dispute.created` are the two events that mean a
 * payment we already granted against has been reversed. Without this, a
 * refunded credit pack leaves its credits spendable — the tenant keeps the
 * goods and the money, and nothing anywhere reports a problem. It shipped that
 * way in two of three apps, which is why it is here rather than in one of them.
 *
 * Three things make this harder than "subtract the pack":
 *
 *   PARTIAL REFUNDS ARE PROPORTIONAL. A $25 refund on a $100 pack takes a
 *   quarter of the credits, clamped so a full refund takes exactly the pack and
 *   never more.
 *
 *   EVERY EVENT CARRIES THE CUMULATIVE TOTAL. Stripe fires `charge.refunded`
 *   again for each partial refund, with `amount_refunded` summed to date — so
 *   subtracting the event's own share twice is the default behaviour of the
 *   obvious implementation. `creditsAlreadyReversed` reads the ledger back by
 *   charge id and takes only the difference.
 *
 *   A DISPUTE IS NOT A CHARGE. It carries no customer and empty metadata, so
 *   `resolveReversal` fetches the underlying charge first. That lookup throws
 *   rather than returning empty, so an unattributable chargeback is redelivered
 *   instead of silently dropped.
 *
 * Returns what happened so the caller can tell the owner in its own words —
 * notification copy is the app's registry, never a shared package's. `null`
 * means no tenant could be resolved and nothing was touched.
 */
export async function reverseChargedCredits(
  deps: ReverseCreditsDeps,
  event: { type: string; data: { object: Record<string, unknown> } },
): Promise<ReversalOutcome | null> {
  const { db, secretKey, metadataPrefix } = deps;
  const disputed = event.type === "charge.dispute.created";
  const r = await resolveReversal(event.data.object, event.type, secretKey);
  const tenantId = r.meta[`${metadataPrefix}_tenant`] ?? (await tenantByCustomer(db, r.customer));
  if (!tenantId) return null;

  const packCredits = Number(r.meta[`${metadataPrefix}_credits`] ?? 0);
  let reversed = 0;
  if (Number.isFinite(packCredits) && packCredits > 0 && r.amountCents > 0) {
    const share = Math.min(1, Math.max(0, r.reversedCents / r.amountCents));
    const owed = Math.min(packCredits, Math.round(packCredits * share));
    const take = owed - (await creditsAlreadyReversed(db, tenantId, r.chargeId));
    if (take > 0) {
      const authority = await deps.authority(tenantId);
      // `ref` = the CHARGE id, not the pack id, so the ledger doubles as the
      // per-charge reversal total `creditsAlreadyReversed` reads back.
      await authority.revokePurchased(take, disputed ? "pack.dispute" : "pack.refund", r.chargeId ?? undefined);
      reversed = take;
    }
  }
  return { tenantId, disputed, reversed, chargeId: r.chargeId };
}
