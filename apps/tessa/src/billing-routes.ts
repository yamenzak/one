/**
 * BILLING — the one plan, the credit packs, and the Stripe webhook.
 *
 * `@4dl/billing` owns everything generic: payload readers, event idempotency,
 * subscription-status reconciliation (including the `LADDER_OWNED` clamp that
 * stops a payment webhook stalling the dunning ladder), and the customer
 * lookup. `@4dl/billing-rail` owns attribution across the shared Stripe account.
 * What is left here either reads Tessa's catalog or answers an HTTP route.
 *
 * ── Four Stripe traps this handler inherits ─────────────────────────────────
 *
 * Each cost a real debugging session on Kova and each is a fact about STRIPE,
 * not about a coaching product — so an app that reimplemented this from the docs
 * would hit all four again:
 *
 *  1. **A trial's first invoice is $0 and auto-paid the instant the subscription
 *     is created, before any card exists**, and it arrives BEFORE
 *     `customer.subscription.created`. Activating on it hands a full paid plan
 *     and its whole credit grant to someone Stripe cannot charge.
 *  2. **`trialing` alone is not a paid-for plan.** An inline subscription is born
 *     `trialing` before the card is confirmed; if confirmation fails, the tenant
 *     keeps the plan. `hasPaymentMethod` is the difference.
 *  3. **A plan change creates a SECOND Stripe subscription.** The old one must be
 *     superseded or the tenant is double-billed, and the stale one's own events
 *     must not restamp the live plan.
 *  4. **An unattributable event answered `200` is money captured and nothing
 *     granted** — Stripe never retries. The rail parks it instead.
 */

import { Hono } from "hono";
import { z } from "zod";
import { newId, nowIso, periodKey } from "@4dl/core";
import { dispatchEvent } from "@4dl/billing-rail";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import type { Env } from "./env.js";
import { entitlements } from "./entitlements.js";
import {
  ensureSubscription,
  getConfig,
  getSubscription,
  listPacks,
  listPlans,
  seedBilling,
  setConfig,
  tenantEntitlements,
} from "./billing-store.js";
import {
  credentialLane,
  ensureCustomer,
  firstSeen,
  hasPaymentMethod,
  invoiceSubscriptionId,
  laneForMode,
  stripeCall,
  stripeConfig,
  stripeEnabled,
  stripeLaneConfigKey,
  stripeStatus,
  supersedePlatformSub,
  syncCatalog,
  syncStripeSubscription,
  tenantByCustomer,
  unmarkSeen,
  STRIPE_CREDENTIALS,
  STRIPE_BRANDING,
  TESSA_APP,
  type StripeCredential,
} from "./stripe.js";

const meta = (obj: Record<string, unknown>): Record<string, string> =>
  (obj.metadata as Record<string, string> | undefined) ?? {};

/** The tenant's live credit balance, from the DO that owns it. */
async function balanceOf(env: Env, tenantId: string) {
  const stub = env.BILLING.get(env.BILLING.idFromName(tenantId));
  await stub.bind(tenantId);
  return stub.view();
}

export const billingRoutes = new Hono<AppEnv>()
  /**
   * 502, not 500: `stripeCall` throws Stripe's own message ("No such price",
   * "Invalid API Key provided"), and the upstream refusing is not this worker
   * breaking. Without a handler the operator sees a bare 500 with an empty body
   * and has nothing to act on.
   */
  .onError((err, c) => {
    console.error(`[billing] ${c.req.method} ${new URL(c.req.url).pathname}:`, err);
    return c.json({ error: err instanceof Error ? err.message : "stripe request failed" }, 502);
  })

  /** What the centre is on, what it could be on, and what it can buy. */
  .get("/billing", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    await seedBilling(c.env.DB);
    await ensureSubscription(c.env.DB, who.tenantId);
    const [sub, plans, packs, ent, balance, cfg] = await Promise.all([
      getSubscription(c.env.DB, who.tenantId),
      listPlans(c.env.DB),
      listPacks(c.env.DB),
      tenantEntitlements(c.env.DB, who.tenantId),
      balanceOf(c.env, who.tenantId).catch(() => null),
      stripeConfig(c.env),
    ]);
    return c.json({
      // Spread the whole subscription shape rather than hand-picking fields:
      // picking is how a new rung reaches the server and never the client.
      subscription: sub ? { ...sub } : null,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        priceUsdMonth: p.price_usd_month,
        entitlements: entitlements.resolve(p.entitlements_json),
        synced: !!p.stripe_price_id,
      })),
      packs: packs.map((p) => ({ id: p.id, name: p.name, credits: p.credits, priceUsd: p.price_usd })),
      entitlements: ent,
      balance,
      // The client needs this to know whether to render a buy button at all. A
      // deployment with no payment rail is a legitimate configuration.
      payable: stripeEnabled(cfg),
    });
  })

  .post("/billing/checkout-plan", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const cfg = await stripeConfig(c.env);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ planId: z.string(), returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const plan = (await listPlans(c.env.DB)).find((p) => p.id === body.data.planId);
    if (!plan?.stripe_price_id) return c.json({ error: "plan not synced to stripe" }, 409);
    const customer = await ensureCustomer(c.env.DB, cfg.secretKey, who.tenantId, c.get("user")?.email);
    /**
     * Hosted Checkout collects the card BEFORE the subscription exists and
     * charges nothing now, so the subscription is born `trialing` with a payment
     * method already attached — trap 2 is satisfied and entitlements are live
     * from minute one.
     */
    const trialDays = entitlements.resolve(plan.entitlements_json).trialDays;
    const session = await stripeCall<{ url: string; id: string }>(cfg.secretKey, "checkout/sessions", {
      mode: "subscription",
      customer,
      "line_items[0][price]": plan.stripe_price_id,
      "line_items[0][quantity]": 1,
      success_url: `${body.data.returnUrl}?checkout=success`,
      cancel_url: `${body.data.returnUrl}?checkout=cancel`,
      "metadata[app]": TESSA_APP,
      "metadata[tessa_tenant]": who.tenantId,
      "metadata[tessa_plan]": plan.id,
      // Session metadata is NOT copied down to the subscription, so without
      // these the `trialing` subscription's own events cannot name the plan and
      // have to fall back to a customer lookup.
      "subscription_data[metadata][app]": TESSA_APP,
      "subscription_data[metadata][tessa_tenant]": who.tenantId,
      "subscription_data[metadata][tessa_plan]": plan.id,
      ...(trialDays ? { "subscription_data[trial_period_days]": trialDays } : {}),
    });
    return c.json({ url: session.url, trialDays: trialDays ?? 0 });
  })

  .post("/billing/checkout-pack", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const cfg = await stripeConfig(c.env);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ packId: z.string(), returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const pack = (await listPacks(c.env.DB)).find((p) => p.id === body.data.packId);
    if (!pack) return c.json({ error: "unknown pack" }, 404);
    const priceRow = await c.env.DB
      .prepare("SELECT stripe_price_id FROM credit_packs WHERE id = ?")
      .bind(pack.id)
      .first<{ stripe_price_id: string | null }>();
    if (!priceRow?.stripe_price_id) return c.json({ error: "pack not synced" }, 409);
    const customer = await ensureCustomer(c.env.DB, cfg.secretKey, who.tenantId, c.get("user")?.email);
    const session = await stripeCall<{ url: string }>(cfg.secretKey, "checkout/sessions", {
      mode: "payment",
      customer,
      "line_items[0][price]": priceRow.stripe_price_id,
      "line_items[0][quantity]": 1,
      success_url: `${body.data.returnUrl}?pack=success`,
      cancel_url: `${body.data.returnUrl}?pack=cancel`,
      "metadata[app]": TESSA_APP,
      "metadata[tessa_tenant]": who.tenantId,
      "metadata[tessa_pack]": pack.id,
      "metadata[tessa_credits]": String(pack.credits),
    });
    return c.json({ url: session.url });
  })

  /** The Stripe-hosted portal: change card, see invoices, cancel. */
  .post("/billing/portal", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const cfg = await stripeConfig(c.env);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const sub = await getSubscription(c.env.DB, who.tenantId);
    if (!sub?.stripe_customer_id) return c.json({ error: "no stripe customer" }, 409);
    const session = await stripeCall<{ url: string }>(cfg.secretKey, "billing_portal/sessions", {
      customer: sub.stripe_customer_id,
      return_url: body.data.returnUrl,
    });
    return c.json({ url: session.url });
  });

/**
 * The webhook. PUBLIC by construction — it carries a Stripe signature and no
 * session, which is the one legitimate reason to sit outside the route guard.
 *
 * Mounted under `/api/webhooks/`, not Kova's `/api/stripe/webhook`, because
 * `route-guard.ts` already exempts that prefix in all FOUR places a provider
 * callback has to survive: the public gate, the root door, a read-only tenant
 * (else suspension is unrecoverable — the payment that would fix it never
 * lands) and a maintenance window (a dropped webhook is not retried forever;
 * Stripe disables the endpoint, and money is captured with nothing granted).
 * Adding a fifth path shape would mean remembering all four.
 */
export const stripeWebhookRoutes = new Hono<AppEnv>().post("/webhooks/stripe", async (c) => {
  const cfg = await stripeConfig(c.env);
  const payload = await c.req.text();
  const sig = c.req.header("stripe-signature") ?? "";
  const outcome = await dispatchEvent(
    { DB: c.env.DB },
    {
      apps: [
        {
          slug: TESSA_APP,
          metadataPrefix: STRIPE_BRANDING.metadataPrefix,
          /**
           * Load-bearing: `invoice.paid` often carries no Tessa metadata at all,
           * because Stripe generates the invoice itself. A claim resolves
           * SILENCE, never a contradiction — an event whose metadata names
           * another app is never claimed here.
           */
          claims: async (e) => !!(await tenantByCustomer(c.env.DB, (e.data.object as { customer?: unknown }).customer)),
          handle: (e) => handleEvent(c.env, e, cfg.secretKey),
        },
      ],
      firstSeen: (id) => firstSeen(c.env.DB, id),
      // A transient failure inside the handler must NOT leave the id marked
      // seen, or Stripe's retry is dropped as a duplicate. The rail releases the
      // claim and rethrows, so the worker 500s and Stripe redelivers.
      release: (id) => unmarkSeen(c.env.DB, id),
    },
    payload,
    sig,
    cfg.webhookSecret,
  );
  return c.json(outcome.body, outcome.status as 200);
});

/**
 * Stamp the plan and grant its credits.
 *
 * `grantMonthly` is keyed by period, so a renewal invoice and a subscription
 * update in the same month grant once between them — not twice.
 */
async function activatePlan(env: Env, tenantId: string, planId: string): Promise<void> {
  await ensureSubscription(env.DB, tenantId);
  await env.DB
    .prepare(
      "UPDATE subscriptions SET plan_id = ?, status = 'active', pending_plan_id = CASE WHEN pending_plan_id = ? THEN NULL ELSE pending_plan_id END, past_due_at = NULL, suspend_at = NULL, delete_at = NULL, updated_at = ? WHERE tenant_id = ?",
    )
    .bind(planId, planId, nowIso(), tenantId)
    .run();
  const plan = await env.DB
    .prepare("SELECT entitlements_json FROM plans WHERE id = ?")
    .bind(planId)
    .first<{ entitlements_json: string | null }>();
  const grant = entitlements.resolve(plan?.entitlements_json).aiCredits.monthlyGrant;
  if (grant > 0) {
    const stub = env.BILLING.get(env.BILLING.idFromName(tenantId));
    await stub.bind(tenantId);
    await stub.grantMonthly(grant, periodKey());
  }
}

async function topUp(env: Env, tenantId: string, credits: number, ref: string): Promise<void> {
  const stub = env.BILLING.get(env.BILLING.idFromName(tenantId));
  await stub.bind(tenantId);
  await stub.topUp(credits, "pack.purchase", ref);
}

async function handleEvent(
  env: Env,
  event: { type: string; id?: string; data: { object: Record<string, unknown> } },
  secretKey: string,
): Promise<void> {
  const db = env.DB;
  const obj = event.data.object;
  const m = meta(obj);

  switch (event.type) {
    case "checkout.session.completed": {
      if (m.tessa_pack && m.tessa_credits && m.tessa_tenant) {
        await topUp(env, m.tessa_tenant, Number(m.tessa_credits), m.tessa_pack);
      }
      if (m.tessa_plan && m.tessa_tenant) {
        await activatePlan(env, m.tessa_tenant, m.tessa_plan);
        // TRAP 3. Checkout completed ⇒ the new subscription is paid and active,
        // so cancel whatever the tenant was on to stop a double charge.
        if (typeof obj.subscription === "string") {
          await supersedePlatformSub(db, secretKey, m.tessa_tenant, obj.subscription);
        }
      }
      break;
    }

    case "invoice.paid": {
      const tenantId = m.tessa_tenant ?? (await tenantByCustomer(db, obj.customer));
      if (!tenantId) break;
      /**
       * TRAP 1. Verified against live Stripe test mode: creating a
       * `trial_period_days` subscription fires `invoice.paid` with
       * `billing_reason: "subscription_create"` and `amount_paid: 0`, BEFORE
       * `customer.subscription.created`. A zero-amount trial-start invoice is
       * not a payment, so it activates nothing.
       *
       * Nothing is lost by skipping it: a genuinely $0 subscription is born
       * `active` and activates through `customer.subscription.*` instead, and
       * the real trial conversion is a `subscription_cycle` invoice with
       * `amount_paid > 0`.
       */
      const amountPaid = typeof obj.amount_paid === "number" ? obj.amount_paid : 0;
      const zeroTrialStart = amountPaid <= 0 && obj.billing_reason === "subscription_create";
      const sub = await getSubscription(db, tenantId);
      const planId = m.tessa_plan ?? (sub?.plan_id && sub.plan_id !== "free" ? sub.plan_id : sub?.pending_plan_id);
      if (planId && !zeroTrialStart) await activatePlan(env, tenantId, planId);

      // Capture the subscription id and the period this invoice covers. On a
      // Basil-shaped payload the sub id lives under `parent.subscription_details`
      // — reading only the legacy field leaves it permanently unstamped, and
      // every guard keyed off it silently stops working.
      const subId = invoiceSubscriptionId(obj);
      const cpe = typeof obj.period_end === "number" ? new Date(obj.period_end * 1000).toISOString() : null;
      // Only (re)stamp when this is the tenant's CURRENT subscription: an
      // invoice for one we have already superseded must not regress the id.
      const stampSub = !sub?.stripe_sub_id || sub.stripe_sub_id === subId ? subId : null;
      await db
        .prepare("UPDATE subscriptions SET stripe_sub_id = COALESCE(?, stripe_sub_id), current_period_end = COALESCE(?, current_period_end), updated_at = ? WHERE tenant_id = ?")
        .bind(stampSub, cpe, nowIso(), tenantId)
        .run();
      break;
    }

    case "invoice.payment_failed": {
      const tenantId = m.tessa_tenant ?? (await tenantByCustomer(db, obj.customer));
      if (!tenantId) break;
      // Seed the grace window, and never clobber a later suspend/cancel — that
      // clamp is what stops a payment webhook stalling the dunning ladder.
      await db
        .prepare("UPDATE subscriptions SET status = 'past_due', past_due_at = COALESCE(past_due_at, ?), updated_at = ? WHERE tenant_id = ? AND status NOT IN ('suspended','blocked','canceled','closing')")
        .bind(nowIso(), nowIso(), tenantId)
        .run();
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const status = obj.status as string;
      const subId = typeof obj.id === "string" ? obj.id : null;
      if (m.tessa_plan && m.tessa_tenant && subId) {
        const cur = await getSubscription(db, m.tessa_tenant);
        /**
         * TRAP 2. `trialing` alone is NOT a paid-for plan — an inline
         * subscription is born `trialing` before the card is confirmed, so
         * activating on it hands a fully-entitled plan and its whole credit
         * grant to a centre whose card confirmation then failed. `active` needs
         * no such check.
         */
        const activating = status === "active" || (status === "trialing" && hasPaymentMethod(obj));
        if (activating) await supersedePlatformSub(db, secretKey, m.tessa_tenant, subId);
        // Only touch the plan when this event's subscription is the tenant's
        // current one. A stale subscription's events still carry their own plan
        // metadata and must not restamp or downgrade the live plan.
        const isCurrent = activating || !cur?.stripe_sub_id || cur.stripe_sub_id === subId;
        if (isCurrent && activating) await activatePlan(env, m.tessa_tenant, m.tessa_plan);
      }
      // The generic reconciliation — status mapping plus the `LADDER_OWNED`
      // clamp — is `@4dl/billing`'s, and applies whether or not we had metadata.
      await syncStripeSubscription(db, obj);
      break;
    }

    default:
      // Every other event type is legitimately none of our business. It was
      // still ATTRIBUTED (so it is not parked) and acknowledged.
      break;
  }
}

// ── The operator's Stripe lane ──────────────────────────────────────────────

/**
 * Per-credential paste validation. The prefix rules are Stripe's own, so a
 * wrong-slot paste — a publishable key in the secret field, a signing secret in
 * a key field — is refused at the door rather than discovered later as a dead
 * payment path.
 */
const CREDENTIAL_SHAPE: Record<StripeCredential, { prefix: RegExp; label: string; expect: string }> = {
  secretKey: { prefix: /^sk_/, label: "Secret key", expect: "sk_…" },
  publishableKey: { prefix: /^pk_/, label: "Publishable key", expect: "pk_…" },
  webhookSecret: { prefix: /^whsec_/, label: "Webhook signing secret", expect: "whsec_…" },
};

export const billingAdminRoutes = new Hono<AppEnv>()
  .onError((err, c) => {
    console.error(`[billing-admin] ${c.req.method} ${new URL(c.req.url).pathname}:`, err);
    return c.json({ error: err instanceof Error ? err.message : "stripe request failed" }, 502);
  })

  .get("/admin/stripe/status", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json(stripeStatus(await getConfig(c.env.DB)));
  })

  .post("/admin/stripe/config", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const body = z
      .object({
        mode: z.enum(["disabled", "test", "live"]).optional(),
        secretKey: z.string().max(400).optional(),
        publishableKey: z.string().max(400).optional(),
        webhookSecret: z.string().max(400).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    const raw = await getConfig(c.env.DB);
    const mode = body.data.mode ?? (raw["stripe.mode"] as "disabled" | "test" | "live" | undefined) ?? "disabled";
    const lane = laneForMode(mode) ?? "test";

    for (const cred of STRIPE_CREDENTIALS) {
      const value = body.data[cred]?.trim();
      // A blank field PRESERVES what is stored — keys are write-only, so the
      // console can render "set" without ever reading one back.
      if (!value) continue;
      const shape = CREDENTIAL_SHAPE[cred];
      if (!shape.prefix.test(value)) {
        return c.json({ error: `${shape.label} should start with ${shape.expect}` }, 400);
      }
      // A test key stored in the live lane is a dead payment path that looks
      // configured. Refuse it here rather than at the first charge.
      const keyLane = credentialLane(value);
      if (keyLane && keyLane !== lane) {
        return c.json({ error: `That ${shape.label.toLowerCase()} is a ${keyLane} key, but you are configuring the ${lane} lane.` }, 400);
      }
      await setConfig(c.env.DB, stripeLaneConfigKey(lane, cred), value);
    }
    if (body.data.mode) await setConfig(c.env.DB, "stripe.mode", body.data.mode);
    return c.json(stripeStatus(await getConfig(c.env.DB)));
  })

  /** Create the Stripe products + prices for every plan and pack that has none. */
  .post("/admin/stripe/sync", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await stripeConfig(c.env);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    await seedBilling(c.env.DB);
    return c.json(await syncCatalog(c.env.DB, cfg.secretKey));
  })

  /** Every centre, what it is on, and what it owes. */
  .get("/admin/tenants", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const rows = await c.env.DB
      .prepare("SELECT o.id, o.name, o.slug, s.plan_id, s.status, s.past_due_at, s.current_period_end FROM organization o LEFT JOIN subscriptions s ON s.tenant_id = o.id ORDER BY o.name LIMIT 500")
      .all();
    return c.json({ tenants: rows.results ?? [] });
  })

  /** Comp a centre onto a plan, or move it. The operator's override. */
  .post("/admin/tenants/:id/plan", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const body = z.object({ planId: z.string(), comp: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const tenantId = c.req.param("id");
    await ensureSubscription(c.env.DB, tenantId);
    await c.env.DB
      .prepare("UPDATE subscriptions SET plan_id = ?, comp = ?, status = 'active', past_due_at = NULL, suspend_at = NULL, delete_at = NULL, updated_at = ? WHERE tenant_id = ?")
      .bind(body.data.planId, body.data.comp ? 1 : 0, nowIso(), tenantId)
      .run();
    return c.json({ ok: true });
  })

  /** Hand a centre credits directly — support, goodwill, a failed purchase. */
  .post("/admin/tenants/:id/topup", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const body = z.object({ credits: z.number().int().min(1).max(1_000_000) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const tenantId = c.req.param("id");
    const stub = c.env.BILLING.get(c.env.BILLING.idFromName(tenantId));
    await stub.bind(tenantId);
    return c.json(await stub.topUp(body.data.credits, "admin.topup", newId("adm")));
  });
