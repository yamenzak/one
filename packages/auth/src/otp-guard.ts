/**
 * THE ONE GATE in front of the sign-in code.
 *
 * Every path to an emailed code — the platform door or a tenant's branded one —
 * runs these checks before anything goes out, then forwards a clean request to
 * the auth library's own handler. Enforcing it HERE rather than in a separate
 * pre-flight the client could skip is the whole point: the gate sits on the real
 * send path.
 *
 * In order:
 *
 *   1. a human check, if the platform configured one;
 *   2. a short per-address cooldown, so the button can show a countdown instead
 *      of silently dropping;
 *   3. a per-SOURCE hourly ceiling — the per-address cooldown only slows an
 *      attacker rotating addresses, and at a tenant that allows self-registration
 *      each new address can cost a seat;
 *   4. ELIGIBILITY, which is the app's (see below);
 *   5. a deliverability pre-flight.
 *
 * ── Why deliverability is checked here and not left to the send ────────────
 *
 * Better Auth runs its `sendVerificationOTP` callback through a background
 * wrapper that catches and merely LOGS anything thrown, then returns
 * `200 {"success":true}` regardless. So a failure raised inside that callback is
 * invisible to the client, and the sign-in screen happily advances to the
 * code-entry step. On a fresh deploy with no mail provider configured, that means
 * the very first sign-in shows "we sent you a code" forever and NOBODY — the
 * operator included — can get in. Checked before the forward, it is a 503 with a
 * reason.
 *
 * ── What the app supplies ─────────────────────────────────────────────────
 *
 * `eligibility` decides whether this address may receive a code at this tenant.
 * That answer is unavoidably the app's: it depends on what a customer record is,
 * whether strangers may self-register, and what a seat costs. The policy above it
 * — ordering, throttles, status codes, the neutral responses that avoid becoming
 * an account oracle — is shared.
 */

import type { Context, MiddlewareHandler } from "hono";
import type { AuthEnv } from "./context.js";
import { lastAuthEventAt, logAuthEvent, recentAuthEventsByIp } from "./audit.js";

/** Minimum gap between two codes to the same address. The library's own hourly
 *  cap still applies on top of this. */
const COOLDOWN_MS = 30_000;
/** Per-source hourly ceiling, keyed on the connecting IP. */
const MAX_PER_IP_PER_HOUR = 20;
const IP_WINDOW_MS = 60 * 60 * 1000;

export type EligibilityVerdict = { ok: true } | { ok: false; status: 400 | 403 | 503; body: Record<string, unknown>; logEvent?: string };

export interface OtpGuardConfig<E extends object, A, B> {
  /**
   * May this address receive a code at this door? Called after the throttles and
   * before delivery. Return a verdict rather than a boolean so the app can say
   * WHY — "invite only" and "we are full" are different answers to the person.
   */
  eligibility: (c: Context<AuthEnv<E, A, B>>, email: string) => Promise<EligibilityVerdict>;
  /** Can mail actually be delivered right now? See the header. */
  deliverable: (c: Context<AuthEnv<E, A, B>>) => Promise<{ ok: boolean; reason?: string }>;
  /** The human check. Omit for none. */
  humanCheck?: (c: Context<AuthEnv<E, A, B>>, token: string | null, ip: string | undefined) => Promise<boolean>;
  /** Hand the cleaned request to the auth library's own send handler. */
  forward: (c: Context<AuthEnv<E, A, B>>, body: { email: string; type: string }) => Promise<Response>;
  db: (env: E) => D1Database;
}

interface SendBody {
  email?: unknown;
  type?: unknown;
  turnstileToken?: unknown;
}

export function otpSendGuard<E extends object, A, B>(cfg: OtpGuardConfig<E, A, B>): MiddlewareHandler<AuthEnv<E, A, B>> {
  return async (c) => {
    const raw = (await c.req.json().catch(() => ({}))) as SendBody;
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    const type = typeof raw.type === "string" ? raw.type : "sign-in";
    const token = typeof raw.turnstileToken === "string" ? raw.turnstileToken : null;
    if (!email || !email.includes("@")) return c.json({ error: "enter a valid email" }, 400);

    const ip = c.req.header("cf-connecting-ip") ?? undefined;
    const db = cfg.db(c.env as E);

    // 1) Human check.
    if (cfg.humanCheck && !(await cfg.humanCheck(c, token, ip))) {
      await logAuthEvent(db, "otp-turnstile-fail", email, false, ip);
      return c.json({ error: "human_check_failed" }, 400);
    }

    // 2) Per-address cooldown — reflected back so the UI can count down.
    const last = await lastAuthEventAt(db, "otp-request", email);
    const sinceLast = last ? Date.now() - last : Infinity;
    if (sinceLast < COOLDOWN_MS) {
      return c.json({ error: "cooldown", retryAfterSec: Math.ceil((COOLDOWN_MS - sinceLast) / 1000) }, 429);
    }

    // 3) Per-source ceiling. The attempt is logged BEFORE eligibility runs, so it
    // counts toward the window whatever the outcome — otherwise probing an
    // invite-only tenant would slip the limit entirely.
    if (ip) {
      const seen = await recentAuthEventsByIp(db, "otp-ip", ip, IP_WINDOW_MS);
      if (seen >= MAX_PER_IP_PER_HOUR) {
        await logAuthEvent(db, "otp-ip-throttled", email, false, ip);
        return c.json({ error: "too_many_requests", retryAfterSec: Math.ceil(IP_WINDOW_MS / 1000) }, 429);
      }
      await logAuthEvent(db, "otp-ip", email, true, ip);
    }

    // 4) Eligibility — the app's answer.
    const verdict = await cfg.eligibility(c, email);
    if (!verdict.ok) {
      if (verdict.logEvent) await logAuthEvent(db, verdict.logEvent, email, false, ip);
      return c.json(verdict.body, verdict.status);
    }

    // 5) Deliverability pre-flight.
    const deliverable = await cfg.deliverable(c);
    if (!deliverable.ok) {
      await logAuthEvent(db, "otp-send-unconfigured", email, false, ip);
      console.error(`OTP not sent: mail cannot be delivered — ${deliverable.reason ?? "unknown"}`);
      return c.json({ error: "email_not_configured", detail: deliverable.reason }, 503);
    }

    return cfg.forward(c, { email, type });
  };
}

/**
 * Rebuild the request with a cleaned body, preserving what the auth library's
 * CSRF check needs.
 *
 * The Origin header and cookies must survive; `content-length` must NOT, because
 * the rewritten body has a different length and a stale one makes the forwarded
 * request unparseable.
 */
export function forwardJson(c: Context<never>, body: unknown): Request {
  const headers = new Headers(c.req.raw.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Request(new URL(c.req.url).toString(), { method: "POST", headers, body: JSON.stringify(body) });
}
