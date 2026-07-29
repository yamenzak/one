/**
 * Better Auth (SPEC §4) — 100% passwordless: email OTP + passkeys. No
 * passwords, no magic links, no social login.
 *
 * Cloudflare bindings are request-scoped, so `betterAuth()` cannot live at
 * module scope; build it per request with `createAuth(env, origin)` and cache
 * it on the Hono context. An **organization = a Kova tenant**; the session's
 * `activeOrganizationId` is the tenant id threaded through every route.
 *
 * Flow (every role): email → 6-digit OTP → in. After first sign-in the app
 * prompts passkey enrollment; passkey becomes the one-tap default, OTP stays
 * as fallback + new-device bootstrap.
 */
import { betterAuth, APIError } from "better-auth";
import { organization, emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { cookieDomainFor, isDevRoot, rpIdFor, type HostShape } from "@4dl/platform";
import type { Env } from "./env.js";
import { ac, roles } from "./access.js";
import { withinQuota, hasFeature } from "./billing-store.js";
import { sendEmail, emailShell, emailButton, escapeHtml, KOVA_BRAND } from "./mailer.js";
import { sendTenantEmail } from "./email-provider.js";
import { tenantBrandKit } from "./notify.js";
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

// ── Staff seats (the `staffSeats` quota) ─────────────────────────────────────
//
// A staff seat is a `member` row whose role is not `client` — **the owner
// included**, because the quota's own label is "Owner + trainers + assistants"
// (`@kova/domain` entitlements.ts) and `checkDowngrade` counts it the same way.
// So Free/Solo (`staffSeats: 1`) is a one-coach studio by design: the owner fills
// it and cannot add staff without upgrading. That is the ceiling, not a lockout —
// nothing here runs when a workspace is CREATED, when a client links, or when a
// staffer moves sideways between staff roles; the check fires only where a NEW
// staff seat is actually claimed.
//
// There were three ways past the one check that existed (in `/api/context`):
// Better Auth's `accept-invitation` (the deep link), our own role-promotion
// route, and invitation creation. The hooks below close the first and third for
// BOTH accept paths at once; `member-routes.ts` closes the second.

/** Seats consumed right now: every non-client membership. */
export async function staffSeatsUsed(db: D1Database, tenantId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM "member" WHERE organizationId = ? AND role != \'client\'')
    .bind(tenantId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Seats already promised: pending, unexpired, non-client invitations. */
export async function pendingStaffSeats(db: D1Database, tenantId: string): Promise<number> {
  const rows = await db
    .prepare("SELECT expiresAt FROM \"invitation\" WHERE organizationId = ? AND status = 'pending' AND role != 'client'")
    .bind(tenantId)
    .all<{ expiresAt: string | number | null }>();
  const now = Date.now();
  return (rows.results ?? []).filter((r) => {
    const exp = r.expiresAt != null ? new Date(r.expiresAt as string).getTime() : NaN;
    return !Number.isFinite(exp) || exp >= now; // an unparseable expiry counts (fail closed)
  }).length;
}

export interface SeatVerdict {
  ok: boolean;
  used: number;
  max: number;
  /** Actionable copy: what the owner must do to make room. */
  message: string;
}

/**
 * Is there room for one more staff seat? `countPending` includes pending
 * invitations, which is right when RESERVING a seat (creating an invitation) and
 * wrong when CLAIMING one (accepting an invitation — the invite being accepted
 * would count itself).
 */
export async function checkStaffSeat(
  db: D1Database,
  tenantId: string,
  opts: { countPending?: boolean } = {},
): Promise<SeatVerdict> {
  const members = await staffSeatsUsed(db, tenantId);
  const pending = opts.countPending ? await pendingStaffSeats(db, tenantId) : 0;
  const used = members + pending;
  const { ok, max } = await withinQuota(db, tenantId, "staffSeats", used);
  const seats = `${max} staff seat${max === 1 ? "" : "s"}`;
  const held = pending > 0 ? `${used} of them ${used === 1 ? "is" : "are"} in use or invited` : `${used} ${used === 1 ? "is" : "are"} in use`;
  const free = pending > 0 ? "Remove a staff member, cancel a pending invitation," : "Remove a staff member";
  return {
    ok,
    used,
    max,
    message: ok
      ? `${used} of ${seats} in use.`
      : `Your plan includes ${seats} and ${held}. ${free}${pending > 0 ? "" : ","} or upgrade your plan to add another.`,
  };
}

/** The seat rejection, as the error Better Auth will serialise to the client. */
function seatError(verdict: SeatVerdict): APIError {
  return new APIError("FORBIDDEN", { code: "STAFF_SEATS_EXCEEDED", message: verdict.message, quota: "staffSeats", used: verdict.used, limit: verdict.max });
}

/**
 * Build the per-request auth instance.
 *
 * `shape` is the request's host classification (`@kova/domain` `classifyHost`),
 * and it decides the two things that make cross-tenant identity work:
 *
 *  • **rpID** — every door under our root shares `rpID = <root>`, so ONE passkey
 *    works at `setup.`, at `admin.` and at every studio a person belongs to. A
 *    custom domain has no suffix relationship with our root, so WebAuthn requires
 *    it to be its own RP with its own credential. See `rpIdFor`.
 *  • **cookie Domain** — widened to the root under our subtree, so one sign-in
 *    covers every studio and the switcher moves between subdomains without
 *    re-authenticating. Host-only on a custom domain and on `localhost`. See
 *    `cookieDomainFor`.
 *
 * Omitting `shape` falls back to host-only behaviour derived from the origin,
 * which is what background jobs (no request) get.
 */
export function createAuth(env: Env, origin?: string, shape?: HostShape) {
  // Local dev always wins: a loopback origin overrides the prod var so cookies
  // stay non-Secure and callbacks point at the dev server.
  //
  // Derived from the host SHAPE when we have one, not from a regex on the origin.
  // The regex only matched a literal `localhost` / `127.0.0.1` prefix, so the
  // moment dev moved onto the real topology (`setup.localhost`, `acme.localhost`)
  // every request stopped being "local": secure cookies over http, and — because
  // the dev-secret fallback is gated on the same flag — auth refusing to start at
  // all. One predicate for both, so they cannot disagree again.
  const isLocal = shape ? isDevRoot(shape) : Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin));
  // The REQUEST origin drives baseURL — so on a studio's subdomain or its custom
  // domain, callbacks and emailed links point back at the door the user actually
  // came through. BETTER_AUTH_URL is only the fallback when there's no request
  // context (e.g. background jobs).
  const baseURL = origin || env.BETTER_AUTH_URL || "http://localhost:8787";

  // CSRF: Better Auth rejects POSTs whose Origin isn't trusted.
  //
  // ⚠️ Better Auth 1.6.23 does NOT honour this list — it trusts only the
  // request's own origin. Verified by probe against the running worker: a POST
  // with `Origin: http://localhost:8787` to the worker on :8787 → 200, while
  // `http://localhost:5173` and `http://127.0.0.1:8787` → 403 INVALID_ORIGIN,
  // despite all four being listed here. The list is kept because it is the
  // documented option and a future version may respect it, but do NOT rely on
  // it: adding an origin here does not make it work.
  //
  // The dev consequence was subtle and cost real time. Cookieless calls (OTP
  // send/verify) have no Origin check, so sign-in on the Vite server at :5173
  // succeeded — and then every cookie-bearing POST failed, which looks like
  // "I can log in but Create workspace does nothing". The actual fix lives in
  // apps/app/vite.config.ts, where the dev proxy now presents the worker's own
  // origin so the proxied request is same-origin. Production is genuinely
  // same-origin (the worker serves the SPA), so it was never affected.
  const trustedOrigins = isLocal
    ? ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8787", "http://127.0.0.1:8787"]
    : origin
      ? [origin]
      : undefined;

  // Signing/encryption key. A dev-only fallback keeps local `wrangler dev`
  // frictionless, but FAIL CLOSED anywhere else: signing every session cookie
  // with a repo-public constant lets an attacker forge sessions for any user.
  // The fallback is gated on an explicit dev signal (ENVIRONMENT=development or a
  // localhost serving origin) — never the mere absence of the secret — mirroring
  // the ADMIN_EMAILS and mock-mailer hardening. In production the missing secret
  // must refuse to boot auth, not silently serve on a forgeable key.
  const devLane = env.ENVIRONMENT === "development" || isLocal;
  const secret = env.BETTER_AUTH_SECRET || (devLane ? "kova-dev-insecure-secret-change-me" : "");
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set — refusing to start auth on an insecure fallback key outside development. Set it with `wrangler secret put BETTER_AUTH_SECRET`.",
    );
  }

  return betterAuth({
    database: env.DB,
    baseURL,
    secret,
    trustedOrigins,

    // Passwordless-only: the email/password provider stays OFF.
    emailAndPassword: { enabled: false },

    // Passkey enrollment (`generate-register-options`) runs behind Better Auth's
    // freshSessionMiddleware, which 403s SESSION_NOT_FRESH once a session is
    // older than `freshAge` (DEFAULT 1 DAY). In a 100% passwordless app the only
    // way to "refresh" a session is another OTP round-trip, which we never force
    // — so a user signed in for more than a day simply COULD NOT add a passkey
    // (the very first enroll call 403'd with no actionable reason). `freshAge: 0`
    // skips the freshness check, so enrollment works for the whole session
    // lifetime; the operation is still gated by a valid, active session.
    session: { freshAge: 0 },

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
      organization({
        ac,
        roles,
        creatorRole: "owner",
        // Seat ceiling, enforced inside the plugin so BOTH accept paths share one
        // check: the /accept-invitation deep link (which posts straight to
        // `accept-invitation` in the public lane and skipped every check) and the
        // email-matched auto-accept in `/api/context`. Verified against the
        // vendored 1.6.23 source: both hooks are `await`ed directly in the
        // endpoint body (routes/crud-invites.mjs), `beforeAcceptInvitation` before
        // the invitation is marked accepted and the member row is created, so a
        // thrown APIError refuses the accept and leaves the invite pending.
        organizationHooks: {
          // Don't let an owner promise more seats than they hold — a pending
          // invitation is a reserved seat, so it counts toward the ceiling.
          beforeCreateInvitation: async ({ invitation, organization: org }) => {
            if (invitation.role === "client") return; // client invites aren't staff seats
            // The assistant ROLE is half of what `frontDesk` sells (SPEC §5), so a
            // tenant without it may not invite one. Gated here as well as on the
            // role-change route (`member-routes.ts`) because these are two
            // independent doors to the same seat, and closing only one leaves the
            // capability purchasable by the other.
            if (invitation.role === "assistant" && !(await hasFeature(env.DB, org.id, "frontDesk"))) {
              throw new APIError("FORBIDDEN", {
                message: "The front-desk assistant role isn't included in this plan. Upgrade to invite an assistant, or invite them as a coach instead.",
                code: "FEATURE_NOT_IN_PLAN",
              });
            }
            const seat = await checkStaffSeat(env.DB, org.id, { countPending: true });
            if (!seat.ok) throw seatError(seat);
          },
          beforeAcceptInvitation: async ({ invitation, user, organization: org }) => {
            if (invitation.role === "client") return;
            // Already a member ⇒ they already occupy their seat (or a client seat
            // being re-invited as staff, which the promotion path governs).
            // Counting them again would refuse a legitimate re-accept — e.g. the
            // deep link firing after `/api/context` already minted the membership.
            const already = await env.DB.prepare('SELECT 1 AS x FROM "member" WHERE organizationId = ? AND userId = ?')
              .bind(org.id, user.id)
              .first<{ x: number }>();
            if (already) return;
            const seat = await checkStaffSeat(env.DB, org.id);
            if (!seat.ok) throw seatError(seat);
          },
          // `/api/auth/organization/update-member-role` is HTTP-reachable and is a
          // second promotion path alongside our own `/api/members/:id/role`; gate
          // it the same way. Only client → staff claims a NEW seat.
          beforeUpdateMemberRole: async ({ member, newRole, organization: org }) => {
            if (newRole === "client" || member.role !== "client") return;
            const seat = await checkStaffSeat(env.DB, org.id);
            if (!seat.ok) throw seatError(seat);
          },
        },
        // Staff invite delivery (SPEC §4): the owner invites a trainer/assistant
        // by email → a branded email with an /accept-invitation/<id> deep link.
        // Acceptance is belt-and-suspenders: the accept screen calls Better
        // Auth's accept-invitation, and /api/context also auto-accepts a pending
        // invite matching the signed-in email (mirroring the client auto-link),
        // so the membership is minted the moment they verify their code even if
        // the deep link is lost. Without this the invite silently dead-ended.
        async sendInvitationEmail(data) {
          const acceptUrl = `${baseURL.replace(/\/$/, "")}/accept-invitation/${data.id}`;
          const brand = await tenantBrandKit(env.DB, data.organization.id).catch(() => KOVA_BRAND);
          const inviter = data.inviter.user.name || data.inviter.user.email || "Your studio";
          const roleLabel = data.role === "assistant" ? "an assistant" : "a coach";
          const html = emailShell(
            `You're invited to ${escapeHtml(brand.name)}`,
            `<p style="margin:0 0 4px">${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(data.organization.name)}</strong> as ${roleLabel}.</p>
             <p style="margin:0">Accept to set up your account — you'll sign in with a one-time code, no password to create.</p>
             ${emailButton("Accept invitation", acceptUrl, brand)}
             <p style="margin:18px 0 0;color:#8b9099;font-size:13px;line-height:1.6">If you weren't expecting this, you can safely ignore this email.</p>`,
            { brand, preheader: `Join ${brand.name} on Kova`, eyebrow: "Staff invitation" },
          );
          const text = `${inviter} invited you to join ${data.organization.name} as ${roleLabel}. Accept your invitation: ${acceptUrl}`;
          await sendTenantEmail(env, data.organization.id, {
            to: data.email,
            subject: `Join ${brand.name}`,
            html,
            text,
            brandName: brand.name,
          })
            .catch((e: unknown) => ({ ok: false as const, skipped: undefined, error: e instanceof Error ? e.message : String(e) }))
            .then((r) => {
              // Better Auth calls this fire-and-forget — the result cannot be
              // threaded back into the API response. So at minimum it must not
              // vanish: an invitation whose email never went out looks identical
              // to one that did, and the invitee is simply never contacted. The
              // accept link stays reachable from the Staff screen, which is the
              // manual path out.
              if (!r.ok) {
                console.warn(`[invite] staff invitation to ${data.email} for org ${data.organization.id} was NOT emailed: ${r.skipped ?? r.error ?? "unknown"} — the accept link must be shared manually`);
              }
            });
        },
      }),
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
          // Deliver the code. The mock provider only "succeeds" on the dev lane
          // (localhost or ENVIRONMENT=development) — in production a deploy left
          // on the mock (or with no provider configured) fails closed. Surface
          // that failure LOUDLY: throw so Better Auth returns a non-200 the login
          // UI can show, instead of the silent "code sent" lie that would strand
          // first sign-in on a misconfigured production worker.
          const res = await sendEmail(
            env.DB,
            {
              to: email,
              subject: `${otp} is your Kova code`,
              html: emailShell(
                "Your sign-in code",
                `<p style="margin:0 0 20px">Enter this code to finish signing in. It expires in 10 minutes and works once.</p>
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:#1e2126;border:1px solid #23262c;border-radius:18px;padding:22px 0">
                   <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#e8eaed;padding-left:10px">${otp}</div>
                 </td></tr></table>
                 <p style="margin:20px 0 0;color:#8b9099;font-size:13px;line-height:1.6">If you didn't request this, you can safely ignore it — no changes will be made.</p>`,
                { brand: KOVA_BRAND, preheader: `${otp} is your Kova sign-in code (expires in 10 minutes).` },
              ),
              text: `Your Kova code is ${otp} (expires in 10 minutes).`,
            },
            env.EMAIL,
            undefined,
            devLane,
          ).catch((err) => ({ ok: false, error: String(err) }));
          if (!res.ok) {
            await logAuthEvent(env.DB, "otp-send-failed", email, false);
            throw new Error("otp_delivery_failed");
          }
          await logAuthEvent(env.DB, "otp-request", email, true);
        },
      }),
      // One-tap re-auth once enrolled; multiple passkeys per user.
      passkey({
        rpName: "Kova",
        // One credential for every door under our root; host-scoped elsewhere.
        // `rpIdFor` returns "localhost" for every loopback host, which is what
        // keeps dev and the E2E suite (on `*.localhost`) enrolling passkeys.
        rpID: shape ? rpIdFor(shape) : baseURL.startsWith("https") ? new URL(baseURL).hostname : "localhost",
        // WebAuthn verifies the ceremony's origin against this. In local dev the
        // page runs on Vite (:5173) while this worker is :8787, so pin BOTH (same
        // set as trustedOrigins) or registration fails with an origin mismatch.
        // In prod the request origin is the one true serving origin.
        origin: trustedOrigins ?? baseURL,
      }),
    ],

    // App + API share one origin; secure cookies only on https (local dev is http).
    //
    // `crossSubDomainCookies` is what makes one sign-in cover every studio: the
    // session cookie is issued for `.kova.4dl.app`, so `acme.kova.4dl.app` and
    // `bolt.kova.4dl.app` are the same session and the studio switcher is a
    // navigation rather than a re-authentication. It is NOT sent to
    // `otherapp.4dl.app` — a Domain of `kova.4dl.app` matches that name and its
    // subdomains only — so unrelated apps in the same zone are unaffected.
    //
    // Left off (host-only cookies) for custom domains, which have no shared parent
    // to widen to, and for `localhost`, which browsers reject a Domain attribute
    // for. The latter means dev keeps a separate session per `*.localhost` host;
    // that is a dev-only difference from production, called out in `cookieDomainFor`.
    advanced: {
      cookiePrefix: "kova",
      useSecureCookies: baseURL.startsWith("https"),
      ...(shape && cookieDomainFor(shape)
        ? { crossSubDomainCookies: { enabled: true, domain: `.${cookieDomainFor(shape)}` } }
        : {}),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
