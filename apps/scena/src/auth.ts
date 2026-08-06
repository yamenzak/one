/**
 * THE AUTH INSTANCE — `@4dl/auth`'s factory, bound to Scena.
 *
 * The factory owns everything identical across 4DL apps: the plugin set, the
 * fail-closed secret handling, the freshness override that lets a week-old
 * session enroll a passkey, the host-derived rpID and cookie Domain, and the
 * three doors to a staff seat. This file supplies what is Scena's: the RBAC
 * registry, the display name and cookie prefix, the seat quota, the two emails
 * it sends, and the one thing no other app here asks for — the STATION
 * CREDENTIAL lane.
 *
 * ── What changed, and what it cost ─────────────────────────────────────────
 *
 * Scena's own factory offered FOUR ways in: email OTP, magic link, Google, and
 * email+password. Three of them are gone.
 *
 *   • **Password sign-in for people is gone.** Staff were provisioned by an
 *     admin with a username and a password typed into a form and read back out
 *     of the roster screen. They are invited by email now and sign in with a
 *     code or a passkey, like everyone else on this platform. The admin never
 *     chooses, sees, or resets anyone's credential — there is none to see.
 *   • **Magic links are gone.** A sign-in link in an inbox is a bearer token
 *     with a mail server's security model; the six-digit code does the same job
 *     and cannot be forwarded by an autoscanner following every link in a
 *     message.
 *   • **Google is gone.** It was optional and unconfigured, and every account it
 *     would have created is reachable by the code lane anyway.
 *
 * ── The one exception, and why it is not a relaxation ──────────────────────
 *
 * `stationCredentials` opts into Better Auth's credential provider for STATION
 * accounts only: the shared devices behind a counter's "call next" button. They
 * have no inbox, the device is shared, and the action repeats dozens of times an
 * hour — emailing a code to press Next is a control that gets worked around with
 * a taped-up shared login inside a week. `@4dl/auth` makes the distinction
 * checkable rather than conventional: every station address ends in the
 * non-routable `@bd.scena`, `isStationPrincipal` is the one place that is asked,
 * and `station-credentials.test.ts` asserts no routable address is ever issued
 * one.
 */

import {
  createAuth as buildAuth,
  checkStaffSeat as sharedCheckStaffSeat,
  type Auth as SharedAuth,
  type AuthBindings,
  type SeatConfig,
  type SeatVerdict,
} from "@4dl/auth";
import type { HostShape } from "@4dl/tenancy";
import { ac, roles, CREATOR_ROLE, SEAT_FREE_ROLES } from "./access.js";
import { sendEmail, emailShell } from "./mailer.js";
import { withinQuota } from "./billing-store.js";
import type { Env } from "./env.js";

export type { SeatVerdict };

/** The non-routable suffix every station account's synthetic address carries.
 *  Exported because `board-users.ts` mints those addresses and the two must not
 *  drift — a station whose address does not end in this is, to every check in
 *  `@4dl/auth`, an ordinary person holding a password. */
export const STATION_DOMAIN = "@bd.scena";

/**
 * A staff seat is a `member` row whose role is not seat-free — the OWNER
 * INCLUDED, because the quota's label is "owner + staff".
 *
 * Both BOARD roles are seat-free, and that is the whole reason `@4dl/auth`'s
 * seat-free set is a list rather than one string: board users are minted per
 * board, so a clinic with eight rooms has eight of them and would otherwise
 * exhaust its plan before hiring anybody.
 */
const seatConfig = (env: AuthBindings): SeatConfig => ({
  seatFreeRoles: SEAT_FREE_ROLES,
  quota: (tenantId, used) => withinQuota(env.DB, tenantId, "seats", used),
});

/**
 * `countPending` must be passed through, not defaulted. A pending invitation is
 * a RESERVED seat, so it counts when CREATING one — else a tenant with a single
 * seat left sends five invitations and four fail at the moment a real person
 * clicks accept. It must NOT count when ACCEPTING one, because the invitation
 * being accepted would count itself and refuse the last seat.
 */
export const checkStaffSeat = (
  db: D1Database,
  tenantId: string,
  opts: { countPending?: boolean } = {},
): Promise<SeatVerdict> => sharedCheckStaffSeat(db, tenantId, seatConfig({ DB: db } as AuthBindings), opts);

/** Build the per-request auth instance. Bindings are request-scoped on Workers,
 *  so this cannot be hoisted to module scope. */
export function createAuth(env: Env, origin?: string, shape?: HostShape): SharedAuth {
  return buildAuth(env, origin, shape, {
    ac: ac as never,
    roles,
    creatorRole: CREATOR_ROLE,
    seatFreeRoles: SEAT_FREE_ROLES,
    // What the OS passkey prompt shows when someone saves a credential.
    rpName: "Scena",
    // Changing this invalidates every session cookie already issued under the
    // old prefix — cheap to set now, expensive later.
    cookiePrefix: "scena",
    seats: seatConfig,
    stationCredentials: { stationDomain: STATION_DOMAIN },

    /**
     * ⚠️ THROWING is correct here. Better Auth invokes this inside
     * `runInBackgroundOrAwait`, which swallows a throw and still answers
     * `200 {"success":true}` — so a silent failure advances the UI to a
     * code-entry screen for a code that was never sent.
     */
    async sendOtp(e, { email, otp }) {
      const res = await sendEmail(
        e as Env,
        {
          to: email,
          subject: `${otp} is your Scena code`,
          html: emailShell(
            "Your Scena sign-in code",
            `<p>Enter this code to continue. It expires in 10 minutes and can be used once.</p>
             <div style="font-size:30px;font-weight:800;letter-spacing:8px;margin:14px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${otp}</div>
             <p style="color:#64748b;font-size:13px">If you didn't request this, you can ignore it.</p>`,
          ),
          text: `Your Scena code is ${otp} (expires in 10 minutes).`,
        },
        (e as Env).EMAIL,
      ).catch((err: unknown) => ({ ok: false, error: String(err) }));
      if (!res.ok) throw new Error("otp_delivery_failed");
    },

    async sendInvitation(e, data) {
      const res = await sendEmail(
        e as Env,
        {
          to: data.email,
          subject: `Join ${data.organization.name} on Scena`,
          html: emailShell(
            `You're invited to ${data.organization.name}`,
            `<p>Accept to set up your account — you'll sign in with a one-time code, no password to create.</p>
             <p><a href="${data.acceptUrl}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#6d28d9;color:#fff;text-decoration:none">Accept invitation</a></p>`,
          ),
          text: `You've been invited to join ${data.organization.name}: ${data.acceptUrl}`,
        },
        (e as Env).EMAIL,
      ).catch((err: unknown) => ({ ok: false, error: String(err) }));
      if (!res.ok) throw new Error(res.error ?? "invite_delivery_failed");
    },
  });
}

export type Auth = SharedAuth;
