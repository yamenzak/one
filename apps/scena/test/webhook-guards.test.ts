/**
 * THE THREE GUARDS ON THE SUBSCRIPTION ROW, against a real D1.
 *
 * Scena's webhook reconciler is its own — `@4dl/billing`'s
 * `syncStripeSubscription` cannot be adopted until `BILLING_SCHEMA`'s column
 * shapes are reconciled (see `src/schema.ts`). What it was missing were the
 * three rules that version has, and each one fails SAFE, which is why none of
 * them was noticed:
 *
 *   THE LADDER CLAMP. The ladder escalates by SELECTING on the previous rung
 *   (`past_due` → `suspended` → deleted), so a payment event writing `active`
 *   unconditionally breaks the chain permanently. Nothing errors — the
 *   workspace is simply never suspended, never purged, and its storage never
 *   reclaimed. `closing` is the sharper half: `scheduleTenantClose` cancels the
 *   Stripe subscription, so Stripe fires a cancellation straight back at us, and
 *   a workspace the owner asked us to delete quietly came back to life.
 *
 *   THE STALE-SUBSCRIPTION GUARD. A mid-cycle upgrade creates a SECOND Stripe
 *   subscription; the old one keeps emitting events with its own metadata. Acting
 *   on them drops a paying workspace to `free`.
 *
 *   THE CARD-LESS TRIAL. Stripe reports `trialing` for a trial with no payment
 *   method, so stamping it grants the plan to somebody who has paid nothing and
 *   cannot be charged at the end of it.
 *
 * These assert the STORE-level guard and the pure predicates, not the HTTP
 * round trip: a Stripe webhook needs a signature this suite cannot mint, and the
 * arithmetic half is covered in `@4dl/billing`'s own suite.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { LADDER_OWNED, hasPaymentMethod } from "@4dl/billing";
import { ensureSchema } from "../src/db.js";
import { getSubscription, updateSubscription } from "../src/billing-store.js";

let n = 0;
/** A workspace parked at `status`, with its own id so tests never collide. */
async function tenantAt(status: string): Promise<string> {
  await ensureSchema(env.DB);
  const tenantId = `wg_${status}_${++n}`;
  await getSubscription(env.DB, tenantId); // materialises the parking row
  await updateSubscription(env.DB, tenantId, { status, plan_id: "pro", stripe_sub_id: "sub_current" });
  return tenantId;
}

const statusOf = async (tenantId: string) => (await getSubscription(env.DB, tenantId)).status;

describe("the ladder clamp", () => {
  for (const rung of ["suspended", "closing", "canceled"]) {
    it(`refuses to reactivate a ${rung} workspace`, async () => {
      const t = await tenantAt(rung);
      await updateSubscription(env.DB, t, { status: "active", past_due_at: null }, { unlessLadderOwned: true });
      expect(await statusOf(t)).toBe(rung);
    });
  }

  it("still lets a paid invoice clear past_due — paying IS the way out of that rung", async () => {
    const t = await tenantAt("past_due");
    await updateSubscription(env.DB, t, { status: "active", past_due_at: null }, { unlessLadderOwned: true });
    expect(await statusOf(t)).toBe("active");
  });

  it("refuses to reset a suspended workspace to the FIRST rung on a failed invoice", async () => {
    // The other direction, and the one that stalls the ladder rather than
    // unwinding it: `past_due` on an already-suspended row would restart the
    // grace window every time Stripe retried.
    const t = await tenantAt("suspended");
    await updateSubscription(env.DB, t, { status: "past_due", past_due_at: Date.now() }, { unlessLadderOwned: true });
    expect(await statusOf(t)).toBe("suspended");
  });

  it("writes normally when the guard is not asked for", async () => {
    // The operator paths (comping, a manual plan change) legitimately move a
    // suspended workspace, and must keep working.
    const t = await tenantAt("suspended");
    await updateSubscription(env.DB, t, { status: "active" });
    expect(await statusOf(t)).toBe("active");
  });

  it("names every rung the ladder and the close flow own", () => {
    // Pinned against the shared constant so Scena's guard and the other apps'
    // cannot drift into disagreeing about which statuses are protected.
    expect(LADDER_OWNED).toBe("'suspended','blocked','canceled','closing'");
  });
});

describe("the card-less trial", () => {
  it("is not a paid-for plan", () => {
    expect(hasPaymentMethod({ status: "trialing" })).toBe(false);
  });

  it("is a paid-for plan once a payment method is attached", () => {
    expect(hasPaymentMethod({ status: "trialing", default_payment_method: "pm_1" })).toBe(true);
  });
});
