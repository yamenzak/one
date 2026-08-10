/**
 * THE STOREFRONT — derived from what the gate enforces, never written beside it.
 *
 * Layer 3. Imports entitlement, customer and primitives.
 *
 * ⚠️ A PRICE LIST WRITTEN BY HAND DRIFTS FROM WHAT IS ENFORCED, and the drift is
 * discovered by somebody who bought a thing the product then refuses. That is
 * the same failure the coverage rule exists for, one layer up: there, a
 * capability was sold and withheld by nothing; here, a capability is ADVERTISED
 * as something other than what it is.
 *
 * So a shelf is a projection of `entitlements` and `customerFlags` — the same
 * declarations the gate reads — and there is nowhere to put a second copy.
 *
 * ⚠️ AND THE STOREFRONT STATES, IT NEVER REFUSES. Nothing here blocks a change.
 * A downgrade below what a workspace is already using is worth SAYING, loudly,
 * before they choose — and refusing it traps somebody on a plan they no longer
 * want, which is the same shape as the rule that leaving is always allowed.
 * Paying must be a way out, not the only one.
 */

import type { Allowance, EntitlementDef, PlanSpec } from "./entitlement.js";
import { UNLIMITED } from "./entitlement.js";
import type { FlagDef } from "./customer.js";

/* -------------------------------------------------------------- the line --- */

/**
 * One row on a shelf card, for one thing a plan includes.
 *
 * ⚠️ NO COPY, ONLY FACTS. There is no "Unlimited" here and no "5 receipts": the
 * words belong to the renderer, which has the locale and the space. A kernel
 * that formatted this would be a kernel with a translation table in it.
 */
export interface Line {
  readonly key: string;
  readonly label: string;
  readonly value: Allowance;
  /** `-1` read once, here, rather than at every render site. */
  readonly unlimited: boolean;
  readonly unit: "count" | "bytes" | "switch";
}

const lineOf = (key: string, def: EntitlementDef, value: Allowance): Line => ({
  key,
  label: def.label,
  value,
  unlimited: value === UNLIMITED,
  unit: typeof value === "boolean" ? "switch" : (def.unit ?? "count"),
});

export interface Offer {
  readonly id: string;
  readonly name: string;
  readonly price: PlanSpec["price"];
  readonly period: PlanSpec["period"];
  readonly trialDays: number;
  readonly includes: readonly Line[];
}

/**
 * One plan, as a card.
 *
 * ⚠️ EVERY DECLARED KEY, NOT EVERY KEY THE PLAN MENTIONS. A plan omitting a key
 * is a plan on which the parking value applies — so walking the plan's own map
 * produces ragged columns, and a comparison table with different rows per column
 * is one nobody can read. The cheapest plan looks like it has fewer *features*
 * rather than smaller *numbers*, which is the opposite of true.
 */
export function offerOf(plan: PlanSpec, declared: Readonly<Record<string, EntitlementDef>>): Offer {
  return {
    id: plan.id,
    name: plan.name,
    price: plan.price,
    period: plan.period,
    trialDays: plan.trialDays,
    includes: Object.entries(declared).map(([key, def]) => lineOf(key, def, plan.entitlements[key] ?? def.parked)),
  };
}

/* ---------------------------------------------------------- the customer --- */

export interface FlagLine {
  readonly key: string;
  readonly label: string;
  readonly on: boolean;
  /** The budget scope whose days gate it, where one does. */
  readonly scope?: string;
}

/**
 * A package, as a card — the other rail, the same shape.
 *
 * ⚠️ EVERY SELLABLE FLAG, FOR THE SAME REASON. A package that turns two things
 * on is not a package with two features; it is a package with two of the eight
 * on, and a customer comparing packages has to be able to see the six.
 */
export function packageLines(
  turnedOn: Readonly<Record<string, boolean>>,
  declared: Readonly<Record<string, FlagDef>>,
): readonly FlagLine[] {
  return Object.entries(declared).map(([key, def]) => ({
    key,
    label: def.label,
    on: turnedOn[key] ?? def.parked,
    ...(def.scope ? { scope: def.scope } : {}),
  }));
}

/* ---------------------------------------------------------- the compare --- */

/**
 * ⚠️ UNLIMITED IS THE TOP, NOT THE BOTTOM. `-1` sorts below zero as a number and
 * above everything as an allowance, and a comparison that forgets it reports
 * every upgrade to an unlimited plan as a loss of everything.
 */
const rank = (value: Allowance): number => {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value === UNLIMITED ? Number.POSITIVE_INFINITY : value;
};

export interface Change {
  readonly key: string;
  readonly label: string;
  readonly from: Allowance;
  readonly to: Allowance;
}

/**
 * What moving between two plans actually changes.
 *
 * ⚠️ `from` MAY BE NULL, AND THAT IS THE COMMON CASE. A workspace that has never
 * chosen anything is on the parking values, not on nothing — and a comparison
 * that treated "no plan" as zero would advertise every plan as pure gain,
 * including the ones that take something away from the parking state.
 */
export function compare(
  from: PlanSpec | null,
  to: PlanSpec,
  declared: Readonly<Record<string, EntitlementDef>>,
): { readonly gains: readonly Change[]; readonly losses: readonly Change[] } {
  const gains: Change[] = [];
  const losses: Change[] = [];
  for (const [key, def] of Object.entries(declared)) {
    const before = from ? (from.entitlements[key] ?? def.parked) : def.parked;
    const after = to.entitlements[key] ?? def.parked;
    if (rank(after) > rank(before)) gains.push({ key, label: def.label, from: before, to: after });
    else if (rank(after) < rank(before)) losses.push({ key, label: def.label, from: before, to: after });
  }
  return { gains, losses };
}

/* ----------------------------------------------------------- the strain --- */

export interface Strain {
  readonly key: string;
  readonly label: string;
  readonly have: number;
  readonly allows: number;
}

/**
 * Ceilings this workspace is already past, on a plan it is considering.
 *
 * ⚠️ COUNTED BY WHATEVER COUNTS IT FOR THE GATE. The storefront and the gate
 * must be counting the same thing or the screen promises a downgrade that then
 * refuses the next write — which is the mechanism-with-no-surface failure
 * inverted: a surface that is not the mechanism.
 *
 * ⚠️ AND IT IS A STATEMENT, NOT A REFUSAL. Nothing is stranded: reads are never
 * gated, so the rows stay and only the next one is refused. Somebody moving down
 * deserves to know that before they choose, and to be allowed to choose anyway.
 */
export function strains(
  to: PlanSpec,
  declared: Readonly<Record<string, EntitlementDef>>,
  usage: Readonly<Record<string, number>>,
): readonly Strain[] {
  const out: Strain[] = [];
  for (const [key, have] of Object.entries(usage)) {
    const def = declared[key];
    if (!def) continue;
    const allows = to.entitlements[key] ?? def.parked;
    if (typeof allows !== "number" || allows === UNLIMITED) continue;
    if (have > allows) out.push({ key, label: def.label, have, allows });
  }
  return out;
}

/* ------------------------------------------------------------ the check --- */

export interface MarketProblem {
  readonly id: string;
  readonly why: string;
}

/**
 * ⚠️ A PLAN NAMING A KEY NOBODY DECLARED IS A PRICE LIST PROMISING SOMETHING
 * THAT DOES NOT EXIST. It resolves to nothing at the gate, so it is sold, paid
 * for, and enforced by no mechanism at all — and it looks exactly like a
 * capability that happens to be generous.
 */
export function marketProblems(
  plans: readonly PlanSpec[],
  declared: Readonly<Record<string, EntitlementDef>>,
): readonly MarketProblem[] {
  const known = new Set(Object.keys(declared));
  const out: MarketProblem[] = [];
  for (const plan of plans) {
    if (!plan.name.trim()) out.push({ id: plan.id, why: "has no name, so it cannot appear on a price list" });
    for (const key of Object.keys(plan.entitlements)) {
      if (!known.has(key)) out.push({ id: plan.id, why: `sells "${key}", which this app does not declare as an entitlement` });
    }
  }
  return out;
}
