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
  daysByFeature,
  isFullyExpired,
  mergeAddOnBalances,
  overallDaysRemaining,
  setRemainingDays,
  BUDGET_FEATURES,
  BUDGET_SCOPES,
  type Budget,
} from "@kova/domain";
import { hasPriorPurchase, recordPackageGrant } from "@4dl/commerce";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { gateFeature } from "./client-flags.js";
import { requireClientAccess } from "./clients.js";
import { newId, nowIso } from "./ids.js";
import { recordAudit } from "./audit.js";
import { notify } from "./notify.js";
import { parseJson, j } from "./db.js";
import { updateSubscriptionRunway } from "./subscription-runway.js";

const BudgetSpecs = z.array(z.object({ feature: z.enum(BUDGET_FEATURES), days: z.number().int().positive() }));
const Visibility = z.enum(["private", "marketplace", "client_specific"]);

/**
 * The largest a studio may price one package, in cents (USD-equivalent).
 *
 * ── Why a ceiling exists at all ─────────────────────────────────────────────
 *
 * The platform Connect profile makes US responsible for losses from seller
 * fraud. The textbook attack on any Connect platform is not subtle: sign up as
 * a studio, price a package absurdly high, "sell" it to yourself on stolen
 * cards, and take the payout before the chargebacks land. Every unbounded
 * price field is a multiplier on that, and until now `oneTimePriceCents` was
 * `min(0)` with no upper bound — a studio could write a $9,999,999 package.
 *
 * The cap does not stop fraud; it bounds the size of any single attempt, which
 * is the part that decides whether a chargeback wave is an annoyance or an
 * extinction event. Kova's own ladder tops out at $99.99/month, so $10,000 for
 * one client package is already far outside the shape of the product — a real
 * studio selling a year of premium coaching lands an order of magnitude below
 * it.
 *
 * ── Why it is a constant and not a setting ──────────────────────────────────
 *
 * A limit an attacker can raise is not a limit. This one is deliberately not in
 * `app_config`: a studio must not be able to lift it, and an operator lifting it
 * per-tenant is a support conversation, not a form. If a legitimate studio ever
 * needs more, that is a code change with a human in the loop — which is exactly
 * the friction we want on this particular number.
 */
export const MAX_PACKAGE_PRICE_CENTS = 1_000_000; // $10,000.00

const PackageBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
  oneTimePriceCents: z.number().int().min(0).max(MAX_PACKAGE_PRICE_CENTS).nullish(),
  monthlyPriceCents: z.number().int().min(0).max(MAX_PACKAGE_PRICE_CENTS).nullish(),
  /**
   * Instalment plans are no longer offered — the editor has two price modes.
   *
   * The field is still ACCEPTED so that an existing row's PATCH does not 400 on
   * a value it is merely echoing back, but nothing sends it and `/api/purchases`
   * refuses any package carrying it. "Charge N times then stop" needs someone to
   * count and then cancel, and on a checkout page the studio owns there is
   * nothing we can call to do that.
   */
  installmentMonths: z.number().int().min(2).max(24).nullish(),
  budgets: BudgetSpecs.default([]),
  flags: z.record(z.string(), z.boolean()).nullish(),
  addOns: z.array(z.object({ addOnTypeId: z.string(), quantity: z.number().int().positive() })).nullish(),
  visibility: Visibility.default("private"),
  restrictedClientId: z.string().nullish(),
  oncePerCustomer: z.boolean().default(false),
  /**
   * The tenant's own checkout page for THIS package.
   *
   * A URL and nothing else — never a credential. It is per-package because a
   * hosted payment link is fixed-price, so one link cannot serve a catalogue.
   * `url()` is a real guard, not politeness: a malformed value here sends a
   * paying customer nowhere, and the studio would only find out from the
   * customer.
   */
  payLink: z.string().url().max(2000).nullish(),
});

interface SubRow {
  id: string;
  tenant_id: string;
  /* The COLUMN is `subject_id` — `@4dl/commerce` renamed it when the package was
     extracted, and this interface kept the old name. `SELECT *` then produced
     rows whose `client_id` was `undefined`, so `/api/subscriptions` has been
     answering `clientId: undefined` for every subscription. Nothing read it
     until this file needed to scope a write by it. */
  subject_id: string;
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

/**
 * @param packageName Resolved by the CALLER, and resolved without the catalogue's
 *   `active` filter — see `GET /subscriptions`.
 */
function subView(row: SubRow, nowIsoStr: string, packageName?: string | null) {
  const budgets = parseJson<Budget[]>(row.budgets_json, []);
  return {
    id: row.id,
    clientId: row.subject_id,
    packageId: row.package_id,
    /*
      THE NAME TRAVELS WITH THE ROW.

      The client screen used to resolve it itself — `packages.find(p => p.id ===
      sub.packageId)` against `GET /packages`, which returns `active = 1` ONLY.
      "Delete" on a package is an ARCHIVE (`active = 0`), so the moment a studio
      tidied its catalogue, every client still holding one of those packages
      rendered "Plan · Not yet" while their days went on counting down
      correctly. Reported across several clients on a live tenant.

      Two more ways the same lookup came back empty, both ordinary:
        · a repeat grant FOLDS into the live row, so `package_id` stays whichever
          package OPENED it — archive that one and the name goes even though a
          newer, live package was granted since;
        · legacy rows can carry `package_id` NULL (the old redemption lane
          created package-less subscriptions before /redeem was made a top-up).

      A screen cannot fix any of that with the catalogue it is given. The server
      knows the answer, so the server says it.
    */
    packageName: packageName ?? null,
    status: row.status,
    paymentStatus: row.payment_status,
    budgets,
    daysRemaining: overallDaysRemaining(budgets, nowIsoStr),
    /*
      The headline is a MAX across scopes, which is right for "is this still a
      customer" and misleading as a number on a screen: 70 workout days and 0
      meal days reads as "70 days left" while half of what they bought has
      lapsed. The breakdown ships alongside it so no surface has to choose
      between the two.
    */
    daysByFeature: daysByFeature(budgets, BUDGET_SCOPES, nowIsoStr),
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
      .prepare("UPDATE subject_subscriptions SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'active' AND budgets_json IS ?")
      .bind(now, row.id, row.budgets_json ?? null)
      .run()
      .catch(() => undefined);
    if (r && (r.meta?.changes ?? 0) > 0) return { ...row, status: "expired" };
  }
  return row;
}

/**
 * PATCH body — a true partial update: an omitted key leaves its column alone.
 *
 * `PackageBody.partial()` on its own does NOT give you that. `.partial()` wraps
 * each field in `.optional()` but leaves any `.default()` underneath it intact,
 * so `budgets` / `visibility` / `oncePerCustomer` still materialised their
 * defaults on every request: a PATCH that only renamed a package also wiped its
 * budgets, forced it back to `private`, and cleared once-per-customer. Those
 * three are re-declared here without defaults.
 *
 * `active` is the extra: DELETE /packages/:id only flips `active = 0`, and
 * nothing else in the codebase ever sets it back to 1 — without this, archiving
 * would be permanent.
 */
const PackagePatchBody = PackageBody.partial().extend({
  budgets: BudgetSpecs.optional(),
  visibility: Visibility.optional(),
  oncePerCustomer: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const commerceRoutes = new Hono<AppEnv>()
  // ── Packages ───────────────────────────────────────────────────────────────
  .get("/packages", async (c) => {
    const who = requireTenant(c)!;
    // Default = the live catalogue (what the client Shop sells). `?archived=1`
    // returns the archived ones so an owner can see and restore them.
    const archived = c.req.query("archived") === "1";
    const rows = await c.env.DB.prepare(
      "SELECT * FROM packages WHERE tenant_id = ? AND active = ? ORDER BY created_at DESC",
    )
      .bind(who.tenantId, archived ? 0 : 1)
      .all();
    return c.json({
      packages: (rows.results ?? []).map((p) => ({
        ...p,
        budgets: parseJson(p.budgets_json as string | null, []),
        addOns: parseJson(p.addons_json as string | null, []),
        flags: parseJson(p.flags_json as string | null, null),
        budgets_json: undefined,
        addons_json: undefined,
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
      `INSERT INTO packages (id, tenant_id, name, description, one_time_price_cents, monthly_price_cents, installment_months, budgets_json, addons_json, flags_json, visibility, restricted_subject_id, once_per_customer, pay_link, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id, who.tenantId, d.name, d.description ?? null, d.oneTimePriceCents ?? null,
        d.monthlyPriceCents ?? null, d.installmentMonths ?? null, j(d.budgets),
        d.addOns ? j(d.addOns) : null, d.flags ? j(d.flags) : null, d.visibility,
        d.restrictedClientId ?? null, d.oncePerCustomer ? 1 : 0, d.payLink ?? null, nowIso(),
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
    const parsed = PackagePatchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const sets: string[] = [];
    const binds: unknown[] = [];
    const put = (col: string, v: unknown) => (sets.push(`${col} = ?`), binds.push(v));
    if (d.name !== undefined) put("name", d.name);
    if (d.description !== undefined) put("description", d.description);
    if (d.oneTimePriceCents !== undefined) put("one_time_price_cents", d.oneTimePriceCents);
    if (d.monthlyPriceCents !== undefined) put("monthly_price_cents", d.monthlyPriceCents);
    if (d.payLink !== undefined) put("pay_link", d.payLink);
    if (d.installmentMonths !== undefined) put("installment_months", d.installmentMonths);
    if (d.budgets !== undefined) put("budgets_json", j(d.budgets));
    if (d.addOns !== undefined) put("addons_json", d.addOns ? j(d.addOns) : null);
    if (d.flags !== undefined) put("flags_json", d.flags ? j(d.flags) : null);
    if (d.visibility !== undefined) put("visibility", d.visibility);
    if (d.restrictedClientId !== undefined) put("restricted_subject_id", d.restrictedClientId);
    if (d.oncePerCustomer !== undefined) put("once_per_customer", d.oncePerCustomer ? 1 : 0);
    if (d.active !== undefined) put("active", d.active ? 1 : 0);
    if (sets.length === 0) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE packages SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds, c.req.param("id"))
      .run();
    return c.json({ ok: true });
  })

  /**
   * Archive, not erase. `active = 0` drops the package out of GET /packages, the
   * client Shop, the public marketplace payload and both Stripe checkout lanes
   * (all of which require `active = 1`) — but `subject_subscriptions` rows are
   * untouched, so anyone who already bought it keeps the exact budget days they
   * paid for. PATCH `{ active: true }` puts it back on sale.
   */
  .delete("/packages/:id", async (c) => {
    const who = requireTenant(c)!;
    const r = await c.env.DB.prepare("UPDATE packages SET active = 0 WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .run();
    if ((r.meta?.changes ?? 0) === 0) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  })

  // ── Client subscriptions ───────────────────────────────────────────────────
  .get("/subscriptions", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const now = nowIso();
    // LEFT JOIN with NO `active` filter: an archived package still named this
    // client's subscription, and hiding the name is not what archiving means.
    const rows = await c.env.DB.prepare(
      `SELECT s.*, p.name AS package_name
       FROM subject_subscriptions s LEFT JOIN packages p ON p.id = s.package_id
       WHERE s.subject_id = ? ORDER BY s.started_at DESC`,
    )
      .bind(clientId)
      .all<SubRow & { package_name: string | null }>();

    /*
      The LEDGER is the fallback, and it is the better answer where it exists.

      `subject_subscriptions.package_id` is only ever the package that OPENED
      the row; `subject_package_grants` is the append-only record of what was
      actually applied to it. So when the column is null (legacy redemption
      rows) or points at a package that has since been hard-deleted, the most
      recent grant against this subscription still knows what the client was
      given.
    */
    const grants = await c.env.DB.prepare(
      `SELECT g.subscription_id, p.name AS package_name
       FROM subject_package_grants g LEFT JOIN packages p ON p.id = g.package_id
       WHERE g.subject_id = ? AND p.name IS NOT NULL ORDER BY g.at DESC`,
    )
      .bind(clientId)
      .all<{ subscription_id: string | null; package_name: string }>();
    const latestGrantName = new Map<string, string>();
    for (const g of grants.results ?? []) {
      if (g.subscription_id && !latestGrantName.has(g.subscription_id)) latestGrantName.set(g.subscription_id, g.package_name);
    }

    const out = [];
    for (const row of rows.results ?? []) {
      out.push(subView(await reconcile(c.env.DB, row, now), now, row.package_name ?? latestGrantName.get(row.id) ?? null));
    }
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
      .first<{ id: string; name: string; budgets_json: string | null; addons_json: string | null; flags_json: string | null; once_per_customer: number; visibility: string; restricted_subject_id: string | null }>();
    if (!pkg) return c.json({ error: "package not found" }, 404);
    // A client-specific package can only be granted to its own client (staff may
    // still grant `private` grant-only packages to anyone).
    if (pkg.visibility === "client_specific" && pkg.restricted_subject_id && pkg.restricted_subject_id !== access.client.id) {
      return c.json({ error: "package is private to another client" }, 403);
    }

    const now = nowIso();
    /*
      The LEDGER answers this, not the subscription row's `package_id`.

      A repeat grant FOLDS into the client's live row, which keeps whichever
      package opened it — so "SELECT ... WHERE package_id = ?" said `no` forever
      for every package after the first, and a once-only package could be
      granted without limit, stacking days each time. `hasPriorPurchase` reads
      `subject_package_grants` ∪ that column, so existing data still counts.
    */
    if (pkg.once_per_customer && (await hasPriorPurchase(c.env.DB, access.client.id, pkg.id))) {
      return c.json({ error: "package is once per customer" }, 409);
    }

    // Queue-not-sum: extend the client's current NON-recurring subscription if
    // one is live, else open a new one. Recurring rows are owned by their Stripe
    // subscription (they renew off their own package) — never fold a manual grant
    // into one, matching grantClientPackage.
    const current = await c.env.DB.prepare(
      "SELECT * FROM subject_subscriptions WHERE subject_id = ? AND status = 'active' AND stripe_sub_id IS NULL ORDER BY started_at DESC LIMIT 1",
    )
      .bind(access.client.id)
      .first<SubRow>();

    const specs = parseJson<{ feature: Budget["feature"]; days: number }[]>(pkg.budgets_json, []);
    const purchasedAddOns = parseJson<{ addOnTypeId: string; quantity: number }[]>(pkg.addons_json, []);

    if (current) {
      // CAS append so a concurrent redeem / renewal on the same row can't lose
      // this grant's budget days (last-writer-wins on the JSON columns).
      const ok = await updateSubscriptionRunway(c.env.DB, current.id, (existing, addOnsPrev) => ({
        budgets: [...existing, ...buildBudgetsForPurchase(existing, specs, now)],
        addOns: mergeAddOnBalances(addOnsPrev, purchasedAddOns),
        extra: { sql: "updated_at = ?", binds: [now] },
      }));
      /*
        A RACED-OUT CAS IS A FAILED GRANT, AND IT USED TO REPORT SUCCESS.

        The return value was discarded: the write landed nowhere, the route
        answered 200 `{ok: true, extended: true}`, an audit row said the package
        was assigned, and the client was notified that their access had been
        extended. The coach had no way to know it had not. It is a 409 now, with
        nothing else written.
      */
      if (!ok) return c.json({ error: "couldn't extend this client's access just now — someone else was changing it. Try again." }, 409);
      await recordPackageGrant(c.env.DB, { id: newId("pgr"), tenantId: who.tenantId, subjectId: access.client.id, packageId: pkg.id, subscriptionId: current.id, source: "admin", days: specs, actorUserId: who.userId, at: now });
      await recordAudit(c.env, { tenantId: who.tenantId, clientId: access.client.id, actorUserId: who.userId, action: "package.assign", summary: `${pkg.name} (extended)`, ref: pkg.id });
      if (access.client.user_id && access.client.user_id !== who.userId) {
        await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "access_granted", title: "Your access was extended", message: `${pkg.name} — more time added`, vars: { coachName: c.get("user")?.name || "Your coach", packageName: pkg.name } });
      }
      return c.json({ ok: true, id: current.id, extended: true });
    }

    const id = newId("csub");
    const budgets = buildBudgetsForPurchase([], specs, now);
    await c.env.DB.prepare(
      `INSERT INTO subject_subscriptions (id, tenant_id, subject_id, package_id, status, payment_status, budgets_json, addons_json, flags_json, source, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 'none', ?, ?, ?, 'admin', ?, ?)`,
    )
      .bind(
        id, who.tenantId, access.client.id, pkg.id, j(budgets),
        j(mergeAddOnBalances([], purchasedAddOns)), pkg.flags_json, now, now,
      )
      .run();
    await recordPackageGrant(c.env.DB, { id: newId("pgr"), tenantId: who.tenantId, subjectId: access.client.id, packageId: pkg.id, subscriptionId: id, source: "admin", days: specs, actorUserId: who.userId, at: now });
    await recordAudit(c.env, { tenantId: who.tenantId, clientId: access.client.id, actorUserId: who.userId, action: "package.assign", summary: pkg.name, ref: pkg.id });
    if (access.client.user_id && access.client.user_id !== who.userId) {
      await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "access_granted", message: pkg.name, vars: { coachName: c.get("user")?.name || "Your coach", packageName: pkg.name } });
    }
    return c.json({ ok: true, id, extended: false }, 201);
  })

  /**
   * SET a client's remaining days — the correction an owner needs when the
   * numbers are wrong.
   *
   * ── Why this exists, and why only an owner may use it ───────────────────────
   *
   * Every other write in this file ADDS runway, which is correct for selling and
   * useless for repair. When a defect (or a coach's mistake, or a duplicated
   * webhook) has left a client holding days nobody sold them, there was no way to
   * say what the number should be — the only lever was to wait it out.
   *
   * It is OWNER-only, and that is not the usual role check being copied. A
   * trainer granting a package is bounded by the catalogue: the days come from a
   * package someone priced. This writes an arbitrary number directly onto a
   * customer's access, in both directions, and is the one control in the access
   * economy with no price attached. It is also the one an angry customer would
   * most like a junior member of staff to press.
   *
   * `reason` is REQUIRED and lands in the audit trail. A correction with no
   * stated cause is indistinguishable from a mistake six months later, and this
   * route exists precisely because nobody could reconstruct what happened.
   *
   * The client is NOT notified. A silent correction is right here: the common
   * case is taking back days that were never bought, and a push saying "your
   * access changed" invites a conversation the studio may not have started yet.
   * The audit row and the visible number are the record.
   */
  .post("/subscriptions/:id/days", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "only the studio owner can correct access days" }, 403);
    const parsed = z
      .object({
        feature: z.enum(BUDGET_FEATURES),
        days: z.number().int().min(0).max(3650),
        reason: z.string().min(3).max(300),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    const { feature, days, reason } = parsed.data;

    const row = await c.env.DB.prepare("SELECT * FROM subject_subscriptions WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first<SubRow>();
    if (!row) return c.json({ error: "not found" }, 404);
    // Tenant scope is not enough: the row names a client, and every client-scoped
    // write in this codebase goes through the same chokepoint.
    const access = await requireClientAccess(c, row.subject_id);
    if ("response" in access) return access.response;

    const now = nowIso();
    // The wildcard sets EVERY scope, one at a time, so "give them 30 days of
    // everything" is one action rather than two that queue against each other.
    const targets = feature === "all" ? BUDGET_SCOPES : [feature];
    const before = overallDaysRemaining(parseJson<Budget[]>(row.budgets_json, []), now);
    const ok = await updateSubscriptionRunway(c.env.DB, row.id, (budgets, addOns) => ({
      budgets: targets.reduce((acc, f) => setRemainingDays(acc, f, days, now, BUDGET_SCOPES), budgets),
      addOns,
      // A correction to a positive number RE-OPENS an expired subscription —
      // otherwise the owner sets 30 days on a lapsed client and the row stays
      // `expired`, which every gate reads as no access.
      extra: { sql: `status = ?, updated_at = ?`, binds: [days > 0 ? "active" : row.status, now] },
    }));
    if (!ok) return c.json({ error: "couldn't change the days just now — someone else was changing them. Try again." }, 409);

    const after = await c.env.DB.prepare("SELECT budgets_json FROM subject_subscriptions WHERE id = ?").bind(row.id).first<{ budgets_json: string | null }>();
    const nowDays = overallDaysRemaining(parseJson<Budget[]>(after?.budgets_json ?? null, []), now);
    await recordAudit(c.env, {
      tenantId: who.tenantId,
      clientId: access.client.id,
      actorUserId: who.userId,
      action: "access.days_set",
      summary: `${feature} set to ${days} day${days === 1 ? "" : "s"} (was ${before}, now ${nowDays}) — ${reason}`,
      ref: row.id,
    });
    return c.json({ ok: true, daysRemaining: nowDays });
  })

  /**
   * The grant HISTORY for one client — what was applied, when, by which lane.
   *
   * The subscription row cannot answer this: repeat purchases fold into it and
   * it keeps one `package_id`. Working out why a client has the days they have
   * was, until the ledger existed, impossible from inside the product.
   */
  .get("/subscriptions/history", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const rows = await c.env.DB.prepare(
      `SELECT g.id, g.package_id, g.source, g.days_json, g.at, p.name AS package_name
       FROM subject_package_grants g LEFT JOIN packages p ON p.id = g.package_id
       WHERE g.subject_id = ? ORDER BY g.at DESC LIMIT 100`,
    )
      .bind(access.client.id)
      .all();
    return c.json({
      grants: (rows.results ?? []).map((r) => ({
        id: r.id, packageId: r.package_id, packageName: r.package_name, source: r.source,
        days: parseJson(r.days_json as string | null, []), at: r.at,
      })),
    });
  })

  // ── Redemption codes ───────────────────────────────────────────────────────
  .get("/redemption-codes", async (c) => {
    const who = requireTenant(c)!;
    const rows = await c.env.DB.prepare(
      "SELECT id, code, days_to_add, target_feature, max_uses, used_count, restricted_package_id, restricted_subject_id, expires_at, active FROM redemption_codes WHERE tenant_id = ? ORDER BY created_at DESC",
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
        "INSERT INTO redemption_codes (id, tenant_id, code, days_to_add, target_feature, max_uses, used_by_json, restricted_package_id, restricted_subject_id, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)",
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
      .first<{ id: string; days_to_add: number; target_feature: Budget["feature"]; max_uses: number; used_count: number; used_by_json: string | null; restricted_package_id: string | null; restricted_subject_id: string | null; expires_at: string | null }>();
    // Disabled/unknown/expired/out-of-scope all read as "not found" — no oracle.
    if (!code) return c.json({ error: "code not found" }, 404);
    if (code.expires_at && code.expires_at < now) return c.json({ error: "code not found" }, 404);
    // Per-client lock: only the named client may redeem this code.
    if (code.restricted_subject_id && code.restricted_subject_id !== access.client.id) return c.json({ error: "code not found" }, 404);
    // Per-package lock: only a client who holds that package may redeem.
    if (code.restricted_package_id) {
      const owns = await hasPriorPurchase(c.env.DB, access.client.id, code.restricted_package_id);
      if (!owns) return c.json({ error: "code not found" }, 404);
    }

    /*
      A CODE TOPS ACCESS UP. IT DOES NOT CREATE IT.

      This route used to INSERT a fresh subscription when the client had none —
      `package_id` NULL, `source: 'redemption'` — which made any valid code a
      standalone access generator. A client calls this endpoint for themselves
      (`requireClientAccess` passes on their own record), so a code that leaked,
      was shared, or was simply guessed off a printed card granted a stranger the
      full product with no package behind it, no price, and nothing for the
      studio to reconcile against.

      A code is a bonus on something bought. So it requires the client to HOLD a
      package — the ledger ∪ the legacy column, the same question
      once-per-customer asks. Refused BEFORE the use slot is claimed, so a
      refused attempt costs the code nothing.

      This is deliberately not "has an ACTIVE runway": topping a lapsed client
      back up is exactly what these codes are for.
    */
    const holdsPackage = await c.env.DB.prepare(
      "SELECT 1 AS x FROM subject_subscriptions WHERE subject_id = ? AND package_id IS NOT NULL LIMIT 1",
    ).bind(access.client.id).first()
      ?? await c.env.DB.prepare(
        "SELECT 1 AS x FROM subject_package_grants WHERE subject_id = ? LIMIT 1",
      ).bind(access.client.id).first();
    if (!holdsPackage) {
      return c.json({ error: "This code adds time to a package you already have. Ask your coach to set you up first." }, 409);
    }

    // Per-client claim (atomic): the UNIQUE(code_id, client_id) child row dedupes
    // a second redemption by the same client without a lost-update on a JSON
    // array — a concurrent double-submit inserts once, the loser gets changes=0.
    const claim = await c.env.DB.prepare(
      "INSERT OR IGNORE INTO redemption_uses (code_id, subject_id, at) VALUES (?, ?, ?)",
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
      await c.env.DB.prepare("DELETE FROM redemption_uses WHERE code_id = ? AND subject_id = ?")
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
        "SELECT * FROM subject_subscriptions WHERE subject_id = ? AND status IN ('active','expired') AND stripe_sub_id IS NULL ORDER BY started_at DESC LIMIT 1",
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
        /*
          The client holds a package (checked above) but has no NON-recurring row
          to fold into — every row they have is owned by its own recurring
          subscription, which renews off its own package and must not be topped
          up by hand. Open the code's runway as its own row, carrying the package
          that entitled them to redeem so the row is never package-less.
        */
        const backing = await c.env.DB.prepare(
          "SELECT package_id FROM subject_subscriptions WHERE subject_id = ? AND package_id IS NOT NULL ORDER BY started_at DESC LIMIT 1",
        ).bind(access.client.id).first<{ package_id: string }>();
        await c.env.DB.prepare(
          `INSERT INTO subject_subscriptions (id, tenant_id, subject_id, package_id, status, payment_status, budgets_json, addons_json, source, started_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', 'none', ?, '[]', 'redemption', ?, ?)`,
        )
          .bind(
            newId("csub"), who.tenantId, access.client.id, backing?.package_id ?? null,
            j(buildBudgetsForPurchase([], codeSpec, now)), now, now,
          )
          .run();
      }
    } catch (err) {
      await c.env.DB.prepare("UPDATE redemption_codes SET used_count = used_count - 1 WHERE id = ? AND used_count > 0").bind(code.id).run().catch(() => undefined);
      await c.env.DB.prepare("DELETE FROM redemption_uses WHERE code_id = ? AND subject_id = ?").bind(code.id, access.client.id).run().catch(() => undefined);
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
