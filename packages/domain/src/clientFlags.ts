/**
 * Client feature flags (SPEC §7) — what a CLIENT bought from the tenant.
 *
 * Resolved through exactly one function (`resolveClientFlags`), ByShujaa's
 * hard-won rule: UI and routes never read raw flags. Merge order:
 *
 *   permissive defaults -> package defaults -> subscription overrides
 *   -> budget gating (feature off when its budget lapsed)
 *   -> ∩ tenant plan entitlements (a tenant below Studio can't sell what
 *      Mossa didn't sell them)
 */

import type { Budget } from "./budgets.js";
import { hasActiveBudget } from "./budgets.js";
import type { Entitlements } from "./entitlements.js";

export interface ClientFlags {
  // Nutrition
  canLogOwnFood: boolean;
  canEditMealPlan: boolean;
  showMacroBreakdown: boolean;
  showNutritionReports: boolean;
  // Exercise
  canRequestExerciseSwap: boolean;
  canReorderExercises: boolean;
  canLogExtraWorkouts: boolean;
  // Reporting
  canViewBodyMetricsReport: boolean;
  canViewExerciseReport: boolean;
  // Wellness
  canLogSleep: boolean;
  canLogMood: boolean;
  canLogWater: boolean;
  canLogMeasurements: boolean;
  canTrackFasting: boolean;
  // Check-ins
  checkInRequired: boolean;
  checkInIncludesMood: boolean;
  checkInIncludesSleep: boolean;
  checkInIncludesStress: boolean;
  checkInIncludesMeasurements: boolean;
  checkInIncludesPhotos: boolean;
  // AI (client-facing features; still requires tenant aiSuite entitlement)
  canUseAi: boolean;
}

/** Permissive defaults — a subscription-less client in a generous tenancy. */
export const DEFAULT_CLIENT_FLAGS: ClientFlags = {
  canLogOwnFood: true,
  canEditMealPlan: true,
  showMacroBreakdown: true,
  showNutritionReports: true,
  canRequestExerciseSwap: true,
  canReorderExercises: true,
  canLogExtraWorkouts: true,
  canViewBodyMetricsReport: true,
  canViewExerciseReport: true,
  canLogSleep: true,
  canLogMood: true,
  canLogWater: true,
  canLogMeasurements: true,
  canTrackFasting: false, // the one default-off logging flag (ByShujaa parity)
  checkInRequired: false,
  checkInIncludesMood: true,
  checkInIncludesSleep: true,
  checkInIncludesStress: true,
  checkInIncludesMeasurements: true,
  checkInIncludesPhotos: true,
  canUseAi: true,
};

/** Flags forced off when the WORKOUT budget has lapsed. */
const WORKOUT_GATED: (keyof ClientFlags)[] = [
  "canRequestExerciseSwap",
  "canReorderExercises",
  "canViewExerciseReport",
];

/** Flags forced off when the MEAL budget has lapsed. */
const MEAL_GATED: (keyof ClientFlags)[] = ["canEditMealPlan"];

function applyPartial(base: ClientFlags, partial: Partial<ClientFlags> | null | undefined): ClientFlags {
  if (!partial) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(partial)) {
    if (k in out && typeof v === "boolean") (out as Record<string, boolean>)[k] = v;
  }
  return out;
}

export function parseFlagsJson(json: string | null | undefined): Partial<ClientFlags> | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json);
    return raw && typeof raw === "object" ? (raw as Partial<ClientFlags>) : null;
  } catch {
    return null;
  }
}

export interface ResolveFlagsInput {
  /** Package-level defaults (flags_json on the package). */
  packageFlags?: Partial<ClientFlags> | null;
  /** Subscription-level overrides (flags_json on the client subscription). */
  subscriptionFlags?: Partial<ClientFlags> | null;
  /** The subscription's budgets; omit entirely for "no subscription" clients. */
  budgets?: Budget[] | null;
  /** Tenant plan entitlements — the outer bound. */
  entitlements: Entitlements;
  nowIso: string;
}

/** THE resolver. Everything client-capability flows through here. */
export function resolveClientFlags(input: ResolveFlagsInput): ClientFlags {
  let flags = applyPartial(DEFAULT_CLIENT_FLAGS, input.packageFlags);
  flags = applyPartial(flags, input.subscriptionFlags);

  // Budget gating — only when the client actually has a subscription.
  if (input.budgets) {
    if (!hasActiveBudget(input.budgets, "workout", input.nowIso)) {
      for (const k of WORKOUT_GATED) flags[k] = false;
    }
    if (!hasActiveBudget(input.budgets, "meal", input.nowIso)) {
      for (const k of MEAL_GATED) flags[k] = false;
    }
  }

  // ∩ tenant entitlements — the tenant can't grant what Mossa didn't sell them.
  if (!input.entitlements.features.aiSuite) flags.canUseAi = false;
  if (!input.entitlements.features.supplementsLabs) {
    // no client-facing flags today for supplements/labs; routes gate directly
  }

  return flags;
}
