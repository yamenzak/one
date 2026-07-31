/**
 * Kova's binding of `@4dl/email` (SPEC §3).
 *
 * The mailer, the MIME builder and the HTML component kit are the platform's —
 * nothing about a base64 body or a progress ring is coaching-specific. Two things
 * ARE Kova's, and both are bound once here, at module load:
 *
 *   the BRAND    the identity Kova's OWN mail wears — sign-in codes, receipts,
 *                dunning. Distinct from a tenant's brand on purpose: those
 *                messages come from us, and wearing a studio's colours on a
 *                "your subscription lapsed" notice would be a small lie.
 *   the SENDER   the address that mail goes out as by default. The package's own
 *                fallback is deliberately an address that cannot send, so a fresh
 *                deploy fails loudly rather than bouncing silently.
 *
 * Every existing call site imports this module, unchanged — it re-exports the
 * package whole, so `emailShell`/`emailButton`/`sendEmail` resolve exactly as
 * they did when this file held them.
 */

import { configureEmailBrand, type BrandKit } from "@4dl/email";

export * from "@4dl/email";

/** Kova's own identity — platform emails (sign-in codes, receipts). */
export const KOVA_BRAND: BrandKit = { name: "Kova", accent: "#a8c7fa", accentFg: "#0b1220", logoUrl: null };

/**
 * The PLATFORM sender — the address Kova's own mail (and any tenant on the
 * platform lane) goes out as. One constant because three call sites used to
 * inline it and drifted at the rename, so `GET /admin/email` could report one
 * default while the send path used another.
 *
 * Only the default. A stored `email.platform_from` always wins, and the address
 * must be onboarded + verified under Cloudflare → Email → Email Sending before
 * anything actually delivers.
 *
 * ⚠️ This SHADOWS `@4dl/email`'s `PLATFORM_FROM_DEFAULT` (`noreply@invalid.local`)
 * for importers of this module — an explicit re-declaration after the star
 * export, which is what makes it win. The package's value stays the unbranded
 * fail-loud one for an app that never calls `configureEmailBrand`.
 */
export const PLATFORM_FROM_DEFAULT = "Kova <noreply@kova.4dl.app>";

configureEmailBrand(KOVA_BRAND, PLATFORM_FROM_DEFAULT);
