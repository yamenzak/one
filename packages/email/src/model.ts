/**
 * The ISOMORPHIC surface: the HTML component kit and the escaping helpers.
 *
 * A preview screen renders the same markup a mail client will, so the builders
 * are pure and browser-safe. The senders are not.
 */
export {
  emailBar, emailBars, emailButton, emailDivider, emailKicker, emailListRow,
  emailPanel, emailRing, emailShell, emailSparkline, emailStatRow, escapeHtml,
  safeColor, EMAIL_TONE, DEFAULT_PLATFORM_BRAND,
  type BrandKit, type EmailStat, type EmailTone,
} from "./mailer.js";
