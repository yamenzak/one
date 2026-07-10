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
import { getSubscription, listPacks, listPlans, seedBilling } from "./billing-store.js";
import { requireClientAccess } from "./clients.js";
import {
  ensureCustomer,
  stripeCall,
  stripeConfig,
  stripeEnabled,
  syncCatalog,
  verifyWebhook,
  setConfig,
} from "./stripe.js";
import { newId, nowIso, periodKey } from "./ids.js";
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
    const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
    await handlePlatformEvent(c.env.DB, c.env.BILLING, event);
    return c.json({ received: true });
  })

  // ── Connect rail (tenant ↔ client, no application fee) ─────────────────────
  .post("/connect/onboard", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
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
    const settings = await c.env.DB.prepare("SELECT stripe_account_id FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null }>();
    if (!settings?.stripe_account_id) return c.json({ error: "tenant has no connected Stripe account" }, 409);
    const pkg = await c.env.DB.prepare("SELECT * FROM packages WHERE id = ? AND tenant_id = ? AND active = 1").bind(body.data.packageId, who.tenantId).first<{ id: string; name: string; one_time_price_cents: number | null; currency: string }>();
    if (!pkg) return c.json({ error: "package not found" }, 404);
    const amount = pkg.one_time_price_cents ?? 0;
    if (amount <= 0) return c.json({ error: "use /subscriptions/grant for $0 packages" }, 400);

    // Checkout ON the connected account — no application_fee (zero markup).
    const session = await stripeCall<{ url: string }>(
      cfg.secretKey,
      "checkout/sessions",
      {
        mode: "payment",
        "line_items[0][price_data][currency]": pkg.currency || "usd",
        "line_items[0][price_data][product_data][name]": pkg.name,
        "line_items[0][price_data][unit_amount]": amount,
        "line_items[0][quantity]": 1,
        success_url: `${body.data.returnUrl}?purchase=success`,
        cancel_url: `${body.data.returnUrl}?purchase=cancel`,
        "metadata[mossa_tenant]": who.tenantId,
        "metadata[mossa_client]": access.client.id,
        "metadata[mossa_package]": pkg.id,
      },
      { connectedAccount: settings.stripe_account_id },
    );
    return c.json({ url: session.url });
  })

  // Connect webhook — grants the client package on successful payment.
  .post("/connect/webhook", async (c) => {
    const cfg = await stripeConfig(c.env.DB);
    const payload = await c.req.text();
    const sig = c.req.header("stripe-signature") ?? "";
    const secret = cfg.connectWebhookSecret || cfg.webhookSecret;
    if (!secret || !(await verifyWebhook(payload, sig, secret))) return c.json({ error: "bad signature" }, 400);
    const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as { metadata?: Record<string, string> };
      const m = s.metadata ?? {};
      if (m.mossa_client && m.mossa_package) {
        await grantClientPackage(c.env.DB, m.mossa_tenant!, m.mossa_client, m.mossa_package);
      }
    }
    return c.json({ received: true });
  });

/** Admin Stripe config + catalog sync (platform-admin lane). */
export const stripeAdminRoutes = new Hono<AppEnv>()
  .post("/admin/stripe/config", async (c) => {
    const body = z
      .object({
        mode: z.enum(["disabled", "test", "live"]).optional(),
        secretKey: z.string().optional(),
        publishableKey: z.string().optional(),
        webhookSecret: z.string().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const d = body.data;
    if (d.mode) await setConfig(c.env.DB, "stripe.mode", d.mode);
    if (d.secretKey) await setConfig(c.env.DB, "stripe.secret_key", d.secretKey);
    if (d.publishableKey) await setConfig(c.env.DB, "stripe.publishable_key", d.publishableKey);
    if (d.webhookSecret) await setConfig(c.env.DB, "stripe.webhook_secret", d.webhookSecret);
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
    return c.json({ mode: cfg.mode, enabled: stripeEnabled(cfg) });
  });

// ── Webhook handlers ───────────────────────────────────────────────────────
async function handlePlatformEvent(
  db: D1Database,
  billing: AppEnv["Bindings"]["BILLING"],
  event: { type: string; data: { object: Record<string, unknown> } },
): Promise<void> {
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
      }
      break;
    }
    case "invoice.paid": {
      const tenantId = meta.mossa_tenant ?? (await tenantByCustomer(db, obj.customer as string));
      const planId = await planForTenant(db, tenantId);
      if (tenantId && planId) await activatePlan(db, billing, tenantId, planId);
      break;
    }
    case "invoice.payment_failed": {
      const tenantId = meta.mossa_tenant ?? (await tenantByCustomer(db, obj.customer as string));
      if (tenantId) await db.prepare("UPDATE subscriptions SET status = 'past_due', past_due_at = ? WHERE tenant_id = ?").bind(nowIso(), tenantId).run();
      break;
    }
    case "customer.subscription.deleted": {
      const tenantId = await tenantByCustomer(db, obj.customer as string);
      if (tenantId) await db.prepare("UPDATE subscriptions SET status = 'canceled', plan_id = 'free' WHERE tenant_id = ?").bind(tenantId).run();
      break;
    }
  }
}

async function activatePlan(db: D1Database, billing: AppEnv["Bindings"]["BILLING"], tenantId: string, planId: string): Promise<void> {
  await getSubscription(db, tenantId);
  await db.prepare("UPDATE subscriptions SET plan_id = ?, status = 'active', past_due_at = NULL, updated_at = ? WHERE tenant_id = ?").bind(planId, nowIso(), tenantId).run();
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

/** Shared with commerce: create/extend a client subscription from a package. */
async function grantClientPackage(db: D1Database, tenantId: string, clientId: string, packageId: string): Promise<void> {
  const pkg = await db.prepare("SELECT budgets_json, addons_json, flags_json FROM packages WHERE id = ?").bind(packageId).first<{ budgets_json: string | null; addons_json: string | null; flags_json: string | null }>();
  if (!pkg) return;
  const now = nowIso();
  const specs = parseJson<{ feature: Budget["feature"]; days: number }[]>(pkg.budgets_json, []);
  const addOns = parseJson<{ addOnTypeId: string; quantity: number }[]>(pkg.addons_json, []);
  const current = await db.prepare("SELECT id, budgets_json, addons_json FROM client_subscriptions WHERE client_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1").bind(clientId).first<{ id: string; budgets_json: string | null; addons_json: string | null }>();
  if (current) {
    const existing = parseJson<Budget[]>(current.budgets_json, []);
    const added = buildBudgetsForPurchase(existing, specs, now);
    const balances = mergeAddOnBalances(parseJson(current.addons_json, []), addOns);
    await db.prepare("UPDATE client_subscriptions SET budgets_json = ?, addons_json = ?, payment_status = 'paid', updated_at = ? WHERE id = ?").bind(j([...existing, ...added]), j(balances), now, current.id).run();
  } else {
    await db.prepare(
      "INSERT INTO client_subscriptions (id, tenant_id, client_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, started_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'paid', ?, ?, ?, 'stripe', ?, ?)",
    )
      .bind(newId("csub"), tenantId, clientId, packageId, j(buildBudgetsForPurchase([], specs, now)), j(mergeAddOnBalances([], addOns)), pkg.flags_json, now, now)
      .run();
  }
}
