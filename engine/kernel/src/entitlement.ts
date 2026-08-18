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

import type { Kind, Standing } from "./tenancy.js";

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

/**
 * ONE MEMBERSHIP, AND IT BELONGS TO THE DEPLOYMENT RATHER THAN TO A PRODUCT.
 *
 * ⚠️ A PLAN IS THE WORKSPACE'S, NOT AN APP'S, AND THE LIMITS ARE THE ARGUMENT.
 * Seats, storage and the wallet are one roster, one bucket and one balance — so
 * a per-app plan has to answer "which product does this 50 GB belong to", and
 * there is no honest answer. Apps declare entitlement KEYS; the deployment's
 * plans set their VALUES.
 *
 * ⚠️ AND THE STRICTEST STANDING ALREADY CLOSED THE WHOLE WORKSPACE. Arrears on
 * any product stop every product, which is only defensible if the customer sees
 * one relationship — under per-app plans, losing your notes because you did not
 * pay for signage is outrageous.
 */
export interface PlanSpec {
  readonly id: string;
  readonly name: string;
  readonly said: string;
  /**
   * ⚠️ WHICH FAMILY, AND SUBSCRIBING TO A COMMERCIAL PLAN IS WHAT MAKES A
   * WORKSPACE ONE. `mayBrand` and `mayIsolate` already gate on the kind, so
   * pricing on it means the gate and the price agree by construction — an
   * entitlement for "may brand" would be a second answer that can disagree.
   */
  readonly kind: Kind;
  /** Minor units, per month. An integer, always — see `field.money`. */
  readonly price: number;
  readonly currency: string;
  /**
   * ⚠️ WALLET CREDITS GRANTED EACH MONTH, AND IT IS A FIELD RATHER THAN AN
   * ENTITLEMENT. `walk` ends with a clamp that zeroes everything when standing
   * stops — correct for a permission, confiscation for a BALANCE. A suspended
   * workspace must not lose credits it paid cash for.
   *
   * ⚠️ AND RENEWAL SETS IT RATHER THAN ADDING. Unused allowance that compounds
   * is a cost model that stops holding after three quiet months.
   */
  readonly credits: number;
  readonly includes: Readonly<Record<string, Allowance>>;
  readonly trialDays?: number;
  /**
   * ⚠️ THE LOBBY, NOT A FREE TIER. Exactly one plan parks, and it is where a
   * workspace lands before it ever paid, after a trial ends, and after it
   * cancels. With no free tier it matters MORE, not less: it is the difference
   * between "your trial ended, here is your data and here is how to pay" and a
   * locked door. It is not on the pricing page and cannot be bought.
   */
  readonly parking?: boolean;
  readonly order: number;
}

/**
 * WHAT THE ENGINE ITSELF SELLS, DECLARED ONCE.
 *
 * ⚠️ THESE ARE THE WORKSPACE'S, SO NO APP MAY DECLARE THEM. The roster is the
 * platform's and `member.invite` is its gate; the bucket is the platform's; a
 * custom hostname is the platform's. Two apps each declaring `seats` is two
 * answers to how many people a workspace may have, and `refuseManifest` refuses
 * an app that names one.
 *
 * ⚠️ AND `storage` IS A QUOTA THAT IS NOT ENFORCED BY REFUSING. It is the
 * included amount before the meter starts drawing on the wallet — a seat and a
 * client are things somebody ADDS deliberately, so refusing is fair, while
 * storage accumulates as a side effect of ordinary work and refusing it punishes
 * somebody for using the product.
 */
export const PLATFORM_ENTITLEMENTS: Readonly<Record<string, EntitlementDef>> = {
  seats: { label: "People", help: "An unanswered invitation counts.", withheld: "quota" },
  storage: { label: "Storage", help: "Included before the meter starts.", withheld: "quota" },
  domains: { label: "Custom domains", withheld: "quota" },
};

/**
 * THE MONTH'S ALLOWANCE, WHEN AN OPERATOR HAS SET ONE FOR THIS WORKSPACE.
 *
 * ⚠️ IT LIVES IN THE ADJUSTMENTS BLOB AND IS NOT AN ENTITLEMENT, and both halves
 * are load-bearing. The blob is right because the semantics are identical to
 * every other operator adjustment — absolute, either direction, cleared per key —
 * so it reuses the one write path and the one console tray rather than growing a
 * second kind of override nobody would think to look for.
 *
 * ⚠️ AND IT IS NOT IN `keys`, WHICH IS WHAT KEEPS IT OUT OF `walk`. That walk
 * ends in a clamp that zeroes everything when standing stops — correct for a
 * permission, confiscation for a balance. `walk` iterates the declared keys, this
 * is not one of them, and `refuseManifest` refuses an app that declares it — so
 * the clamp structurally cannot reach it rather than being trusted not to.
 */
export const ALLOWANCE_KEY = "credits";

/**
 * WHAT A PERIOD GRANTS THIS WORKSPACE.
 *
 * ⚠️ ONE FUNCTION, BECAUSE TWO READERS ASK. What a workspace HOLDS (`heldBy`)
 * and what a renewal GRANTS (`renewAllowance`) have to be the same number: an
 * override honoured by one and not the other is a screen promising credits that
 * never arrive, or credits arriving that no screen accounts for.
 *
 * ⚠️ AND A NEGATIVE IS THE PLAN'S OWN, NOT UNLIMITED. `-1` means unlimited for an
 * entitlement; an unlimited BALANCE is not a thing this system can meter, so the
 * only honest reading of a negative here is "no override".
 */
export function allowanceFor(
  plan: { readonly credits: number } | null,
  adjustments: Readonly<Record<string, Allowance>> = {},
): number {
  const set = adjustments[ALLOWANCE_KEY];
  if (typeof set === "number" && set >= 0) return Math.trunc(set);
  return plan?.credits ?? 0;
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
  | "parking_above_floor" | "unenforced" | "unpriced" | "parking_costs_money"
  | "sellable_parking";

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

    /*
      ⚠️ AND THE OTHER DIRECTION, WHICH IS THE ONE THAT SHIPS. A key an app
      declares and no plan mentions resolves to `false` for everybody — the
      feature is built, gated, and sold to nobody, silently, on every tier. This
      is what makes the catalogue SELF-DISCOVERING: declaring `clients` in an app
      is a build failure until every plan names a number for it.
    */
    for (const [key, def] of Object.entries(keys)) {
      if (def.reserved) continue;
      if (plan.includes[key] === undefined) {
        at("unpriced", `${plan.id} says nothing about "${key}", so it sells none of it by accident`);
      }
    }
  }

  /* ⚠️ THE LOBBY IS FREE AND UNSELLABLE, and both halves are load-bearing. A
     parking plan with a price is one a lapsed workspace is charged for without
     ever choosing it; one on the pricing page is a free tier by another name. */
  const park = parking[0];
  if (park && park.price !== 0) {
    at("parking_costs_money", `${park.id} parks and costs ${park.price}`);
  }
  if (park && park.trialDays) {
    at("sellable_parking", `${park.id} parks and offers a trial, which is a plan somebody chooses`);
  }

  /*
    ⚠️ COMPARED WITHIN THE FAMILY. The lobby is personal, so measuring it against
    the cheapest paid plan of ANY kind compares it with a business tier and the
    check says nothing. What it must not be is better than the cheapest thing
    somebody can buy at its own level.
  */
  const floor = plans
    .filter((p) => !p.parking && p.price > 0 && (!park || p.kind === park.kind))
    .sort((a, b) => a.price - b.price)[0];
  if (floor && park) {
    for (const key of Object.keys(keys)) {
      if (above(park.includes[key] ?? false, floor.includes[key] ?? false)) {
        at("parking_above_floor",
          `not paying gives more "${key}" than ${floor.id} does`);
      }
    }
    if (park.credits > floor.credits) {
      at("parking_above_floor", `not paying grants more credits than ${floor.id} does`);
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
