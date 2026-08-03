/**
 * The tables the AI suite owns.
 *
 *   ai_models        the provider catalog with per-model rates. Operator-editable
 *                    at runtime, because model prices change without warning.
 *   ai_generations   the audit trail: who ran what, on which model, for how many
 *                    credits. This is what makes a bill explainable.
 *   ai_cache         deduplicated outputs, keyed by prompt hash.
 *   insight_feedback thumbs on generated output, for prompt tuning.
 *
 * `ai_models` and `ai_cache` are PLATFORM-wide and deliberately absent from the
 * tenant cascade: purging one tenant must not empty the model catalog every
 * other tenant is metered against.
 */

import type { SchemaModule } from "@4dl/core";

export const AI_SCHEMA: SchemaModule = {
  id: "ai",
  version: "2",
  ddl: [
    "CREATE TABLE IF NOT EXISTS ai_models (id TEXT PRIMARY KEY, task TEXT, label TEXT, provider TEXT, input_rate REAL, output_rate REAL, unit_rate REAL, unit_kind TEXT, markup REAL, enabled INTEGER DEFAULT 1, is_default INTEGER DEFAULT 0);",
    "CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, tenant_id TEXT, actor_user_id TEXT, subject_id TEXT, feature TEXT, model TEXT, neurons REAL, credits INTEGER, ok INTEGER, error TEXT, at INTEGER);",
    "CREATE INDEX IF NOT EXISTS idx_aigen_tenant ON ai_generations(tenant_id, at);",
    "CREATE TABLE IF NOT EXISTS ai_cache (prompt_hash TEXT PRIMARY KEY, feature TEXT, output_json TEXT, at INTEGER);",
    "CREATE TABLE IF NOT EXISTS insight_feedback (id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, insight_type TEXT, insight_ref TEXT, vote INTEGER, at INTEGER);",
  ],
  alters: [
    /**
     * The day the provider says this model stops answering (`YYYY-MM-DD`).
     *
     * Stored rather than derived, because the fact has to outlive the sync that
     * learned it: a shutdown date announced today arrives months before it
     * bites, and the row has to keep switching itself off on the right morning
     * even if nobody presses Sync again in between. Null for a model with no
     * announced end, which is almost all of them.
     */
    "ALTER TABLE ai_models ADD COLUMN retires_at TEXT;",
  ],
  backfills: [
    /**
     * The two models this whole mechanism was found because of.
     *
     * `gemini-2.0-flash` was in `DEFAULT_MODELS` as the VISION lane, so every
     * deployment that seeded and never synced is pointing Snap-a-Meal, the
     * Label Reader and the body scan at a model Google shut down on
     * 1 June 2026. Removing it from the seed fixes the next fresh install and
     * nothing else — an existing row is already in D1, enabled, quite possibly
     * `is_default`, and no sync will ever disable it, because Google still
     * prints its full pricing table under a deprecation banner.
     *
     * Stamping the date rather than switching the rows off directly is the
     * point: `disableRetiredModels` then does it, on the daily sweep, on the
     * next sync and when the console is opened — one mechanism, one place to
     * debug, and the lane re-elects a live model in the same pass. `retires_at
     * IS NULL` keeps it idempotent and stops it fighting a later parse.
     */
    {
      name: "stamp the Gemini 2.0 shutdown date",
      sql: "UPDATE ai_models SET retires_at = '2026-06-01' WHERE id IN ('gemini-2.0-flash', 'gemini-2.0-flash-lite') AND retires_at IS NULL;",
    },
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["ai_generations", "insight_feedback"],
    subjectColumn: "subject_id",
    subjectTables: ["ai_generations"],
  },
};
