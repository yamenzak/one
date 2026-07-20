/**
 * Trainer sessions + add-on types (SPEC §8.9) — consultations consumed from a
 * client subscription's add-on balances. Scheduling a session against a balance
 * decrements it on completion and refunds on cancel (ByShujaa parity).
 */

import { Hono } from "hono";
import { z } from "zod";
import { remainingAddOnQuantity, type AddOnBalance } from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { hasFeature } from "./billing-store.js";
import { requireClientAccess } from "./clients.js";
import { notify } from "./notify.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";

const staff = (c: { get: (k: "role") => string | null }) => c.get("role") === "owner" || c.get("role") === "trainer" || c.get("role") === "assistant";

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
    if (!(await hasFeature(c.env.DB, who.tenantId, "frontDesk"))) return c.json({ error: "frontDesk not in your plan" }, 403);
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
    const rows = await c.env.DB.prepare("SELECT * FROM trainer_sessions WHERE tenant_id = ? AND status = 'scheduled' ORDER BY scheduled_at LIMIT 500").bind(who.tenantId).all();
    return c.json({ sessions: rows.results ?? [] });
  })

  .post("/sessions", async (c) => {
    const who = requireTenant(c)!;
    if (!staff(c)) return c.json({ error: "forbidden" }, 403);
    if (!(await hasFeature(c.env.DB, who.tenantId, "frontDesk"))) return c.json({ error: "frontDesk not in your plan" }, 403);
    const b = z.object({ clientId: z.string(), addOnTypeId: z.string(), scheduledAt: z.string(), durationMinutes: z.number().int().positive().default(30), notes: z.string().max(500).nullish() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, b.data.clientId);
    if ("response" in access) return access.response;
    // Check the client has an add-on balance.
    const sub = await c.env.DB.prepare("SELECT id, addons_json FROM client_subscriptions WHERE client_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1").bind(access.client.id).first<{ id: string; addons_json: string | null }>();
    if (sub && remainingAddOnQuantity(parseJson<AddOnBalance[]>(sub.addons_json, []), b.data.addOnTypeId) <= 0) {
      // Allowed to schedule anyway (coach discretion); balance only consumed on complete.
    }
    const id = newId("sess");
    await c.env.DB.prepare("INSERT INTO trainer_sessions (id, tenant_id, client_id, trainer_user_id, subscription_id, addon_type_id, scheduled_at, duration_minutes, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)")
      .bind(id, who.tenantId, access.client.id, who.userId, sub?.id ?? null, b.data.addOnTypeId, b.data.scheduledAt, b.data.durationMinutes, b.data.notes ?? null, nowIso())
      .run();
    if (access.client.user_id) {
      await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "session_booked", title: "Session booked", message: new Date(b.data.scheduledAt).toLocaleString(), link: "/wellness" });
    }
    return c.json({ ok: true, id }, 201);
  })

  // Transition status; completing consumes one add-on unit, cancelling refunds.
  .patch("/sessions/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staff(c)) return c.json({ error: "forbidden" }, 403);
    const b = z.object({ status: z.enum(["scheduled", "completed", "cancelled", "no_show"]) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    const sessionId = c.req.param("id");
    const row = await c.env.DB.prepare("SELECT * FROM trainer_sessions WHERE id = ? AND tenant_id = ?").bind(sessionId, who.tenantId).first<{ status: string; subscription_id: string | null; addon_type_id: string; client_id: string; scheduled_at: string }>();
    if (!row) return c.json({ error: "not found" }, 404);
    const target = b.data.status;

    // Atomic status transition. The completed<->not-completed boundary is guarded
    // so two concurrent requests can't both flip the same session and each burn
    // an add-on unit — only the request that ACTUALLY transitions consumes/refunds.
    let changed: boolean;
    if (target === "completed" && row.status !== "completed") {
      const r = await c.env.DB.prepare("UPDATE trainer_sessions SET status = 'completed', completed_at = ? WHERE id = ? AND tenant_id = ? AND status != 'completed'").bind(nowIso(), sessionId, who.tenantId).run();
      changed = (r.meta?.changes ?? 0) > 0;
    } else if (target !== "completed" && row.status === "completed") {
      const r = await c.env.DB.prepare("UPDATE trainer_sessions SET status = ?, completed_at = NULL WHERE id = ? AND tenant_id = ? AND status = 'completed'").bind(target, sessionId, who.tenantId).run();
      changed = (r.meta?.changes ?? 0) > 0;
    } else {
      const r = await c.env.DB.prepare("UPDATE trainer_sessions SET status = ?, completed_at = ? WHERE id = ? AND tenant_id = ?").bind(target, target === "completed" ? nowIso() : null, sessionId, who.tenantId).run();
      changed = (r.meta?.changes ?? 0) > 0;
    }

    const consume = changed && target === "completed" && row.status !== "completed";
    const refund = changed && target !== "completed" && row.status === "completed";
    if ((consume || refund) && row.subscription_id) {
      // CAS retry on addons_json so two different sessions completing concurrently
      // on the same subscription can't lose one decrement (last-writer-wins).
      for (let attempt = 1; attempt <= 5; attempt++) {
        const sub = await c.env.DB.prepare("SELECT addons_json FROM client_subscriptions WHERE id = ?").bind(row.subscription_id).first<{ addons_json: string | null }>();
        const prev = sub?.addons_json ?? null;
        const balances = parseJson<AddOnBalance[]>(prev, []);
        const bal = balances.find((x) => x.addOnTypeId === row.addon_type_id);
        if (!bal) break;
        bal.quantityUsed = Math.max(0, bal.quantityUsed + (consume ? 1 : -1));
        const w = await c.env.DB.prepare("UPDATE client_subscriptions SET addons_json = ? WHERE id = ? AND addons_json IS ?").bind(j(balances), row.subscription_id, prev).run();
        if ((w.meta?.changes ?? 0) > 0) break;
      }
    }
    if (changed && (target === "cancelled" || target === "no_show")) {
      const cl = await c.env.DB.prepare("SELECT user_id FROM clients WHERE id = ?").bind(row.client_id).first<{ user_id: string | null }>();
      if (cl?.user_id) await notify(c.env, { tenantId: who.tenantId, userId: cl.user_id, type: "session_cancelled", title: "Your session was cancelled", message: new Date(row.scheduled_at).toLocaleString(), link: "/wellness" });
    }
    return c.json({ ok: true });
  });

/** Promo codes (Stripe discounts) — distinct from redemption day top-ups. */
export const promoRoutes = new Hono<AppEnv>()
  .get("/promo-codes", async (c) => {
    const who = requireTenant(c)!;
    const rows = await c.env.DB.prepare("SELECT id, code, discount_type, percent_off, amount_off_cents, max_redemptions, redemption_count, expires_at, active FROM promo_codes WHERE tenant_id = ? ORDER BY created_at DESC").bind(who.tenantId).all();
    return c.json({ codes: rows.results ?? [] });
  })
  .post("/promo-codes", async (c) => {
    const who = requireTenant(c)!;
    const b = z.object({ code: z.string().min(3).max(40), discountType: z.enum(["percent", "amount"]).default("percent"), percentOff: z.number().int().min(1).max(100).nullish(), amountOffCents: z.number().int().positive().nullish(), maxRedemptions: z.number().int().positive().nullish(), expiresAt: z.string().nullish() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    const id = newId("promo");
    try {
      await c.env.DB.prepare("INSERT INTO promo_codes (id, tenant_id, code, discount_type, percent_off, amount_off_cents, max_redemptions, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, who.tenantId, b.data.code.toUpperCase(), b.data.discountType, b.data.percentOff ?? null, b.data.amountOffCents ?? null, b.data.maxRedemptions ?? null, b.data.expiresAt ?? null, who.userId, nowIso())
        .run();
    } catch { return c.json({ error: "code already exists" }, 409); }
    return c.json({ ok: true, id }, 201);
  })
  .delete("/promo-codes/:id", async (c) => {
    const who = requireTenant(c)!;
    await c.env.DB.prepare("UPDATE promo_codes SET active = 0 WHERE id = ? AND tenant_id = ?").bind(c.req.param("id"), who.tenantId).run();
    return c.json({ ok: true });
  });
