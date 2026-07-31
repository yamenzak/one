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
  version: "1",
  ddl: [
    "CREATE TABLE IF NOT EXISTS ai_models (id TEXT PRIMARY KEY, task TEXT, label TEXT, provider TEXT, input_rate REAL, output_rate REAL, unit_rate REAL, unit_kind TEXT, markup REAL, enabled INTEGER DEFAULT 1, is_default INTEGER DEFAULT 0);",
    "CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, tenant_id TEXT, actor_user_id TEXT, subject_id TEXT, feature TEXT, model TEXT, neurons REAL, credits INTEGER, ok INTEGER, error TEXT, at INTEGER);",
    "CREATE INDEX IF NOT EXISTS idx_aigen_tenant ON ai_generations(tenant_id, at);",
    "CREATE TABLE IF NOT EXISTS ai_cache (prompt_hash TEXT PRIMARY KEY, feature TEXT, output_json TEXT, at INTEGER);",
    "CREATE TABLE IF NOT EXISTS insight_feedback (id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, insight_type TEXT, insight_ref TEXT, vote INTEGER, at INTEGER);",
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["ai_generations", "insight_feedback"],
    subjectColumn: "subject_id",
    subjectTables: ["ai_generations"],
  },
};
