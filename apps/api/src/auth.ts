/**
 * Better Auth (SPEC §4) — 100% passwordless: email OTP + passkeys. No
 * passwords, no magic links, no social login.
 *
 * Cloudflare bindings are request-scoped, so `betterAuth()` cannot live at
 * module scope; build it per request with `createAuth(env, origin)` and cache
 * it on the Hono context. An **organization = a Mossa tenant**; the session's
 * `activeOrganizationId` is the tenant id threaded through every route.
 *
 * Flow (every role): email → 6-digit OTP → in. After first sign-in the app
 * prompts passkey enrollment; passkey becomes the one-tap default, OTP stays
 * as fallback + new-device bootstrap.
 */
import { betterAuth } from "better-auth";
import { organization, emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import type { Env } from "./env.js";
import { ac, roles } from "./access.js";
import { sendEmail, emailShell } from "./mailer.js";
import { newId, nowMs } from "./ids.js";

/** Best-effort auth audit trail — also the rate-limiter's backing store. */
export async function logAuthEvent(
  db: D1Database,
  event: string,
  email: string,
  success: boolean,
  ip?: string,
): Promise<void> {
  await db
    .prepare("INSERT INTO auth_logs (id, event, email, ip, success, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId("alog"), event, email.toLowerCase(), ip ?? null, success ? 1 : 0, nowMs())
    .run()
    .catch(() => undefined);
}

/** DB-backed rate limit: count recent events for an email. */
export async function recentAuthEvents(
  db: D1Database,
  event: string,
  email: string,
  windowMs: number,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM auth_logs WHERE event = ? AND email = ? AND at > ?")
    .bind(event, email.toLowerCase(), nowMs() - windowMs)
    .first<{ n: number }>()
    .catch(() => null);
  return row?.n ?? 0;
}

const OTP_MAX_PER_HOUR = 6;

export function createAuth(env: Env, origin?: string) {
  // Local dev always wins: a localhost origin overrides the prod var so
  // cookies stay non-Secure and callbacks point at the dev server.
  const isLocal = Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin));
  // Model A (SPEC §14.1): the REQUEST origin drives baseURL — so on a tenant's
  // custom domain the passkey RP id + cookies bind to that domain (each domain
  // is its own WebAuthn RP). BETTER_AUTH_URL is only the fallback when there's
  // no request context (e.g. background jobs). On the platform host the request
  // origin equals BETTER_AUTH_URL, so nothing changes there.
  const baseURL = origin || env.BETTER_AUTH_URL || "http://localhost:8787";

  // CSRF: Better Auth (esp. the org plugin) rejects POSTs whose Origin isn't
  // trusted. In local dev the app runs on the Vite server (:5173) and proxies
  // /api to this worker (:8787), so the browser Origin (:5173) differs from the
  // worker origin — trust the common localhost dev origins. In production the
  // app is served by the worker at one origin, so trusting that origin is right.
  const trustedOrigins = isLocal
    ? ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8787", "http://127.0.0.1:8787"]
    : origin
      ? [origin]
      : undefined;
  return betterAuth({
    database: env.DB,
    baseURL,
    // Dev-only fallback keeps local `wrangler dev` frictionless; production
    // MUST set BETTER_AUTH_SECRET (wrangler secret put BETTER_AUTH_SECRET).
    secret: env.BETTER_AUTH_SECRET || "mossa-dev-insecure-secret-change-me",
    trustedOrigins,

    // Passwordless-only: the email/password provider stays OFF.
    emailAndPassword: { enabled: false },

    // Stamp the active organization onto the session at creation so a
    // single-tenant user lands in their tenant without a switcher round-trip.
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const s = session as typeof session & { activeOrganizationId?: string };
            if (s.activeOrganizationId) return { data: session };
            try {
              const row = await env.DB.prepare(
                'SELECT organizationId FROM "member" WHERE userId = ? ORDER BY createdAt ASC LIMIT 1',
              )
                .bind(session.userId)
                .first<{ organizationId: string }>();
              if (row?.organizationId) {
                return { data: { ...session, activeOrganizationId: row.organizationId } };
              }
            } catch {
              /* best-effort */
            }
            return { data: session };
          },
        },
      },
    },

    plugins: [
      organization({ ac, roles, creatorRole: "owner" }),
      // THE sign-in method: 6-digit emailed code, 10-min TTL, DB rate-limited.
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10,
        async sendVerificationOTP({ email, otp }) {
          const sent = await recentAuthEvents(env.DB, "otp-request", email, 60 * 60 * 1000);
          if (sent >= OTP_MAX_PER_HOUR) {
            await logAuthEvent(env.DB, "otp-throttled", email, false);
            return; // silently drop: same UX as a wrong address, no oracle
          }
          await logAuthEvent(env.DB, "otp-request", email, true);
          await sendEmail(
            env.DB,
            {
              to: email,
              subject: `${otp} is your Mossa code`,
              html: emailShell(
                "Your Mossa sign-in code",
                `<p>Enter this code to continue. It expires in 10 minutes and can be used once.</p>
                 <div style="font-size:32px;font-weight:800;letter-spacing:8px;margin:16px 0;font-family:ui-monospace,monospace">${otp}</div>
                 <p style="color:#9aa0a6;font-size:13px">If you didn't request this, you can ignore it.</p>`,
              ),
              text: `Your Mossa code is ${otp} (expires in 10 minutes).`,
            },
            env.EMAIL,
          ).catch(() => undefined);
        },
      }),
      // One-tap re-auth once enrolled; multiple passkeys per user.
      passkey({
        rpName: "Mossa",
        // rpID must match the serving origin's registrable domain.
        rpID: baseURL.startsWith("https") ? new URL(baseURL).hostname : "localhost",
        origin: baseURL,
      }),
    ],

    // App + API share one origin; secure cookies only on https (local dev is http).
    advanced: { cookiePrefix: "mossa", useSecureCookies: baseURL.startsWith("https") },
  });
}

export type Auth = ReturnType<typeof createAuth>;
