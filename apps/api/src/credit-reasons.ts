/**
 * What a credit-ledger row SAYS, in the studio's language.
 *
 * The ledger stores a machine key — `ai.coach-note`, `email.send`,
 * `grant.monthly` — because that is what the metering path has at the moment
 * it charges, and it is the right thing to persist: it never changes when we
 * reword a screen. But it is not a sentence, and Business was rendering it
 * raw, so an owner asking "what did my credits go on?" read three lines of
 * dotted identifiers (UI-LANGUAGE §10 — product language, never system
 * language).
 *
 * The naming lives HERE, on the server, for one reason: the AI half of the set
 * is open. Every entry in `AI_FEATURES` can appear as `ai.<key>`, so a second
 * copy of those twenty-three labels in the browser would drift the first time
 * a feature is renamed or added. This module asks the registry that already
 * owns the name.
 *
 * The ICON and the colour are deliberately NOT here — they are presentation,
 * and they key off `kind`, which is a small closed set the app registry maps
 * (apps/app/src/registry/credits.ts). The wire carries meaning; the app
 * decides what it looks like.
 */

import { featureDef } from "./ai-features.js";

/**
 * The kinds of credit movement, closed and small. One icon and one tone per
 * kind, chosen app-side. Splitting AI by TASK rather than by feature is the
 * whole point: twenty-three features share four verbs, and a list where every
 * row shows the same sparkle is texture, not identity (§7).
 */
export type CreditKind =
  | "ai-text"
  | "ai-vision"
  | "ai-image"
  | "ai-speech"
  | "email"
  | "pack"
  | "grant"
  | "adjust"
  | "refund"
  | "other";

export interface ReasonDescription {
  /** The row's label, in words a studio owner uses. */
  label: string;
  /** The bucket it rolls up into on the credits screen. */
  kind: CreditKind;
}

/** The fixed half of the set — every reason string that is not `ai.*`/`tts.*`. */
const FIXED: Record<string, ReasonDescription> = {
  "email.send": { label: "Email sent", kind: "email" },
  "email.refund": { label: "Email refunded", kind: "refund" },
  "pack.purchase": { label: "Credit pack", kind: "pack" },
  "pack.promo": { label: "Promotional credits", kind: "pack" },
  "pack.refund": { label: "Credit pack refunded", kind: "refund" },
  "pack.dispute": { label: "Credit pack disputed", kind: "refund" },
  "grant.monthly": { label: "Monthly plan credits", kind: "grant" },
  "grant.upgrade": { label: "Plan upgrade top-up", kind: "grant" },
  "grant.expire": { label: "Unused plan credits expired", kind: "grant" },
  "admin.adjust": { label: "Balance adjusted by Kova", kind: "adjust" },
  "admin.topup": { label: "Credits added by Kova", kind: "adjust" },
  topup: { label: "Credits added", kind: "pack" },
  usage: { label: "Usage", kind: "other" },
  /* The DO's `settle` default, reached only when a caller passes no reason. */
  "ai.generation": { label: "AI generation", kind: "ai-text" },
};

/** The AI task → kind mapping. `featureDef` returns the registry's own `task`. */
const AI_KIND: Record<string, CreditKind> = {
  text: "ai-text",
  "text-small": "ai-text",
  vision: "ai-vision",
  image: "ai-image",
};

/**
 * Turn a stored reason into something a person can read.
 *
 * An UNKNOWN key falls back to the raw string rather than to "Other": a reason
 * we forgot to name here is a gap in this table, and hiding it behind a
 * friendly word would make the gap invisible in exactly the place someone is
 * trying to account for their spend.
 */
export function describeReason(reason: string): ReasonDescription {
  const fixed = FIXED[reason];
  if (fixed) return fixed;

  if (reason.startsWith("ai.")) {
    const key = reason.slice(3);
    const def = featureDef(key);
    if (def) return { label: def.label, kind: AI_KIND[def.task] ?? "ai-text" };
    return { label: key, kind: "ai-text" };
  }
  if (reason.startsWith("tts.")) {
    const key = reason.slice(4);
    return { label: featureDef(key)?.label ?? key, kind: "ai-speech" };
  }
  return { label: reason, kind: "other" };
}

/** The heading a group of movements gets on the credits screen. */
export const KIND_LABEL: Record<CreditKind, string> = {
  "ai-text": "Writing & analysis",
  "ai-vision": "Reading photos",
  "ai-image": "Image generation",
  "ai-speech": "Voice",
  email: "Email",
  pack: "Credit packs",
  grant: "Plan credits",
  adjust: "Adjustments",
  refund: "Refunds",
  other: "Other",
};
