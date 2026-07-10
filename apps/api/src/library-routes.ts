/**
 * Libraries (SPEC §8.3, §8.4) — exercises + foods. Tenant-scoped with a
 * platform lane (tenant_id NULL = platform seed, readable by everyone).
 * External-provider fan-out search arrives with the nutrition phase; the
 * local CRUD + barcode-first lookup land here.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { newId, nowIso } from "./ids.js";

const CreateExercise = z.object({
  name: z.string().min(1).max(120),
  muscleGroups: z.array(z.string()).default([]),
  secondaryMuscleGroups: z.array(z.string()).default([]),
  equipment: z.array(z.string()).default([]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).nullish(),
  force: z.enum(["push", "pull", "static"]).nullish(),
  mechanic: z.enum(["compound", "isolation"]).nullish(),
  category: z.string().max(40).nullish(),
  instructionsMd: z.string().max(10_000).nullish(),
  visibility: z.enum(["private", "tenant"]).default("tenant"),
});

const CreateFood = z.object({
  name: z.string().min(1).max(160),
  brand: z.string().max(120).nullish(),
  barcode: z.string().max(40).nullish(),
  servingSize: z.number().positive().default(100),
  servingUnit: z.string().max(20).default("g"),
  calories: z.number().min(0),
  proteinG: z.number().min(0).default(0),
  carbsG: z.number().min(0).default(0),
  fatG: z.number().min(0).default(0),
  fiberG: z.number().min(0).default(0),
  sugarG: z.number().min(0).default(0),
  sodiumMg: z.number().min(0).default(0),
  source: z.string().max(30).default("custom"),
  sourceId: z.string().max(80).nullish(),
});

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export const libraryRoutes = new Hono<AppEnv>()
  // ── Exercises ──────────────────────────────────────────────────────────────
  .get("/exercises", async (c) => {
    const who = requireTenant(c)!;
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const muscle = c.req.query("muscle");
    let sql =
      "SELECT * FROM exercises WHERE active = 1 AND (tenant_id IS NULL OR tenant_id = ?)";
    const binds: unknown[] = [who.tenantId];
    if (q) {
      sql += " AND LOWER(name) LIKE ?";
      binds.push(`%${q}%`);
    }
    if (muscle) {
      sql += " AND (muscle_groups LIKE ? OR secondary_muscle_groups LIKE ?)";
      binds.push(`%${muscle}%`, `%${muscle}%`);
    }
    sql += " ORDER BY name LIMIT 100";
    const rows = await c.env.DB.prepare(sql).bind(...binds).all();
    return c.json({ exercises: rows.results ?? [] });
  })

  .post("/exercises", async (c) => {
    const who = requireTenant(c)!;
    const parsed = CreateExercise.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const id = newId("exr");
    await c.env.DB.prepare(
      `INSERT INTO exercises (id, tenant_id, visibility, name, slug, muscle_groups, secondary_muscle_groups, equipment, difficulty, force, mechanic, category, instructions_md, source, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?)`,
    )
      .bind(
        id, who.tenantId, d.visibility, d.name, slugify(d.name),
        d.muscleGroups.join(","), d.secondaryMuscleGroups.join(","), d.equipment.join(","),
        d.difficulty ?? null, d.force ?? null, d.mechanic ?? null, d.category ?? null,
        d.instructionsMd ?? null, who.userId, nowIso(),
      )
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .patch("/exercises/:id", async (c) => {
    const who = requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT id FROM exercises WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first();
    if (!row) return c.json({ error: "not found" }, 404); // platform rows are read-only
    const parsed = CreateExercise.partial().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (d.name !== undefined) (sets.push("name = ?, slug = ?"), binds.push(d.name, slugify(d.name)));
    if (d.muscleGroups !== undefined) (sets.push("muscle_groups = ?"), binds.push(d.muscleGroups.join(",")));
    if (d.secondaryMuscleGroups !== undefined) (sets.push("secondary_muscle_groups = ?"), binds.push(d.secondaryMuscleGroups.join(",")));
    if (d.equipment !== undefined) (sets.push("equipment = ?"), binds.push(d.equipment.join(",")));
    if (d.difficulty !== undefined) (sets.push("difficulty = ?"), binds.push(d.difficulty));
    if (d.force !== undefined) (sets.push("force = ?"), binds.push(d.force));
    if (d.mechanic !== undefined) (sets.push("mechanic = ?"), binds.push(d.mechanic));
    if (d.category !== undefined) (sets.push("category = ?"), binds.push(d.category));
    if (d.instructionsMd !== undefined) (sets.push("instructions_md = ?"), binds.push(d.instructionsMd));
    if (d.visibility !== undefined) (sets.push("visibility = ?"), binds.push(d.visibility));
    if (sets.length === 0) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE exercises SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds, c.req.param("id"))
      .run();
    return c.json({ ok: true });
  })

  .delete("/exercises/:id", async (c) => {
    const who = requireTenant(c)!;
    await c.env.DB.prepare("UPDATE exercises SET active = 0 WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  })

  // ── Foods ──────────────────────────────────────────────────────────────────
  .get("/foods", async (c) => {
    const who = requireTenant(c)!;
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    let sql = "SELECT * FROM foods WHERE active = 1 AND (tenant_id IS NULL OR tenant_id = ?)";
    const binds: unknown[] = [who.tenantId];
    if (q) {
      sql += " AND LOWER(name) LIKE ?";
      binds.push(`%${q}%`);
    }
    sql += " ORDER BY verified DESC, name LIMIT 60";
    const rows = await c.env.DB.prepare(sql).bind(...binds).all();
    return c.json({ foods: rows.results ?? [] });
  })

  // Local-first barcode lookup (external fallback arrives with nutrition phase).
  .get("/foods/barcode", async (c) => {
    const who = requireTenant(c)!;
    const code = c.req.query("code");
    if (!code) return c.json({ error: "code required" }, 400);
    const row = await c.env.DB.prepare(
      "SELECT * FROM foods WHERE barcode = ? AND active = 1 AND (tenant_id IS NULL OR tenant_id = ?) LIMIT 1",
    )
      .bind(code, who.tenantId)
      .first();
    return c.json({ food: row ?? null, source: row ? "local" : null });
  })

  // Clients may create (barcode/scan auto-import) — rows land unverified.
  .post("/foods", async (c) => {
    const who = requireTenant(c)!;
    const parsed = CreateFood.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    // Dedup by (source, sourceId) — re-imports update + reactivate.
    if (d.sourceId) {
      const existing = await c.env.DB.prepare(
        "SELECT id FROM foods WHERE source = ? AND source_id = ?",
      )
        .bind(d.source, d.sourceId)
        .first<{ id: string }>();
      if (existing) {
        await c.env.DB.prepare(
          "UPDATE foods SET name = ?, brand = ?, barcode = ?, serving_size = ?, serving_unit = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sodium_mg = ?, active = 1 WHERE id = ?",
        )
          .bind(
            d.name, d.brand ?? null, d.barcode ?? null, d.servingSize, d.servingUnit, d.calories,
            d.proteinG, d.carbsG, d.fatG, d.fiberG, d.sugarG, d.sodiumMg, existing.id,
          )
          .run();
        return c.json({ ok: true, id: existing.id, imported: false });
      }
    }
    const id = newId("food");
    const isStaff = c.get("role") !== "client";
    await c.env.DB.prepare(
      `INSERT INTO foods (id, tenant_id, name, brand, barcode, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source, source_id, verified, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id, who.tenantId, d.name, d.brand ?? null, d.barcode ?? null, d.servingSize, d.servingUnit,
        d.calories, d.proteinG, d.carbsG, d.fatG, d.fiberG, d.sugarG, d.sodiumMg,
        d.source, d.sourceId ?? null, isStaff ? 1 : 0, who.userId, nowIso(),
      )
      .run();
    return c.json({ ok: true, id, imported: true }, 201);
  })

  .patch("/foods/:id", async (c) => {
    const who = requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT id FROM foods WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first();
    if (!row) return c.json({ error: "not found" }, 404);
    const parsed = CreateFood.partial().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const map: Record<string, unknown> = {
      name: d.name,
      brand: d.brand,
      barcode: d.barcode,
      serving_size: d.servingSize,
      serving_unit: d.servingUnit,
      calories: d.calories,
      protein_g: d.proteinG,
      carbs_g: d.carbsG,
      fat_g: d.fatG,
      fiber_g: d.fiberG,
      sugar_g: d.sugarG,
      sodium_mg: d.sodiumMg,
    };
    const sets = Object.entries(map).filter(([, v]) => v !== undefined);
    if (sets.length === 0) return c.json({ ok: true });
    await c.env.DB.prepare(
      `UPDATE foods SET ${sets.map(([k]) => `${k} = ?`).join(", ")}, verified = 1 WHERE id = ?`,
    )
      .bind(...sets.map(([, v]) => v), c.req.param("id"))
      .run();
    return c.json({ ok: true });
  })

  .delete("/foods/:id", async (c) => {
    const who = requireTenant(c)!;
    await c.env.DB.prepare("UPDATE foods SET active = 0 WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  });
