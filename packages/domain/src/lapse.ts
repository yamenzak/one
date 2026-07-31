/**
 * Kova's copy for the client-lapse policy, over `@4dl/commerce`'s mechanism.
 *
 * The rails, the validation, the 14-day floor under the destructive pair and the
 * standing each action produces are all in `@4dl/commerce` `lapse.ts` — none of
 * that is coaching-specific. What is Kova's is the WORDING an owner reads in
 * studio settings, and the seat rule stated in it.
 */

import {
  checkLapsePolicy as check,
  isDestructive,
  type LapseAction,
  type LapseCheck,
  type LapsePolicy,
} from "@4dl/commerce/lapse";

// The engine, minus `checkLapsePolicy` — this module re-declares that one with
// Kova's wording bound in, and two star-exports of one name is an ambiguity
// error rather than an override.
export {
  DEFAULT_LAPSE_POLICY, DESTRUCTIVE_ACTIONS, LAPSE_ACTIONS, MAX_GRACE_DAYS,
  MIN_DESTRUCTIVE_GRACE_DAYS, lapseActionDue, lapseStanding,
  type LapseAction, type LapseCheck, type LapsePolicy,
} from "@4dl/commerce/lapse";

export interface LapseMeta {
  label: string;
  /** What the client experiences, in their words — this is the setting's copy. */
  effect: string;
  /** The seat consequence, or null when the seat is untouched. */
  seat: string | null;
  destructive: boolean;
}

/**
 * ── The seat rule is the one people get wrong ──
 *
 * Archiving keeps the client's row, so it keeps occupying a licensed seat;
 * deleting removes it and frees one. A studio at its plan's client limit that
 * archives everyone will hit the limit and not understand why, so it is stated
 * on BOTH actions and in OPPOSITE directions.
 */
export const LAPSE_META: Record<LapseAction, LapseMeta> = {
  read_only: {
    label: "Keep read-only",
    effect: "They keep the app and their history, but can't log anything new until they renew.",
    seat: null,
    destructive: false,
  },
  blocked: {
    label: "Show the storefront",
    effect: "The app is replaced by your packages until they buy again. Their history is kept.",
    seat: null,
    destructive: false,
  },
  archive: {
    label: "Archive them",
    effect: "They come off your roster and can only read their history. You can reactivate them any time.",
    seat: "Keeps using a client seat",
    destructive: true,
  },
  delete: {
    label: "Delete their record",
    effect: "Their record and everything in it is removed. This cannot be undone.",
    seat: "Frees a client seat",
    destructive: true,
  },
};

/** Validate a policy, with Kova's wording in the refusal. */
export const checkLapsePolicy = (p: LapsePolicy): LapseCheck => check(p, (a) => LAPSE_META[a].label);

export { isDestructive };
