/**
 * THE AUTH INSTANCE — passwordless by construction: emailed code + passkey.
 *
 * No password provider, no magic links, no social login. That is not a
 * simplification to be relaxed later; it is what makes the rest of this package
 * coherent. There is no password to phish, reset, reuse or store, and "verify
 * this address" and "sign in" are the same act.
 *
 * Cloudflare bindings are request-scoped, so the instance cannot live at module
 * scope: build it per request with `createAuth(env, origin, shape, cfg)` and
 * cache it on the request context (`sessionMiddleware` does).
 *
 * An **organization IS a tenant**. That equivalence is load-bearing — it turns
 * the org plugin's membership, invitation and role machinery into the app's
 * tenancy rather than a second membership model beside it.
 *
 * ── The two things the HOST decides ────────────────────────────────────────
 *
 *  • **rpID** — every door under the root shares `rpID = <root>`, so ONE passkey
 *    works at `setup.`, at `admin.` and at every tenant a person belongs to. A
 *    custom domain has no suffix relationship with the root, so WebAuthn requires
 *    it to be its own RP with its own credential. Not a limitation we chose.
 *  • **cookie Domain** — widened to the root under our subtree, so one sign-in
 *    covers every tenant and switching between them is a navigation rather than
 *    a re-authentication. Host-only on a custom domain and on `localhost`.
 *
 * ── What the app supplies ─────────────────────────────────────────────────
 *
 * The RBAC registry (`ac`/`roles`), the display name, the cookie prefix, the two
 * message-sending callbacks, and optionally a seat ceiling. Everything else —
 * the plugin set, the freshness override, the fail-closed secret handling, the
 * three seat doors — is the same for every app and is why this file exists.
 */

import { betterAuth, APIError } from "better-auth";
import { organization, emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import type { HasDb, HasEnvironment } from "@4dl/core";
import { cookieDomainFor, isDevRoot, rpIdFor, type HostShape } from "@4dl/tenancy";
import { logAuthEvent, recentAuthEvents } from "./audit.js";
import { checkStaffSeat, type SeatConfig, type SeatVerdict } from "./seats.js";

export interface AuthBindings extends HasDb, HasEnvironment {
  /**
   * Signing/encryption key. Optional ONLY on the dev lane; anywhere else
   * `createAuth` refuses to start rather than signing sessions with a
   * repo-public fallback, which would let anyone forge a session for any user.
   */
  BETTER_AUTH_SECRET?: string;
  /** The advertised canonical origin; the fallback when there is no request. */
  BETTER_AUTH_URL?: string;
}

export interface OtpMessage {
  email: string;
  otp: string;
  /** True on the development lane — the only place a mock provider may succeed. */
  devLane: boolean;
}

export interface InvitationMessage {
  id: string;
  email: string;
  role: string;
  organization: { id: string; name: string };
  inviter: { user: { name?: string | null; email?: string | null } };
  /** The deep link the invitee follows. */
  acceptUrl: string;
}

export interface AuthConfig {
  /** The app's Better Auth access-control instance. */
  ac: Parameters<typeof organization>[0] extends { ac?: infer T } ? T : unknown;
  /** Role name → role definition, from the same access-control instance. */
  roles: Record<string, unknown>;
  /** The role a tenant's creator receives. */
  creatorRole: string;
  /** The role that is NOT a staff seat — the app's end-customer role. */
  customerRole: string;
  /** WebAuthn RP display name, shown in the platform passkey prompt. */
  rpName: string;
  /** Cookie name prefix. Distinct per app so two apps on one host never collide. */
  cookiePrefix: string;
  /** Deliver a sign-in code. THROWING is correct — see `sendOtp` below. */
  sendOtp: (env: AuthBindings, msg: OtpMessage) => Promise<void>;
  /** Deliver a staff invitation. Best-effort; failures are logged, not thrown. */
  sendInvitation: (env: AuthBindings, msg: InvitationMessage) => Promise<void>;
  /** Seat ceiling. Omit to impose none. */
  seats?: (env: AuthBindings) => SeatConfig;
  /**
   * Extra gating on the role being invited — e.g. "this role is sold separately".
   * Return a message to refuse, or null to allow.
   */
  checkInviteRole?: (env: AuthBindings, tenantId: string, role: string) => Promise<string | null>;
  /** Hourly ceiling on codes to one address. */
  otpMaxPerHour?: number;
  /** How long a code lives, in seconds. */
  otpTtlSeconds?: number;
}

/** The seat rejection, as the error the library will serialise to the client. */
function seatError(verdict: SeatVerdict): APIError {
  return new APIError("FORBIDDEN", {
    code: "STAFF_SEATS_EXCEEDED",
    message: verdict.message,
    quota: "staffSeats",
    used: verdict.used,
    limit: verdict.max,
  });
}

export function createAuth(env: AuthBindings, origin: string | undefined, shape: HostShape | undefined, cfg: AuthConfig) {
  // Local dev always wins: a loopback origin overrides production config so
  // cookies stay non-Secure and callbacks point at the dev server.
  //
  // Derived from the host SHAPE when there is one, not from a regex on the
  // origin. A regex matching a literal `localhost` prefix stops being true the
  // moment dev moves onto the real topology (`setup.localhost`, `acme.localhost`)
  // — whereupon every request is "not local": secure cookies over http, and,
  // because the dev-secret fallback is gated on the same flag, auth refusing to
  // start at all. One predicate for both so they cannot disagree.
  const isLocal = shape ? isDevRoot(shape) : Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin));

  // The REQUEST origin drives baseURL, so on a tenant's subdomain or its custom
  // domain, callbacks and emailed links point back at the door the user actually
  // came through. The configured URL is only the fallback when there is no
  // request context (a cron has no request).
  const baseURL = origin || env.BETTER_AUTH_URL || "http://localhost:8787";

  // CSRF: the library rejects POSTs whose Origin it does not trust.
  //
  // ⚠️ Better Auth 1.6.23 does NOT honour this list — it trusts only the
  // request's own origin. Verified by probe: a POST with the worker's own origin
  // succeeds while every other listed origin 403s `INVALID_ORIGIN`. The list is
  // kept because it is the documented option and a future version may respect
  // it, but do NOT rely on it: adding an origin here does not make it work.
  //
  // The dev consequence is subtle. Cookieless calls (code send/verify) have no
  // Origin check, so signing in through a separate dev server SUCCEEDS — and then
  // every cookie-bearing POST fails, which presents as "I can log in but nothing
  // I do saves". The fix belongs in the dev proxy, which must present the
  // worker's own origin. Production is same-origin and unaffected.
  const trustedOrigins = isLocal
    ? ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8787", "http://127.0.0.1:8787"]
    : origin
      ? [origin]
      : undefined;

  // FAIL CLOSED outside development. The fallback is gated on an explicit dev
  // signal, never on the mere absence of the secret: in production a missing
  // secret must refuse to boot auth, not silently serve on a forgeable key.
  const devLane = env.ENVIRONMENT === "development" || isLocal;
  const secret = env.BETTER_AUTH_SECRET || (devLane ? "4dl-dev-insecure-secret-change-me" : "");
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set — refusing to start auth on an insecure fallback key outside development.",
    );
  }

  const seats = cfg.seats?.(env);

  return betterAuth({
    database: env.DB,
    baseURL,
    secret,
    trustedOrigins,

    // Passwordless-only: the email/password provider stays OFF.
    emailAndPassword: { enabled: false },

    // Passkey enrollment runs behind a freshness middleware that 403s
    // SESSION_NOT_FRESH once a session is older than `freshAge` (default: one
    // day). In a passwordless app the only way to "refresh" a session is another
    // code round-trip, which we never force — so a user signed in for more than
    // a day simply COULD NOT add a passkey, and the first enroll call 403'd with
    // no actionable reason. `freshAge: 0` skips the check; the operation is still
    // gated by a valid, active session.
    session: { freshAge: 0 },

    // Stamp the active organization at session creation so a single-tenant user
    // lands in their tenant without a switcher round-trip.
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
              if (row?.organizationId) return { data: { ...session, activeOrganizationId: row.organizationId } };
            } catch {
              /* best-effort */
            }
            return { data: session };
          },
        },
      },
    },

    plugins: [
      organization({
        ac: cfg.ac as never,
        roles: cfg.roles as never,
        creatorRole: cfg.creatorRole,
        /**
         * The seat ceiling, enforced INSIDE the plugin so all three doors to a
         * new seat share one check: creating an invitation, accepting one (the
         * deep link posts straight to the plugin's own endpoint and skipped
         * every app-level check), and promoting an existing member (the
         * plugin's `update-member-role` is HTTP-reachable and is a second
         * promotion path beside the app's own).
         *
         * A thrown APIError refuses the operation and leaves the invitation
         * pending, because both hooks are awaited before the membership row is
         * created.
         */
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation, organization: org }) => {
            if (invitation.role === cfg.customerRole) return; // not a staff seat
            const refusal = await cfg.checkInviteRole?.(env, org.id, invitation.role as string);
            if (refusal) throw new APIError("FORBIDDEN", { message: refusal, code: "FEATURE_NOT_IN_PLAN" });
            if (!seats) return;
            // A pending invitation is a RESERVED seat, so it counts here.
            const seat = await checkStaffSeat(env.DB, org.id, seats, { countPending: true });
            if (!seat.ok) throw seatError(seat);
          },
          beforeAcceptInvitation: async ({ invitation, user, organization: org }) => {
            if (invitation.role === cfg.customerRole || !seats) return;
            // Already a member ⇒ they already occupy their seat. Counting them
            // again would refuse a legitimate re-accept — e.g. the deep link
            // firing after the app already minted the membership.
            const already = await env.DB.prepare('SELECT 1 AS x FROM "member" WHERE organizationId = ? AND userId = ?')
              .bind(org.id, user.id)
              .first<{ x: number }>();
            if (already) return;
            // NOT countPending: the invitation being accepted would count itself.
            const seat = await checkStaffSeat(env.DB, org.id, seats);
            if (!seat.ok) throw seatError(seat);
          },
          beforeUpdateMemberRole: async ({ member, newRole, organization: org }) => {
            // Only customer → staff claims a NEW seat.
            if (newRole === cfg.customerRole || member.role !== cfg.customerRole || !seats) return;
            const seat = await checkStaffSeat(env.DB, org.id, seats);
            if (!seat.ok) throw seatError(seat);
          },
        },
        async sendInvitationEmail(data) {
          const acceptUrl = `${baseURL.replace(/\/$/, "")}/accept-invitation/${data.id}`;
          // The library calls this fire-and-forget — the result cannot be threaded
          // back into the API response. So at minimum it must not vanish: an
          // invitation whose email never went out looks identical to one that did,
          // and the invitee is simply never contacted.
          await cfg
            .sendInvitation(env, {
              id: data.id,
              email: data.email,
              role: data.role as string,
              organization: { id: data.organization.id, name: data.organization.name },
              inviter: data.inviter,
              acceptUrl,
            })
            .catch((e: unknown) => {
              console.warn(
                `[invite] invitation to ${data.email} for org ${data.organization.id} was NOT delivered: ${
                  e instanceof Error ? e.message : String(e)
                } — the accept link must be shared manually`,
              );
            });
        },
      }),
      // THE sign-in method.
      emailOTP({
        otpLength: 6,
        expiresIn: cfg.otpTtlSeconds ?? 60 * 10,
        async sendVerificationOTP({ email, otp }) {
          const max = cfg.otpMaxPerHour ?? 6;
          const sent = await recentAuthEvents(env.DB, "otp-request", email, 60 * 60 * 1000);
          if (sent >= max) {
            await logAuthEvent(env.DB, "otp-throttled", email, false);
            return; // silently drop: same UX as a wrong address, no oracle
          }
          // THROW on failure. A deploy left on a mock provider, or with none
          // configured, must fail loudly rather than telling the user a code is
          // on its way. The library swallows this into a log, which is why the
          // real defence is the pre-flight in `otpSendGuard` — but throwing here
          // is still correct, and it is what stops an event being logged as sent.
          try {
            await cfg.sendOtp(env, { email, otp, devLane });
          } catch (e) {
            await logAuthEvent(env.DB, "otp-send-failed", email, false);
            throw e;
          }
          await logAuthEvent(env.DB, "otp-request", email, true);
        },
      }),
      // One-tap re-auth once enrolled; multiple credentials per user.
      passkey({
        rpName: cfg.rpName,
        // `rpIdFor` returns "localhost" for every loopback host, which is what
        // keeps dev and the E2E suite (on `*.localhost`) enrolling passkeys.
        rpID: shape ? rpIdFor(shape) : baseURL.startsWith("https") ? new URL(baseURL).hostname : "localhost",
        // WebAuthn verifies the ceremony's origin against this. In a split dev
        // setup the page and the worker are different origins, so pin both or
        // registration fails with an origin mismatch.
        origin: trustedOrigins ?? baseURL,
      }),
    ],

    advanced: {
      cookiePrefix: cfg.cookiePrefix,
      useSecureCookies: baseURL.startsWith("https"),
      // What makes one sign-in cover every tenant. The cookie is issued for
      // `.<root>`, so sibling tenant subdomains share a session. It is NOT sent
      // to an unrelated app in the same zone — a Domain of `<root>` matches that
      // name and its subdomains only.
      //
      // Left off (host-only) for custom domains, which have no shared parent, and
      // for `localhost`, for which browsers reject a Domain attribute — so dev
      // keeps a separate session per `*.localhost`. That is a dev-only difference
      // from production, and it is why a local switcher asks you to sign in twice.
      ...(shape && cookieDomainFor(shape)
        ? { crossSubDomainCookies: { enabled: true, domain: `.${cookieDomainFor(shape)}` } }
        : {}),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
