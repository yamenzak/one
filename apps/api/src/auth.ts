/**
 * Kova's auth instance — `@4dl/auth`'s factory, bound to Kova's registry and copy.
 *
 * The shared factory owns everything that is the same for every 4DL app: the
 * passwordless plugin set (emailed code + passkey, no password provider), the
 * fail-closed secret handling, the freshness override that lets a week-old
 * session enroll a passkey, the host-derived rpID and cookie Domain, and the
 * THREE doors to a staff seat.
 *
 * This file supplies what is Kova's: the RBAC roles, the display name and cookie
 * prefix, the two emails, the seat quota, and the rule that an assistant seat is
 * only sellable to a tenant whose plan includes the front desk.
 */
import { APIError } from "better-auth";
import {
  checkStaffSeat as sharedCheckStaffSeat,
  createAuth as buildAuth,
  pendingStaffSeats as sharedPendingStaffSeats,
  staffSeatsUsed as sharedStaffSeatsUsed,
  type Auth as SharedAuth,
  type AuthBindings,
  type SeatConfig,
  type SeatVerdict,
} from "@4dl/auth";
import type { HostShape } from "@4dl/tenancy";
import type { Env } from "./env.js";
import { ac, roles } from "./access.js";
import { withinQuota, hasFeature } from "./billing-store.js";
import { sendEmail, emailShell, emailButton, escapeHtml, KOVA_BRAND } from "./mailer.js";
import { sendTenantEmail } from "./email-provider.js";
import { tenantBrandKit } from "./notify.js";

export { logAuthEvent, recentAuthEvents } from "@4dl/auth";
export type { SeatVerdict };

/**
 * A staff seat is a `member` row whose role is not `client` — **the owner
 * included**, because the quota's own label is "Owner + trainers + assistants"
 * (`@kova/domain` entitlements.ts) and `checkDowngrade` counts it the same way.
 * So Free/Solo (`staffSeats: 1`) is a one-coach studio by design.
 */
const seatConfig = (env: AuthBindings): SeatConfig => ({
  customerRole: "client",
  quota: (tenantId, used) => withinQuota(env.DB, tenantId, "staffSeats", used),
});

export const staffSeatsUsed = (db: D1Database, tenantId: string): Promise<number> =>
  sharedStaffSeatsUsed(db, tenantId, "client");

export const pendingStaffSeats = (db: D1Database, tenantId: string): Promise<number> =>
  sharedPendingStaffSeats(db, tenantId, "client");

export const checkStaffSeat = (
  db: D1Database,
  tenantId: string,
  opts: { countPending?: boolean } = {},
): Promise<SeatVerdict> => sharedCheckStaffSeat(db, tenantId, seatConfig({ DB: db } as AuthBindings), opts);

/** Build the per-request auth instance. */
export function createAuth(env: Env, origin?: string, shape?: HostShape): SharedAuth {
  return buildAuth(env, origin, shape, {
    ac: ac as never,
    roles,
    creatorRole: "owner",
    customerRole: "client",
    rpName: "Kova",
    cookiePrefix: "kova",
    seats: seatConfig,

    /**
     * The assistant ROLE is half of what `frontDesk` sells (SPEC §5), so a tenant
     * without it may not invite one. Gated here as well as on the role-change
     * route (`member-routes.ts`) because those are two independent doors to the
     * same seat, and closing only one leaves the capability purchasable by the
     * other.
     */
    async checkInviteRole(e, tenantId, role) {
      if (role !== "assistant") return null;
      if (await hasFeature((e as Env).DB, tenantId, "frontDesk")) return null;
      return "The front-desk assistant role isn't included in this plan. Upgrade to invite an assistant, or invite them as a coach instead.";
    },

    async sendOtp(e, { email, otp, devLane }) {
      const res = await sendEmail(
        // The ENV, so a provider set once in the shared platform store reaches
        // the sign-in code — the one email a deployment cannot do without.
        e as Env,
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
        (e as Env).EMAIL,
        undefined,
        devLane,
      ).catch((err) => ({ ok: false, error: String(err) }));
      // The shared factory logs the failure and rethrows; the pre-flight in
      // `otp-guard.ts` is what actually stops the "we sent you a code" lie.
      if (!res.ok) throw new Error("otp_delivery_failed");
    },

    /**
     * Staff invite delivery (SPEC §4). Acceptance is belt-and-suspenders: the
     * accept screen calls Better Auth's accept-invitation, and `/api/context`
     * also auto-accepts a pending invite matching the signed-in email (mirroring
     * the client auto-link), so the membership is minted the moment they verify
     * their code even if the deep link is lost.
     */
    async sendInvitation(e, data) {
      const env2 = e as Env;
      const brand = await tenantBrandKit(env2.DB, data.organization.id).catch(() => KOVA_BRAND);
      const inviter = data.inviter.user.name || data.inviter.user.email || "Your studio";
      const roleLabel = data.role === "assistant" ? "an assistant" : "a coach";
      const html = emailShell(
        `You're invited to ${escapeHtml(brand.name)}`,
        `<p style="margin:0 0 4px">${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(data.organization.name)}</strong> as ${roleLabel}.</p>
         <p style="margin:0">Accept to set up your account — you'll sign in with a one-time code, no password to create.</p>
         ${emailButton("Accept invitation", data.acceptUrl, brand)}
         <p style="margin:18px 0 0;color:#8b9099;font-size:13px;line-height:1.6">If you weren't expecting this, you can safely ignore this email.</p>`,
        { brand, preheader: `Join ${brand.name} on Kova`, eyebrow: "Staff invitation" },
      );
      const text = `${inviter} invited you to join ${data.organization.name} as ${roleLabel}. Accept your invitation: ${data.acceptUrl}`;
      const r = await sendTenantEmail(env2, data.organization.id, {
        to: data.email,
        subject: `Join ${brand.name}`,
        html,
        text,
        brandName: brand.name,
      });
      if (!r.ok) throw new Error(r.skipped ?? r.error ?? "unknown");
    },
  });
}

export type Auth = SharedAuth;

// Re-exported so the seat-rejection shape stays available to member-routes.
export { APIError };
