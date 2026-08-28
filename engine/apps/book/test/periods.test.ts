/**
 * THE YEAR THE BOOKS ARE KEPT IN, AND WHAT REFUSES A POSTING.
 *
 * ⚠️ EVERY FAILURE HERE IS A FIGURE THAT IS WRONG AND BALANCES. Two overlapping
 * years put one sale in two profit-and-loss statements, both of which reconcile
 * against the ledger and disagree with each other. A correction typed into a
 * month already filed changes a number somebody sent to a tax authority. A year
 * closed with only a flag leaves every "this year" figure meaning "since the
 * books began", wrong by more each year. None of them throws.
 */

import { describe, expect, it } from "vitest";
import {
  closingLines, monthsIn, refusePeriod, refusePostingOn, refuseYear,
  type Period, type Year,
} from "../src/periods.js";

const year = (over: Partial<Year> = {}): Year => ({
  id: "y26", opens: "2026-01-01", closes: "2026-12-31", closed: false, ...over,
});

const period = (over: Partial<Period> = {}): Period => ({
  id: "p03", year: "y26", name: "March 2026",
  opens: "2026-03-01", closes: "2026-03-31", shut: true, ...over,
});

/* ------------------------------------------------------------- may it post --- */

describe("whether an entry may be written on a day", () => {
  it("lets an ordinary day through", () => {
    expect(refusePostingOn("2026-06-15", [year()], [])).toBeNull();
  });

  it("takes the first and last day of the year as inside it", () => {
    expect(refusePostingOn("2026-01-01", [year()], [])).toBeNull();
    expect(refusePostingOn("2026-12-31", [year()], [])).toBeNull();
  });

  /*
    ⚠️ NO YEAR AT ALL IS A REFUSAL, NOT A PASS. Treating "outside every declared
    year" as permission makes the check useless in exactly the case it exists
    for: a mistyped date lands in 2062, in no year, and posts happily — into a
    profit-and-loss no report will ever show it in, because every report is
    bounded by a year.
  */
  it("refuses a day in no year at all", () => {
    expect(refusePostingOn("2062-06-15", [year()], []))
      .toEqual({ why: "no_year", day: "2062-06-15" });
    expect(refusePostingOn("2026-06-15", [], []))
      .toEqual({ why: "no_year", day: "2026-06-15" });
  });

  it("refuses a closed year", () => {
    expect(refusePostingOn("2026-06-15", [year({ closed: true })], []))
      .toEqual({ why: "year_closed", year: "y26" });
  });

  it("refuses a shut month and says which one", () => {
    expect(refusePostingOn("2026-03-15", [year()], [period()]))
      .toEqual({ why: "period_shut", period: "p03", name: "March 2026" });
  });

  /* ⚠️ A PERIOD THAT IS NOT SHUT REFUSES NOTHING — that is what makes them
     optional, and what stops a workspace having to make twelve before it can
     record a sale. */
  it("lets an open month through", () => {
    expect(refusePostingOn("2026-03-15", [year()], [period({ shut: false })])).toBeNull();
  });

  it("ignores a shut month in a different year", () => {
    expect(refusePostingOn("2026-03-15", [year()], [period({ year: "y25" })])).toBeNull();
  });

  /* ⚠️ THE YEAR IS FOUND FIRST, so a workspace keeping several is asked about
     the one the day is actually in. */
  it("picks the year the day falls in", () => {
    const years = [
      year({ id: "y25", opens: "2025-01-01", closes: "2025-12-31", closed: true }),
      year(),
    ];
    expect(refusePostingOn("2026-06-15", years, [])).toBeNull();
    expect(refusePostingOn("2025-06-15", years, []))
      .toEqual({ why: "year_closed", year: "y25" });
  });
});

/* ---------------------------------------------------------------- opening --- */

describe("declaring a year", () => {
  it("passes an ordinary one", () => {
    expect(refuseYear({ opens: "2027-01-01", closes: "2027-12-31" }, [year()])).toBeNull();
  });

  it("takes a year that is not the calendar's", () => {
    /* ⚠️ The United Kingdom's April, Australia's July, Japan's April. A calendar
       year assumed anywhere here puts a chunk of every profit-and-loss in the
       wrong one for most of the world. */
    expect(refuseYear({ opens: "2026-04-06", closes: "2027-04-05" }, [])).toBeNull();
  });

  it("refuses one that ends before it starts", () => {
    expect(refuseYear({ opens: "2026-12-31", closes: "2026-01-01" }, []))
      .toBe("year_backwards");
  });

  /*
    ⚠️ THE ONE THAT CANNOT BE LEFT TO JUDGEMENT. A day in two years belongs to
    two profit-and-loss statements, so the same sale appears in both — and the
    pair reconcile perfectly against the ledger while disagreeing with each
    other. There is no figure downstream that looks wrong.
  */
  it("refuses one that overlaps a year already there", () => {
    expect(refuseYear({ opens: "2026-06-01", closes: "2027-05-31" }, [year()]))
      .toBe("year_overlaps");
    /* ⚠️ Touching at the boundary is still an overlap: the 31st is in both. */
    expect(refuseYear({ opens: "2026-12-31", closes: "2027-12-30" }, [year()]))
      .toBe("year_overlaps");
    /* ⚠️ And the day after is not. */
    expect(refuseYear({ opens: "2027-01-01", closes: "2027-12-31" }, [year()])).toBeNull();
  });

  /* ⚠️ A TRANSITION YEAR CAN LEGITIMATELY RUN LONG, so the cap is generous —
     what it catches is `2026` typed as `2062`, which would swallow every year
     after it. */
  it("allows an eighteen-month transition year and refuses a mistyped one", () => {
    expect(refuseYear({ opens: "2026-01-01", closes: "2027-06-30" }, [])).toBeNull();
    expect(refuseYear({ opens: "2026-01-01", closes: "2062-12-31" }, []))
      .toBe("year_too_long");
  });
});

describe("declaring a period", () => {
  const y = { opens: "2026-01-01", closes: "2026-12-31" };

  it("passes a month inside its year", () => {
    expect(refusePeriod({ opens: "2026-03-01", closes: "2026-03-31" }, y, [])).toBeNull();
  });

  it("refuses one that reaches outside the year it belongs to", () => {
    expect(refusePeriod({ opens: "2025-12-01", closes: "2026-01-31" }, y, []))
      .toBe("period_outside_its_year");
    expect(refusePeriod({ opens: "2026-12-01", closes: "2027-01-31" }, y, []))
      .toBe("period_outside_its_year");
  });

  it("refuses one that overlaps another", () => {
    expect(refusePeriod({ opens: "2026-03-15", closes: "2026-04-15" }, y,
      [{ opens: "2026-03-01", closes: "2026-03-31" }])).toBe("period_overlaps");
  });

  it("refuses one that ends before it starts", () => {
    expect(refusePeriod({ opens: "2026-03-31", closes: "2026-03-01" }, y, []))
      .toBe("period_backwards");
  });
});

/* ----------------------------------------------------------------- months --- */

describe("the months a year is made of", () => {
  /*
    ⚠️ A WORKSPACE CLOSING MONTHLY MUST NOT TYPE TWELVE DATE RANGES. Every one is
    a chance to leave a gap, and a gap is a week belonging to no period — which
    nothing refuses, because a period is optional.
  */
  it("covers a calendar year exactly, with no gap and no overlap", () => {
    const months = monthsIn({ opens: "2026-01-01", closes: "2026-12-31" });
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ name: "January 2026", opens: "2026-01-01", closes: "2026-01-31" });
    expect(months[11]).toEqual({
      name: "December 2026", opens: "2026-12-01", closes: "2026-12-31",
    });
    for (let n = 1; n < months.length; n++) {
      const before = new Date(`${months[n]!.opens}T00:00:00Z`);
      before.setUTCDate(before.getUTCDate() - 1);
      expect(before.toISOString().slice(0, 10)).toBe(months[n - 1]!.closes);
    }
  });

  it("gets February right in a leap year", () => {
    const months = monthsIn({ opens: "2028-01-01", closes: "2028-12-31" });
    expect(months[1]?.closes).toBe("2028-02-29");
  });

  /*
    ⚠️ A FISCAL YEAR THAT DOES NOT START ON THE FIRST MAKES STRADDLING MONTHS,
    and each is named by the month it mostly is — "April 2026" for the run to the
    5th of May. Naming them honestly would produce "April–May 2026" twelve times.
  */
  it("handles a year that opens mid-month", () => {
    const months = monthsIn({ opens: "2026-04-06", closes: "2027-04-05" });
    expect(months[0]).toEqual({ name: "April 2026", opens: "2026-04-06", closes: "2026-04-30" });
    expect(months[months.length - 1]?.closes).toBe("2027-04-05");
    /* ⚠️ And nothing runs past the year's own last day. */
    for (const one of months) expect(one.closes <= "2027-04-05").toBe(true);
  });
});

/* ---------------------------------------------------------------- closing --- */

describe("what closing a year posts", () => {
  const income = { account: "sales", root: "income" as const, amount: -10_000 };
  const cost = { account: "rent", root: "expense" as const, amount: 4_000 };
  const bank = { account: "bank", root: "asset" as const, amount: 6_000 };

  /*
    ⚠️ ONLY INCOME AND EXPENSE MOVE. An asset is still an asset on the first of
    the new year and a debt is still owed — sweeping those would empty the
    balance sheet. The arithmetic looks identical, which is why it is named.
  */
  it("empties income and expense and leaves the balance sheet alone", () => {
    const lines = closingLines([income, cost, bank], "reserves");
    expect(lines.map((l) => l.account)).toEqual(["sales", "rent", "reserves"]);
    expect(lines.find((l) => l.account === "sales")?.amount).toBe(10_000);
    expect(lines.find((l) => l.account === "rent")?.amount).toBe(-4_000);
  });

  /* ⚠️ THE PROFIT ENDS UP IN RESERVES AS A CREDIT, which is what a profit is on
     a balance sheet: the business is worth more by what it earned. */
  it("moves the profit to reserves", () => {
    const lines = closingLines([income, cost], "reserves");
    expect(lines.find((l) => l.account === "reserves")?.amount).toBe(-6_000);
  });

  it("moves a loss the other way", () => {
    const lines = closingLines(
      [{ account: "sales", root: "income" as const, amount: -1_000 },
        { account: "rent", root: "expense" as const, amount: 4_000 }], "reserves");
    expect(lines.find((l) => l.account === "reserves")?.amount).toBe(3_000);
  });

  /*
    ⚠️ IT BALANCES BY CONSTRUCTION RATHER THAN BY A CHECK. Each account is
    reversed by its own amount and the total goes to reserves, so the entry sums
    to zero however many accounts there are and whatever they hold.
  */
  it("always sums to nothing", () => {
    for (const set of [[income, cost], [income], [cost], [income, cost, bank]]) {
      const lines = closingLines(set, "reserves");
      expect(lines.reduce((sum, one) => sum + one.amount, 0)).toBe(0);
    }
  });

  /* ⚠️ A YEAR WITH NOTHING IN IT POSTS NOTHING — and still closes, because a
     business that traded in none of a year has to be able to finish it. */
  it("posts nothing where nothing happened", () => {
    expect(closingLines([], "reserves")).toEqual([]);
    expect(closingLines([bank], "reserves")).toEqual([]);
    expect(closingLines([{ ...income, amount: 0 }], "reserves")).toEqual([]);
  });
});
