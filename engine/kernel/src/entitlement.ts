/**
 * WHAT A TENANT BOUGHT, AND WHAT THAT LETS THEM DO.
 *
 * ⚠️ AN ENTITLEMENT IS SOLD, SO IT MUST BE ENFORCED SOMEWHERE. A key on a price
 * list that no gate reads is a promise taken money for and never kept — and it
 * fails in the generous direction, so nobody complains and nobody notices. Every
 * live key is named by an operation or counted by a collection, and a guard
 * asks that of every app.
 *
 * ⚠️ AND THE WALK IS PLAN → GRANDFATHERED → ADJUSTED → CLAMPED, in that order.
 * Grandfathering only ever ratchets UP, because it exists to hold a tenant at
 * what they were sold when a plan is edited down. An operator's adjustment is
 * absolute and either direction, because it is a deliberate per-tenant decision.
 * The clamp is last so a suspended tenant cannot be adjusted back into service.
 *
 * Layer 3. Imports primitives and tenancy.
 */

import type { Standing } from "./tenancy.js";

/* ------------------------------------------------------------------ shape --- */

/** A number, or `true`/`false` for a capability that is simply on or off. */
export type Allowance = number | boolean;

/** ⚠️ `-1` is unlimited. It is a real answer and every consumer knows it. */
export const UNLIMITED = -1;

export interface EntitlementDef {
  readonly label: string;
  readonly help?: string;
  /**
   * ⚠️ HOW IT IS WITHHELD, DECLARED. `gate` refuses the operation outright;
   * `quota` counts and refuses past a number; `shape` narrows an answer rather
   * than refusing it. An app that names none of them has sold something with no
   * mechanism behind it.
   */
  readonly withheld: "gate" | "quota" | "shape";
  /**
   * ⚠️ RESERVED MEANS SOLD BY NOBODY AND ENFORCED BY NOTHING, ON PURPOSE — a key
   * kept so a future plan can use it without a migration. Unenforced by
   * construction, so the guard skips it, which is exactly why it must be said
   * out loud rather than inferred from a plan not mentioning it.
   */
  readonly reserved?: boolean;
}

export interface PlanSpec {
  readonly id: string;
  readonly name: string;
  readonly said: string;
  /** Minor units, per month. An integer, always — see `field.money`. */
  readonly price: number;
  readonly currency: string;
  readonly includes: Readonly<Record<string, Allowance>>;
  readonly trialDays?: number;
  /** ⚠️ Where a tenant that never chose lands. Exactly one plan may be it. */
  readonly parking?: boolean;
  readonly order: number;
}

/* ------------------------------------------------------------------- walk --- */

export type Source = "plan" | "grandfathered" | "adjusted";

export interface Resolved {
  readonly key: string;
  readonly value: Allowance;
  readonly source: Source;
  /** What the plan alone would give. Shown only where it differs. */
  readonly plan: Allowance;
}

/**
 * What a tenant actually has.
 *
 * ⚠️ ONE WALK, AND EVERY READER USES IT. Two implementations of "what does this
 * tenant have" is how a screen comes to promise what a route refuses — and the
 * screen is always the one people believe.
 *
 * ⚠️ `overrides` RATCHETS UP AND `adjustments` DOES NOT. They shared one blob in
 * an earlier platform, and "give this studio ten seats" became a one-way door:
 * the only way back discarded the grandfathering too. They are separate here
 * because they want opposite rules.
 */
export function walk(
  plan: PlanSpec | null,
  keys: Readonly<Record<string, EntitlementDef>>,
  overrides: Readonly<Record<string, Allowance>> = {},
  adjustments: Readonly<Record<string, Allowance>> = {},
  standing: Standing = { writable: true, serving: true, reason: "" },
): readonly Resolved[] {
  return Object.keys(keys).map((key) => {
    const base = plan?.includes[key] ?? false;
    let value = base;
    let source: Source = "plan";

    /* ⚠️ Grandfathering only ever raises. A plan edited DOWN must not take from
       a tenant who was sold the old number; a plan edited UP should reach them. */
    const held = overrides[key];
    if (held !== undefined && above(held, value)) { value = held; source = "grandfathered"; }

    /* ⚠️ An operator's adjustment is absolute and either direction — that is the
       whole difference between it and the line above. */
    const set = adjustments[key];
    if (set !== undefined) { value = set; source = "adjusted"; }

    /* ⚠️ THE CLAMP IS LAST, so a tenant we have stopped serving cannot be
       adjusted back into service by a well-meaning operator edit. */
    if (!standing.serving) value = typeof value === "boolean" ? false : 0;

    return { key, value, source, plan: base };
  });
}

/** ⚠️ Unlimited beats every number, including another unlimited. */
const above = (a: Allowance, b: Allowance): boolean => {
  if (typeof a === "boolean" || typeof b === "boolean") return a === true && b !== true;
  if (a === UNLIMITED) return b !== UNLIMITED;
  if (b === UNLIMITED) return false;
  return a > b;
};

export const allowanceOf = (resolved: readonly Resolved[], key: string): Allowance =>
  resolved.find((r) => r.key === key)?.value ?? false;

/**
 * ⚠️ `-1` IS UNLIMITED AND `0` IS NONE, and conflating them is how an unlimited
 * plan comes to refuse the first write. `false` is none as well — an off
 * capability has no room in it.
 */
export function withinQuota(allowed: Allowance, used: number): boolean {
  if (allowed === true) return true;
  if (allowed === false) return false;
  if (allowed === UNLIMITED) return true;
  return used < allowed;
}

/* ------------------------------------------------------------------ rules --- */

export type CatalogRefusal =
  | "no_parking_plan" | "two_parking_plans" | "sells_undeclared" | "plan_ids_clash"
  | "parking_above_floor" | "unenforced";

export interface CatalogProblem { readonly why: CatalogRefusal; readonly detail: string }

/**
 * What a catalogue can get wrong.
 *
 * ⚠️ `parking_above_floor` IS THE ONE THAT COSTS MONEY. The parking plan is
 * where a tenant that never chose lands — so if it includes more than the
 * cheapest paid plan, not paying buys more than paying does. A previous
 * platform shipped exactly that: the free row carried three of something the
 * entry tier gave one of.
 */
export function refuseCatalog(
  plans: readonly PlanSpec[],
  keys: Readonly<Record<string, EntitlementDef>>,
): readonly CatalogProblem[] {
  const out: CatalogProblem[] = [];
  const at = (why: CatalogRefusal, detail: string) => out.push({ why, detail });

  const ids = plans.map((p) => p.id);
  if (new Set(ids).size !== ids.length) at("plan_ids_clash", "two plans share an id");

  const parking = plans.filter((p) => p.parking);
  if (parking.length === 0) at("no_parking_plan", "no plan for a tenant that never chose one");
  if (parking.length > 1) at("two_parking_plans", `${parking.map((p) => p.id).join(", ")} all park`);

  for (const plan of plans) {
    for (const key of Object.keys(plan.includes)) {
      if (!(key in keys)) at("sells_undeclared", `${plan.id} sells "${key}", which is not an entitlement`);
    }
  }

  const floor = plans.filter((p) => !p.parking && p.price > 0).sort((a, b) => a.price - b.price)[0];
  const park = parking[0];
  if (floor && park) {
    for (const key of Object.keys(keys)) {
      if (above(park.includes[key] ?? false, floor.includes[key] ?? false)) {
        at("parking_above_floor",
          `not paying gives more "${key}" than ${floor.id} does`);
      }
    }
  }
  return out;
}

/**
 * ⚠️ EVERY LIVE KEY MUST BE NAMED BY SOMETHING THAT WITHHOLDS IT. A key sold and
 * never checked fails in the generous direction — the customer gets it anyway —
 * so nobody reports it and nothing goes red. `reserved` is the only exemption
 * and it is written down rather than inferred.
 */
export function unenforced(
  keys: Readonly<Record<string, EntitlementDef>>,
  named: readonly string[],
): readonly string[] {
  return Object.entries(keys)
    .filter(([key, def]) => !def.reserved && !named.includes(key))
    .map(([key]) => key);
}
