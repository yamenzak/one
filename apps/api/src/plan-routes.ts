/**
 * Workout + meal plans and templates (SPEC §8.3, §8.4) — one generic
 * implementation parameterized by kind, since both share the same lifecycle:
 * draft → published (snapshots the active goal, supersedes the previous
 * published plan) → superseded/archived. Bodies are validated by
 * @mossa/protocol schemas and stored as JSON.
 */

import { Hono } from "hono";
import { z } from "zod";
import { WorkoutBody, MealBody, stripBodyForTemplate } from "@mossa/protocol";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { gateFeature } from "./client-flags.js";
import { notify } from "./notify.js";
import { recordAudit } from "./audit.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";
import { loadVariants, laneMatchSql } from "./plan-variants.js";

type Kind = "workout" | "meal";
/** The FEATURES key gating a client's own view of this plan kind. */
const planFeature = (kind: Kind) => (kind === "workout" ? ("workoutPlan" as const) : ("mealPlan" as const));
const planTable: Record<Kind, string> = { workout: "workout_plans", meal: "meal_plans" };
const templateTable: Record<Kind, string> = { workout: "workout_templates", meal: "meal_templates" };
const bodySchema = (kind: Kind) => (kind === "workout" ? WorkoutBody : MealBody);

interface PlanRow {
  id: string;
  tenant_id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: string;
  published_at: string | null;
  target_goal_json: string | null;
  body_json: string | null;
  variant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function planView(row: PlanRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    description: row.description,
    status: row.status,
    publishedAt: row.published_at,
    variantId: row.variant_id ?? null,
    targetGoal: parseJson<Record<string, unknown> | null>(row.target_goal_json, null),
    body: parseJson<Record<string, unknown>>(row.body_json, { days: [], mealOptions: [] }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CreatePlan = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
  /** Which plan lane this belongs to (null = the default lane). */
  variantId: z.string().nullish(),
});

const UpdatePlan = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullish().optional(),
  body: z.unknown().optional(),
});

function makePlanRoutes(kind: Kind): Hono<AppEnv> {
  const table = planTable[kind];
  const prefix = `/${kind}-plans`;

  return new Hono<AppEnv>()
    // List a client's plans. Clients see published/superseded only.
    .get(prefix, async (c) => {
      const clientId = c.req.query("clientId");
      if (!clientId) return c.json({ error: "clientId required" }, 400);
      const access = await requireClientAccess(c, clientId);
      if ("response" in access) return access.response;
      const gate = await gateFeature(c, planFeature(kind), clientId);
      if (gate) return gate;
      const isClient = c.get("role") === "client";
      const statusFilter = isClient ? "AND status IN ('published','superseded')" : "";
      const rows = await c.env.DB.prepare(
        `SELECT * FROM ${table} WHERE client_id = ? AND tenant_id = ? ${statusFilter} ORDER BY created_at DESC`,
      )
        .bind(clientId, access.client.tenant_id)
        .all<PlanRow>();
      // Lane context travels with the plan list so the client can pick the
      // published plan for the lane they're on and offer a lane switcher.
      const lanes = await loadVariants(c.env.DB, access.client.id, access.client.current_variant_id ?? null, access.client.default_lane_label ?? null);
      return c.json({ plans: (rows.results ?? []).map(planView), variants: lanes.variants, currentVariantId: lanes.currentVariantId, defaultLabel: lanes.defaultLabel });
    })

    .post(prefix, async (c) => {
      const who = requireTenant(c)!;
      const body = CreatePlan.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: "invalid body" }, 400);
      const access = await requireClientAccess(c, body.data.clientId);
      if ("response" in access) return access.response;
      const id = newId(kind === "workout" ? "wpl" : "mpl");
      const emptyBody = kind === "workout" ? { days: [] } : { customMealTypes: [], mealOptions: [] };
      await c.env.DB.prepare(
        `INSERT INTO ${table} (id, tenant_id, client_id, name, description, status, body_json, variant_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      )
        .bind(id, who.tenantId, body.data.clientId, body.data.name, body.data.description ?? null, j(emptyBody), body.data.variantId ?? null, who.userId, nowIso(), nowIso())
        .run();
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<PlanRow>();
      return c.json({ plan: planView(row!) }, 201);
    })

    // Instantiate a plan for a client FROM a template — copies the template's
    // body into a new draft. Template must be same-tenant and either shared or
    // the caller's own (mirrors the template list's visibility rule).
    .post(`${prefix}/from-template`, async (c) => {
      const who = requireTenant(c)!;
      const parsed = z
        .object({ clientId: z.string().min(1), templateId: z.string().min(1), name: z.string().min(1).max(120).optional(), variantId: z.string().nullish() })
        .safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid body" }, 400);
      const access = await requireClientAccess(c, parsed.data.clientId);
      if ("response" in access) return access.response;
      const tpl = await c.env.DB.prepare(
        `SELECT * FROM ${templateTable[kind]} WHERE id = ? AND tenant_id = ? AND (visibility = 'tenant' OR created_by = ?)`,
      )
        .bind(parsed.data.templateId, who.tenantId, who.userId)
        .first<TemplateRow>();
      if (!tpl) return c.json({ error: "template not found" }, 404);
      const id = newId(kind === "workout" ? "wpl" : "mpl");
      await c.env.DB.prepare(
        `INSERT INTO ${table} (id, tenant_id, client_id, name, description, status, body_json, variant_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      )
        .bind(id, who.tenantId, parsed.data.clientId, parsed.data.name ?? tpl.name, tpl.description ?? null, tpl.body_json, parsed.data.variantId ?? null, who.userId, nowIso(), nowIso())
        .run();
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<PlanRow>();
      return c.json({ plan: planView(row!) }, 201);
    })

    .get(`${prefix}/:id`, async (c) => {
      const who = requireTenant(c)!;
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
        .bind(c.req.param("id"), who.tenantId)
        .first<PlanRow>();
      if (!row) return c.json({ error: "not found" }, 404);
      const access = await requireClientAccess(c, row.client_id);
      if ("response" in access) return access.response;
      const gate = await gateFeature(c, planFeature(kind), row.client_id);
      if (gate) return gate;
      if (c.get("role") === "client" && row.status === "draft") return c.json({ error: "not found" }, 404);
      return c.json({ plan: planView(row) });
    })

    .patch(`${prefix}/:id`, async (c) => {
      const who = requireTenant(c)!;
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
        .bind(c.req.param("id"), who.tenantId)
        .first<PlanRow>();
      if (!row) return c.json({ error: "not found" }, 404);
      const access = await requireClientAccess(c, row.client_id);
      if ("response" in access) return access.response;
      if (row.status === "superseded" || row.status === "archived") {
        return c.json({ error: "read-only in this status" }, 409);
      }
      const parsed = UpdatePlan.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid body" }, 400);
      let bodyJson = row.body_json;
      if (parsed.data.body !== undefined) {
        const validated = bodySchema(kind).safeParse(parsed.data.body);
        if (!validated.success) return c.json({ error: "invalid plan body", issues: validated.error.issues }, 400);
        bodyJson = j(validated.data);
      }
      await c.env.DB.prepare(
        `UPDATE ${table} SET name = ?, description = ?, body_json = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(
          parsed.data.name ?? row.name,
          parsed.data.description !== undefined ? parsed.data.description : row.description,
          bodyJson,
          nowIso(),
          row.id,
        )
        .run();
      const updated = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(row.id).first<PlanRow>();
      return c.json({ plan: planView(updated!) });
    })

    // Publish: snapshot the active goal, supersede the previous published plan.
    .post(`${prefix}/:id/publish`, async (c) => {
      const who = requireTenant(c)!;
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
        .bind(c.req.param("id"), who.tenantId)
        .first<PlanRow>();
      if (!row) return c.json({ error: "not found" }, 404);
      const access = await requireClientAccess(c, row.client_id);
      if ("response" in access) return access.response;
      const goal = await c.env.DB.prepare(
        "SELECT targets_json FROM client_goals WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      )
        .bind(row.client_id)
        .first<{ targets_json: string | null }>();
      const now = nowIso();
      await c.env.DB.batch([
        c.env.DB.prepare(
          // Supersede only the previously-published plan IN THE SAME LANE, so
          // other lanes' published plans keep running in parallel.
          `UPDATE ${table} SET status = 'superseded', updated_at = ? WHERE client_id = ? AND status = 'published' AND ${laneMatchSql} AND id != ?`,
        ).bind(now, row.client_id, row.variant_id ?? null, row.id),
        c.env.DB.prepare(
          `UPDATE ${table} SET status = 'published', published_at = ?, target_goal_json = ?, updated_at = ? WHERE id = ?`,
        ).bind(now, goal?.targets_json ?? null, now, row.id),
      ]);
      const updated = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(row.id).first<PlanRow>();
      // Let the client know a fresh plan dropped.
      if (access.client.user_id) {
        await notify(c.env, { tenantId: who.tenantId, userId: access.client.user_id, type: "plan_published", title: `Your new ${kind} plan is ready`, message: row.name, link: kind === "workout" ? "/train" : "/eat", vars: { coachName: c.get("user")?.name || "Your coach", planName: row.name } });
      }
      await recordAudit(c.env, { tenantId: who.tenantId, clientId: row.client_id, actorUserId: who.userId, action: "plan.publish", summary: `${kind} · ${row.name}`, ref: row.id });
      return c.json({ plan: planView(updated!) });
    })

    // Status transitions: rollback to draft, archive, restore.
    .post(`${prefix}/:id/status`, async (c) => {
      const who = requireTenant(c)!;
      const body = z
        .object({ status: z.enum(["draft", "superseded", "archived"]) })
        .safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: "invalid body" }, 400);
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
        .bind(c.req.param("id"), who.tenantId)
        .first<PlanRow>();
      if (!row) return c.json({ error: "not found" }, 404);
      const access = await requireClientAccess(c, row.client_id);
      if ("response" in access) return access.response;
      await c.env.DB.prepare(`UPDATE ${table} SET status = ?, updated_at = ? WHERE id = ?`)
        .bind(body.data.status, nowIso(), row.id)
        .run();
      return c.json({ ok: true });
    })

    .delete(`${prefix}/:id`, async (c) => {
      const who = requireTenant(c)!;
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
        .bind(c.req.param("id"), who.tenantId)
        .first<PlanRow>();
      if (!row) return c.json({ error: "not found" }, 404);
      const access = await requireClientAccess(c, row.client_id);
      if ("response" in access) return access.response;
      if (row.status !== "draft") return c.json({ error: "only drafts can be deleted; archive instead" }, 409);
      await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(row.id).run();
      return c.json({ ok: true });
    });
}

interface TemplateRow {
  id: string;
  tenant_id: string;
  visibility: string;
  name: string;
  description: string | null;
  body_json: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const templateView = (row: TemplateRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  visibility: row.visibility,
  body: parseJson<Record<string, unknown>>(row.body_json, {}),
  createdBy: row.created_by,
  createdAt: row.created_at,
});

function makeTemplateRoutes(kind: Kind): Hono<AppEnv> {
  const table = templateTable[kind];
  const prefix = `/${kind}-templates`;

  return new Hono<AppEnv>()
    // Own templates + tenant-shared ones.
    .get(prefix, async (c) => {
      const who = requireTenant(c)!;
      const rows = await c.env.DB.prepare(
        `SELECT * FROM ${table} WHERE tenant_id = ? AND (visibility = 'tenant' OR created_by = ?) ORDER BY updated_at DESC`,
      )
        .bind(who.tenantId, who.userId)
        .all<TemplateRow>();
      return c.json({ templates: (rows.results ?? []).map(templateView) });
    })

    .post(prefix, async (c) => {
      const who = requireTenant(c)!;
      const parsed = z
        .object({
          name: z.string().min(1).max(120),
          description: z.string().max(2000).nullish(),
          visibility: z.enum(["private", "tenant"]).default("private"),
          body: z.unknown().optional(),
          /** Export-from-plan: strip client-specific loading (workout only). */
          stripWeights: z.boolean().default(false),
        })
        .safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid body" }, 400);
      let bodyJson = j(kind === "workout" ? { days: [] } : { customMealTypes: [], mealOptions: [] });
      if (parsed.data.body !== undefined) {
        const validated = bodySchema(kind).safeParse(parsed.data.body);
        if (!validated.success) return c.json({ error: "invalid template body" }, 400);
        const value =
          kind === "workout" && parsed.data.stripWeights
            ? stripBodyForTemplate(validated.data as never)
            : validated.data;
        bodyJson = j(value);
      }
      const id = newId(kind === "workout" ? "wtp" : "mtp");
      await c.env.DB.prepare(
        `INSERT INTO ${table} (id, tenant_id, visibility, name, description, body_json, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, who.tenantId, parsed.data.visibility, parsed.data.name, parsed.data.description ?? null, bodyJson, who.userId, nowIso(), nowIso())
        .run();
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<TemplateRow>();
      return c.json({ template: templateView(row!) }, 201);
    })

    .patch(`${prefix}/:id`, async (c) => {
      const who = requireTenant(c)!;
      const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
        .bind(c.req.param("id"), who.tenantId)
        .first<TemplateRow>();
      if (!row) return c.json({ error: "not found" }, 404);
      if (row.created_by !== who.userId && c.get("role") !== "owner") {
        return c.json({ error: "forbidden" }, 403);
      }
      const parsed = z
        .object({
          name: z.string().min(1).max(120).optional(),
          description: z.string().max(2000).nullish().optional(),
          visibility: z.enum(["private", "tenant"]).optional(),
          body: z.unknown().optional(),
        })
        .safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid body" }, 400);
      let bodyJson = row.body_json;
      if (parsed.data.body !== undefined) {
        const validated = bodySchema(kind).safeParse(parsed.data.body);
        if (!validated.success) return c.json({ error: "invalid template body" }, 400);
        bodyJson = j(validated.data);
      }
      await c.env.DB.prepare(
        `UPDATE ${table} SET name = ?, description = ?, visibility = ?, body_json = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(
          parsed.data.name ?? row.name,
          parsed.data.description !== undefined ? parsed.data.description : row.description,
          parsed.data.visibility ?? row.visibility,
          bodyJson,
          nowIso(),
          row.id,
        )
        .run();
      return c.json({ ok: true });
    })

    .delete(`${prefix}/:id`, async (c) => {
      const who = requireTenant(c)!;
      const row = await c.env.DB.prepare(`SELECT created_by FROM ${table} WHERE id = ? AND tenant_id = ?`)
        .bind(c.req.param("id"), who.tenantId)
        .first<{ created_by: string }>();
      if (!row) return c.json({ error: "not found" }, 404);
      if (row.created_by !== who.userId && c.get("role") !== "owner") {
        return c.json({ error: "forbidden" }, 403);
      }
      await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(c.req.param("id")).run();
      return c.json({ ok: true });
    });
}

export const planRoutes = new Hono<AppEnv>()
  .route("/", makePlanRoutes("workout"))
  .route("/", makePlanRoutes("meal"))
  .route("/", makeTemplateRoutes("workout"))
  .route("/", makeTemplateRoutes("meal"));
