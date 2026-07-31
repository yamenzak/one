/**
 * THE AUTH INSTANCE — `@4dl/auth`'s factory, bound to this app.
 *
 * The factory owns everything identical across 4DL apps: the passwordless
 * plugin set (emailed code + passkey, **no password provider**), fail-closed
 * secret handling, the freshness override that lets a week-old session enroll a
 * passkey, the host-derived rpID and cookie Domain, and the three doors to a
 * staff seat.
 *
 * This file supplies what is the app's: the RBAC registry, the display name and
 * cookie prefix, the seat quota, and the two emails it sends.
 *
 * ⚠️ The two `send*` callbacks must THROW on failure. Better Auth invokes them
 * inside `runInBackgroundOrAwait`, which swallows the throw and still returns
 * `200 {"success":true}` — so a silent failure advances the UI to a code-entry
 * screen for a code that was never sent. `@4dl/email`'s `emailDeliverable()` is
 * the pre-flight that actually stops that lie; wire it in the OTP guard.
 */

import {
  createAuth as buildAuth,
  checkStaffSeat as sharedCheckStaffSeat,
  type Auth as SharedAuth,
  type AuthBindings,
  type SeatConfig,
  type SeatVerdict,
} from "@4dl/auth";
import { emailShell, emailButton, escapeHtml, sendEmail } from "@4dl/email";
import type { HostShape } from "@4dl/tenancy";
import { ac, roles, CREATOR_ROLE, CUSTOMER_ROLE } from "./access.js";
import { withinQuota } from "./entitlements.js";
import { sendTenantEmail } from "./email-provider.js";
import { APP_BRAND } from "./mailer.js";
import type { Env } from "./env.js";

export type { SeatVerdict };

/**
 * A staff seat is a `member` row whose role is not the customer role — **the
 * owner included**, because the quota's label is "owner + staff". A plan with
 * `staffSeats: 1` is therefore a one-person tenant by design. Decide which
 * reading you want before you price it.
 */
const seatConfig = (env: AuthBindings): SeatConfig => ({
  customerRole: CUSTOMER_ROLE,
  quota: (tenantId, used) => withinQuota(env.DB, tenantId, "staffSeats", used),
});

export const checkStaffSeat = (db: D1Database, tenantId: string): Promise<SeatVerdict> =>
  sharedCheckStaffSeat(db, tenantId, seatConfig({ DB: db } as AuthBindings));

/** Build the per-request auth instance. */
export function createAuth(env: Env, origin?: string, shape?: HostShape): SharedAuth {
  return buildAuth(env, origin, shape, {
    ac: ac as never,
    roles,
    creatorRole: CREATOR_ROLE,
    customerRole: CUSTOMER_ROLE,
    rpName: "Template",
    cookiePrefix: "template",
    seats: seatConfig,

    async sendOtp(e, { email, otp, devLane }) {
      const res = await sendEmail(
        (e as Env).DB,
        {
          to: email,
          subject: `${otp} is your sign-in code`,
          html: emailShell(
            "Your sign-in code",
            `<p style="margin:0 0 20px">Enter this code to finish signing in. It expires in 10 minutes and works once.</p>
             <div style="font-family:ui-monospace,monospace;font-size:32px;font-weight:800;letter-spacing:8px">${otp}</div>`,
            { brand: APP_BRAND, preheader: `${otp} is your sign-in code.` },
          ),
          text: `Your code is ${otp} (expires in 10 minutes).`,
        },
        (e as Env).EMAIL,
        undefined,
        devLane,
      ).catch((err) => ({ ok: false, error: String(err) }));
      if (!res.ok) throw new Error("otp_delivery_failed");
    },

    async sendInvitation(e, data) {
      const r = await sendTenantEmail(e as Env, data.organization.id, {
        to: data.email,
        subject: `Join ${data.organization.name}`,
        html: emailShell(
          `You're invited to ${escapeHtml(data.organization.name)}`,
          `<p style="margin:0">Accept to set up your account — you'll sign in with a one-time code, no password to create.</p>
           ${emailButton("Accept invitation", data.acceptUrl, APP_BRAND)}`,
          { brand: APP_BRAND, eyebrow: "Invitation" },
        ),
        text: `You've been invited to join ${data.organization.name}: ${data.acceptUrl}`,
      });
      if (!r.ok) throw new Error(r.skipped ?? r.error ?? "unknown");
    },
  });
}

export type Auth = SharedAuth;
