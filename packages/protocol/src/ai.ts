/**
 * AI configuration wire schema (SPEC §6) — the tenant's control surface over
 * the metered AI suite: per-feature enable/model/system-prompt overrides and a
 * house tone. Shared api <-> app so the settings UI renders the same registry
 * the server executes.
 */

/** Output voice the tenant sets for personalized/creative AI copy. */
export const AI_TONES = ["professional", "motivating", "friendly", "direct", "funny", "tough-love"] as const;
export type AiTone = (typeof AI_TONES)[number];

export type AiAudience = "trainer" | "client";
export type AiTask = "text" | "text-small" | "vision" | "image";

/** One AI feature as advertised to the settings UI (defaults live server-side). */
export interface AiFeatureMeta {
  key: string;
  label: string;
  description: string;
  audience: AiAudience;
  task: AiTask;
  /** The built-in system prompt, shown as the editable default. */
  defaultSystem: string;
  /** Whether the house/feature tone is applied (false for strict extractors). */
  tonable: boolean;
}

/** A selectable model from the platform catalog. */
export interface AiModelMeta {
  id: string;
  label: string;
  task: string;
  provider: string;
}

/** Per-feature tenant overrides. Absent fields fall back to the built-in default. */
export interface AiFeatureConfig {
  enabled?: boolean;
  /** ai_models.id override; null/absent = the task's default model. */
  model?: string | null;
  /** Replaces the built-in system prompt when non-empty. */
  system?: string | null;
  /** Overrides the house tone for this feature. */
  tone?: AiTone | null;
}

/** The tenant's whole AI configuration blob (tenant_settings.ai_config_json). */
export interface TenantAiConfig {
  /** House tone applied to all tonable features unless a feature overrides it. */
  tone?: AiTone | null;
  features?: Record<string, AiFeatureConfig>;
}

/** GET /settings/ai payload — registry + catalog + the tenant's current config. */
export interface AiSettingsPayload {
  features: AiFeatureMeta[];
  models: AiModelMeta[];
  tones: readonly AiTone[];
  config: TenantAiConfig;
}
