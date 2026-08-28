/**
 * EVERY CURRENCY A WORKSPACE COULD BE IN, BY CODE ONLY.
 *
 * ⚠️ THE CODES ARE THE KERNEL'S AND THE NAMES ARE THE BROWSER'S — the same split
 * `countries.ts` draws, for the same reason. `Intl.DisplayNames` already holds
 * every currency's name in every language a device is set to, so shipping our
 * own table would be shipping a worse one that is also English-only.
 *
 * ⚠️ AND THE LIST IS DERIVED FROM `currencyFor`'S OWN TABLE, so the set this
 * screen offers is exactly the set founding can produce. A curated "major
 * currencies" list omits somebody — and the business it omits is the one that
 * cannot answer the question at all.
 */

import { CURRENCIES } from "@engine/kernel";

/**
 * ⚠️ FALLS BACK TO THE CODE, NEVER TO NOTHING. A runtime without the display
 * data would otherwise render a list of blanks somebody has to guess at — and
 * the code alone is already the thing an accountant reads.
 */
export function moneyName(code: string): string {
  try {
    const names = new Intl.DisplayNames(undefined, { type: "currency" });
    const said = names.of(code);
    return said && said !== code ? said : code;
  } catch {
    return code;
  }
}

/**
 * ⚠️ THE CODE LEADS, BECAUSE THAT IS WHAT SOMEBODY IS LOOKING FOR. "British
 * Pound" is how a currency is described; "GBP" is what is written on the
 * invoice, and a list sorted by name puts the dollar under U.
 */
export const money = (): readonly { readonly code: string; readonly label: string }[] =>
  CURRENCIES.map((code) => {
    const name = moneyName(code);
    return { code, label: name === code ? code : `${code} — ${name}` };
  });
