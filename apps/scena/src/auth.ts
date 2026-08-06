/**
 * Better Auth (multi-tenant) — the account/session/organization authority.
 *
 * Cloudflare bindings are request-scoped, so `betterAuth()` cannot live at
 * module scope; build it per request with `createAuth(env, origin)` and cache
 * it on the Hono context (see index.ts). Better Auth 1.5+ detects the D1
 * binding natively (`database: env.DB`).
 *
 * An **organization = a Scena tenant**; the session's `activeOrganizationId`
 * is the tenant id threaded through every route.
 *
 * Two-tier sign-in (§auth):
 *   • Account owners (self-serve) → **email OTP** (a 6-digit code), the primary
 *     path, with email/password + Google kept as fallbacks so no one is locked
 *     out if email delivery is misconfigured.
 *   • Staff provisioned under a tenant → **username + password** (see members.ts).
 *     They ride the same email/password provider via a synthetic non-routable
 *     email, so browser password managers work and repeated logins are instant.
 */
import { betterAuth } from "better-auth";
import { organization, magicLink, emailOTP } from "better-auth/plugins";
import type { Env } from "./env.js";
import { ac, roles } from "./access.js";
import { sendEmail, emailShell } from "./mailer.js";

export function createAuth(env: Env, origin?: string) {
  const baseURL = env.BETTER_AUTH_URL || origin || "http://localhost:8787";
  return betterAuth({
    database: env.DB,
    baseURL,
    // A dev-only fallback secret keeps local `wrangler dev` frictionless; a real
    // BETTER_AUTH_SECRET must be set in production (see README deploy steps).
    secret: env.BETTER_AUTH_SECRET || "scena-dev-insecure-secret-change-me",
    trustedOrigins: origin ? [origin] : undefined,

    emailAndPassword: { enabled: true },

    // Stamp the active organization onto the session at creation. A board user
    // (§boards) has exactly one membership and never calls setActive — without
    // this their session carries no tenant, so they couldn't even read their
    // board. For a normal user it just makes the tenant available immediately
    // (the dashboard's OrgGate remains a fallback for multi-org switching).
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const s = session as typeof session & { activeOrganizationId?: string };
            if (s.activeOrganizationId) return { data: session };
            try {
              const row = await env.DB.prepare(
                'SELECT organizationId FROM "member" WHERE userId = ? ORDER BY createdAt ASC LIMIT 1',
              ).bind(session.userId).first<{ organizationId: string }>();
              if (row?.organizationId) return { data: { ...session, activeOrganizationId: row.organizationId } };
            } catch {
              /* best-effort: fall through with the session unchanged */
            }
            return { data: session };
          },
        },
      },
    },

    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : undefined,

    plugins: [
      organization({ ac, roles, creatorRole: "owner" }),
      // Primary owner sign-in: a 6-digit code emailed via the mailer (Cloudflare
      // Email Sending in prod). `sendVerificationOnSignUp` isn't set — the code
      // itself both signs in and creates the account on first use.
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10, // 10 minutes
        async sendVerificationOTP({ email, otp, type }) {
          const heading = type === "forget-password" ? "Reset your password" : "Your Scena sign-in code";
          // Best-effort: a mailer failure must not break the auth flow.
          await sendEmail(
            env.DB,
            {
              to: email,
              subject: `${otp} is your Scena code`,
              html: emailShell(
                heading,
                `<p>Enter this code to continue. It expires in 10 minutes and can be used once.</p>
                 <div style="font-size:30px;font-weight:800;letter-spacing:8px;margin:14px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${otp}</div>
                 <p style="color:#64748b;font-size:13px">If you didn't request this, you can ignore it.</p>`,
              ),
              text: `Your Scena code is ${otp} (expires in 10 minutes).`,
            },
            env.EMAIL,
          ).catch(() => undefined);
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          // Best-effort: a mailer failure must not break the auth flow.
          await sendEmail(
            env.DB,
            {
              to: email,
              subject: "Your Scena sign-in link",
              html: emailShell(
                "Sign in to Scena",
                `<p>Click below to sign in. This link expires shortly and can be used once.</p>
                 <p><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#6d28d9;color:#fff;text-decoration:none">Sign in to Scena</a></p>
                 <p style="color:#64748b;font-size:13px">If you didn't request this, you can ignore it.</p>`,
              ),
              text: `Sign in to Scena: ${url}`,
            },
            env.EMAIL,
          ).catch(() => undefined);
        },
      }),
    ],

    // App + API share one origin (single worker), so cookie defaults are correct.
    // Secure cookies require an https origin; a local `wrangler dev` on http would
    // otherwise emit `__Secure-`/Secure cookies the browser rejects, so key the
    // flag off the base URL (prod is https → secure; local http → not).
    advanced: { cookiePrefix: "scena", useSecureCookies: baseURL.startsWith("https") },
  });
}

export type Auth = ReturnType<typeof createAuth>;
