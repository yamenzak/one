/**
 * The feature spine (SPEC §5–7; docs/REGISTRY-PLAN.md Phase 1).
 *
 * One `FeatureSpec` per product feature — the record that rules everything about
 * it. Each spec references the deduplicated ATOMS by key (a platform entitlement,
 * a client capability flag, the permission resource that governs it, the
 * notification types it emits, the metrics it surfaces) rather than restating
 * them. Enforcement DERIVES from the record: `gateSpecOf()` reads a feature's
 * entitlement + client-flag pairing so a route gates on the composed capability
 * instead of hand-pairing the two atoms at every call site.
 *
 * This module owns only the JOIN across atoms; the atoms themselves stay in
 * their own files (entitlements, clientFlags, perms, notifications) and the
 * presentation atoms (metrics, tones) stay in @mossa/ui. A conformance test
 * validates every reference points at a real atom, so a feature can never name a
 * flag/entitlement/notif/permission that doesn't exist.
 */

import type { Entitlements } from "./entitlements.js";
import type { ClientFlags } from "./clientFlags.js";
import type { NotifType } from "./notifications.js";

/** A permission resource key (see perms.ts PERMISSION_CATALOG). */
export type PermissionResource = string;
/** A metric key (see @mossa/ui metric-coding METRICS) — validated UI-side. */
export type MetricRef = string;

export interface FeatureSpec {
  /** Stable feature id (the registry key). */
  key: string;
  /** Human label (coach/owner-facing). */
  label: string;
  /** Platform entitlement the TENANT must hold (bought from Mossa). Absent ⇒
   *  the feature isn't platform-gated (available on every plan). */
  entitlement?: keyof Entitlements["features"];
  /** Client capability flag the CLIENT must hold (bought from the tenant). Absent
   *  ⇒ not a per-client capability (a staff/tenant-level feature). */
  clientFlag?: keyof ClientFlags;
  /** The permission resource that governs staff actions on this feature. */
  permission?: PermissionResource;
  /** Notification types this feature emits (keys into NOTIF_TYPES). */
  notifTypes?: NotifType[];
  /** Metric keys this feature surfaces (keys into @mossa/ui METRICS). */
  metrics?: MetricRef[];
}

/**
 * THE feature registry. Keyed by feature id; each value composes the atoms that
 * define it. Order is by product area (training · nutrition · body & wellness ·
 * supplements & labs · commerce · sessions · content · AI · staff/branding).
 */
export const FEATURES = {
  workoutPlan: {
    key: "workoutPlan", label: "Workout plan",
    clientFlag: "canAccessWorkoutPlan", permission: "plan",
    notifTypes: ["plan_published"], metrics: ["sets", "weight"],
  },
  exerciseSwap: {
    key: "exerciseSwap", label: "Exercise swaps",
    clientFlag: "canRequestExerciseSwap", permission: "tracking",
    notifTypes: ["swap_request", "swap_approved", "swap_rejected"],
  },
  mealPlan: {
    key: "mealPlan", label: "Meal plan",
    clientFlag: "canAccessMealPlan", permission: "plan",
    notifTypes: ["plan_published"], metrics: ["calories", "protein", "carbs", "fat"],
  },
  foodLogging: {
    key: "foodLogging", label: "Food logging",
    clientFlag: "canLogOwnFood", permission: "tracking",
    metrics: ["calories", "protein", "carbs", "fat", "fiber"],
  },
  externalFoodSearch: {
    key: "externalFoodSearch", label: "External food search",
    entitlement: "externalSearch", permission: "library",
  },
  checkIns: {
    key: "checkIns", label: "Check-ins & feedback",
    permission: "tracking", notifTypes: ["check_in", "feedback"],
    metrics: ["mood", "energy", "sleep"],
  },
  goals: {
    key: "goals", label: "Goals",
    permission: "goal", notifTypes: ["goal_set"],
  },
  bodyMetrics: {
    key: "bodyMetrics", label: "Body metrics & reports",
    clientFlag: "canViewBodyMetricsReport", permission: "tracking",
    metrics: ["weight", "bodyFat", "waist", "chest", "hips", "leanMass", "fatMass"],
  },
  bodyScan: {
    key: "bodyScan", label: "Body scan",
    entitlement: "bfCamera", clientFlag: "canUseBodyScan", permission: "tracking",
    notifTypes: ["body_fat_logged"], metrics: ["bodyFat"],
  },
  wellnessLogging: {
    key: "wellnessLogging", label: "Wellness logging",
    permission: "tracking", metrics: ["sleep", "mood", "water", "fasting"],
  },
  supplementsLabs: {
    key: "supplementsLabs", label: "Supplements & labs",
    entitlement: "supplementsLabs", permission: "supplement",
    notifTypes: ["supplement_added", "lab_requested", "lab_uploaded", "lab_reviewed"],
  },
  commerce: {
    key: "commerce", label: "Commerce",
    entitlement: "commerce", permission: "package",
    notifTypes: ["sub_expired", "sub_expiring", "sub_payment_failed", "payment_disputed", "payment_refunded"],
  },
  sessions: {
    key: "sessions", label: "Sessions & front desk",
    entitlement: "frontDesk", permission: "session",
    notifTypes: ["session_booked", "session_cancelled"],
  },
  content: {
    key: "content", label: "Content hub",
    permission: "content", notifTypes: ["content_assigned"],
  },
  branding: {
    key: "branding", label: "White-label branding",
    entitlement: "branding", permission: "settings",
  },
  aiSuite: {
    key: "aiSuite", label: "AI suite",
    entitlement: "aiSuite", permission: "ai",
  },
  aiMealTools: {
    key: "aiMealTools", label: "AI food tools",
    entitlement: "aiSuite", clientFlag: "aiMealTools", permission: "ai",
  },
  aiCoachInsights: {
    key: "aiCoachInsights", label: "AI coach insights",
    entitlement: "aiSuite", clientFlag: "aiCoachInsights", permission: "ai",
  },
  staff: {
    key: "staff", label: "Staff & roster",
    permission: "member", notifTypes: ["client_assigned"],
  },
} satisfies Record<string, FeatureSpec>;

export type FeatureKey = keyof typeof FEATURES;

/** The enforcement pairing a route needs to gate a feature: the entitlement the
 *  tenant must hold and/or the client flag the client must hold. Derived from the
 *  spec so a route gates on the composed capability, not two separate atoms. */
export interface FeatureGate {
  entitlement?: keyof Entitlements["features"];
  clientFlag?: keyof ClientFlags;
}

/** The gate descriptor for a feature — what must be true to use it. */
export function gateSpecOf(key: FeatureKey): FeatureGate {
  const f: FeatureSpec = FEATURES[key];
  return { entitlement: f.entitlement, clientFlag: f.clientFlag };
}

/**
 * Client-side capability check — the read-model mirror of the API's gateFeature.
 * A feature is enabled when the tenant holds its entitlement AND (for a client
 * context, where clientFlags is provided) the client holds its flag. Staff pass
 * `clientFlags: null/undefined` and so are never limited by a client's package —
 * exactly as `requireClientFlag` behaves server-side. Used by the UI to decide
 * what to OFFER (widgets, nav, pickers), the same records the routes enforce.
 */
export function featureEnabled(
  key: FeatureKey,
  ctx: { features: Entitlements["features"]; clientFlags?: ClientFlags | null },
): boolean {
  const g = gateSpecOf(key);
  if (g.entitlement && !ctx.features[g.entitlement]) return false;
  if (g.clientFlag && ctx.clientFlags && !ctx.clientFlags[g.clientFlag]) return false;
  return true;
}
