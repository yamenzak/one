/**
 * THE PLAN CATALOG'S OPERATOR ROUTES — read the catalog, edit a plan.
 *
 * Two endpoints, and they existed in two shapes and one absence: Kova's
 * `PATCH /admin/plans/:id`, Scena's `PUT` over a different payload, and nothing
 * at all in Tessa — where changing a price therefore meant a code edit, a deploy
 * and a catalog sync. `@4dl/admin`'s panel speaks one contract, so here it is.
 *
 * ── Three rules live here, and every one of them is invisible from outside ──
 *
 * **A price change NULLS the plan's Stripe id pair.** `syncCatalog` skips any
 * plan that already carries a `stripe_price_id`, so without this a repriced plan
 * charges the OLD amount forever, with no error anywhere and no way to notice
 * except by reading an invoice.
 *
 * **Lowering a limit GRANDFATHERS whoever is already on the plan.**
 * `snapshotDowngrade` diffs old against new and writes what each existing tenant
 * had into their grant-only override, so nobody loses what they bought. Raising
 * one applies to everybody at read time and needs no write. An app without this
 * silently strips capability from every live tenant the moment an operator
 * tightens a tier — which is what Scena's editor did, and said so in its own
 * help text.
 *
 * **An omitted `trialDays` means "leave it alone", not "no trial".** A client
 * that predates the field posts back the matrix it rendered; treating the gap as
 * zero retires the plan's free trial on the next unrelated edit.
 *
 * ── What the app supplies ───────────────────────────────────────────────────
 *
 * `isPlatformAdmin` (the console's own gate), the entitlement ENGINE it bound
 * (`bindEntitlements`, which carries the app's key registry), `seed` so the
 * catalog exists before it is read, and the key LABELS — copy, and the one part
 * of this that is genuinely the product's.
 */

import { Hono, type Context } from "hono";
import { nowIso, type HasDb } from "@4dl/core";
import type { bindEntitlements, EntitlementShape } from "./entitlements.js";

/**
 * The binding SLICE these routes touch, and nothing else. An app's own `Env`
 * satisfies it by shape, which is why there is no import from any app and why a
 * handler typed like this cannot reach R2 by accident.
 */
export type PlanAdminEnv = { Bindings: HasDb };
export type PlanAdminContext = Context<PlanAdminEnv>;

/** A key's label and explanation, as `@4dl/admin`'s panel renders it. */
export interface PlanKeyMeta {
  label: string;
  hint: string;
  /** Declared but not enforced by any route yet. Shown, and marked. */
  reserved?: boolean;
  /** For a quota: what the number counts. */
  unit?: string;
  /** Optional heading to file this key under. */
  group?: string;
}

export interface PlanAdminConfig<E extends EntitlementShape> {
  /** The console gate. Same function every other admin route tree takes. */
  isPlatformAdmin: (c: PlanAdminContext) => boolean;
  /** Make sure the catalog is seeded before it is read or written. */
  seed: (db: D1Database) => Promise<void>;
  /** The app's bound entitlement engine — its key registry travels with it. */
  engine: Pick<ReturnType<typeof bindEntitlements<E>>, "resolve" | "quotaKeys" | "featureKeys" | "snapshotDowngrade" | "raiseOverride">;
  /** Copy for each key. A key with no entry still renders, spelled as its key. */
  quotaMeta?: Record<string, PlanKeyMeta>;
  featureMeta?: Record<string, PlanKeyMeta>;
}

interface PlanDbRow {
  id: string;
  name: string;
  price_usd_month: number;
  entitlements_json: string | null;
  active: number;
  ord: number;
}

/** Only the shapes we accept off the wire; unknown keys are dropped, not stored. */
function parseBody(raw: unknown): {
  name?: string;
  priceUsdMonth?: number;
  active?: boolean;
  entitlements?: { quotas: Record<string, number>; features: Record<string, boolean>; aiCredits: { monthlyGrant: number }; trialDays?: number };
} | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const out: ReturnType<typeof parseBody> = {};
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || b.name.length > 60) return null;
    out!.name = b.name;
  }
  if (b.priceUsdMonth !== undefined) {
    if (typeof b.priceUsdMonth !== "number" || !Number.isFinite(b.priceUsdMonth) || b.priceUsdMonth < 0) return null;
    out!.priceUsdMonth = b.priceUsdMonth;
  }
  if (b.active !== undefined) {
    if (typeof b.active !== "boolean") return null;
    out!.active = b.active;
  }
  if (b.entitlements !== undefined) {
    const e = b.entitlements as Record<string, unknown> | null;
    if (!e || typeof e !== "object") return null;
    const quotas: Record<string, number> = {};
    for (const [k, v] of Object.entries((e.quotas as Record<string, unknown>) ?? {})) {
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      quotas[k] = v;
    }
    const features: Record<string, boolean> = {};
    for (const [k, v] of Object.entries((e.features as Record<string, unknown>) ?? {})) {
      if (typeof v !== "boolean") return null;
      features[k] = v;
    }
    const grant = (e.aiCredits as { monthlyGrant?: unknown } | undefined)?.monthlyGrant;
    if (grant !== undefined && (typeof grant !== "number" || !Number.isFinite(grant) || grant < 0)) return null;
    // `undefined` here is LOAD-BEARING: it means "leave the trial alone". A
    // client that does not know about the field must not retire it.
    let trialDays: number | undefined;
    if (e.trialDays !== undefined) {
      if (typeof e.trialDays !== "number" || !Number.isFinite(e.trialDays) || e.trialDays < 0 || e.trialDays > 730) return null;
      trialDays = Math.floor(e.trialDays);
    }
    out!.entitlements = { quotas, features, aiCredits: { monthlyGrant: Number(grant ?? 0) }, trialDays };
  }
  return out;
}

export function planAdminRoutes<E extends EntitlementShape>(cfg: PlanAdminConfig<E>) {
  return new Hono<PlanAdminEnv>()
    /**
     * The catalog, with the KEY REGISTRY beside it.
     *
     * Sending the keys rather than letting the client hold a list is what makes
     * the panel product-agnostic AND self-updating: a limit added server-side
     * appears in the editor with no client release, spelled as its raw key until
     * somebody writes a label for it. An unlabelled setting is a nuisance; an
     * invisible one is a setting nobody knows is there.
     */
    .get("/admin/plans", async (c) => {
      if (!cfg.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      await cfg.seed(c.env.DB);
      const rows = await c.env.DB.prepare("SELECT id, name, price_usd_month, entitlements_json, active, ord FROM plans ORDER BY ord").all<PlanDbRow>();
      // Counted per plan so the editor can warn before an edit reaches anyone.
      const counts = await c.env.DB.prepare("SELECT plan_id, COUNT(*) AS n FROM subscriptions WHERE status = 'active' GROUP BY plan_id").all<{ plan_id: string; n: number }>();
      const countMap = new Map((counts.results ?? []).map((r) => [r.plan_id, r.n]));
      return c.json({
        plans: (rows.results ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          priceUsdMonth: p.price_usd_month,
          active: p.active,
          ord: p.ord,
          tenantCount: countMap.get(p.id) ?? 0,
          entitlements: cfg.engine.resolve(p.entitlements_json),
        })),
        quotaKeys: cfg.engine.quotaKeys,
        featureKeys: cfg.engine.featureKeys,
        quotaMeta: cfg.quotaMeta ?? {},
        featureMeta: cfg.featureMeta ?? {},
      });
    })

    .patch("/admin/plans/:id", async (c) => {
      if (!cfg.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const body = parseBody(await c.req.json().catch(() => null));
      if (!body) return c.json({ error: "invalid body" }, 400);
      await cfg.seed(c.env.DB);
      const id = c.req.param("id");
      const plan = await c.env.DB.prepare("SELECT entitlements_json, price_usd_month FROM plans WHERE id = ?").bind(id).first<{ entitlements_json: string | null; price_usd_month: number | null }>();
      if (!plan) return c.json({ error: "unknown plan" }, 404);

      let entJson = plan.entitlements_json;
      let grandfathered = 0;
      if (body.entitlements) {
        const oldEnt = cfg.engine.resolve(plan.entitlements_json);
        const incoming = { ...body.entitlements, trialDays: body.entitlements.trialDays ?? oldEnt.trialDays };
        const newEnt = cfg.engine.resolve(JSON.stringify(incoming));
        entJson = JSON.stringify(newEnt);
        const grants = cfg.engine.snapshotDowngrade(oldEnt, newEnt);
        if (Object.keys(grants).length) {
          const subs = await c.env.DB.prepare("SELECT tenant_id, overrides_json FROM subscriptions WHERE plan_id = ? AND status = 'active'").bind(id).all<{ tenant_id: string; overrides_json: string | null }>();
          const stmts = (subs.results ?? []).map((s) =>
            c.env.DB.prepare("UPDATE subscriptions SET overrides_json = ?, updated_at = ? WHERE tenant_id = ?").bind(cfg.engine.raiseOverride(s.overrides_json, grants), nowIso(), s.tenant_id),
          );
          if (stmts.length) await c.env.DB.batch(stmts);
          grandfathered = stmts.length;
        }
      }

      const sets: string[] = ["entitlements_json = ?"];
      const binds: unknown[] = [entJson];
      if (body.name !== undefined) { sets.push("name = ?"); binds.push(body.name); }
      if (body.priceUsdMonth !== undefined) { sets.push("price_usd_month = ?"); binds.push(body.priceUsdMonth); }
      if (body.active !== undefined) { sets.push("active = ?"); binds.push(body.active ? 1 : 0); }
      /*
        A PRICE CHANGE INVALIDATES THE STRIPE ID PAIR.

        `syncCatalog` skips any row that already has a price id, so leaving them
        in place means every future checkout keeps charging the OLD amount —
        silently, with a 200 back. Nulling the pair makes the next "Sync catalog"
        recreate product + price at the new amount. The old Stripe price object
        survives, which is what we want: tenants already subscribed on it keep
        their price until they re-subscribe.
      */
      const repriced = body.priceUsdMonth !== undefined && body.priceUsdMonth !== plan.price_usd_month;
      if (repriced) sets.push("stripe_product_id = NULL", "stripe_price_id = NULL");
      binds.push(id);
      await c.env.DB.prepare(`UPDATE plans SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
      // `stripeResyncRequired` is the console's cue that the catalog and Stripe
      // now disagree — the one state in which a saved plan is not yet the plan
      // being charged.
      return c.json({ ok: true, grandfathered, stripeResyncRequired: repriced });
    });
}
