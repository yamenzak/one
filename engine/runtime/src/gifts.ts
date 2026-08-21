/**
 * PUTTING A GIFT ONTO A WORKSPACE — the one path, for both ways it happens.
 *
 * ⚠️ A GIFT IS MADE TO A PERSON AND SPENT ON A WORKSPACE, and those are two
 * moments that can be weeks apart. An operator gives an address a workspace at
 * Max; the person signs in on Thursday, founds one, and the plan has to be there
 * when they arrive. Between the two there is nothing to comp.
 *
 * ⚠️ SO THE APPLICATION IS A FUNCTION AND NOT A ROUTE, AND BOTH DOORS CALL IT.
 * Founding calls it — the workspace somebody just made is the one the gift was
 * for. The console calls it — an operator looking at somebody who already has a
 * workspace should not have to tell them to make another one. Two implementations
 * of "spend this gift" is how one of them forgets to mark it spent.
 *
 * ⚠️ AND THE KIND IS ASKED, NEVER ASSUMED. A commercial plan on a personal
 * workspace is a workspace holding entitlements the gate refuses it — `mayBrand`
 * and `mayIsolate` read the KIND, not the plan — so it would be a tier somebody
 * was given and cannot use, with nothing on any screen saying why.
 */

import type { Gift, PlanSpec, TenantId } from "@engine/kernel";
import { giftIsLive } from "@engine/kernel";
import { MEMBERSHIP, compPlan } from "./billing.js";
import { giftsFor, spendGift, tenantById } from "./directory.js";
import { renewAllowance, topUp } from "./wallet.js";
import type { Db } from "./sql.js";

/**
 *   no_gift        nothing live of that kind is waiting.
 *   wrong_kind     the plan is for a business and this workspace is not one.
 *   no_tenant      the workspace is gone, or was never there.
 *   raced          somebody else spent the last one between the read and the write.
 */
export type GiftRefusal = "no_gift" | "wrong_kind" | "no_tenant" | "raced";

export interface Applied {
  readonly gift: Gift;
  readonly planId: string | null;
  readonly credits: number;
}

/**
 * ⚠️ THE DATED ONE FIRST — see `nextGift`, which this deliberately re-derives
 * rather than calls. That helper picks by term alone; here the workspace's kind
 * narrows the field first, so a person holding a commercial gift and a personal
 * one founding a personal workspace gets the one they can actually use rather
 * than a refusal.
 */
const pick = (
  gifts: readonly Gift[], kind: Gift["kind"], now: string, fits: (g: Gift) => boolean,
): Gift | null => {
  const live = gifts.filter((g) => g.kind === kind && giftIsLive(g, now) && fits(g));
  if (!live.length) return null;
  const dated = live.filter((g) => g.until).sort((a, b) => (a.until! < b.until! ? -1 : 1));
  return dated[0] ?? live[live.length - 1]!;
};

/**
 * PUT A WAITING PLAN ONTO THIS WORKSPACE.
 *
 * ⚠️ THE ALLOWANCE IS GRANTED HERE AND NOT LEFT TO THE SWEEP, exactly as
 * `op.tenant.plan` does. The clock that renews a comped workspace runs tomorrow;
 * a gift that took a day to become usable is one the person reports as broken
 * on the day they received it.
 *
 * ⚠️ AND THE GIFT IS SPENT BEFORE THE PLAN IS STAMPED. The other order comps the
 * workspace and then discovers the gift was already spent — a free tier given
 * away with nothing recording that it was, which is the exact failure `spendGift`
 * carries its count in the `WHERE` to prevent.
 */
export async function applyPlanGift(
  db: Db, tenantId: TenantId, email: string,
  plans: readonly PlanSpec[], now = new Date(),
): Promise<Applied | GiftRefusal> {
  const tenant = await tenantById(db, tenantId);
  if (!tenant || tenant.closedAt) return "no_tenant";

  const at = now.toISOString();
  const gifts = await giftsFor(db, email);
  /* ⚠️ A PLAN THIS DEPLOYMENT NO LONGER SELLS IS NOT APPLIED. A catalogue edit
     can retire a tier while a gift naming it is still live, and comping onto an
     id with no plan behind it is an empty entitlement set that resolves as a
     refusal a week later. */
  const planOf = (g: Gift) => plans.find((p) => p.id === g.planId);
  const gift = pick(gifts, "plan", at, (g) => {
    const plan = planOf(g);
    return !!plan && plan.kind === tenant.kind;
  });

  if (!gift) {
    /* ⚠️ WRONG KIND IS SAID SEPARATELY FROM NOTHING WAITING, because they are
       different things for the person to do: one is "you have nothing", the
       other is "make this a business first". A single refusal would send the
       second one looking for a gift they are holding. */
    const anyPlan = pick(gifts, "plan", at, (g) => !!planOf(g));
    return anyPlan ? "wrong_kind" : "no_gift";
  }

  if (!await spendGift(db, gift.id)) return "raced";

  const plan = planOf(gift)!;
  /* ⚠️ `MEMBERSHIP`, NEVER AN APP. One plan covers every product a workspace has
     switched on, so the row is filed under no app — and this took the caller's
     app id for one draft, which comped a row `renewAllowance` then could not
     find: the plan landed, the allowance was zero, and nothing failed. */
  await compPlan(db, tenantId, MEMBERSHIP, plan.id, now);
  await renewAllowance(db, tenantId, plans, now);
  return { gift: { ...gift, spent: gift.spent + 1 }, planId: plan.id, credits: plan.credits };
}

/**
 * PUT WAITING CREDITS INTO THIS WORKSPACE'S WALLET.
 *
 * ⚠️ INTO `bought`, LIKE EVERY OTHER COMP — see `topUp`. Credits that landed in
 * the month's allowance would be swept away by the next renewal, so a gift made
 * on the 30th would be gone on the 1st, silently.
 *
 * ⚠️ AND THE REASON TRAVELS ONTO THE STATEMENT. The workspace's own bill is
 * where somebody notices a balance they did not buy, and "Given: paid cash for a
 * year" is the whole of what they need to read there.
 */
export async function applyCreditGift(
  db: Db, tenantId: TenantId, email: string, now = new Date(),
): Promise<Applied | GiftRefusal> {
  const tenant = await tenantById(db, tenantId);
  if (!tenant || tenant.closedAt) return "no_tenant";

  const at = now.toISOString();
  const gift = pick(await giftsFor(db, email), "credits", at, (g) => g.credits > 0);
  if (!gift) return "no_gift";
  if (!await spendGift(db, gift.id)) return "raced";

  await topUp(db, tenantId, gift.credits, `Given — ${gift.why}`, {}, now);
  return { gift: { ...gift, spent: gift.spent + 1 }, planId: null, credits: gift.credits };
}

/**
 * ⚠️ BOTH KINDS, IN ONE CALL, BECAUSE FOUNDING IS ONE MOMENT. Somebody given a
 * plan AND credits who had to found two workspaces to receive them would be
 * meeting the shape of our ledger rather than the shape of the gift.
 *
 * ⚠️ AND A REFUSAL ON ONE HALF DOES NOT STOP THE OTHER. There is usually nothing
 * waiting of either kind, which is not a failure — this runs on every founding.
 */
export async function applyGifts(
  db: Db, tenantId: TenantId, email: string,
  plans: readonly PlanSpec[], now = new Date(),
): Promise<readonly Applied[]> {
  const out: Applied[] = [];
  for (const done of [
    await applyPlanGift(db, tenantId, email, plans, now),
    await applyCreditGift(db, tenantId, email, now),
  ]) {
    if (typeof done !== "string") out.push(done);
  }
  return out;
}
