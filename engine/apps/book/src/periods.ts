/**
 * THE YEAR THE BOOKS ARE KEPT IN, AND THE MONTHS SOMEBODY HAS FINISHED WITH.
 *
 * ⚠️ A LEDGER WITHOUT PERIODS IS A LEDGER NOBODY CAN FINISH. Every set of books
 * is closed off at some point — an accountant works through a month, agrees it
 * with the bank, files something, and from then on that month must not move.
 * Without a way to say so, a correction typed in April silently changes a figure
 * already submitted in March, and the two disagree for ever with nothing
 * anywhere recording which was right.
 *
 * ⚠️ AND THE FISCAL YEAR IS NOT JANUARY TO DECEMBER. The United Kingdom's
 * companies commonly run to March or April, Australia's to June, Japan's to
 * March, and a business may pick its own. Hard-coding the calendar year would
 * make the profit-and-loss wrong for most of the world by exactly the amount
 * that fell on the wrong side of a date.
 *
 * ⚠️ DAYS ARE `YYYY-MM-DD` AND COMPARED AS STRINGS, which is the whole reason
 * that format is used everywhere in this repository: ISO dates sort
 * lexicographically, so a range test is two comparisons and no parsing, and a
 * timezone can never enter into it.
 *
 * Pure. No database, no I/O.
 */

import type { Day, Instant } from "@engine/kernel";
import { dayOf, dayPlus, daysBetween } from "@engine/kernel";

import type { Line } from "./posting.js";
import type { Root } from "./roles.js";

/* ------------------------------------------------------------------ shape --- */

/**
 * A FISCAL YEAR.
 *
 * ⚠️ `closes` IS THE LAST DAY INSIDE IT, NOT THE FIRST DAY AFTER. Half-open
 * ranges are correct for instants and wrong for days: a person setting up their
 * books types the last day of their year, which is what appears on every
 * statement they have ever filed, and asking them for the day after it is asking
 * them to translate.
 */
export interface Year {
  readonly id: string;
  readonly opens: string;
  readonly closes: string;
  /** ⚠️ Closed means the profit was moved to reserves and nothing new may land. */
  readonly closed: boolean;
}

/**
 * A PERIOD INSIDE A YEAR — usually a month, sometimes a quarter.
 *
 * ⚠️ OPTIONAL, AND THAT IS THE POINT. A business whose accountant does the books
 * once a year never makes one; a business closing every month makes twelve.
 * Requiring them would put eleven rows of ceremony in front of somebody who
 * wanted to record a sale.
 */
export interface Period {
  readonly id: string;
  readonly year: string;
  readonly name: string;
  readonly opens: string;
  readonly closes: string;
  readonly shut: boolean;
}

/* ---------------------------------------------------------- may it post? --- */

export type PostRefusal =
  | { readonly why: "no_year"; readonly day: string }
  | { readonly why: "year_closed"; readonly year: string }
  | { readonly why: "period_shut"; readonly period: string; readonly name: string };

const inside = (day: string, from: string, to: string): boolean =>
  day >= from && day <= to;

/**
 * WHETHER AN ENTRY DATED THIS DAY MAY BE WRITTEN.
 *
 * ⚠️ ONE FUNCTION, ASKED BY THE ONE WRITER. A hand-typed entry and one an event
 * raised go through the same door (`writeEntry`), so the question is asked once
 * — and a second place asking it is a second place to get "closed" slightly
 * wrong, with the automatic path being the one that quietly keeps posting into
 * a month somebody already filed.
 *
 * ⚠️ NO YEAR AT ALL IS A REFUSAL, NOT A PASS. Treating "outside every declared
 * year" as permission would make the check useless in exactly the case it exists
 * for: a mistyped date lands in 2062, in no year, and posts happily — into a
 * profit-and-loss no report will ever show it in, because every report is bounded
 * by a year.
 */
export function refusePostingOn(
  day: string, years: readonly Year[], periods: readonly Period[],
): PostRefusal | null {
  const year = years.find((one) => inside(day, one.opens, one.closes));
  if (!year) return { why: "no_year", day };
  if (year.closed) return { why: "year_closed", year: year.id };

  const shut = periods.find(
    (one) => one.shut && one.year === year.id && inside(day, one.opens, one.closes));
  if (shut) return { why: "period_shut", period: shut.id, name: shut.name };
  return null;
}

/* -------------------------------------------------------- declaring them --- */

export type YearRefusal = "year_backwards" | "year_overlaps" | "year_too_long";

/**
 * ⚠️ TWENTY-FOUR MONTHS, WHICH IS LONGER THAN ANY REAL ONE AND SHORTER THAN A
 * TYPO. A first or a final year is legitimately short, and a transition year can
 * legitimately run to eighteen months where a business changes its year end —
 * so a strict twelve would refuse honest setups. What this catches is `2026` to
 * `2062`, which is a keystroke and would swallow every year after it.
 */
const LONGEST_DAYS = 731;

export function refuseYear(
  one: Pick<Year, "opens" | "closes">, others: readonly Year[],
): YearRefusal | null {
  if (one.closes < one.opens) return "year_backwards";
  /* ⚠️ THE KERNEL'S ARITHMETIC, NOT OURS — see `daysBetween` there. Two dates
     subtracted as instants are off by one twice a year, and a second
     implementation of a calendar is a second place to be off by that day. */
  if (daysBetween(one.opens as Day, one.closes as Day) > LONGEST_DAYS) {
    return "year_too_long";
  }
  /*
    ⚠️ OVERLAPPING YEARS IS THE ONE THAT CANNOT BE LEFT TO JUDGEMENT. A day in
    two years belongs to two profit-and-loss statements, so the same sale appears
    in both — and the pair of them reconcile perfectly against the ledger while
    disagreeing with each other. It is caught here because there is no figure
    downstream that looks wrong.
  */
  if (others.some((other) => one.opens <= other.closes && other.opens <= one.closes)) {
    return "year_overlaps";
  }
  return null;
}

export type PeriodRefusal =
  | "period_backwards" | "period_outside_its_year" | "period_overlaps";

export function refusePeriod(
  one: Pick<Period, "opens" | "closes">, year: Pick<Year, "opens" | "closes">,
  others: readonly Pick<Period, "opens" | "closes">[],
): PeriodRefusal | null {
  if (one.closes < one.opens) return "period_backwards";
  if (one.opens < year.opens || one.closes > year.closes) return "period_outside_its_year";
  if (others.some((other) => one.opens <= other.closes && other.opens <= one.closes)) {
    return "period_overlaps";
  }
  return null;
}

/* ------------------------------------------------------------- the months --- */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const lastOf = (year: number, month: number): string => {
  /* ⚠️ DAY ZERO OF THE NEXT MONTH IS THE LAST OF THIS ONE, which is the only
     leap-year arithmetic anybody should ever write by hand — and the cut from an
     instant to a day is `dayOf`'s rather than a `slice` here (D7). */
  const at = new Date(Date.UTC(year, month + 1, 0));
  return dayOf(at.toISOString() as Instant);
};

/**
 * THE MONTHS A YEAR IS MADE OF, OFFERED RATHER THAN IMPOSED.
 *
 * ⚠️ A WORKSPACE THAT CLOSES MONTHLY SHOULD NOT TYPE TWELVE DATE RANGES. Every
 * one of them is a chance to leave a gap — and a gap is a week that belongs to no
 * period, which is not refused by anything because a period is optional.
 *
 * ⚠️ AND IT IS NAMED BY THE MONTH IT MOSTLY IS. A fiscal year opening on the 6th
 * of April makes periods that straddle two calendar months; naming one "April
 * 2026" when it runs to the 5th of May is what a person calls it, and pretending
 * otherwise would produce "April–May 2026" twelve times.
 */
export function monthsIn(
  year: Pick<Year, "opens" | "closes">,
): readonly Pick<Period, "name" | "opens" | "closes">[] {
  const out: Pick<Period, "name" | "opens" | "closes">[] = [];
  let opens = year.opens;

  /* ⚠️ BOUNDED BY THE LONGEST YEAR, not by reaching the end. A range this walked
     to the day would be an unbounded loop over data somebody typed. */
  for (let n = 0; n < 25 && opens <= year.closes; n++) {
    const at = new Date(`${opens}T00:00:00Z`);
    const ends = lastOf(at.getUTCFullYear(), at.getUTCMonth());
    const closes = ends < year.closes ? ends : year.closes;
    out.push({
      name: `${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`,
      opens,
      closes,
    });
    opens = dayPlus(closes as Day, 1);
  }
  return out;
}

/* ----------------------------------------------------------- closing a year --- */

/** One account's balance over a year, and which side of the books it is on. */
export interface Standing {
  readonly account: string;
  readonly root: Root;
  /** ⚠️ Minor units, signed the way a posting is: debit positive. */
  readonly amount: number;
}

/**
 * WHAT CLOSING A YEAR POSTS.
 *
 * ⚠️ A YEAR THAT IS ONLY A FLAG IS NOT CLOSED, IT IS HIDDEN. The point of
 * closing is that the profit-and-loss starts again from nothing and what it
 * earned becomes part of what the business is worth — so income and expense are
 * emptied into reserves in one entry, and next year's first report opens at
 * zero. Without it every "this year" figure is really "since the books began",
 * and it is wrong by more every year.
 *
 * ⚠️ ONLY INCOME AND EXPENSE MOVE. An asset is still an asset on the first of
 * the new year; a debt is still owed. Sweeping those would empty the balance
 * sheet, which is the one mistake here that is instantly, catastrophically
 * visible — and is worth naming because the arithmetic looks identical.
 *
 * ⚠️ AND IT BALANCES BY CONSTRUCTION. Each account is reversed by its own
 * amount and the total goes to reserves, so the entry sums to zero however many
 * accounts there are and whatever they hold. Nothing here can produce an
 * unbalanced entry for `refuseEntry` to catch, which is the property worth
 * having rather than the check.
 */
export function closingLines(
  standings: readonly Standing[], retained: string, said = "Year end",
): readonly Line[] {
  const earned = standings.filter((one) => one.root === "income" || one.root === "expense");
  const lines: Line[] = earned
    .filter((one) => one.amount !== 0)
    .map((one) => ({ account: one.account, amount: -one.amount, memo: said }));

  if (!lines.length) return [];
  const total = earned.reduce((sum, one) => sum + one.amount, 0);
  /* ⚠️ THE OTHER SIDE OF EVERYTHING ABOVE, IN ONE LINE. Reserves take the
     opposite of the sum, which is what makes the entry balance without anybody
     adding it up. */
  lines.push({ account: retained, amount: total, memo: said });
  return lines;
}
