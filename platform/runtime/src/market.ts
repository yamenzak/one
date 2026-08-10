/**
 * THE STOREFRONT'S ONE READ, AND THE ONE THING IT MUST NOT GET WRONG.
 *
 * ⚠️ THE SHELF AND THE GATE COUNT THE SAME THING. A preview that estimated usage
 * its own way would promise a downgrade the next write then refuses — a surface
 * that is not the mechanism, which is the mechanism-with-no-surface failure
 * inverted and harder to see, because everything renders.
 *
 * So `usage` here is the runtime's own quota counters, passed in rather than
 * re-derived. There is no second way to count a ceiling.
 */

import {
  compare, offerOf, strains,
  type AppSpec, type BindingSpec, type Change, type EntitlementDef, type Offer,
  type PlanSpec, type SqlHandle, type Strain,
} from "@one/kernel";

export interface Preview {
  readonly to: Offer;
  readonly from: string | null;
  readonly gains: readonly Change[];
  readonly losses: readonly Change[];
  /**
   * ⚠️ A STATEMENT, NEVER A REFUSAL. Nothing is stranded — reads are never
   * gated, so the rows stay and only the next one is refused. Somebody moving
   * down deserves to know that before they choose, and to be allowed to choose
   * anyway: refusing traps them on a plan they no longer want, which is the same
   * shape as the rule that leaving is always allowed.
   */
  readonly strains: readonly Strain[];
  /**
   * What this workspace is actually using, per key that can be counted.
   *
   * ⚠️ THE SAME NUMBERS THE GATE COUNTS, and they belong on the card rather than
   * only inside a strain: "5 of 5" is what somebody needs to see BEFORE they are
   * over, and a storefront that only speaks up once a ceiling is breached tells
   * people about a problem at the moment it is already theirs.
   */
  readonly usage: Readonly<Record<string, number>>;
}

/**
 * What every plan includes, in the reader's terms.
 *
 * ⚠️ ONE LIST, NOT A SECOND ENDPOINT BESIDE `billing.plans`. Two catalogues is
 * how a pricing page and a plan picker come to show different things, and the
 * one nobody looks at is the one that stays wrong.
 */
export const shelf = (plans: readonly PlanSpec[], declared: Readonly<Record<string, EntitlementDef>>): readonly Offer[] =>
  plans.map((plan) => offerOf(plan, declared));

export async function previewOf<B extends BindingSpec>(input: {
  readonly app: AppSpec<B>;
  /**
   * ⚠️ THE CATALOGUE AS IT IS SOLD TODAY. A preview computed against the
   * DECLARED plans tells somebody what they would gain and lose under prices and
   * ceilings the deployment stopped selling — and the gate would then enforce
   * different ones, which is a promise broken at the moment it is made.
   */
  readonly selling: readonly PlanSpec[];
  readonly db: SqlHandle;
  readonly tenantId: string;
  readonly currentPlanId: string | null;
  readonly toPlanId: string;
  /** ⚠️ The runtime's own quota counters. See the file note. */
  usage(key: string): Promise<number> | null;
}): Promise<Preview | null> {
  const declared = input.app.access.entitlements;
  const to = input.selling.find((p) => p.id === input.toPlanId);
  if (!to) return null;
  const from = input.selling.find((p) => p.id === input.currentPlanId) ?? null;

  /*
    ⚠️ ONLY THE KEYS THAT CAN BE COUNTED. A ceiling nothing counts is one the
    gate cannot enforce either — `createRuntime` refuses a manifest with one — so
    an absent counter here means the key is a switch rather than a number, not
    that the count is zero.
  */
  const counted: Record<string, number> = {};
  for (const key of Object.keys(declared)) {
    const count = input.usage(key);
    if (count) counted[key] = await count.catch(() => 0);
  }

  const { gains, losses } = compare(from, to, declared);
  return {
    to: offerOf(to, declared),
    from: from?.id ?? null,
    gains,
    losses,
    strains: strains(to, declared, counted),
    usage: counted,
  };
}
