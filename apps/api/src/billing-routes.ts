/**
 * Platform billing routes (SPEC §5, §6) — the owner's Business surface and
 * the platform-admin lane. Stripe checkout on this rail arrives with the
 * commerce phase; until then plan changes are free-tier/comp (admin) only.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  checkDowngrade, resolveEntitlements, mergeOverrides, snapshotDowngrade, raiseOverride,
  isFullyExpired, overallDaysRemaining,
  FEATURE_KEYS, QUOTA_KEYS, FEATURE_META, QUOTA_META, type Entitlements, type EntitlementGrants, type Budget,
} from "@mossa/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import {
  getSubscription,
  listPacks,
  listPlans,
  seedBilling,
  tenantEntitlements,
} from "./billing-store.js";
import { stripeConfig, stripeEnabled, stripeCall } from "./stripe.js";
import { nowIso, periodKey } from "./ids.js";
import { parseJson } from "./db.js";

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

    // Connect account + the tenant's own client-delinquency roll-up, so the
    // owner's Business surface can nudge onboarding and flag lapsing clients.
    const cfg = await stripeConfig(c.env.DB);
    const [connectRow, csubs] = await Promise.all([
      c.env.DB.prepare("SELECT stripe_account_id, charges_enabled, details_submitted FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ stripe_account_id: string | null; charges_enabled: number | null; details_submitted: number | null }>(),
      c.env.DB.prepare("SELECT budgets_json FROM client_subscriptions WHERE tenant_id = ? AND status IN ('active','paused')").bind(who.tenantId).all<{ budgets_json: string | null }>(),
    ]);
    const now = nowIso();
    let lapsed = 0, expiringSoon = 0;
    for (const r of csubs.results ?? []) {
      const budgets = parseJson<Budget[]>(r.budgets_json, []);
      if (!budgets.length) continue;
      if (isFullyExpired(budgets, now)) lapsed++;
      else if (overallDaysRemaining(budgets, now) <= 7) expiringSoon++;
    }

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
      stripeEnabled: stripeEnabled(cfg),
      connect: {
        connected: Boolean(connectRow?.stripe_account_id),
        chargesEnabled: Boolean(connectRow?.charges_enabled),
        detailsSubmitted: Boolean(connectRow?.details_submitted),
      },
      clientBilling: { lapsed, expiringSoon, active: (csubs.results ?? []).length },
    });
  })

  // Stripe Billing Portal — the owner manages card / invoices / cancel there.
  .post("/billing/portal", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const cfg = await stripeConfig(c.env.DB);
    if (!stripeEnabled(cfg)) return c.json({ error: "stripe not configured" }, 400);
    const body = z.object({ returnUrl: z.string().url() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const sub = await getSubscription(c.env.DB, who.tenantId);
    if (!sub.stripe_customer_id) return c.json({ error: "no billing account yet" }, 409);
    const session = await stripeCall<{ url: string }>(cfg.secretKey, "billing_portal/sessions", {
      customer: sub.stripe_customer_id,
      return_url: body.data.returnUrl,
    });
    return c.json({ url: session.url });
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

  // ── Plan builder: edit any plan's full entitlement matrix ──────────────────
  .get("/admin/plans", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await seedBilling(c.env.DB);
    const rows = await c.env.DB.prepare("SELECT * FROM plans ORDER BY ord").all<{ id: string; name: string; price_usd_month: number; entitlements_json: string | null; active: number; ord: number }>();
    const counts = await c.env.DB.prepare("SELECT plan_id, COUNT(*) AS n FROM subscriptions WHERE status = 'active' GROUP BY plan_id").all<{ plan_id: string; n: number }>();
    const countMap = new Map((counts.results ?? []).map((r) => [r.plan_id, r.n]));
    return c.json({
      plans: (rows.results ?? []).map((p) => ({ id: p.id, name: p.name, priceUsdMonth: p.price_usd_month, active: p.active, ord: p.ord, entitlements: resolveEntitlements(p.entitlements_json), tenantCount: countMap.get(p.id) ?? 0 })),
      featureKeys: FEATURE_KEYS, quotaKeys: QUOTA_KEYS, featureMeta: FEATURE_META, quotaMeta: QUOTA_META,
    });
  })

  // Edit a plan. Lowering a limit / disabling a feature grandfathers existing
  // tenants (snapshot the old level into their grant-only override); new tenants
  // get the new plan. Raising / enabling auto-applies to everyone at read time.
  .patch("/admin/plans/:id", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const body = z
      .object({
        name: z.string().max(60).optional(),
        priceUsdMonth: z.number().min(0).optional(),
        active: z.boolean().optional(),
        entitlements: z.object({
          quotas: z.record(z.string(), z.number()).default({}),
          features: z.record(z.string(), z.boolean()).default({}),
          aiCredits: z.object({ monthlyGrant: z.number().min(0) }).default({ monthlyGrant: 0 }),
        }).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    await seedBilling(c.env.DB);
    const id = c.req.param("id");
    const plan = await c.env.DB.prepare("SELECT entitlements_json FROM plans WHERE id = ?").bind(id).first<{ entitlements_json: string | null }>();
    if (!plan) return c.json({ error: "unknown plan" }, 404);

    let entJson = plan.entitlements_json;
    let grandfathered = 0;
    if (body.data.entitlements) {
      const oldEnt = resolveEntitlements(plan.entitlements_json);
      const newEnt = resolveEntitlements(JSON.stringify(body.data.entitlements));
      entJson = JSON.stringify(newEnt);
      const grants = snapshotDowngrade(oldEnt, newEnt);
      if (Object.keys(grants).length) {
        const subs = await c.env.DB.prepare("SELECT tenant_id, overrides_json FROM subscriptions WHERE plan_id = ? AND status = 'active'").bind(id).all<{ tenant_id: string; overrides_json: string | null }>();
        const stmts = (subs.results ?? []).map((s) =>
          c.env.DB.prepare("UPDATE subscriptions SET overrides_json = ?, updated_at = ? WHERE tenant_id = ?").bind(raiseOverride(s.overrides_json, grants), nowIso(), s.tenant_id),
        );
        if (stmts.length) await c.env.DB.batch(stmts);
        grandfathered = stmts.length;
      }
    }
    const sets: string[] = ["entitlements_json = ?"]; const binds: unknown[] = [entJson];
    if (body.data.name !== undefined) (sets.push("name = ?"), binds.push(body.data.name));
    if (body.data.priceUsdMonth !== undefined) (sets.push("price_usd_month = ?"), binds.push(body.data.priceUsdMonth));
    if (body.data.active !== undefined) (sets.push("active = ?"), binds.push(body.data.active ? 1 : 0));
    await c.env.DB.prepare(`UPDATE plans SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
    return c.json({ ok: true, grandfathered });
  })

  // ── Per-tenant gifting (grant-only): raise limits / unlock features ─────────
  .get("/admin/tenants/:id/entitlements", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const tenantId = c.req.param("id");
    const sub = await getSubscription(c.env.DB, tenantId);
    const plan = await c.env.DB.prepare("SELECT entitlements_json FROM plans WHERE id = ?").bind(sub.plan_id).first<{ entitlements_json: string | null }>();
    const planEnt = resolveEntitlements(plan?.entitlements_json);
    return c.json({
      planId: sub.plan_id,
      planEntitlements: planEnt,
      effective: mergeOverrides(planEnt, sub.overrides_json),
      overrides: sub.overrides_json ? JSON.parse(sub.overrides_json) : {},
      featureKeys: FEATURE_KEYS, quotaKeys: QUOTA_KEYS, featureMeta: FEATURE_META, quotaMeta: QUOTA_META,
    });
  })

  .patch("/admin/tenants/:id/overrides", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const body = z
      .object({
        reset: z.boolean().optional(),
        grants: z.object({
          quotas: z.record(z.string(), z.number()).optional(),
          features: z.record(z.string(), z.boolean()).optional(),
          aiCredits: z.object({ monthlyGrant: z.number().min(0) }).optional(),
        }).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const tenantId = c.req.param("id");
    const sub = await getSubscription(c.env.DB, tenantId);
    // Reset clears gifts back to the plan; otherwise grants raise/enable only.
    const newOverride = body.data.reset ? null : raiseOverride(sub.overrides_json, (body.data.grants ?? {}) as EntitlementGrants);
    await c.env.DB.prepare("UPDATE subscriptions SET overrides_json = ?, updated_at = ? WHERE tenant_id = ?").bind(newOverride, nowIso(), tenantId).run();
    const plan = await c.env.DB.prepare("SELECT entitlements_json FROM plans WHERE id = ?").bind(sub.plan_id).first<{ entitlements_json: string | null }>();
    return c.json({ ok: true, effective: mergeOverrides(resolveEntitlements(plan?.entitlements_json), newOverride) });
  })

  .get("/admin/whoami", (c) => c.json({ admin: isPlatformAdmin(c), email: c.get("user")?.email }));
