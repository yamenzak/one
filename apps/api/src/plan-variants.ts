/**
 * Plan lanes (variants) — parallel plan tracks for a single client, e.g. "Work
 * week" vs "Off week" or "Night shift" vs "Morning shift". Each workout/meal
 * plan belongs to a lane; publishing supersedes only within its own lane, so a
 * client can have one published plan PER lane. `current_variant_id` on the
 * client is the lane they're on right now (NULL = the default lane, which is
 * exactly today's single-plan behavior).
 *
 * Lanes are client-level (shared across workout + meal), so one switch flips
 * both surfaces — the natural model for someone whose whole week changes.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { recordAudit } from "./audit.js";
import { newId, nowIso } from "./ids.js";

export interface VariantRow {
  id: string;
  label: string;
  ord: number;
  archived: number;
}

/** Load a client's lanes (non-archived first, by order) + the current lane id,
 *  clamped: if the stored current lane is missing/archived, fall to default.
 *  `defaultLabel` is the display name of the NULL default lane ("Main" unless
 *  the coach renamed it). */
export async function loadVariants(
  db: D1Database,
  clientId: string,
  currentVariantId: string | null,
  defaultLabel: string | null,
): Promise<{ variants: { id: string; label: string; ord: number; archived: boolean }[]; currentVariantId: string | null; defaultLabel: string }> {
  const rows = await db
    .prepare("SELECT id, label, ord, archived FROM plan_variants WHERE client_id = ? ORDER BY archived, ord, created_at")
    .bind(clientId)
    .all<VariantRow>();
  const variants = (rows.results ?? []).map((r) => ({ id: r.id, label: r.label, ord: r.ord, archived: !!r.archived }));
  const live = variants.find((v) => v.id === currentVariantId && !v.archived);
  return { variants, currentVariantId: live ? live.id : null, defaultLabel: defaultLabel || "Main" };
}

/** The lane a plan read should resolve to for this client right now. */
export function resolveCurrentVariantId(variants: { id: string; archived: boolean }[], stored: string | null): string | null {
  const live = variants.find((v) => v.id === stored && !v.archived);
  return live ? live.id : null;
}

/** SQL fragment + bind value to match "this lane" (NULL default lane included). */
export const laneMatchSql = "COALESCE(variant_id, '') = COALESCE(?, '')";

export const planVariantRoutes = new Hono<AppEnv>()
  .get("/clients/:clientId/variants", async (c) => {
    const access = await requireClientAccess(c, c.req.param("clientId"));
    if ("response" in access) return access.response;
    return c.json(await loadVariants(c.env.DB, access.client.id, access.client.current_variant_id ?? null, access.client.default_lane_label ?? null));
  })

  // Rename the default (Main) lane — the NULL lane has no plan_variants row, so
  // its label lives on the client. Blank/"Main" resets to the built-in name.
  .patch("/clients/:clientId/default-lane", async (c) => {
    const who = requireTenant(c)!;
    const access = await requireClientAccess(c, c.req.param("clientId"));
    if ("response" in access) return access.response;
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({ label: z.string().max(60).nullable() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const label = parsed.data.label?.trim();
    const stored = label && label.toLowerCase() !== "main" ? label : null;
    await c.env.DB.prepare("UPDATE clients SET default_lane_label = ? WHERE id = ?").bind(stored, access.client.id).run();
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: who.userId, action: "variant.update", summary: stored ?? "Main", ref: "default" });
    return c.json({ ok: true, defaultLabel: stored || "Main" });
  })

  // Create a lane (coaching action — staff only).
  .post("/clients/:clientId/variants", async (c) => {
    const who = requireTenant(c)!;
    const access = await requireClientAccess(c, c.req.param("clientId"));
    if ("response" in access) return access.response;
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({ label: z.string().min(1).max(60) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const countRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM plan_variants WHERE client_id = ?").bind(access.client.id).first<{ n: number }>();
    const id = newId("lane");
    await c.env.DB.prepare(
      "INSERT INTO plan_variants (id, tenant_id, client_id, label, ord, archived, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    )
      .bind(id, access.client.tenant_id, access.client.id, parsed.data.label, countRow?.n ?? 0, nowIso())
      .run();
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: who.userId, action: "variant.create", summary: parsed.data.label, ref: id });
    return c.json({ id }, 201);
  })

  // Rename / archive a lane (staff only).
  .patch("/clients/:clientId/variants/:variantId", async (c) => {
    const who = requireTenant(c)!;
    const access = await requireClientAccess(c, c.req.param("clientId"));
    if ("response" in access) return access.response;
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({ label: z.string().min(1).max(60).optional(), archived: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const row = await c.env.DB.prepare("SELECT id, label, archived FROM plan_variants WHERE id = ? AND client_id = ?")
      .bind(c.req.param("variantId"), access.client.id)
      .first<VariantRow>();
    if (!row) return c.json({ error: "not found" }, 404);
    await c.env.DB.prepare("UPDATE plan_variants SET label = ?, archived = ? WHERE id = ?")
      .bind(parsed.data.label ?? row.label, parsed.data.archived != null ? (parsed.data.archived ? 1 : 0) : row.archived, row.id)
      .run();
    // Archiving the lane the client is on drops them back to the default lane.
    if (parsed.data.archived && access.client.current_variant_id === row.id) {
      await c.env.DB.prepare("UPDATE clients SET current_variant_id = NULL WHERE id = ?").bind(access.client.id).run();
    }
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: who.userId, action: "variant.update", summary: parsed.data.label ?? row.label, ref: row.id });
    return c.json({ ok: true });
  })

  // Switch the client's current lane (client or staff — it's the client's life).
  .patch("/clients/:clientId/current-variant", async (c) => {
    const access = await requireClientAccess(c, c.req.param("clientId"));
    if ("response" in access) return access.response;
    const parsed = z.object({ variantId: z.string().nullable() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    let target: string | null = parsed.data.variantId;
    if (target) {
      const ok = await c.env.DB.prepare("SELECT id FROM plan_variants WHERE id = ? AND client_id = ? AND archived = 0")
        .bind(target, access.client.id)
        .first<{ id: string }>();
      if (!ok) return c.json({ error: "unknown lane" }, 400);
    } else {
      target = null;
    }
    await c.env.DB.prepare("UPDATE clients SET current_variant_id = ? WHERE id = ?").bind(target, access.client.id).run();
    return c.json({ ok: true, currentVariantId: target });
  });
