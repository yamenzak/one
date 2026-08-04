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

/**
 * Kova's own identity — platform emails (sign-in codes, receipts, dunning).
 *
 * ⚠️ `iconUrl`/`siteUrl` are ABSOLUTE and hardcoded, and both have to be: a mail
 * client fetches an image over the open internet with no session and no notion
 * of our origin, and this constant is bound at module load where there is no
 * `env` to read `BETTER_AUTH_URL` from. `apps/api/test/email-brand.test.ts`
 * asserts the origin still matches `wrangler.jsonc`, because the failure mode is
 * a broken image in every platform email and nothing that says so.
 *
 * The icon is the PWA icon the SPA already ships — served by the assets binding
 * before a request ever reaches the worker, so it is public by construction and
 * there is no second asset to keep in step with the one on people's home screens.
 */
export const KOVA_BRAND: BrandKit = {
  name: "Kova",
  accent: "#a8c7fa",
  accentFg: "#0b1220",
  logoUrl: null,
  iconUrl: "https://kova.4dl.app/icon-192.png",
  siteUrl: "https://kova.4dl.app",
};

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
 * ⚠️ The ADDRESS is the platform's shared one, and this used to read
 * `noreply@kova.4dl.app` — a per-app address that looks right and is not
 * onboarded, because onboarding is per DOMAIN and a subdomain is a different
 * domain to Cloudflare. The failure that buys is uniquely quiet: sign-in codes
 * use `email.from` (correctly seeded to the shared address) and deliver, so
 * email looks configured, while every message on the TENANT lane — the client
 * invite, above all — is refused at the provider. `apps.json` owns this
 * address (`defaultEmailAddress`), provisioning seeds it, and
 * `scripts/sender-default.test.mjs` fails if a hardcoded default drifts from it
 * again.
 *
 * ⚠️ This SHADOWS `@4dl/email`'s `PLATFORM_FROM_DEFAULT` (`noreply@invalid.local`)
 * for importers of this module — an explicit re-declaration after the star
 * export, which is what makes it win. The package's value stays the unbranded
 * fail-loud one for an app that never calls `configureEmailBrand`.
 */
export const PLATFORM_FROM_DEFAULT = "Kova <noreply@4dl.app>";

configureEmailBrand(KOVA_BRAND, PLATFORM_FROM_DEFAULT);
