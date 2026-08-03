/**
 * Kova's eligibility rule, on `@4dl/auth`'s OTP-send policy.
 *
 * The shared guard owns the order and the throttles: human check → per-address
 * cooldown → per-source hourly ceiling → ELIGIBILITY → deliverability pre-flight
 * → forward to Better Auth's own handler. All of that is the same for every app,
 * and the deliverability pre-flight in particular is load-bearing (Better Auth
 * swallows a send failure and returns 200, so without it a mis-configured deploy
 * says "we sent you a code" forever and nobody can get in).
 *
 * What is Kova's is step 4, below: WHO may receive a code at this door.
 */

import type { MiddlewareHandler } from "hono";
import { forwardJson, otpSendGuard as buildOtpGuard, verifyTurnstile, type EligibilityVerdict } from "@4dl/auth";
import { withinQuota } from "./billing-store.js";
import { countClientSeats, PENDING_SIGNUP } from "./clients.js";
import { shapeOf, hostnameOf } from "./host-context.js";
import { newId, nowIso } from "./ids.js";
import { emailDeliverable } from "./mailer.js";
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

/**
 * How many UNCLAIMED self-signup reservations a studio may hold at once.
 *
 * The row is created at OTP-SEND — before anyone has proved they own the address
 * — and consumes an `activeClients` seat from that moment. Nothing reclaims them:
 * every person who asked for a code at a `selfRegister` studio and never finished
 * holds capacity indefinitely, and the owner's only recovery is deleting each row
 * by hand.
 *
 * At worst that is a denial of capacity: request codes for made-up addresses at a
 * studio's public door until its plan is full and real clients are refused. The
 * IP throttle limits the rate, not the total — so the total is capped here.
 */
const MAX_UNCLAIMED_SIGNUPS = 5;

/** An email already has an account, or is an invited (unlinked) client here. */
async function isExistingOrInvited(db: D1Database, tenantId: string, email: string): Promise<boolean> {
  const user = await db.prepare('SELECT 1 AS x FROM "user" WHERE LOWER(email) = ?').bind(email).first<{ x: number }>().catch(() => null);
  if (user) return true;
  const client = await db
    // Archived counts as known: an archived client must still be able to sign in
    // and read their own history, so their address is not "new here".
    .prepare("SELECT 1 AS x FROM clients WHERE tenant_id = ? AND LOWER(email) = ?")
    .bind(tenantId, email)
    .first<{ x: number }>()
    .catch(() => null);
  return Boolean(client);
}

/** Reserve a pending client row for a self-signing-up email (capacity-gated).
 *  The name is derived from the address — they set their own on the
 *  complete-your-profile screen. False when the studio is at capacity. */
async function createPendingClient(db: D1Database, tenantId: string, email: string): Promise<boolean> {
  const cap = await withinQuota(db, tenantId, "activeClients", await countClientSeats(db, tenantId));
  if (!cap.ok) return false;
  const unclaimed = await db
    .prepare("SELECT COUNT(*) AS n FROM clients WHERE tenant_id = ? AND status = ?")
    .bind(tenantId, PENDING_SIGNUP)
    .first<{ n: number }>()
    .catch(() => null);
  if ((unclaimed?.n ?? 0) >= MAX_UNCLAIMED_SIGNUPS) return false;
  const displayName = email.split("@")[0] ?? "New client";
  await db
    // `pending_signup`, not `active`: nobody has proved they own this address yet,
    // so it stays off the roster until the first authenticated context read claims
    // it. The capacity check above is still worth doing — it stops us mailing a
    // code to someone we would have to turn away.
    .prepare("INSERT INTO clients (id, tenant_id, display_name, email, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId("cli"), tenantId, displayName, email, PENDING_SIGNUP, nowIso())
    .run()
    .catch(() => undefined);
  return true;
}

export const otpSendGuard: MiddlewareHandler<AppEnv> = buildOtpGuard<Env, Auth, Branding>({
  db: (env) => env.DB,

  /**
   * `rootDomain` is the widget's assumed coverage when nobody has listed it.
   *
   * Without it the server demands a token on a tenant's OWN domain, where the
   * widget cannot render and no token can exist — which is not a bot check, it
   * is a studio that can admit nobody at the address it advertises. See
   * `@4dl/auth`'s turnstile.ts for why standing down there is sound.
   *
   * It is the root this host was CLASSIFIED against rather than the configured
   * one, because loopback is always classified against `localhost` whatever
   * `ROOT_DOMAIN` holds. Reading the config here would mark every `*.localhost`
   * host uncovered and quietly stand the check down across dev and the whole
   * integration suite.
   */
  humanCheck: async (c, token, ip) => {
    const host = hostnameOf(c.req.url);
    return (await verifyTurnstile(c.env, token, ip, host, { rootDomain: shapeOf(host, c.env).root })).ok;
  },

  /**
   * The host decides which studio this sign-in is for.
   *
   * Under the subdomain model there is no ambiguity left to resolve: a studio's
   * door IS its hostname. The two hosts with no tenant behave differently on
   * purpose —
   *
   *  • `setup.` — no studio yet, so nothing to check. Anyone may request a code;
   *    that is how a new owner gets in.
   *  • the root — a dead end. There is no studio to sign in TO, so a code from
   *    here would have no destination. Point them at their own address instead of
   *    quietly signing them in somewhere generic.
   */
  eligibility: async (c, email): Promise<EligibilityVerdict> => {
    const tenant = c.get("hostTenant");
    if (!tenant) {
      if (c.get("host").shape.role === "root") {
        return { ok: false, status: 400, body: { error: "wrong_door", detail: "Sign in at your studio's own address." } };
      }
      return { ok: true };
    }
    if (await isExistingOrInvited(c.env.DB, tenant.tenantId, email)) return { ok: true };
    if (!tenant.allowSignup) {
      return { ok: false, status: 403, body: { error: "invite_only" }, logEvent: "otp-signup-blocked" };
    }
    // Self sign-up allowed → reserve their seat so the /api/context auto-link
    // picks them up as a client the moment they verify.
    if (!(await createPendingClient(c.env.DB, tenant.tenantId, email))) {
      return { ok: false, status: 403, body: { error: "studio_full" } };
    }
    return { ok: true };
  },

  deliverable: async (c) => {
    const r = await emailDeliverable(c.env, c.env.EMAIL, isDevLane(c.env, c.req.header("origin") ?? ""));
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  },

  forward: (c, body) => c.get("auth").handler(forwardJson(c as never, body)),
}) as unknown as MiddlewareHandler<AppEnv>;
