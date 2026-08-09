/**
 * Scena's eligibility rule, on `@4dl/auth`'s OTP-send policy.
 *
 * ── Why this file exists at all ─────────────────────────────────────────────
 *
 * `POST /api/auth/email-otp/send-verification-otp` is the only way a PERSON
 * signs in here, and until this landed it was mounted bare: Better Auth's
 * handler, straight through. The shared guard had been written, tested and
 * shipped in `@4dl/auth` the whole time; this app simply did not mount it. See
 * `docs/PLATFORM-AUDIT.md` — it is the sharpest instance of the pattern that
 * document is about.
 *
 * The shared guard owns the order: human check → a 30-second per-address
 * cooldown → a per-source hourly ceiling → ELIGIBILITY (below) → the
 * deliverability pre-flight → forward to Better Auth's own handler.
 *
 * Two of those are worth naming, because `createAuth`'s own per-address hourly
 * cap is what made this look covered and it is not the same thing:
 *
 *   THE PER-IP CEILING. A per-address cap only slows an attacker who reuses one
 *   address. The actual attack is rotating them, and nothing but a per-source
 *   ceiling can see that.
 *
 *   THE DELIVERABILITY PRE-FLIGHT. Better Auth runs `sendVerificationOTP`
 *   through a wrapper that catches and merely logs, then answers
 *   `200 {"success":true}` regardless — so on a deployment with no mail provider
 *   the sign-in screen advances to "enter your code" forever, for a code that was
 *   never sent, and nobody including the operator can get in. That is the
 *   bootstrap trap `apps/scena/DEPLOY.md` is written around.
 *
 * ── What is Scena's: who may receive a code at this door ────────────────────
 *
 * Everybody who signs in with a code works at the workspace, and they arrive by
 * INVITATION — there is no self-registration lane. So an address is eligible at
 * a workspace's door if it already has an account, or if it holds a pending
 * invitation to THAT workspace.
 *
 * ⚠️ STATIONS ARE NOT AFFECTED, and that is the reason to say so here. A board's
 * counter tablet signs in with a Better Auth CREDENTIAL account
 * (`board-users.ts`), not an emailed code, so it never reaches this path — and a
 * venue whose front desk could not sign in because a code was refused would be
 * a very quiet way to break the product on its busiest surface.
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
 * Is there a live invitation to THIS workspace for this address?
 *
 * The invitee has no account yet — that is what an invitation is for — so
 * without this branch the accept link lands on a sign-in they are refused, and
 * the workspace can never add anybody. `status = 'pending'` and an unexpired
 * `expiresAt` are both required: revoking an invitation is how a mistyped
 * address is undone, and a revoked one must close the door again.
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
   * workspace's OWN domain is a different registrable domain covered by nothing.
   * Demanding a token there would not be a bot check — it would be a workspace
   * that can admit nobody at the address it advertises. `@4dl/auth`'s
   * turnstile.ts has the whole argument for why standing down on an uncovered
   * host is sound rather than a hole.
   *
   * It is the root this host was CLASSIFIED against, not the configured one:
   * loopback always classifies against `localhost` whatever `ROOT_DOMAIN` holds,
   * so reading the config here would mark every `*.localhost` host uncovered and
   * stand the check down across dev and the whole suite.
   */
  humanCheck: async (c, token, ip) => {
    const host = hostnameOf(c.req.url);
    return (await verifyTurnstile(c.env, token, ip, host, { rootDomain: shapeOf(host, c.env).root })).ok;
  },

  /**
   * The host decides which workspace this sign-in is for.
   *
   * The hosts with no tenant behave differently, deliberately:
   *
   *  • `setup.` — no workspace yet, so there is nothing to check and anyone may
   *    request a code. That is how a new owner gets in; closing it would make
   *    the product impossible to start.
   *  • the root — a signpost, not an app. There is no workspace to sign in TO,
   *    so a code from here has no destination.
   *
   * The DEVICE door (`play.`) never reaches this either: a screen pairs with a
   * claim code and resolves its tenant from that, not from a session.
   */
  eligibility: async (c, email): Promise<EligibilityVerdict> => {
    const tenant = c.get("hostTenant");
    if (!tenant) {
      if (c.get("host").shape.role === "root") {
        return { ok: false, status: 400, body: { error: "wrong_door", detail: "Sign in at your workspace's own address." } };
      }
      return { ok: true };
    }
    if (await hasAccount(c.env.DB, email)) return { ok: true };
    if (await hasPendingInvite(c.env.DB, tenant.tenantId, email)) return { ok: true };
    /*
      NEUTRAL BY CONSTRUCTION. The body says "invite only" and never whether the
      address is known — the two answers together would turn this endpoint into
      an oracle for who works at a given workspace. The `logEvent` is what an
      operator reads instead.
    */
    return { ok: false, status: 403, body: { error: "invite_only" }, logEvent: "otp-signup-blocked" };
  },

  deliverable: async (c) => {
    const r = await emailDeliverable(c.env, c.env.EMAIL, isDevLane(c.env, c.req.header("origin") ?? ""));
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  },

  forward: (c, body) => c.get("auth").handler(forwardJson(c as never, body)),
}) as unknown as MiddlewareHandler<AppEnv>;
