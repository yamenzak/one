/**
 * Stripe routes (SPEC §7) — KOVA'S OWN rail only: plan checkout, credit-pack
 * checkout, the platform webhook, and the admin config endpoints under
 * /api/admin/stripe/*.
 *
 * The Connect rail that used to live here is gone. A tenant is paid by its own
 * customers on its OWN provider — see `payments-routes.ts`. The only reason this
 * file still exports `grantClientPackage` / `renewClientSubscription` is that
 * they are the runway maths, and having one implementation of those is worth
 * more than having them in a tidier place.
 */

import { Hono } from "hono";
import { z } from "zod";
import { dispatchEvent } from "@4dl/billing-rail";
import { resolveEntitlements, trialPeriodDays, buildBudgetsForPurchase, mergeAddOnBalances, type Budget, type AddOnBalance } from "@kova/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import { getSubscription, listPacks, listPlans, seedBilling, getPlan } from "./billing-store.js";
import { gateFeature } from "./client-flags.js";
import { requireClientAccess } from "./clients.js";
import { notify, notifyOwners } from "./notify.js";
import {
  ensureCustomer,
  stripeCall,
  stripeConfig,
  stripeEnabled,
  syncCatalog,
  verifyWebhook,
  STRIPE_BRANDING,
  KOVA_APP,
} from "./stripe.js";
import { newId, nowIso, nowMs, periodKey } from "./ids.js";
import { parseJson, j } from "./db.js";
/**
 * The generic half of this listener now lives in `@4dl/billing`: payload
 * readers, event idempotency, subscription-status reconciliation (including the
 * `LADDER_OWNED` clamp that keeps a payment webhook from stalling the dunning
 * ladder) and the refund→credit reversal maths. Everything left in this file
 * either reads Kova's registries or answers an HTTP route.
 */
import {
  firstSeen,
  hasPaymentMethod,
  invoiceSubscriptionId,
  reverseChargedCredits as reverseCredits,
  stripeAdminRoutes as stripeAdminRoutes_,
  stripeId,
  supersedePlatformSub,
  syncStripeSubscription,
  tenantByCustomer,
  unmarkSeen,
} from "@4dl/billing";
import { cancelInstallmentSub as cancelInstallmentSubBase, hasPriorPurchase, recordPackageGrant, scaleSpecs, type CancelOnConnectedAccount, type GrantSource } from "@4dl/commerce";

/**
 * Ending a recurring charge is now the STUDIO'S to do, not ours.
 *
 * The Connect rail could cancel a client's subscription because the platform
 * held API access to the connected account. On the tenant rail it does not —
 * that is the entire point — so there is nothing to call. What is left is the
 * local half: forget the recurring key, so this row stops expecting renewals and
 * a later stray charge is not mistaken for one we owe access against.
 *
 * Returning `true` is therefore accurate rather than optimistic: it reports that
 * OUR side is settled. The customer's standing order lives in the studio's own
 * provider, where only the studio (or the customer) can stop it — and where they
 * would go to refund it, too.
 */
const cancelOnConnectedAccount: CancelOnConnectedAccount = async () => true;

const cancelInstallmentSub = (db: D1Database, tenantId: string, stripeSubId: string, rowId: string) =>
  cancelInstallmentSubBase(db, tenantId, stripeSubId, rowId, cancelOnConnectedAccount);
import { resolveAndApplyPromo, bumpPromoRedemption, consumePromoRedemption, releasePromoRedemption } from "./promo-apply.js";
import { updateSubscriptionRunway } from "./subscription-runway.js";
import { MAX_PACKAGE_PRICE_CENTS } from "./commerce-routes.js";

/**
 * A failed Stripe call must not become an information-free 500.
 *
 * `stripeCall` throws `new Error(stripe's own message)` — and Stripe's messages
 * are the good kind: "Only Stripe Connect platforms can create accounts", "No
 * such price", "Please activate Connect". Eight of the call sites in this file
 * had no try/catch, so all of that became a bare 500 and the owner was left with
 * a browser console line and nothing to act on.
 *
 * One handler on the router rather than a try/catch per route: the correct
 * response is the same everywhere, and per-route wrapping is exactly the thing
 * that gets forgotten on the next route added.
 *
 * 502, not 500 — the upstream refused, we did not break. These messages are
 * operator-facing and safe to show a studio owner; they are the same text Stripe
 * shows in its own dashboard, and they name what to go and fix.
 */
export const stripeRoutes = new Hono<AppEnv>()
  .onError((err, c) => {
    console.error(`[stripe] ${c.req.method} ${new URL(c.req.url).pathname}:`, err);
    return c.json({ error: err instanceof Error ? err.message : "stripe request failed" }, 502);
  })
  // ── Platform rail ──────────────────────────────────────────────────────────
  .post("/billing/checkout-plan", async (c) => {
    const who = requireTenant(c)!;
    const cfg = await stripeConfig(c.env);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ planId: z.string(), returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const plan = (await listPlans(c.env.DB)).find((p) => p.id === body.data.planId);
    if (!plan?.stripe_price_id) return c.json({ error: "plan not synced to stripe" }, 409);
    const customer = await ensureCustomer(c.env.DB, cfg.secretKey, who.tenantId, c.get("user")?.email);
    // Free trial (SPEC §5): Solo/Light carry `trialDays`. Hosted Checkout collects
    // the card BEFORE the subscription exists and charges nothing now, so the
    // subscription is born `trialing` with a payment method already attached —
    // `hasPaymentMethod` is satisfied and entitlements are live from minute one.
    // (The inline `/billing/plan-intent` path below is the opposite shape: the
    // subscription is born card-less. See the guard in the webhook.)
    const trialDays = trialPeriodDays(resolveEntitlements(plan.entitlements_json));
    const session = await stripeCall<{ url: string; id: string }>(cfg.secretKey, "checkout/sessions", {
      mode: "subscription",
      customer,
      "line_items[0][price]": plan.stripe_price_id,
      "line_items[0][quantity]": 1,
      success_url: `${body.data.returnUrl}?checkout=success`,
      cancel_url: `${body.data.returnUrl}?checkout=cancel`,
      "metadata[kova_tenant]": who.tenantId,
      "metadata[kova_plan]": plan.id,
      // Mirror the metadata onto the SUBSCRIPTION as well. Session metadata is
      // not copied down (AGENTS.md §5), so without this the `trialing`
      // subscription's own events can't name the plan and have to fall back to
      // customer lookup.
      "subscription_data[metadata][kova_tenant]": who.tenantId,
      "subscription_data[metadata][kova_plan]": plan.id,
      ...(trialDays ? { "subscription_data[trial_period_days]": trialDays } : {}),
    });
    return c.json({ url: session.url, trialDays: trialDays ?? 0 });
  })

  .post("/billing/checkout-pack", async (c) => {
    const who = requireTenant(c)!;
    const cfg = await stripeConfig(c.env);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ packId: z.string(), returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const pack = (await listPacks(c.env.DB)).find((p) => p.id === body.data.packId);
    if (!pack) return c.json({ error: "unknown pack" }, 404);
    const priceRow = await c.env.DB.prepare("SELECT stripe_price_id FROM credit_packs WHERE id = ?").bind(pack.id).first<{ stripe_price_id: string | null }>();
    if (!priceRow?.stripe_price_id) return c.json({ error: "pack not synced" }, 409);
    const customer = await ensureCustomer(c.env.DB, cfg.secretKey, who.tenantId, c.get("user")?.email);
    const session = await stripeCall<{ url: string }>(cfg.secretKey, "checkout/sessions", {
      mode: "payment",
      customer,
      "line_items[0][price]": priceRow.stripe_price_id,
      "line_items[0][quantity]": 1,
      success_url: `${body.data.returnUrl}?pack=success`,
      cancel_url: `${body.data.returnUrl}?pack=cancel`,
      "metadata[kova_tenant]": who.tenantId,
      "metadata[kova_pack]": pack.id,
      "metadata[kova_credits]": pack.credits,
    });
    return c.json({ url: session.url });
  })

  // ── Inline (Payment Element) — platform rail ───────────────────────────────
  // Preferred over the hosted redirect: the app confirms these client secrets
  // with Stripe.js inline. The hosted checkout-plan/checkout-pack routes above
  // remain as a fallback.
  .post("/billing/pack-intent", async (c) => {
    const who = requireTenant(c)!;
    const cfg = await stripeConfig(c.env);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ packId: z.string(), promoCode: z.string().optional() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const pack = (await listPacks(c.env.DB)).find((p) => p.id === body.data.packId);
    if (!pack) return c.json({ error: "unknown pack" }, 404);
    let amount = Math.round(pack.price_usd * 100);
    let promoId: string | null = null;
    let discountCents = 0;
    if (body.data.promoCode) {
      const p = await resolveAndApplyPromo(c.env.DB, { scope: "platform", tenantId: who.tenantId, code: body.data.promoCode, amountCents: amount, nowIso: nowIso(), targetId: pack.id });
      if (!p.ok) return c.json({ error: `promo_${p.reason}` }, 400);
      amount = p.finalCents;
      promoId = p.id;
      discountCents = p.discountCents;
    }
    // A fully-discounted pack grants immediately — no Stripe charge to run. The
    // free grant has NO payment gate, so consume the redemption slot ATOMICALLY
    // and grant only if we won it (else a racing/repeat request could mint free
    // credits against a one-use code).
    if (amount <= 0) {
      if (!promoId || !(await consumePromoRedemption(c.env.DB, promoId))) return c.json({ error: "promo_exhausted" }, 400);
      // The slot is consumed BEFORE the grant. If the grant throws, RELEASE it so
      // a one-use code isn't burned with nothing granted (else every retry gets
      // promo_exhausted and the tenant never receives the credits).
      try {
        const dobj = c.env.BILLING.get(c.env.BILLING.idFromName(who.tenantId));
        await dobj.bind(who.tenantId);
        await dobj.topUp(pack.credits, "pack.promo", pack.id);
      } catch (err) {
        await releasePromoRedemption(c.env.DB, promoId);
        throw err;
      }
      return c.json({ granted: true, credits: pack.credits, discountCents });
    }
    // Below Stripe's minimum charge after a discount → clean 400, not a 500.
    if (promoId && amount < 50) return c.json({ error: "promo_min_amount" }, 400);
    const customer = await ensureCustomer(c.env.DB, cfg.secretKey, who.tenantId, c.get("user")?.email);
    // A PaymentIntent whose success webhook tops up the durable `purchased`
    // bucket. Credits ride on the PI metadata; the hosted-checkout path keeps
    // them on the session, so payment_intent.succeeded can't double-grant.
    try {
      const pi = await stripeCall<{ client_secret: string; id: string }>(cfg.secretKey, "payment_intents", {
        amount,
        currency: "usd",
        customer,
        "automatic_payment_methods[enabled]": "true",
        "metadata[kova_tenant]": who.tenantId,
        "metadata[kova_pack]": pack.id,
        "metadata[kova_credits]": pack.credits,
        ...(promoId ? { "metadata[kova_promo]": promoId } : {}),
      });
      return c.json({ clientSecret: pi.client_secret, publishableKey: cfg.publishableKey, amountCents: amount, discountCents, credits: pack.credits });
    } catch {
      return c.json({ error: "checkout_failed" }, 402);
    }
  })

  .post("/billing/plan-intent", async (c) => {
    const who = requireTenant(c)!;
    const cfg = await stripeConfig(c.env);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ planId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const plan = (await listPlans(c.env.DB)).find((p) => p.id === body.data.planId);
    if (!plan?.stripe_price_id) return c.json({ error: "plan not synced to stripe" }, 409);
    const customer = await ensureCustomer(c.env.DB, cfg.secretKey, who.tenantId, c.get("user")?.email);
    const trialDays = trialPeriodDays(resolveEntitlements(plan.entitlements_json));
    // default_incomplete: the subscription is created unpaid; confirming the
    // first invoice's PaymentIntent inline activates it. The webhook
    // (customer.subscription.updated → active) stamps the plan + grants credits.
    //
    // A TRIAL changes the shape of what has to be confirmed, and this is the
    // trap: the first invoice is $0 and auto-paid, so there is NO
    // `latest_invoice.payment_intent` at all — the object to confirm is the
    // subscription's `pending_setup_intent` (card saved, nothing charged).
    // `trial_settings.end_behavior.missing_payment_method = cancel` makes Stripe
    // cancel rather than dangle an unpayable subscription if the setup is never
    // completed, which lands as `customer.subscription.deleted` → free.
    //
    // ⚠️ THE SUBSCRIPTION EXISTS, IN STATUS `trialing`, THE MOMENT THIS CALL
    // RETURNS — before the client has confirmed anything. Verified against live
    // Stripe test mode: this exact request answers `status: "trialing"`,
    // `default_payment_method: null`, `pending_setup_intent.status:
    // "requires_payment_method"`, and it immediately fires
    // `customer.subscription.created` (trialing, no card) plus an `invoice.paid`
    // for a $0 `subscription_create` invoice. NOTHING here may be read as "the
    // tenant is on this plan" — the webhook gates both of those events on
    // `hasPaymentMethod`, and only records `pending_plan_id` until a card lands.
    const sub = await stripeCall<{
      id: string;
      status?: string;
      latest_invoice?: { payment_intent?: { client_secret?: string } };
      pending_setup_intent?: { client_secret?: string } | null;
    }>(cfg.secretKey, "subscriptions", {
      customer,
      "items[0][price]": plan.stripe_price_id,
      payment_behavior: "default_incomplete",
      "payment_settings[save_default_payment_method]": "on_subscription",
      "expand[0]": "latest_invoice.payment_intent",
      "expand[1]": "pending_setup_intent",
      "metadata[kova_tenant]": who.tenantId,
      "metadata[kova_plan]": plan.id,
      ...(trialDays
        ? {
            trial_period_days: trialDays,
            "trial_settings[end_behavior][missing_payment_method]": "cancel",
          }
        : {}),
    });
    // `mode` tells the client which Stripe.js call to make: "setup" ⇒
    // `confirmSetup` (trial, no charge), "payment" ⇒ `confirmPayment`.
    const setupSecret = trialDays ? sub.pending_setup_intent?.client_secret : undefined;
    const clientSecret = setupSecret ?? sub.latest_invoice?.payment_intent?.client_secret;
    if (!clientSecret) return c.json({ error: "could not start subscription" }, 502);
    return c.json({
      clientSecret,
      mode: setupSecret ? "setup" : "payment",
      trialDays: trialDays ?? 0,
      subscriptionId: sub.id,
      publishableKey: cfg.publishableKey,
    });
  })

  // Platform webhook (public lane; signature-verified).
  /**
   * The platform webhook, on `@4dl/billing-rail`.
   *
   * The rail's job here is the case this handler used to get silently wrong. The
   * switch inside `handlePlatformEvent` is guarded on `meta.kova_*`, so an event
   * belonging to ANOTHER app on the same Stripe account matched no branch, fell
   * out, and was answered `200 {received: true}` — with its id already claimed,
   * so Stripe never retried. Money captured, nothing granted, no signal.
   *
   * That is harmless while Kova is the only app on the account, which is exactly
   * why it would have survived until it wasn't. Now an unattributable event
   * parks in `rail_parked_events` with its payload, and the operator console
   * counts it.
   *
   * `claims` is what stops this being a regression: several event types here
   * carry no Kova metadata at all and are resolved by Stripe customer id
   * (`invoice.paid` → `tenantByCustomer`). Metadata-only routing would have
   * parked events that work today.
   */
  .post("/stripe/webhook", async (c) => {
    const cfg = await stripeConfig(c.env);
    const payload = await c.req.text();
    const sig = c.req.header("stripe-signature") ?? "";
    const outcome = await dispatchEvent(
      { DB: c.env.DB },
      {
        apps: [{
          slug: KOVA_APP,
          metadataPrefix: STRIPE_BRANDING.metadataPrefix,
          claims: async (e) => !!(await tenantByCustomer(c.env.DB, (e.data.object as { customer?: unknown }).customer)),
          handle: (e) => handlePlatformEvent(c.env, e, cfg.secretKey),
        }],
        firstSeen: (id) => firstSeen(c.env.DB, id),
        // A failure inside the handler (DO/D1 transient) must NOT leave the id
        // marked seen, or Stripe's retry is dropped as a duplicate. The rail
        // releases the claim and rethrows, so the worker 500s and Stripe
        // redelivers.
        release: (id) => unmarkSeen(c.env.DB, id),
      },
      payload,
      sig,
      cfg.webhookSecret,
    );
    return c.json(outcome.body, outcome.status as 200);
  });



/**
 * KOVA'S BINDING OF THE SHARED STRIPE CONSOLE ROUTES.
 *
 * The three handlers that were here — status, config, sync — are
 * `@4dl/billing`'s `stripeAdminRoutes` now. They were the reference copy, and
 * moving them is what let the other two apps stop being worse: Tessa's had no
 * mode-flip catalog swap (so pressing its console's live switch pointed the
 * catalog at test-lane price ids and every checkout failed with "No such
 * price"), and Scena had no `status`/`config` at all, so `@4dl/admin`'s panel
 * could not be mounted there.
 *
 * What Kova still supplies is the part a shared package cannot know: which
 * tables hold the catalog. `syncCatalog` here is the branding-bound wrapper in
 * `stripe.ts`; `clearCatalogIds` is the rebuild repair over Kova's own `plans`
 * and `credit_packs`.
 */
export const stripeAdminRoutes = stripeAdminRoutes_({
  isPlatformAdmin: (c) => isPlatformAdmin(c as unknown as Parameters<typeof isPlatformAdmin>[0]),
  seed: seedBilling,
  syncCatalog,
  /*
    CREDIT PACKS TOO, and their absence was a real hole for as long as this was
    plans-only. `syncCatalog` skips any row that already holds a
    `stripe_price_id`, and nothing else ever nulled a PACK's — so a pack whose
    price had gone stale was permanently broken: sync reported "0 packs"
    because it believed them done, and every top-up checkout failed with "No
    such price", with no way out of the console.

    Orphaned Stripe prices are left alone on purpose: tenants already
    subscribed on one keep that price until they re-subscribe.
  */
  clearCatalogIds: async (db) => {
    const plans = await db
      .prepare("UPDATE plans SET stripe_product_id = NULL, stripe_price_id = NULL WHERE active = 1 AND (stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL)")
      .run();
    const packs = await db
      .prepare("UPDATE credit_packs SET stripe_product_id = NULL, stripe_price_id = NULL WHERE active = 1 AND (stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL)")
      .run();
    return { cleared: plans.meta?.changes ?? 0, clearedPacks: packs.meta?.changes ?? 0 };
  },
}) as unknown as Hono<AppEnv>;

// ── Webhook handlers ───────────────────────────────────────────────────────
async function handlePlatformEvent(
  env: AppEnv["Bindings"],
  event: { type: string; id?: string; data: { object: Record<string, unknown> } },
  secretKey: string,
): Promise<void> {
  const db = env.DB;
  const billing = env.BILLING;
  const obj = event.data.object;
  const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
  switch (event.type) {
    case "checkout.session.completed": {
      if (meta.kova_pack && meta.kova_credits && meta.kova_tenant) {
        const dobj = billing.get(billing.idFromName(meta.kova_tenant));
        await dobj.bind(meta.kova_tenant);
        await dobj.topUp(Number(meta.kova_credits), "pack.purchase", meta.kova_pack);
      }
      if (meta.kova_plan && meta.kova_tenant) {
        await activatePlan(db, billing, meta.kova_tenant, meta.kova_plan);
        if (typeof obj.subscription === "string") {
          // Adopt this sub as the tenant's CURRENT one; a plan upgrade creates a
          // second Stripe sub, so cancel the old one here (checkout completed ⇒
          // the new sub is paid + active) to stop the tenant being double-billed.
          await supersedePlatformSub(db, secretKey, meta.kova_tenant, obj.subscription);
        }
      }
      break;
    }
    case "payment_intent.succeeded": {
      // Inline credit-pack purchase (Payment Element). Credits ride on the PI
      // metadata; the hosted checkout path keeps them on the session, so this
      // and checkout.session.completed never both fire for the same purchase.
      if (meta.kova_pack && meta.kova_credits && meta.kova_tenant) {
        const dobj = billing.get(billing.idFromName(meta.kova_tenant));
        await dobj.bind(meta.kova_tenant);
        await dobj.topUp(Number(meta.kova_credits), "pack.purchase", meta.kova_pack);
        if (meta.kova_promo) await bumpPromoRedemption(db, meta.kova_promo);
      }
      break;
    }
    case "invoice.paid": {
      const tenantId = meta.kova_tenant ?? (await tenantByCustomer(db, obj.customer));
      const planId = await planForTenant(db, tenantId);
      // ⚠️ A TRIAL'S FIRST INVOICE IS $0 AND AUTO-PAID THE INSTANT THE
      // SUBSCRIPTION IS CREATED — before any card exists. Verified against live
      // Stripe test mode: creating a `trial_period_days` subscription fires
      // `invoice.paid` with `billing_reason: "subscription_create"` and
      // `amount_paid: 0`, and it arrives BEFORE `customer.subscription.created`.
      // So this branch was a second, independent door to the same bug the
      // trialing guard below closes: activate a full paid plan and grant its
      // monthly credits for a subscription Stripe cannot charge. A zero-amount
      // trial-start invoice is not a payment, so it activates nothing.
      //
      // Nothing is lost by skipping it: a genuinely $0 subscription (a 100%
      // discount, no trial) is born `status: "active"` and activates through
      // `customer.subscription.created|updated` instead, and the real trial
      // conversion at period end is a `subscription_cycle` invoice with
      // `amount_paid > 0` (also verified — see the lifecycle table in AGENTS/DEPLOY).
      const amountPaid = typeof obj.amount_paid === "number" ? obj.amount_paid : 0;
      const zeroTrialStart = amountPaid <= 0 && obj.billing_reason === "subscription_create";
      if (tenantId && planId && !zeroTrialStart) await activatePlan(db, billing, tenantId, planId);
      // Capture the Stripe subscription id + the renewal date this invoice covers.
      if (tenantId) {
        // Same version-shape defence as the Connect rail: on a Basil-shaped
        // payload the sub id lives under `parent.subscription_details`, so the
        // legacy read left the tenant's stored sub id (and every guard keyed off
        // it) permanently unstamped.
        const subId = invoiceSubscriptionId(obj);
        const cpe = typeof obj.period_end === "number" ? new Date(obj.period_end * 1000).toISOString() : null;
        // Only (re)stamp the sub id if it's the tenant's current one (or none is
        // stored yet) — an invoice for a stale/old sub must not regress the
        // stored id back to a subscription we've already superseded.
        const cur = await db.prepare("SELECT stripe_sub_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ stripe_sub_id: string | null }>();
        const stampSub = !cur?.stripe_sub_id || cur.stripe_sub_id === subId ? subId : null;
        await db.prepare("UPDATE subscriptions SET stripe_sub_id = COALESCE(?, stripe_sub_id), current_period_end = COALESCE(?, current_period_end) WHERE tenant_id = ?").bind(stampSub, cpe, tenantId).run();
      }
      break;
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      await reverseChargedCredits(env, event, secretKey);
      break;
    }
    case "invoice.payment_failed": {
      const tenantId = meta.kova_tenant ?? (await tenantByCustomer(db, obj.customer));
      // Seed the grace window; never clobber a later suspend/cancel.
      if (tenantId) {
        await db.prepare("UPDATE subscriptions SET status = 'past_due', past_due_at = COALESCE(past_due_at, ?) WHERE tenant_id = ? AND status NOT IN ('suspended','blocked','canceled')").bind(nowIso(), tenantId).run();
        await notifyOwners(env, tenantId, {
          type: "billing_past_due",
          message: "We couldn't charge your card. Update your payment method to keep your studio running — you have a short grace period before features pause.",
          dedupeKey: typeof obj.id === "string" ? `pf_${obj.id}` : undefined,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      // Inline (default_incomplete) subscriptions carry the plan on their
      // metadata. A subscription we cannot yet charge records the tenant's CHOICE
      // (`pending_plan_id`) and nothing else; only a subscription Stripe can
      // actually bill stamps `plan_id` and grants credits.
      const status = obj.status as string;
      const subId = typeof obj.id === "string" ? obj.id : null;
      if (meta.kova_plan && meta.kova_tenant) {
        await getSubscription(db, meta.kova_tenant);
        const cur = await db.prepare("SELECT stripe_sub_id FROM subscriptions WHERE tenant_id = ?").bind(meta.kova_tenant).first<{ stripe_sub_id: string | null }>();
        // `trialing` alone is NOT a paid-for plan — see hasPaymentMethod. This is
        // the reported bug: `/billing/plan-intent` creates the subscription with
        // `trial_period_days` and hands the client a SetupIntent to confirm, so
        // Stripe fires `customer.subscription.created` in status `trialing`
        // BEFORE any card is attached. Activating on that gave a studio whose
        // card confirmation FAILED a fully-entitled paid plan plus its whole
        // monthly credit grant, repeatable per studio. `active` is unchanged.
        const activating = !!subId && (status === "active" || (status === "trialing" && hasPaymentMethod(obj)));
        // Once this sub is live, it's authoritative: if the tenant had a
        // DIFFERENT sub (a mid-month upgrade creates a second Stripe sub), cancel
        // the old one and adopt this id as current, so no double-billing and so
        // syncStripeSubscription's stale-sub guard below lets this event through.
        if (activating) await supersedePlatformSub(db, secretKey, meta.kova_tenant, subId!);
        // Only touch the plan when this event's sub is the tenant's CURRENT one
        // (just adopted, already current, or none stored yet). A stale sub's
        // events — e.g. the OLD sub's incomplete/canceled updates that still
        // carry its own plan metadata — must not restamp/downgrade the live plan.
        const isCurrent = activating || !cur?.stripe_sub_id || cur.stripe_sub_id === subId;
        if (isCurrent) {
          if (activating) {
            // activatePlan stamps plan_id and clears pending_plan_id.
            await activatePlan(db, billing, meta.kova_tenant, meta.kova_plan);
          } else {
            // Not payable yet (incomplete, or a card-less trial). Record what they
            // picked so `GET /billing` can tell the owner their setup never
            // completed — never `plan_id`, which IS the entitlement.
            await db.prepare("UPDATE subscriptions SET pending_plan_id = ?, updated_at = ? WHERE tenant_id = ?").bind(meta.kova_plan, nowIso(), meta.kova_tenant).run();
          }
        }
      }
      await syncStripeSubscription(db, obj);
      break;
    }
    case "customer.subscription.deleted": {
      const tenantId = await tenantByCustomer(db, obj.customer);
      if (!tenantId) break;
      // Only downgrade to free if the DELETED sub is the tenant's CURRENT one. A
      // stale sub being cleaned up (e.g. the old sub replaced on an upgrade) must
      // not drop a tenant whose new sub is live and paying.
      const subId = typeof obj.id === "string" ? obj.id : null;
      const cur = await db.prepare("SELECT stripe_sub_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ stripe_sub_id: string | null }>();
      if (!cur?.stripe_sub_id || cur.stripe_sub_id !== subId) break;
      await db.prepare("UPDATE subscriptions SET status = 'canceled', plan_id = 'free', stripe_sub_id = NULL WHERE tenant_id = ?").bind(tenantId).run();
      break;
    }
    case "customer.subscription.trial_will_end": {
      // Stripe fires this 3 days out. Without it a trial simply becomes a charge
      // with no warning, which is the single most reliable way to manufacture a
      // chargeback and a bad review — the owner experiences it as a surprise
      // debit. Notify, don't touch state: the trial→active and trial→canceled
      // transitions are driven by subscription.updated / invoice events.
      const tenantId = await tenantByCustomer(db, obj.customer);
      if (!tenantId) break;
      const trialEnd = typeof obj.trial_end === "number" ? obj.trial_end * 1000 : null;
      const daysLeft = trialEnd ? Math.max(1, Math.ceil((trialEnd - Date.now()) / 86_400_000)) : 3;
      const planId = await planForTenant(db, tenantId);
      const plan = planId ? await getPlan(db, planId) : null;
      // Verified: Stripe fires trial_will_end for a CARD-LESS trial too. Telling
      // that owner "your card will be charged" is false in both directions — there
      // is no card, and what actually happens at trial end is
      // `missing_payment_method: cancel` (verified: the subscription goes straight
      // to `canceled`, no invoice). Say the true thing per case.
      const carded = hasPaymentMethod(obj);
      await notifyOwners(env, tenantId, {
        type: "billing_trial_ending",
        message: carded
          ? `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — your card will be charged then.`
          : `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} and we have no card on file, so it will simply be cancelled. Add a payment method to keep your studio.`,
        // One notice per subscription, so a redelivered event can't nag twice.
        dedupeKey: `trial_end_${typeof obj.id === "string" ? obj.id : tenantId}`,
        vars: { planName: plan?.name ?? "your", daysLeft },
      });
      break;
    }
  }
}





async function activatePlan(db: D1Database, billing: AppEnv["Bindings"]["BILLING"], tenantId: string, planId: string): Promise<void> {
  await getSubscription(db, tenantId);
  // A successful payment fully recovers the tenant: clear every dunning marker
  // so the status clamp lifts and service (theirs + their clients') resumes.
  // `pending_plan_id` clears only when the plan it NAMED is the one going live —
  // this is the single place a "you picked a plan and never finished paying"
  // marker is retired, and an unrelated activation (a renewal invoice landing
  // while plan_id is still `free`) must not silently retire someone else's.
  await db
    .prepare(
      "UPDATE subscriptions SET plan_id = ?, status = 'active', pending_plan_id = CASE WHEN pending_plan_id = ? THEN NULL ELSE pending_plan_id END, past_due_at = NULL, suspend_at = NULL, delete_at = NULL, updated_at = ? WHERE tenant_id = ?",
    )
    .bind(planId, planId, nowIso(), tenantId)
    .run();
  const plan = await db.prepare("SELECT entitlements_json FROM plans WHERE id = ?").bind(planId).first<{ entitlements_json: string | null }>();
  const grant = resolveEntitlements(plan?.entitlements_json).aiCredits.monthlyGrant;
  if (grant > 0) {
    const dobj = billing.get(billing.idFromName(tenantId));
    await dobj.bind(tenantId);
    await dobj.grantMonthly(grant, periodKey());
  }
}





/**
 * A refunded or disputed pack, on Kova's registry.
 *
 * The reversal MATHS is `@4dl/billing`'s now — proportional to the refunded
 * share, clamped to the pack, and incremental against the cumulative total
 * Stripe re-sends on every partial refund. Two of the three apps here shipped
 * without any of it, which is why it moved.
 *
 * What stays Kova's is the sentence the owner reads, and the fact that we send
 * one WHATEVER the maths did: a plan-level refund carries no credit count, so
 * there is nothing to reverse and still something a human must reconcile.
 */
async function reverseChargedCredits(
  env: AppEnv["Bindings"],
  event: { type: string; id?: string; data: { object: Record<string, unknown> } },
  secretKey: string,
): Promise<void> {
  const outcome = await reverseCredits(
    {
      db: env.DB,
      secretKey,
      metadataPrefix: STRIPE_BRANDING.metadataPrefix,
      authority: async (tenantId) => {
        const dobj = env.BILLING.get(env.BILLING.idFromName(tenantId));
        await dobj.bind(tenantId);
        return dobj;
      },
    },
    event,
  );
  if (!outcome) return;
  await notifyOwners(env, outcome.tenantId, {
    type: outcome.disputed ? "payment_disputed" : "payment_refunded",
    message: outcome.disputed
      ? "A payment on your Kova account was disputed. Any credits it granted may be reversed — review your balance."
      : "A payment on your Kova account was refunded. Credits from a refunded pack were reversed from your balance.",
    dedupeKey: typeof event.data.object.id === "string" ? `${event.type}_${event.data.object.id}` : event.id,
  });
}

async function planForTenant(db: D1Database, tenantId: string | null): Promise<string | null> {
  if (!tenantId) return null;
  const row = await db.prepare("SELECT plan_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ plan_id: string }>();
  return row?.plan_id ?? null;
}




/** Shared with commerce: create/extend a client subscription from a package.
 *  `checkoutId`/`subId` are the Stripe Checkout Session / Subscription ids;
 *  event-level idempotency (firstSeen) already prevents a redelivery twice.
 *  `installmentsTotal` (>1) marks a limited-term installment plan: period one
 *  unlocks the first 1/N of the term and pins the count on the row.
 *
 *  ── Also the grant path for TENANT-OWNED providers ────────────────────────
 *  `payments-routes.ts` calls this with the purchase intent's id in place of the
 *  Stripe ids. For a recurring package the intent REFERENCE is passed as `subId`,
 *  which makes the reference the row's recurring key — so a later `renewed`
 *  event carrying the same reference resolves through `renewClientSubscription`
 *  with no second implementation of the runway maths. The column is still named
 *  `stripe_sub_id`; renaming a live D1 column is a migration we deliberately do
 *  not take for cosmetics. Read it as "the recurring key, whoever issued it". */
export async function grantClientPackage(db: D1Database, tenantId: string, clientId: string, packageId: string, checkoutId: string | null = null, subId: string | null = null, installmentsTotal: number | null = null, source: GrantSource = "stripe"): Promise<void> {
  // Scope the package to the granting tenant: an unscoped lookup would let a
  // (verified) event carrying another tenant's package id grant that package's
  // budgets/add-ons/flags into this tenant's row. Paired with the webhook's
  // account→tenant check, the package must belong to the account's tenant.
  const pkg = await db.prepare("SELECT budgets_json, addons_json, flags_json, once_per_customer FROM packages WHERE id = ? AND tenant_id = ?").bind(packageId, tenantId).first<{ budgets_json: string | null; addons_json: string | null; flags_json: string | null; once_per_customer: number | null }>();
  if (!pkg) return;
  // `once_per_customer` is a real selling rule (an intro offer), so it has to hold
  // at the LAST gate too, not just at checkout: a stale tab, a second browser, or
  // a charge created straight from the tenant's Stripe dashboard all land here.
  // Rows carrying THIS sub id are excluded so a redelivered checkout for the same
  // subscription still tops its own runway up (that's not a repeat purchase).
  if (pkg.once_per_customer && (await hasPriorPurchase(db, clientId, packageId, subId))) {
    console.error("grantClientPackage: blocked repeat purchase of a once-per-customer package", { clientId, packageId });
    return;
  }
  const now = nowIso();
  const n = installmentsTotal && installmentsTotal > 1 ? installmentsTotal : 1;
  const specs = scaleSpecs(parseJson<{ feature: Budget["feature"]; days: number }[]>(pkg.budgets_json, []), n);
  const addOns = parseJson<{ addOnTypeId: string; quantity: number }[]>(pkg.addons_json, []);

  // Recurring purchase (a Stripe subscription): each subscription gets its OWN
  // row keyed by stripe_sub_id, carrying its own package_id. Folding it into a
  // pre-existing active row would drop the new sub id (COALESCE) and renew off
  // the wrong package — the client would be charged monthly with no top-up.
  if (subId) {
    const rowId = newId("csub");
    const bySub = await db.prepare("SELECT id FROM subject_subscriptions WHERE stripe_sub_id = ? LIMIT 1").bind(subId).first<{ id: string }>();
    if (bySub) {
      // A redelivered checkout for this same sub (before firstSeen dedup) — top
      // up its own runway rather than create a duplicate. CAS so a concurrent
      // renewal on the same row can't lose this write (last-writer-wins).
      const ok = await updateSubscriptionRunway(db, bySub.id, (existing, balancesPrev) => ({
        budgets: [...existing, ...buildBudgetsForPurchase(existing, specs, now)],
        addOns: mergeAddOnBalances(balancesPrev, addOns),
        extra: { sql: "payment_status = 'paid', stripe_checkout_id = COALESCE(?, stripe_checkout_id), updated_at = ?", binds: [checkoutId, now] },
      }));
      // A raced-out CAS on a PAID grant is money captured with zero days granted.
      // Throw so the webhook releases the event-id claim and 500s → Stripe
      // redelivers and the grant lands (same contract as /redeem's compensation).
      if (!ok) throw new Error(`grantClientPackage: runway CAS failed for ${bySub.id}`);
      await recordPackageGrant(db, { id: newId("pgr"), tenantId, subjectId: clientId, packageId, subscriptionId: bySub.id, source, days: specs, at: now });
    } else {
      await db.prepare(
        "INSERT INTO subject_subscriptions (id, tenant_id, subject_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, stripe_checkout_id, stripe_sub_id, installments_total, installments_paid, started_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'stripe', ?, ?, ?, ?, ?, ?)",
      )
        .bind(rowId, tenantId, clientId, packageId, n > 1 ? "installments" : "paid", j(buildBudgetsForPurchase([], specs, now)), j(mergeAddOnBalances([], addOns)), pkg.flags_json, checkoutId, subId, n > 1 ? n : null, n > 1 ? 1 : null, now, now)
        .run();
      await recordPackageGrant(db, { id: newId("pgr"), tenantId, subjectId: clientId, packageId, subscriptionId: rowId, source, days: specs, at: now });
    }
    return;
  }

  // One-time purchase: fold into the client's active NON-recurring runway (never
  // a recurring row — that row belongs to its own Stripe subscription).
  const freshId = newId("csub");
  const current = await db.prepare("SELECT id FROM subject_subscriptions WHERE subject_id = ? AND status = 'active' AND stripe_sub_id IS NULL ORDER BY started_at DESC LIMIT 1").bind(clientId).first<{ id: string }>();
  if (current) {
    // CAS so a concurrent staff grant / redeem on the same row can't clobber
    // these paid-for days.
    const ok = await updateSubscriptionRunway(db, current.id, (existing, balancesPrev) => ({
      budgets: [...existing, ...buildBudgetsForPurchase(existing, specs, now)],
      addOns: mergeAddOnBalances(balancesPrev, addOns),
      extra: { sql: "payment_status = 'paid', stripe_checkout_id = COALESCE(?, stripe_checkout_id), updated_at = ?", binds: [checkoutId, now] },
    }));
    if (!ok) throw new Error(`grantClientPackage: runway CAS failed for ${current.id}`);
    // The LEDGER, not the row's `package_id`. A folded-in purchase leaves that
    // column pointing at whatever opened the row, which is exactly why
    // once-per-customer could never see a repeat sale.
    await recordPackageGrant(db, { id: newId("pgr"), tenantId, subjectId: clientId, packageId, subscriptionId: current.id, source, days: specs, at: now });
  } else {
    await db.prepare(
      "INSERT INTO subject_subscriptions (id, tenant_id, subject_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, stripe_checkout_id, stripe_sub_id, started_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'paid', ?, ?, ?, 'stripe', ?, ?, ?, ?)",
    )
      .bind(freshId, tenantId, clientId, packageId, j(buildBudgetsForPurchase([], specs, now)), j(mergeAddOnBalances([], addOns)), pkg.flags_json, checkoutId, null, now, now)
      .run();
    await recordPackageGrant(db, { id: newId("pgr"), tenantId, subjectId: clientId, packageId, subscriptionId: freshId, source, days: specs, at: now });
  }
}

/** Renew an auto-renewing client subscription on each paid cycle: top the same
 *  row's budget up by another period. Resolved by the Stripe subscription id so
 *  it always hits the right row. Budgets stay the source of truth. */
export async function renewClientSubscription(db: D1Database, stripeSubId: string, expectedTenantId: string): Promise<void> {
  // Resolve the row scoped to the account's tenant (the webhook verified the
  // event's account → tenant), so a foreign connected account can't top up a
  // row it doesn't own.
  const base = await db.prepare("SELECT id, tenant_id, package_id, installments_total FROM subject_subscriptions WHERE stripe_sub_id = ? AND tenant_id = ? ORDER BY started_at DESC LIMIT 1").bind(stripeSubId, expectedTenantId).first<{ id: string; tenant_id: string; package_id: string | null; installments_total: number | null }>();
  if (!base?.package_id) return;
  const pkg = await db.prepare("SELECT budgets_json, addons_json FROM packages WHERE id = ? AND tenant_id = ?").bind(base.package_id, base.tenant_id).first<{ budgets_json: string | null; addons_json: string | null }>();
  if (!pkg) return;
  const now = nowIso();
  const n = base.installments_total && base.installments_total > 1 ? base.installments_total : 1;
  const specs = scaleSpecs(parseJson<{ feature: Budget["feature"]; days: number }[]>(pkg.budgets_json, []), n);
  const addOns = parseJson<{ addOnTypeId: string; quantity: number }[]>(pkg.addons_json, []);

  // CAS retry over the runway columns (re-reading installments_paid each attempt
  // so the counter is recomputed from the last committed value, never double-
  // counted). Guards against a concurrent writer losing a paid renewal period.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const row = await db.prepare("SELECT budgets_json, addons_json, installments_paid FROM subject_subscriptions WHERE id = ?").bind(base.id).first<{ budgets_json: string | null; addons_json: string | null; installments_paid: number | null }>();
    if (!row) return;
    const prevB = row.budgets_json ?? null;
    const prevA = row.addons_json ?? null;
    const existing = parseJson<Budget[]>(prevB, []);
    const nextBudgets = [...existing, ...buildBudgetsForPurchase(existing, specs, now)];
    const nextAddons = mergeAddOnBalances(parseJson<AddOnBalance[]>(prevA, []), addOns);
    if (n > 1) {
      // An installment cycle: unlock this payment's share, advance the counter,
      // and on the final payment stop future billing (per-cycle unlock — no
      // clawback; access rides out whatever's been paid if a cycle later fails).
      const alreadyDone = (row.installments_paid ?? 1) >= n;
      if (alreadyDone) {
        // A stray cycle after completion (the cancel below previously failed and
        // Stripe billed again). Do NOT grant another share — just retry the cancel
        // and clear the link once it sticks. This is what makes a webhook retry or
        // an extra charge idempotent (no (N+1)th grant).
        await cancelInstallmentSub(db, base.tenant_id, stripeSubId, base.id);
        return;
      }
      const paid = (row.installments_paid ?? 1) + 1;
      const done = paid >= n;
      // `stripe_sub_id` is left intact here and only cleared once the Stripe
      // cancel is confirmed (below), so a post-completion stray invoice still
      // resolves this row and hits the `alreadyDone` guard.
      const w = await db.prepare("UPDATE subject_subscriptions SET budgets_json = ?, addons_json = ?, status = 'active', payment_status = ?, installments_paid = ?, updated_at = ? WHERE id = ? AND budgets_json IS ? AND addons_json IS ?")
        .bind(j(nextBudgets), j(nextAddons), done ? "completed" : "installments", paid, now, base.id, prevB, prevA)
        .run();
      if ((w.meta?.changes ?? 0) > 0) {
        if (done) await cancelInstallmentSub(db, base.tenant_id, stripeSubId, base.id);
        return;
      }
      continue; // raced — re-read and retry
    }
    const w = await db.prepare("UPDATE subject_subscriptions SET budgets_json = ?, addons_json = ?, status = 'active', payment_status = 'paid', updated_at = ? WHERE id = ? AND budgets_json IS ? AND addons_json IS ?").bind(j(nextBudgets), j(nextAddons), now, base.id, prevB, prevA).run();
    if ((w.meta?.changes ?? 0) > 0) return;
  }
  // Every attempt raced out on a PAID renewal cycle: the client was charged and
  // got no days. Throw so the webhook releases the event-id claim and 500s —
  // Stripe redelivers and the top-up lands, instead of vanishing silently.
  throw new Error(`renewClientSubscription: runway CAS failed for ${base.id}`);
}
