/**
 * TWO KINDS OF CREDIT WEARING ONE NUMBER — asserted.
 *
 * ⚠️ EVERY TEST HERE IS ABOUT MONEY MOVING THE WRONG WAY QUIETLY. There is no
 * failing call in any of them: a balance that spends the wrong bucket, an
 * allowance that rolls over, a charge that outlives the grant it drew from — all
 * three succeed, return a plausible number, and are discovered a month later by
 * somebody reading a total that does not add up.
 */

import { describe, expect, it } from "vitest";
import {
  allocateCredits, creditBalance, grantRef, periodOf,
  claimable, hadTrial, standingOf, dueForErasure, arrearsProblems,
  DEFAULT_ARREARS, ERASURE_FLOOR_DAYS,
  type Cohort, type Subscription,
} from "../src/index.js";
import type { Instant } from "../src/primitives.js";

const at = (s: string) => s as Instant;
const SEP = at("2026-09-01T00:00:00.000Z");
const OCT = at("2026-10-01T00:00:00.000Z");
const NOW = at("2026-08-15T00:00:00.000Z");

/* ------------------------------------------------------------ allocation --- */

describe("which credits a spend comes out of", () => {
  /*
    ⚠️ THE PERISHABLE ONE FIRST, AND THIS IS THE ONE THAT COSTS SOMEBODY MONEY.
    Charging purchased credits while granted ones expire beside them takes what
    was paid for and leaves what was free to lapse. Nothing errors, no screen
    shows it, and the only trace is a balance that is smaller than the arithmetic.
  */
  it("spends granted credits before purchased ones", () => {
    const out = allocateCredits([{ expiresAt: SEP, left: 500 }], 10_000, 300);
    expect(out.shares).toEqual([{ kind: "granted", expiresAt: SEP, amount: 300 }]);
    expect(out.short).toBe(0);
  });

  /*
    ⚠️ AND THE SOONEST-PERISHING FIRST. Two cohorts are live whenever a period's
    allowance arrives before the last one lapses. Spending the later one first
    lets the earlier expire unused — the same loss, one month deferred.
  */
  it("spends the cohort that expires soonest first", () => {
    const cohorts: readonly Cohort[] = [{ expiresAt: OCT, left: 1000 }, { expiresAt: SEP, left: 400 }];
    const out = allocateCredits(cohorts, 0, 900);
    expect(out.shares).toEqual([
      { kind: "granted", expiresAt: SEP, amount: 400 },
      { kind: "granted", expiresAt: OCT, amount: 500 },
    ]);
  });

  it("falls through to purchased once the granted ones are gone", () => {
    const out = allocateCredits([{ expiresAt: SEP, left: 100 }], 900, 400);
    expect(out.shares).toEqual([
      { kind: "granted", expiresAt: SEP, amount: 100 },
      { kind: "purchased", expiresAt: null, amount: 300 },
    ]);
    expect(out.short).toBe(0);
  });

  /*
    ⚠️ SHORT IS REPORTED, NOT PARTIALLY CHARGED. A spend that takes what it can
    find is a generation half paid for — the platform runs it, the balance moves,
    and neither side has what it wanted.
  */
  it("reports what it could not cover rather than taking what it can", () => {
    const out = allocateCredits([{ expiresAt: SEP, left: 100 }], 50, 400);
    expect(out.short).toBe(250);
    expect(out.shares.reduce((n, s) => n + s.amount, 0)).toBe(150);
  });

  it("does nothing at all for a spend of nothing", () => {
    expect(allocateCredits([{ expiresAt: SEP, left: 100 }], 0, 0)).toEqual({ shares: [], short: 0 });
  });
});

/* --------------------------------------------------------------- balance --- */

describe("what is actually spendable", () => {
  /*
    ⚠️ EXPIRY IS READ, NOT SWEPT. A job that zeroed lapsed cohorts makes the
    balance depend on whether that job ran — so a wedged scheduler keeps handing
    out an allowance that lapsed in March, and every ledger entry agrees it was
    correct to.
  */
  it("stops counting a cohort the moment it lapses, with nothing having run", () => {
    const cohorts: readonly Cohort[] = [{ expiresAt: SEP, left: 5000 }];
    expect(creditBalance(cohorts, 200, NOW).total).toBe(5200);
    expect(creditBalance(cohorts, 200, at("2026-09-01T00:00:01.000Z")).total).toBe(200);
  });

  /*
    ⚠️ AND THE TWO HALVES ARE REPORTED SEPARATELY, because a single total is a
    number that drops overnight for no reason anybody on the screen can see.
  */
  it("says how much expires and when", () => {
    const out = creditBalance([{ expiresAt: OCT, left: 1000 }, { expiresAt: SEP, left: 300 }], 40, NOW);
    expect(out.granted).toBe(1300);
    expect(out.purchased).toBe(40);
    expect(out.expiring).toEqual({ at: SEP, amount: 300 });
  });

  it("has nothing to announce when everything is bought", () => {
    expect(creditBalance([], 900, NOW).expiring).toBeNull();
  });
});

/* ----------------------------------------------------------- the grant key --- */

describe("an allowance arrives once a period", () => {
  /*
    ⚠️ THE REFERENCE IS THE PROTECTION. A provider redelivers, a sweep re-runs, an
    operator presses twice — and each one is a second month's credits inside one
    month unless the entry is keyed by the period it is for.
  */
  it("keys the grant to the subscription and the period", () => {
    expect(grantRef("sub_1", "2026-09")).toBe("allowance:sub_1:2026-09");
    expect(grantRef("sub_1", "2026-09")).toBe(grantRef("sub_1", "2026-09"));
    expect(grantRef("sub_1", "2026-10")).not.toBe(grantRef("sub_1", "2026-09"));
  });

  /*
    ⚠️ DERIVED FROM NOW, NEVER COUNTED FORWARD. A deployment that missed two
    months and then counts would grant the two missed ones late and run behind
    forever — which is a rollover, and the whole point is that there is not one.
  */
  it("names the period a moment is in", () => {
    expect(periodOf(at("2026-09-30T23:59:59.000Z"))).toBe("2026-09");
    expect(periodOf(OCT)).toBe("2026-10");
  });
});

/* ---------------------------------------------------------- subscription --- */

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: "sub_1", accountId: "u_1", productId: "kova", tenantId: null,
  planId: "pro", pendingPlanId: null, status: "active", trialEndsAt: null, pastDueAt: null, closingAt: null,
  overrides: { grandfathered: {}, adjusted: {} }, ...over,
});

describe("where an unpaid subscription stands", () => {
  /*
    ⚠️ AN ENDED TRIAL IS ARREARS, ON THE SAME LADDER. Given rungs of its own it
    would be two sets of dates to keep in step, and the destructive rung is the
    one that would drift.
  */
  it("walks one ladder whether a trial ended or a charge failed", () => {
    const ended = sub({ status: "trialing", trialEndsAt: at("2026-08-14T00:00:00.000Z") });
    const failed = sub({ status: "past_due", pastDueAt: at("2026-08-14T00:00:00.000Z") });
    expect(standingOf(ended, NOW, true).standing).toBe("grace");
    expect(standingOf(failed, NOW, true).standing).toBe(standingOf(ended, NOW, true).standing);
  });

  it("goes grace, then read-only, then blocked", () => {
    const since = (days: number) =>
      sub({ status: "past_due", pastDueAt: at(new Date(Date.parse(NOW) - days * 86_400_000).toISOString()) });
    expect(standingOf(since(1), NOW, true).standing).toBe("grace");
    expect(standingOf(since(5), NOW, true).standing).toBe("read_only");
    expect(standingOf(since(40), NOW, true).standing).toBe("blocked");
  });

  /*
    ⚠️ AND IT NEVER REPORTS A SIXTH STANDING FOR "ALREADY ERASED". Erasure is
    something a sweep does on its own clock; a request reading a standing that
    meant "gone" would be reading it about a workspace that is still there.
  */
  it("stays blocked past the last rung rather than inventing a standing", () => {
    const long = sub({ status: "past_due", pastDueAt: at("2020-01-01T00:00:00.000Z") });
    expect(standingOf(long, NOW, true).standing).toBe("blocked");
    expect(dueForErasure(long, NOW)).toBe(true);
  });

  /*
    ⚠️ FAIL CLOSED ON THEIR NON-PAYMENT, OPEN ON OURS — AND THE LINE BETWEEN THEM
    IS THE ONE THAT MATTERS. Never having chosen a plan on a deployment that
    cannot charge is our missing configuration, and holding somebody read-only
    for it gives them nothing to pay their way out of.

    ⚠️ A REPORTED FAILED CHARGE IS EVIDENCE A PAYMENT RAIL EXISTS. Standing the
    ladder down for it would leave every workspace that stopped paying at
    `active` forever while the provider retried — correct-looking at every
    individual moment, and never arriving.
  */
  it("stands down for an unchosen plan, and never for arrears", () => {
    expect(standingOf(sub({ planId: null, status: "none" }), NOW, false).standing).toBe("active");
    expect(standingOf(sub({ planId: null, status: "none" }), NOW, true).standing).toBe("read_only");

    const failed = sub({ status: "past_due", pastDueAt: at("2020-01-01T00:00:00.000Z") });
    expect(standingOf(failed, NOW, false).standing).toBe("blocked");
    expect(standingOf(failed, NOW, true).standing).toBe("blocked");
  });

  it("serves a running trial in full, and says when it ends", () => {
    const trial = sub({ status: "trialing", planId: null, trialEndsAt: SEP });
    expect(standingOf(trial, NOW, true)).toEqual({ standing: "active", reason: "ok", nextAt: SEP });
  });

  it("closes on the owner's decision before anything else is considered", () => {
    const closing = sub({ status: "past_due", pastDueAt: at("2020-01-01T00:00:00.000Z"), closingAt: SEP });
    expect(standingOf(closing, NOW, true).standing).toBe("closing");
  });
});

describe("the ladder itself", () => {
  it("accepts the default", () => {
    expect(arrearsProblems(DEFAULT_ARREARS)).toEqual([]);
  });

  /*
    ⚠️ RUNGS OUT OF ORDER IS NOT A TYPO, IT IS A LADDER THAT SKIPS. Blocked before
    read-only withholds a product with no warning step, and every rung the
    comparison passes over is a notice somebody was supposed to receive.
  */
  it("refuses rungs that are not in order", () => {
    expect(arrearsProblems({ graceDays: 10, readOnlyDays: 3, blockedDays: 30, erasedDays: 60 })).toHaveLength(1);
  });

  /* ⚠️ Erasure is the one rung paying cannot undo, so it has a floor. */
  it("refuses a ladder that erases before somebody could come back from a holiday", () => {
    expect(arrearsProblems({ graceDays: 1, readOnlyDays: 2, blockedDays: 3, erasedDays: ERASURE_FLOOR_DAYS - 1 }))
      .toHaveLength(1);
  });
});

describe("claiming a subscription with a new workspace", () => {
  /*
    ⚠️ POINTING AT NOTHING IS NOT ENOUGH. A cancelled subscription and a lapsed
    trial both point at nothing, and claiming either turns "you cannot start until
    you have paid" into "start a trial, let it die, then start".
  */
  it("is claimable while paid or on a live trial, and never once it has lapsed", () => {
    expect(claimable(sub({ status: "active" }), "kova", NOW)).toBe(true);
    expect(claimable(sub({ status: "trialing", trialEndsAt: SEP }), "kova", NOW)).toBe(true);
    expect(claimable(sub({ status: "trialing", trialEndsAt: at("2026-08-01T00:00:00.000Z") }), "kova", NOW)).toBe(false);
    expect(claimable(sub({ status: "cancelled" }), "kova", NOW)).toBe(false);
    expect(claimable(sub({ status: "past_due" }), "kova", NOW)).toBe(false);
  });

  it("is never claimable by another product, or twice", () => {
    expect(claimable(sub(), "scena", NOW)).toBe(false);
    expect(claimable(sub({ tenantId: "t_1" }), "kova", NOW)).toBe(false);
  });

  /*
    ⚠️ ONE TRIAL PER ACCOUNT PER PRODUCT, AND THE ROW REMEMBERS. Clearing the date
    when a trial ends gives somebody a fresh one every time they cancel, which is
    a free product with extra steps.
  */
  it("remembers a trial that has already been had", () => {
    expect(hadTrial([sub({ status: "cancelled", trialEndsAt: at("2026-01-01T00:00:00.000Z") })], "kova")).toBe(true);
    expect(hadTrial([sub({ trialEndsAt: null })], "kova")).toBe(false);
    expect(hadTrial([sub({ trialEndsAt: at("2026-01-01T00:00:00.000Z") })], "scena")).toBe(false);
  });
});
