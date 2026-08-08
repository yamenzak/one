/**
 * Platform billing routes (SPEC §5, §6) — the owner's Business surface and
 * the platform-admin lane. Stripe checkout on this rail arrives with the
 * commerce phase; until then plan changes are free-tier/comp (admin) only.
 */

import { Hono } from "hono";
import { emailAdminRoutes } from "@4dl/email/admin-routes";
import { z } from "zod";
import {
  checkDowngrade, resolveEntitlements, mergeOverrides, snapshotDowngrade, raiseOverride,
  setEntitlementAdjustment, explainEntitlements,
  isFullyExpired, overallDaysRemaining, resolveRange, addDays,
  FEATURE_KEYS, QUOTA_KEYS, FEATURE_META, QUOTA_META, type Entitlements, type EntitlementGrants, type Budget,
} from "@kova/domain";
import { describeReason, KIND_LABEL, type CreditKind } from "./credit-reasons.js";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import { tenantStorageBytes } from "./storage.js";
import { countClientSeats } from "./clients.js";
import {
  getPlan,
  getSubscription,
  listPacks,
  listPlans,
  seedBilling,
  tenantEntitlements,
  getConfig,
  setConfig,
} from "./billing-store.js";
import { stripeConfig, stripeEnabled, stripeCall } from "./stripe.js";
import { PLATFORM_FROM_DEFAULT } from "./mailer.js";
import { newId, nowIso, periodKey } from "./ids.js";
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
    // The tenant's OWN plan is resolved by id, not from the active-only picker —
    // a tenant grandfathered on a retired tier must still see its real name
    // instead of the raw id. `plans` below stays active-only: retired tiers are
    // never offered as a choice to anyone.
    const plan = plans.find((p) => p.id === sub.plan_id) ?? (await getPlan(c.env.DB, sub.plan_id));
    // The plan the owner PICKED but never finished paying for. Resolved through
    // getPlan (not the active-only list) so a retired id still renders a name.
    const pendingPlan = sub.pending_plan_id ? await getPlan(c.env.DB, sub.pending_plan_id) : null;

    // The tenant's own client-delinquency roll-up, so the owner's Business
    // surface can flag lapsing clients.
    //
    // There is no `connect` block any more: a studio is paid on its OWN provider
    // and the platform holds no account for it to report on. Its setup lives on
    // `/api/payments/settings`, which is that provider's business and not this
    // endpoint's — this one describes the studio's standing with US.
    const cfg = await stripeConfig(c.env);
    const csubs = await c.env.DB.prepare("SELECT budgets_json FROM subject_subscriptions WHERE tenant_id = ? AND status IN ('active','paused')").bind(who.tenantId).all<{ budgets_json: string | null }>();
    const now = nowIso();
    let lapsed = 0, expiringSoon = 0;
    for (const r of csubs.results ?? []) {
      const budgets = parseJson<Budget[]>(r.budgets_json, []);
      if (!budgets.length) continue;
      if (isFullyExpired(budgets, now)) lapsed++;
      else if (overallDaysRemaining(budgets, now) <= 7) expiringSoon++;
    }

    // ── Is this studio actually paying for anything? ──────────────────────────
    // Derived server-side, once, because two surfaces (the owner banner in
    // Shell.tsx and the Business overview) must not drift apart, and because
    // `status` alone lies: a brand-new tenant is `plan_id: 'free', status:
    // 'active'`, which reads as a healthy subscription and is exactly how the
    // trialing-without-a-card bug stayed invisible.
    const paidPlan = (plan?.price_usd_month ?? 0) > 0;
    const dunning = ["past_due", "unpaid", "suspended", "canceled"].includes(sub.status);
    const billingState: "comp" | "active" | "trialing" | "delinquent" | "pending" | "none" = sub.comp
      ? "comp"
      : paidPlan && !dunning
        ? sub.status === "trialing"
          ? "trialing"
          : "active"
        : paidPlan
          ? "delinquent"
          : sub.pending_plan_id
            ? "pending"
            : "none";
    // What the free baseline actually costs them, straight off the effective
    // entitlements so the copy can't drift from what's enforced. Reserved
    // (unreleased) features are excluded — they're off for everyone.
    const lockedFeatures = FEATURE_KEYS.filter((k) => !FEATURE_META[k]?.reserved && !entitlements.features[k]).map((k) => FEATURE_META[k]?.label ?? k);

    return c.json({
      subscription: {
        planId: sub.plan_id,
        planName: plan?.name ?? sub.plan_id,
        status: sub.status,
        comp: Boolean(sub.comp),
        currentPeriodEnd: sub.current_period_end,
        pendingPlanId: sub.pending_plan_id,
        pendingPlanName: pendingPlan?.name ?? sub.pending_plan_id,
        /** True when Kova is billing this tenant for a priced plan. */
        paidPlan,
        /** The one honest name for the tenant's billing situation. */
        billingState,
      },
      /** Everything the "you have no subscription" notice needs to be specific. */
      baseline: {
        lockedFeatures,
        activeClientLimit: entitlements.quotas.activeClients,
        monthlyCredits: entitlements.aiCredits.monthlyGrant,
      },
      balance,
      // Named on the way out, not in the browser: the AI half of the reason set
      // is `ai.<feature>` over a registry only this worker holds.
      ledger: ledger.map((e) => ({ ...e, ...describeReason(e.reason) })),
      plans: plans.map((p) => {
        const ent = resolveEntitlements(p.entitlements_json);
        // `trialDays` is surfaced alongside the price so the picker can say
        // "30 days free" before the owner ever enters a card.
        return { id: p.id, name: p.name, priceUsdMonth: p.price_usd_month, entitlements: ent, trialDays: ent.trialDays };
      }),
      packs,
      entitlements,
      stripeEnabled: stripeEnabled(cfg),
      // Publishable key drives the inline Payment Element (safe to expose).
      publishableKey: cfg.publishableKey || null,
      clientBilling: { lapsed, expiringSoon, active: (csubs.results ?? []).length },
    });
  })

  /**
   * The whole credit history, over a window — the "see all" behind Business's
   * eight-row activity strip.
   *
   * Reads D1's `credit_ledger` MIRROR rather than the Durable Object: the DO
   * keeps only the last `LEDGER_CAP` movements, which is the right thing for a
   * balance and useless for a report. The DO stays authoritative for the
   * BALANCE (that is what `/billing` returns); this endpoint is history, and
   * history is what the mirror exists for.
   *
   * `tz` is the client's offset from UTC in minutes, so the daily buckets are
   * the studio's days and not Greenwich's. Every other analytics route on this
   * app takes a `today` in the device's local date for the same reason; a
   * ledger row only has an epoch, so the offset has to come across instead.
   */
  .get("/billing/credits", async (c) => {
    const who = requireTenant(c)!;
    const q = c.req.query();
    const today = /^\d{4}-\d{2}-\d{2}$/.test(q.today ?? "") ? q.today! : nowIso().slice(0, 10);
    const { start, end } = resolveRange({ range: q.range, start: q.start, end: q.end }, today);
    // Clamped, not trusted: a bogus `tz` would silently shift every bucket.
    const tzRaw = Number(q.tz);
    const tz = Number.isFinite(tzRaw) ? Math.max(-840, Math.min(840, Math.round(tzRaw))) : 0;
    const shift = tz * 60; // seconds

    // The window in epoch ms, in the client's zone: [start 00:00, end 24:00).
    const from = Date.parse(`${start}T00:00:00Z`) - tz * 60_000;
    const to = Date.parse(`${end}T00:00:00Z`) - tz * 60_000 + 86_400_000;

    const rows = await c.env.DB.prepare(
      `SELECT delta, balance, reason, ref, at,
              date((at / 1000) + ?, 'unixepoch') AS day
       FROM credit_ledger
       WHERE tenant_id = ? AND at >= ? AND at < ?
       ORDER BY at DESC`,
    )
      .bind(shift, who.tenantId, from, to)
      .all<{ delta: number; balance: number; reason: string; ref: string | null; at: number; day: string }>();
    const all = rows.results ?? [];

    // ── Roll-ups, computed once, over the WHOLE window ────────────────────────
    // `entries` below is capped for the wire; the totals and the chart are not,
    // or a busy studio would read a chart of its most recent page rather than
    // of the range it asked for.
    const byDay = new Map<string, { spent: number; added: number }>();
    const byReason = new Map<string, { reason: string; label: string; kind: CreditKind; credits: number; count: number }>();
    const byKind = new Map<CreditKind, { kind: CreditKind; label: string; credits: number; count: number }>();
    let spent = 0, added = 0;

    for (const r of all) {
      const d = byDay.get(r.day) ?? { spent: 0, added: 0 };
      if (r.delta < 0) { d.spent += -r.delta; spent += -r.delta; } else { d.added += r.delta; added += r.delta; }
      byDay.set(r.day, d);
      // Only SPEND is bucketed by reason: mixing a 5,000-credit monthly grant
      // into "where did my credits go" makes the one line nobody is asking
      // about the biggest bar on the screen.
      if (r.delta >= 0) continue;
      const { label, kind } = describeReason(r.reason);
      const br = byReason.get(r.reason) ?? { reason: r.reason, label, kind, credits: 0, count: 0 };
      br.credits += -r.delta; br.count += 1;
      byReason.set(r.reason, br);
      const bk = byKind.get(kind) ?? { kind, label: KIND_LABEL[kind], credits: 0, count: 0 };
      bk.credits += -r.delta; bk.count += 1;
      byKind.set(kind, bk);
    }

    // Every day in the window, zero-filled, oldest first — a chart with holes
    // in it reads as missing data rather than as a quiet week.
    const daily: { date: string; spent: number; added: number }[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const v = byDay.get(d) ?? { spent: 0, added: 0 };
      daily.push({ date: d, spent: v.spent, added: v.added });
    }

    const dobj = billingDO(c, who.tenantId);
    await dobj.bind(who.tenantId);

    return c.json({
      window: { start, end, days: daily.length },
      balance: await dobj.view(),
      totals: { spent, added, net: added - spent, movements: all.length },
      daily,
      byKind: [...byKind.values()].sort((a, b) => b.credits - a.credits),
      byReason: [...byReason.values()].sort((a, b) => b.credits - a.credits),
      entries: all.slice(0, 300).map((r) => {
        const { label, kind } = describeReason(r.reason);
        return { at: r.at, delta: r.delta, balance: r.balance, reason: r.reason, label, kind, ref: r.ref };
      }),
      /** True when the list was cut — the screen says so rather than implying the window was quiet. */
      truncated: all.length > 300,
    });
  })

  // Stripe Billing Portal — the owner manages card / invoices / cancel there.
  .post("/billing/portal", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const cfg = await stripeConfig(c.env);
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
      // The same count the create gate enforces (archived included) — this used
      // to say `status = 'active'`, so the owner was shown a smaller number than
      // the one they were being blocked by.
      activeClients: await countClientSeats(db, who.tenantId),
      templates:
        (await count("SELECT COUNT(*) AS n FROM workout_templates WHERE tenant_id = ?")) +
        (await count("SELECT COUNT(*) AS n FROM meal_templates WHERE tenant_id = ?")),
      storageMb: Math.round((await tenantStorageBytes(db, who.tenantId)) / (1024 * 1024)),
      activeCommerceSubs: await count(
        "SELECT COUNT(*) AS n FROM subject_subscriptions WHERE tenant_id = ? AND status = 'active' AND payment_status IN ('paid','installments')",
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
    // Resolves RETIRED plans too, on purpose: this is the platform-admin
    // comp/support lane, and a tenant grandfathered on `free`/`studio`/`team`
    // must be movable back onto their own tier (or off a mistake). Retired tiers
    // stay unavailable to everyone else — every tenant-facing path
    // (`GET /billing`, `check-downgrade`, `checkout-plan`, `plan-intent`) goes
    // through the active-only `listPlans`.
    const plan = await getPlan(c.env.DB, body.data.planId);
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

  /*
    THE PLAN CATALOG IS `@4dl/billing`'s NOW — `planAdminRoutes`, mounted in
    index.ts beside the other package route trees.

    Both endpoints were here, and their absence in a second app and their
    divergence in a third is the whole argument: changing a price in Tessa meant
    a code edit and a deploy, and Scena's editor had no grandfathering at all, so
    tightening a tier silently stripped capability from every live workspace.

    What moved is the SHAPE — the Stripe-id null-out on a reprice, the
    `snapshotDowngrade` grandfathering, and the rule that an omitted `trialDays`
    means "leave it alone". What stays Kova's is the CONTENTS, which is
    `DEFAULT_PLANS` in billing-store.ts, and the key LABELS in `@kova/domain`.
  */

  // ── Per-tenant gifting (grant-only): raise limits / unlock features ─────────
  .get("/admin/tenants/:id/entitlements", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const tenantId = c.req.param("id");
    const sub = await getSubscription(c.env.DB, tenantId);
    const plan = await c.env.DB.prepare("SELECT entitlements_json FROM plans WHERE id = ?").bind(sub.plan_id).first<{ entitlements_json: string | null }>();
    const planEnt = resolveEntitlements(plan?.entitlements_json);
    // `explain` walks the same three layers the gates resolve through, so the
    // console can say WHY a number is what it is — from the plan, grandfathered
    // by a plan edit, or set by an operator — before anyone changes it.
    const trace = explainEntitlements(planEnt, sub.overrides_json, sub.adjustments_json);
    return c.json({
      planId: sub.plan_id,
      planEntitlements: planEnt,
      effective: trace.effective,
      quotas: trace.quotas, features: trace.features, aiCredits: trace.aiCredits,
      overrides: sub.overrides_json ? JSON.parse(sub.overrides_json) : {},
      adjustments: sub.adjustments_json ? JSON.parse(sub.adjustments_json) : {},
      featureKeys: FEATURE_KEYS, quotaKeys: QUOTA_KEYS, featureMeta: FEATURE_META, quotaMeta: QUOTA_META,
    });
  })

  /**
   * PER-TENANT entitlements, both directions.
   *
   * Two lanes, because they are two different promises and sharing one blob is
   * what made this unusable:
   *
   *   `grants`       raise-only, merged into `overrides_json`. This is the
   *                  GRANDFATHERING lane — what `snapshotDowngrade` writes when
   *                  a plan is edited down — and it must only ratchet, so a
   *                  later operator cannot erode a right a tenant paid for.
   *   `adjustments`  ABSOLUTE, written to `adjustments_json`, applied after the
   *                  grants. `null` on a key clears it back to whatever the plan
   *                  and the grandfathering say.
   *
   * Before the split there was only the first, so "give this studio 10 seats"
   * was irreversible — `raiseOverride` merges with `max`, granting `-1` was
   * permanent, and the only way back was `reset`, which also discarded the
   * grandfathering. That is the complaint this route exists to answer.
   */
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
        /** Absolute. `null` clears one key back to the plan. */
        adjustments: z.object({
          quotas: z.record(z.string(), z.number().nullable()).optional(),
          features: z.record(z.string(), z.boolean().nullable()).optional(),
          aiCredits: z.object({ monthlyGrant: z.number().min(0).nullable() }).optional(),
        }).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body", issues: body.error.issues }, 400);

    // Keys are checked against the registry rather than trusted: an unknown key
    // would be stored, never read, and quietly suggest a setting that does not
    // exist the next time somebody opened this screen.
    const badQuota = [
      ...Object.keys(body.data.grants?.quotas ?? {}), ...Object.keys(body.data.adjustments?.quotas ?? {}),
    ].filter((k) => !(QUOTA_KEYS as readonly string[]).includes(k));
    const badFeature = [
      ...Object.keys(body.data.grants?.features ?? {}), ...Object.keys(body.data.adjustments?.features ?? {}),
    ].filter((k) => !(FEATURE_KEYS as readonly string[]).includes(k));
    if (badQuota.length || badFeature.length) return c.json({ error: "unknown entitlement", quotas: badQuota, features: badFeature }, 400);

    const tenantId = c.req.param("id");
    const sub = await getSubscription(c.env.DB, tenantId);

    /*
      RESET CLEARS BOTH LANES, and it has to say so.

      It used to null `overrides_json` alone, which was the only way down and
      therefore the button an operator reached for to undo a gift — taking the
      grandfathering with it every time, silently. Now that adjustments can be
      cleared one key at a time, reset is the deliberate "this tenant is exactly
      their plan again" and clears the pair.
    */
    let overrides = sub.overrides_json;
    let adjustments = sub.adjustments_json;
    if (body.data.reset) {
      overrides = null;
      adjustments = null;
    } else {
      if (body.data.grants) overrides = raiseOverride(overrides, body.data.grants as EntitlementGrants);
      for (const [k, v] of Object.entries(body.data.adjustments?.quotas ?? {})) adjustments = setEntitlementAdjustment(adjustments, "quotas", k, v);
      for (const [k, v] of Object.entries(body.data.adjustments?.features ?? {})) adjustments = setEntitlementAdjustment(adjustments, "features", k, v);
      const grant = body.data.adjustments?.aiCredits?.monthlyGrant;
      if (grant !== undefined) adjustments = setEntitlementAdjustment(adjustments, "aiCredits", "monthlyGrant", grant);
    }

    await c.env.DB.prepare("UPDATE subscriptions SET overrides_json = ?, adjustments_json = ?, updated_at = ? WHERE tenant_id = ?")
      .bind(overrides, adjustments, nowIso(), tenantId).run();
    const plan = await c.env.DB.prepare("SELECT entitlements_json FROM plans WHERE id = ?").bind(sub.plan_id).first<{ entitlements_json: string | null }>();
    const planEnt = resolveEntitlements(plan?.entitlements_json);
    const trace = explainEntitlements(planEnt, overrides, adjustments);
    return c.json({
      ok: true,
      effective: trace.effective,
      quotas: trace.quotas, features: trace.features, aiCredits: trace.aiCredits,
      adjustments: adjustments ? JSON.parse(adjustments) : {},
    });
  })

  // Platform promo codes (Kova → tenant) — website-native discounts on a
  // tenant's credit-pack purchase. scope='platform', stored tenant_id ''. Applied
  // by billing/pack-intent. Percentage or fixed; optionally exclusive to a pack.
  .get("/admin/promo-codes", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const rows = await c.env.DB.prepare("SELECT id, code, discount_type, percent_off, amount_off_cents, restricted_package_id, max_redemptions, redemption_count, expires_at, active FROM promo_codes WHERE scope = 'platform' ORDER BY created_at DESC").all();
    return c.json({ codes: rows.results ?? [] });
  })
  .post("/admin/promo-codes", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const b = z.object({ code: z.string().min(3).max(40), discountType: z.enum(["percent", "amount"]).default("percent"), percentOff: z.number().int().min(1).max(100).nullish(), amountOffCents: z.number().int().positive().nullish(), restrictedPackageId: z.string().nullish(), maxRedemptions: z.number().int().positive().nullish(), expiresAt: z.string().nullish() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    const id = newId("promo");
    try {
      await c.env.DB.prepare("INSERT INTO promo_codes (id, tenant_id, code, discount_type, percent_off, amount_off_cents, restricted_package_id, scope, max_redemptions, expires_at, created_by, created_at) VALUES (?, '', ?, ?, ?, ?, ?, 'platform', ?, ?, ?, ?)")
        .bind(id, b.data.code.toUpperCase(), b.data.discountType, b.data.percentOff ?? null, b.data.amountOffCents ?? null, b.data.restrictedPackageId ?? null, b.data.maxRedemptions ?? null, b.data.expiresAt ?? null, c.get("user")?.id ?? null, nowIso())
        .run();
    } catch { return c.json({ error: "code already exists" }, 409); }
    return c.json({ ok: true, id }, 201);
  })
  .delete("/admin/promo-codes/:id", async (c) => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await c.env.DB.prepare("UPDATE promo_codes SET active = 0 WHERE id = ? AND scope = 'platform'").bind(c.req.param("id")).run();
    return c.json({ ok: true });
  })

  .get("/admin/whoami", (c) => c.json({ admin: isPlatformAdmin(c), email: c.get("user")?.email }));

/**
 * Platform email configuration — `@4dl/email`'s own routes, bound to Kova's
 * operator check and Kova's sender defaults.
 *
 * They used to be spelled out above, in the BILLING route module, which is how
 * they ended up with no caller in the console and a hand-edit-D1 line in
 * DEPLOY.md. They are the email package's keys; only it reads them.
 */
export const emailConfigRoutes = emailAdminRoutes(
  { isPlatformAdmin: (c) => isPlatformAdmin(c as never) },
  { from: "Kova <noreply@kova.local>", platformFrom: PLATFORM_FROM_DEFAULT },
);

