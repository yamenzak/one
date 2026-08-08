/**
 * Tessa's eligibility rule, on `@4dl/auth`'s OTP-send policy.
 *
 * ── Why this file exists at all ─────────────────────────────────────────────
 *
 * `POST /api/auth/email-otp/send-verification-otp` is the ONLY way anybody signs
 * in here — there is no password provider — and until this landed it was mounted
 * bare: Better Auth's handler, straight through. The shared guard was written,
 * tested and shipped in `@4dl/auth`, and this app simply did not mount it. That
 * is the class of gap `docs/PLATFORM-AUDIT.md` is about, and this is the sharpest
 * instance of it.
 *
 * What the shared guard owns, in order: the human check → a 30-second
 * per-address cooldown → a per-source hourly ceiling → ELIGIBILITY (below) → the
 * deliverability pre-flight → forward to Better Auth's own handler.
 *
 * Two of those matter more than they look:
 *
 *   THE PER-IP CEILING. `createAuth` already caps codes per ADDRESS per hour,
 *   which is what makes this look covered. It is not: the attack is rotating
 *   addresses, and only a per-source ceiling sees that.
 *
 *   THE DELIVERABILITY PRE-FLIGHT. Better Auth runs `sendVerificationOTP`
 *   through a wrapper that catches and merely logs, then answers
 *   `200 {"success":true}` regardless. So on a deployment with no mail provider
 *   the sign-in screen advances to "enter your code" forever, for a code that was
 *   never sent, and nobody — the operator included — can get in. That is the
 *   bootstrap trap DEPLOY.md §6 is written around, and Kova has been protected
 *   from it by a 503 with a reason while Tessa was not.
 *
 * ── What is Tessa's: who may receive a code at this door ────────────────────
 *
 * A CSSD has no customer role. Everybody who signs in works at the centre, and
 * they arrive by INVITATION — there is no self-registration lane anywhere in the
 * product. So the rule is narrower than Kova's and does not need a capacity
 * reservation: an address is eligible at a centre's door if it already has an
 * account, or if it holds a pending invitation to THAT centre.
 */

import type { MiddlewareHandler } from "hono";
import { forwardJson, otpSendGuard as buildOtpGuard, verifyTurnstile, type EligibilityVerdict } from "@4dl/auth";
import { emailDeliverable } from "@4dl/email";
import { hostnameOf, shapeOf } from "./host-context.js";
import type { AppEnv } from "./auth-context.js";
import type { Auth } from "./auth.js";
import type { Branding } from "./host-context.js";
import type { Env } from "./env.js";

/** The dev lane, derived exactly as `createAuth` does — a localhost origin cannot
 *  reach a deployed worker through Cloudflare's edge, so this stays closed in
 *  production. */
function isDevLane(env: Env, origin: string): boolean {
  return env.ENVIRONMENT === "development" || /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin);
}

/** Does this address already have an account anywhere on the deployment? */
async function hasAccount(db: D1Database, email: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS x FROM "user" WHERE LOWER(email) = ?')
    .bind(email)
    .first<{ x: number }>()
    .catch(() => null);
  return Boolean(row);
}

/**
 * Is there a live invitation to THIS centre for this address?
 *
 * The invitee has no account yet — that is the whole point of an invitation — so
 * without this branch the accept link would land on a sign-in they are refused,
 * which is a centre unable to add anybody. `status = 'pending'` and an unexpired
 * `expiresAt` are both required: a revoked or lapsed invitation must not keep the
 * door open, since revoking one is how a mistyped address is undone.
 */
async function hasPendingInvite(db: D1Database, tenantId: string, email: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS x FROM "invitation"
       WHERE organizationId = ? AND LOWER(email) = ? AND status = 'pending'
         AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)`,
    )
    .bind(tenantId, email)
    .first<{ x: number }>()
    .catch(() => null);
  return Boolean(row);
}

export const otpSendGuard: MiddlewareHandler<AppEnv> = buildOtpGuard<Env, Auth, Branding>({
  db: (env) => env.DB,

  /**
   * `rootDomain` is the widget's assumed coverage when nobody has listed it.
   *
   * A Turnstile widget only renders on hostnames it was registered for, and a
   * centre's OWN domain is a different registrable domain covered by nothing. So
   * demanding a token there would not be a bot check — it would be a centre that
   * can admit nobody at the address it advertises. See `@4dl/auth`'s turnstile.ts
   * for why standing down on an uncovered host is sound rather than a hole.
   *
   * It is the root this host was CLASSIFIED against rather than the configured
   * one, because loopback is always classified against `localhost` whatever
   * `ROOT_DOMAIN` holds — reading the config here would mark every `*.localhost`
   * host uncovered and stand the check down across dev and the whole suite.
   */
  humanCheck: async (c, token, ip) => {
    const host = hostnameOf(c.req.url);
    return (await verifyTurnstile(c.env, token, ip, host, { rootDomain: shapeOf(host, c.env).root })).ok;
  },

  /**
   * The host decides which centre this sign-in is for.
   *
   * The two hosts with no tenant behave differently, and both deliberately:
   *
   *  • `setup.` — no centre yet, so there is nothing to check and anyone may
   *    request a code. That is how a new owner gets in, and closing it would
   *    make the product impossible to start.
   *  • the root — a signpost, not an app. There is no centre to sign in TO, so a
   *    code from here has no destination; say so instead of quietly admitting
   *    somebody somewhere generic.
   */
  eligibility: async (c, email): Promise<EligibilityVerdict> => {
    const tenant = c.get("hostTenant");
    if (!tenant) {
      if (c.get("host").shape.role === "root") {
        return { ok: false, status: 400, body: { error: "wrong_door", detail: "Sign in at your centre's own address." } };
      }
      return { ok: true };
    }
    if (await hasAccount(c.env.DB, email)) return { ok: true };
    if (await hasPendingInvite(c.env.DB, tenant.tenantId, email)) return { ok: true };
    /*
      NEUTRAL BY CONSTRUCTION. The body says "invite only" and never whether the
      address is known, because the two answers together would make this endpoint
      an oracle for who works at a centre — which in a hospital is not a trivial
      thing to leak. The `logEvent` is what an operator reads instead.
    */
    return { ok: false, status: 403, body: { error: "invite_only" }, logEvent: "otp-signup-blocked" };
  },

  deliverable: async (c) => {
    const r = await emailDeliverable(c.env, c.env.EMAIL, isDevLane(c.env, c.req.header("origin") ?? ""));
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  },

  forward: (c, body) => c.get("auth").handler(forwardJson(c as never, body)),
}) as unknown as MiddlewareHandler<AppEnv>;
