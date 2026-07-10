/**
 * Platform billing routes (SPEC §5, §6) — the owner's Business surface and
 * the platform-admin lane. Stripe checkout on this rail arrives with the
 * commerce phase; until then plan changes are free-tier/comp (admin) only.
 */

import { Hono } from "hono";
import { z } from "zod";
import { checkDowngrade, resolveEntitlements } from "@mossa/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import {
  getSubscription,
  listPacks,
  listPlans,
  seedBilling,
  tenantEntitlements,
} from "./billing-store.js";
import { nowIso, periodKey } from "./ids.js";

function billingDO(c: { env: AppEnv["Bindings"] }, tenantId: string) {
  const stub = c.env.BILLING.get(c.env.BILLING.idFromName(tenantId));
  return stub;
}

export const billingRoutes = new Hono<AppEnv>()
  .get("/billing", async (c) => {
    const who = requireTenant(c)!;
    await seedBilling(c.env.DB);
    const [sub, plans, packs, entitlements] = await Promise.all([
      getSubscription(c.env.DB, who.tenantId),
      listPlans(c.env.DB),
      listPacks(c.env.DB),
      tenantEntitlements(c.env.DB, who.tenantId),
    ]);
    const dobj = billingDO(c, who.tenantId);
    await dobj.bind(who.tenantId);
    const balance = await dobj.view();
    const ledger = await dobj.recentLedger();
    const plan = plans.find((p) => p.id === sub.plan_id) ?? null;
    return c.json({
      subscription: {
        planId: sub.plan_id,
        planName: plan?.name ?? sub.plan_id,
        status: sub.status,
        comp: Boolean(sub.comp),
        currentPeriodEnd: sub.current_period_end,
        pendingPlanId: sub.pending_plan_id,
      },
      balance,
      ledger,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        priceUsdMonth: p.price_usd_month,
        entitlements: resolveEntitlements(p.entitlements_json),
      })),
      packs,
      entitlements,
      stripeEnabled: false, // platform Stripe rail lands in the commerce phase
    });
  })

  // Downgrade eligibility probe (SPEC §5) — usage vs target entitlements.
  .post("/billing/check-downgrade", async (c) => {
    const who = requireTenant(c)!;
    const body = z.object({ planId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const plans = await listPlans(c.env.DB);
    const target = plans.find((p) => p.id === body.data.planId);
    if (!target) return c.json({ error: "unknown plan" }, 404);
    const db = c.env.DB;
    const count = async (sql: string): Promise<number> =>
      (await db.prepare(sql).bind(who.tenantId).first<{ n: number }>())?.n ?? 0;
    const usage = {
      staffSeats: await count(
        `SELECT COUNT(*) AS n FROM "member" WHERE organizationId = ? AND role != 'client'`,
      ),
      activeClients: await count(
        "SELECT COUNT(*) AS n FROM clients WHERE tenant_id = ? AND status = 'active'",
      ),
      templates:
        (await count("SELECT COUNT(*) AS n FROM workout_templates WHERE tenant_id = ?")) +
        (await count("SELECT COUNT(*) AS n FROM meal_templates WHERE tenant_id = ?")),
      storageMb: 0, // media accounting arrives with the media phase
      activeCommerceSubs: await count(
        "SELECT COUNT(*) AS n FROM client_subscriptions WHERE tenant_id = ? AND status = 'active' AND payment_status IN ('paid','installments')",
      ),
    };
    return c.json(checkDowngrade(usage, resolveEntitlements(target.entitlements_json)));
  });

/** Platform-admin lane (route-guard enforces ADMIN_EMAILS). */
export const adminRoutes = new Hono<AppEnv>()
  .get("/admin/tenants", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT o.id, o.name, o.slug, o.createdAt, s.plan_id, s.status, s.comp
       FROM "organization" o LEFT JOIN subscriptions s ON s.tenant_id = o.id ORDER BY o.createdAt DESC`,
    ).all();
    return c.json({ tenants: rows.results ?? [] });
  })

  // Comp a tenant onto a plan (no Stripe) + grant the month's credits.
  .post("/admin/tenants/:id/plan", async (c) => {
    const body = z
      .object({ planId: z.string(), comp: z.boolean().default(true) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const tenantId = c.req.param("id");
    await seedBilling(c.env.DB);
    const plans = await listPlans(c.env.DB);
    const plan = plans.find((p) => p.id === body.data.planId);
    if (!plan) return c.json({ error: "unknown plan" }, 404);
    await getSubscription(c.env.DB, tenantId); // ensure row
    await c.env.DB.prepare(
      "UPDATE subscriptions SET plan_id = ?, status = 'active', comp = ?, updated_at = ? WHERE tenant_id = ?",
    )
      .bind(plan.id, body.data.comp ? 1 : 0, nowIso(), tenantId)
      .run();
    const ent = resolveEntitlements(plan.entitlements_json);
    if (ent.aiCredits.monthlyGrant > 0) {
      const dobj = c.env.BILLING.get(c.env.BILLING.idFromName(tenantId));
      await dobj.bind(tenantId);
      await dobj.grantMonthly(ent.aiCredits.monthlyGrant, periodKey());
    }
    return c.json({ ok: true });
  })

  .post("/admin/tenants/:id/topup", async (c) => {
    const body = z
      .object({ credits: z.number().int().positive(), reason: z.string().default("admin.topup") })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const tenantId = c.req.param("id");
    const dobj = c.env.BILLING.get(c.env.BILLING.idFromName(tenantId));
    await dobj.bind(tenantId);
    const view = await dobj.topUp(body.data.credits, body.data.reason);
    return c.json(view);
  })

  .get("/admin/whoami", (c) => c.json({ admin: isPlatformAdmin(c), email: c.get("user")?.email }));
