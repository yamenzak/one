/**
 * Downgrade eligibility + the gated plan-change path (SPEC §5).
 *
 * A paying owner trying to spend less should be told *exactly* what blocks the
 * smaller plan, where to go to fix it, and then be let through. Three pieces:
 *
 *  1. `POST /billing/downgrade-check` — the checklist. Every quota-backed
 *     dimension measured with the SAME query the write-time gate uses, diffed
 *     against the target plan, annotated with a label, whether it is a hard
 *     blocker, and an in-app destination.
 *  2. `POST /billing/plan-change` — completes a downgrade, re-checking on
 *     submit (the owner may have spent ten minutes archiving; stale numbers must
 *     neither let an ineligible change through nor block an eligible one).
 *  3. A pass-through **guard** on the two existing Stripe plan-change routes
 *     (`/billing/plan-intent`, `/billing/checkout-plan`, both owned by
 *     stripe-routes.ts). This router is mounted BEFORE stripeRoutes in index.ts,
 *     so its handler for those paths runs first: it refuses an ineligible
 *     downgrade with the structured blocker list, and otherwise calls `next()`
 *     to hand off to the real Stripe handler untouched. That is how the rule is
 *     enforced server-side without editing another agent's file.
 *
 * Hard vs soft, deliberately:
 *  • HARD (refuses the change): activeClients, staffSeats, templates, and losing
 *    `commerce` while client subscriptions are live. Each is a countable thing
 *    the owner can act on right now, and shipping a tenant onto a plan whose
 *    seat ceiling they already blow through means the next roster addition is a
 *    dead end with no explanation.
 *  • SOFT (reported, never refuses): storage. The bytes are already on disk;
 *    `putMedia` already fails closed on the NEXT upload once over the ceiling,
 *    which is the same "quotas only block new writes" rule that keeps an
 *    existing over-quota tenant working. Forcing a customer to delete client
 *    progress photos as the price of paying us less is punishment, not policy.
 *
 * Nothing here hardcodes a plan name, price or quota number — every ceiling is
 * read from the plan catalog / entitlements at request time.
 */

import { Hono } from "hono";
import { z } from "zod";
import { checkDowngrade, resolveEntitlements, mergeOverrides, type Entitlements, type TenantUsage, type Violation, type Budget, isFullyExpired } from "@kova/domain";
import { type AppEnv, type AppContext, requireTenant } from "./auth-context.js";
import { getSubscription, listPlans, seedBilling, tenantEntitlements, type PlanRow } from "./billing-store.js";
import { staffSeatsUsed } from "./auth.js";
import { countClientSeats } from "./clients.js";
import { tenantStorageBytes } from "./storage.js";
import { stripeConfig, stripeEnabled } from "./stripe.js";
import { nowIso } from "./ids.js";
import { parseJson } from "./db.js";

const MB = 1024 * 1024;

/** Presentation + policy for each blocking dimension. `href` is an in-app route
 *  (Shell.tsx), so every blocker leads somewhere the owner can actually act. */
const DIMENSION: Record<string, { label: string; hard: boolean; unit?: string; action?: { label: string; href: string } }> = {
  activeClients: { label: "Active clients", hard: true, action: { label: "Open your roster", href: "/clients" } },
  staffSeats: { label: "Staff seats", hard: true, action: { label: "Manage staff", href: "/business" } },
  templates: { label: "Templates", hard: true, action: { label: "Open your library", href: "/library/templates" } },
  storageMb: { label: "Storage", hard: false, unit: "MB", action: { label: "Open media library", href: "/media" } },
  commerce: { label: "Client subscriptions", hard: true },
};

/** One line of the checklist, ready to render. */
export interface Blocker {
  /** Quota key or feature key. */
  key: string;
  kind: "quota" | "feature";
  label: string;
  /** Refuses the plan change (vs. reported-only). */
  hard: boolean;
  /** What they have now. */
  current: number;
  /** The target plan's ceiling (-1 = unlimited, never a blocker). */
  ceiling: number;
  /** How many must go. */
  removeCount: number;
  unit?: string;
  /** Plain, non-punitive instruction. */
  message: string;
  action?: { label: string; href: string };
}

export interface DowngradeReport {
  planId: string;
  planName: string;
  priceUsdMonth: number;
  currentPlanId: string;
  currentPlanName: string;
  currentPriceUsdMonth: number;
  /** No HARD blockers — the plan change is allowed. */
  eligible: boolean;
  /** Nothing at all over the line (soft warnings included). */
  clean: boolean;
  blockers: Blocker[];
  /** Usage as measured, for a "you're at X of Y" line. */
  usage: TenantUsage & { storageBytes: number };
  /** The target plan's ceilings, so the UI never has to guess. */
  targetQuotas: Entitlements["quotas"];
  checkedAt: string;
}

/**
 * Measure the tenant against the SAME counts the write-time gates use — an
 * eligibility probe that disagrees with enforcement is worse than none.
 *   activeClients → `status != 'archived'` (clients.ts + otp-guard.ts)
 *   staffSeats    → `member` rows with `role != 'client'` (auth.ts)
 *   templates     → workout + meal templates combined (plan-routes.ts)
 *   storage       → live media-ledger bytes (storage.ts)
 */
async function measureUsage(db: D1Database, tenantId: string): Promise<TenantUsage & { storageBytes: number }> {
  const count = async (sql: string, binds: unknown[]): Promise<number> =>
    (await db.prepare(sql).bind(...binds).first<{ n: number }>().catch(() => null))?.n ?? 0;
  const [activeClients, seats, templates, storageBytes, commerceSubs] = await Promise.all([
    countClientSeats(db, tenantId),
    staffSeatsUsed(db, tenantId),
    count(
      "SELECT (SELECT COUNT(*) FROM workout_templates WHERE tenant_id = ?) + (SELECT COUNT(*) FROM meal_templates WHERE tenant_id = ?) AS n",
      [tenantId, tenantId],
    ),
    tenantStorageBytes(db, tenantId),
    liveCommerceSubs(db, tenantId),
  ]);
  return {
    activeClients,
    staffSeats: seats,
    templates,
    // Exact, not rounded: a 0.4 MB overage must not read as "1 MB over".
    storageMb: storageBytes / MB,
    storageBytes,
    activeCommerceSubs: commerceSubs,
  };
}

/** Client subscriptions that are active AND still carry unexpired access —
 *  the ones that would be stranded if `commerce` went away. */
async function liveCommerceSubs(db: D1Database, tenantId: string): Promise<number> {
  const rows = await db
    .prepare("SELECT budgets_json FROM subject_subscriptions WHERE tenant_id = ? AND status = 'active' AND payment_status IN ('paid','installments')")
    .bind(tenantId)
    .all<{ budgets_json: string | null }>()
    .catch(() => ({ results: [] as { budgets_json: string | null }[] }));
  const now = nowIso();
  let n = 0;
  for (const r of rows.results ?? []) {
    const budgets = parseJson<Budget[]>(r.budgets_json, []);
    if (!budgets.length || !isFullyExpired(budgets, now)) n++;
  }
  return n;
}

const fmtNum = (n: number): string => Math.round(n).toLocaleString();

/** Turn a pure `Violation` into a renderable, actionable line. */
function toBlocker(v: Violation, usage: TenantUsage & { storageBytes: number }): Blocker {
  const key = v.resource;
  const meta = DIMENSION[key] ?? { label: key, hard: true };
  if (v.type === "feature") {
    return {
      key, kind: "feature", label: meta.label, hard: meta.hard,
      current: v.instances, ceiling: 0, removeCount: v.instances,
      message: `${fmtNum(v.instances)} client${v.instances === 1 ? "" : "s"} still hold${v.instances === 1 ? "s" : ""} paid access sold through your packages. This plan doesn't include selling, so ${v.action}.`,
      ...(meta.action ? { action: meta.action } : {}),
    };
  }
  if (key === "storageMb") {
    const overMb = Math.max(0, usage.storageBytes / MB - v.max);
    return {
      key, kind: "quota", label: meta.label, hard: meta.hard,
      current: Math.round(usage.storageBytes / MB), ceiling: v.max,
      removeCount: Math.ceil(overMb), unit: meta.unit ?? "MB",
      message: `You're storing about ${fmtNum(usage.storageBytes / MB)} MB and this plan includes ${fmtNum(v.max)} MB. You can switch now — new uploads just wait until you're back under, so clearing about ${fmtNum(overMb)} MB of old media keeps things moving.`,
      ...(meta.action ? { action: meta.action } : {}),
    };
  }
  const noun = key === "activeClients" ? "client" : key === "staffSeats" ? "staff seat" : "template";
  return {
    key, kind: "quota", label: meta.label, hard: meta.hard,
    current: v.have, ceiling: v.max, removeCount: v.removeCount,
    ...(meta.unit ? { unit: meta.unit } : {}),
    message: `You have ${fmtNum(v.have)} and this plan includes ${fmtNum(v.max)}. Free ${fmtNum(v.removeCount)} more ${noun}${v.removeCount === 1 ? "" : "s"} to switch.`,
    ...(meta.action ? { action: meta.action } : {}),
  };
}

/** The tenant's CURRENT plan row. `listPlans` filters `active = 1`, so a tenant
 *  grandfathered on a retired tier isn't in it — falling back to price 0 would
 *  make a genuinely cheaper target read as an upgrade and skip the gate. Fetch
 *  the row by id (unfiltered) when the active list doesn't have it. */
async function currentPlanRow(db: D1Database, active: PlanRow[], planId: string): Promise<PlanRow | null> {
  const inList = active.find((p) => p.id === planId);
  if (inList) return inList;
  return db.prepare("SELECT * FROM plans WHERE id = ?").bind(planId).first<PlanRow>().catch(() => null);
}

/** Build the full report for a target plan. Pure-ish: all the maths is
 *  `checkDowngrade` from @kova/domain; this only measures and annotates. */
async function report(c: AppContext, tenantId: string, targetPlanId: string): Promise<{ report: DowngradeReport } | { response: Response }> {
  await seedBilling(c.env.DB);
  const plans = await listPlans(c.env.DB);
  const target = plans.find((p) => p.id === targetPlanId);
  if (!target) return { response: c.json({ error: "unknown plan" }, 404) };
  const sub = await getSubscription(c.env.DB, tenantId);
  const current = await currentPlanRow(c.env.DB, plans, sub.plan_id);

  const usage = await measureUsage(c.env.DB, tenantId);
  // The ceilings that will ACTUALLY be in force after the change. Per-tenant
  // overrides live on the subscription row and survive a plan change (they are
  // grant-only, so they can only raise), which means measuring against the raw
  // plan blob would tell a gifted tenant they're blocked by a ceiling their gift
  // lifts. The status clamp is deliberately NOT applied: a suspended tenant is
  // already down at free capabilities, and comparing to those would over-block.
  const targetEnt = mergeOverrides(resolveEntitlements(target.entitlements_json), sub.overrides_json);
  const { violations } = checkDowngrade(usage, targetEnt);
  const blockers = violations.map((v) => toBlocker(v, usage));

  return {
    report: {
      planId: target.id,
      planName: target.name,
      priceUsdMonth: target.price_usd_month,
      currentPlanId: sub.plan_id,
      currentPlanName: current?.name ?? sub.plan_id,
      currentPriceUsdMonth: current?.price_usd_month ?? 0,
      eligible: !blockers.some((b) => b.hard),
      clean: blockers.length === 0,
      blockers,
      usage,
      targetQuotas: targetEnt.quotas,
      checkedAt: nowIso(),
    },
  };
}

/** Is `target` cheaper than what the tenant is on now? Only a *downgrade* is
 *  gated — an upgrade can never take a tenant over a ceiling. */
function isDowngrade(target: PlanRow, currentPrice: number, currentQuotas: Entitlements["quotas"], overridesJson: string | null): boolean {
  if (target.price_usd_month < currentPrice) return true;
  // Same price, tighter ceilings (an admin-retuned catalog) still counts. Both
  // sides carry the tenant's overrides, so a gift that lifts the same ceiling on
  // both plans correctly reads as "not tighter".
  const t = mergeOverrides(resolveEntitlements(target.entitlements_json), overridesJson).quotas;
  return (Object.keys(t) as (keyof typeof t)[]).some((k) => {
    const a = currentQuotas[k], b = t[k];
    return (a < 0 && b >= 0) || (a >= 0 && b >= 0 && b < a);
  });
}

const PlanBody = z.object({ planId: z.string().min(1).max(60) });

export const downgradeRoutes = new Hono<AppEnv>()
  /**
   * The checklist. POST (not GET) because the target plan is the input and
   * `/api/billing` GETs only need `billing:["read"]` while this is an owner
   * surface; route-guard maps a non-GET `/api/billing/*` to `billing:["manage"]`,
   * which only the owner preset carries.
   */
  .post("/billing/downgrade-check", async (c) => {
    const who = requireTenant(c)!;
    const body = PlanBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const r = await report(c, who.tenantId, body.data.planId);
    if ("response" in r) return r.response;
    return c.json(r.report);
  })

  /**
   * Complete a downgrade. Re-checks on submit — this is the authoritative gate,
   * not the sheet the owner opened ten minutes ago.
   *
   * What it will and won't do with money: it never writes to Stripe. When the
   * tenant has a live Stripe subscription the response says which existing
   * sanctioned path to finish on (`requiresCheckout` → plan-intent, itself
   * guarded below; `requiresPortal` → the Billing Portal, the only place a
   * subscription is cancelled). Only when there's nothing to cancel — no Stripe,
   * or no live subscription — does it stamp the plan directly.
   */
  .post("/billing/plan-change", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const body = PlanBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    await seedBilling(c.env.DB);
    const plans = await listPlans(c.env.DB);
    const target = plans.find((p) => p.id === body.data.planId);
    if (!target) return c.json({ error: "unknown plan" }, 404);
    const sub = await getSubscription(c.env.DB, who.tenantId);
    if (sub.plan_id === target.id) return c.json({ error: "already_on_plan" }, 409);
    const currentPlan = await currentPlanRow(c.env.DB, plans, sub.plan_id);
    const currentEnt = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!isDowngrade(target, currentPlan?.price_usd_month ?? 0, currentEnt.quotas, sub.overrides_json)) {
      // Upgrades keep going through checkout — nothing to be eligible for.
      return c.json({ error: "not_a_downgrade", message: "That plan isn't smaller than your current one." }, 400);
    }

    const r = await report(c, who.tenantId, target.id);
    if ("response" in r) return r.response;
    if (!r.report.eligible) return c.json({ error: "downgrade_blocked", ...r.report }, 409);

    const cfg = await stripeConfig(c.env);
    if (stripeEnabled(cfg) && sub.stripe_sub_id) {
      return target.price_usd_month > 0
        ? c.json({ ok: false, requiresCheckout: true, ...r.report })
        : c.json({ ok: false, requiresPortal: true, ...r.report });
    }

    // Nothing to cancel — stamp the plan. `status` is deliberately untouched: a
    // past_due / suspended tenant must not be silently made current by choosing a
    // cheaper plan, and `expired → active` has no automatic path.
    await c.env.DB
      .prepare("UPDATE subscriptions SET plan_id = ?, pending_plan_id = NULL, updated_at = ? WHERE tenant_id = ?")
      .bind(target.id, nowIso(), who.tenantId)
      .run();
    const entitlements = await tenantEntitlements(c.env.DB, who.tenantId);
    return c.json({ ok: true, entitlements, ...r.report });
  })

  // ── The server-side teeth ────────────────────────────────────────────────
  // Pass-through guards on the Stripe plan-change routes. Mounted before
  // stripeRoutes, so these run first; `next()` hands the request on unchanged.
  .post("/billing/plan-intent", planChangeGuard)
  .post("/billing/checkout-plan", planChangeGuard);

/** Refuse an ineligible downgrade before the Stripe handler can start one.
 *  Anything that isn't a downgrade (or that we can't resolve) falls straight
 *  through — this guard exists to block, never to break an upgrade. */
async function planChangeGuard(c: AppContext, next: () => Promise<void>): Promise<Response | void> {
  const who = requireTenant(c);
  if (!who) return next();
  // Hono caches the parsed body, so the downstream handler re-reads it fine.
  const body = PlanBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return next(); // the real handler owns the 400
  const plans = await listPlans(c.env.DB).catch(() => [] as PlanRow[]);
  const target = plans.find((p) => p.id === body.data.planId);
  if (!target) return next();
  const sub = await getSubscription(c.env.DB, who.tenantId);
  const currentPlan = await currentPlanRow(c.env.DB, plans, sub.plan_id);
  const currentEnt = await tenantEntitlements(c.env.DB, who.tenantId);
  if (!isDowngrade(target, currentPlan?.price_usd_month ?? 0, currentEnt.quotas, sub.overrides_json)) return next();
  const r = await report(c, who.tenantId, target.id);
  if ("response" in r) return next();
  if (r.report.eligible) return next();
  return c.json({ error: "downgrade_blocked", ...r.report }, 409);
}
