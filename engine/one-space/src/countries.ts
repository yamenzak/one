/**
 * EVERY COUNTRY, BY CODE ONLY.
 *
 * ⚠️ THE CODES ARE THE DATA AND THE NAMES ARE THE BROWSER'S. `Intl.DisplayNames`
 * already holds every country's name in every language a device is set to, so
 * shipping our own table would be shipping a worse one that is also English-only
 * — and it would go stale the next time a country is renamed.
 *
 * ⚠️ AND THE LIST IS COMPLETE ON PURPOSE. A curated set — "the ones our
 * customers are in" — is a business somebody cannot sign up, discovered by them
 * rather than by us. The residency rule reads this to decide where records go
 * (`residencyFor`), so a missing entry is also a placement nobody chose.
 */

export const COUNTRIES: readonly string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
];

/**
 * ⚠️ FALLS BACK TO THE CODE, NEVER TO NOTHING. A runtime without the display
 * data would otherwise render a list of blanks somebody has to guess at.
 */
export function nameOf(code: string): string {
  try {
    const names = new Intl.DisplayNames(undefined, { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Sorted the way the reader's language sorts, which is not code order. */
export const byName = (): readonly { readonly code: string; readonly name: string }[] =>
  COUNTRIES.map((code) => ({ code, name: nameOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
