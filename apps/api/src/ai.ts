/**
 * Kova's AI suite — `@4dl/ai`, bound to Kova's feature registry and its bucket.
 *
 * The package owns the whole metered path: resolve model → reserve a worst-case
 * hold on the credit DO → run (Workers AI | Gemini | the dev-only mock) → settle
 * the exact credits from real usage → audit. None of that is coaching-specific.
 *
 * Two things are, and both are bound once here at module load:
 *
 *   the REGISTRY  which features exist, their default system prompts, and the
 *                 tone sentences. Kova has 21; an inventory app will have "read
 *                 this label" and "match this SKU", metered identically.
 *   the BUCKET    where a generated image goes. `@4dl/ai` takes the two storage
 *                 functions rather than importing `@4dl/storage`, because the
 *                 quota that governs the write lives in a billing table — so the
 *                 dependency would otherwise read ai → storage → billing, and an
 *                 app that only reads labels would require a payment provider.
 */

import { configureAi, configureAiMedia } from "@4dl/ai";
import { AI_FEATURES, featureDef, TONE_GUIDE } from "./ai-features.js";
import { putMedia, storageUsage } from "./storage.js";

export * from "@4dl/ai";

configureAi({ featureDef, toneGuide: TONE_GUIDE });
configureAiMedia({ putMedia, storageUsage } as never);

// Re-exported so `ai-routes.ts` keeps one import for the catalog it renders.
export { AI_FEATURES };
