/**
 * THE MODEL CATALOG, RECONCILED AGAINST THE OFFICIAL PRICING DOCS.
 *
 * This was Kova's, in `ai-routes.ts`, and nothing about it ever was: it reads
 * two public pricing pages, parses them with THIS package's parsers, and writes
 * THIS package's `ai_models` table. A second app needing a priced model catalog
 * would have had to copy it — which is precisely what Tessa did not do, and why
 * Tessa's AI console had two endpoints where Kova's had eight.
 *
 * The pieces that stay in the app are the ones that genuinely are the app's: a
 * self-test that runs the product's own prompts through its own parsers, and
 * whatever it does with user feedback. Everything here is provider mechanics.
 */

import type { SkippedModel } from "./pricing.js";
import { isRunnableTask, parseGeminiCatalog, parseWorkersAiCatalog } from "./pricing.js";
import { listModels, seedAiModels } from "./generate.js";


export const PRICING_SOURCES = {
  "workers-ai": "https://developers.cloudflare.com/workers-ai/platform/pricing/index.md",
  google: "https://ai.google.dev/gemini-api/docs/pricing.md.txt",
} as const;

export interface FetchedDoc { md: string | null; error: string | null }

/** Fetch one pricing doc. Separated from the sync so the sync's reconciliation
 *  logic is testable without the network. */
export async function fetchPricingDoc(url: string): Promise<FetchedDoc> {
  try {
    const r = await fetch(url, { headers: { accept: "text/markdown" } });
    if (!r.ok) return { md: null, error: `HTTP ${r.status}` };
    return { md: await r.text(), error: null };
  } catch (e) {
    return { md: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ProviderSyncReport {
  provider: "workers-ai" | "google";
  source: string;
  /** The doc was fetched AND parsed into at least one model. */
  ok: boolean;
  /** Models priced from the page. */
  parsed: number;
  /** Ids that were not in the catalog before this sync. */
  added: number;
  addedIds: string[];
  /** Existing ids whose rates/label were refreshed. */
  updated: number;
  /** Enabled ids that vanished from the source and were switched off. */
  disabled: number;
  disabledIds: string[];
  /** Rows the page lists but the catalog cannot price, and why. */
  unpriceable: SkippedModel[];
  error: string | null;
}

export interface SyncReport {
  ok: boolean;
  providers: ProviderSyncReport[];
  total: number;
  errors: string[];
}

/**
 * Reconcile the model catalog against the two official pricing docs.
 *
 * Per provider, independently (a Cloudflare failure must never touch a single
 * Gemini row, and vice versa):
 *   • DISCOVER — every priceable row on the page is upserted. New ids land in
 *     the catalog; runnable lanes (text / text-small / vision / image / speech)
 *     arrive ENABLED, the rest (embedding / transcribe / tts / classify) arrive
 *     disabled, because no code path here can execute them.
 *   • REFRESH — an existing row's label + rates are updated. `task`, `enabled`,
 *     `is_default` and `markup` are NOT touched: those are operator/seed
 *     decisions and the page's own lane guess would silently re-route traffic
 *     (it used to retask `gemini-2.5-flash` to text-small, pushing every text
 *     feature onto the ~8× pricier `gemini-2.5-pro`).
 *   • RECONCILE — an ENABLED row of that provider that is absent from a good
 *     parse is switched off (`enabled = 0, is_default = 0`). Never deleted: a
 *     tenant's `ai_config_json` may still name it and `ai_generations` history
 *     must stay readable. Only runs when that provider's fetch AND parse
 *     succeeded, so a 404 on one doc cannot disable the other provider's models.
 *
 * A provider that fetched but parsed ZERO models is treated as a parse failure,
 * not as "the provider has no models" — a doc-format change would otherwise
 * disable the whole catalog in one click.
 */
export async function syncModelCatalog(
  db: D1Database,
  opts: { markup: number; fetchMd: (url: string) => Promise<FetchedDoc> },
): Promise<SyncReport> {
  await seedAiModels(db);
  const existing = await db.prepare("SELECT id, provider, enabled FROM ai_models").all<{ id: string; provider: string; enabled: number }>();
  const known = new Map((existing.results ?? []).map((r) => [r.id, r]));

  const providers: ProviderSyncReport[] = [];
  const errors: string[] = [];

  for (const provider of ["workers-ai", "google"] as const) {
    const source = PRICING_SOURCES[provider];
    const report: ProviderSyncReport = { provider, source, ok: false, parsed: 0, added: 0, addedIds: [], updated: 0, disabled: 0, disabledIds: [], unpriceable: [], error: null };
    providers.push(report);

    const doc = await opts.fetchMd(source);
    if (!doc.md) {
      report.error = `couldn't fetch the pricing page (${doc.error ?? "unknown error"}) — every ${provider} model was left exactly as it was`;
      errors.push(`${provider}: ${report.error}`);
      continue;
    }
    const parsedDoc = provider === "workers-ai" ? parseWorkersAiCatalog(doc.md) : parseGeminiCatalog(doc.md);
    report.unpriceable = parsedDoc.skipped;
    report.parsed = parsedDoc.models.length;
    if (parsedDoc.models.length === 0) {
      report.error = "the page fetched but 0 models parsed — the doc format has probably changed; nothing was written or disabled";
      errors.push(`${provider}: ${report.error}`);
      continue;
    }

    for (const m of parsedDoc.models) {
      if (known.has(m.id)) report.updated++;
      else { report.added++; report.addedIds.push(m.id); }
    }

    await db.batch(parsedDoc.models.map((m) =>
      db.prepare(
        `INSERT INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET label = excluded.label, provider = excluded.provider,
           input_rate = excluded.input_rate, output_rate = excluded.output_rate, unit_rate = excluded.unit_rate, unit_kind = excluded.unit_kind`,
      ).bind(m.id, m.task, m.label, m.provider, m.inputRate, m.outputRate, m.unitRate, m.unitKind, opts.markup, isRunnableTask(m.task) ? 1 : 0),
    ));

    const live = new Set(parsedDoc.models.map((m) => m.id));
    const gone = (existing.results ?? []).filter((r) => r.provider === provider && r.enabled === 1 && !live.has(r.id)).map((r) => r.id);
    if (gone.length) {
      const ph = gone.map(() => "?").join(",");
      await db.prepare(`UPDATE ai_models SET enabled = 0, is_default = 0 WHERE id IN (${ph})`).bind(...gone).run();
      report.disabled = gone.length;
      report.disabledIds = gone;
    }
    report.ok = true;
  }

  // Guarantee a default per generation task (cheapest output among enabled).
  // Runs AFTER reconciliation so a task whose default was just switched off
  // immediately re-elects instead of leaving the lane defaultless.
  //
  // The vision lane is Gemini-only (`modelSupportsTask`), so its election is
  // constrained to Google rows. Unconstrained, this loop would happily crown the
  // cheapest vision-tagged row whatever its provider — and a Workers-AI one
  // fails every call with "model cannot read images", i.e. the sync itself could
  // break the lane. The `db.ts` migration retags those rows, but the election
  // must not be able to recreate the situation from a hand-edited catalog.
  for (const task of ["text", "text-small", "vision"]) {
    const providerClause = task === "vision" ? " AND provider = 'google'" : "";
    const has = await db.prepare(`SELECT 1 x FROM ai_models WHERE task = ? AND enabled = 1 AND is_default = 1${providerClause}`).bind(task).first();
    if (!has) await db.prepare(`UPDATE ai_models SET is_default = 1 WHERE id = (SELECT id FROM ai_models WHERE task = ? AND enabled = 1${providerClause} ORDER BY output_rate ASC LIMIT 1)`).bind(task).run();
  }

  return { ok: providers.some((p) => p.ok), providers, total: (await listModels(db)).length, errors };
}
