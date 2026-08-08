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

import type { ModelSeed, ParsedCatalog, SkippedModel } from "./pricing.js";
import { isRunnableTask, parseGeminiCatalog, parseWorkersAiCatalog } from "./pricing.js";
import { electLaneDefaults, listModels, seedAiModels } from "./generate.js";


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
  /**
   * Rows the page still prices but the provider has already SHUT DOWN.
   *
   * Reported separately from `unpriceable` because the operator's response is
   * different: an unpriceable model is a gap in coverage to live with, a retired
   * one is a model that may already be a lane default and is now failing every
   * call in it. `retiredDisabled` is how many were actually in the catalog and
   * have just been switched off — "found 2, switched off 0" and "found 2,
   * switched off 2" are very different sentences.
   */
  retired: SkippedModel[];
  retiredDisabled: number;
  /** Where the models came from: the provider's own page, or a shared catalog
   *  another app already parsed. Reported because "synced" meaning two
   *  different things is exactly the ambiguity an operator screen must not
   *  have. (`source` above is the URL; this is the lane.) */
  from: "pricing page" | "shared catalog";
  error: string | null;
}

export interface SyncReport {
  /**
   * Every model this run parsed, across providers.
   *
   * Carried out so the caller can publish it to the platform store without
   * parsing the pages a second time. Stripped before the report is serialised
   * to the console — it is the input to a side effect, not something an
   * operator screen has any use for.
   */
  parsedModels: ModelSeed[];
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
export interface SyncOptions {
  markup: number;
  /** Fetch a pricing doc. Unused when `from` is supplied. */
  fetchMd: (url: string) => Promise<FetchedDoc>;
  /**
   * Apply an ALREADY-PARSED catalog instead of reading the pricing pages.
   *
   * This is how a catalog parsed once by one app reaches the others — and how a
   * deployment survives a doc-format change or a bad day at a provider: the
   * route falls back to the last published catalog rather than reporting total
   * failure and leaving a fresh app on its twelve-row hardcoded seed. See
   * shared-catalog.ts.
   */
  from?: ModelSeed[];
  /** "Now", for deciding whether an announced shutdown has already happened.
   *  A parameter so the retirement rules are testable without moving a clock. */
  now?: number;
}

/**
 * Switch off every model whose announced shutdown date has passed.
 *
 * Separate from the sync, and callable on its own, because the two facts arrive
 * at different times: the DATE is learned whenever the page is read, and it
 * comes true on a morning that may be months later. A deployment that syncs
 * once and then leaves the console alone — which is the normal case — would
 * otherwise keep a dead model enabled, and possibly a lane default, until
 * somebody happened to press Sync.
 *
 * Returns the ids it switched off, so a caller with somewhere to say it can.
 */
export async function disableRetiredModels(db: D1Database, now: number = Date.now()): Promise<string[]> {
  const today = new Date(now).toISOString().slice(0, 10);
  const rows = await db
    .prepare("SELECT id FROM ai_models WHERE retires_at IS NOT NULL AND retires_at < ? AND (enabled = 1 OR is_default = 1)")
    .bind(today)
    .all<{ id: string }>()
    .catch(() => ({ results: [] as { id: string }[] }));
  const ids = (rows.results ?? []).map((r) => r.id);
  if (!ids.length) return [];
  await db
    .prepare(`UPDATE ai_models SET enabled = 0, is_default = 0 WHERE id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .run()
    .catch(() => undefined);
  return ids;
}

export async function syncModelCatalog(db: D1Database, opts: SyncOptions): Promise<SyncReport> {
  const now = opts.now ?? Date.now();
  await seedAiModels(db);
  const existing = await db.prepare("SELECT id, provider, enabled FROM ai_models").all<{ id: string; provider: string; enabled: number }>();
  const known = new Map((existing.results ?? []).map((r) => [r.id, r]));

  const providers: ProviderSyncReport[] = [];
  const parsedModels: ModelSeed[] = [];
  const errors: string[] = [];

  for (const provider of ["workers-ai", "google"] as const) {
    const source = PRICING_SOURCES[provider];
    const report: ProviderSyncReport = { provider, source, from: "pricing page", ok: false, parsed: 0, added: 0, addedIds: [], updated: 0, disabled: 0, disabledIds: [], unpriceable: [], retired: [], retiredDisabled: 0, error: null };
    providers.push(report);

    let parsedDoc: ParsedCatalog;
    if (opts.from) {
      // Already parsed elsewhere. `skipped` is empty by construction: whatever
      // could not be priced was dropped by the app that did the parsing, and
      // re-reporting it here would attribute another app's parse warnings to a
      // run that never read a page.
      // `retired` is empty for the same reason `skipped` is — the app that read
      // the page dropped them before publishing. The catalog-wide sweep below
      // is what covers a shared catalog published BEFORE this was understood,
      // and it does not depend on anyone parsing anything.
      parsedDoc = { models: opts.from.filter((m) => m.provider === provider), skipped: [], retired: [] };
      report.from = "shared catalog";
    } else {
      const doc = await opts.fetchMd(source);
      if (!doc.md) {
        report.error = `couldn't fetch the pricing page (${doc.error ?? "unknown error"}) — every ${provider} model was left exactly as it was`;
        errors.push(`${provider}: ${report.error}`);
        continue;
      }
      parsedDoc = provider === "workers-ai" ? parseWorkersAiCatalog(doc.md) : parseGeminiCatalog(doc.md, now);
    }
    report.unpriceable = parsedDoc.skipped;
    report.retired = parsedDoc.retired;
    report.parsed = parsedDoc.models.length;
    if (parsedDoc.models.length === 0) {
      report.error = opts.from
        ? `the shared catalog carries no ${provider} models — nothing was written or disabled`
        : "the page fetched but 0 models parsed — the doc format has probably changed; nothing was written or disabled";
      errors.push(`${provider}: ${report.error}`);
      continue;
    }

    for (const m of parsedDoc.models) {
      if (known.has(m.id)) report.updated++;
      else { report.added++; report.addedIds.push(m.id); }
    }

    await db.batch(parsedDoc.models.map((m) =>
      db.prepare(
        `INSERT INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default, retires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET label = excluded.label, provider = excluded.provider,
           input_rate = excluded.input_rate, output_rate = excluded.output_rate, unit_rate = excluded.unit_rate, unit_kind = excluded.unit_kind,
           retires_at = excluded.retires_at`,
      ).bind(m.id, m.task, m.label, m.provider, m.inputRate, m.outputRate, m.unitRate, m.unitKind, opts.markup, isRunnableTask(m.task) ? 1 : 0, m.retiresAt ?? null),
    ));

    // A retired model is switched off HERE rather than left to the "gone from
    // the page" rule below, which would never fire: it is still on the page,
    // still priced, and would look perfectly live to that check forever.
    if (parsedDoc.retired.length) {
      const ph = parsedDoc.retired.map(() => "?").join(",");
      const r = await db
        .prepare(`UPDATE ai_models SET enabled = 0, is_default = 0 WHERE id IN (${ph}) AND (enabled = 1 OR is_default = 1)`)
        .bind(...parsedDoc.retired.map((x) => x.id))
        .run();
      report.retiredDisabled = r.meta?.changes ?? 0;
    }

    const live = new Set(parsedDoc.models.map((m) => m.id));
    const gone = (existing.results ?? []).filter((r) => r.provider === provider && r.enabled === 1 && !live.has(r.id)).map((r) => r.id);
    if (gone.length) {
      const ph = gone.map(() => "?").join(",");
      await db.prepare(`UPDATE ai_models SET enabled = 0, is_default = 0 WHERE id IN (${ph})`).bind(...gone).run();
      report.disabled = gone.length;
      report.disabledIds = gone;
    }
    parsedModels.push(...parsedDoc.models);
    report.ok = true;
  }

  // Catch anything whose stored date came true since the last run, including
  // rows this sync never looked at — a provider whose page failed to fetch, and
  // a catalog seeded from a shared publication that predates the retirement
  // rules. Runs BEFORE the election below so a lane whose default just died
  // re-elects in the same pass rather than staying pointed at a dead model
  // until the next one.
  const sweptRetired = await disableRetiredModels(db, now);
  if (sweptRetired.length) {
    const google = providers.find((p) => p.provider === "google");
    if (google) google.retiredDisabled += sweptRetired.length;
  }

  /*
    Guarantee a default per RUNNABLE lane. Runs AFTER reconciliation so a lane
    whose default was just switched off re-elects in the same pass instead of
    being left defaultless.

    ⚠️ THIS USED TO NAME THREE LANES — `text`, `text-small`, `vision`, i.e.
    Kova's — while the shared-catalog seed a hundred lines away elected over six.
    Two implementations of "which model does this lane run on", disagreeing, in
    one package. An app whose lanes are image / speech / music therefore came out
    of a sync with no default in any of them, and `modelForTask` breaks ties on
    `is_default DESC` alone: the generator picked a row by database order while
    the operator console showed no default at all.

    `electLaneDefaults` is the one answer, driven by `configureAiLanes` — so an
    app that declares a lane gets an elected default in it, and one that does not
    is not given a default for something it cannot run.
  */
  await electLaneDefaults(db);

  return { parsedModels, ok: providers.some((p) => p.ok), providers, total: (await listModels(db)).length, errors };
}
