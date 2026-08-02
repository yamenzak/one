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
 *   the REGISTRY  which features exist and their default system prompts.
 *   the BUCKET    where generated media goes. `@4dl/ai` takes the two storage
 *                 FUNCTIONS rather than importing `@4dl/storage`, because the
 *                 quota governing the write lives in a billing table — the
 *                 dependency would otherwise read ai → storage → billing.
 *
 * ⚠️ The mock lane is development-only in EVERY mode. `shouldUseMockLane` puts
 * the environment check on the outside, so a stored `ai.mock = "on"` cannot make
 * production fabricate output — output that here would be written onto a
 * STERILISATION record and read back as evidence.
 */

import { configureAi, configureAiMedia, type AiFeatureMeta } from "@4dl/ai";
import { putMedia, storageUsage } from "./storage.js";

export * from "@4dl/ai";

/**
 * Appended to a tonable feature's system prompt.
 *
 * Two voices, not five. A sterile-supply centre writes for two audiences — its
 * own staff and an inspector — and a "friendly" recall report would be a
 * category error.
 */
export const TONE_GUIDE: Record<string, string> = {
  professional: "Voice: precise, clinical, and factual. Short sentences. No hedging, no filler, no reassurance.",
  regulatory:
    "Voice: formal and auditable, suitable for an inspection file. State facts and their sources. " +
    "Never infer beyond the data given, and say plainly when something is unknown.",
};

export const TONE_KEYS = ["professional", "regulatory"] as const;
export type Tone = (typeof TONE_KEYS)[number];

/**
 * Tessa's metered AI actions.
 *
 * Four, and each earns its place by doing something the deterministic code
 * genuinely cannot:
 *
 *   read-label      the Code128/GS1 parser handles a scannable barcode. This is
 *                   for the ones that are not: a foil pouch with a crease
 *                   through the code, a handwritten lot on a decanted bottle, a
 *                   supplier who prints the expiry as "Verw. bis 03/2027". The
 *                   scanner is the fast path and stays the default; this is the
 *                   fallback that stops the whole item being typed by hand.
 *   reorder-advisor par levels and consumption rates are arithmetic; the
 *                   JUDGEMENT — order this now, that can wait, this is
 *                   overstocked and will expire before you use it — is not.
 *   recall-report   the recall QUERY is deterministic and already exists
 *                   (`cycles.ts`). What a centre hands an inspector is prose,
 *                   and writing it under time pressure, in German, about a
 *                   patient-safety event, is where mistakes happen.
 *   read-document   an IFU or an RKI notice is 40 pages of PDF text and the
 *                   question is always "what changed for us".
 *
 * ⚠️ Every one of these ASSISTS. None writes a record by itself: `read-label`
 * fills a form the person confirms, and the narratives are drafts a named person
 * signs. That is not caution about model quality — under MPBetreibV the release
 * and the record are a person's act, and a system that generated them would be
 * producing an unsigned legal document.
 */
export const AI_FEATURES: AiFeatureMeta[] = [
  {
    key: "read-label",
    label: "Read a label",
    description: "Photograph a package: pull out the item, lot, expiry and GTIN when the barcode will not scan.",
    audience: "staff",
    task: "vision",
    tonable: false,
    defaultSystem:
      "You read medical-device and consumable packaging. Return ONLY JSON with these keys: " +
      '{"name":string|null,"manufacturer":string|null,"gtin":string|null,"lot":string|null,"expiry":string|null,"quantity":number|null,"confidence":number}. ' +
      "`expiry` MUST be ISO `YYYY-MM-DD`; when a label gives only a month (`03/2027`, `2027-03`, `Verw. bis 03/2027`) " +
      "use the LAST day of that month, because that is what the manufacturer means. " +
      "`gtin` is digits only, 8/12/13/14 long. `lot` is the batch code — German labels mark it `Ch.-B.`, `LOT` or `Charge`. " +
      "`confidence` is 0-1 for the reading as a whole. " +
      "Use null for anything you cannot READ. Never infer, never complete a partial number, never guess a plausible date — " +
      "a wrong expiry on a sterile item is a patient-safety failure, and a null is corrected by a human in seconds.",
  },
  {
    key: "reorder-advisor",
    label: "What to order",
    description: "A weekly read of stock against par levels, consumption and expiry dates.",
    audience: "staff",
    task: "text",
    tonable: true,
    defaultSystem:
      "You advise a medical-centre stock room. You are given items with par level, quantity on hand, recent consumption " +
      "and the earliest expiry in stock. Produce a short briefing in three sections: ORDER NOW, WATCH, and OVERSTOCKED. " +
      "Under ORDER NOW put anything that will run out before a normal delivery lands; give the item and a suggested quantity. " +
      "Under OVERSTOCKED put anything holding more than it will consume before its earliest expiry — say the date. " +
      "Be specific and brief. Cite only the numbers you were given; never invent a lead time, a price or a supplier.",
  },
  {
    key: "recall-report",
    label: "Draft the recall report",
    description: "Turn a failed load into the written account a centre hands an inspector.",
    audience: "staff",
    task: "text",
    tonable: true,
    defaultSystem:
      "You draft the written account of a sterilisation recall for a medical centre's quality file. " +
      "You are given the load, why it failed, the packs it produced, where each pack ended up, and which cases used one. " +
      "Write: what failed and when it was detected; what was reprocessed or quarantined; what was USED before detection " +
      "and on which cases; and what remains unaccounted for. " +
      "State the unaccounted items plainly and first among the open points — an unreachable pack is the entire reason the " +
      "document exists, and a report that reads as complete when it is not is worse than no report. " +
      "Do not recommend clinical action and do not reassure. Facts, dates, identifiers.",
  },
  {
    key: "read-document",
    label: "Summarise a document",
    description: "An IFU, a supplier datasheet or an RKI notice, reduced to what changes for this centre.",
    audience: "staff",
    task: "text",
    tonable: true,
    defaultSystem:
      "You summarise a manufacturer instruction-for-use, datasheet or regulatory notice for a sterile-supply centre. " +
      "Lead with what the centre must DO differently. Then list, when the document states them: reprocessing method and " +
      "temperature, the maximum number of reprocessing cycles, storage conditions, sterile shelf life, and any explicit " +
      "prohibition. Quote figures exactly as written and give the unit. " +
      "If the document does not state something, say it is not stated — do not supply a typical value. " +
      "Answer in the language of the request, even when the document is in another.",
  },
];

const byKey = new Map(AI_FEATURES.map((f) => [f.key, f]));

/** Is this feature real? Used by settings and the routes to refuse an unknown key. */
export const isAiFeature = (key: string): boolean => byKey.has(key);

configureAi({ featureDef: (key) => byKey.get(key), toneGuide: TONE_GUIDE });
configureAiMedia({ putMedia, storageUsage } as never);
