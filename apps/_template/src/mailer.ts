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

export const APP_BRAND: BrandKit = { name: "Template", accent: "#a8c7fa", accentFg: "#0b1220", logoUrl: null };

/** Shadows the package's `PLATFORM_FROM_DEFAULT` for importers of this module. */
export const PLATFORM_FROM_DEFAULT = "Template <noreply@4dl.app>";

configureEmailBrand(APP_BRAND, PLATFORM_FROM_DEFAULT);
