/**
 * THE AI SUITE — `@4dl/ai`, bound to this app's feature registry and its bucket.
 *
 * The package owns the whole metered path: resolve model → RESERVE a worst-case
 * hold on the credit DO → run (Workers AI | Gemini | the dev-only mock) →
 * SETTLE the exact credits from real usage → audit. None of that is product-
 * specific.
 *
 * Two things are, and both are bound once here at module load:
 *
 *   the REGISTRY  which features exist and their default system prompts. Kova
 *                 has 21 ("snap a meal", "extract lab markers"); an inventory
 *                 app has "read this label", "match this SKU". Metered,
 *                 audited and rate-limited identically — only the prompts
 *                 differ, which is why the registry is a parameter.
 *   the BUCKET    where a generated image goes. `@4dl/ai` takes the two storage
 *                 FUNCTIONS rather than importing `@4dl/storage`, because the
 *                 quota that governs the write lives in a billing table — the
 *                 dependency would otherwise read ai → storage → billing, and
 *                 an app that only reads labels would require a payment
 *                 provider.
 *
 * ⚠️ The mock lane is development-only in EVERY mode. `shouldUseMockLane` puts
 * the environment check on the outside, so a stored `ai.mock = "on"` cannot make
 * production fabricate output — output that gets written to a real record, flows
 * into the next prompt as context, and is BILLED to the tenant.
 */

import { configureAi, configureAiMedia, type AiFeatureMeta } from "@4dl/ai";
import { putMedia, storageUsage } from "./storage.js";

export * from "@4dl/ai";

/** Appended to a tonable feature's system prompt. Add the voices you sell. */
export const TONE_GUIDE: Record<string, string> = {
  professional: "Voice: professional, precise and evidence-based. Calm; no fluff.",
  friendly: "Voice: friendly and conversational. Approachable, never stiff.",
};

/** This app's metered AI actions. One example; replace it. */
export const AI_FEATURES: AiFeatureMeta[] = [
  {
    key: "summarize-record",
    label: "Summarise a record",
    description: "Turn one record into a short plain-language summary.",
    audience: "staff",
    task: "text",
    tonable: true,
    defaultSystem: "Summarise the supplied record in at most three sentences. No preamble, no commentary.",
  },
];

const byKey = new Map(AI_FEATURES.map((f) => [f.key, f]));

configureAi({ featureDef: (key) => byKey.get(key), toneGuide: TONE_GUIDE });
configureAiMedia({ putMedia, storageUsage } as never);
