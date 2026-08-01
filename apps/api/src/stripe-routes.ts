/**
 * Stripe routes (SPEC §7) — platform rail (plan checkout, pack checkout,
 * webhook) + Connect rail (account onboarding, client-package checkout with
 * no application fee, connect webhook). Admin config endpoints under
 * /api/admin/stripe/*.
 */

import { Hono } from "hono";
import { z } from "zod";
import { dispatchEvent } from "@4dl/billing-rail";
import { resolveEntitlements, trialPeriodDays, buildBudgetsForPurchase, mergeAddOnBalances, type Budget, type AddOnBalance } from "@kova/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import { getSubscription, listPacks, listPlans, seedBilling, getConfig, getPlan } from "./billing-store.js";
import { gateFeature } from "./client-flags.js";
import { requireClientAccess } from "./clients.js";
import { notify, notifyOwners } from "./notify.js";
import {
  credentialLane,
  ensureCustomer,
  laneForMode,
  resolveStripeConfig,
  stripeCall,
  stripeConfig,
  stripeEnabled,
  stripeLaneConfigKey,
  stripeLaneMismatch,
  stripeStatus,
  swapCatalogLane,
  syncCatalog,
  verifyWebhook,
  setConfig,
  STRIPE_CREDENTIALS,
  STRIPE_BRANDING,
  KOVA_APP,
  type StripeCredential,
  type StripeLane,
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
  creditsAlreadyReversed,
  firstSeen,
  hasPaymentMethod,
  invoiceSubscriptionId,
  resolveReversal,
  stripeId,
  supersedePlatformSub,
  syncStripeSubscription,
  tenantByCustomer,
  unmarkSeen,
} from "@4dl/billing";
/** The Connect rail's own half — see `@4dl/commerce/connect.ts`. */
import { cancelInstallmentSub as cancelInstallmentSubBase, hasPriorPurchase, purchaseBlocked as purchaseBlockedBase, scaleSpecs, syncConnectAccount, type CancelOnConnectedAccount } from "@4dl/commerce";

/**
 * Kova's stored value for "restricted to one subject".
 *
 * `@4dl/commerce` takes it as a parameter because it is DATA — these strings are
 * in the `packages.visibility` column of a live database, and renaming one is a
 * migration rather than an edit. The package's own default matches nothing, so
 * an app that forgets to pass it gets grant-only (fails closed) instead of
 * accidentally opening a package to everyone.
 */
const RESTRICTED_VISIBILITY = "client_specific";
const purchaseBlocked = (pkg: { visibility: string; restricted_subject_id: string | null }, clientId: string) =>
  purchaseBlockedBase(pkg, clientId, RESTRICTED_VISIBILITY);

/**
 * The connected-account canceller `@4dl/commerce` takes rather than imports.
 *
 * It sits BESIDE `@4dl/billing`, never on it — an app can sell access to its own
 * customers without billing its tenants for the privilege — so the Stripe client
 * is passed in from here, where both rails already meet.
 */
const cancelInstallmentSub = (db: D1Database, tenantId: string, stripeSubId: string, rowId: string) =>
  cancelInstallmentSubBase(db, tenantId, stripeSubId, rowId, (acct, sub) => cancelOnConnectedFor(db)(acct, sub));

/** Bound to the DB the caller already has — no ambient env. */
const cancelOnConnectedFor = (db: D1Database): CancelOnConnectedAccount => async (accountId, stripeSubId) => {
  const cfg = await stripeConfig(db);
  if (!stripeEnabled(cfg)) return true;
  return stripeCall(cfg.secretKey, `subscriptions/${stripeSubId}`, undefined, { connectedAccount: accountId, method: "DELETE" })
    .then(() => true)
    .catch(() => false);
};
import { resolveAndApplyPromo, bumpPromoRedemption, consumePromoRedemption, releasePromoRedemption } from "./promo-apply.js";
import { updateSubscriptionRunway } from "./subscription-runway.js";

/**
 * A failed Stripe call must not become an information-free 500.
 *
 * `stripeCall` throws `new Error(stripe's own message)` — and Stripe's messages
 * are the good kind: "Only Stripe Connect platforms can create accounts", "No
 * such price", "Please activate Connect". Eight of the call sites in this file
 * had no try/catch, so all of that became a bare 500 and the owner was left with
 * a browser console line and nothing to act on. `POST /connect/onboard` on a
 * Stripe account without Connect enabled is the case that surfaced it.
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
    const cfg = await stripeConfig(c.env.DB);
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
    const cfg = await stripeConfig(c.env.DB);
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
    const cfg = await stripeConfig(c.env.DB);
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
    const cfg = await stripeConfig(c.env.DB);
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
    const cfg = await stripeConfig(c.env.DB);
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
  })

  // ── Connect rail (tenant ↔ client, no application fee) ─────────────────────
  .post("/connect/onboard", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    { const g = await gateFeature(c, "commerce"); if (g) return g; }
    const cfg = await stripeConfig(c.env.DB);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    const existing = await c.env.DB.prepare("SELECT stripe_account_id FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null }>();
    let accountId = existing?.stripe_account_id ?? null;
    if (!accountId) {
      const account = await stripeCall<{ id: string }>(cfg.secretKey, "accounts", {
        type: "standard",
        "metadata[kova_tenant]": who.tenantId,
      });
      accountId = account.id;
      await c.env.DB.prepare(
        "INSERT INTO tenant_settings (tenant_id, stripe_account_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_account_id = ?, updated_at = ?",
      )
        .bind(who.tenantId, accountId, nowIso(), accountId, nowIso())
        .run();
    }
    const link = await stripeCall<{ url: string }>(cfg.secretKey, "account_links", {
      account: accountId,
      refresh_url: body.data.returnUrl,
      return_url: body.data.returnUrl,
      type: "account_onboarding",
    });
    return c.json({ url: link.url });
  })

  // Client buys a tenant package on the tenant's connected account.
  .post("/connect/checkout", async (c) => {
    const who = requireTenant(c)!;
    const cfg = await stripeConfig(c.env.DB);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ clientId: z.string(), packageId: z.string(), returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, body.data.clientId);
    if ("response" in access) return access.response;
    const settings = await c.env.DB.prepare("SELECT stripe_account_id, charges_enabled FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null; charges_enabled: number | null }>();
    if (!settings?.stripe_account_id) return c.json({ error: "tenant has no connected Stripe account" }, 409);
    // The account must actually be able to accept charges (onboarding done).
    if (!settings.charges_enabled) return c.json({ error: "connected account can't accept payments yet — finish Stripe onboarding" }, 409);
    const pkg = await c.env.DB.prepare("SELECT * FROM packages WHERE id = ? AND tenant_id = ? AND active = 1").bind(body.data.packageId, who.tenantId).first<{ id: string; name: string; one_time_price_cents: number | null; monthly_price_cents: number | null; installment_months: number | null; currency: string; visibility: string; restricted_subject_id: string | null; once_per_customer: number | null }>();
    if (!pkg || purchaseBlocked(pkg, access.client.id)) return c.json({ error: "package not found" }, 404);
    // The Packages editor offers a `once_per_customer` toggle, so it must actually
    // bind on the PAID paths too — until now only the free staff grant checked it,
    // and a client could re-buy a "first month intro" package unlimited times.
    if (pkg.once_per_customer && (await hasPriorPurchase(c.env.DB, access.client.id, pkg.id))) {
      return c.json({ error: "package is once per customer" }, 409);
    }
    // Three pricing modes. A monthly price = an open-ended subscription. An
    // installment plan (installment_months N on a one-time package) = a
    // LIMITED-term subscription: monthly = one_time/N, billed N times then
    // self-cancels; each cycle unlocks 1/N of the term. Otherwise it's a
    // one-time day-pack. The budget model stays the source of truth.
    const monthly = pkg.monthly_price_cents ?? 0;
    const recurring = monthly > 0;
    const installN = !recurring && (pkg.installment_months ?? 0) > 1 && (pkg.one_time_price_cents ?? 0) > 0 ? (pkg.installment_months as number) : 0;
    const isSub = recurring || installN > 0;
    const amount = recurring ? monthly : installN ? Math.ceil((pkg.one_time_price_cents ?? 0) / installN) : (pkg.one_time_price_cents ?? 0);
    if (amount <= 0) return c.json({ error: "use /subscriptions/grant for $0 packages" }, 400);

    // Optional platform cut — a basis-points application fee set by the platform
    // admin (default 0 = zero markup, tenant keeps 100%). Direct charge on the
    // connected account, so the fee routes to the platform on this payment.
    const feeBps = Number((await getConfig(c.env.DB))["stripe.platform_fee_bps"] ?? "0");
    const meta: Record<string, string | number> = {
      "metadata[kova_tenant]": who.tenantId,
      "metadata[kova_client]": access.client.id,
      "metadata[kova_package]": pkg.id,
      ...(installN ? { "metadata[kova_installments]": installN } : {}),
    };
    const priceData = {
      "line_items[0][price_data][currency]": pkg.currency || "usd",
      "line_items[0][price_data][product_data][name]": installN ? `${pkg.name} (${installN}-month plan)` : pkg.name,
      "line_items[0][price_data][unit_amount]": amount,
      "line_items[0][quantity]": 1,
    };
    const params: Record<string, string | number | undefined> = isSub
      ? {
          mode: "subscription",
          ...priceData,
          "line_items[0][price_data][recurring][interval]": "month",
          ...(feeBps > 0 ? { "subscription_data[application_fee_percent]": feeBps / 100 } : {}),
          // Carry the mapping on the subscription too, so renewals resolve it.
          "subscription_data[metadata][kova_tenant]": who.tenantId,
          "subscription_data[metadata][kova_client]": access.client.id,
          "subscription_data[metadata][kova_package]": pkg.id,
          ...(installN ? { "subscription_data[metadata][kova_installments]": installN } : {}),
          success_url: `${body.data.returnUrl}?purchase=success`,
          cancel_url: `${body.data.returnUrl}?purchase=cancel`,
          ...meta,
        }
      : {
          mode: "payment",
          ...priceData,
          ...(feeBps > 0 ? { "payment_intent_data[application_fee_amount]": Math.round((amount * feeBps) / 10000) } : {}),
          success_url: `${body.data.returnUrl}?purchase=success`,
          cancel_url: `${body.data.returnUrl}?purchase=cancel`,
          ...meta,
        };
    const session = await stripeCall<{ url: string }>(cfg.secretKey, "checkout/sessions", params, { connectedAccount: settings.stripe_account_id });
    return c.json({ url: session.url });
  })

  // Inline (Payment Element) one-time purchase on the tenant's connected account.
  // Direct charge → the tenant stays merchant of record; the app confirms this
  // client secret with Stripe.js scoped to `stripeAccount`. Recurring packages
  // keep the hosted checkout above (Checkout auto-provisions the connected-account
  // customer + price a bare Subscription call would need).
  .post("/connect/pay-intent", async (c) => {
    const who = requireTenant(c)!;
    const cfg = await stripeConfig(c.env.DB);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ clientId: z.string(), packageId: z.string(), promoCode: z.string().optional() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, body.data.clientId);
    if ("response" in access) return access.response;
    const settings = await c.env.DB.prepare("SELECT stripe_account_id, charges_enabled FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null; charges_enabled: number | null }>();
    if (!settings?.stripe_account_id) return c.json({ error: "tenant has no connected Stripe account" }, 409);
    if (!settings.charges_enabled) return c.json({ error: "connected account can't accept payments yet — finish Stripe onboarding" }, 409);
    const pkg = await c.env.DB.prepare("SELECT id, name, one_time_price_cents, monthly_price_cents, installment_months, currency, visibility, restricted_subject_id, once_per_customer FROM packages WHERE id = ? AND tenant_id = ? AND active = 1").bind(body.data.packageId, who.tenantId).first<{ id: string; name: string; one_time_price_cents: number | null; monthly_price_cents: number | null; installment_months: number | null; currency: string; visibility: string; restricted_subject_id: string | null; once_per_customer: number | null }>();
    if (!pkg || purchaseBlocked(pkg, access.client.id)) return c.json({ error: "package not found" }, 404);
    // Same once-per-customer rule as the hosted path (and re-checked in
    // grantClientPackage, the last gate before days are written).
    if (pkg.once_per_customer && (await hasPriorPurchase(c.env.DB, access.client.id, pkg.id))) {
      return c.json({ error: "package is once per customer" }, 409);
    }
    // Subscriptions and installment plans go through hosted checkout (Stripe
    // provisions the connected-account customer + recurring price); inline is
    // one-time only.
    if ((pkg.monthly_price_cents ?? 0) > 0 || (pkg.installment_months ?? 0) > 1) return c.json({ error: "use /connect/checkout for subscriptions" }, 400);
    let amount = pkg.one_time_price_cents ?? 0;
    if (amount <= 0) return c.json({ error: "use /subscriptions/grant for $0 packages" }, 400);
    let promoId: string | null = null;
    let discountCents = 0;
    if (body.data.promoCode) {
      const p = await resolveAndApplyPromo(c.env.DB, { scope: "tenant", tenantId: who.tenantId, code: body.data.promoCode, amountCents: amount, nowIso: nowIso(), targetId: pkg.id, clientId: access.client.id });
      if (!p.ok) return c.json({ error: `promo_${p.reason}` }, 400);
      amount = p.finalCents;
      promoId = p.id;
      discountCents = p.discountCents;
    }
    // Fully discounted → grant directly (no charge). No payment gate, so consume
    // the redemption slot atomically and grant only if we won it.
    if (amount <= 0) {
      if (!promoId || !(await consumePromoRedemption(c.env.DB, promoId))) return c.json({ error: "promo_exhausted" }, 400);
      // Release the consumed slot if the grant fails, so a burned one-use code
      // can be retried instead of stranding the client (mirrors /redeem).
      try {
        await grantClientPackage(c.env.DB, who.tenantId, access.client.id, pkg.id, null, null);
      } catch (err) {
        await releasePromoRedemption(c.env.DB, promoId);
        throw err;
      }
      return c.json({ granted: true, discountCents });
    }
    if (promoId && amount < 50) return c.json({ error: "promo_min_amount" }, 400);
    const feeBps = Number((await getConfig(c.env.DB))["stripe.platform_fee_bps"] ?? "0");
    // Clamp the fee strictly below the charge. NOT because Stripe enforces it — it
    // does not: verified in test mode, `application_fee_amount` equal to AND greater
    // than the charge amount were both accepted and both succeeded. This clamp is
    // the only thing standing between a mis-set `platform_fee_bps` (say someone
    // types 10000 meaning "100 bps") and Kova taking the tenant's entire payment.
    // Do not remove it believing Stripe will catch it.
    const fee = feeBps > 0 ? Math.min(Math.round((amount * feeBps) / 10000), Math.max(0, amount - 1)) : 0;
    try {
      const pi = await stripeCall<{ client_secret: string; id: string }>(
        cfg.secretKey,
        "payment_intents",
        {
          amount,
          currency: pkg.currency || "usd",
          "automatic_payment_methods[enabled]": "true",
          ...(fee > 0 ? { application_fee_amount: fee } : {}),
          "metadata[kova_tenant]": who.tenantId,
          "metadata[kova_client]": access.client.id,
          "metadata[kova_package]": pkg.id,
          ...(promoId ? { "metadata[kova_promo]": promoId } : {}),
        },
        { connectedAccount: settings.stripe_account_id },
      );
      // Return the amount we ACTUALLY created the PaymentIntent for (mirroring
      // /billing/pack-intent). The app labels its Pay button from this: labelling
      // it from the package's list price showed "Pay $250.00" on a sheet that
      // charges $200 once a promo applied.
      return c.json({ clientSecret: pi.client_secret, publishableKey: cfg.publishableKey, stripeAccount: settings.stripe_account_id, amountCents: amount, discountCents });
    } catch {
      return c.json({ error: "checkout_failed" }, 402);
    }
  })

  // Cancel a client's auto-renewing package (stops future billing; the current
  // period's budget still runs out naturally). Client, their coach, or owner.
  .post("/connect/cancel-subscription", async (c) => {
    const who = requireTenant(c)!;
    const body = z.object({ clientId: z.string(), subscriptionId: z.string().optional() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, body.data.clientId);
    if ("response" in access) return access.response;
    // Cancel a SPECIFIC row when named (a client can hold several auto-renewing
    // packages, so "cancel the newest" would silently cancel the wrong one),
    // else the most recent auto-renewing one.
    const sub = body.data.subscriptionId
      ? await c.env.DB.prepare("SELECT id, stripe_sub_id FROM subject_subscriptions WHERE id = ? AND subject_id = ? AND status = 'active' AND stripe_sub_id IS NOT NULL").bind(body.data.subscriptionId, access.client.id).first<{ id: string; stripe_sub_id: string | null }>()
      : await c.env.DB.prepare("SELECT id, stripe_sub_id FROM subject_subscriptions WHERE subject_id = ? AND status = 'active' AND stripe_sub_id IS NOT NULL ORDER BY started_at DESC LIMIT 1").bind(access.client.id).first<{ id: string; stripe_sub_id: string | null }>();
    if (!sub?.stripe_sub_id) return c.json({ error: "no auto-renewing subscription" }, 404);
    const settings = await c.env.DB.prepare("SELECT stripe_account_id FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null }>();
    const cfg = await stripeConfig(c.env.DB);
    // Cancel at Stripe FIRST and only clear the renewal marker once it actually
    // succeeded. Clearing it on a FAILED cancel (outage, revoked account,
    // network) would strand a still-live subscription: the client keeps being
    // charged, renewClientSubscription can no longer resolve the row by sub id
    // (money taken, no top-up), and the cancel can never be retried (no row
    // carries the sub id). Mirrors cancelInstallmentSub's cancel-before-unlink.
    if (settings?.stripe_account_id && stripeEnabled(cfg)) {
      const canceled = await stripeCall(cfg.secretKey, `subscriptions/${sub.stripe_sub_id}`, undefined, { connectedAccount: settings.stripe_account_id, method: "DELETE" })
        .then(() => true)
        .catch(() => false);
      if (!canceled) return c.json({ error: "could not cancel subscription — please try again" }, 502);
    }
    // Clear the renewal marker; access continues until the current budget lapses.
    await c.env.DB.prepare("UPDATE subject_subscriptions SET stripe_sub_id = NULL, payment_status = 'canceled', updated_at = ? WHERE id = ?").bind(nowIso(), sub.id).run();
    return c.json({ ok: true });
  })

  // Live Connect account status (owner) — fetch from Stripe when configured,
  // sync the stored flags, and report whether the tenant can sell yet.
  .get("/connect/status", async (c) => {
    const who = requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT stripe_account_id, charges_enabled, payouts_enabled, details_submitted FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null; charges_enabled: number | null; payouts_enabled: number | null; details_submitted: number | null }>();
    if (!row?.stripe_account_id) return c.json({ connected: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false });
    const cfg = await stripeConfig(c.env.DB);
    if (stripeEnabled(cfg)) {
      try {
        const a = await stripeCall<{ charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean }>(cfg.secretKey, `accounts/${row.stripe_account_id}`);
        await syncConnectAccount(c.env.DB, { id: row.stripe_account_id, ...a });
        return c.json({ connected: true, chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled, detailsSubmitted: !!a.details_submitted });
      } catch { /* fall back to stored flags below */ }
    }
    return c.json({ connected: true, chargesEnabled: !!row.charges_enabled, payoutsEnabled: !!row.payouts_enabled, detailsSubmitted: !!row.details_submitted });
  })

  // Connect webhook — grants the client package on successful payment.
  .post("/connect/webhook", async (c) => {
    const cfg = await stripeConfig(c.env.DB);
    const payload = await c.req.text();
    const sig = c.req.header("stripe-signature") ?? "";
    const secret = cfg.connectWebhookSecret || cfg.webhookSecret;
    if (!secret || !(await verifyWebhook(payload, sig, secret))) return c.json({ error: "bad signature" }, 400);
    // Connect events carry the connected account id at the top level.
    const event = JSON.parse(payload) as { id?: string; account?: string; type: string; data: { object: Record<string, unknown> } };
    if (!(await firstSeen(c.env.DB, event.id))) return c.json({ received: true, duplicate: true });
    // The connected account this event fired for → its owning tenant. The Connect
    // webhook endpoint receives events for ALL connected accounts, and a
    // connected `standard` account is fully controlled by its tenant (own keys +
    // dashboard). So EVERY grant branch must confirm the metadata-named tenant
    // IS this account's tenant — otherwise a user who onboarded their own account
    // could pay a $0.50 intent carrying a VICTIM tenant's ids and have us grant
    // that tenant's package for free. Mismatch (or an unmapped account) ⇒ drop.
    const accountTenantId = event.account
      ? (await c.env.DB.prepare("SELECT tenant_id FROM tenant_settings WHERE stripe_account_id = ?").bind(event.account).first<{ tenant_id: string }>())?.tenant_id ?? null
      : null;
    try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as { id?: string; mode?: string; subscription?: string; metadata?: Record<string, string> };
      const m = s.metadata ?? {};
      if (m.kova_client && m.kova_package && m.kova_tenant && m.kova_tenant === accountTenantId) {
        // First period for one-time, recurring, and installments; for the last
        // two we pin the Stripe subscription id so later invoices renew this row.
        // `kova_installments` (N) marks a limited-term plan → per-cycle unlock.
        const installN = m.kova_installments ? Number(m.kova_installments) : null;
        await grantClientPackage(c.env.DB, accountTenantId, m.kova_client, m.kova_package, s.id ?? null, s.mode === "subscription" ? s.subscription ?? null : null, installN);
      }
    } else if (event.type === "payment_intent.succeeded") {
      // Inline one-time purchase (Payment Element on the connected account).
      // Metadata rides on the PI; the hosted path keeps it on the session, so
      // this and checkout.session.completed never both grant the same purchase.
      const pi = event.data.object as { id?: string; metadata?: Record<string, string> };
      const m = pi.metadata ?? {};
      if (m.kova_client && m.kova_package && m.kova_tenant && m.kova_tenant === accountTenantId) {
        await grantClientPackage(c.env.DB, accountTenantId, m.kova_client, m.kova_package, pi.id ?? null, null);
        if (m.kova_promo) await bumpPromoRedemption(c.env.DB, m.kova_promo);
      }
    } else if (event.type === "invoice.paid") {
      // Renewal cycles top up the budget; the first invoice (subscription_create)
      // is skipped — checkout.session.completed already granted period one. Scope
      // the renewal to the account's tenant so a foreign account can't top up a
      // row it doesn't own.
      const inv = event.data.object;
      // Resolve the sub id across API-version shapes (Basil moved it off the
      // invoice root) — see invoiceSubscriptionId. A cycle invoice we can't map to
      // a subscription means a charged client with no top-up, so make it LOUD:
      // there is no other signal (we answer Stripe 200 either way).
      const invSubId = invoiceSubscriptionId(inv);
      if (inv.billing_reason === "subscription_cycle" && !invSubId) {
        console.error("connect invoice.paid: subscription_cycle with no resolvable subscription id", event.id);
      }
      if (invSubId && inv.billing_reason === "subscription_cycle" && accountTenantId) {
        await renewClientSubscription(c.env.DB, invSubId, accountTenantId);
      }
    } else if (event.type === "invoice.payment_failed") {
      // Auto-renew charge failed — mark past_due + nudge the client to fix their
      // card. Access still runs until the current budget lapses (grace by design).
      const failedSubId = invoiceSubscriptionId(event.data.object);
      if (failedSubId) {
        const row = await c.env.DB.prepare("SELECT id, tenant_id, subject_id FROM subject_subscriptions WHERE stripe_sub_id = ? LIMIT 1").bind(failedSubId).first<{ id: string; tenant_id: string; subject_id: string }>();
        if (row) {
          await c.env.DB.prepare("UPDATE subject_subscriptions SET payment_status = 'past_due', updated_at = ? WHERE id = ?").bind(nowIso(), row.id).run();
          const cl = await c.env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(row.subject_id).first<{ user_id: string | null }>();
          if (cl?.user_id) await notify(c.env, { tenantId: row.tenant_id, userId: cl.user_id, type: "sub_payment_failed", message: "Update your card to keep your plan from pausing.", dedupeKey: `pf_${row.id}` });
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      // Auto-renew ended (client canceled or Stripe gave up). No more top-ups;
      // the current budget simply runs out. Clear the renewal marker.
      const subObj = event.data.object as { id?: string };
      if (subObj.id) await c.env.DB.prepare("UPDATE subject_subscriptions SET stripe_sub_id = NULL, payment_status = 'canceled', updated_at = ? WHERE stripe_sub_id = ?").bind(nowIso(), subObj.id).run();
    } else if (event.type === "account.updated") {
      // Onboarding / capability changes for a connected account.
      const a = event.data.object as { id?: string; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean };
      if (a.id) await syncConnectAccount(c.env.DB, a);
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      // Money-safe: don't guess which budget days to claw back (partial refunds,
      // elapsed time) — surface it to the tenant to adjust the client's access.
      const tenantId = accountTenantId ?? undefined;
      if (tenantId) {
        const disputed = event.type === "charge.dispute.created";
        await notifyOwners(c.env, tenantId, {
          // Title (per type) + link (/clients) come from the type's record.
          type: disputed ? "payment_disputed" : "payment_refunded",
          message: disputed
            ? "A client opened a dispute on a package payment. Review it in Stripe and adjust their access if needed."
            : "A client package payment was refunded. Review whether their access should be adjusted.",
          dedupeKey: `${event.type}_${(event.data.object as { id?: string }).id ?? event.id}`,
        });
      }
    }
    } catch (err) {
      // Same contract as the platform webhook: a failed handler must release the
      // event-id claim so Stripe's retry re-processes instead of being dropped.
      await unmarkSeen(c.env.DB, event.id);
      throw err;
    }
    return c.json({ received: true });
  });





/** Per-credential paste validation. The prefix rules are Stripe's own, so a
 *  wrong-slot paste (publishable key into the secret field, platform signing
 *  secret into a key field) is refused at the door rather than discovered as a
 *  dead payment path. */
const CREDENTIAL_SHAPE: Record<StripeCredential, { prefix: RegExp; label: string; expect: string }> = {
  secretKey: { prefix: /^sk_/, label: "Secret key", expect: "sk_…" },
  publishableKey: { prefix: /^pk_/, label: "Publishable key", expect: "pk_…" },
  webhookSecret: { prefix: /^whsec_/, label: "Platform webhook secret", expect: "whsec_…" },
  connectWebhookSecret: { prefix: /^whsec_/, label: "Connect webhook secret", expect: "whsec_…" },
};

const CredentialBody = z.object({
  secretKey: z.string().max(400).optional(),
  publishableKey: z.string().max(400).optional(),
  webhookSecret: z.string().max(400).optional(),
  connectWebhookSecret: z.string().max(400).optional(),
});

/** Admin Stripe config + catalog sync (platform-admin lane). */
export const stripeAdminRoutes = new Hono<AppEnv>()
  /**
   * Write Stripe credentials into a LANE (`stripe.<lane>.*`), so test and live
   * can both be stored and flipping between them is a `mode` change with no
   * re-paste. Shapes accepted:
   *   • `{ lanes: { test: {...}, live: {...} } }` — both lanes at once.
   *   • flat `{ secretKey, … }` — targets `lane`, else the lane of the `mode`
   *     being set, else the currently active lane. (This is the pre-lane request
   *     shape; it now lands in a lane, which takes precedence over the legacy
   *     unscoped key of the same name.)
   * A blank/absent field always preserves what is stored — keys are write-only.
   *
   * Refusals (400, nothing written): a value whose prefix contradicts the lane
   * it is being stored in, and a `mode` whose resulting active secret/publishable
   * key really belongs to the other lane. That is the guard that makes
   * `stripe.mode` honest: live keys can no longer be filed under a test label.
   * We refuse rather than "correct" the mode, because silently relabelling what
   * an operator typed is how a live key ends up active by accident.
   */
  .post("/admin/stripe/config", async (c) => {
    const body = CredentialBody.extend({
      mode: z.enum(["disabled", "test", "live"]).optional(),
      /** Lane the flat credential fields target. */
      lane: z.enum(["test", "live"]).optional(),
      lanes: z.object({ test: CredentialBody.optional(), live: CredentialBody.optional() }).optional(),
      /** Platform application fee on client→tenant purchases, in basis points
       *  (0–10000 = 0–100%). Default 0 = tenant keeps everything. */
      platformFeeBps: z.number().int().min(0).max(10000).optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const d = body.data;
    const raw = await getConfig(c.env.DB);
    const current = resolveStripeConfig(raw);
    const flatLane: StripeLane = d.lane ?? laneForMode(d.mode ?? current.mode) ?? current.lane;

    // Collect every (lane, credential) write first, validate the whole set, and
    // only then commit — a half-applied save is exactly the half-swap this
    // feature exists to prevent.
    const pending = new Map<string, string>();
    const perLane: { lane: StripeLane; fields: z.infer<typeof CredentialBody> }[] = [
      { lane: flatLane, fields: { secretKey: d.secretKey, publishableKey: d.publishableKey, webhookSecret: d.webhookSecret, connectWebhookSecret: d.connectWebhookSecret } },
      ...(d.lanes?.test ? [{ lane: "test" as StripeLane, fields: d.lanes.test }] : []),
      ...(d.lanes?.live ? [{ lane: "live" as StripeLane, fields: d.lanes.live }] : []),
    ];
    for (const { lane, fields } of perLane) {
      for (const cred of STRIPE_CREDENTIALS) {
        const value = (fields[cred] ?? "").trim();
        if (!value) continue; // blank preserves the stored value
        const shape = CREDENTIAL_SHAPE[cred];
        if (!shape.prefix.test(value)) return c.json({ error: `${shape.label} must start with ${shape.expect}`, code: "invalid_prefix" }, 400);
        const belongs = credentialLane(value);
        if (belongs && belongs !== lane) {
          return c.json({ error: `That ${shape.label.toLowerCase()} is a ${belongs}-mode key — it can't be stored in the ${lane} lane.`, code: "lane_mismatch" }, 400);
        }
        pending.set(stripeLaneConfigKey(lane, cred), value);
      }
    }

    // Would the resulting active lane run keys that belong to the other lane?
    // (Includes the pre-lane case: legacy live keys + a `test` mode.)
    const merged: Record<string, string> = { ...raw };
    for (const [k, v] of pending) merged[k] = v;
    if (d.mode) merged["stripe.mode"] = d.mode;
    const next = resolveStripeConfig(merged);
    if (stripeLaneMismatch(next)) {
      const real = credentialLane(next.secretKey) ?? credentialLane(next.publishableKey);
      return c.json(
        {
          error: `The keys that would be active in ${next.mode} mode are ${real}-mode keys. Paste ${next.mode}-mode keys into the ${next.mode} lane first (or select ${real} mode).`,
          code: "mode_key_mismatch",
        },
        400,
      );
    }

    for (const [k, v] of pending) await setConfig(c.env.DB, k, v);
    // Stripe product/price ids are per-lane objects: park the old lane's ids and
    // restore the new lane's BEFORE the mode moves, so no window exists where the
    // active lane is pointing at the other lane's price ids.
    let catalogSwapped = false;
    if (d.mode && d.mode !== current.mode) {
      const from = laneForMode(current.mode);
      const to = laneForMode(d.mode);
      if (from && to && from !== to) {
        await swapCatalogLane(c.env.DB, from, to);
        catalogSwapped = true;
      }
      await setConfig(c.env.DB, "stripe.mode", d.mode);
    }
    if (d.platformFeeBps !== undefined) await setConfig(c.env.DB, "stripe.platform_fee_bps", String(d.platformFeeBps));
    return c.json({ ok: true, catalogSwapped, status: stripeStatus(await getConfig(c.env.DB)) });
  })

  // Push plans + packs to Stripe as products + prices.
  //
  // `syncCatalog` creates what is missing and RECONCILES the name of what is
  // already there. The second half matters because a rename does not move the
  // price, so it never invalidates the stored ids — without it a plan renamed in
  // the catalog keeps its old name on every checkout page and invoice.
  //
  // The PRICE is the other half: `syncCatalog` skips any row that already carries
  // a `stripe_price_id`, so a repriced plan would otherwise never reach Stripe
  // and checkout would keep charging the old amount. The catalog migration and the plan editor both null
  // the id pair when a price moves; `{ resyncPrices: true }` is the manual escape
  // hatch for a row whose Stripe price drifted some other way (a price edited in
  // the Stripe dashboard, a half-finished sync). It drops the stored ids for the
  // ACTIVE plans and lets the sync below recreate them at the current price.
  // Orphaned Stripe prices are left alone on purpose — tenants already
  // subscribed on one keep that price until they re-subscribe.
  .post("/admin/stripe/sync", async (c) => {
    const cfg = await stripeConfig(c.env.DB);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ resyncPrices: z.boolean().default(false) }).safeParse(await c.req.json().catch(() => ({})));
    await seedBilling(c.env.DB);
    let cleared = 0;
    let clearedPacks = 0;
    if (body.success && body.data.resyncPrices) {
      const r = await c.env.DB.prepare(
        "UPDATE plans SET stripe_product_id = NULL, stripe_price_id = NULL WHERE active = 1 AND (stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL)",
      ).run();
      cleared = r.meta?.changes ?? 0;
      // CREDIT PACKS TOO. This cleared plans only, which left packs with no
      // repair path at all: `syncCatalog` skips any row that already holds a
      // `stripe_price_id`, and nothing else ever nulled a pack's. So a pack whose
      // price had gone stale — dangling in Stripe, created under a different
      // account, or half-written by an interrupted sync — was permanently broken.
      // Sync reported "0 packs" because it believed them done, and every top-up
      // checkout failed with "No such price", with no way out of the admin UI.
      const rp = await c.env.DB.prepare(
        "UPDATE credit_packs SET stripe_product_id = NULL, stripe_price_id = NULL WHERE active = 1 AND (stripe_product_id IS NOT NULL OR stripe_price_id IS NOT NULL)",
      ).run();
      clearedPacks = rp.meta?.changes ?? 0;
    }
    const result = await syncCatalog(c.env.DB, cfg.secretKey);
    return c.json({ ok: true, cleared, clearedPacks, ...result });
  })

  /** "What is Kova actually on right now?" — presence + provenance + the lane
   *  the active key really belongs to. No secret material is ever returned:
   *  booleans, a last-4 hint, and prefix-derived lanes only. */
  .get("/admin/stripe/status", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json(stripeStatus(await getConfig(c.env.DB)));
  });

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
 * Money-safe reversal on the PLATFORM rail (the Connect rail only surfaces
 * refunds — budget days are not safely clawable). A refunded or disputed
 * credit-pack purchase must not leave the granted credits spendable, but it must
 * be reversed PROPORTIONALLY: `charge.refunded` fires for PARTIAL refunds too,
 * so a $5 goodwill refund on a $100 / 130,000-credit pack used to revoke all
 * 130,000 — and two partial refunds revoked that twice. We reverse
 * `round(credits × amount_refunded / amount)` minus whatever this charge has
 * already had reversed, and always notify so a human can reconcile what we
 * can't auto-reverse (e.g. a plan-level refund with no credit count).
 */
async function reverseChargedCredits(
  env: AppEnv["Bindings"],
  event: { type: string; id?: string; data: { object: Record<string, unknown> } },
  secretKey: string,
): Promise<void> {
  const db = env.DB;
  const obj = event.data.object;
  const disputed = event.type === "charge.dispute.created";
  const r = await resolveReversal(obj, event.type, secretKey);
  const tenantId = r.meta.kova_tenant ?? (await tenantByCustomer(db, r.customer));
  if (!tenantId) return;

  const packCredits = Number(r.meta.kova_credits ?? 0);
  if (Number.isFinite(packCredits) && packCredits > 0 && r.amountCents > 0) {
    // Proportional, clamped to the pack. A FULL refund (reversed === amount)
    // reverses exactly `packCredits`.
    const share = Math.min(1, Math.max(0, r.reversedCents / r.amountCents));
    const owed = Math.min(packCredits, Math.round(packCredits * share));
    const already = await creditsAlreadyReversed(db, tenantId, r.chargeId);
    const take = owed - already;
    if (take > 0) {
      const dobj = env.BILLING.get(env.BILLING.idFromName(tenantId));
      await dobj.bind(tenantId);
      // `ref` = the charge id (not the pack id) so the ledger doubles as the
      // per-charge reversal total read back above.
      await dobj.revokePurchased(take, disputed ? "pack.dispute" : "pack.refund", r.chargeId ?? undefined);
    }
  }
  await notifyOwners(env, tenantId, {
    type: disputed ? "payment_disputed" : "payment_refunded",
    message: disputed
      ? "A payment on your Kova account was disputed. Any credits it granted may be reversed — review your balance."
      : "A payment on your Kova account was refunded. Credits from a refunded pack were reversed from your balance.",
    dedupeKey: typeof obj.id === "string" ? `${event.type}_${obj.id}` : event.id,
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
 *  unlocks the first 1/N of the term and pins the count on the row. */
async function grantClientPackage(db: D1Database, tenantId: string, clientId: string, packageId: string, checkoutId: string | null = null, subId: string | null = null, installmentsTotal: number | null = null): Promise<void> {
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
    } else {
      await db.prepare(
        "INSERT INTO subject_subscriptions (id, tenant_id, subject_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, stripe_checkout_id, stripe_sub_id, installments_total, installments_paid, started_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'stripe', ?, ?, ?, ?, ?, ?)",
      )
        .bind(newId("csub"), tenantId, clientId, packageId, n > 1 ? "installments" : "paid", j(buildBudgetsForPurchase([], specs, now)), j(mergeAddOnBalances([], addOns)), pkg.flags_json, checkoutId, subId, n > 1 ? n : null, n > 1 ? 1 : null, now, now)
        .run();
    }
    return;
  }

  // One-time purchase: fold into the client's active NON-recurring runway (never
  // a recurring row — that row belongs to its own Stripe subscription).
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
  } else {
    await db.prepare(
      "INSERT INTO subject_subscriptions (id, tenant_id, subject_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, stripe_checkout_id, stripe_sub_id, started_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'paid', ?, ?, ?, 'stripe', ?, ?, ?, ?)",
    )
      .bind(newId("csub"), tenantId, clientId, packageId, j(buildBudgetsForPurchase([], specs, now)), j(mergeAddOnBalances([], addOns)), pkg.flags_json, checkoutId, null, now, now)
      .run();
  }
}

/** Renew an auto-renewing client subscription on each paid cycle: top the same
 *  row's budget up by another period. Resolved by the Stripe subscription id so
 *  it always hits the right row. Budgets stay the source of truth. */
async function renewClientSubscription(db: D1Database, stripeSubId: string, expectedTenantId: string): Promise<void> {
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
