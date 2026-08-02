/**
 * THE MODEL CATALOG, PARSED ONCE FOR THE WHOLE PLATFORM.
 *
 * `ai_models` holds two different kinds of thing in one table, and only one of
 * them is any single app's:
 *
 *   id, label, provider, input_rate, output_rate, unit_rate, unit_kind
 *       — parsed from Cloudflare's and Google's PUBLIC pricing pages. Byte for
 *         byte identical in every deployment, because it is a fact about what
 *         the providers charge.
 *
 *   enabled, is_default
 *       — which models THIS product turns on, and which it defaults to per
 *         lane. Genuinely different per app: one reads food photos, another
 *         reads sterilisation labels, and a third has no use for speech at all.
 *
 * Before this, every app fetched the same two URLs, ran the same parsers and
 * wrote the same numbers into its own database — and a brand-new app started on
 * a hardcoded twelve-row seed until somebody remembered to press Sync.
 *
 * So the CATALOG half is published to the shared platform store (`@4dl/core`'s
 * `PLATFORM_CONFIG`), and the SELECTION half never leaves the app's own D1.
 *
 * ── Why publish a blob rather than read through ─────────────────────────────
 *
 * `getConfig`'s shared layer is a read-through fallback because config is read
 * per request and merged per key. This is the opposite shape: `ai_models` is
 * joined, ordered and filtered on the hot path (`ORDER BY is_default DESC`),
 * several times inside one `generate()`. Merging a KV blob into that on every
 * call would be a real cost for a table that changes when an operator presses a
 * button. So the shared store is the SOURCE and the local table is the applied
 * result — the same relationship a package's schema has to a database.
 *
 * ── It degrades to exactly what came before ─────────────────────────────────
 *
 * No `PLATFORM_CONFIG` binding: publishing is a no-op and a sync fetches the
 * pricing pages, precisely as it always did. Nothing here is on a path that can
 * fail an app that has not provisioned the namespace.
 */

import type { HasPlatformConfig } from "@4dl/core";
import type { ModelSeed } from "./pricing.js";

/** The one KV key the shared catalog lives under. */
export const SHARED_CATALOG_KEY = "platform:ai-catalog";

/**
 * Served from a colo cache for a minute.
 *
 * The catalog changes when an operator presses Sync — minutes of staleness on a
 * price table is not a class of problem, and the alternative is a KV read on
 * every cold app boot.
 */
const CACHE_TTL = 60;

export interface SharedCatalog {
  /** When the app that published this actually parsed the pricing pages. */
  syncedAt: string;
  /** Which app ran that sync, for the console to report. */
  syncedBy: string;
  models: ModelSeed[];
}

/** Enough of a model to be worth writing down; anything less is a parse bug. */
const looksLikeModel = (m: unknown): m is ModelSeed => {
  const r = m as Partial<ModelSeed> | null;
  return !!r && typeof r.id === "string" && !!r.id && typeof r.provider === "string" && typeof r.task === "string";
};

/**
 * The published catalog, or null.
 *
 * NEVER throws, and validates every row. A malformed blob must read as "nothing
 * published" — the app then falls back to its own sync, which is the state it
 * was in before this existed. Letting a hand-edited namespace put a row with no
 * id into `ai_models` would corrupt the one table the credit math reads.
 */
export async function readSharedCatalog(env: HasPlatformConfig): Promise<SharedCatalog | null> {
  const kv = env.PLATFORM_CONFIG;
  if (!kv) return null;
  const raw = await kv.get<Partial<SharedCatalog>>(SHARED_CATALOG_KEY, { type: "json", cacheTtl: CACHE_TTL }).catch(() => null);
  if (!raw || !Array.isArray(raw.models)) return null;
  const models = raw.models.filter(looksLikeModel);
  if (models.length === 0) return null;
  return {
    syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : "",
    syncedBy: typeof raw.syncedBy === "string" ? raw.syncedBy : "",
    models,
  };
}

/**
 * Publish what a real sync just parsed, for every other app to apply.
 *
 * Best-effort by design: a KV write that fails must not turn a successful sync
 * into an error. The app that ran it already has the fresh catalog in its own
 * table; the only thing lost is the saving for the next app, and the next sync
 * republishes.
 *
 * Only called after a sync that PARSED something. Publishing an empty list
 * would hand every other app a catalog with nothing in it — which
 * `readSharedCatalog` also refuses to return, so the guard is on both sides.
 */
export async function publishSharedCatalog(env: HasPlatformConfig, models: ModelSeed[], app: string, at: string): Promise<boolean> {
  const kv = env.PLATFORM_CONFIG;
  if (!kv || models.length === 0) return false;
  const payload: SharedCatalog = { syncedAt: at, syncedBy: app, models };
  return kv
    .put(SHARED_CATALOG_KEY, JSON.stringify(payload))
    .then(() => true)
    .catch(() => false);
}
