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

/* ------------------------------------------------------------ credit packs --- */

/**
 * What a workspace can buy to top up its generation balance.
 *
 * ⚠️ SEPARATE FROM THE PLAN, because credits are consumption and a plan is
 * access. Folding them together makes the answer to "I have run out" an upgrade
 * — which sells somebody a bigger set of features when what they wanted was more
 * of the one they were using.
 *
 * ⚠️ AND THE SIZE IS IN THE SAME UNIT THE METER SPENDS. A pack described in
 * pounds, requests or "generations" is one nobody can reconcile against a
 * balance, and the reconciliation is the only question anybody asks about it.
 */
export interface CreditPack {
  readonly id: string;
  readonly name: string;
  readonly price: Money;
  /** Credits granted. The unit `settle` charges in. */
  readonly credits: number;
}

/**
 * ⚠️ EVERY ONE OF THESE IS A PACK SOMEBODY COULD BUY AND GET NOTHING FROM, and
 * none of them throws — the purchase succeeds and the balance does not move,
 * which is the worst shape a money bug can take.
 */
export function packProblems(packs: readonly CreditPack[]): readonly { readonly id: string; readonly why: string }[] {
  const out: { id: string; why: string }[] = [];
  const seen = new Set<string>();
  for (const pack of packs) {
    if (seen.has(pack.id)) out.push({ id: pack.id, why: "is declared twice, so which one a purchase grants depends on order" });
    seen.add(pack.id);
    if (!Number.isInteger(pack.credits) || pack.credits < 1) {
      out.push({ id: pack.id, why: "grants no credits, so buying it moves nothing" });
    }
    /*
      ⚠️ A FREE PACK IS NOT A PROMOTION, IT IS AN UNMETERED TAP. Anybody may buy
      it repeatedly, and the platform pays for every generation it funds.
    */
    if (pack.price.minor <= 0) out.push({ id: pack.id, why: "costs nothing, so it is a balance anybody can refill for free" });
  }
  return out;
}

/* --------------------------------------------------------- editing a plan --- */

/**
 * What an operator has changed about a declared plan.
 *
 * ⚠️ AN OVERRIDE, NOT A REPLACEMENT, and for the same reason a model's rate is
 * one: a manifest is a deploy and a price change is not. The declaration is what
 * the app ships knowing; this is what the deployment currently sells. Every field
 * is optional because most edits move one number, and an edit that had to restate
 * the whole plan is one that silently resets the parts nobody meant to touch.
 */
export interface PlanOverride {
  readonly price?: Money;
  readonly trialDays?: number;
  /** Sparse. A key absent here keeps the declared value. */
  readonly entitlements?: Readonly<Record<string, Allowance>>;
}

export type PlanOverrides = Readonly<Record<string, PlanOverride>>;

/** The catalogue as it is actually sold today. */
export function catalogueOf(declared: readonly PlanSpec[], overrides: PlanOverrides): readonly PlanSpec[] {
  return declared.map((plan) => {
    const over = overrides[plan.id];
    if (!over) return plan;
    return {
      ...plan,
      ...(over.price ? { price: over.price } : {}),
      ...(over.trialDays === undefined ? {} : { trialDays: over.trialDays }),
      entitlements: { ...plan.entitlements, ...(over.entitlements ?? {}) },
    };
  });
}

/**
 * What editing a plan DOWN takes away from somebody already on it.
 *
 * ⚠️ THIS IS THE HALF THAT MAKES A CATALOGUE SAFE TO EDIT, and until an operator
 * could edit one it was a column the resolver read and nothing wrote.
 *
 * A workspace bought three seats. The plan is edited to two — for good reasons,
 * about what is sold from now on — and without a snapshot that workspace loses a
 * seat it paid for, in the middle of a period, with no notice and no refund. The
 * symptom is a member who cannot sign in and a support conversation nobody can
 * explain, because the plan says two and always did.
 *
 * ⚠️ IT RATCHETS UP ONLY. A snapshot merged downward would be the edit it exists
 * to protect against, applied by the protection itself — so a second reduction
 * cannot lower a workspace that was already held at the first.
 *
 * ⚠️ AND IT ONLY EVER RECORDS A REDUCTION. Raising a plan needs no snapshot: the
 * new value is better and resolution already prefers the higher of the two, so
 * writing one would freeze a workspace out of every future improvement.
 */
export function snapshotDowngrade(
  before: Readonly<Record<string, Allowance>>,
  after: Readonly<Record<string, Allowance>>,
  held: Readonly<Record<string, Allowance>>,
): Readonly<Record<string, Allowance>> {
  const out: Record<string, Allowance> = { ...held };
  for (const [key, was] of Object.entries(before)) {
    const now = after[key];
    if (now === undefined) continue;
    if (!isLower(now, was)) continue;
    const already = out[key];
    out[key] = already === undefined ? was : higher(already, was);
  }
  return out;
}

/**
 * ⚠️ `UNLIMITED` IS THE TOP, NOT A SMALL NUMBER. It is stored as -1, so an
 * arithmetic comparison reads unlimited as lower than one — which turns "you had
 * unlimited and now have five" into no snapshot at all, silently, for exactly the
 * workspaces with the most to lose.
 */
const isLower = (now: Allowance, was: Allowance): boolean => {
  if (typeof was === "boolean" || typeof now === "boolean") return was === true && now === false;
  if (was === UNLIMITED) return now !== UNLIMITED;
  if (now === UNLIMITED) return false;
  return now < was;
};

const higher = (a: Allowance, b: Allowance): Allowance => {
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) || Boolean(b);
  if (a === UNLIMITED || b === UNLIMITED) return UNLIMITED;
  return Math.max(a, b);
};

/** Why a proposed edit may not be applied. */
export type CatalogueRefusal = "unknown_plan" | "unknown_key" | "negative_price" | "negative_trial" | "kind";

/**
 * ⚠️ AN EDIT IS CHECKED AGAINST THE DECLARATION, so a catalogue cannot grow keys
 * the app never declared. An entitlement nothing resolves is a price list
 * promising something that does not exist — sold, paid for, and answered by no
 * gate anywhere, which is indistinguishable from a capability that happens to be
 * generous.
 */
export function refuseCatalogueEdit(
  declared: readonly PlanSpec[],
  keys: Readonly<Record<string, EntitlementDef>>,
  planId: string,
  edit: PlanOverride,
): CatalogueRefusal | null {
  const plan = declared.find((p) => p.id === planId);
  if (!plan) return "unknown_plan";
  if (edit.price && edit.price.minor < 0) return "negative_price";
  if (edit.trialDays !== undefined && (!Number.isInteger(edit.trialDays) || edit.trialDays < 0)) return "negative_trial";
  for (const [key, value] of Object.entries(edit.entitlements ?? {})) {
    const def = keys[key];
    if (!def) return "unknown_key";
    /*
      ⚠️ THE KIND HAS TO MATCH WHAT THE GATE READS. A quota given `true` is a
      ceiling every count compares against a boolean, and a gate given `3` is a
      feature that is on because three is truthy — both of which "work" until
      somebody looks at a number.
    */
    const wantsNumber = def.enforcement === "quota";
    if (wantsNumber && typeof value !== "number") return "kind";
    if (!wantsNumber && typeof value !== "boolean") return "kind";
    if (wantsNumber && typeof value === "number" && value < UNLIMITED) return "kind";
  }
  return null;
}
