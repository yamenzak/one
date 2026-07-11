/**
 * Data-provider integrations (SPEC §8.3/§8.4) — per-tenant enable/disable +
 * API keys for external food & exercise sources. Keyless providers (Open Food
 * Facts, wger, free-exercise-db) default ON; keyed providers default OFF until
 * the owner adds credentials in Settings → Integrations. Stored in
 * `tenant_settings.integrations_json`; keys never leave the server (the GET
 * returns only whether a key is set).
 */

import { parseJson } from "./db.js";

export interface ProviderMeta {
  id: string;
  label: string;
  category: "food" | "exercise";
  keyless: boolean;
  keys: { field: string; label: string }[];
  blurb: string;
}

export const PROVIDERS: ProviderMeta[] = [
  { id: "openfoodfacts", label: "Open Food Facts", category: "food", keyless: true, keys: [], blurb: "Free, crowd-sourced. Barcodes + full macros/micros." },
  { id: "usda", label: "USDA FoodData Central", category: "food", keyless: false, keys: [{ field: "apiKey", label: "API key" }], blurb: "Authoritative US nutrition database." },
  { id: "nutritionix", label: "Nutritionix", category: "food", keyless: false, keys: [{ field: "appId", label: "App ID" }, { field: "appKey", label: "App key" }], blurb: "Common + branded foods." },
  { id: "fatsecret", label: "FatSecret", category: "food", keyless: false, keys: [{ field: "clientId", label: "Client ID" }, { field: "clientSecret", label: "Client secret" }], blurb: "Large branded catalogue (OAuth)." },
  { id: "wger", label: "wger", category: "exercise", keyless: true, keys: [], blurb: "Free exercise DB with images." },
  { id: "freeexercisedb", label: "Free Exercise DB", category: "exercise", keyless: true, keys: [], blurb: "800+ exercises with muscles, instructions & photos." },
  { id: "exercisedb", label: "ExerciseDB", category: "exercise", keyless: false, keys: [{ field: "rapidApiKey", label: "RapidAPI key" }], blurb: "Animated GIFs + targeting (via RapidAPI)." },
];

export type ProviderConfig = { enabled: boolean } & Record<string, string | boolean>;
export type Integrations = Record<string, ProviderConfig>;

/** Normalize stored JSON to a complete config (defaults + all key fields). */
export function resolveIntegrations(raw: unknown): Integrations {
  const r = (raw ?? {}) as Record<string, Record<string, unknown>>;
  const cfg: Integrations = {};
  for (const p of PROVIDERS) {
    const stored = r[p.id] ?? {};
    const c: ProviderConfig = { enabled: typeof stored.enabled === "boolean" ? stored.enabled : p.keyless };
    for (const k of p.keys) c[k.field] = typeof stored[k.field] === "string" ? (stored[k.field] as string) : "";
    cfg[p.id] = c;
  }
  return cfg;
}

/** A provider is usable when enabled AND (keyless OR all its keys are present). */
export function providerReady(cfg: Integrations, id: string): boolean {
  const c = cfg[id];
  const meta = PROVIDERS.find((p) => p.id === id);
  if (!c || !meta || !c.enabled) return false;
  return meta.keys.every((k) => String(c[k.field] ?? "").trim().length > 0);
}

/** Redact keys for the client — expose only enable state + whether each key is set. */
export function maskIntegrations(cfg: Integrations): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const p of PROVIDERS) {
    const c = cfg[p.id];
    const masked: Record<string, boolean> = { enabled: !!c?.enabled, ready: providerReady(cfg, p.id) };
    for (const k of p.keys) masked[`${k.field}Set`] = String(c?.[k.field] ?? "").trim().length > 0;
    out[p.id] = masked;
  }
  return out;
}

export async function tenantIntegrations(db: D1Database, tenantId: string): Promise<Integrations> {
  const row = await db.prepare("SELECT integrations_json FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ integrations_json: string | null }>();
  return resolveIntegrations(parseJson(row?.integrations_json ?? null, {}));
}
