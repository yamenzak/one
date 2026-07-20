/**
 * Stripe routes (SPEC §7) — platform rail (plan checkout, pack checkout,
 * webhook) + Connect rail (account onboarding, client-package checkout with
 * no application fee, connect webhook). Admin config endpoints under
 * /api/admin/stripe/*.
 */

import { Hono } from "hono";
import { z } from "zod";
import { resolveEntitlements, buildBudgetsForPurchase, mergeAddOnBalances, type Budget } from "@mossa/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import { getSubscription, listPacks, listPlans, seedBilling, hasFeature, getConfig } from "./billing-store.js";
import { requireClientAccess } from "./clients.js";
import { notify, notifyOwners } from "./notify.js";
import {
  ensureCustomer,
  stripeCall,
  stripeConfig,
  stripeEnabled,
  syncCatalog,
  verifyWebhook,
  setConfig,
} from "./stripe.js";
import { newId, nowIso, nowMs, periodKey } from "./ids.js";
import { parseJson, j } from "./db.js";

export const stripeRoutes = new Hono<AppEnv>()
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
    const session = await stripeCall<{ url: string; id: string }>(cfg.secretKey, "checkout/sessions", {
      mode: "subscription",
      customer,
      "line_items[0][price]": plan.stripe_price_id,
      "line_items[0][quantity]": 1,
      success_url: `${body.data.returnUrl}?checkout=success`,
      cancel_url: `${body.data.returnUrl}?checkout=cancel`,
      "metadata[mossa_tenant]": who.tenantId,
      "metadata[mossa_plan]": plan.id,
    });
    return c.json({ url: session.url });
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
      "metadata[mossa_tenant]": who.tenantId,
      "metadata[mossa_pack]": pack.id,
      "metadata[mossa_credits]": pack.credits,
    });
    return c.json({ url: session.url });
  })

  // Platform webhook (public lane; signature-verified).
  .post("/stripe/webhook", async (c) => {
    const cfg = await stripeConfig(c.env.DB);
    const payload = await c.req.text();
    const sig = c.req.header("stripe-signature") ?? "";
    if (!cfg.webhookSecret || !(await verifyWebhook(payload, sig, cfg.webhookSecret))) {
      return c.json({ error: "bad signature" }, 400);
    }
    const event = JSON.parse(payload) as { id?: string; type: string; data: { object: Record<string, unknown> } };
    if (!(await firstSeen(c.env.DB, event.id))) return c.json({ received: true, duplicate: true });
    try {
      await handlePlatformEvent(c.env, event);
    } catch (err) {
      // We claimed the event id before processing; a failure here (DO/D1
      // transient) must NOT leave it marked seen, or Stripe's retry would be
      // dropped as a duplicate — money captured, nothing granted. Release the
      // claim and 500 so Stripe redelivers and we process it cleanly.
      await unmarkSeen(c.env.DB, event.id);
      throw err;
    }
    return c.json({ received: true });
  })

  // ── Connect rail (tenant ↔ client, no application fee) ─────────────────────
  .post("/connect/onboard", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    if (!(await hasFeature(c.env.DB, who.tenantId, "commerce"))) return c.json({ error: "commerce not in your plan" }, 403);
    const cfg = await stripeConfig(c.env.DB);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    const existing = await c.env.DB.prepare("SELECT stripe_account_id FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null }>();
    let accountId = existing?.stripe_account_id ?? null;
    if (!accountId) {
      const account = await stripeCall<{ id: string }>(cfg.secretKey, "accounts", {
        type: "standard",
        "metadata[mossa_tenant]": who.tenantId,
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
    const pkg = await c.env.DB.prepare("SELECT * FROM packages WHERE id = ? AND tenant_id = ? AND active = 1").bind(body.data.packageId, who.tenantId).first<{ id: string; name: string; one_time_price_cents: number | null; monthly_price_cents: number | null; currency: string }>();
    if (!pkg) return c.json({ error: "package not found" }, 404);
    // A monthly price makes the package auto-renewing (a Stripe subscription on
    // the connected account); otherwise it's a one-time day-pack. Either way the
    // budget model is the source of truth — recurring just re-buys each period.
    const monthly = pkg.monthly_price_cents ?? 0;
    const recurring = monthly > 0;
    const amount = recurring ? monthly : (pkg.one_time_price_cents ?? 0);
    if (amount <= 0) return c.json({ error: "use /subscriptions/grant for $0 packages" }, 400);

    // Optional platform cut — a basis-points application fee set by the platform
    // admin (default 0 = zero markup, tenant keeps 100%). Direct charge on the
    // connected account, so the fee routes to the platform on this payment.
    const feeBps = Number((await getConfig(c.env.DB))["stripe.platform_fee_bps"] ?? "0");
    const meta = {
      "metadata[mossa_tenant]": who.tenantId,
      "metadata[mossa_client]": access.client.id,
      "metadata[mossa_package]": pkg.id,
    };
    const priceData = {
      "line_items[0][price_data][currency]": pkg.currency || "usd",
      "line_items[0][price_data][product_data][name]": pkg.name,
      "line_items[0][price_data][unit_amount]": amount,
      "line_items[0][quantity]": 1,
    };
    const params: Record<string, string | number | undefined> = recurring
      ? {
          mode: "subscription",
          ...priceData,
          "line_items[0][price_data][recurring][interval]": "month",
          ...(feeBps > 0 ? { "subscription_data[application_fee_percent]": feeBps / 100 } : {}),
          // Carry the mapping on the subscription too, so renewals resolve it.
          "subscription_data[metadata][mossa_tenant]": who.tenantId,
          "subscription_data[metadata][mossa_client]": access.client.id,
          "subscription_data[metadata][mossa_package]": pkg.id,
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

  // Cancel a client's auto-renewing package (stops future billing; the current
  // period's budget still runs out naturally). Client, their coach, or owner.
  .post("/connect/cancel-subscription", async (c) => {
    const who = requireTenant(c)!;
    const body = z.object({ clientId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, body.data.clientId);
    if ("response" in access) return access.response;
    const sub = await c.env.DB.prepare("SELECT id, stripe_sub_id FROM client_subscriptions WHERE client_id = ? AND status = 'active' AND stripe_sub_id IS NOT NULL ORDER BY started_at DESC LIMIT 1").bind(access.client.id).first<{ id: string; stripe_sub_id: string | null }>();
    if (!sub?.stripe_sub_id) return c.json({ error: "no auto-renewing subscription" }, 404);
    const settings = await c.env.DB.prepare("SELECT stripe_account_id FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null }>();
    const cfg = await stripeConfig(c.env.DB);
    if (settings?.stripe_account_id && stripeEnabled(cfg)) {
      await stripeCall(cfg.secretKey, `subscriptions/${sub.stripe_sub_id}`, undefined, { connectedAccount: settings.stripe_account_id, method: "DELETE" }).catch(() => undefined);
    }
    // Clear the renewal marker; access continues until the current budget lapses.
    await c.env.DB.prepare("UPDATE client_subscriptions SET stripe_sub_id = NULL, payment_status = 'canceled', updated_at = ? WHERE id = ?").bind(nowIso(), sub.id).run();
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
    try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as { id?: string; mode?: string; subscription?: string; metadata?: Record<string, string> };
      const m = s.metadata ?? {};
      if (m.mossa_client && m.mossa_package) {
        // First period for both one-time and recurring; for recurring we also
        // pin the Stripe subscription id so later invoices renew this same row.
        await grantClientPackage(c.env.DB, m.mossa_tenant!, m.mossa_client, m.mossa_package, s.id ?? null, s.mode === "subscription" ? s.subscription ?? null : null);
      }
    } else if (event.type === "invoice.paid") {
      // Renewal cycles top up the budget; the first invoice (subscription_create)
      // is skipped — checkout.session.completed already granted period one.
      const inv = event.data.object as { subscription?: string; billing_reason?: string };
      if (inv.subscription && inv.billing_reason === "subscription_cycle") {
        await renewClientSubscription(c.env.DB, inv.subscription);
      }
    } else if (event.type === "invoice.payment_failed") {
      // Auto-renew charge failed — mark past_due + nudge the client to fix their
      // card. Access still runs until the current budget lapses (grace by design).
      const inv = event.data.object as { subscription?: string };
      if (inv.subscription) {
        const row = await c.env.DB.prepare("SELECT id, tenant_id, client_id FROM client_subscriptions WHERE stripe_sub_id = ? LIMIT 1").bind(inv.subscription).first<{ id: string; tenant_id: string; client_id: string }>();
        if (row) {
          await c.env.DB.prepare("UPDATE client_subscriptions SET payment_status = 'past_due', updated_at = ? WHERE id = ?").bind(nowIso(), row.id).run();
          const cl = await c.env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(row.client_id).first<{ user_id: string | null }>();
          if (cl?.user_id) await notify(c.env, { tenantId: row.tenant_id, userId: cl.user_id, type: "sub_payment_failed", title: "Renewal payment failed", message: "Update your card to keep your plan from pausing.", link: "/shop", dedupeKey: `pf_${row.id}` });
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      // Auto-renew ended (client canceled or Stripe gave up). No more top-ups;
      // the current budget simply runs out. Clear the renewal marker.
      const subObj = event.data.object as { id?: string };
      if (subObj.id) await c.env.DB.prepare("UPDATE client_subscriptions SET stripe_sub_id = NULL, payment_status = 'canceled', updated_at = ? WHERE stripe_sub_id = ?").bind(nowIso(), subObj.id).run();
    } else if (event.type === "account.updated") {
      // Onboarding / capability changes for a connected account.
      const a = event.data.object as { id?: string; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean };
      if (a.id) await syncConnectAccount(c.env.DB, a);
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      // Money-safe: don't guess which budget days to claw back (partial refunds,
      // elapsed time) — surface it to the tenant to adjust the client's access.
      const tenantId = event.account
        ? (await c.env.DB.prepare("SELECT tenant_id FROM tenant_settings WHERE stripe_account_id = ?").bind(event.account).first<{ tenant_id: string }>())?.tenant_id
        : undefined;
      if (tenantId) {
        const disputed = event.type === "charge.dispute.created";
        await notifyOwners(c.env, tenantId, {
          type: disputed ? "payment_disputed" : "payment_refunded",
          title: disputed ? "A client payment was disputed" : "A client payment was refunded",
          message: disputed
            ? "A client opened a dispute on a package payment. Review it in Stripe and adjust their access if needed."
            : "A client package payment was refunded. Review whether their access should be adjusted.",
          link: "/clients",
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

/** Webhook idempotency: the first insert of a Stripe event id processes; a
 *  redelivery finds the row already present (changes = 0) and short-circuits. */
async function firstSeen(db: D1Database, eventId: string | undefined): Promise<boolean> {
  if (!eventId) return true; // no id (shouldn't happen) → process, don't drop
  const r = await db.prepare("INSERT OR IGNORE INTO stripe_events (id, at) VALUES (?, ?)").bind(eventId, nowMs()).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Release a claimed event id (see the webhook try/catch): a handler that threw
 *  after `firstSeen` claimed the id must delete the row so Stripe's redelivery
 *  is processed instead of short-circuited as a duplicate. Best-effort. */
async function unmarkSeen(db: D1Database, eventId: string | undefined): Promise<void> {
  if (!eventId) return;
  await db.prepare("DELETE FROM stripe_events WHERE id = ?").bind(eventId).run().catch(() => undefined);
}

/** Mirror a connected account's capability flags onto tenant_settings. */
async function syncConnectAccount(db: D1Database, a: { id?: string; charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean }): Promise<void> {
  if (!a.id) return;
  await db.prepare("UPDATE tenant_settings SET charges_enabled = ?, payouts_enabled = ?, details_submitted = ?, updated_at = ? WHERE stripe_account_id = ?")
    .bind(a.charges_enabled ? 1 : 0, a.payouts_enabled ? 1 : 0, a.details_submitted ? 1 : 0, nowIso(), a.id)
    .run();
}

/** Admin Stripe config + catalog sync (platform-admin lane). */
export const stripeAdminRoutes = new Hono<AppEnv>()
  .post("/admin/stripe/config", async (c) => {
    const body = z
      .object({
        mode: z.enum(["disabled", "test", "live"]).optional(),
        secretKey: z.string().optional(),
        publishableKey: z.string().optional(),
        webhookSecret: z.string().optional(),
        connectWebhookSecret: z.string().optional(),
        /** Platform application fee on client→tenant purchases, in basis points
         *  (0–10000 = 0–100%). Default 0 = tenant keeps everything. */
        platformFeeBps: z.number().int().min(0).max(10000).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const d = body.data;
    if (d.mode) await setConfig(c.env.DB, "stripe.mode", d.mode);
    if (d.secretKey) await setConfig(c.env.DB, "stripe.secret_key", d.secretKey);
    if (d.publishableKey) await setConfig(c.env.DB, "stripe.publishable_key", d.publishableKey);
    if (d.webhookSecret) await setConfig(c.env.DB, "stripe.webhook_secret", d.webhookSecret);
    if (d.connectWebhookSecret) await setConfig(c.env.DB, "stripe.connect_webhook_secret", d.connectWebhookSecret);
    if (d.platformFeeBps !== undefined) await setConfig(c.env.DB, "stripe.platform_fee_bps", String(d.platformFeeBps));
    return c.json({ ok: true });
  })

  .post("/admin/stripe/sync", async (c) => {
    const cfg = await stripeConfig(c.env.DB);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    await seedBilling(c.env.DB);
    const result = await syncCatalog(c.env.DB, cfg.secretKey);
    return c.json({ ok: true, ...result });
  })

  .get("/admin/stripe/status", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const cfg = await stripeConfig(c.env.DB);
    const feeBps = Number((await getConfig(c.env.DB))["stripe.platform_fee_bps"] ?? "0");
    return c.json({ mode: cfg.mode, enabled: stripeEnabled(cfg), platformFeeBps: feeBps });
  });

// ── Webhook handlers ───────────────────────────────────────────────────────
async function handlePlatformEvent(
  env: AppEnv["Bindings"],
  event: { type: string; data: { object: Record<string, unknown> } },
): Promise<void> {
  const db = env.DB;
  const billing = env.BILLING;
  const obj = event.data.object;
  const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
  switch (event.type) {
    case "checkout.session.completed": {
      if (meta.mossa_pack && meta.mossa_credits && meta.mossa_tenant) {
        const dobj = billing.get(billing.idFromName(meta.mossa_tenant));
        await dobj.bind(meta.mossa_tenant);
        await dobj.topUp(Number(meta.mossa_credits), "pack.purchase", meta.mossa_pack);
      }
      if (meta.mossa_plan && meta.mossa_tenant) {
        await activatePlan(db, billing, meta.mossa_tenant, meta.mossa_plan);
        if (typeof obj.subscription === "string") {
          await db.prepare("UPDATE subscriptions SET stripe_sub_id = ? WHERE tenant_id = ?").bind(obj.subscription, meta.mossa_tenant).run();
        }
      }
      break;
    }
    case "invoice.paid": {
      const tenantId = meta.mossa_tenant ?? (await tenantByCustomer(db, obj.customer as string));
      const planId = await planForTenant(db, tenantId);
      if (tenantId && planId) await activatePlan(db, billing, tenantId, planId);
      // Capture the Stripe subscription id + the renewal date this invoice covers.
      if (tenantId) {
        const subId = typeof obj.subscription === "string" ? obj.subscription : null;
        const cpe = typeof obj.period_end === "number" ? new Date(obj.period_end * 1000).toISOString() : null;
        await db.prepare("UPDATE subscriptions SET stripe_sub_id = COALESCE(?, stripe_sub_id), current_period_end = COALESCE(?, current_period_end) WHERE tenant_id = ?").bind(subId, cpe, tenantId).run();
      }
      break;
    }
    case "invoice.payment_failed": {
      const tenantId = meta.mossa_tenant ?? (await tenantByCustomer(db, obj.customer as string));
      // Seed the grace window; never clobber a later suspend/cancel.
      if (tenantId) {
        await db.prepare("UPDATE subscriptions SET status = 'past_due', past_due_at = COALESCE(past_due_at, ?) WHERE tenant_id = ? AND status NOT IN ('suspended','canceled')").bind(nowIso(), tenantId).run();
        await notifyOwners(env, tenantId, {
          type: "billing_past_due",
          title: "Payment failed",
          message: "We couldn't charge your card. Update your payment method to keep your studio running — you have a short grace period before features pause.",
          link: "/business",
          dedupeKey: typeof obj.id === "string" ? `pf_${obj.id}` : undefined,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncStripeSubscription(db, obj);
      break;
    }
    case "customer.subscription.deleted": {
      const tenantId = await tenantByCustomer(db, obj.customer as string);
      if (tenantId) await db.prepare("UPDATE subscriptions SET status = 'canceled', plan_id = 'free' WHERE tenant_id = ?").bind(tenantId).run();
      break;
    }
  }
}

/**
 * Reconcile our subscription row against Stripe's authoritative subscription
 * object (fired on `customer.subscription.created|updated`). Stripe owns the raw
 * payment state (active / past_due / unpaid / canceled); our daily cron owns the
 * grace→suspend→delete escalation layered on `past_due_at`, so here we only seed
 * or clear those markers — never fight the cron's windows.
 */
async function syncStripeSubscription(db: D1Database, obj: Record<string, unknown>): Promise<void> {
  const tenantId = await tenantByCustomer(db, obj.customer as string);
  if (!tenantId) return;
  const subId = typeof obj.id === "string" ? obj.id : null;
  const cpe = typeof obj.current_period_end === "number" ? new Date(obj.current_period_end * 1000).toISOString() : null;
  const now = nowIso();
  await db.prepare("UPDATE subscriptions SET stripe_sub_id = COALESCE(?, stripe_sub_id), current_period_end = COALESCE(?, current_period_end), updated_at = ? WHERE tenant_id = ?").bind(subId, cpe, now, tenantId).run();
  switch (obj.status as string) {
    case "canceled":
      await db.prepare("UPDATE subscriptions SET status = 'canceled', plan_id = 'free' WHERE tenant_id = ?").bind(tenantId).run();
      break;
    case "unpaid":
      await db.prepare("UPDATE subscriptions SET status = 'unpaid' WHERE tenant_id = ?").bind(tenantId).run();
      break;
    case "past_due":
      await db.prepare("UPDATE subscriptions SET status = 'past_due', past_due_at = COALESCE(past_due_at, ?) WHERE tenant_id = ? AND status NOT IN ('suspended','canceled')").bind(now, tenantId).run();
      break;
    case "active":
    case "trialing":
      await db.prepare("UPDATE subscriptions SET status = ?, past_due_at = NULL, suspend_at = NULL, delete_at = NULL WHERE tenant_id = ?").bind((obj.status as string) === "trialing" ? "trialing" : "active", tenantId).run();
      break;
    // incomplete / incomplete_expired / paused → leave status untouched.
  }
}

async function activatePlan(db: D1Database, billing: AppEnv["Bindings"]["BILLING"], tenantId: string, planId: string): Promise<void> {
  await getSubscription(db, tenantId);
  // A successful payment fully recovers the tenant: clear every dunning marker
  // so the status clamp lifts and service (theirs + their clients') resumes.
  await db.prepare("UPDATE subscriptions SET plan_id = ?, status = 'active', past_due_at = NULL, suspend_at = NULL, delete_at = NULL, updated_at = ? WHERE tenant_id = ?").bind(planId, nowIso(), tenantId).run();
  const plan = await db.prepare("SELECT entitlements_json FROM plans WHERE id = ?").bind(planId).first<{ entitlements_json: string | null }>();
  const grant = resolveEntitlements(plan?.entitlements_json).aiCredits.monthlyGrant;
  if (grant > 0) {
    const dobj = billing.get(billing.idFromName(tenantId));
    await dobj.bind(tenantId);
    await dobj.grantMonthly(grant, periodKey());
  }
}

async function tenantByCustomer(db: D1Database, customerId: string): Promise<string | null> {
  const row = await db.prepare("SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = ?").bind(customerId).first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}
async function planForTenant(db: D1Database, tenantId: string | null): Promise<string | null> {
  if (!tenantId) return null;
  const row = await db.prepare("SELECT plan_id FROM subscriptions WHERE tenant_id = ?").bind(tenantId).first<{ plan_id: string }>();
  return row?.plan_id ?? null;
}

/** Shared with commerce: create/extend a client subscription from a package.
 *  `checkoutId`/`subId` are the Stripe Checkout Session / Subscription ids;
 *  event-level idempotency (firstSeen) already prevents a redelivery twice. */
async function grantClientPackage(db: D1Database, tenantId: string, clientId: string, packageId: string, checkoutId: string | null = null, subId: string | null = null): Promise<void> {
  const pkg = await db.prepare("SELECT budgets_json, addons_json, flags_json FROM packages WHERE id = ?").bind(packageId).first<{ budgets_json: string | null; addons_json: string | null; flags_json: string | null }>();
  if (!pkg) return;
  const now = nowIso();
  const specs = parseJson<{ feature: Budget["feature"]; days: number }[]>(pkg.budgets_json, []);
  const addOns = parseJson<{ addOnTypeId: string; quantity: number }[]>(pkg.addons_json, []);

  // Recurring purchase (a Stripe subscription): each subscription gets its OWN
  // row keyed by stripe_sub_id, carrying its own package_id. Folding it into a
  // pre-existing active row would drop the new sub id (COALESCE) and renew off
  // the wrong package — the client would be charged monthly with no top-up.
  if (subId) {
    const bySub = await db.prepare("SELECT id, budgets_json, addons_json FROM client_subscriptions WHERE stripe_sub_id = ? LIMIT 1").bind(subId).first<{ id: string; budgets_json: string | null; addons_json: string | null }>();
    if (bySub) {
      // A redelivered checkout for this same sub (before firstSeen dedup) — top
      // up its own runway rather than create a duplicate.
      const existing = parseJson<Budget[]>(bySub.budgets_json, []);
      const added = buildBudgetsForPurchase(existing, specs, now);
      const balances = mergeAddOnBalances(parseJson(bySub.addons_json, []), addOns);
      await db.prepare("UPDATE client_subscriptions SET budgets_json = ?, addons_json = ?, payment_status = 'paid', stripe_checkout_id = COALESCE(?, stripe_checkout_id), updated_at = ? WHERE id = ?").bind(j([...existing, ...added]), j(balances), checkoutId, now, bySub.id).run();
    } else {
      await db.prepare(
        "INSERT INTO client_subscriptions (id, tenant_id, client_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, stripe_checkout_id, stripe_sub_id, started_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'paid', ?, ?, ?, 'stripe', ?, ?, ?, ?)",
      )
        .bind(newId("csub"), tenantId, clientId, packageId, j(buildBudgetsForPurchase([], specs, now)), j(mergeAddOnBalances([], addOns)), pkg.flags_json, checkoutId, subId, now, now)
        .run();
    }
    return;
  }

  // One-time purchase: fold into the client's active NON-recurring runway (never
  // a recurring row — that row belongs to its own Stripe subscription).
  const current = await db.prepare("SELECT id, budgets_json, addons_json FROM client_subscriptions WHERE client_id = ? AND status = 'active' AND stripe_sub_id IS NULL ORDER BY started_at DESC LIMIT 1").bind(clientId).first<{ id: string; budgets_json: string | null; addons_json: string | null }>();
  if (current) {
    const existing = parseJson<Budget[]>(current.budgets_json, []);
    const added = buildBudgetsForPurchase(existing, specs, now);
    const balances = mergeAddOnBalances(parseJson(current.addons_json, []), addOns);
    await db.prepare("UPDATE client_subscriptions SET budgets_json = ?, addons_json = ?, payment_status = 'paid', stripe_checkout_id = COALESCE(?, stripe_checkout_id), updated_at = ? WHERE id = ?").bind(j([...existing, ...added]), j(balances), checkoutId, now, current.id).run();
  } else {
    await db.prepare(
      "INSERT INTO client_subscriptions (id, tenant_id, client_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, stripe_checkout_id, stripe_sub_id, started_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'paid', ?, ?, ?, 'stripe', ?, ?, ?, ?)",
    )
      .bind(newId("csub"), tenantId, clientId, packageId, j(buildBudgetsForPurchase([], specs, now)), j(mergeAddOnBalances([], addOns)), pkg.flags_json, checkoutId, null, now, now)
      .run();
  }
}

/** Renew an auto-renewing client subscription on each paid cycle: top the same
 *  row's budget up by another period. Resolved by the Stripe subscription id so
 *  it always hits the right row. Budgets stay the source of truth. */
async function renewClientSubscription(db: D1Database, stripeSubId: string): Promise<void> {
  const sub = await db.prepare("SELECT id, tenant_id, client_id, package_id, budgets_json, addons_json FROM client_subscriptions WHERE stripe_sub_id = ? ORDER BY started_at DESC LIMIT 1").bind(stripeSubId).first<{ id: string; tenant_id: string; client_id: string; package_id: string | null; budgets_json: string | null; addons_json: string | null }>();
  if (!sub?.package_id) return;
  const pkg = await db.prepare("SELECT budgets_json, addons_json FROM packages WHERE id = ?").bind(sub.package_id).first<{ budgets_json: string | null; addons_json: string | null }>();
  if (!pkg) return;
  const now = nowIso();
  const specs = parseJson<{ feature: Budget["feature"]; days: number }[]>(pkg.budgets_json, []);
  const addOns = parseJson<{ addOnTypeId: string; quantity: number }[]>(pkg.addons_json, []);
  const existing = parseJson<Budget[]>(sub.budgets_json, []);
  const added = buildBudgetsForPurchase(existing, specs, now);
  const balances = mergeAddOnBalances(parseJson(sub.addons_json, []), addOns);
  await db.prepare("UPDATE client_subscriptions SET budgets_json = ?, addons_json = ?, status = 'active', payment_status = 'paid', updated_at = ? WHERE id = ?").bind(j([...existing, ...added]), j(balances), now, sub.id).run();
}
