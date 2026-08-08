/**
 * WORKSPACE ONBOARDING — the two server calls the first-run wizard needs, and
 * the one reason they cannot live in `billing-routes.ts`.
 *
 * Every `/api/billing*` path sits behind the route guard's TENANT gate plus
 * `billing:["read"|"manage"]`, so it is unreachable for exactly the caller
 * onboarding is about: signed in, on the setup door, with no workspace yet. The
 * guard has one authenticated lane that does not demand a tenancy —
 * `isPersonal`, which is `/api/me` and everything under `/api/me/` — hence the
 * `/me/onboarding/...` prefix. That lane runs NO action gate, so every handler
 * here does its own authorization rather than inferring it from the path.
 *
 * ── Selecting a plan never GRANTS it ─────────────────────────────────────────
 *
 * `POST /me/onboarding/plan` writes `subscriptions.pending_plan_id` and nothing
 * else. `plan_id` and `status` are stamped by exactly one thing — the Stripe
 * webhook in `stripe.ts` — which is what makes the degrade path below safe to be
 * permissive about. An owner who picks Pro and never completes Checkout sits on
 * the `free` parking row, gated read-only by `statusOf`, not on Pro.
 *
 * ── Why the checkout session is minted HERE ──────────────────────────────────
 *
 * Scena's rail is Stripe HOSTED Checkout (a redirect), not Kova's inline
 * PaymentSheet. `/api/billing/change-plan` already mints one, but its return
 * URLs are `${origin}/billing?checkout=…` — and during onboarding the origin is
 * the SETUP door, which is nobody's workspace. The owner would come back from a
 * successful payment to a wizard for a workspace they had already finished
 * creating. So onboarding builds its own session, with `success` pointing at the
 * workspace's canonical host and `cancel` back at the wizard.
 */

import { Hono } from "hono";
import { z } from "zod";
import { nowIso } from "@4dl/core";
import type { Env } from "./env.js";
import type { AppContext, AppEnv } from "./auth-context.js";
import { isPlatformAdmin, requireTenant } from "./auth-context.js";
import { getSubscription, listPlans, type PlanRow } from "./billing-store.js";
import { resolveEntitlements } from "./entitlements.js";
import { canonicalHost } from "./host-context.js";
import { stripeCfg, stripeEnabled, subscriptionCheckout } from "./stripe.js";

/**
 * The picker's view of one plan.
 *
 * DERIVED, never the raw row. `plans` carries `stripe_product_id` /
 * `stripe_price_id`, and `entitlements_json` carries admin-editable internals —
 * neither belongs on a pre-tenant endpoint, and no credential of any kind is
 * returned by this router.
 *
 * `entitlements` IS shipped whole, because the client renders the same
 * "what you get" lines the billing screen does, from `@scena/manifest`'s
 * FEATURE_CATALOG/QUOTA_CATALOG. Deriving the strings server-side would put
 * Scena's product copy in two places that could disagree.
 */
export interface OnboardingPlanCard {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  trialDays: number;
  entitlementsJson: string;
}

const planCard = (p: PlanRow): OnboardingPlanCard => ({
  id: p.id,
  name: p.name,
  priceCents: p.price_cents,
  interval: p.interval,
  trialDays: resolveEntitlements(p.entitlements_json).trialDays,
  entitlementsJson: p.entitlements_json,
});

export const onboardingRoutes = new Hono<AppEnv>()
  /**
   * The plan picker's feed. Session required, tenancy NOT required — this is
   * what step 2 renders before the workspace exists.
   *
   * `listPlans(db, true)` is `active = 1 AND price_cents > 0`, so the `free`
   * parking row can never be offered here. That filter is this endpoint's whole
   * contract and `onboarding.test.ts` pins it.
   */
  .get("/me/onboarding/plans", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const [plans, cfg] = await Promise.all([listPlans(c.env.DB, true), stripeCfg(c.env).catch(() => null)]);

    // Resuming: when the caller already has a workspace (they created it and
    // then abandoned the card step), tell the picker where they left off so the
    // chosen plan comes back preselected rather than blank.
    const tenantId = c.get("tenantId");
    let current: { planId: string; pendingPlanId: string | null; status: string } | null = null;
    if (tenantId) {
      const sub = await getSubscription(c.env.DB, tenantId).catch(() => null);
      if (sub) current = { planId: sub.plan_id, pendingPlanId: sub.pending_plan_id, status: sub.status };
    }

    return c.json({
      plans: plans.map(planCard),
      /** False on a deployment with no Stripe keys — drives the degrade path. */
      stripeEnabled: cfg ? stripeEnabled(cfg) : false,
      hasTenant: Boolean(tenantId),
      current,
    });
  })

  /**
   * Record the owner's choice and hand back a Checkout URL.
   *
   * Two lanes, one write:
   *
   *  • Stripe configured → `pending_plan_id` is recorded and a Checkout session
   *    is minted with the plan's trial. The webhook stamps `plan_id`/`status`
   *    when payment (or the trial's setup) completes.
   *  • Stripe NOT configured → there is no session to be had, and refusing here
   *    would mean **nobody can ever create a workspace** on a self-host or before
   *    `apps/scena/DEPLOY.md`'s Stripe step. The choice is recorded, `pending` is
   *    returned, and the owner is let through onto the `free` baseline — which
   *    `statusOf` deliberately does NOT gate on a deployment that cannot charge.
   *    Nothing here can grant entitlements; only the webhook can.
   */
  .post("/me/onboarding/plan", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const who = requireTenant(c);
    // 409, not 401/403: the request is well-formed and authorized, the workspace
    // just does not exist yet. The wizard creates it and retries.
    if (!who) return c.json({ error: "no_tenant" }, 409);
    // This lane runs no action gate (see the header), so the owner check is here.
    // `billing:["manage"]` is structurally owner-only, so `role === "owner"` is
    // the same boundary every `/api/billing` mutation sits behind.
    if (c.get("role") !== "owner" && !isPlatformAdmin(c as unknown as AppContext)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = z.object({ planId: z.string().max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    // Resolved through the SELLABLE list, so a retired or grandfathered id is
    // rejected here exactly as it is on every other purchase path.
    const plans = await listPlans(c.env.DB, true);
    const plan = plans.find((p) => p.id === body.data.planId);
    if (!plan) return c.json({ error: "unknown_plan" }, 400);

    const trialDays = resolveEntitlements(plan.entitlements_json).trialDays;

    // Make sure the row exists before UPDATE-ing it — a brand-new workspace has
    // none until something reads it.
    await getSubscription(c.env.DB, who.tenantId);
    await c.env.DB.prepare("UPDATE subscriptions SET pending_plan_id = ?, updated_at = ? WHERE tenant_id = ?")
      .bind(plan.id, Date.now(), who.tenantId)
      .run();

    const cfg = await stripeCfg(c.env).catch(() => null);
    if (!cfg || !stripeEnabled(cfg)) {
      return c.json({ ok: true, planId: plan.id, planName: plan.name, trialDays, stripeEnabled: false, billing: "pending" });
    }

    /*
      Where Checkout returns to. `success` is the WORKSPACE, not this door: the
      owner is finished, and the setup door has nothing more to show them. The
      cookie is issued for the whole root, so the hop carries the session.

      `canonicalHost` can fail on a workspace whose subdomain row has not landed
      yet; falling back to this origin keeps a completed payment from returning
      to a dead URL, and the wizard's own success state handles it from there.
    */
    const origin = new URL(c.req.url).origin;
    const home = await canonicalHost(c.env as unknown as Env, c.env.DB, who.tenantId)
      .then((h) => `https://${h}/?welcome=1`)
      .catch(() => `${origin}/?welcome=1`);
    try {
      const { url } = await subscriptionCheckout(
        c.env as unknown as Env,
        plan.id,
        { success: home, cancel: `${origin}/?checkout=cancel` },
        who.tenantId,
        trialDays,
      );
      return c.json({ ok: true, planId: plan.id, planName: plan.name, trialDays, stripeEnabled: true, billing: "checkout", checkoutUrl: url });
    } catch (e) {
      /*
        A configured Stripe that could not mint a session — an unsynced price, a
        network failure, a revoked key. Degrade rather than block: the workspace
        exists and the choice is recorded, so the owner reaches a working product
        and can finish from Billing. Reported (`detail`) rather than swallowed,
        because "we could not start your subscription" and "payments are off
        here" are different sentences to read.
      */
      return c.json({
        ok: true,
        planId: plan.id,
        planName: plan.name,
        trialDays,
        stripeEnabled: true,
        billing: "pending",
        detail: e instanceof Error ? e.message : "checkout unavailable",
        at: nowIso(),
      });
    }
  });
