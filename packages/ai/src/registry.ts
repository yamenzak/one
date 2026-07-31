/**
 * WHAT THE APP TELLS THE AI PACKAGE ABOUT ITSELF.
 *
 * Two things, and neither can be shared:
 *
 *   featureDef  metadata for one AI feature — which model lane it runs on, its
 *               default system prompt, whether the house tone applies. Kova has
 *               21 of these ("snap a meal", "extract lab markers"); an inventory
 *               app will have "read this label", "match this SKU". The metering,
 *               the reserve→settle loop and the audit trail are identical for
 *               all of them, which is why the REGISTRY is a parameter and the
 *               machinery is not.
 *   toneGuide   the sentence appended to a system prompt per tone. Voice is a
 *               product decision.
 *
 * Bound once at worker start via `configureAi`. A module-level registry rather
 * than a parameter threaded through twenty functions, because it is genuinely
 * constant for the lifetime of the process and every alternative made the call
 * sites worse.
 */

export type AiTone = string;

/** What a tenant may override for ONE feature. */
export interface TenantAiFeatureConfig {
  /** Off means the route refuses before any credit is held. */
  enabled?: boolean;
  /** A model id from the catalog; ignored if it cannot run the feature's task. */
  model?: string | null;
  /** Extra instruction appended to the feature's system prompt. */
  system?: string | null;
  tone?: AiTone | null;
}

/**
 * Per-tenant AI settings.
 *
 * The package reads exactly these three things — the house tone, the per-feature
 * overrides, and nothing else — so an app may store whatever else it needs on
 * the same blob via the index signature.
 */
export interface TenantAiConfig {
  tone?: AiTone | null;
  features?: Record<string, TenantAiFeatureConfig | undefined>;
  [key: string]: unknown;
}

export interface AiFeatureMeta {
  key: string;
  label: string;
  description: string;
  audience: string;
  task: string;
  /** The built-in system prompt, shown as the editable default. */
  defaultSystem: string;
  /** Whether the house/feature tone is applied (false for strict extractors). */
  tonable: boolean;
}

export interface AiRegistry {
  featureDef: (key: string) => AiFeatureMeta | undefined;
  toneGuide: Record<string, string>;
}

/** Unconfigured: no feature is known and no tone is applied. Deliberately inert
 *  rather than throwing — a misconfigured app should degrade to "no tone", not
 *  fail every generation. */
const EMPTY: AiRegistry = { featureDef: () => undefined, toneGuide: {} };

let registry: AiRegistry = EMPTY;

export function configureAi(next: AiRegistry): void {
  registry = next;
}

export const aiRegistry: AiRegistry = {
  featureDef: (key) => registry.featureDef(key),
  get toneGuide() {
    return registry.toneGuide;
  },
};
