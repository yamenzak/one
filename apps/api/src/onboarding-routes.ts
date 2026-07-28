/**
 * Tenant onboarding (SPEC §5) — the two server calls the first-run studio wizard
 * needs, and the ONE reason they can't live in `billing-routes.ts`:
 *
 * `GET /api/billing` (and every other `/api/billing*` path) runs behind
 * `requireTenant` + `billing:["read"]` in `route-guard.ts`, so it is unreachable
 * for exactly the caller onboarding is about — signed in, no tenant yet. The
 * guard has one authenticated lane that does NOT demand a tenant:
 *
 *   if (path === "/api/context" || path === "/api/context/switch"
 *       || path.startsWith("/api/me/") || path.startsWith("/api/inbox/")) {
 *     if (!c.get("user")) return 401; return next();
 *   }
 *
 * Hence the `/me/onboarding/...` prefix: personal, pre-tenant, session-only. That
 * lane runs NO action gate, so every handler here does its own authorization —
 * `plan` requires a tenant AND the owner role (or platform admin), checked in the
 * handler rather than assumed from the path.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────────
 *
 * Selecting a plan never grants it. This endpoint records the CHOICE
 * (`subscriptions.pending_plan_id`) and nothing else: `plan_id`/`status` are left
 * alone, so an owner who picks Max and never enters a card sits on the implicit
 * free baseline, not on Max. The paid plan is stamped by exactly one thing — the
 * Stripe webhook (`customer.subscription.updated` → active) in `stripe-routes.ts`.
 * That is what makes the "Stripe unconfigured" degrade path safe to be permissive
 * about (see the comment on `/me/onboarding/plan`).
 */

import { Hono } from "hono";
import { z } from "zod";
import { FEATURE_KEYS, FEATURE_META, resolveEntitlements } from "@kova/domain";
import { type AppEnv, isPlatformAdmin, requireTenant } from "./auth-context.js";
import { getSubscription, listPlans, seedBilling, type PlanRow } from "./billing-store.js";
import { stripeConfig, stripeEnabled } from "./stripe.js";
import { nowIso } from "./ids.js";

/**
 * The picker's view of one plan. Derived, never the raw row: `entitlements_json`
 * carries admin-editable internals and the row carries `stripe_product_id` /
 * `stripe_price_id`. Neither belongs on a pre-tenant endpoint, and no credential
 * of any kind is returned by this router (the publishable key comes later, from
 * `plan-intent`, once there is a tenant and a real intent to pay).
 */
export interface PlanCard {
  id: string;
  name: string;
  priceUsdMonth: number;
  trialDays: number;
  limits: { staffSeats: number; activeClients: number; templates: number; storageMb: number; monthlyCredits: number };
  /** Non-reserved feature keys the plan switches on — the headline "what you get".
   *  `reserved: true` features (chat, integrations) are filtered out: they are
   *  declared but unimplemented, and this list is read as a promise. */
  features: string[];
}

function planCard(p: PlanRow): PlanCard {
  const ent = resolveEntitlements(p.entitlements_json);
  return {
    id: p.id,
    name: p.name,
    priceUsdMonth: p.price_usd_month,
    trialDays: ent.trialDays,
    limits: {
      staffSeats: ent.quotas.staffSeats,
      activeClients: ent.quotas.activeClients,
      templates: ent.quotas.templates,
      storageMb: ent.quotas.storageMb,
      monthlyCredits: ent.aiCredits.monthlyGrant,
    },
    features: FEATURE_KEYS.filter((k) => ent.features[k] && !FEATURE_META[k]?.reserved),
  };
}

export const onboardingRoutes = new Hono<AppEnv>()
  /**
   * The plan picker's feed. Session required, tenant NOT required — this is what
   * step 2 of the wizard renders before the studio even exists.
   *
   * `listPlans` filters `active = 1`, so the retired `free`/`studio`/`team` rows
   * can never be offered here. That filter is the whole contract of this endpoint
   * and `onboarding.test.ts` pins it.
   */
  .get("/me/onboarding/plans", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    // A brand-new deployment may not have seeded the catalog yet (the /context
    // bootstrap normally does it, but the wizard can be deep-linked).
    await seedBilling(c.env.DB).catch(() => undefined);
    const [plans, cfg] = await Promise.all([listPlans(c.env.DB), stripeConfig(c.env.DB)]);

    // When the caller already has a tenant (resuming after the studio was created,
    // or a half-finished onboarding), tell the picker where it left off so the
    // chosen plan comes back preselected instead of blank.
    const tenantId = c.get("tenantId");
    let current: { planId: string; pendingPlanId: string | null; status: string } | null = null;
    if (tenantId) {
      const sub = await getSubscription(c.env.DB, tenantId).catch(() => null);
      if (sub) current = { planId: sub.plan_id, pendingPlanId: sub.pending_plan_id, status: sub.status };
    }

    return c.json({
      plans: plans.map(planCard),
      /** False on a fresh deploy with no Stripe keys — drives the degrade path. */
      stripeEnabled: stripeEnabled(cfg),
      hasTenant: Boolean(tenantId),
      current,
    });
  })

  /**
   * Record the owner's plan choice for their (already created) studio.
   *
   * Writes `pending_plan_id` ONLY. Two callers, one write:
   *
   *  • Stripe configured → the wizard immediately posts `/billing/plan-intent`
   *    and confirms a SetupIntent (trial) or PaymentIntent inline. The webhook
   *    stamps `plan_id`. The `pending_plan_id` written here is then just a
   *    breadcrumb: if the card step is abandoned, `GET /billing` still reports
   *    which plan they were part-way through choosing.
   *  • Stripe NOT configured (fresh deploy, no keys) → there is no client secret
   *    to be had, and refusing here would mean **nobody can ever create a
   *    studio** — the same bootstrap deadlock class as the OTP one. So the choice
   *    is recorded, `billing: "pending"` is returned, and the owner is let through
   *    onto the free baseline. They get a working studio with free-tier
   *    entitlements and an explicit "billing pending" state — never the paid plan
   *    they picked. Nothing here can grant entitlements; only the webhook can.
   */
  .post("/me/onboarding/plan", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const who = requireTenant(c);
    // 409, not 401/403: the request is well-formed and authorized, the studio just
    // doesn't exist yet. The wizard creates it and retries.
    if (!who) return c.json({ error: "no_tenant" }, 409);
    // This lane runs no action gate (see the header), so the owner check is here.
    // `billing:["manage"]` is structurally owner-only (intersectGrant caps custom
    // grants at the role preset), so role === "owner" is the same boundary the
    // /api/billing mutations sit behind.
    if (c.get("role") !== "owner" && !isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);

    const body = z.object({ planId: z.string().max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    // Resolved through `listPlans` (active only) — so a retired/grandfathered id
    // is rejected here exactly as it is on every other purchase path. Seed first:
    // on a brand-new deployment the catalog may not exist yet, and an empty
    // `plans` table would reject every legitimate choice as `unknown_plan`
    // (fast path is one indexed lookup of the version stamp).
    await seedBilling(c.env.DB).catch(() => undefined);
    const plans = await listPlans(c.env.DB);
    const plan = plans.find((p) => p.id === body.data.planId);
    if (!plan) return c.json({ error: "unknown_plan" }, 400);

    const cfg = await stripeConfig(c.env.DB);
    const enabled = stripeEnabled(cfg);

    // Make sure the row exists before UPDATE-ing it (a brand-new tenant has none
    // until something reads it).
    await getSubscription(c.env.DB, who.tenantId);
    await c.env.DB.prepare("UPDATE subscriptions SET pending_plan_id = ?, updated_at = ? WHERE tenant_id = ?")
      .bind(plan.id, nowIso(), who.tenantId)
      .run();

    const ent = resolveEntitlements(plan.entitlements_json);
    return c.json({
      ok: true,
      planId: plan.id,
      planName: plan.name,
      trialDays: ent.trialDays,
      stripeEnabled: enabled,
      /** `"checkout"` ⇒ go get a client secret from `/billing/plan-intent`.
       *  `"pending"` ⇒ nothing to pay against; the studio stays on free. */
      billing: enabled ? "checkout" : "pending",
    });
  });
