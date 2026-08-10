/**
 * WHAT THE TENANT BOUGHT FROM US — the plan catalogue and the resolution walk.
 *
 * Layer 2. Imports primitives and standing.
 *
 * One rail of two, and they are never merged. This one is the platform selling to
 * a workspace. The other — `customer.ts` — is a workspace selling to its own
 * customers, and a person's real capability is the intersection.
 *
 * ⚠️ THE RESOLUTION IS ONE FUNCTION WITH ITS WORKING SHOWN, and the plain answer
 * is a projection of it. Two implementations of "what may this workspace do" is
 * how a screen comes to promise what a route refuses, and the second one is
 * always written because the first returns too much detail to be convenient.
 */

import type { Money } from "./primitives.js";
import type { StandingGate } from "./standing.js";

/* ----------------------------------------------------------- declaration --- */

/**
 * A ceiling or a switch.
 *
 * `-1` is unlimited and behaves as an absorbing element everywhere a ceiling is
 * compared, which is the only reading that makes "raise to the greater of" safe.
 */
export type Allowance = number | boolean;

/**
 * ⚠️ HOW THIS ENTITLEMENT IS ACTUALLY WITHHELD, and there is no default.
 *
 * A capability that is sold and enforced nowhere is worse than one that is free:
 * it appears on a price list, a workspace pays the difference for it, and every
 * workspace that did not pay has it anyway. Nothing fails, no test goes red, and
 * the only signal is a support conversation about why the cheap plan does the
 * expensive thing.
 *
 * The three real answers name a mechanism that exists elsewhere in the manifest,
 * so composition can check the mechanism is really there. The fourth is the
 * honest exemption and it carries a REASON rather than a boolean — an
 * unenforced entitlement is a decision somebody made, and a decision with no
 * stated reason is indistinguishable from an oversight six months later.
 */
export type Enforcement =
  /** An operation refuses outright — `entitlement` on the spec. */
  | "gate"
  /** A number counted against — `quota` on the spec. */
  | "quota"
  /** A response withholds keys and says so — `shape` on the spec. */
  | "shape"
  /** Declared, sold nowhere, enforced nowhere — on purpose, in writing. */
  | { readonly unenforced: string };

export interface EntitlementDef {
  /**
   * ⚠️ WHAT THIS IS CALLED ON A PRICE LIST, and it is required for the same
   * reason `enforcement` is.
   *
   * A storefront needs a row per key, and the alternative to a label here is a
   * pricing page written by hand — which drifts from what the gate actually
   * enforces, and the drift is discovered by somebody who bought a thing that is
   * then refused. Making it optional means the first price list ships with
   * `receiptsStored` printed on it.
   *
   * The reader's words, not the key's: "Receipts kept", not "receipts_stored".
   */
  readonly label: string;
  /**
   * How the number is read. A ceiling of `2_000_000` is two megabytes or two
   * million receipts, and only the declaration knows which.
   */
  readonly unit?: "count" | "bytes";
  /**
   * ⚠️ THE PARKING VALUE — what a workspace has before it has chosen anything,
   * NOT a default that plans override casually.
   *
   * A workspace that never finished signing up, and every deployment with no
   * payment rail at all, is served exactly this. That second case is why it may
   * not simply be zero: a self-host with no Stripe would be a product that does
   * nothing, and the gate that would have refused correctly stands down there.
   */
  readonly parked: Allowance;
  readonly enforcement: Enforcement;
}

export interface PlanSpec {
  readonly id: string;
  readonly name: string;
  readonly price: Money;
  readonly period: "month" | "year";
  /** Days before the first charge. Zero is a plan with no trial, not a missing field. */
  readonly trialDays: number;
  readonly entitlements: Readonly<Record<string, Allowance>>;
}

/* -------------------------------------------------------------- the walk --- */

export type Source = "parked" | "floor" | "plan" | "grandfathered" | "adjusted" | "withheld";

export interface EntitlementResolution {
  readonly value: Allowance;
  readonly from: Source;
  /** What the plan says TODAY, so a moved row can be shown as moved. */
  readonly planValue: Allowance;
}

/**
 * ⚠️ TWO OVERRIDE STORES, AND THEY WANT OPPOSITE RULES.
 *
 * `grandfathered` is written by the platform when a plan is edited DOWN, to hold
 * existing workspaces at what they were sold. It may only ratchet up — merging it
 * downward would be the edit it exists to protect against, applied by the
 * protection itself.
 *
 * `adjusted` is an operator's deliberate per-workspace setting: absolute, either
 * direction, and cleared per key with `null`. Sharing one store and one
 * raise-only write path makes "give this workspace ten seats" a one-way door,
 * because the only way back is a reset that discards the grandfathering too.
 */
export interface Overrides {
  readonly grandfathered: Readonly<Record<string, Allowance>>;
  readonly adjusted: Readonly<Record<string, Allowance | null>>;
}

export const NO_OVERRIDES: Overrides = { grandfathered: {}, adjusted: {} };

export const UNLIMITED = -1;

/** The greater of two allowances, with unlimited absorbing and `true` winning. */
function raise(a: Allowance, b: Allowance): Allowance {
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) || Boolean(b);
  if (a === UNLIMITED || b === UNLIMITED) return UNLIMITED;
  return Math.max(a, b);
}

/** The floor an allowance falls to when the product itself is withheld. */
const floor = (of: Allowance): Allowance => (typeof of === "boolean" ? false : 0);

/**
 * THE WALK, WITH ITS WORKING SHOWN: parked → plan → grandfathered → adjusted →
 * withheld.
 *
 * ⚠️ THE CLAMP IS LAST AND MUST STAY LAST. An operator adjustment applied after
 * it would let a suspended workspace be adjusted back into service, which turns
 * a support gesture into a way around the payment ladder.
 */
export function explainEntitlements(input: {
  readonly declared: Readonly<Record<string, EntitlementDef>>;
  readonly plan: PlanSpec | null;
  readonly overrides: Overrides;
  readonly gate: StandingGate;
  /**
   * ⚠️ THE DEPLOYMENT'S OWN FLOOR, when there is no way to buy a plan. See
   * `floorPlan` — the parking state is only a fair answer where paying is
   * possible.
   */
  readonly floorPlan?: PlanSpec | null;
}): Readonly<Record<string, EntitlementResolution>> {
  const out: Record<string, EntitlementResolution> = {};
  const applied = input.plan ?? input.floorPlan ?? null;
  for (const [key, def] of Object.entries(input.declared)) {
    const planValue = applied?.entitlements[key] ?? def.parked;
    let value = planValue;
    let from: Source = input.plan ? "plan" : applied ? "floor" : "parked";

    const held = input.overrides.grandfathered[key];
    if (held !== undefined) {
      const raised = raise(value, held);
      if (raised !== value) { value = raised; from = "grandfathered"; }
    }

    const set = input.overrides.adjusted[key];
    if (set !== undefined && set !== null) { value = set; from = "adjusted"; }

    if (!input.gate.app) { value = floor(value); from = "withheld"; }

    out[key] = { value, from, planValue };
  }
  return out;
}

/** The same walk, without the working. A projection, never a second merge. */
export function resolveEntitlements(input: Parameters<typeof explainEntitlements>[0]): Readonly<Record<string, Allowance>> {
  const out: Record<string, Allowance> = {};
  for (const [key, r] of Object.entries(explainEntitlements(input))) out[key] = r.value;
  return out;
}

/** Whether an allowance is worth anything at all — what `Caller.entitlements` holds. */
export const grants = (value: Allowance): boolean => (typeof value === "boolean" ? value : value !== 0);

export function heldEntitlements(resolved: Readonly<Record<string, Allowance>>): ReadonlySet<string> {
  return new Set(Object.entries(resolved).filter(([, v]) => grants(v)).map(([k]) => k));
}

/* ---------------------------------------------------------------- quotas --- */

/**
 * Whether one more fits.
 *
 * A boolean allowance is a switch and admits no counting, so it answers by its
 * own value — which is what makes `quota` and `gate` interchangeable at the call
 * site and keeps a per-plan "unlimited or off" entitlement expressible.
 */
export function withinQuota(allowance: Allowance, used: number): boolean {
  if (typeof allowance === "boolean") return allowance;
  if (allowance === UNLIMITED) return true;
  return used < allowance;
}

/* ------------------------------------------------------------ the floors --- */

/**
 * ⚠️ NOT PAYING MUST NEVER BUY MORE THAN THE CHEAPEST PAID PLAN.
 *
 * This has happened, in a shipping product: the parking state carried three
 * seats while the entry plan carried one, so the entry plan was a downgrade and
 * every workspace that simply never paid was better off. Nothing enforces the
 * relationship at runtime — the parking value and the plan catalogue are edited
 * months apart by different people — so it is checked where both are in scope.
 *
 * Returns the keys where the parking state is more generous, so the caller can
 * name them. An empty list is the whole of the pass condition.
 */
/**
 * The cheapest plan on the shelf — what a deployment that cannot charge serves.
 *
 * ⚠️ FAIL CLOSED ON THEIR NON-PAYMENT, OPEN ON OURS. The parking state sits
 * BELOW the entry plan on purpose, so that not choosing one is never a better
 * deal than the cheapest. That is only fair where paying is possible: with no
 * payment provider configured — a self-host, a deployment before its Stripe
 * step, every test in this repo — there is no plan to buy, so holding a
 * workspace at the parking floor punishes them for our own missing
 * configuration and there is no way out. The standing gate already stands down
 * in exactly this case; the allowances have to as well, or the gate stands down
 * onto a product that permits one of everything.
 *
 * Null when an app sells nothing at all, which leaves the parking values as the
 * only thing there is.
 */
export function floorPlan(plans: readonly PlanSpec[]): PlanSpec | null {
  return [...plans].sort((a, b) => a.price.minor - b.price.minor)[0] ?? null;
}

export function parkingAboveFloor(
  declared: Readonly<Record<string, EntitlementDef>>,
  plans: readonly PlanSpec[],
): readonly string[] {
  const cheapest = floorPlan(plans);
  if (!cheapest) return [];
  return Object.entries(declared)
    .filter(([key, def]) => {
      const paid = cheapest.entitlements[key] ?? def.parked;
      return raise(def.parked, paid) !== paid;
    })
    .map(([key]) => key);
}
