// @ts-check
/** Locale-code → catalog registry. Adding a market = one import + one entry
 *  here (plus the matching entry in ../config.mjs). */
import en from "./en.mjs";
import de from "./de.mjs";
import ar from "./ar.mjs";

/** @type {Record<string, import("./types.mjs").Messages>} */
export const catalogs = { en, de, ar };
