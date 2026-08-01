/**
 * THE PLATFORM'S OWN IDENTITY on mail it sends — sign-in codes, receipts,
 * dunning.
 *
 * Distinct from a TENANT's brand on purpose: those messages come from the
 * platform, and wearing a tenant's colours on a "your subscription lapsed"
 * notice would be a small lie.
 *
 * ⚠️ `@4dl/email`'s own fallback sender is `noreply@invalid.local` — an address
 * that CANNOT send. That is deliberate: a plausible-looking default would let a
 * fresh deploy appear to work while every message bounced at the provider. Set a
 * real one below AND onboard it under Cloudflare → Email → Email Sending, or
 * store `email.platform_from` in config (which always wins).
 */

import { configureEmailBrand, type BrandKit } from "@4dl/email";

export * from "@4dl/email";

/**
 * The accent is Tessa's `--primary` (`oklch(0.74 0.15 164)`) resolved to hex,
 * and the foreground is its paired `--primary-foreground`. Email cannot read a
 * CSS custom property — a mail client sees only what the MIME body contains —
 * so the value is duplicated here deliberately. Change one, change both.
 */
export const APP_BRAND: BrandKit = { name: "Tessa", accent: "#25c891", accentFg: "#03130c", logoUrl: null };

/**
 * Shadows the package's `PLATFORM_FROM_DEFAULT` for importers of this module.
 *
 * ONE address for the whole platform (`apps.json`'s `defaultEmailAddress`), with
 * a per-app display name — so a new app inherits a sender that is already
 * onboarded under Cloudflare → Email → Email Sending rather than a plausible
 * one that bounces. A stored `email.platform_from` still wins; provisioning
 * seeds exactly this string.
 */
export const PLATFORM_FROM_DEFAULT = "Tessa <noreply@4dl.app>";

configureEmailBrand(APP_BRAND, PLATFORM_FROM_DEFAULT);
