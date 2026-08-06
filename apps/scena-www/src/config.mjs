// @ts-check
/**
 * Site-wide constants for the Scena marketing site. Everything that would change
 * per environment (the public origin) or per market (the locale registry) lives
 * here so the generator, sitemap, hreflang, and JSON-LD all read one source.
 */

/** Absolute production origin — no trailing slash. Baked into canonical URLs,
 *  hreflang alternates, the sitemap, and Open Graph tags. Change in one place. */
export const SITE_URL = "https://scena.fourdegreelabs.com";

/** Where the dashboard app lives (the "Start free / Sign in" targets). */
export const APP_URL = "https://scena.4dl.app";

/**
 * @typedef {Object} Locale
 * @property {string} code      BCP-47 code used in the URL and <html lang>.
 * @property {"ltr"|"rtl"} dir   Text direction.
 * @property {string} name      Endonym, shown in the language switcher.
 * @property {string} ogLocale  Open Graph locale (xx_XX).
 * @property {boolean} [root]    True for the default locale served at "/".
 */

/**
 * The locales we ship. The `root` locale is served at "/"; every other locale
 * lives under "/<code>/". Adding a market is a one-line entry here plus a
 * matching catalog in ./i18n — the generator, sitemap and hreflang pick it up.
 * @type {Locale[]}
 */
export const LOCALES = [
  { code: "en", dir: "ltr", name: "English", ogLocale: "en_US", root: true },
  { code: "de", dir: "ltr", name: "Deutsch", ogLocale: "de_DE" },
  { code: "ar", dir: "rtl", name: "العربية", ogLocale: "ar_AR" },
];

export const DEFAULT_LOCALE = /** @type {Locale} */ (LOCALES.find((l) => l.root) ?? LOCALES[0]);

/** Path prefix for a locale: "" for the root locale, "/de" otherwise. */
export function localePrefix(/** @type {Locale} */ l) {
  return l.root ? "" : `/${l.code}`;
}

/** Absolute canonical URL for a locale's landing page. */
export function localeUrl(/** @type {Locale} */ l) {
  return `${SITE_URL}${localePrefix(l)}/`;
}
