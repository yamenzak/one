/**
 * STAFF, Kova's half.
 *
 * The routes are `@4dl/auth`'s `staffRoutes`. Kova could already SEND a staff
 * invitation — through Better Auth's own `organization/invite-member`, with a
 * branded email and the seat gate — and that has always worked. What it could
 * not do is SEE a pending invitation or REVOKE one: `/members` joined `member`
 * alone, so an invite sent to a mistyped address was invisible and stayed that
 * way until it expired. There was no way to remove a member either.
 *
 * Mounting the shared routes closes all three, and moves the invite off the
 * plugin so the tenancy is pinned from the HOST rather than from
 * `session.activeOrganizationId` — which for a coach who belongs to two studios
 * is whichever they joined first. Read `packages/auth/src/staff-routes.ts`
 * before changing any guard; each one is a permanent lockout if it goes.
 *
 * What is Kova's, and could not be anything else:
 *
 *   - the three STAFF roles, and `client` as a demotion target that must never
 *     be invitable — a client joins through the client-invite flow, which
 *     creates a client record, not a staff seat
 *   - `frontDesk`, the entitlement that sells the assistant role. Gated on the
 *     invite AND on the promotion, because closing one door leaves the other
 *   - the seat rule: only customer → staff claims a seat
 *   - the invitation email, on the studio's own rail with the studio's brand
 */

import { staffRoutes as sharedStaffRoutes, type StaffRoleMeta } from "@4dl/auth";
import { type AppEnv } from "./auth-context.js";
import { ac, roles, STAFF_ROLES } from "./access.js";
import { checkStaffSeat } from "./auth.js";
import { tenantEntitlements } from "./billing-store.js";
import { gateFeature } from "./client-flags.js";
import { canonicalHost } from "./host-context.js";
import { sendTenantEmail, explainSendError } from "./email-provider.js";
import { emailButton, emailShell, escapeHtml, KOVA_BRAND } from "./mailer.js";
import { tenantBrandKit } from "./notify.js";
import type { Env } from "./env.js";

/** What each staff role is FOR, in the words a studio uses. */
const ROLE_COPY: Record<string, StaffRoleMeta> = {
  owner: { label: "Owner", blurb: "Everything, including billing, staff and settings." },
  trainer: { label: "Coach", blurb: "Their own clients: plans, check-ins, progress and messages." },
  assistant: { label: "Front desk", blurb: "Bookings and the schedule across the studio. No coaching." },
};

/** Must match Better Auth's own `sendInvitationEmail` link shape. */
const acceptUrl = (origin: string, id: string) => `${origin.replace(/\/$/, "")}/accept-invitation/${id}`;

export const staffRoutes = sharedStaffRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    const tenantId = c.get("tenantId");
    return user && tenantId ? { tenantId, userId: user.id, role: c.get("role") ?? "" } : null;
  },
  creatorRole: "owner",
  roleNames: STAFF_ROLES,
  /**
   * `client` is a demotion target and NOT an invitable role. A studio moving
   * someone off staff sends them here; a studio adding a client uses the client
   * invite, which creates a client record with a package and an activation.
   * Letting the staff invite mint a `client` membership would produce a member
   * with no client record — visible in the roster, absent from the app.
   */
  assignableRoles: [...STAFF_ROLES, "client"],
  roleCopy: ROLE_COPY,
  roleGrants: Object.fromEntries(
    STAFF_ROLES.map((name) => [name, (roles[name] as unknown as { statements: Record<string, readonly string[]> }).statements]),
  ),
  catalog: (ac as unknown as { statements: Record<string, readonly string[]> }).statements,
  checkSeat: (db, tenantId, opts) => checkStaffSeat(db, tenantId, opts),
  seatCeiling: async (db, tenantId) => (await tenantEntitlements(db, tenantId)).quotas.staffSeats,
  /**
   * The assistant seat is the OTHER half of what `frontDesk` sells. Only the
   * sessions half used to be gated, so a studio on a plan without it could still
   * mint assistants — and `access.ts` grants that role real powers (whole-roster
   * read, the whole scheduling surface). Gating the ROLE closes the paid
   * capability at both doors, which is why this hook runs on invite and on
   * promotion rather than on one of them.
   */
  checkRole: async (c, _tenantId, role) => (role === "assistant" ? gateFeature(c, "sessions") : null),
  /**
   * Promoting a CLIENT-role member to staff claims a new staff seat — this was
   * an uncounted bypass once. Only this direction: a sideways staff→staff move
   * consumes nothing new (so a studio on its ceiling can still reshuffle), and a
   * demotion to `client` frees one.
   */
  claimsSeat: (from, to) => from === "client" && to !== "client",
  copy: {
    forbidden: "Only an owner can manage staff.",
    alreadyStaff: "That person is already on your staff.",
  },
  sendInvite: async (c, inv) => {
    const env = c.env as Env;
    const brand = await tenantBrandKit(env, inv.tenantId).catch(() => KOVA_BRAND);
    // The studio's OWN hostname, not whatever origin this request arrived on: an
    // owner standing on the operator door must not mint a link that lands
    // somewhere the invitee cannot sign in.
    const host = await canonicalHost(env, env.DB, inv.tenantId);
    const url = acceptUrl(`https://${host}`, inv.invitationId);
    const roleLabel = inv.role === "assistant" ? "an assistant" : "a coach";
    const orgName = inv.tenantName || brand.name;
    return sendTenantEmail(env, inv.tenantId, {
      to: inv.email,
      subject: `Join ${brand.name}`,
      html: emailShell(
        `You're invited to ${escapeHtml(brand.name)}`,
        `<p style="margin:0 0 4px">You've been invited to join <strong>${escapeHtml(orgName)}</strong> as ${roleLabel}.</p>
         <p style="margin:0">Accept to set up your account — you'll sign in with a one-time code, no password to create.</p>
         ${emailButton("Accept invitation", url, brand)}
         <p style="margin:18px 0 0;color:#8b9099;font-size:13px;line-height:1.6">If you weren't expecting this, you can safely ignore this email.</p>`,
        { brand, preheader: `Join ${brand.name}`, eyebrow: "Staff invitation" },
      ),
      text: `You've been invited to join ${orgName} as ${roleLabel}. Accept your invitation: ${url}`,
      brandName: brand.name,
    })
      // The link comes back even when the mail did not — that is what makes an
      // invitation survive a misconfigured mailer.
      //
      // The reason is EXPLAINED here rather than passed through raw. `@4dl/auth`
      // shows whatever this returns, and what a send returns is a provider
      // mechanic — an exception out of the Cloudflare binding, a `brevo 401`.
      // A manager reading "the email didn't send (unknown)" has been told
      // nothing; the commonest real cause is that Cloudflare only delivers to
      // verified destination addresses until the sending domain is onboarded,
      // and that is worth saying in words.
      .then((r) => ({ ok: r.ok, error: r.ok ? null : (r.skipped ?? explainSendError(r.error)), url }))
      .catch((e) => ({ ok: false, error: explainSendError(String(e)), url }));
  },
});
