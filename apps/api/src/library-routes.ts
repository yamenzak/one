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
import { seedExercises } from "./exercise-seed.js";

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
  thumbUrl: z.string().max(400).nullish(),
  thumb2Url: z.string().max(400).nullish(),
  videoUrl: z.string().max(400).nullish(),
  visibility: z.enum(["private", "tenant"]).default("tenant"),
});

const CreateFood = z.object({
  name: z.string().min(1).max(160),
  brand: z.string().max(120).nullish(),
  barcode: z.string().max(40).nullish(),
  description: z.string().max(2_000).nullish(),
  imageUrl: z.string().max(400).nullish(),
  servingSize: z.number().positive().default(100),
  servingUnit: z.string().max(20).default("g"),
  calories: z.number().min(0),
  proteinG: z.number().min(0).default(0),
  carbsG: z.number().min(0).default(0),
  fatG: z.number().min(0).default(0),
  fiberG: z.number().min(0).default(0),
  sugarG: z.number().min(0).default(0),
  sodiumMg: z.number().min(0).default(0),
  saturatedFatG: z.number().min(0).default(0),
  cholesterolMg: z.number().min(0).default(0),
  potassiumMg: z.number().min(0).default(0),
  calciumMg: z.number().min(0).default(0),
  ironMg: z.number().min(0).default(0),
  visibility: z.enum(["private", "tenant"]).default("tenant"),
  source: z.string().max(30).default("custom"),
  sourceId: z.string().max(80).nullish(),
});

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

type FoodInput = z.infer<typeof CreateFood>;

/** Insert a tenant-owned food row (staff rows land verified). Returns the id. */
async function insertFood(
  db: D1Database,
  tenantId: string,
  userId: string,
  isStaff: boolean,
  d: FoodInput,
): Promise<string> {
  const id = newId("food");
  await db.prepare(
    `INSERT INTO foods (id, tenant_id, name, brand, barcode, description, image_url, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, saturated_fat_g, cholesterol_mg, potassium_mg, calcium_mg, iron_mg, visibility, source, source_id, verified, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, tenantId, d.name, d.brand ?? null, d.barcode ?? null, d.description ?? null,
      d.imageUrl ?? null, d.servingSize, d.servingUnit, d.calories, d.proteinG, d.carbsG,
      d.fatG, d.fiberG, d.sugarG, d.sodiumMg, d.saturatedFatG, d.cholesterolMg, d.potassiumMg,
      d.calciumMg, d.ironMg, d.visibility, d.source, d.sourceId ?? null, isStaff ? 1 : 0,
      userId, nowIso(),
    )
    .run();
  return id;
}

export const libraryRoutes = new Hono<AppEnv>()
  // ── Exercises ──────────────────────────────────────────────────────────────
  .get("/exercises", async (c) => {
    const who = requireTenant(c)!;
    await seedExercises(c.env.DB);
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const muscle = c.req.query("muscle");
    // scope=all drops the active filter and the browse cap: it's the resolve
    // lane for plans/logs/history, which must still name an archived exercise
    // they already reference. Browse/pickers use the default (active-only).
    const all = c.req.query("scope") === "all";
    let sql = `SELECT * FROM exercises WHERE ${all ? "1 = 1" : "active = 1"} AND (tenant_id IS NULL OR tenant_id = ?)`;
    const binds: unknown[] = [who.tenantId];
    if (q) {
      sql += " AND LOWER(name) LIKE ?";
      binds.push(`%${q}%`);
    }
    if (muscle) {
      sql += " AND (muscle_groups LIKE ? OR secondary_muscle_groups LIKE ?)";
      binds.push(`%${muscle}%`, `%${muscle}%`);
    }
    sql += all ? " ORDER BY name LIMIT 2000" : " ORDER BY name LIMIT 100";
    const rows = await c.env.DB.prepare(sql).bind(...binds).all();
    return c.json({ exercises: rows.results ?? [] });
  })

  // How many of this tenant's plans + templates still reference an exercise —
  // powers the "used in N plans" note before archiving. Archiving is safe
  // (the resolve lane keeps the name), but coaches want to know it's in use.
  .get("/exercises/:id{exr_.+}/usage", async (c) => {
    const who = requireTenant(c)!;
    const like = `%"exerciseId":"${c.req.param("id")}"%`;
    const [plans, templates] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM workout_plans WHERE tenant_id = ? AND body_json LIKE ?").bind(who.tenantId, like).first<{ n: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS n FROM workout_templates WHERE tenant_id = ? AND body_json LIKE ?").bind(who.tenantId, like).first<{ n: number }>(),
    ]);
    return c.json({ plans: plans?.n ?? 0, templates: templates?.n ?? 0 });
  })

  .post("/exercises", async (c) => {
    const who = requireTenant(c)!;
    const parsed = CreateExercise.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const id = newId("exr");
    await c.env.DB.prepare(
      `INSERT INTO exercises (id, tenant_id, visibility, name, slug, muscle_groups, secondary_muscle_groups, equipment, difficulty, force, mechanic, category, instructions_md, thumb_url, thumb2_url, video_url, source, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?)`,
    )
      .bind(
        id, who.tenantId, d.visibility, d.name, slugify(d.name),
        d.muscleGroups.join(","), d.secondaryMuscleGroups.join(","), d.equipment.join(","),
        d.difficulty ?? null, d.force ?? null, d.mechanic ?? null, d.category ?? null,
        d.instructionsMd ?? null, d.thumbUrl ?? null, d.thumb2Url ?? null, d.videoUrl ?? null, who.userId, nowIso(),
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
    if (d.thumbUrl !== undefined) (sets.push("thumb_url = ?"), binds.push(d.thumbUrl));
    if (d.thumb2Url !== undefined) (sets.push("thumb2_url = ?"), binds.push(d.thumb2Url));
    if (d.videoUrl !== undefined) (sets.push("video_url = ?"), binds.push(d.videoUrl));
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

  // ── Exercise alternatives (SPEC §8.3) — a tenant's swap map. Binding A↔B is
  // bidirectional; a client swapping to a bound alternative auto-applies (no
  // approval). Any member reads (the client swap sheet needs them); staff writes.
  .get("/exercises/:id/alternatives", async (c) => {
    const who = requireTenant(c)!;
    const id = c.req.param("id");
    const rows = await c.env.DB.prepare(
      `SELECT e.* FROM exercise_alternatives a
       JOIN exercises e ON e.id = CASE WHEN a.exercise_a = ? THEN a.exercise_b ELSE a.exercise_a END
       WHERE (a.exercise_a = ? OR a.exercise_b = ?) AND (a.tenant_id = ? OR a.tenant_id IS NULL) AND e.active = 1
       ORDER BY e.name`,
    )
      .bind(id, id, id, who.tenantId)
      .all();
    return c.json({ alternatives: rows.results ?? [] });
  })
  .post("/exercises/:id/alternatives", async (c) => {
    const who = requireTenant(c)!;
    const id = c.req.param("id");
    const body = z.object({ exerciseId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const other = body.data.exerciseId;
    if (other === id) return c.json({ error: "an exercise can't be its own alternative" }, 400);
    const [a, b] = id < other ? [id, other] : [other, id]; // stable ordered pair
    await c.env.DB.prepare("INSERT OR IGNORE INTO exercise_alternatives (tenant_id, exercise_a, exercise_b) VALUES (?, ?, ?)").bind(who.tenantId, a, b).run();
    return c.json({ ok: true }, 201);
  })
  .delete("/exercises/:id/alternatives/:otherId", async (c) => {
    const who = requireTenant(c)!;
    const id = c.req.param("id");
    const other = c.req.param("otherId");
    const [a, b] = id < other ? [id, other] : [other, id];
    await c.env.DB.prepare("DELETE FROM exercise_alternatives WHERE exercise_a = ? AND exercise_b = ? AND (tenant_id = ? OR tenant_id IS NULL)").bind(a, b, who.tenantId).run();
    return c.json({ ok: true });
  })

  // ── Foods ──────────────────────────────────────────────────────────────────
  // Visibility (SPEC §8): platform seed (tenant_id NULL, global read-only) +
  // this tenant's rows. Private rows are only visible to their creator.
  .get("/foods", async (c) => {
    const who = requireTenant(c)!;
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    // scope=all is the resolve lane (meal plans/history naming an archived
    // food they reference); it drops the active filter + browse cap.
    const all = c.req.query("scope") === "all";
    let sql = `SELECT * FROM foods WHERE ${all ? "1 = 1" : "active = 1"} AND (tenant_id IS NULL OR (tenant_id = ? AND (visibility <> 'private' OR created_by = ?)))`;
    const binds: unknown[] = [who.tenantId, who.userId];
    if (q) {
      sql += " AND LOWER(name) LIKE ?";
      binds.push(`%${q}%`);
    }
    sql += all ? " ORDER BY verified DESC, name LIMIT 2000" : " ORDER BY verified DESC, name LIMIT 60";
    const rows = await c.env.DB.prepare(sql).bind(...binds).all();
    return c.json({ foods: rows.results ?? [] });
  })

  // Local-first barcode lookup (external fallback arrives with nutrition phase).
  .get("/foods/barcode", async (c) => {
    const who = requireTenant(c)!;
    const code = c.req.query("code");
    if (!code) return c.json({ error: "code required" }, 400);
    const row = await c.env.DB.prepare(
      "SELECT * FROM foods WHERE barcode = ? AND active = 1 AND (tenant_id IS NULL OR tenant_id = ?) ORDER BY tenant_id IS NULL LIMIT 1",
    )
      .bind(code, who.tenantId)
      .first();
    return c.json({ food: row ?? null, source: row ? "local" : null });
  })

  // Single food (editor load). Seed rows are readable by any tenant. The id
  // pattern is constrained to real food ids (`food_…`) so this param route
  // never shadows sibling static routes like /foods/search-external.
  .get("/foods/:id{food_.+}", async (c) => {
    const who = requireTenant(c)!;
    // Resolve-by-id (editor load / referenced row): no active filter, so an
    // archived food can still be opened and re-activated by editing it.
    const row = await c.env.DB.prepare(
      "SELECT * FROM foods WHERE id = ? AND (tenant_id IS NULL OR tenant_id = ?)",
    )
      .bind(c.req.param("id"), who.tenantId)
      .first();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ food: row });
  })

  // Clients may create (barcode/scan auto-import) — client rows land unverified.
  .post("/foods", async (c) => {
    const who = requireTenant(c)!;
    const parsed = CreateFood.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    // Per-tenant dedup by (source, sourceId): a re-import updates THIS tenant's
    // own copy — never another tenant's row, never the global seed.
    if (d.sourceId) {
      const existing = await c.env.DB.prepare(
        "SELECT id FROM foods WHERE source = ? AND source_id = ? AND tenant_id = ?",
      )
        .bind(d.source, d.sourceId, who.tenantId)
        .first<{ id: string }>();
      if (existing) {
        await c.env.DB.prepare(
          "UPDATE foods SET name = ?, brand = ?, barcode = ?, description = ?, image_url = ?, serving_size = ?, serving_unit = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sodium_mg = ?, saturated_fat_g = ?, cholesterol_mg = ?, potassium_mg = ?, calcium_mg = ?, iron_mg = ?, active = 1 WHERE id = ?",
        )
          .bind(
            d.name, d.brand ?? null, d.barcode ?? null, d.description ?? null, d.imageUrl ?? null,
            d.servingSize, d.servingUnit, d.calories, d.proteinG, d.carbsG, d.fatG, d.fiberG,
            d.sugarG, d.sodiumMg, d.saturatedFatG, d.cholesterolMg, d.potassiumMg, d.calciumMg,
            d.ironMg, existing.id,
          )
          .run();
        return c.json({ ok: true, id: existing.id, imported: false });
      }
    }
    const id = await insertFood(c.env.DB, who.tenantId, who.userId, c.get("role") !== "client", d);
    return c.json({ ok: true, id, imported: true }, 201);
  })

  // Edit a food. Copy-on-write: editing a platform-seed food (or any row this
  // tenant doesn't own) forks a tenant-owned copy and edits THAT — edits never
  // mutate the shared seed or reach another tenant. Returns the effective id.
  .patch("/foods/:id", async (c) => {
    const who = requireTenant(c)!;
    const target = await c.env.DB.prepare(
      "SELECT * FROM foods WHERE id = ? AND active = 1 AND (tenant_id IS NULL OR tenant_id = ?)",
    )
      .bind(c.req.param("id"), who.tenantId)
      .first<Record<string, unknown>>();
    if (!target) return c.json({ error: "not found" }, 404);
    const parsed = CreateFood.partial().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;

    // Fork the seed into an owned copy, applying the patch on top of it.
    if (target.tenant_id === null) {
      const isStaff = c.get("role") !== "client";
      const forked = await insertFood(c.env.DB, who.tenantId, who.userId, isStaff, {
        name: (d.name ?? target.name) as string,
        brand: (d.brand ?? target.brand) as string | null,
        barcode: (d.barcode ?? target.barcode) as string | null,
        description: (d.description ?? target.description) as string | null,
        imageUrl: (d.imageUrl ?? target.image_url) as string | null,
        servingSize: (d.servingSize ?? target.serving_size) as number,
        servingUnit: (d.servingUnit ?? target.serving_unit) as string,
        calories: (d.calories ?? target.calories) as number,
        proteinG: (d.proteinG ?? target.protein_g) as number,
        carbsG: (d.carbsG ?? target.carbs_g) as number,
        fatG: (d.fatG ?? target.fat_g) as number,
        fiberG: (d.fiberG ?? target.fiber_g) as number,
        sugarG: (d.sugarG ?? target.sugar_g) as number,
        sodiumMg: (d.sodiumMg ?? target.sodium_mg) as number,
        saturatedFatG: (d.saturatedFatG ?? target.saturated_fat_g) as number,
        cholesterolMg: (d.cholesterolMg ?? target.cholesterol_mg) as number,
        potassiumMg: (d.potassiumMg ?? target.potassium_mg) as number,
        calciumMg: (d.calciumMg ?? target.calcium_mg) as number,
        ironMg: (d.ironMg ?? target.iron_mg) as number,
        visibility: d.visibility ?? "tenant",
        // A forked custom copy — drop the shared source so it dedups per-tenant.
        source: "custom",
        sourceId: null,
      });
      return c.json({ ok: true, id: forked, forked: true });
    }

    const map: Record<string, unknown> = {
      name: d.name, brand: d.brand, barcode: d.barcode, description: d.description,
      image_url: d.imageUrl, serving_size: d.servingSize, serving_unit: d.servingUnit,
      calories: d.calories, protein_g: d.proteinG, carbs_g: d.carbsG, fat_g: d.fatG,
      fiber_g: d.fiberG, sugar_g: d.sugarG, sodium_mg: d.sodiumMg,
      saturated_fat_g: d.saturatedFatG, cholesterol_mg: d.cholesterolMg,
      potassium_mg: d.potassiumMg, calcium_mg: d.calciumMg, iron_mg: d.ironMg,
      visibility: d.visibility,
    };
    const sets = Object.entries(map).filter(([, v]) => v !== undefined);
    if (sets.length === 0) return c.json({ ok: true, id: c.req.param("id") });
    await c.env.DB.prepare(
      `UPDATE foods SET ${sets.map(([k]) => `${k} = ?`).join(", ")}, verified = 1 WHERE id = ? AND tenant_id = ?`,
    )
      .bind(...sets.map(([, v]) => v), c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true, id: c.req.param("id") });
  })

  .delete("/foods/:id", async (c) => {
    const who = requireTenant(c)!;
    // Only a tenant's own rows can be archived; the shared seed is untouchable.
    await c.env.DB.prepare("UPDATE foods SET active = 0 WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  });
