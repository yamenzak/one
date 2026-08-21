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
 * Layer 3. Imports primitives, presentation and tenancy.
 */

import { sayBytes, sayNumber, type Shown } from "./present.js";
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
   * ⚠️ WHAT THE NUMBER IS, SO A SURFACE CAN SAY IT. A quota is a COUNT by
   * default — seats, domains, notes — and bytes is the one that is not. Two
   * terabytes of storage is `2199023255552`, and the operator console printed
   * exactly that: thirteen digits nobody can read, in the column where "2 TiB"
   * was meant, with a stepper under it that would take a million presses.
   *
   * ⚠️ AND IT IS DECLARED RATHER THAN SPECIAL-CASED. A console that checked for
   * the key `storage` by name would be right until the second app sells a
   * bucket — see `sayAllowance`, which is what every reader uses.
   */
  readonly unit?: "bytes";
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
  storage: {
    label: "Storage", help: "Included before the meter starts.",
    withheld: "quota", unit: "bytes",
  },
  domains: { label: "Custom domains", withheld: "quota" },
};

/**
 * WHAT A LIMIT SAYS, IN WORDS, WHEREVER ONE IS SHOWN.
 *
 * ⚠️ ONE FUNCTION, BECAUSE THERE ARE ALREADY THREE READERS: the plan editor, the
 * per-workspace adjustment, and whatever asks next. Each had its own ladder —
 * `-1` to "Unlimited", `true` to "On" — and each stopped at `String(v)`, which
 * is where the byte count came from and where a six-figure count loses its
 * separators.
 *
 * ⚠️ AND IT TAKES THE DEFINITION, NOT THE KEY. What a number means is the
 * declaration's to say; a surface that switched on the name `storage` would be
 * a surface that is wrong about the second app to sell a bucket.
 */
export const sayAllowance = (
  shown: Shown, of: EntitlementDef | undefined, value: Allowance | undefined,
): string =>
  value === undefined ? "—"
    : value === true ? "On"
      : value === false ? "Off"
        : value === -1 ? "Unlimited"
          : of?.unit === "bytes" ? sayBytes(shown, value)
            : sayNumber(shown, value);

/**
 * ⚠️ AND IT IS TYPED IN GIGABYTES, because the store is bytes and nobody types
 * bytes. The factor is here rather than at the two call sites that need it, so
 * the plan editor and the per-workspace adjustment cannot disagree about it.
 *
 * ⚠️ AND IT CONVERTS BOTH WAYS, BECAUSE A FIELD OPENS ON THE NUMBER IT IS ABOUT
 * TO CHANGE. It used to open blank — "a NEW number, rather than editing the old
 * one" — and that reads well and does not work: a stepper starting from nothing
 * has nothing to step, so `+` on a 250 GiB quota offers 1, and the operator has
 * to know and retype the current figure to move it by one. Seeded, `+` means
 * what it looks like.
 */
export const GIB = 1024 ** 3;

export const bytesOfGb = (gb: number): number => (gb === -1 ? -1 : Math.round(gb * GIB));

/**
 * ⚠️ TWO DECIMALS, because a quota is a round number of gigabytes in every case
 * anybody has typed one, and a seeded field that reads `232.83` invites somebody
 * to save the rounding error back.
 */
export const gbOf = (bytes: number): number =>
  (bytes === -1 ? -1 : Math.round((bytes / GIB) * 100) / 100);

/**
 * WHETHER THIS IS A SWITCH OR A NUMBER, ANSWERED BY THE DECLARATION.
 *
 * ⚠️ A `gate` IS HELD OR NOT HELD, AND A STEPPER CANNOT SAY THAT. The plan
 * editor offered "New number for Publishing" under a row reading `On` — a
 * numeric field over a boolean, which saves `1` into a key every reader compares
 * against `true`. `Allowance` is `number | boolean` and this is the one place
 * that decides which, so a second surface cannot decide differently.
 */
export const isSwitch = (of: EntitlementDef | undefined): boolean => of?.withheld === "gate";

/**
 * EVERY KEY A WORKSPACE COULD HOLD — the platform's, and every product's.
 *
 * ⚠️ ONE FUNCTION, BECAUSE THIS UNION HAD FOUR COPIES. The boot check, the
 * request resolver, the shelf and the operator's adjustment each spread the same
 * two objects in the same order — and a fifth reader that got the order backwards
 * would let a product silently redefine `seats`, which is the one key the seat
 * gate and the price both read.
 */
export function entitlementKeys(
  apps: readonly { readonly entitlements: Readonly<Record<string, EntitlementDef>> }[],
): Readonly<Record<string, EntitlementDef>> {
  return {
    ...PLATFORM_ENTITLEMENTS,
    ...Object.fromEntries(apps.flatMap((a) => Object.entries(a.entitlements))),
  };
}

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
 * ⚠️ AND IT IS THE SAME WALK THE ENTITLEMENTS TAKE, in the same order:
 * plan → grandfathered → adjusted. The grandfathering only ratchets UP, because
 * it exists to hold somebody at the allowance they were sold when a tier is cut;
 * the operator's adjustment is absolute and either direction. Reading only one of
 * the two blobs is how a plan edit comes to take credits from the people the
 * grandfathering was written to protect.
 *
 * ⚠️ AND A NEGATIVE IS THE PLAN'S OWN, NOT UNLIMITED. `-1` means unlimited for an
 * entitlement; an unlimited BALANCE is not a thing this system can meter, so the
 * only honest reading of a negative here is "no override".
 */
export function allowanceFor(
  plan: { readonly credits: number } | null,
  adjustments: Readonly<Record<string, Allowance>> = {},
  overrides: Readonly<Record<string, Allowance>> = {},
): number {
  let value = plan?.credits ?? 0;

  const held = overrides[ALLOWANCE_KEY];
  if (typeof held === "number" && held > value) value = held;

  const set = adjustments[ALLOWANCE_KEY];
  if (typeof set === "number" && set >= 0) return Math.trunc(set);

  return Math.trunc(value);
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
 * WHETHER A PLAN INCLUDES A CAPABILITY AT ALL — the question a gate asks, and
 * the question a screen asks before it offers a destination.
 *
 * ⚠️ ONE FUNCTION, BECAUSE THE TWO WALKS MUST NOT DISAGREE. A nav that hides
 * what the gate would allow costs a customer a feature they paid for; a nav that
 * offers what the gate refuses is a promise the product does not keep. Written
 * out twice they agree until one of them is edited, and the symptom is a
 * destination somebody was offered and cannot use.
 *
 * ⚠️ AND `0` IS NOT INCLUDED WHILE `-1` IS. A ceiling of none and a ceiling of
 * unlimited are both numbers; only the sign tells them apart.
 */
export const included = (allowed: Allowance): boolean => allowed !== false && allowed !== 0;

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

/* --------------------------------------------------------- grandfathering --- */

/**
 * WHAT A PLAN EDIT TAKES, AND THEREFORE WHAT HAS TO BE KEPT.
 *
 * ⚠️ A PLAN EDITED DOWN IS A SILENT DOWNGRADE OF EVERYBODY ALREADY ON IT. They
 * were sold a number; narrowing the tier changes what they have without anybody
 * telling them, and the first they know is a refusal on a Tuesday. So an edit
 * that lowers anything writes what it lowered onto every subscription holding
 * that plan, and `walk` reads it back as a floor.
 *
 * ⚠️ ONLY WHAT WENT DOWN. An edit that RAISES a limit should reach existing
 * customers — that is a gift, and snapshotting it would freeze them below the
 * tier they are on for ever. This returns the narrowings and nothing else.
 *
 * ⚠️ AND THE ALLOWANCE IS IN HERE TOO, under `ALLOWANCE_KEY`. It is not an
 * entitlement — see that constant — but it is a number somebody was sold, and
 * cutting a tier's monthly credits without holding existing customers is the
 * same broken promise in the same edit.
 */
export function snapshotDowngrade(
  was: PlanSpec,
  now: PlanSpec,
): Readonly<Record<string, Allowance>> {
  const kept: Record<string, Allowance> = {};

  for (const [key, before] of Object.entries(was.includes)) {
    const after = now.includes[key];
    /* ⚠️ A KEY THE NEW PLAN DOES NOT MENTION AT ALL IS THE SHARPEST NARROWING —
       it resolves to `false` for everybody, which is further down than any
       number. `refuseCatalog` refuses that catalogue, and this holds the line
       for anyone already on it in the window before somebody notices. */
    if (after === undefined || above(before, after)) kept[key] = before;
  }

  /* ⚠️ `-1` is unlimited and beats every number, so a tier that WAS unlimited
     and is now 50 is caught by the same comparison the entitlements use. */
  if (was.credits > now.credits) kept[ALLOWANCE_KEY] = was.credits;

  return kept;
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
