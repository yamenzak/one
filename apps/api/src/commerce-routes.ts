/**
 * Tenant commerce (SPEC §7) — packages, client subscriptions (the access
 * economy), and redemption codes. Stripe Connect checkout arrives next; the
 * economy itself is fully live now: $0/comped grants create subscriptions
 * directly, budgets queue (never sum), expiry derives at read time, and
 * status reconciles lazily on read.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  buildBudgetsForPurchase,
  isFullyExpired,
  mergeAddOnBalances,
  overallDaysRemaining,
  BUDGET_FEATURES,
  type Budget,
} from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { gateFeature } from "./client-flags.js";
import { requireClientAccess } from "./clients.js";
import { newId, nowIso } from "./ids.js";
import { recordAudit } from "./audit.js";
import { notify } from "./notify.js";
import { parseJson, j } from "./db.js";
import { updateSubscriptionRunway } from "./subscription-runway.js";

const PackageBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
  oneTimePriceCents: z.number().int().min(0).nullish(),
  monthlyPriceCents: z.number().int().min(0).nullish(),
  installmentMonths: z.number().int().min(2).max(24).nullish(),
  budgets: z
    .array(z.object({ feature: z.enum(BUDGET_FEATURES), days: z.number().int().positive() }))
    .default([]),
  flags: z.record(z.string(), z.boolean()).nullish(),
  visibility: z.enum(["private", "marketplace", "client_specific"]).default("private"),
  restrictedClientId: z.string().nullish(),
  oncePerCustomer: z.boolean().default(false),
});

interface SubRow {
  id: string;
  tenant_id: string;
  client_id: string;
  package_id: string | null;
  status: string;
  payment_status: string;
  budgets_json: string | null;
  addons_json: string | null;
  flags_json: string | null;
  source: string;
  started_at: string;
  stripe_sub_id?: string | null;
}

function subView(row: SubRow, nowIsoStr: string) {
  const budgets = parseJson<Budget[]>(row.budgets_json, []);
  return {
    id: row.id,
    clientId: row.client_id,
    packageId: row.package_id,
    status: row.status,
    paymentStatus: row.payment_status,
    budgets,
    daysRemaining: overallDaysRemaining(budgets, nowIsoStr),
    addOns: parseJson(row.addons_json, []),
    source: row.source,
    startedAt: row.started_at,
    // Auto-renews while a live Stripe subscription id is pinned to the row.
    autoRenew: Boolean(row.stripe_sub_id),
  };
}

/** Lazy reconcile (SPEC §7): flip active → expired when every budget lapsed. */
async function reconcile(db: D1Database, row: SubRow, now: string): Promise<SubRow> {
  if (row.status === "active" && isFullyExpired(parseJson<Budget[]>(row.budgets_json, []), now)) {
    // Guard on the exact status + budgets we read: a concurrent /redeem or
    // renewal that just appended fresh budgets and set the row active again must
    // not be clobbered back to 'expired' (no read path ever flips expired→active,
    // so that would strand the client's just-paid-for days). If the guard fails
    // (someone changed the row under us) leave it active — the next read
    // reconciles correctly.
    const r = await db
      .prepare("UPDATE client_subscriptions SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'active' AND budgets_json IS ?")
      .bind(now, row.id, row.budgets_json ?? null)
      .run()
      .catch(() => undefined);
    if (r && (r.meta?.changes ?? 0) > 0) return { ...row, status: "expired" };
  }
  return row;
}

export const commerceRoutes = new Hono<AppEnv>()
  // ── Packages ───────────────────────────────────────────────────────────────
  .get("/packages", async (c) => {
    const who = requireTenant(c)!;
    const rows = await c.env.DB.prepare(
      "SELECT * FROM packages WHERE tenant_id = ? AND active = 1 ORDER BY created_at DESC",
    )
      .bind(who.tenantId)
      .all();
    return c.json({
      packages: (rows.results ?? []).map((p) => ({
        ...p,
        budgets: parseJson(p.budgets_json as string | null, []),
        flags: parseJson(p.flags_json as string | null, null),
        budgets_json: undefined,
        flags_json: undefined,
      })),
    });
  })

  .post("/packages", async (c) => {
    const who = requireTenant(c)!;
    { const g = await gateFeature(c, "commerce"); if (g) return g; }
    const parsed = PackageBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    const d = parsed.data;
    const id = newId("pkg");
    await c.env.DB.prepare(
      `INSERT INTO packages (id, tenant_id, name, description, one_time_price_cents, monthly_price_cents, installment_months, budgets_json, flags_json, visibility, restricted_client_id, once_per_customer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id, who.tenantId, d.name, d.description ?? null, d.oneTimePriceCents ?? null,
        d.monthlyPriceCents ?? null, d.installmentMonths ?? null, j(d.budgets),
        d.flags ? j(d.flags) : null, d.visibility, d.restrictedClientId ?? null,
        d.oncePerCustomer ? 1 : 0, nowIso(),
      )
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .patch("/packages/:id", async (c) => {
    const who = requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT id FROM packages WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first();
    if (!row) return c.json({ error: "not found" }, 404);
    const parsed = PackageBody.partial().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const sets: string[] = [];
    const binds: unknown[] = [];
    const put = (col: string, v: unknown) => (sets.push(`${col} = ?`), binds.push(v));
    if (d.name !== undefined) put("name", d.name);
    if (d.description !== undefined) put("description", d.description);
    if (d.oneTimePriceCents !== undefined) put("one_time_price_cents", d.oneTimePriceCents);
    if (d.monthlyPriceCents !== undefined) put("monthly_price_cents", d.monthlyPriceCents);
    if (d.installmentMonths !== undefined) put("installment_months", d.installmentMonths);
    if (d.budgets !== undefined) put("budgets_json", j(d.budgets));
    if (d.flags !== undefined) put("flags_json", d.flags ? j(d.flags) : null);
    if (d.visibility !== undefined) put("visibility", d.visibility);
    if (d.restrictedClientId !== undefined) put("restricted_client_id", d.restrictedClientId);
    if (d.oncePerCustomer !== undefined) put("once_per_customer", d.oncePerCustomer ? 1 : 0);
    if (sets.length === 0) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE packages SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds, c.req.param("id"))
      .run();
    return c.json({ ok: true });
  })

  .delete("/packages/:id", async (c) => {
    const who = requireTenant(c)!;
    await c.env.DB.prepare("UPDATE packages SET active = 0 WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  })

  // ── Client subscriptions ───────────────────────────────────────────────────
  .get("/subscriptions", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const now = nowIso();
    const rows = await c.env.DB.prepare(
      "SELECT * FROM client_subscriptions WHERE client_id = ? ORDER BY started_at DESC",
    )
      .bind(clientId)
      .all<SubRow>();
    const out = [];
    for (const row of rows.results ?? []) out.push(subView(await reconcile(c.env.DB, row, now), now));
    return c.json({ subscriptions: out });
  })

  /**
   * Grant a package to a client without payment (staff action): $0 packages,
   * comps, migrations. Paid checkout rides Stripe Connect (next phase) and
   * lands in the same shape via webhook.
   */
  .post("/subscriptions/grant", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner" && c.get("role") !== "trainer") {
      return c.json({ error: "forbidden" }, 403);
    }
    { const g = await gateFeature(c, "commerce"); if (g) return g; }
    const parsed = z
      .object({ clientId: z.string(), packageId: z.string() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const pkg = await c.env.DB.prepare(
      "SELECT * FROM packages WHERE id = ? AND tenant_id = ? AND active = 1",
    )
      .bind(parsed.data.packageId, who.tenantId)
      .first<{ id: string; name: string; budgets_json: string | null; addons_json: string | null; flags_json: string | null; once_per_customer: number; visibility: string; restricted_client_id: string | null }>();
    if (!pkg) return c.json({ error: "package not found" }, 404);
    // A client-specific package can only be granted to its own client (staff may
    // still grant `private` grant-only packages to anyone).
    if (pkg.visibility === "client_specific" && pkg.restricted_client_id && pkg.restricted_client_id !== access.client.id) {
      return c.json({ error: "package is private to another client" }, 403);
    }

    const now = nowIso();
    if (pkg.once_per_customer) {
      const prior = await c.env.DB.prepare(
        "SELECT 1 AS x FROM client_subscriptions WHERE client_id = ? AND package_id = ?",
      )
        .bind(access.client.id, pkg.id)
        .first();
      if (prior) return c.json({ error: "package is once per customer" }, 409);
    }

    // Queue-not-sum: extend the client's current NON-recurring subscription if
    // one is live, else open a new one. Recurring rows are owned by their Stripe
    // subscription (they renew off their own package) — never fold a manual grant
    // into one, matching grantClientPackage.
    const current = await c.env.DB.prepare(
      "SELECT * FROM client_subscriptions WHERE client_id = ? AND status = 'active' AND stripe_sub_id IS NULL ORDER BY started_at DESC LIMIT 1",
    )
      .bind(access.client.id)
      .first<SubRow>();

    const specs = parseJson<{ feature: Budget["feature"]; days: number }[]>(pkg.budgets_json, []);
    const purchasedAddOns = parseJson<{ addOnTypeId: string; quantity: number }[]>(pkg.addons_json, []);

    if (current) {
      // CAS append so a concurrent redeem / renewal on the same row can't lose
      // this grant's budget days (last-writer-wins on the JSON columns).
      await updateSubscriptionRunway(c.env.DB, current.id, (existing, addOnsPrev) => ({
        budgets: [...existing, ...buildBudgetsForPurchase(existing, specs, now)],
        addOns: mergeAddOnBalances(addOnsPrev, purchasedAddOns),
        extra: { sql: "updated_at = ?", binds: [now] },
      }));
      await recordAudit(c.env, { tenantId: who.tenantId, clientId: access.client.id, actorUserId: who.userId, action: "package.assign", summary: `${pkg.name} (extended)`, ref: pkg.id });
      if (access.client.user_id && access.client.user_id !== who.userId) {
        await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "access_granted", title: "Your access was extended", message: `${pkg.name} — more time added`, vars: { coachName: c.get("user")?.name || "Your coach", packageName: pkg.name } });
      }
      return c.json({ ok: true, id: current.id, extended: true });
    }

    const id = newId("csub");
    const budgets = buildBudgetsForPurchase([], specs, now);
    await c.env.DB.prepare(
      `INSERT INTO client_subscriptions (id, tenant_id, client_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 'none', ?, ?, ?, 'admin', ?, ?)`,
    )
      .bind(
        id, who.tenantId, access.client.id, pkg.id, j(budgets),
        j(mergeAddOnBalances([], purchasedAddOns)), pkg.flags_json, now, now,
      )
      .run();
    await recordAudit(c.env, { tenantId: who.tenantId, clientId: access.client.id, actorUserId: who.userId, action: "package.assign", summary: pkg.name, ref: pkg.id });
    if (access.client.user_id && access.client.user_id !== who.userId) {
      await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "access_granted", message: pkg.name, vars: { coachName: c.get("user")?.name || "Your coach", packageName: pkg.name } });
    }
    return c.json({ ok: true, id, extended: false }, 201);
  })

  // ── Redemption codes ───────────────────────────────────────────────────────
  .get("/redemption-codes", async (c) => {
    const who = requireTenant(c)!;
    const rows = await c.env.DB.prepare(
      "SELECT id, code, days_to_add, target_feature, max_uses, used_count, restricted_package_id, restricted_client_id, expires_at, active FROM redemption_codes WHERE tenant_id = ? ORDER BY created_at DESC",
    )
      .bind(who.tenantId)
      .all();
    return c.json({ codes: rows.results ?? [] });
  })

  .post("/redemption-codes", async (c) => {
    const who = requireTenant(c)!;
    { const g = await gateFeature(c, "commerce"); if (g) return g; }
    const parsed = z
      .object({
        code: z.string().min(4).max(40),
        daysToAdd: z.number().int().positive().max(730),
        targetFeature: z.enum(BUDGET_FEATURES).default("all"),
        maxUses: z.number().int().positive().default(1),
        // Optional scoping: only this client may redeem, and/or only clients
        // who hold this package (e.g. bonus days for buyers of package X).
        restrictedPackageId: z.string().nullish(),
        restrictedClientId: z.string().nullish(),
        expiresAt: z.string().nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const id = newId("code");
    try {
      await c.env.DB.prepare(
        "INSERT INTO redemption_codes (id, tenant_id, code, days_to_add, target_feature, max_uses, used_by_json, restricted_package_id, restricted_client_id, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)",
      )
        .bind(id, who.tenantId, d.code.toUpperCase(), d.daysToAdd, d.targetFeature, d.maxUses, d.restrictedPackageId ?? null, d.restrictedClientId ?? null, d.expiresAt ?? null, who.userId, nowIso())
        .run();
    } catch {
      return c.json({ error: "code already exists" }, 409);
    }
    return c.json({ ok: true, id }, 201);
  })

  /** Client redeems a code → a queued budget on their subscription. */
  .post("/redeem", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z
      .object({ clientId: z.string(), code: z.string().min(1) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;

    const now = nowIso();
    const code = await c.env.DB.prepare(
      "SELECT * FROM redemption_codes WHERE tenant_id = ? AND code = ? AND active = 1",
    )
      .bind(who.tenantId, parsed.data.code.toUpperCase())
      .first<{ id: string; days_to_add: number; target_feature: Budget["feature"]; max_uses: number; used_count: number; used_by_json: string | null; restricted_package_id: string | null; restricted_client_id: string | null; expires_at: string | null }>();
    // Disabled/unknown/expired/out-of-scope all read as "not found" — no oracle.
    if (!code) return c.json({ error: "code not found" }, 404);
    if (code.expires_at && code.expires_at < now) return c.json({ error: "code not found" }, 404);
    // Per-client lock: only the named client may redeem this code.
    if (code.restricted_client_id && code.restricted_client_id !== access.client.id) return c.json({ error: "code not found" }, 404);
    // Per-package lock: only a client who holds that package may redeem.
    if (code.restricted_package_id) {
      const owns = await c.env.DB.prepare("SELECT 1 AS x FROM client_subscriptions WHERE client_id = ? AND package_id = ? LIMIT 1").bind(access.client.id, code.restricted_package_id).first();
      if (!owns) return c.json({ error: "code not found" }, 404);
    }

    // Per-client claim (atomic): the UNIQUE(code_id, client_id) child row dedupes
    // a second redemption by the same client without a lost-update on a JSON
    // array — a concurrent double-submit inserts once, the loser gets changes=0.
    const claim = await c.env.DB.prepare(
      "INSERT OR IGNORE INTO redemption_uses (code_id, client_id, at) VALUES (?, ?, ?)",
    )
      .bind(code.id, access.client.id, now)
      .run();
    if ((claim.meta?.changes ?? 0) === 0) return c.json({ error: "already redeemed" }, 409);

    // Consume a use slot atomically. The guarded UPDATE (used_count < max_uses)
    // is what actually enforces the cap: two concurrent redemptions can't both
    // pass a read-then-check (TOCTOU over-redemption). If none is left, release
    // this client's claim so the code isn't wrongly marked redeemed for them.
    const slot = await c.env.DB.prepare(
      "UPDATE redemption_codes SET used_count = used_count + 1 WHERE id = ? AND used_count < max_uses",
    )
      .bind(code.id)
      .run();
    if ((slot.meta?.changes ?? 0) === 0) {
      await c.env.DB.prepare("DELETE FROM redemption_uses WHERE code_id = ? AND client_id = ?")
        .bind(code.id, access.client.id)
        .run()
        .catch(() => undefined);
      return c.json({ error: "code fully used" }, 409);
    }

    // Grant the days. If this write fails after we've consumed the slot + claim,
    // COMPENSATE (release the slot and the claim) so a retry redeems cleanly —
    // otherwise a transient D1 error would strand the client (slot burned, claim
    // held, no days). buildBudgetsForPurchase (not buildRedemptionBudget) so an
    // `all` code splits per feature and never leaves a covered feature with a gap.
    const codeSpec = [{ feature: code.target_feature, days: code.days_to_add }];
    try {
      // Fold into the client's active/expired NON-recurring runway (recurring
      // rows renew off their own Stripe subscription — leave them owned by it).
      const current = await c.env.DB.prepare(
        "SELECT * FROM client_subscriptions WHERE client_id = ? AND status IN ('active','expired') AND stripe_sub_id IS NULL ORDER BY started_at DESC LIMIT 1",
      )
        .bind(access.client.id)
        .first<SubRow>();
      if (current) {
        // CAS append: a concurrent grant / renewal on this same row must not
        // overwrite the days this burned redemption slot just paid for. On a
        // lost race (row gone or contended out) throw so the compensation below
        // releases the slot + claim and the client can retry cleanly.
        const ok = await updateSubscriptionRunway(c.env.DB, current.id, (budgets, addOns) => ({
          budgets: [...budgets, ...buildBudgetsForPurchase(budgets, codeSpec, now)],
          addOns,
          extra: { sql: "status = 'active', updated_at = ?", binds: [now] },
        }));
        if (!ok) throw new Error("redeem_cas_failed");
      } else {
        await c.env.DB.prepare(
          `INSERT INTO client_subscriptions (id, tenant_id, client_id, status, payment_status, budgets_json, addons_json, source, started_at, updated_at)
           VALUES (?, ?, ?, 'active', 'none', ?, '[]', 'redemption', ?, ?)`,
        )
          .bind(
            newId("csub"), who.tenantId, access.client.id,
            j(buildBudgetsForPurchase([], codeSpec, now)), now, now,
          )
          .run();
      }
    } catch (err) {
      await c.env.DB.prepare("UPDATE redemption_codes SET used_count = used_count - 1 WHERE id = ? AND used_count > 0").bind(code.id).run().catch(() => undefined);
      await c.env.DB.prepare("DELETE FROM redemption_uses WHERE code_id = ? AND client_id = ?").bind(code.id, access.client.id).run().catch(() => undefined);
      throw err;
    }
    // Mirror the client into used_by_json for display (atomic append via
    // json_insert — no lost write). The slot count was already consumed above.
    await c.env.DB.prepare(
      "UPDATE redemption_codes SET used_by_json = json_insert(COALESCE(used_by_json, '[]'), '$[#]', ?) WHERE id = ?",
    )
      .bind(access.client.id, code.id)
      .run()
      .catch(() => undefined);
    return c.json({ ok: true, daysAdded: code.days_to_add, feature: code.target_feature });
  });
