/**
 * Library resolution for AI drafts (SPEC §6, §8.3/§8.4) — turns the model's
 * plain-language food / exercise names into REAL library rows, in a strict
 * order that matches how a coach would work:
 *
 *   1. our library     — tenant + platform rows (LIKE match), carrying macros
 *                        or muscles + a photo already.
 *   2. integrated web  — fan out to the tenant's enabled providers (Open Food
 *                        Facts / USDA / wger / free-exercise-db …), import the
 *                        best hit (WITH its photo/gif) into the tenant library.
 *   3. custom          — only when nothing matched: mint a minimal tenant row
 *                        from the model's own estimate, so the draft still
 *                        references a real, editable id.
 *
 * Everything is deduped and cached per draft so repeated names cost one lookup.
 */

import { searchFoodProviders, searchExerciseProviders, type NormFood, type NormExercise } from "./external-routes.js";
import type { Integrations } from "./integrations.js";
import { newId, nowIso } from "./ids.js";

export interface ResolveEnv { DB: D1Database; CACHE: KVNamespace }

const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

// ── Foods ────────────────────────────────────────────────────────────────────

async function importFood(db: D1Database, tenantId: string, userId: string, f: NormFood): Promise<string> {
  const existing = await db.prepare("SELECT id FROM foods WHERE source = ? AND source_id = ? AND tenant_id = ?").bind(f.source, f.sourceId, tenantId).first<{ id: string }>();
  if (existing) { await db.prepare("UPDATE foods SET active = 1 WHERE id = ?").bind(existing.id).run(); return existing.id; }
  const id = newId("food");
  await db.prepare(
    `INSERT INTO foods (id, tenant_id, name, brand, description, barcode, image_url, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, saturated_fat_g, cholesterol_mg, potassium_mg, calcium_mg, iron_mg, source, source_id, verified, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(id, tenantId, f.name, f.brand, f.description, f.barcode, f.imageUrl, f.servingSize, f.servingUnit, f.calories, f.proteinG, f.carbsG, f.fatG, f.fiberG, f.sugarG, f.sodiumMg, f.saturatedFatG, f.cholesterolMg, f.potassiumMg, f.calciumMg, f.ironMg, f.source, f.sourceId, userId, nowIso()).run();
  return id;
}

async function customFood(db: D1Database, tenantId: string, userId: string, name: string, m: FoodEstimate): Promise<string> {
  const id = newId("food");
  await db.prepare(
    `INSERT INTO foods (id, tenant_id, name, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, source, verified, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', 1, ?, ?)`,
  ).bind(id, tenantId, name.slice(0, 160), m.servingSize ?? 100, m.servingUnit ?? "g", Math.round(m.calories), Math.round(m.proteinG ?? 0), Math.round(m.carbsG ?? 0), Math.round(m.fatG ?? 0), userId, nowIso()).run();
  return id;
}

export interface FoodEstimate { calories: number; proteinG?: number; carbsG?: number; fatG?: number; servingSize?: number; servingUnit?: string }

/** Resolve a food search query to a real food id: library → web import → custom
 *  (only when the model gave a usable calorie estimate). Null if unresolvable. */
export async function resolveFoodId(
  env: ResolveEnv, tenantId: string, userId: string, query: string, cfg: Integrations, allowExternal: boolean,
  estimate: FoodEstimate | null, cache: Map<string, string | null>,
): Promise<string | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  const local = await env.DB
    .prepare("SELECT id FROM foods WHERE active = 1 AND (tenant_id IS NULL OR tenant_id = ?) AND LOWER(name) LIKE ? ORDER BY verified DESC, name LIMIT 1")
    .bind(tenantId, `%${key}%`).first<{ id: string }>();
  let id: string | null = local?.id ?? null;
  if (!id && allowExternal) {
    const hits = await searchFoodProviders(env.CACHE, cfg, query, 1).catch(() => [] as NormFood[]);
    if (hits[0]) id = await importFood(env.DB, tenantId, userId, hits[0]);
  }
  if (!id && estimate && estimate.calories > 0) id = await customFood(env.DB, tenantId, userId, query, estimate);
  cache.set(key, id);
  return id;
}

// ── Exercises ────────────────────────────────────────────────────────────────

async function importExercise(db: D1Database, tenantId: string, userId: string, e: NormExercise): Promise<string> {
  // Tenant-scoped dedup: reuse THIS tenant's copy or a shared global (tenant NULL)
  // one — never bind to another tenant's row (that both leaks a dangling ref and
  // lets us write into their data). Prefer the tenant's own row over the global.
  const existing = await db.prepare("SELECT id FROM exercises WHERE source = ? AND source_id = ? AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY tenant_id IS NULL LIMIT 1").bind(e.source, e.sourceId, tenantId).first<{ id: string }>();
  if (existing) { await db.prepare("UPDATE exercises SET active = 1 WHERE id = ? AND tenant_id = ?").bind(existing.id, tenantId).run(); return existing.id; }
  const id = newId("exr");
  const force = e.force === "push" || e.force === "pull" || e.force === "static" ? e.force : null;
  const diff = ["beginner", "intermediate", "advanced"].includes(e.difficulty ?? "") ? e.difficulty : e.difficulty === "expert" ? "advanced" : null;
  await db.prepare(
    `INSERT INTO exercises (id, tenant_id, visibility, name, slug, muscle_groups, secondary_muscle_groups, equipment, difficulty, force, category, instructions_md, thumb_url, thumb2_url, source, source_id, active, created_by, created_at)
     VALUES (?, ?, 'tenant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(id, tenantId, e.name, slugify(e.name), e.muscleGroups.join(","), e.secondaryMuscleGroups.join(","), e.equipment.join(","), diff, force, e.category ?? null, e.instructions ?? null, e.imageUrl ?? null, e.imageUrl2 ?? null, e.source, e.sourceId, userId, nowIso()).run();
  return id;
}

async function customExercise(db: D1Database, tenantId: string, userId: string, name: string): Promise<string> {
  const id = newId("exr");
  await db.prepare(
    `INSERT INTO exercises (id, tenant_id, visibility, name, slug, source, active, created_by, created_at)
     VALUES (?, ?, 'tenant', ?, ?, 'ai', 1, ?, ?)`,
  ).bind(id, tenantId, name.slice(0, 120), slugify(name), userId, nowIso()).run();
  return id;
}

/** Resolve an exercise name to a real exercise id: library → web import (with
 *  its photo/gif) → custom. Always returns an id (custom is the last resort). */
export async function resolveExerciseId(
  env: ResolveEnv, tenantId: string, userId: string, name: string, cfg: Integrations, allowExternal: boolean,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  const local = await env.DB
    .prepare("SELECT id FROM exercises WHERE active = 1 AND (tenant_id IS NULL OR tenant_id = ?) AND LOWER(name) LIKE ? ORDER BY name LIMIT 1")
    .bind(tenantId, `%${key}%`).first<{ id: string }>();
  let id: string | null = local?.id ?? null;
  if (!id && allowExternal) {
    const hits = await searchExerciseProviders(env.CACHE, cfg, name).catch(() => [] as NormExercise[]);
    if (hits[0]) id = await importExercise(env.DB, tenantId, userId, hits[0]);
  }
  if (!id) id = await customExercise(env.DB, tenantId, userId, name);
  cache.set(key, id);
  return id;
}
