/**
 * Client feature flags (SPEC §7) — what a CLIENT bought from the tenant.
 *
 * Resolved through exactly one function (`resolveClientFlags`), ByShujaa's
 * hard-won rule: UI and routes never read raw flags. Merge order:
 *
 *   permissive defaults -> package defaults -> subscription overrides
 *   -> budget gating (feature off when its budget lapsed)
 *   -> ∩ tenant plan entitlements (a tenant below Studio can't sell what
 *      Kova didn't sell them)
 */

import type { Budget, BudgetFeature } from "@4dl/commerce/model";
import { hasActiveBudget } from "@4dl/commerce/model";
import type { Entitlements } from "./entitlements.js";

export interface ClientFlags {
  // Plan access — the headline "meal plan" / "workout plan" package primitives.
  // Budget-gated: a workout-only package (a `workout` budget, no `meal`) leaves
  // the client seeing their training plan but not a meal plan, and vice-versa.
  canAccessWorkoutPlan: boolean;
  canAccessMealPlan: boolean;
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
  /** Camera body-fat scan. Gated by the tenant's `bfCamera` entitlement. */
  canUseBodyScan: boolean;
  // Check-ins
  checkInRequired: boolean;
  checkInIncludesMood: boolean;
  checkInIncludesSleep: boolean;
  checkInIncludesStress: boolean;
  checkInIncludesMeasurements: boolean;
  checkInIncludesPhotos: boolean;
  // AI — decomposed so a package can bundle AI granularly. Every AI flag is
  // bounded by the master `canUseAi` AND the tenant's aiSuite entitlement.
  canUseAi: boolean; // master switch
  aiMealTools: boolean; // Snap-a-Meal, Label Reader, AI food parse, AI recipes
  aiCoachInsights: boolean; // AI coach notes + progress narratives
}

/** Permissive defaults — a subscription-less client in a generous tenancy. */
export const DEFAULT_CLIENT_FLAGS: ClientFlags = {
  canAccessWorkoutPlan: true,
  canAccessMealPlan: true,
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
  canUseBodyScan: true, // capability default; forced off without the bfCamera entitlement
  checkInRequired: false,
  checkInIncludesMood: true,
  checkInIncludesSleep: true,
  checkInIncludesStress: true,
  checkInIncludesMeasurements: true,
  checkInIncludesPhotos: true,
  canUseAi: true,
  aiMealTools: true,
  aiCoachInsights: true,
};

/** Categories for grouping flags in the package builder (order = display order). */
export type ClientFlagCategory = "plan" | "nutrition" | "exercise" | "wellness" | "checkin" | "reporting" | "ai";
export const CLIENT_FLAG_CATEGORIES: { key: ClientFlagCategory; label: string }[] = [
  { key: "plan", label: "Plans" },
  { key: "nutrition", label: "Nutrition" },
  { key: "exercise", label: "Training" },
  { key: "wellness", label: "Wellness logging" },
  { key: "checkin", label: "Check-ins" },
  { key: "reporting", label: "Reports" },
  { key: "ai", label: "AI features" },
];

export interface ClientFlagMeta {
  label: string;
  hint: string;
  category: ClientFlagCategory;
  /** Platform entitlement the tenant must hold to offer this to clients. */
  requiresFeature?: keyof Entitlements["features"];
  /** Access budget that must be currently active for this flag to hold — when
   *  the covering budget lapses, the flag is forced off (SSOT for budget gating;
   *  the resolver derives its gate lists from this, mirroring requiresFeature). */
  budgetGate?: BudgetFeature;
  /**
   * DECLARED but backed by nothing: no route enforces it and no screen offers
   * it, so selling it would be selling a capability that does not exist. Mirrors
   * `FEATURE_META.reserved` for platform entitlements — the package builder hides
   * it, and the conformance test in `features.test.ts` permits it to have no
   * FeatureSpec. Resolution still honours a stored value, so a package that
   * already carries the flag keeps exactly what it was sold.
   */
  reserved?: boolean;
  /**
   * Shapes a FORM rather than granting a capability: it decides which fields the
   * check-in composer renders, not whether a route may be called. These have no
   * FeatureSpec on purpose — there is nothing to 403, and rejecting a check-in
   * because it carried one extra field would lose the client's data. Enforced in
   * the UI composer only.
   */
  formOnly?: boolean;
}

/** Metadata that drives the tenant's package builder: every flag auto-appears
 *  as a labelled, categorised toggle, hidden when the tenant lacks the feature
 *  that would back it. New flags added above surface with no extra wiring. */
export const CLIENT_FLAG_META: Record<keyof ClientFlags, ClientFlagMeta> = {
  canAccessWorkoutPlan: { label: "Workout plan", hint: "See & follow their training plan", category: "plan", budgetGate: "workout" },
  canAccessMealPlan: { label: "Meal plan", hint: "See & follow their meal plan", category: "plan", budgetGate: "meal" },
  canLogOwnFood: { label: "Log own food", hint: "Self-log meals & foods", category: "nutrition" },
  canEditMealPlan: { label: "Swap meal options", hint: "Pick/customise meal-plan options", category: "nutrition", budgetGate: "meal" },
  showMacroBreakdown: { label: "Macro breakdown", hint: "See per-meal macro detail", category: "nutrition" },
  showNutritionReports: { label: "Nutrition reports", hint: "Nutrition trends & adherence", category: "nutrition" },
  canRequestExerciseSwap: { label: "Request swaps", hint: "Ask the coach to swap an exercise", category: "exercise", budgetGate: "workout" },
  // Reserved: there is no reorder affordance in the workout player and no route
  // that reorders a session, so this toggle sold nothing. Audit round-6.
  canReorderExercises: { label: "Reorder exercises", hint: "Reorder within a session", category: "exercise", budgetGate: "workout", reserved: true },
  canLogExtraWorkouts: { label: "Log extra workouts", hint: "Log sessions beyond the plan", category: "exercise" },
  canViewBodyMetricsReport: { label: "Body-metrics report", hint: "Weight/body-fat trends", category: "reporting" },
  canViewExerciseReport: { label: "Strength report", hint: "Lift progression & PRs", category: "reporting", budgetGate: "workout" },
  canLogSleep: { label: "Log sleep", hint: "Sleep duration & quality", category: "wellness" },
  canLogMood: { label: "Log mood", hint: "Mood, energy & stress", category: "wellness" },
  canLogWater: { label: "Log water", hint: "Hydration tracking", category: "wellness" },
  canLogMeasurements: { label: "Log measurements", hint: "Body measurements", category: "wellness" },
  canTrackFasting: { label: "Fasting timer", hint: "Intermittent-fasting tracker", category: "wellness" },
  canUseBodyScan: { label: "Body scan", hint: "Camera body-fat estimator", category: "wellness", requiresFeature: "bfCamera" },
  // Reserved: nothing requires, nags or blocks on a missing check-in.
  checkInRequired: { label: "Require check-ins", hint: "Client must submit check-ins", category: "checkin", reserved: true },
  checkInIncludesMood: { label: "Check-in: mood", hint: "Mood in the check-in form", category: "checkin", formOnly: true },
  checkInIncludesSleep: { label: "Check-in: sleep", hint: "Sleep in the check-in form", category: "checkin", formOnly: true },
  checkInIncludesStress: { label: "Check-in: stress", hint: "Stress in the check-in form", category: "checkin", formOnly: true },
  checkInIncludesMeasurements: { label: "Check-in: measurements", hint: "Measurements in the check-in form", category: "checkin", formOnly: true },
  checkInIncludesPhotos: { label: "Check-in: photos", hint: "Progress photos in the check-in form", category: "checkin", formOnly: true },
  canUseAi: { label: "AI (all)", hint: "Master switch for client AI features", category: "ai", requiresFeature: "aiSuite" },
  aiMealTools: { label: "AI food tools", hint: "Snap-a-Meal, Label Reader, AI recipes", category: "ai", requiresFeature: "aiSuite" },
  aiCoachInsights: { label: "AI insights", hint: "AI coach notes & progress narratives", category: "ai", requiresFeature: "aiSuite" },
};

/** All flag keys, derived from the defaults (new keys auto-appear). */
export const CLIENT_FLAG_KEYS = Object.keys(DEFAULT_CLIENT_FLAGS) as (keyof ClientFlags)[];

/** Flags that grant nothing today — hidden from the package builder so a tenant
 *  cannot sell a capability the product does not have (audit round-6). */
export const RESERVED_CLIENT_FLAGS = CLIENT_FLAG_KEYS.filter((k) => CLIENT_FLAG_META[k].reserved);
/** Flags that compose the check-in FORM rather than gating a route. */
export const FORM_ONLY_CLIENT_FLAGS = CLIENT_FLAG_KEYS.filter((k) => CLIENT_FLAG_META[k].formOnly);

/** The flags a tenant may put on a package: everything with a real surface. */
export const SELLABLE_CLIENT_FLAG_KEYS = CLIENT_FLAG_KEYS.filter((k) => !CLIENT_FLAG_META[k].reserved);

/**
 * The flags a budget scope actually gates, derived from `budgetGate`. `meal`
 * days buy the meal plan and meal-option swaps and nothing else; `workout` days
 * buy the training plan, swap requests and the strength report. Nothing else in
 * the flag set is budget-gated, which is the fact both checks below turn on.
 */
export function flagsGatedByScope(scope: BudgetFeature): (keyof ClientFlags)[] {
  return CLIENT_FLAG_KEYS.filter((k) => CLIENT_FLAG_META[k].budgetGate === scope);
}

/** One thing wrong with how a package's budgets and flags fit together. */
export interface PackageContradiction {
  kind: "budget-buys-nothing" | "flag-has-no-days";
  /** The budget scope involved (`workout` / `meal`). */
  scope: BudgetFeature;
  /** For `flag-has-no-days`, the flags that will resolve OFF anyway. */
  flags: (keyof ClientFlags)[];
}

/**
 * Does this package's day budget agree with its capability toggles?
 *
 * The two halves of the builder are independent, and they can be set to
 * contradict each other in both directions:
 *
 *   budget-buys-nothing  30 meal days sold with BOTH meal-gated flags off. The
 *                        client pays for days that unlock nothing, the days tick
 *                        down, and `overallDaysRemaining` — a MAX across scopes —
 *                        can even report the headline runway from the scope they
 *                        cannot use. This is the case that prompted the check:
 *                        a package carrying workout AND meal days with the meal
 *                        plan switched off is indistinguishable, at purchase,
 *                        from one that includes meals.
 *   flag-has-no-days     the meal plan switched ON with no meal (or `all`)
 *                        budget. Harmless but useless: `resolveClientFlags`
 *                        gates on the budget and forces the flag off, so the
 *                        toggle in the builder shows a capability the client
 *                        will never have.
 *
 * Pure, and deliberately a REPORT rather than a refusal. A studio may have a
 * reason we have not thought of, and refusing to save a package because two
 * toggles disagree is the kind of validation that makes a product feel like it
 * is arguing with you. The builder shows it; the coach decides.
 */
export function packageContradictions(
  flags: Partial<ClientFlags> | null | undefined,
  budgets: readonly { feature: BudgetFeature }[],
  scopes: readonly BudgetFeature[],
  wildcard: BudgetFeature = "all",
): PackageContradiction[] {
  const effective = applyPartial(DEFAULT_CLIENT_FLAGS, flags);
  const sold = new Set(budgets.map((b) => b.feature));
  const out: PackageContradiction[] = [];
  for (const scope of scopes) {
    const gatedFlags = flagsGatedByScope(scope);
    // A reserved flag grants nothing today, so it cannot be what a day buys.
    const live = gatedFlags.filter((k) => !CLIENT_FLAG_META[k].reserved);
    if (live.length === 0) continue;
    const on = live.filter((k) => effective[k]);
    // A wildcard budget covers every scope, so it is never "for" one of them —
    // judging it per-scope would report `all` days as dead the moment any one
    // scope is switched off, which is the opposite of what a wildcard means.
    if (sold.has(scope) && on.length === 0) out.push({ kind: "budget-buys-nothing", scope, flags: live });
    else if (!sold.has(scope) && !sold.has(wildcard) && on.length > 0) out.push({ kind: "flag-has-no-days", scope, flags: on });
  }
  return out;
}

function applyPartial(base: ClientFlags, partial: Partial<ClientFlags> | null | undefined): ClientFlags {
  // Always return a fresh object — the resolver mutates the result in place
  // (budget gating, entitlement intersection), so returning `base` by reference
  // would corrupt the shared DEFAULT_CLIENT_FLAGS constant across calls.
  if (!partial) return { ...base };
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
  /**
   * PER-CLIENT overrides a staff member set by hand on this access row
   * (`overrides_json`), on top of whatever the package sells.
   *
   * Its own layer rather than an edit to `subscriptionFlags`, because that column
   * is a SNAPSHOT of the package taken at grant time — a full set, not a diff.
   * Editing it in place would work and would destroy the only thing that makes
   * this feature legible: which capabilities came with the package and which one
   * person decided. Sparse here means the screen can show "from the package" vs
   * "you turned this on", and "reset" is deleting a key rather than guessing
   * what the package used to say.
   */
  overrideFlags?: Partial<ClientFlags> | null;
  /** The subscription's budgets; omit entirely for "no subscription" clients. */
  budgets?: Budget[] | null;
  /** Tenant plan entitlements — the outer bound. */
  entitlements: Entitlements;
  nowIso: string;
}

/**
 * OR-merge two already-resolved flag sets (a binary fold — use with
 * `sets.reduce(unionClientFlags)`).
 *
 * A client can legitimately hold SEVERAL live access rows at once: a monthly
 * membership owns its own row (keyed by its Stripe subscription) while a
 * one-time package bought on top folds into the non-recurring row. BILLING-PLAN
 * §7 locks the semantics — "days stack + flags UNION across every active
 * package" — so effective capability is the SUPERSET of every live row's
 * resolved flags: a capability stays on for as long as ANY granting package is
 * live. Honouring only the newest row silently revokes capabilities the client
 * paid for in the other one.
 *
 * Each input must ALREADY be a `resolveClientFlags` result (its own package
 * flags, its own subscription overrides, gated by its OWN budgets and
 * intersected with the tenant's entitlements) — the union is a pure OR on top,
 * so the entitlement bound and the budget gate can never be widened by it.
 */
export function unionClientFlags(a: ClientFlags, b: ClientFlags): ClientFlags {
  const out = { ...a };
  for (const key of CLIENT_FLAG_KEYS) if (b[key]) out[key] = true;
  // The AI master stays a kill switch. Each input already cascaded master→groups,
  // so a group can only be true here if its own row had the master on — but
  // re-assert it so the invariant can't drift if that cascade ever changes.
  if (!out.canUseAi) {
    out.aiMealTools = false;
    out.aiCoachInsights = false;
  }
  return out;
}

/** THE resolver. Everything client-capability flows through here. */
export function resolveClientFlags(input: ResolveFlagsInput): ClientFlags {
  const out = {} as ClientFlags;
  const explained = explainClientFlags(input);
  for (const key of CLIENT_FLAG_KEYS) out[key] = explained[key].value;
  return out;
}

/** Where a flag's value came from, before anything overruled it. */
export type FlagSource = "default" | "package" | "override";
/** What overruled it, if anything did. */
export type FlagBlocker = "budget" | "entitlement" | "ai-master";

export interface FlagExplanation {
  /** The effective value — identical to `resolveClientFlags`'s. */
  value: boolean;
  /** Which layer last SET it. `override` means a staff member changed it for
   *  this one client, which is the whole point of the override lane. */
  source: FlagSource;
  /** What the layers said before the gates ran. `value !== granted` means a
   *  gate overruled a real grant, and `blockedBy` says which. */
  granted: boolean;
  blockedBy: FlagBlocker | null;
}

export type ClientFlagExplanation = Record<keyof ClientFlags, FlagExplanation>;

/**
 * `resolveClientFlags` with its working shown, per flag.
 *
 * This is the SAME merge — the resolver is a projection of it — because two
 * implementations of "what can this client do" is exactly how a screen comes to
 * promise something the routes refuse. It exists because the coach's answer to
 * "why can't my client see their meal plan" needs the reason, not the boolean:
 * the package never included it, or someone overrode it, or their meal days ran
 * out, or the studio's own plan doesn't carry the feature. Those are four
 * different conversations and the flag alone tells you none of them.
 */
export function explainClientFlags(input: ResolveFlagsInput): ClientFlagExplanation {
  const out = {} as ClientFlagExplanation;
  for (const key of CLIENT_FLAG_KEYS) {
    // Layers, last one wins: defaults → package → the row's own flags →
    // the per-client override. `applyPartial`'s rule holds at each step — only a
    // real boolean counts, so an absent key falls through rather than reading
    // as `false`.
    let value = DEFAULT_CLIENT_FLAGS[key];
    let source: FlagSource = "default";
    if (typeof input.packageFlags?.[key] === "boolean") { value = input.packageFlags[key]!; source = "package"; }
    // The row's snapshot is a COPY of the package's flags taken at grant time
    // (see the grant path), so it is the package layer for anyone already
    // holding the row — not a third opinion. It reports as `package`.
    if (typeof input.subscriptionFlags?.[key] === "boolean") { value = input.subscriptionFlags[key]!; source = "package"; }
    if (typeof input.overrideFlags?.[key] === "boolean") { value = input.overrideFlags[key]!; source = "override"; }
    out[key] = { value, source, granted: value, blockedBy: null };
  }

  const block = (key: keyof ClientFlags, by: FlagBlocker) => {
    if (!out[key].value) return; // already off; the first reason is the true one
    out[key].value = false;
    out[key].blockedBy = by;
  };

  // Budget gating. Contract: `budgets` present (any array, incl. empty) means
  // this client HAS an access subscription, so plan flags are gated by whether a
  // covering budget is currently active — an empty/all-lapsed array correctly
  // revokes plan access. `null`/`undefined` means "no subscription context"
  // (e.g. a preview) and skips gating. `[]` and `null` are deliberately NOT the
  // same: one is a lapsed subscriber, the other is no subscriber.
  //
  // ⚠️ This runs AFTER the override layer, on purpose. An override may hand a
  // client a capability their package did not include; it may NOT hand them one
  // whose days have run out, and it may not widen the tenant's own plan below.
  if (input.budgets) {
    for (const key of CLIENT_FLAG_KEYS) {
      const gate = CLIENT_FLAG_META[key].budgetGate;
      if (gate && !hasActiveBudget(input.budgets, gate, input.nowIso)) block(key, "budget");
    }
  }

  // ∩ tenant entitlements — the tenant can't grant a client capability Kova
  // didn't sell them. Driven by each flag's declared `requiresFeature` (not a
  // single hardcoded aiSuite check), so any new gated flag is enforced
  // automatically instead of silently slipping through.
  for (const key of CLIENT_FLAG_KEYS) {
    const req = CLIENT_FLAG_META[key].requiresFeature;
    if (req && !input.entitlements.features[req]) block(key, "entitlement");
  }
  // AI groups are bounded by the master switch: no master → no groups. This
  // makes the master both a tenant-entitlement gate and a package-level kill.
  if (!out.canUseAi.value) {
    block("aiMealTools", "ai-master");
    block("aiCoachInsights", "ai-master");
  }

  return out;
}
