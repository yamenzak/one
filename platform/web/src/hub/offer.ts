/**
 * WHAT A THING COSTS, AND WHAT IT INCLUDES — declared once for every screen that
 * shows either.
 *
 * ⚠️ IT IS ITS OWN MODULE BECAUSE THREE SCREENS NEED IT AND ONE OF THEM IS
 * DOWNSTREAM OF ANOTHER. The shelf sells plans, credits sells packs, and a
 * subscription screen shows the plan somebody is on — so the marketplace imports
 * the subscription screen's own vocabulary, and if the money formatter lived
 * there too the two files would import each other. A cycle in ESM does not fail;
 * it resolves one of the two to `undefined` at module-evaluation time, on
 * whichever side happens to load first, which is a blank price on a storefront
 * and nothing anywhere saying why.
 *
 * ⚠️ AND MINOR UNITS ARE FORMATTED IN EXACTLY ONE PLACE. A price divided by a
 * hundred at each render site is a price that is wrong in one of them — and it is
 * always the one nobody looks at, which on a storefront is the one that took the
 * money.
 */

/** One line on a plan card, from the same declarations the gate enforces. */
export interface Included {
  readonly key: string;
  readonly label: string;
  readonly value: number | boolean;
  readonly unlimited: boolean;
}

export interface Money {
  readonly minor: number;
  readonly currency: string;
}

export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly price: Money;
  readonly period: "month" | "year";
  readonly trialDays: number;
  readonly includes: readonly Included[];
}

/** ⚠️ The recurrence is part of a price, so it is part of the one formatter. */
export const priceOf = (price: Money, period: "month" | "year"): string => {
  const amount = (price.minor / 100).toFixed(price.minor % 100 === 0 ? 0 : 2);
  const symbol = price.currency === "usd" ? "$" : price.currency === "gbp" ? "£" : price.currency === "eur" ? "€" : "";
  return `${symbol}${amount}${symbol ? "" : ` ${price.currency.toUpperCase()}`} a ${period}`;
};

/** ⚠️ A pack is a one-off, so it has no period — the same formatter with the
 *  recurrence taken off, rather than a second way of writing money. */
export const money = (price: Money): string => priceOf(price, "month").replace(/ a month$/, "");

/**
 * ⚠️ A DATE SOMEBODY READS, IN THEIR OWN LOCALE, AND WRITTEN ONCE. Four screens
 * print a day — a trial's end, an expiry, a rung of the ladder, a ledger row —
 * and four copies of the same options object is four places for one of them to
 * start saying "Sep 1" while the others say "1 September".
 */
export const dayOf = (at: string): string =>
  new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "long" });
