/**
 * External data providers (SPEC §8.3, §8.4) — food + exercise search that fan
 * out to the providers the TENANT has enabled (Settings → Integrations),
 * normalize to the local schema (foods per-100 g with full macros + micros;
 * exercises with muscles/instructions/images), and cache in KV. Keyed providers
 * read credentials from the tenant's integration settings, never env.
 *
 * Import (POST) dedups by (source, source_id) into the tenant's library.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { gateFeature } from "./client-flags.js";
import { tenantIntegrations, providerReady, type Integrations } from "./integrations.js";
import { newId, nowIso } from "./ids.js";

const CACHE_TTL = 60 * 60 * 24; // 1 day
const CV = "v2"; // cache-key version — bump to invalidate poisoned entries
const UA = "Kova/1.0 (https://kova.4dl.app; coaching platform)";
const r1 = (n: unknown): number => (typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : 0);

/** Fetch with a hard timeout so a slow/hanging upstream provider degrades to an
 *  empty result (all callers already treat null as "no data") instead of
 *  blocking the request — and the test suite — indefinitely. */
async function fetchT(url: string, init?: RequestInit, timeoutMs = 4000): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cache a fetcher's result — but NEVER cache empty/failed results (so a
 *  provider hiccup doesn't poison the key for a whole day). */
async function cachedJson<T>(kv: KVNamespace, key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = await kv.get(`${CV}:${key}`, "json").catch(() => null);
  if (hit) return hit as T;
  const fresh = await fetcher();
  const empty = fresh == null || (Array.isArray(fresh) && fresh.length === 0);
  if (!empty) await kv.put(`${CV}:${key}`, JSON.stringify(fresh), { expirationTtl: CACHE_TTL }).catch(() => undefined);
  return fresh;
}

// ── Normalized shapes ────────────────────────────────────────────────────────
export interface NormFood {
  name: string;
  brand: string | null;
  description: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number;
  proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number;
  sodiumMg: number; saturatedFatG: number; cholesterolMg: number; potassiumMg: number; calciumMg: number; ironMg: number;
  source: string;
  sourceId: string;
  barcode: string | null;
  imageUrl: string | null;
}

export interface NormExercise {
  name: string;
  muscleGroups: string[];
  secondaryMuscleGroups: string[];
  equipment: string[];
  instructions: string | null;
  category: string | null;
  force: string | null;
  difficulty: string | null;
  source: string;
  sourceId: string;
  imageUrl: string | null;
  /** A second frame (e.g. the end position) when the provider ships one. */
  imageUrl2: string | null;
}

const FOOD_PRECEDENCE: Record<string, number> = { openfoodfacts: 1, usda: 2, nutritionix: 3, fatsecret: 4 };

/** Merge provider results, dedup by lowercased name keeping higher precedence. */
function mergeFoods(lists: NormFood[][]): NormFood[] {
  const byName = new Map<string, NormFood>();
  for (const f of lists.flat()) {
    const key = f.name.trim().toLowerCase();
    const prev = byName.get(key);
    if (!prev || (FOOD_PRECEDENCE[f.source] ?? 0) > (FOOD_PRECEDENCE[prev.source] ?? 0)) byName.set(key, f);
  }
  return [...byName.values()].slice(0, 40);
}

// ── Open Food Facts (keyless) ────────────────────────────────────────────────
interface OffProduct { id?: string; _id?: string; code?: string; product_name?: string; brands?: string; generic_name?: string; image_small_url?: string; nutriments?: Record<string, number> }

function normalizeOff(p: OffProduct): NormFood | null {
  const n = p.nutriments ?? {};
  const calories = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0);
  if (!p.product_name || calories <= 0) return null;
  const gToMg = (v: number | undefined) => r1((v ?? 0) * 1000);
  return {
    name: p.product_name, brand: p.brands ?? null, description: p.generic_name ?? null,
    servingSize: 100, servingUnit: "g",
    calories: r1(calories), proteinG: r1(n["proteins_100g"]), carbsG: r1(n["carbohydrates_100g"]), fatG: r1(n["fat_100g"]),
    fiberG: r1(n["fiber_100g"]), sugarG: r1(n["sugars_100g"]), sodiumMg: gToMg(n["sodium_100g"]),
    saturatedFatG: r1(n["saturated-fat_100g"]), cholesterolMg: gToMg(n["cholesterol_100g"]),
    potassiumMg: gToMg(n["potassium_100g"]), calciumMg: gToMg(n["calcium_100g"]), ironMg: gToMg(n["iron_100g"]),
    source: "openfoodfacts", sourceId: String(p.id ?? p._id ?? p.code ?? ""), barcode: p.code ?? null, imageUrl: p.image_small_url ?? null,
  };
}

async function searchOff(q: string, page = 1): Promise<NormFood[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&page=${page}&fields=id,product_name,generic_name,brands,nutriments,image_small_url,code`;
  const res = await fetchT(url, { headers: { "User-Agent": UA } });
  if (!res?.ok) return [];
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(normalizeOff).filter((f): f is NormFood => f !== null);
}

async function barcodeOff(code: string): Promise<NormFood | null> {
  const res = await fetchT(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`, { headers: { "User-Agent": UA } });
  if (!res?.ok) return null;
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (data.status !== 1 || !data.product) return null;
  return normalizeOff({ ...data.product, code });
}

// ── USDA FoodData Central (API key) ──────────────────────────────────────────
async function searchUsda(q: string, apiKey: string, page = 1): Promise<NormFood[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(q)}&pageSize=15&pageNumber=${page}`;
  const res = await fetchT(url);
  if (!res?.ok) return [];
  const data = (await res.json()) as { foods?: { fdcId?: number; description?: string; brandOwner?: string; gtinUpc?: string; foodNutrients?: { nutrientNumber?: string; value?: number }[] }[] };
  return (data.foods ?? []).map((f): NormFood | null => {
    const m: Record<string, number> = {};
    for (const n of f.foodNutrients ?? []) if (n.nutrientNumber) m[n.nutrientNumber] = n.value ?? 0;
    const cal = m["208"] ?? 0;
    if (!f.description || cal <= 0) return null;
    return {
      name: f.description, brand: f.brandOwner ?? null, description: null, servingSize: 100, servingUnit: "g",
      calories: r1(cal), proteinG: r1(m["203"]), carbsG: r1(m["205"]), fatG: r1(m["204"]), fiberG: r1(m["291"]), sugarG: r1(m["269"]),
      sodiumMg: r1(m["307"]), saturatedFatG: r1(m["606"]), cholesterolMg: r1(m["601"]), potassiumMg: r1(m["306"]), calciumMg: r1(m["301"]), ironMg: r1(m["303"]),
      source: "usda", sourceId: `usda_${f.fdcId}`, barcode: f.gtinUpc ?? null, imageUrl: null,
    };
  }).filter((f): f is NormFood => f !== null);
}

// ── Nutritionix (app id/key) ─────────────────────────────────────────────────
async function searchNutritionix(q: string, appId: string, appKey: string): Promise<NormFood[]> {
  const res = await fetch("https://trackapi.nutritionix.com/v2/natural/nutrients", {
    method: "POST",
    headers: { "x-app-id": appId, "x-app-key": appKey, "content-type": "application/json" },
    body: JSON.stringify({ query: q }),
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json()) as { foods?: Record<string, number | string | { thumb?: string }>[] };
  return (data.foods ?? []).map((f): NormFood | null => {
    const grams = Number(f.serving_weight_grams) || 100;
    const k = 100 / grams;
    const cal = Number(f.nf_calories) || 0;
    if (!f.food_name || cal <= 0) return null;
    const photo = f.photo as { thumb?: string } | undefined;
    return {
      name: String(f.food_name), brand: (f.brand_name as string) ?? null, description: null, servingSize: 100, servingUnit: "g",
      calories: r1(cal * k), proteinG: r1(Number(f.nf_protein) * k), carbsG: r1(Number(f.nf_total_carbohydrate) * k), fatG: r1(Number(f.nf_total_fat) * k),
      fiberG: r1(Number(f.nf_dietary_fiber) * k), sugarG: r1(Number(f.nf_sugars) * k), sodiumMg: r1(Number(f.nf_sodium) * k),
      saturatedFatG: r1(Number(f.nf_saturated_fat) * k), cholesterolMg: r1(Number(f.nf_cholesterol) * k), potassiumMg: r1(Number(f.nf_potassium) * k), calciumMg: 0, ironMg: 0,
      source: "nutritionix", sourceId: `nx_${String(f.food_name).toLowerCase().replace(/\s+/g, "-")}`, barcode: null, imageUrl: photo?.thumb ?? null,
    };
  }).filter((f): f is NormFood => f !== null);
}

// ── FatSecret (OAuth2 client credentials) ────────────────────────────────────
async function fatSecretToken(kv: KVNamespace, clientId: string, clientSecret: string): Promise<string | null> {
  const cacheKey = `fatsecret:token:${clientId}`;
  const cached = await kv.get(cacheKey).catch(() => null);
  if (cached) return cached;
  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=basic",
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  await kv.put(cacheKey, data.access_token, { expirationTtl: Math.max(60, (data.expires_in ?? 3600) - 60) }).catch(() => undefined);
  return data.access_token;
}

function parseFatSecretDesc(desc: string): { serving: number; cal: number; fat: number; carbs: number; protein: number } {
  const per = /Per\s+([\d.]+)\s*g/i.exec(desc);
  const serving = per ? Number(per[1]) : 100;
  const num = (re: RegExp) => { const m = re.exec(desc); return m ? Number(m[1]) : 0; };
  return { serving, cal: num(/Calories:\s*([\d.]+)kcal/i), fat: num(/Fat:\s*([\d.]+)g/i), carbs: num(/Carbs:\s*([\d.]+)g/i), protein: num(/Protein:\s*([\d.]+)g/i) };
}

async function searchFatSecret(kv: KVNamespace, q: string, clientId: string, clientSecret: string): Promise<NormFood[]> {
  const token = await fatSecretToken(kv, clientId, clientSecret);
  if (!token) return [];
  const url = `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(q)}&format=json&max_results=15`;
  const res = await fetchT(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res?.ok) return [];
  const data = (await res.json()) as { foods?: { food?: { food_id?: string; food_name?: string; brand_name?: string; food_description?: string }[] } };
  const arr = data.foods?.food ?? [];
  return arr.map((f): NormFood | null => {
    if (!f.food_name || !f.food_description) return null;
    const p = parseFatSecretDesc(f.food_description);
    const k = p.serving > 0 ? 100 / p.serving : 1;
    if (p.cal <= 0) return null;
    return {
      name: f.food_name, brand: f.brand_name ?? null, description: null, servingSize: 100, servingUnit: "g",
      calories: r1(p.cal * k), proteinG: r1(p.protein * k), carbsG: r1(p.carbs * k), fatG: r1(p.fat * k),
      fiberG: 0, sugarG: 0, sodiumMg: 0, saturatedFatG: 0, cholesterolMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0,
      source: "fatsecret", sourceId: `fs_${f.food_id}`, barcode: null, imageUrl: null,
    };
  }).filter((f): f is NormFood => f !== null);
}

// ── wger (keyless) ───────────────────────────────────────────────────────────
async function searchWger(q: string): Promise<NormExercise[]> {
  const url = `https://wger.de/api/v2/exercise/search/?term=${encodeURIComponent(q)}&language=english&format=json`;
  const res = await fetchT(url);
  if (!res?.ok) return [];
  const data = (await res.json()) as { suggestions?: { data?: { base_id?: number; name?: string; image?: string | null; category?: string } }[] };
  return (data.suggestions ?? []).map((s) => s.data).filter((d): d is NonNullable<typeof d> => Boolean(d?.name && d?.base_id)).map((d) => ({
    name: d.name!, muscleGroups: [], secondaryMuscleGroups: [], equipment: [], instructions: null, category: d.category ?? null, force: null, difficulty: null,
    source: "wger", sourceId: `wger_${d.base_id}`, imageUrl: d.image ? (d.image.startsWith("http") ? d.image : `https://wger.de${d.image}`) : null, imageUrl2: null,
  }));
}

// ── free-exercise-db (keyless static JSON) ───────────────────────────────────
interface FedbRow { id?: string; name?: string; force?: string | null; level?: string; mechanic?: string | null; equipment?: string | null; primaryMuscles?: string[]; secondaryMuscles?: string[]; instructions?: string[]; category?: string; images?: string[] }
const FEDB_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main";
async function fedbAll(kv: KVNamespace): Promise<FedbRow[]> {
  return cachedJson(kv, "fedb:all", async () => {
    const res = await fetchT(`${FEDB_BASE}/dist/exercises.json`);
    if (!res?.ok) return [];
    return (await res.json()) as FedbRow[];
  });
}
async function searchFedb(kv: KVNamespace, q: string): Promise<NormExercise[]> {
  const all = await fedbAll(kv);
  const ql = q.toLowerCase();
  return all.filter((e) => e.name?.toLowerCase().includes(ql)).slice(0, 20).map((e) => ({
    name: e.name!, muscleGroups: e.primaryMuscles ?? [], secondaryMuscleGroups: e.secondaryMuscles ?? [], equipment: e.equipment ? [e.equipment] : [],
    instructions: (e.instructions ?? []).join("\n\n") || null, category: e.category ?? null, force: e.force ?? null, difficulty: e.level ?? null,
    source: "freeexercisedb", sourceId: `fedb_${e.id ?? e.name}`,
    imageUrl: e.images?.[0] ? `${FEDB_BASE}/exercises/${e.images[0]}` : null,
    imageUrl2: e.images?.[1] ? `${FEDB_BASE}/exercises/${e.images[1]}` : null, // start / end frames
  }));
}

// ── ExerciseDB (RapidAPI key) ────────────────────────────────────────────────
async function searchExerciseDb(q: string, rapidApiKey: string): Promise<NormExercise[]> {
  const url = `https://exercisedb.p.rapidapi.com/exercises/name/${encodeURIComponent(q.toLowerCase())}?limit=15`;
  const res = await fetchT(url, { headers: { "X-RapidAPI-Key": rapidApiKey, "X-RapidAPI-Host": "exercisedb.p.rapidapi.com" } });
  if (!res?.ok) return [];
  const data = (await res.json()) as { id?: string; name?: string; bodyPart?: string; target?: string; secondaryMuscles?: string[]; equipment?: string; gifUrl?: string; instructions?: string[] }[];
  return (Array.isArray(data) ? data : []).filter((e) => e.name).map((e) => ({
    name: e.name!, muscleGroups: e.target ? [e.target] : [], secondaryMuscleGroups: e.secondaryMuscles ?? [], equipment: e.equipment ? [e.equipment] : [],
    instructions: (e.instructions ?? []).join("\n\n") || null, category: e.bodyPart ?? null, force: null, difficulty: null,
    source: "exercisedb", sourceId: `edb_${e.id}`, imageUrl: e.gifUrl ?? null, imageUrl2: null,
  }));
}

// ── Fan-out helpers ──────────────────────────────────────────────────────────
export async function searchFoodProviders(kv: KVNamespace, cfg: Integrations, q: string, page = 1): Promise<NormFood[]> {
  const tasks: Promise<NormFood[]>[] = [];
  const ql = q.toLowerCase();
  if (providerReady(cfg, "openfoodfacts")) tasks.push(cachedJson(kv, `off:search:${ql}:${page}`, () => searchOff(q, page)));
  if (providerReady(cfg, "usda")) tasks.push(cachedJson(kv, `usda:search:${ql}:${page}`, () => searchUsda(q, String(cfg.usda?.apiKey ?? ""), page)));
  // The instant/keyword providers don't page — only include them on the first page.
  if (page === 1 && providerReady(cfg, "nutritionix")) tasks.push(searchNutritionix(q, String(cfg.nutritionix?.appId ?? ""), String(cfg.nutritionix?.appKey ?? "")).catch(() => []));
  if (page === 1 && providerReady(cfg, "fatsecret")) tasks.push(searchFatSecret(kv, q, String(cfg.fatsecret?.clientId ?? ""), String(cfg.fatsecret?.clientSecret ?? "")).catch(() => []));
  const settled = await Promise.allSettled(tasks);
  return mergeFoods(settled.map((s) => (s.status === "fulfilled" ? s.value : [])));
}

export async function searchExerciseProviders(kv: KVNamespace, cfg: Integrations, q: string): Promise<NormExercise[]> {
  const tasks: Promise<NormExercise[]>[] = [];
  const ql = q.toLowerCase();
  if (providerReady(cfg, "wger")) tasks.push(cachedJson(kv, `wger:search:${ql}`, () => searchWger(q)));
  if (providerReady(cfg, "freeexercisedb")) tasks.push(searchFedb(kv, q).catch(() => []));
  if (providerReady(cfg, "exercisedb")) tasks.push(searchExerciseDb(q, String(cfg.exercisedb?.rapidApiKey ?? "")).catch(() => []));
  const settled = await Promise.allSettled(tasks);
  const byName = new Map<string, NormExercise>();
  for (const e of settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))) {
    const key = e.name.trim().toLowerCase();
    // Prefer richer entries (with instructions/images).
    const prev = byName.get(key);
    if (!prev || (!prev.instructions && e.instructions)) byName.set(key, e);
  }
  return [...byName.values()].slice(0, 30);
}

export const externalRoutes = new Hono<AppEnv>()
  .get("/foods/search-external", async (c) => {
    const who = requireTenant(c)!;
    { const gate = await gateFeature(c, "externalFoodSearch"); if (gate) return gate; }
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) return c.json({ foods: [] });
    const page = Math.max(1, Math.min(20, Number(c.req.query("page") ?? "1") || 1));
    const cfg = await tenantIntegrations(c.env.DB, who.tenantId);
    return c.json({ foods: await searchFoodProviders(c.env.CACHE, cfg, q, page) });
  })

  .post("/foods/import", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z
      .object({
        name: z.string(), brand: z.string().nullish(), description: z.string().nullish(),
        servingSize: z.number().default(100), servingUnit: z.string().default("g"),
        calories: z.number(), proteinG: z.number().default(0), carbsG: z.number().default(0), fatG: z.number().default(0),
        fiberG: z.number().default(0), sugarG: z.number().default(0), sodiumMg: z.number().default(0),
        saturatedFatG: z.number().default(0), cholesterolMg: z.number().default(0), potassiumMg: z.number().default(0), calciumMg: z.number().default(0), ironMg: z.number().default(0),
        source: z.string(), sourceId: z.string(), barcode: z.string().nullish(), imageUrl: z.string().nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    // Per-tenant dedup: reuse only THIS tenant's own copy, never another
    // tenant's row or the global seed.
    const existing = await c.env.DB.prepare("SELECT id FROM foods WHERE source = ? AND source_id = ? AND tenant_id = ?").bind(d.source, d.sourceId, who.tenantId).first<{ id: string }>();
    if (existing) { await c.env.DB.prepare("UPDATE foods SET active = 1 WHERE id = ?").bind(existing.id).run(); return c.json({ ok: true, id: existing.id, imported: false }); }
    const id = newId("food");
    const isStaff = c.get("role") !== "client";
    await c.env.DB.prepare(
      `INSERT INTO foods (id, tenant_id, name, brand, description, barcode, image_url, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, saturated_fat_g, cholesterol_mg, potassium_mg, calcium_mg, iron_mg, source, source_id, verified, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, who.tenantId, d.name, d.brand ?? null, d.description ?? null, d.barcode ?? null, d.imageUrl ?? null, d.servingSize, d.servingUnit, d.calories, d.proteinG, d.carbsG, d.fatG, d.fiberG, d.sugarG, d.sodiumMg, d.saturatedFatG, d.cholesterolMg, d.potassiumMg, d.calciumMg, d.ironMg, d.source, d.sourceId, isStaff ? 1 : 0, who.userId, nowIso())
      .run();
    return c.json({ ok: true, id, imported: true }, 201);
  })

  .get("/foods/barcode-external", async (c) => {
    const who = requireTenant(c)!;
    const code = c.req.query("code");
    if (!code) return c.json({ error: "code required" }, 400);
    const cfg = await tenantIntegrations(c.env.DB, who.tenantId);
    if (!providerReady(cfg, "openfoodfacts")) return c.json({ food: null, source: null });
    const food = await cachedJson(c.env.CACHE, `off:barcode:${code}`, () => barcodeOff(code));
    if (!food) return c.json({ food: null, source: null });
    // Per-tenant cache: this tenant's own imported copy (or the global seed),
    // never another tenant's row.
    const existing = await c.env.DB.prepare("SELECT * FROM foods WHERE source = 'openfoodfacts' AND source_id = ? AND (tenant_id IS NULL OR tenant_id = ?) ORDER BY tenant_id IS NULL LIMIT 1").bind(food.sourceId, who.tenantId).first();
    if (existing) return c.json({ food: existing, source: "openfoodfacts" });
    const id = newId("food");
    await c.env.DB.prepare(
      `INSERT INTO foods (id, tenant_id, name, brand, description, barcode, image_url, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, saturated_fat_g, cholesterol_mg, potassium_mg, calcium_mg, iron_mg, source, source_id, verified, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'openfoodfacts', ?, 0, ?, ?)`,
    )
      .bind(id, who.tenantId, food.name, food.brand, food.description, food.barcode, food.imageUrl, food.servingSize, food.servingUnit, food.calories, food.proteinG, food.carbsG, food.fatG, food.fiberG, food.sugarG, food.sodiumMg, food.saturatedFatG, food.cholesterolMg, food.potassiumMg, food.calciumMg, food.ironMg, food.sourceId, who.userId, nowIso())
      .run();
    const row = await c.env.DB.prepare("SELECT * FROM foods WHERE id = ?").bind(id).first();
    return c.json({ food: row, source: "openfoodfacts" });
  })

  .get("/exercises/search-external", async (c) => {
    const who = requireTenant(c)!;
    { const gate = await gateFeature(c, "externalExerciseSearch"); if (gate) return gate; }
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) return c.json({ exercises: [] });
    const cfg = await tenantIntegrations(c.env.DB, who.tenantId);
    return c.json({ exercises: await searchExerciseProviders(c.env.CACHE, cfg, q) });
  })

  .post("/exercises/import", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({
        name: z.string(), muscleGroups: z.array(z.string()).default([]), secondaryMuscleGroups: z.array(z.string()).default([]),
        equipment: z.array(z.string()).default([]), instructions: z.string().nullish(), category: z.string().nullish(),
        force: z.string().nullish(), difficulty: z.string().nullish(), imageUrl: z.string().nullish(), imageUrl2: z.string().nullish(),
        source: z.string(), sourceId: z.string(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    // Tenant-scoped dedup (own copy or a shared global), never another tenant's row.
    const existing = await c.env.DB.prepare("SELECT id FROM exercises WHERE source = ? AND source_id = ? AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY tenant_id IS NULL LIMIT 1").bind(d.source, d.sourceId, who.tenantId).first<{ id: string }>();
    if (existing) { await c.env.DB.prepare("UPDATE exercises SET active = 1 WHERE id = ? AND tenant_id = ?").bind(existing.id, who.tenantId).run(); return c.json({ ok: true, id: existing.id, imported: false }); }
    const id = newId("exr");
    const force = d.force === "push" || d.force === "pull" || d.force === "static" ? d.force : null;
    const diff = ["beginner", "intermediate", "advanced"].includes(d.difficulty ?? "") ? d.difficulty : (d.difficulty === "expert" ? "advanced" : null);
    await c.env.DB.prepare(
      `INSERT INTO exercises (id, tenant_id, visibility, name, slug, muscle_groups, secondary_muscle_groups, equipment, difficulty, force, category, instructions_md, thumb_url, thumb2_url, source, source_id, active, created_by, created_at)
       VALUES (?, ?, 'tenant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
      .bind(id, who.tenantId, d.name, d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), d.muscleGroups.join(","), d.secondaryMuscleGroups.join(","), d.equipment.join(","), diff, force, d.category ?? null, d.instructions ?? null, d.imageUrl ?? null, d.imageUrl2 ?? null, d.source, d.sourceId, who.userId, nowIso())
      .run();
    return c.json({ ok: true, id, imported: true }, 201);
  });
