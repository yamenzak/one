/**
 * THE ROSTER — invite, revoke, re-role, remove. `@4dl/auth`'s `staffRoutes`.
 *
 * The package owns the whole thing: the host-pinned tenancy, the three seat
 * doors (invite, accept, re-role — a seat check on only the first lets a tenant
 * over its ceiling by inviting while a member is pending), the grant algebra,
 * and the roster read that folds PENDING INVITATIONS into the same list. That
 * last one is not cosmetic: a roster that shows only accepted members makes an
 * invitation that has not landed indistinguishable from one never sent, and the
 * owner's response is to send another.
 *
 * What is the app's, and all of it is copy or policy:
 *
 *   ROLE COPY   sent to the client rather than restated there. A screen that
 *               hard-codes the list drifts the moment a role is added, and
 *               drifts SILENTLY — the new role is assignable through the API and
 *               simply absent from the picker.
 *   SEAT-FREE   which roles do not consume a paid seat. Here: the customer,
 *               because they are the tenant's customer rather than its staff.
 *               An app whose every member is staff passes a sentinel nobody
 *               holds.
 *   THE INVITE  the email, and the URL it points at.
 */

import { staffRoutes as sharedStaffRoutes, type StaffRoleMeta } from "@4dl/auth";
import { emailButton, emailShell, escapeHtml } from "@4dl/email";
import { type AppEnv } from "./auth-context.js";
import { CREATOR_ROLE, CUSTOMER_ROLE, roles, statement, type RoleName } from "./access.js";
import { checkStaffSeat } from "./auth.js";
import { canonicalHost } from "./host-context.js";
import { sendTenantEmail } from "./email-provider.js";
import { APP_BRAND } from "./mailer.js";
import { tenantEntitlements } from "./billing-store.js";
import type { Env } from "./env.js";

const ROLE_NAMES = Object.keys(roles) as RoleName[];

/** What each role is FOR, in the words the product uses. */
const ROLE_COPY: Record<RoleName, StaffRoleMeta> = {
  owner: { label: "Owner", blurb: "Everything, including billing, staff and settings." },
  customer: { label: "Customer", blurb: "The people this tenant serves. Sees their own records and nothing else." },
};

/** The invitation link Better Auth will accept. Must match its own `sendInvitationEmail`. */
const acceptUrl = (origin: string, id: string) => `${origin.replace(/\/$/, "")}/accept-invitation/${id}`;

export const staffRoutes = sharedStaffRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    const tenantId = c.get("tenantId");
    return user && tenantId ? { tenantId, userId: user.id, role: c.get("role") ?? "" } : null;
  },
  creatorRole: CREATOR_ROLE,
  seatFreeRoles: [CUSTOMER_ROLE],
  roleNames: ROLE_NAMES,
  roleCopy: ROLE_COPY,
  roleGrants: Object.fromEntries(
    ROLE_NAMES.map((name) => [name, (roles[name] as unknown as { statements: Record<string, readonly string[]> }).statements]),
  ),
  catalog: statement as unknown as Record<string, readonly string[]>,
  checkSeat: (db, tenantId) => checkStaffSeat(db, tenantId),
  seatCeiling: async (db, tenantId) => (await tenantEntitlements(db, tenantId)).quotas.staffSeats,
  copy: {
    forbidden: "Only an owner can manage the team.",
    alreadyStaff: "That person is already on the team.",
  },
  /**
   * ⚠️ The link points at the TENANT'S OWN hostname, not at whatever origin this
   * request arrived on. An owner who happens to be on the operator door, or on a
   * custom domain mid-migration, must not mint a link that lands somewhere the
   * invitee cannot sign in.
   */
  sendInvite: async (c, inv) => {
    const host = await canonicalHost(c.env as Env, c.env.DB, inv.tenantId);
    const url = acceptUrl(`https://${host}`, inv.invitationId);
    const orgName = inv.tenantName || "the workspace";
    return sendTenantEmail(c.env as Env, inv.tenantId, {
      to: inv.email,
      subject: `Join ${orgName}`,
      html: emailShell(
        `You're invited to ${escapeHtml(orgName)}`,
        `<p style="margin:0">Accept to set up your account — you'll sign in with a one-time code, no password to create.</p>
         ${emailButton("Accept invitation", url, APP_BRAND)}`,
        { brand: APP_BRAND, eyebrow: "Invitation" },
      ),
      text: `You've been invited to join ${orgName}: ${url}`,
    })
      .then((r) => ({ ok: r.ok, error: r.ok ? null : (r.skipped ?? r.error ?? "unknown"), url }))
      /*
        The link comes back even when the mail did NOT — that is what makes an
        invitation survive a misconfigured mailer. The owner can copy it into a
        message they send themselves, which is the difference between "email is
        broken" and "nobody can be added to this workspace".
      */
      .catch((e) => ({ ok: false, error: String(e), url }));
  },
});
