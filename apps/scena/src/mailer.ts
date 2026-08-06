/**
 * Scena's binding of `@4dl/email`.
 *
 * ── The Cloudflare send path was BROKEN, and this is what fixes it ──────────
 *
 * Scena's own mailer called the Email Sending binding like this:
 *
 *     email.send({ to, from, subject, html, text })
 *
 * That is not what the binding takes. `send()` wants a `cloudflare:email`
 * `EmailMessage` carrying a raw RFC 5322 body, so every call threw
 * `could not parse email: Cannot read properties of undefined (reading 'value')`
 * — and `email.provider` defaults to `cloudflare` in `billing-seed.ts`, so on a
 * correctly-configured production deployment **nothing was ever delivered**.
 * Not the billing notices, not the suspension warning, not the factory-reset
 * confirmation code. `@4dl/email` builds real MIME (multipart when both bodies
 * are present, base64 so a long HTML line survives transport) and sends that.
 *
 * ── Two fail-OPEN paths went with it ───────────────────────────────────────
 *
 *   • **A missing binding degraded to the mock**, in every environment:
 *     `if (!email) { console.info(…); return { ok: true, mocked: true } }`. On a
 *     deploy where the binding was absent, every send reported success and
 *     delivered nothing.
 *   • **`mock` itself reported success in production.** The shared mailer fails
 *     CLOSED outside development, for the reason its own comment gives: the mock
 *     writes the message body — including sign-in codes — to retained Workers
 *     logs, and a deployment left on it must be told, not humoured.
 *
 * ── What was dropped ───────────────────────────────────────────────────────
 *
 * The `resend` provider and `email.api_key`. The platform sends from ONE
 * address (`noreply@4dl.app`) through Cloudflare Email Sending, onboarded once
 * per zone by hand — which is the entire reason the address is shared rather
 * than per-app. A second provider lane with its own key was a path nothing
 * used and nobody would have noticed rotting.
 */

import {
  configureEmailBrand,
  emailShell as sharedShell,
  sendEmail as sharedSend,
  type BrandKit,
  type SendResult,
} from "@4dl/email";
import { PLATFORM_FROM_DEFAULT } from "./billing-seed.js";
import type { Env, SendEmailBinding } from "./env.js";

/** Re-exported so readers find it where every other app keeps it. It is DEFINED
 *  in `billing-seed.ts`, which is a leaf — see the note there for the cycle. */
export { PLATFORM_FROM_DEFAULT } from "./billing-seed.js";
export type { SendResult };

/**
 * Scena's mark, in the one place an email can carry it.
 *
 * The accent is the same violet the app's tokens use. Bound once at module load
 * rather than passed per send, because a brand handed to some call sites and not
 * others is how two products' emails come to look like three.
 */
const SCENA_BRAND: BrandKit = { name: "Scena", accent: "#8b5cf6", accentFg: "#0b1220", logoUrl: null };
configureEmailBrand(SCENA_BRAND, PLATFORM_FROM_DEFAULT);

/**
 * Whether the dev lane is open.
 *
 * The mock provider logs the whole message body, sign-in codes included, so it
 * may only "succeed" in development — the same rule and the same reason as the
 * AI mock lane (`ai.ts`). Derived from `ENVIRONMENT`, never hardcoded.
 */
const isDev = (env: Env): boolean => env.ENVIRONMENT === "development";

/**
 * Send an email. Never throws — delivery is best-effort so it cannot break the
 * flow that triggered it (an alert, a webhook, an OTP, a sweep) — but it now
 * REPORTS a failure honestly instead of returning `{ok: true}` for a message
 * that went nowhere.
 *
 * Takes the whole `env`, not just `env.DB`: `email.provider` is on the shared
 * platform-config allow-list, and a bare `D1Database` cannot see the shared
 * store. An operator who set the provider once for the platform and cleared this
 * app's own row — which the console offers as "Use shared" — would otherwise
 * fall through to the `mock` default while every screen reported a provider.
 */
export async function sendEmail(
  env: Env,
  msg: { to: string; subject: string; html: string; text?: string },
  binding?: SendEmailBinding,
): Promise<SendResult> {
  if (!msg.to) return { ok: false, error: "no recipient" };
  return sharedSend(env, msg, binding ?? env.EMAIL, undefined, isDev(env));
}

/*
  `notifyAdmin` IS GONE, and it was not just unused — it was the wrong shape.

  It sent to `email.admin` or `OPERATOR_EMAIL`: ONE address for the whole
  deployment. Every caller was a message about ONE workspace — a suspension
  warning, a credit-pack receipt, a failed payment — so every studio's billing
  mail went to whoever runs the platform, and to nobody who could act on it.
  Those four call sites now go through `notify.ts`, which resolves the actual
  owners of the workspace in question.

  `email.admin` survives for the one thing it was ever right for: the operator
  console's "send a test email" button, which is genuinely addressed to the
  operator. Leaving the helper behind would have been an invitation to
  reintroduce the bug.
*/

/**
 * A branded HTML wrapper for a transactional email.
 *
 * Signature-compatible with the one this replaces, so every call site is
 * unchanged — but it is now `@4dl/email`'s shell, which means Scena's mail picks
 * up the dark-first surface language, the preheader line, the escape helpers and
 * the component kit (`emailButton`, `emailPanel`, `emailStatRow`) the other apps
 * already use.
 */
export function emailShell(heading: string, bodyHtml: string, opts: Parameters<typeof sharedShell>[2] = {}): string {
  return sharedShell(heading, bodyHtml, { brand: SCENA_BRAND, ...opts });
}

export { emailButton, emailDivider, emailKicker, emailListRow, emailPanel, emailStatRow, escapeHtml } from "@4dl/email";
