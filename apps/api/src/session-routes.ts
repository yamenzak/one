/**
 * Trainer sessions + add-on types (SPEC §8.9) — consultations consumed from a
 * client subscription's add-on balances.
 *
 * **The balance semantics, in one place** (BILLING-PLAN: a package's add-ons are
 * a paid, finite quantity):
 *
 * - **Booking** requires an unspent unit. "Unspent" nets off the units already
 *   promised to sessions still sitting in `scheduled` — otherwise a package that
 *   included 2 consultations books 20, because nothing is consumed until each one
 *   resolves. A booking with no unit left is REFUSED (409), unless the add-on
 *   type carries a `standalone_price_cents`, which is the sanctioned pay-per-
 *   session path: that session is booked unattached (`subscription_id = NULL`)
 *   and consumes nothing when it resolves.
 * - **`completed` and `no_show` both CONSUME** one unit. A no-show is a burnt
 *   slot for the studio — the client held the coach's hour — so refunding it (or,
 *   as before, consuming nothing at all) hands back a session they didn't attend.
 * - **`cancelled` (and re-opening to `scheduled`) REFUNDS** a unit, but only when
 *   the session had actually consumed one. Cancelling a still-`scheduled` session
 *   refunds nothing, because nothing was ever spent.
 * - A consuming transition on a session attached to a subscription with **no
 *   matching balance entry fails loudly** rather than completing for free.
 *
 * Every write to `addons_json` goes through `updateSubscriptionRunway`
 * (AGENTS.md §5) — four uncoordinated writers share that column, so a bare
 * read-modify-write here silently destroys paid budget days.
 */

import { Hono } from "hono";
import { z } from "zod";
import { remainingAddOnQuantity, type AddOnBalance } from "@kova/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { gateFeature, LIVE_ACCESS_STATUSES } from "./client-flags.js";
import { requireClientAccess, visibleClientIds } from "./clients.js";
import { updateSubscriptionRunway } from "./subscription-runway.js";
import { notify } from "./notify.js";
import { newId, nowIso } from "./ids.js";
import { parseJson } from "./db.js";

const staff = (c: { get: (k: "role") => string | null }) => c.get("role") === "owner" || c.get("role") === "trainer" || c.get("role") === "assistant";

/** The statuses that have SPENT a unit of the client's add-on balance. */
const CONSUMED_STATUSES = ["completed", "no_show"] as const;
const consumesUnit = (status: string): boolean => (CONSUMED_STATUSES as readonly string[]).includes(status);
/** The same set as a SQL predicate — the guard on the spend boundary. */
const CONSUMED_SQL = `status IN (${CONSUMED_STATUSES.map((s) => `'${s}'`).join(",")})`;

/** Units of `addOnTypeId` already promised to sessions that haven't resolved yet.
 *  Netting these off the remaining balance is what stops over-booking: nothing is
 *  consumed until a session completes, so without it the same unit books twice. */
async function outstandingBookings(db: D1Database, subscriptionId: string, addOnTypeId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM trainer_sessions WHERE subscription_id = ? AND addon_type_id = ? AND status = 'scheduled'")
    .bind(subscriptionId, addOnTypeId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export const sessionRoutes = new Hono<AppEnv>()
  // ── Add-on types (catalog) ─────────────────────────────────────────────────
  .get("/addon-types", async (c) => {
    const who = requireTenant(c)!;
    const rows = await c.env.DB.prepare("SELECT * FROM addon_types WHERE tenant_id = ? AND active = 1 ORDER BY label").bind(who.tenantId).all();
    return c.json({ addOnTypes: rows.results ?? [] });
  })
  .post("/addon-types", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    { const g = await gateFeature(c, "sessions"); if (g) return g; }
    const b = z.object({ label: z.string().min(1).max(80), slug: z.string().max(40).optional(), durationMinutes: z.number().int().positive().default(30), standalonePriceCents: z.number().int().min(0).nullish() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    const id = newId("aot");
    await c.env.DB.prepare("INSERT INTO addon_types (id, tenant_id, slug, label, kind, duration_minutes, standalone_price_cents, active) VALUES (?, ?, ?, ?, 'consultation', ?, ?, 1)")
      .bind(id, who.tenantId, b.data.slug ?? b.data.label.toLowerCase().replace(/\s+/g, "-"), b.data.label, b.data.durationMinutes, b.data.standalonePriceCents ?? null)
      .run();
    return c.json({ ok: true, id }, 201);
  })

  // ── Sessions ────────────────────────────────────────────────────────────────
  .get("/sessions", async (c) => {
    const who = requireTenant(c)!;
    const clientId = c.req.query("clientId");
    if (clientId) {
      const access = await requireClientAccess(c, clientId);
      if ("response" in access) return access.response;
      const rows = await c.env.DB.prepare("SELECT * FROM trainer_sessions WHERE client_id = ? ORDER BY scheduled_at DESC LIMIT 500").bind(clientId).all();
      return c.json({ sessions: rows.results ?? [] });
    }
    // No clientId = the front-desk schedule. Scope it to the roster the caller may
    // see: an owner/assistant runs the desk and legitimately sees everyone ("all"),
    // but a plain tenant match handed an UNASSIGNED trainer the whole studio's
    // schedule — every client's booking times plus the coach-authored `notes` on
    // them — which the client_trainers invariant is there to prevent.
    const scope = await visibleClientIds(c);
    if (scope !== "all" && scope.length === 0) return c.json({ sessions: [] });
    // Upcoming AND recent history. Filtering to `status = 'scheduled'` made every
    // completed / cancelled / no-showed session VANISH the moment it resolved, so
    // the front desk had no record of what actually ran (and no way to see, or
    // undo, a consumed unit). Resolved sessions come back bounded by a window —
    // `?historyDays=` (default 30, clamped 0..365) — so the schedule stays a page
    // rather than growing into an unbounded archive.
    const rawDays = Number(c.req.query("historyDays"));
    const historyDays = Number.isFinite(rawDays) ? Math.min(365, Math.max(0, rawDays)) : 30;
    const since = new Date(Date.now() - historyDays * 86_400_000).toISOString();
    const clauses = ["tenant_id = ?", "(status = 'scheduled' OR scheduled_at >= ?)"];
    const binds: unknown[] = [who.tenantId, since];
    if (scope !== "all") {
      clauses.push(`client_id IN (${scope.map(() => "?").join(",")})`);
      binds.push(...scope);
    }
    const rows = await c.env.DB.prepare(`SELECT * FROM trainer_sessions WHERE ${clauses.join(" AND ")} ORDER BY scheduled_at LIMIT 500`).bind(...binds).all();
    return c.json({ sessions: rows.results ?? [], historyDays });
  })

  .post("/sessions", async (c) => {
    const who = requireTenant(c)!;
    if (!staff(c)) return c.json({ error: "forbidden" }, 403);
    { const g = await gateFeature(c, "sessions"); if (g) return g; }
    const b = z.object({ clientId: z.string(), addOnTypeId: z.string(), scheduledAt: z.string(), durationMinutes: z.number().int().positive().default(30), notes: z.string().max(500).nullish() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, b.data.clientId);
    if ("response" in access) return access.response;

    // The add-on type must belong to THIS tenant — it also decides whether the
    // standalone (pay-per-session) path is open when no balance is left.
    const type = await c.env.DB.prepare("SELECT id, label, standalone_price_cents FROM addon_types WHERE id = ? AND tenant_id = ?")
      .bind(b.data.addOnTypeId, who.tenantId)
      .first<{ id: string; label: string; standalone_price_cents: number | null }>();
    if (!type) return c.json({ error: "unknown add-on type" }, 404);

    // Find a live subscription that still has an unspent unit of this add-on,
    // netting off the units already promised to sessions awaiting resolution.
    // A client may legitimately hold several live rows (BILLING-PLAN §7 stacks
    // packages), so scan them newest-first rather than trusting LIMIT 1.
    const ph = LIVE_ACCESS_STATUSES.map(() => "?").join(",");
    const subs = await c.env.DB.prepare(`SELECT id, addons_json FROM subject_subscriptions WHERE subject_id = ? AND tenant_id = ? AND status IN (${ph}) ORDER BY started_at DESC`)
      .bind(access.client.id, who.tenantId, ...LIVE_ACCESS_STATUSES)
      .all<{ id: string; addons_json: string | null }>();
    let subscriptionId: string | null = null;
    for (const s of subs.results ?? []) {
      const remaining = remainingAddOnQuantity(parseJson<AddOnBalance[]>(s.addons_json, []), type.id);
      if (!(remaining > 0)) continue;
      if (remaining - (await outstandingBookings(c.env.DB, s.id, type.id)) <= 0) continue;
      subscriptionId = s.id;
      break;
    }
    if (!subscriptionId && !((type.standalone_price_cents ?? 0) > 0)) {
      // No included unit and no standalone price to sell one at — refuse, and say
      // what would fix it, rather than booking a session nobody can complete.
      return c.json(
        {
          error: `${access.client.display_name ?? "This client"} has no ${type.label} left. Sell or grant a package that includes one, or give this add-on type a standalone price to book it as a paid extra.`,
          addOnTypeId: type.id,
        },
        409,
      );
    }

    const id = newId("sess");
    await c.env.DB.prepare("INSERT INTO trainer_sessions (id, tenant_id, client_id, trainer_user_id, subscription_id, addon_type_id, scheduled_at, duration_minutes, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)")
      .bind(id, who.tenantId, access.client.id, who.userId, subscriptionId, b.data.addOnTypeId, b.data.scheduledAt, b.data.durationMinutes, b.data.notes ?? null, nowIso())
      .run();
    if (access.client.user_id) {
      await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "session_booked", message: new Date(b.data.scheduledAt).toLocaleString(), vars: { sessionTime: new Date(b.data.scheduledAt).toLocaleString() } });
    }
    return c.json({ ok: true, id }, 201);
  })

  // Transition status. `completed`/`no_show` consume one add-on unit; going back
  // to `cancelled`/`scheduled` refunds one — see the module header.
  .patch("/sessions/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staff(c)) return c.json({ error: "forbidden" }, 403);
    // The POST paths gate on `sessions` (= the `frontDesk` entitlement) but this
    // one didn't, so a tenant downgraded off frontDesk could still complete
    // sessions — burning paid add-on units through a feature they no longer have.
    { const g = await gateFeature(c, "sessions"); if (g) return g; }
    const b = z.object({ status: z.enum(["scheduled", "completed", "cancelled", "no_show"]) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    const sessionId = c.req.param("id");
    const row = await c.env.DB.prepare("SELECT * FROM trainer_sessions WHERE id = ? AND tenant_id = ?").bind(sessionId, who.tenantId).first<{ status: string; completed_at: string | null; subscription_id: string | null; addon_type_id: string; client_id: string; scheduled_at: string }>();
    if (!row) return c.json({ error: "not found" }, 404);
    // Row-level scope on the session's client, BEFORE any write. This transition is
    // money-affecting: completing it decrements `quantityUsed` on the client's
    // subscription add-on balance (burning a consultation they paid for) and
    // cancelling it refunds one and fires a cancellation notification at them. With
    // only the tenant match in the WHERE above, a trainer with no client_trainers
    // assignment could consume or refund any same-tenant client's consultations.
    const access = await requireClientAccess(c, row.client_id);
    if ("response" in access) return access.response;
    const target = b.data.status;
    const now = nowIso();
    const wasConsumed = consumesUnit(row.status);
    const willConsume = consumesUnit(target);

    // A consuming transition must have a unit to consume. Before the fix a
    // completion whose subscription carried no matching balance silently no-op'd:
    // the session read "completed" and the studio's paid quantity never moved, so
    // an included consultation could be delivered for free, forever. Checked
    // BEFORE the status flip so there is nothing to compensate.
    if (willConsume && !wasConsumed && row.subscription_id) {
      const sub = await c.env.DB.prepare("SELECT addons_json FROM subject_subscriptions WHERE id = ? AND tenant_id = ?").bind(row.subscription_id, who.tenantId).first<{ addons_json: string | null }>();
      const balances = parseJson<AddOnBalance[]>(sub?.addons_json ?? null, []);
      if (!balances.some((x) => x.addOnTypeId === row.addon_type_id)) {
        return c.json({ error: "this session isn't attached to an add-on balance any more — re-book it against a package that includes this add-on", addOnTypeId: row.addon_type_id }, 409);
      }
    }

    // Atomic status transition. The spent<->unspent boundary is guarded so two
    // concurrent requests can't both cross it and each burn (or refund) a unit —
    // only the request that ACTUALLY transitions consumes/refunds.
    let changed: boolean;
    if (willConsume !== wasConsumed) {
      const guard = wasConsumed ? CONSUMED_SQL : `NOT (${CONSUMED_SQL})`;
      const r = await c.env.DB.prepare(`UPDATE trainer_sessions SET status = ?, completed_at = ? WHERE id = ? AND tenant_id = ? AND ${guard}`).bind(target, target === "completed" ? now : null, sessionId, who.tenantId).run();
      changed = (r.meta?.changes ?? 0) > 0;
    } else {
      const r = await c.env.DB.prepare("UPDATE trainer_sessions SET status = ?, completed_at = ? WHERE id = ? AND tenant_id = ?").bind(target, target === "completed" ? now : null, sessionId, who.tenantId).run();
      changed = (r.meta?.changes ?? 0) > 0;
    }

    const consume = changed && willConsume && !wasConsumed;
    const refund = changed && !willConsume && wasConsumed;
    if ((consume || refund) && row.subscription_id) {
      // `addons_json` shares its row with `budgets_json` and has four
      // uncoordinated writers, so the decrement goes through the ONE sanctioned
      // CAS writer (AGENTS.md §5) — a bare read-modify-write here would clobber a
      // concurrent renewal's budget days. Refunds clamp at zero: a unit can never
      // be handed back twice, because the status guard above only lets one request
      // cross the boundary.
      const ok = await updateSubscriptionRunway(c.env.DB, row.subscription_id, (budgets, addOns) => ({
        budgets,
        addOns: addOns.map((x) =>
          x.addOnTypeId === row.addon_type_id ? { ...x, quantityUsed: Math.max(0, x.quantityUsed + (consume ? 1 : -1)) } : x,
        ),
        extra: { sql: "updated_at = ?", binds: [now] },
      }));
      if (!ok) {
        // The balance did not move, so the status must not either — otherwise a
        // lost CAS silently gifts (or reclaims) a paid consultation. Put the
        // session back and tell the caller to retry.
        await c.env.DB.prepare("UPDATE trainer_sessions SET status = ?, completed_at = ? WHERE id = ? AND tenant_id = ?")
          .bind(row.status, row.completed_at, sessionId, who.tenantId)
          .run();
        return c.json({ error: "couldn't update the client's add-on balance — please try again" }, 409);
      }
    }
    if (changed && (target === "cancelled" || target === "no_show")) {
      const cl = await c.env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(row.client_id).first<{ user_id: string | null }>();
      if (cl?.user_id) await notify(c.env, { tenantId: who.tenantId, userId: cl.user_id, type: "session_cancelled", message: new Date(row.scheduled_at).toLocaleString(), vars: { sessionTime: new Date(row.scheduled_at).toLocaleString() } });
    }
    return c.json({ ok: true });
  });

/** Promo codes (website-native discounts on a tenant's client purchases) —
 *  distinct from redemption day top-ups. Percentage or fixed; optionally
 *  exclusive to a specific package and/or a specific client. Applied at checkout
 *  by the tenant rail (connect/pay-intent); never a Stripe coupon. */
export const promoRoutes = new Hono<AppEnv>()
  .get("/promo-codes", async (c) => {
    const who = requireTenant(c)!;
    const rows = await c.env.DB.prepare("SELECT id, code, discount_type, percent_off, amount_off_cents, restricted_package_id, restricted_subject_id, max_redemptions, redemption_count, expires_at, active FROM promo_codes WHERE tenant_id = ? AND scope = 'tenant' ORDER BY created_at DESC").bind(who.tenantId).all();
    return c.json({ codes: rows.results ?? [] });
  })
  .post("/promo-codes", async (c) => {
    const who = requireTenant(c)!;
    const b = z.object({ code: z.string().min(3).max(40), discountType: z.enum(["percent", "amount"]).default("percent"), percentOff: z.number().int().min(1).max(100).nullish(), amountOffCents: z.number().int().positive().nullish(), restrictedPackageId: z.string().nullish(), restrictedClientId: z.string().nullish(), maxRedemptions: z.number().int().positive().nullish(), expiresAt: z.string().nullish() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    const id = newId("promo");
    try {
      await c.env.DB.prepare("INSERT INTO promo_codes (id, tenant_id, code, discount_type, percent_off, amount_off_cents, restricted_package_id, restricted_subject_id, scope, max_redemptions, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'tenant', ?, ?, ?, ?)")
        .bind(id, who.tenantId, b.data.code.toUpperCase(), b.data.discountType, b.data.percentOff ?? null, b.data.amountOffCents ?? null, b.data.restrictedPackageId ?? null, b.data.restrictedClientId ?? null, b.data.maxRedemptions ?? null, b.data.expiresAt ?? null, who.userId, nowIso())
        .run();
    } catch { return c.json({ error: "code already exists" }, 409); }
    return c.json({ ok: true, id }, 201);
  })
  .delete("/promo-codes/:id", async (c) => {
    const who = requireTenant(c)!;
    await c.env.DB.prepare("UPDATE promo_codes SET active = 0 WHERE id = ? AND tenant_id = ? AND scope = 'tenant'").bind(c.req.param("id"), who.tenantId).run();
    return c.json({ ok: true });
  });
