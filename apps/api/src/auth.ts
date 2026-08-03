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
import { sendEmail, emailShell, emailButton, escapeHtml, bareAddress, KOVA_BRAND, PLATFORM_FROM_DEFAULT, type BrandKit } from "./mailer.js";
import { sendTenantEmail } from "./email-provider.js";
import { tenantBrandKit } from "./notify.js";
import { resolveHost, hostnameOf } from "./host-context.js";

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

/**
 * Whose name a door's sign-in code goes out under.
 *
 * PURE, and separated from the lookup for that reason: which doors are the
 * studio's and which are the platform's is the whole decision, and it is one
 * character away from leaking the vendor's name to every client of every
 * studio — or, the other way, from telling an owner creating their first studio
 * that a code came from a studio that does not exist yet.
 *
 * `tenant` and `custom` are a studio's addresses. The root, `setup.` and
 * `admin.` are ours: nobody signing in there is a studio's customer, and on
 * `setup.` there is not even a studio to name.
 */
export const otpWearsTenantBrand = (shape?: HostShape): boolean =>
  shape?.role === "tenant" || shape?.role === "custom";

/**
 * The brand for a sign-in code, resolved from the door it was requested at.
 *
 * Falls back to Kova on ANY failure, including a studio door whose tenant
 * cannot be resolved: a sign-in code that does not go out because a branding
 * lookup threw is a locked door, and the platform's name on it is a far smaller
 * problem than that.
 */
async function otpBrand(env: Env, origin?: string, shape?: HostShape): Promise<BrandKit> {
  if (!otpWearsTenantBrand(shape) || !origin) return KOVA_BRAND;
  try {
    const host = await resolveHost(env.DB, hostnameOf(origin), env);
    if (!host.tenant) return KOVA_BRAND;
    const brand = await tenantBrandKit(env.DB, host.tenant.tenantId);
    return brand.name ? brand : KOVA_BRAND;
  } catch {
    return KOVA_BRAND;
  }
}

/**
 * The From line for a branded platform-lane email.
 *
 * The NAME is the studio's; the ADDRESS stays the platform's, because that is
 * the domain Cloudflare authenticated and no studio's DNS is.
 */
const senderAs = (brand: BrandKit): string | undefined =>
  brand.name && brand.name !== KOVA_BRAND.name ? `${brand.name} <${bareAddress(PLATFORM_FROM_DEFAULT)}>` : undefined;

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

    /**
     * The sign-in code, wearing the brand of the door it was asked for.
     *
     * This is the ONE email every person in the system receives, and it used to
     * say "your Kova code" to all of them. For a client of byShujaa signing in
     * at `coaching.byshujaa.com` that is the vendor's name arriving unannounced
     * in the inbox of someone who has never heard of it — the white label coming
     * off on the single message that reaches the most people.
     *
     * `@4dl/email` states the rule this seems to break: sign-in codes are the
     * PLATFORM's identity, because a tenant's colours on a "your subscription
     * lapsed" notice would be a small lie. That is right about receipts and
     * dunning, which are Kova billing a studio. It is wrong about this one,
     * because the distinction that matters is WHO IS READING: a studio's
     * customer gets the studio's brand, and a studio's owner dealing with Kova
     * gets Kova's.
     *
     * The host already answers that, as it does everywhere else here. A studio
     * door — subdomain or the studio's own domain — is the studio's brand; the
     * platform doors (root, `setup.`, `admin.`) are Kova's. The FROM name goes
     * with it, since a display name saying Kova above a body saying byShujaa is
     * the leak with an extra step.
     *
     * The ADDRESS stays the platform's: it is the domain that is authenticated,
     * and no studio's DNS is.
     */
    async sendOtp(e, { email, otp, devLane }) {
      const env = e as Env;
      const brand = await otpBrand(env, origin, shape);
      const res = await sendEmail(
        // The ENV, so a provider set once in the shared platform store reaches
        // the sign-in code — the one email a deployment cannot do without.
        env,
        {
          to: email,
          subject: `${otp} is your ${brand.name} code`,
          html: emailShell(
            "Your sign-in code",
            `<p style="margin:0 0 20px">Enter this code to finish signing in. It expires in 10 minutes and works once.</p>
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:#1e2126;border:1px solid #23262c;border-radius:18px;padding:22px 0">
               <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#e8eaed;padding-left:10px">${otp}</div>
             </td></tr></table>
             <p style="margin:20px 0 0;color:#8b9099;font-size:13px;line-height:1.6">If you didn't request this, you can safely ignore it — no changes will be made.</p>`,
            { brand, preheader: `${otp} is your ${brand.name} sign-in code (expires in 10 minutes).` },
          ),
          text: `Your ${brand.name} code is ${otp} (expires in 10 minutes).`,
        },
        env.EMAIL,
        senderAs(brand),
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
        { brand, preheader: `Join ${brand.name}`, eyebrow: "Staff invitation" },
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
