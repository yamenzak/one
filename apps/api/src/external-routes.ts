/**
 * External data providers (SPEC §8.3, §8.4) — food + exercise search that
 * fan out to keyless public APIs (Open Food Facts, wger), normalize to the
 * local schema, and cache responses in KV. Keyed providers (USDA, Nutritionix,
 * FatSecret, ExerciseDB) plug in via app_config later; the keyless lane ships
 * now and covers the free tier's `externalSearch` entitlement.
 *
 * Import (POST) dedups by (source, source_id) into the tenant's library.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { tenantEntitlements } from "./billing-store.js";
import { newId, nowIso } from "./ids.js";

const CACHE_TTL = 60 * 60 * 24; // 1 day

interface NormFood {
  name: string;
  brand: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  source: string;
  sourceId: string;
  barcode: string | null;
  imageUrl: string | null;
}

const r1 = (n: unknown): number => (typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : 0);

async function cachedJson<T>(kv: KVNamespace, key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = await kv.get(key, "json").catch(() => null);
  if (hit) return hit as T;
  const fresh = await fetcher();
  await kv.put(key, JSON.stringify(fresh), { expirationTtl: CACHE_TTL }).catch(() => undefined);
  return fresh;
}

// ── Open Food Facts (keyless) ─────────────────────────────────────────────────
interface OffProduct {
  id?: string;
  _id?: string;
  code?: string;
  product_name?: string;
  brands?: string;
  image_small_url?: string;
  nutriments?: Record<string, number>;
}

function normalizeOff(p: OffProduct): NormFood | null {
  const n = p.nutriments ?? {};
  const calories = n["energy-kcal_100g"] ?? n["energy_100g"] ?? 0;
  if (!p.product_name || calories <= 0) return null;
  return {
    name: p.product_name,
    brand: p.brands ?? null,
    servingSize: 100,
    servingUnit: "g",
    calories: r1(calories),
    proteinG: r1(n["proteins_100g"]),
    carbsG: r1(n["carbohydrates_100g"]),
    fatG: r1(n["fat_100g"]),
    fiberG: r1(n["fiber_100g"]),
    sugarG: r1(n["sugars_100g"]),
    sodiumMg: r1((n["sodium_100g"] ?? 0) * 1000),
    source: "openfoodfacts",
    sourceId: String(p.id ?? p._id ?? p.code ?? ""),
    barcode: p.code ?? null,
    imageUrl: p.image_small_url ?? null,
  };
}

async function searchOff(q: string): Promise<NormFood[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=id,product_name,brands,nutriments,image_small_url,code`;
  const res = await fetch(url, { headers: { "User-Agent": "Mossa/1.0 (coaching)" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(normalizeOff).filter((f): f is NormFood => f !== null);
}

async function barcodeOff(code: string): Promise<NormFood | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`, {
    headers: { "User-Agent": "Mossa/1.0 (coaching)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (data.status !== 1 || !data.product) return null;
  return normalizeOff({ ...data.product, code });
}

// ── wger (keyless exercise DB) ────────────────────────────────────────────────
interface NormExercise {
  name: string;
  muscleGroups: string[];
  equipment: string[];
  source: string;
  sourceId: string;
  imageUrl: string | null;
}

async function searchWger(q: string): Promise<NormExercise[]> {
  const url = `https://wger.de/api/v2/exercise/search/?term=${encodeURIComponent(q)}&language=english&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { suggestions?: { data?: { base_id?: number; name?: string; image?: string | null } }[] };
  return (data.suggestions ?? [])
    .map((s) => s.data)
    .filter((d): d is NonNullable<typeof d> => Boolean(d?.name && d?.base_id))
    .map((d) => ({
      name: d.name!,
      muscleGroups: [],
      equipment: [],
      source: "wger",
      sourceId: `wger_${d.base_id}`,
      imageUrl: d.image ? (d.image.startsWith("http") ? d.image : `https://wger.de${d.image}`) : null,
    }));
}

export const externalRoutes = new Hono<AppEnv>()
  // Food search: local library first, external fan-out appended (deduped by name).
  .get("/foods/search-external", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.externalSearch) return c.json({ error: "externalSearch not in your plan" }, 403);
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) return c.json({ foods: [] });
    const foods = await cachedJson(c.env.CACHE, `off:search:${q.toLowerCase()}`, () => searchOff(q));
    return c.json({ foods });
  })

  // Import a chosen external food into the tenant library (dedup by source id).
  .post("/foods/import", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z
      .object({
        name: z.string(),
        brand: z.string().nullish(),
        servingSize: z.number().default(100),
        servingUnit: z.string().default("g"),
        calories: z.number(),
        proteinG: z.number().default(0),
        carbsG: z.number().default(0),
        fatG: z.number().default(0),
        fiberG: z.number().default(0),
        sugarG: z.number().default(0),
        sodiumMg: z.number().default(0),
        source: z.string(),
        sourceId: z.string(),
        barcode: z.string().nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const existing = await c.env.DB.prepare("SELECT id FROM foods WHERE source = ? AND source_id = ?")
      .bind(d.source, d.sourceId)
      .first<{ id: string }>();
    if (existing) {
      await c.env.DB.prepare("UPDATE foods SET active = 1 WHERE id = ?").bind(existing.id).run();
      return c.json({ ok: true, id: existing.id, imported: false });
    }
    const id = newId("food");
    const isStaff = c.get("role") !== "client";
    await c.env.DB.prepare(
      `INSERT INTO foods (id, tenant_id, name, brand, barcode, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source, source_id, verified, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, who.tenantId, d.name, d.brand ?? null, d.barcode ?? null, d.servingSize, d.servingUnit, d.calories, d.proteinG, d.carbsG, d.fatG, d.fiberG, d.sugarG, d.sodiumMg, d.source, d.sourceId, isStaff ? 1 : 0, who.userId, nowIso())
      .run();
    return c.json({ ok: true, id, imported: true }, 201);
  })

  // Barcode: local first (in library-routes) — this is the external fallback +
  // auto-import when the local lookup missed.
  .get("/foods/barcode-external", async (c) => {
    const who = requireTenant(c)!;
    const code = c.req.query("code");
    if (!code) return c.json({ error: "code required" }, 400);
    const food = await cachedJson(c.env.CACHE, `off:barcode:${code}`, () => barcodeOff(code));
    if (!food) return c.json({ food: null, source: null });
    // Auto-import so the scan produces a usable library row.
    const existing = await c.env.DB.prepare("SELECT * FROM foods WHERE source = 'openfoodfacts' AND source_id = ?")
      .bind(food.sourceId)
      .first();
    if (existing) return c.json({ food: existing, source: "openfoodfacts" });
    const id = newId("food");
    await c.env.DB.prepare(
      `INSERT INTO foods (id, tenant_id, name, brand, barcode, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source, source_id, verified, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'openfoodfacts', ?, 0, ?, ?)`,
    )
      .bind(id, who.tenantId, food.name, food.brand, food.barcode, food.servingSize, food.servingUnit, food.calories, food.proteinG, food.carbsG, food.fatG, food.fiberG, food.sugarG, food.sodiumMg, food.sourceId, who.userId, nowIso())
      .run();
    const row = await c.env.DB.prepare("SELECT * FROM foods WHERE id = ?").bind(id).first();
    return c.json({ food: row, source: "openfoodfacts" });
  })

  // Exercise external search (wger keyless).
  .get("/exercises/search-external", async (c) => {
    const who = requireTenant(c)!;
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    if (!ent.features.externalSearch) return c.json({ error: "externalSearch not in your plan" }, 403);
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) return c.json({ exercises: [] });
    const exercises = await cachedJson(c.env.CACHE, `wger:search:${q.toLowerCase()}`, () => searchWger(q));
    return c.json({ exercises });
  })

  .post("/exercises/import", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({
        name: z.string(),
        muscleGroups: z.array(z.string()).default([]),
        equipment: z.array(z.string()).default([]),
        source: z.string(),
        sourceId: z.string(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const existing = await c.env.DB.prepare("SELECT id FROM exercises WHERE source = ? AND source_id = ?")
      .bind(d.source, d.sourceId)
      .first<{ id: string }>();
    if (existing) {
      await c.env.DB.prepare("UPDATE exercises SET active = 1 WHERE id = ?").bind(existing.id).run();
      return c.json({ ok: true, id: existing.id, imported: false });
    }
    const id = newId("exr");
    await c.env.DB.prepare(
      `INSERT INTO exercises (id, tenant_id, visibility, name, slug, muscle_groups, secondary_muscle_groups, equipment, source, source_id, active, created_by, created_at)
       VALUES (?, ?, 'tenant', ?, ?, ?, '', ?, ?, ?, 1, ?, ?)`,
    )
      .bind(id, who.tenantId, d.name, d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), d.muscleGroups.join(","), d.equipment.join(","), d.source, d.sourceId, who.userId, nowIso())
      .run();
    return c.json({ ok: true, id, imported: true }, 201);
  });
