/**
 * OTP-send policy wrapper (SPEC §4). The ONE gate in front of Better Auth's
 * `email-otp/send-verification-otp`, so every path to an emailed code — platform
 * or a tenant's branded login — runs the same checks before a code goes out:
 *
 *   1. a short per-email cooldown (on top of Better Auth's hourly cap), so the
 *      button can show a countdown instead of silently dropping;
 *   2. (PR2) a Turnstile check when the platform has configured one;
 *   3. eligibility on a *tenant* login: an existing user or an invited client
 *      always gets in; a brand-new email only when the studio allows self
 *      sign-up (`marketplace.selfRegister`) — and then we pre-create their
 *      pending client row so the /api/context auto-link lands them as a client.
 *
 * On the neutral platform host with no tenant in play, sign-up is the
 * studio-creation path and stays open (just cooldown + Turnstile).
 *
 * Enforcing here (not in a separate precheck the client could skip) keeps the
 * gate on the real send path: we consume the body, run the checks, then forward
 * a clean `{ email, type }` request to Better Auth's own handler.
 */

import type { MiddlewareHandler } from "hono";
import { type AppEnv } from "./auth-context.js";
import { logAuthEvent } from "./auth.js";
import { withinQuota } from "./billing-store.js";
import { resolveSlugTenant, isPlatformHost, hostnameOf, type HostTenant } from "./host-context.js";
import { newId, nowIso, nowMs } from "./ids.js";
import { emailDeliverable } from "./mailer.js";
import { verifyTurnstile } from "./turnstile.js";

/** The dev lane, derived exactly as createAuth does (ENVIRONMENT=development or a
 *  localhost serving origin) — a localhost origin cannot reach a deployed worker
 *  through Cloudflare's edge, so this stays closed in production. */
function isDevLane(c: Parameters<MiddlewareHandler<AppEnv>>[0]): boolean {
  const origin = c.req.header("origin") ?? "";
  return c.env.ENVIRONMENT === "development" || /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin);
}

/** Minimum gap between two codes to the same address. The hourly cap
 *  (Better Auth's callback) still applies on top of this. */
const OTP_COOLDOWN_MS = 30_000;

/** Per-IP hourly ceiling on OTP sends. The per-email cooldown/hourly cap only
 *  slows an attacker rotating addresses; this bounds a single source so an
 *  email-flood or roster-fill (self-register creates a pending client per new
 *  address) can't be driven from one host. Keyed on CF-Connecting-IP. */
const OTP_MAX_PER_IP_PER_HOUR = 20;
const OTP_IP_WINDOW_MS = 60 * 60 * 1000;

interface SendBody { email?: unknown; type?: unknown; slug?: unknown; turnstileToken?: unknown }

export const otpSendGuard: MiddlewareHandler<AppEnv> = async (c) => {
  const raw = (await c.req.json().catch(() => ({}))) as SendBody;
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const type = typeof raw.type === "string" ? raw.type : "sign-in";
  const slug = typeof raw.slug === "string" ? raw.slug : null;
  const turnstileToken = typeof raw.turnstileToken === "string" ? raw.turnstileToken : null;
  if (!email || !email.includes("@")) return c.json({ error: "enter a valid email" }, 400);
  const ip = c.req.header("cf-connecting-ip") ?? undefined;

  // 1) Human check (no-op until the platform configures Turnstile).
  const hostname = hostnameOf(c.req.url);
  const ts = await verifyTurnstile(c.env, turnstileToken, ip, hostname);
  if (!ts.ok) {
    await logAuthEvent(c.env.DB, "otp-turnstile-fail", email, false, ip);
    return c.json({ error: "human_check_failed" }, 400);
  }

  // 2) Cooldown — reflect the most recent request to this address.
  const last = await c.env.DB
    .prepare("SELECT MAX(at) AS at FROM auth_logs WHERE event = 'otp-request' AND email = ?")
    .bind(email)
    .first<{ at: number | null }>()
    .catch(() => null);
  const sinceLast = last?.at ? nowMs() - last.at : Infinity;
  if (sinceLast < OTP_COOLDOWN_MS) {
    return c.json({ error: "cooldown", retryAfterSec: Math.ceil((OTP_COOLDOWN_MS - sinceLast) / 1000) }, 429);
  }

  // 2b) Per-IP flood/roster-fill limit. Count this source's recent attempts
  // (across all addresses) and block past the hourly ceiling; log the attempt so
  // it counts toward the window regardless of the eligibility outcome below —
  // otherwise probing invite-only tenants would slip the limit.
  if (ip) {
    const seen = await c.env.DB
      .prepare("SELECT COUNT(*) AS n FROM auth_logs WHERE event = 'otp-ip' AND ip = ? AND at > ?")
      .bind(ip, nowMs() - OTP_IP_WINDOW_MS)
      .first<{ n: number }>()
      .catch(() => null);
    if ((seen?.n ?? 0) >= OTP_MAX_PER_IP_PER_HOUR) {
      await logAuthEvent(c.env.DB, "otp-ip-throttled", email, false, ip);
      return c.json({ error: "too_many_requests", retryAfterSec: Math.ceil(OTP_IP_WINDOW_MS / 1000) }, 429);
    }
    await logAuthEvent(c.env.DB, "otp-ip", email, true, ip);
  }

  // 3) Eligibility — only on a tenant login (branded domain or /t/<slug>).
  const platform = isPlatformHost(hostname, c.env);
  let tenant: HostTenant | null = c.get("hostTenant");
  if (!tenant && platform && slug) tenant = await resolveSlugTenant(c.env.DB, slug);

  if (tenant) {
    const known = await isExistingOrInvited(c.env.DB, tenant.tenantId, email);
    if (!known) {
      if (!tenant.allowSignup) {
        await logAuthEvent(c.env.DB, "otp-signup-blocked", email, false, ip);
        return c.json({ error: "invite_only" }, 403);
      }
      // Self sign-up allowed → reserve their client seat so the /api/context
      // auto-link picks them up as a client the moment they verify.
      const created = await createPendingClient(c.env.DB, tenant.tenantId, email);
      if (!created) return c.json({ error: "studio_full" }, 403);
    }
  }

  // 3b) Deliverability pre-flight. This MUST happen here rather than being left
  // to the send itself: Better Auth runs `sendVerificationOTP` through
  // `runInBackgroundOrAwait`, which catches and merely logs anything thrown, then
  // returns 200 {"success":true} regardless — so a failure raised inside that
  // callback is invisible to the client and the login UI happily advances to the
  // code-entry screen. On a fresh production deploy `email.provider` defaults to
  // `mock`, which fails closed outside dev, so without this check the very first
  // sign-in shows "we sent you a code" forever and NOBODY — including the
  // platform admin — can get in. Verified against the running worker.
  const deliverable = await emailDeliverable(c.env.DB, c.env.EMAIL, isDevLane(c));
  if (!deliverable.ok) {
    await logAuthEvent(c.env.DB, "otp-send-unconfigured", email, false, ip);
    console.error(`OTP not sent: email provider "${deliverable.provider}" cannot deliver — ${deliverable.reason}`);
    return c.json({ error: "email_not_configured", detail: deliverable.reason }, 503);
  }

  // 4) Hand a clean request to Better Auth's own send handler. Preserve the
  // Origin + cookies (Better Auth's CSRF), but drop the stale content-length so
  // the rewritten body length is recomputed, and force JSON.
  const headers = new Headers(c.req.raw.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  const fwd = new Request(new URL(c.req.url).toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ email, type }),
  });
  return c.get("auth").handler(fwd);
};

/** An email already has an account, or is an invited (unlinked) client here. */
async function isExistingOrInvited(db: D1Database, tenantId: string, email: string): Promise<boolean> {
  const user = await db.prepare('SELECT 1 AS x FROM "user" WHERE LOWER(email) = ?').bind(email).first<{ x: number }>().catch(() => null);
  if (user) return true;
  const client = await db
    .prepare("SELECT 1 AS x FROM clients WHERE tenant_id = ? AND LOWER(email) = ? AND status != 'archived'")
    .bind(tenantId, email)
    .first<{ x: number }>()
    .catch(() => null);
  return Boolean(client);
}

/** Reserve a pending client row for a self-signing-up email (capacity-gated).
 *  Name is intentionally derived from the address — they set it themselves on
 *  the complete-your-profile screen. Returns false if the studio is at capacity. */
async function createPendingClient(db: D1Database, tenantId: string, email: string): Promise<boolean> {
  const active = await db.prepare("SELECT COUNT(*) AS n FROM clients WHERE tenant_id = ? AND status != 'archived'").bind(tenantId).first<{ n: number }>();
  const cap = await withinQuota(db, tenantId, "activeClients", active?.n ?? 0);
  if (!cap.ok) return false;
  const displayName = email.split("@")[0] ?? "New client";
  await db
    .prepare("INSERT INTO clients (id, tenant_id, display_name, email, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(newId("cli"), tenantId, displayName, email, nowIso())
    .run()
    .catch(() => undefined);
  return true;
}
