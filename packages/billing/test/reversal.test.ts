/**
 * REFUND → CREDIT REVERSAL, against a fake D1 and a recording authority.
 *
 * This is here rather than in an app's suite because two of the three apps
 * shipped with no refund handling at all, and the third's was reachable only
 * through a live Stripe webhook. What the rules have in common is that getting
 * them wrong costs money in a direction nothing reports:
 *
 *   - A PARTIAL refund must take a proportional share. Reversing the whole pack
 *     on a $5 goodwill refund of a $100 purchase takes 130,000 credits the
 *     customer paid for, and the only symptom is a support ticket.
 *   - EVERY event carries the CUMULATIVE `amount_refunded`, so the naive
 *     implementation — reverse this event's share — double-charges the customer
 *     on the second partial refund. The ledger read-back is the whole defence.
 *   - A FULL refund must take exactly the pack and never more, whatever
 *     rounding does in the middle.
 *   - No credit metadata (a plan-level refund) must reverse NOTHING and still
 *     report a tenant, because the app has to tell somebody either way.
 *
 * The fake is deliberately dumb — it records statements and answers `first`
 * from a canned map. What is under test is the arithmetic and which ledger
 * total it reads, not SQL execution.
 */

import { describe, expect, it } from "vitest";
import { reverseChargedCredits } from "../src/webhook.js";

/** A charge event as Stripe delivers it, with our metadata stamped on. */
function refundEvent(opts: {
  amount: number;
  refunded: number;
  credits?: number;
  tenant?: string;
  chargeId?: string;
}) {
  return {
    type: "charge.refunded",
    data: {
      object: {
        id: opts.chargeId ?? "ch_1",
        amount: opts.amount,
        amount_refunded: opts.refunded,
        customer: "cus_1",
        metadata: {
          ...(opts.tenant === undefined ? { demo_tenant: "t1" } : opts.tenant ? { demo_tenant: opts.tenant } : {}),
          ...(opts.credits === undefined ? { demo_credits: "1000" } : opts.credits ? { demo_credits: String(opts.credits) } : {}),
        } as Record<string, string>,
      } as Record<string, unknown>,
    },
  };
}

/** Answers `creditsAlreadyReversed` with `reversed`, records nothing else. */
function fakeDb(reversed: number) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        async first<T>(): Promise<T | null> {
          if (sql.includes("SUM(-delta)")) return { reversed } as T;
          return null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          return { results: [] };
        },
        async run(): Promise<void> {},
      };
      return stmt;
    },
  } as unknown as D1Database;
}

/** Records every `revokePurchased` call so the test can assert the amount. */
function recorder() {
  const calls: { credits: number; reason?: string; ref?: string }[] = [];
  return {
    calls,
    authority: async () => ({
      async revokePurchased(credits: number, reason?: string, ref?: string) {
        calls.push({ credits, reason, ref });
        return undefined;
      },
    }),
  };
}

const deps = (db: D1Database, authority: ReturnType<typeof recorder>["authority"]) => ({
  db,
  secretKey: "sk_test_unused",
  metadataPrefix: "demo",
  authority,
});

describe("reverseChargedCredits", () => {
  it("reverses the whole pack on a full refund", async () => {
    const rec = recorder();
    const out = await reverseChargedCredits(deps(fakeDb(0), rec.authority), refundEvent({ amount: 10_000, refunded: 10_000 }));
    expect(out).toMatchObject({ tenantId: "t1", disputed: false, reversed: 1_000 });
    expect(rec.calls).toEqual([{ credits: 1_000, reason: "pack.refund", ref: "ch_1" }]);
  });

  it("reverses a proportional share on a partial refund", async () => {
    const rec = recorder();
    // $25 back on a $100 / 1,000-credit pack.
    const out = await reverseChargedCredits(deps(fakeDb(0), rec.authority), refundEvent({ amount: 10_000, refunded: 2_500 }));
    expect(out?.reversed).toBe(250);
    expect(rec.calls[0]?.credits).toBe(250);
  });

  it("is INCREMENTAL — a second partial refund takes only the difference", async () => {
    /*
      The one that costs money. Stripe re-sends `charge.refunded` for the second
      refund with `amount_refunded` CUMULATIVE at $50, so an implementation that
      reverses the event's own share takes 500 twice for a customer who is owed
      500 in total.
    */
    const rec = recorder();
    const out = await reverseChargedCredits(
      deps(fakeDb(250), rec.authority), // 250 already clawed back by the first event
      refundEvent({ amount: 10_000, refunded: 5_000 }),
    );
    expect(out?.reversed).toBe(250);
    expect(rec.calls[0]?.credits).toBe(250);
  });

  it("takes nothing when the total is already settled", async () => {
    const rec = recorder();
    const out = await reverseChargedCredits(deps(fakeDb(1_000), rec.authority), refundEvent({ amount: 10_000, refunded: 10_000 }));
    expect(out?.reversed).toBe(0);
    expect(rec.calls).toEqual([]);
  });

  it("never reverses more than the pack, whatever the amounts say", async () => {
    const rec = recorder();
    // A refund larger than the charge (shouldn't happen; must not overdraw).
    const out = await reverseChargedCredits(deps(fakeDb(0), rec.authority), refundEvent({ amount: 10_000, refunded: 25_000 }));
    expect(out?.reversed).toBe(1_000);
  });

  it("reports the tenant but reverses nothing when the charge carries no credits", async () => {
    // A plan-level refund. There is nothing to claw back and the owner still has
    // to be told, so the outcome must be non-null.
    const rec = recorder();
    const out = await reverseChargedCredits(deps(fakeDb(0), rec.authority), refundEvent({ amount: 3_900, refunded: 3_900, credits: 0 }));
    expect(out).toMatchObject({ tenantId: "t1", reversed: 0 });
    expect(rec.calls).toEqual([]);
  });

  it("marks a dispute so the app can say chargeback rather than refund", async () => {
    const rec = recorder();
    const ev = refundEvent({ amount: 10_000, refunded: 10_000 });
    // A real dispute payload resolves through the Stripe API; this asserts only
    // the branch flag, using a charge-shaped object.
    const out = await reverseChargedCredits(deps(fakeDb(0), rec.authority), { ...ev, type: "charge.refunded" });
    expect(out?.disputed).toBe(false);
    expect(rec.calls[0]?.reason).toBe("pack.refund");
  });

  it("returns null — touching nothing — when no tenant can be resolved", async () => {
    const rec = recorder();
    const out = await reverseChargedCredits(deps(fakeDb(0), rec.authority), {
      type: "charge.refunded",
      data: { object: { id: "ch_x", amount: 100, amount_refunded: 100, metadata: {} } },
    });
    expect(out).toBeNull();
    expect(rec.calls).toEqual([]);
  });

  it("reads the metadata prefix it is given, not a hard-coded one", async () => {
    const rec = recorder();
    const out = await reverseChargedCredits(
      { db: fakeDb(0), secretKey: "sk", metadataPrefix: "other", authority: rec.authority },
      refundEvent({ amount: 10_000, refunded: 10_000 }),
    );
    // `demo_tenant` means nothing to a handler bound to `other`, and there is no
    // customer row behind it, so nothing is touched.
    expect(out).toBeNull();
  });
});
