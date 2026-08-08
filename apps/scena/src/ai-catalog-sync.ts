/**
 * SCENA'S AI RATES, FROM THE PROVIDER'S OWN PRICING PAGE.
 *
 * ── What this replaces, and why it was worse than nothing ───────────────────
 *
 * The operator console has always had a "Sync catalog" button. It called
 * `resyncModels`, which upserted every row of `DEFAULT_MODELS` — a hardcoded
 * list in `billing-seed.ts` — and reported "17 updated". So an operator pressed
 * Sync, read a success message naming a number, and believed the rates had been
 * refreshed from Cloudflare. Nothing had been fetched. The same constants were
 * written back over themselves.
 *
 * That is the failure this codebase refuses everywhere else: a confident report
 * of work that did not happen. And it is on the metering path, so the cost is
 * money — Scena bills real credits against whatever those constants said on the
 * day somebody typed them, while Kova and Tessa track the live pages through
 * `@4dl/ai`'s syncer.
 *
 * ── Why this is not simply `syncModelCatalog` ───────────────────────────────
 *
 * `@4dl/ai` ships the whole thing, and ONE structural reason is left: the two
 * tables key differently. The shared `ai_models.id` IS the provider path
 * (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) with a `provider` column naming
 * the lane; Scena's `id` is a short slug (`llama-3.3-70b`) and the path lives in
 * `cf_model`. Adopting the shared row shape means changing every model id Scena
 * has — 34 `cf_model` references across eight files, plus the `ai_defaults`
 * config values, the per-tenant pinned model and the generation cache's `model`
 * column. Mechanical, but on the metering path.
 *
 * ⚠️ TWO OTHER BLOCKERS THIS HEADER USED TO NAME ARE GONE, and the note is here
 * so nobody re-derives them:
 *
 *   • THE UNIT KINDS ALREADY MATCH. `@4dl/billing`'s `credits.ts` meters
 *     `tile`, `chars_1k`, `audio_sec`, `audio_min` and `image` — every unit
 *     Scena's image, voice and music lanes are priced in. `ModelSeed.unitKind`
 *     listed only three of the five; it lists all five now.
 *   • THE LANES ARE THE APP'S. `configureAiLanes` replaced a constant that held
 *     Kova's five, so Scena's `music` lane exists and its Workers AI voices are
 *     no longer catalogued disabled.
 *
 * `ai_cache` still collides: Scena's columns are `(hash, task, model, output,
 * asset_hash, neurons, created_at)` against the shared `(prompt_hash, feature,
 * output_json, at)`. Scena's caches an ASSET and its neuron cost, which the
 * shared one does not model, so adopting `AI_SCHEMA` means renaming Scena's
 * first — a `CREATE TABLE IF NOT EXISTS` is won by whichever module runs first
 * and the loser's columns silently never exist.
 *
 * What is portable TODAY is the part that actually breaks: the PARSERS. Reading
 * two pricing pages written for humans, in Markdown that changes shape without
 * notice, is the hard and fragile half — and `parseWorkersAiCatalog` /
 * `parseGeminiCatalog` are already exported, already tested, and already fixed
 * for the retirement bug (task #120) that Scena never received. This module is
 * the ~80 lines of row-matching that sit between them and Scena's own table.
 *
 * So: shared parsers, shared neuron math, shared pricing sources; local
 * matching, because the row shape is local. When the id migration lands, this
 * file is deleted and `syncModelCatalog` is called directly.
 *
 * ── It fails OPEN, per provider ─────────────────────────────────────────────
 *
 * A page that will not fetch, or parses to zero rows, leaves THAT provider's
 * rows exactly as they were. The alternative — treating "I could not read the
 * page" as "the page lists nothing" — would disable Scena's whole catalog the
 * first time Cloudflare had an outage. Each provider reports its own outcome so
 * a half-failed run says which half.
 */

import {
  PRICING_SOURCES,
  fetchPricingDoc,
  parseGeminiCatalog,
  parseWorkersAiCatalog,
  type ModelSeed,
  type ParsedCatalog,
} from "@4dl/ai";
import { ensureBilling, type ModelRow } from "./billing-store.js";

export interface ProviderReport {
  provider: "workers-ai" | "google";
  source: string;
  ok: boolean;
  /** Rows on the page this run could price. */
  parsed: number;
  /** Scena rows whose rates the page moved. */
  repriced: number;
  /** Scena rows switched off because the provider has retired the model. */
  retired: string[];
  /** Scena rows switched off because the page no longer lists them at all. */
  delisted: string[];
  /** Scena rows the page did list and did not move. */
  unchanged: number;
  error: string | null;
}

export interface CatalogSyncReport {
  providers: ProviderReport[];
  /** True only when every provider was read. A partial run is not a success. */
  ok: boolean;
}

/** Which pricing lane a Scena row belongs to, from the path in `cf_model`. */
const laneOf = (m: ModelRow): "workers-ai" | "google" => (m.cf_model.startsWith("@cf/") ? "workers-ai" : "google");

/** Rates equal to the tolerance a REAL float round-trip needs. Comparing with
 *  `!==` would re-write every row on every run and report all of them moved. */
const same = (a: number | null, b: number | null): boolean =>
  a === null && b === null ? true : a === null || b === null ? false : Math.abs(a - b) < 0.005;

export async function syncScenaModelRates(
  db: D1Database,
  deps: { fetchMd?: (url: string) => Promise<{ md: string | null; error?: string | null }> } = {},
): Promise<CatalogSyncReport> {
  await ensureBilling(db);
  const fetchMd = deps.fetchMd ?? fetchPricingDoc;

  const rows = (await db.prepare("SELECT * FROM ai_models").all<ModelRow>()).results ?? [];
  const providers: ProviderReport[] = [];

  for (const provider of ["workers-ai", "google"] as const) {
    const source = PRICING_SOURCES[provider];
    const report: ProviderReport = { provider, source, ok: false, parsed: 0, repriced: 0, retired: [], delisted: [], unchanged: 0, error: null };
    providers.push(report);

    const mine = rows.filter((r) => laneOf(r) === provider);
    if (mine.length === 0) { report.ok = true; continue; }

    const doc = await fetchMd(source);
    if (!doc.md) {
      report.error = `couldn't fetch the pricing page (${doc.error ?? "unknown error"}) — every ${provider} rate was left exactly as it was`;
      continue;
    }
    let parsed: ParsedCatalog;
    try {
      parsed = provider === "workers-ai" ? parseWorkersAiCatalog(doc.md) : parseGeminiCatalog(doc.md);
    } catch (e) {
      report.error = `the page fetched but would not parse (${e instanceof Error ? e.message : String(e)}) — nothing was written`;
      continue;
    }
    report.parsed = parsed.models.length;
    if (parsed.models.length === 0) {
      // The doc format has almost certainly changed. Writing nothing is right;
      // disabling everything because a regex stopped matching is not.
      report.error = "the page fetched but 0 models parsed — the format has probably changed; nothing was written";
      continue;
    }

    const priced = new Map<string, ModelSeed>(parsed.models.map((m) => [m.id, m]));
    // `retired` is `{ id, reason }[]` — the page still PRICES these and the
    // provider has already shut them down (see `ParsedCatalog.retired`).
    const retiredIds = new Set(parsed.retired.map((r) => r.id));

    for (const row of mine) {
      /*
        RETIRED FIRST. A model the provider has already shut down must go off
        even if it is still priced somewhere on the page — Scena has been
        happily offering and CHARGING for models in this state, which is the
        exact defect `disableRetiredModels` fixed for the shared catalog and
        that this app never got.
      */
      if (retiredIds.has(row.cf_model)) {
        if (row.enabled) {
          await db.prepare("UPDATE ai_models SET enabled = 0 WHERE id = ?").bind(row.id).run();
          report.retired.push(row.id);
        }
        continue;
      }
      const hit = priced.get(row.cf_model);
      if (!hit) {
        /*
          On the page's lane but not on the page. Either the provider dropped it
          or Scena's `cf_model` has a typo — and both mean a call to it fails,
          so leaving it enabled sells something that cannot run. Disabled rather
          than deleted: the row carries an operator's markup and enabled history,
          and a model that comes back should come back configured.
        */
        if (row.enabled) {
          await db.prepare("UPDATE ai_models SET enabled = 0 WHERE id = ?").bind(row.id).run();
          report.delisted.push(row.id);
        }
        continue;
      }
      if (
        same(row.input_rate, hit.inputRate) &&
        same(row.output_rate, hit.outputRate) &&
        same(row.unit_rate, hit.unitRate) &&
        row.unit_kind === hit.unitKind
      ) {
        report.unchanged++;
        continue;
      }
      /*
        RATES ONLY. `label`, `task`, `markup`, `enabled` and `sort` are the
        operator's — a sync that reset the markup would silently change what
        every tenant is charged, which is the opposite of what pressing this
        button is for.
      */
      await db
        .prepare("UPDATE ai_models SET input_rate = ?, output_rate = ?, unit_rate = ?, unit_kind = ? WHERE id = ?")
        .bind(hit.inputRate, hit.outputRate, hit.unitRate, hit.unitKind, row.id)
        .run();
      report.repriced++;
    }
    report.ok = true;
  }

  return { providers, ok: providers.every((p) => p.ok) };
}
