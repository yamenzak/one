/**
 * CENTRE ONBOARDING — the two server calls the first-run wizard needs.
 *
 * Same shape, same reasoning and the same `/me/onboarding/...` prefix as Scena's
 * (`apps/scena/src/onboarding-routes.ts`) and Kova's
 * (`apps/api/src/onboarding-routes.ts`), because it is the same problem in all
 * three: every `/api/billing*` path sits behind the route guard's TENANT gate,
 * and onboarding is by definition the caller who has no tenant yet. `isPersonal`
 * is the one authenticated lane that does not demand one. That lane runs NO
 * action gate, so both handlers authorize themselves.
 *
 * ── Why a plan step at all, with one plan ────────────────────────────────────
 *
 * Tessa sells exactly one — Practice, $39, 14 days free. A picker with one row
 * is a question with one answer, and the temptation is to skip it and create the
 * centre straight away. That is what the old two-field form did, and it is the
 * reason a brand-new centre landed on the `free` parking row, which `statusOf`
 * gates READ-ONLY: a product where every write is refused, on the first screen,
 * with no explanation.
 *
 * So the step stays. It is where the price and the trial are stated before
 * anything is created, it is where the Checkout session is minted, and it stays
 * correct on the day there is a second plan.
 *
 * ── Selecting a plan never GRANTS it ─────────────────────────────────────────
 *
 * This writes `subscriptions.pending_plan_id` and nothing else. `plan_id` and
 * `status` are stamped by the Stripe webhook alone — see `billing-routes.ts`'s
 * four traps, particularly (2): `trialing` without a payment method is not a
 * paid-for plan.
 */

import { Hono } from "hono";
import { z } from "zod";
import { nowIso } from "@4dl/core";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import { entitlements } from "./entitlements.js";
import { ensureSubscription, getSubscription, listPlans, seedBilling } from "./billing-store.js";
import { ensureCustomer, stripeCall, stripeConfig, stripeEnabled, TESSA_APP } from "./stripe.js";

export const onboardingRoutes = new Hono<AppEnv>()
  /**
   * The plan picker's feed. Session required, tenancy NOT required.
   *
   * `active = 1 AND price_usd_month > 0` — the `free` parking row and every
   * retired plan are unofferable here by construction.
   */
  .get("/me/onboarding/plans", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    // A brand-new deployment may not have seeded the catalog yet; the wizard can
    // be reached before anything else has read it.
    await seedBilling(c.env.DB).catch(() => undefined);
    const [rows, cfg] = await Promise.all([listPlans(c.env.DB), stripeConfig(c.env).catch(() => null)]);
    const plans = rows
      .filter((p) => p.active === 1 && p.price_usd_month > 0)
      .map((p) => {
        const ent = entitlements.resolve(p.entitlements_json);
        return {
          id: p.id,
          name: p.name,
          priceUsdMonth: p.price_usd_month,
          trialDays: ent.trialDays,
          entitlements: ent,
        };
      });

    const tenantId = c.get("tenantId");
    let current: { planId: string; pendingPlanId: string | null; status: string } | null = null;
    if (tenantId) {
      const sub = await getSubscription(c.env.DB, tenantId).catch(() => null);
      if (sub) current = { planId: sub.plan_id, pendingPlanId: sub.pending_plan_id ?? null, status: sub.status };
    }

    return c.json({ plans, stripeEnabled: cfg ? stripeEnabled(cfg) : false, hasTenant: Boolean(tenantId), current });
  })

  /**
   * Record the owner's choice and hand back a Checkout URL.
   *
   * **The degrade rule.** With no Stripe keys there is no session to be had, and
   * refusing here would mean nobody can ever create a centre on a self-host or
   * before the deploy guide's Stripe step. The choice is recorded, `pending` is
   * returned, and the owner is let through onto the free baseline — which
   * `statusOf` deliberately does not gate on a deployment that cannot charge.
   */
  .post("/me/onboarding/plan", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const who = requireTenant(c);
    // 409, not 403: authorized and well-formed, the centre just does not exist
    // yet. The wizard creates it and retries.
    if (!who) return c.json({ error: "no_tenant" }, 409);
    if (c.get("role") !== "owner" && !isPlatformAdmin(c as never)) return c.json({ error: "forbidden" }, 403);

    const body = z
      .object({ planId: z.string().max(64), returnUrl: z.string().url() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    await seedBilling(c.env.DB).catch(() => undefined);
    const plan = (await listPlans(c.env.DB)).find(
      (p) => p.id === body.data.planId && p.active === 1 && p.price_usd_month > 0,
    );
    if (!plan) return c.json({ error: "unknown_plan" }, 400);
    const trialDays = entitlements.resolve(plan.entitlements_json).trialDays;

    await ensureSubscription(c.env.DB, who.tenantId);
    await c.env.DB.prepare("UPDATE subscriptions SET pending_plan_id = ?, updated_at = ? WHERE tenant_id = ?")
      .bind(plan.id, nowIso(), who.tenantId)
      .run();

    const cfg = await stripeConfig(c.env).catch(() => null);
    if (!cfg || !stripeEnabled(cfg) || !plan.stripe_price_id) {
      return c.json({
        ok: true,
        planId: plan.id,
        planName: plan.name,
        trialDays,
        stripeEnabled: Boolean(cfg && stripeEnabled(cfg)),
        billing: "pending",
        // An unsynced price is OUR misconfiguration, not theirs, and it reads
        // very differently from "payments are off here".
        detail: cfg && stripeEnabled(cfg) && !plan.stripe_price_id ? "plan not synced to stripe" : undefined,
      });
    }

    try {
      const customer = await ensureCustomer(c.env.DB, cfg.secretKey, who.tenantId, user.email);
      /*
        Hosted Checkout collects the card BEFORE the subscription exists and
        charges nothing now, so the subscription is born `trialing` with a
        payment method already attached — trap 2 in `billing-routes.ts` is
        satisfied and entitlements are live from minute one.

        `returnUrl` is the CENTRE's address, chosen by the client: the wizard
        runs on the setup door, which is nobody's centre, so returning there
        after a successful payment would land the owner back in a wizard they
        had already finished.
      */
      const session = await stripeCall<{ url: string }>(cfg.secretKey, "checkout/sessions", {
        mode: "subscription",
        customer,
        "line_items[0][price]": plan.stripe_price_id,
        "line_items[0][quantity]": 1,
        success_url: `${body.data.returnUrl}?welcome=1`,
        cancel_url: `${new URL(c.req.url).origin}/?checkout=cancel`,
        "metadata[app]": TESSA_APP,
        "metadata[tessa_tenant]": who.tenantId,
        "metadata[tessa_plan]": plan.id,
        // Session metadata is NOT copied down to the subscription, so without
        // these the `trialing` subscription's own events cannot name the plan.
        "subscription_data[metadata][app]": TESSA_APP,
        "subscription_data[metadata][tessa_tenant]": who.tenantId,
        "subscription_data[metadata][tessa_plan]": plan.id,
        ...(trialDays ? { "subscription_data[trial_period_days]": String(trialDays) } : {}),
      });
      return c.json({ ok: true, planId: plan.id, planName: plan.name, trialDays, stripeEnabled: true, billing: "checkout", checkoutUrl: session.url });
    } catch (e) {
      return c.json({
        ok: true,
        planId: plan.id,
        planName: plan.name,
        trialDays,
        stripeEnabled: true,
        billing: "pending",
        detail: e instanceof Error ? e.message : "checkout unavailable",
      });
    }
  });
