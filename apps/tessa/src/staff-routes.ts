/**
 * STAFF, Tessa's half.
 *
 * The routes are `@4dl/auth`'s `staffRoutes` — the host-pinned tenancy, the
 * seat accounting that counts a pending invitation as a reserved seat, and the
 * three guards that are each a permanent lockout if missing (not yourself, never
 * the last owner, no seat check on a sideways move). Read that file's header
 * before changing any of them; the reasons are not obvious from a call site.
 *
 * What is Tessa's, and could not be anything else:
 *
 *   - the five ROLES and what each is for, in the words a centre uses
 *   - the invitation EMAIL, which is the centre's own message on the centre's
 *     own rail, pointing at the centre's own hostname
 *   - the sentences the refusals say ("staff", "the centre")
 */

import { staffRoutes as sharedStaffRoutes, type StaffRoleMeta } from "@4dl/auth";
import { emailButton, emailShell, escapeHtml } from "@4dl/email";
import { type AppEnv } from "./auth-context.js";
import { CREATOR_ROLE, roles, statement, type RoleName } from "./access.js";
import { checkStaffSeat } from "./auth.js";
import { canonicalHost } from "./host-context.js";
import { sendTenantEmail } from "./email-provider.js";
import { APP_BRAND } from "./mailer.js";
import { tenantEntitlements } from "./billing-store.js";
import type { Env } from "./env.js";

const ROLE_NAMES = Object.keys(roles) as RoleName[];

/**
 * What each role is FOR, in the words a centre uses.
 *
 * Sent to the client rather than restated there: a screen that hard-codes the
 * list drifts the moment a role is added, and drifts silently — the new role is
 * assignable through the API and simply absent from the picker.
 */
const ROLE_COPY: Record<RoleName, StaffRoleMeta> = {
  owner: { label: "Owner", blurb: "Everything, including billing, staff and settings." },
  stockKeeper: { label: "Stock", blurb: "Receives, moves and counts. Never releases a sterile load." },
  cssd: { label: "CSSD", blurb: "Builds packs, runs the autoclave, and performs the Freigabe." },
  clinical: { label: "Treatment room", blurb: "Opens packs, consumes stock, logs a case." },
  auditor: { label: "Auditor", blurb: "Reads everything. Writes nothing, and spends no AI credits." },
};

/** The invitation link Better Auth will accept. Must match its own `sendInvitationEmail`. */
const acceptUrl = (origin: string, id: string) => `${origin.replace(/\/$/, "")}/accept-invitation/${id}`;

export const staffRoutes = sharedStaffRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    const tenantId = c.get("tenantId");
    const role = c.get("role");
    return user && tenantId ? { tenantId, userId: user.id, role: role ?? "" } : null;
  },
  creatorRole: CREATOR_ROLE,
  roleNames: ROLE_NAMES,
  roleCopy: ROLE_COPY,
  roleGrants: Object.fromEntries(
    ROLE_NAMES.map((name) => [name, (roles[name] as unknown as { statements: Record<string, readonly string[]> }).statements]),
  ),
  catalog: statement as unknown as Record<string, readonly string[]>,
  checkSeat: (db, tenantId, opts) => checkStaffSeat(db, tenantId, opts),
  seatCeiling: async (db, tenantId) => (await tenantEntitlements(db, tenantId)).quotas.staffSeats,
  copy: {
    forbidden: "Only an owner can manage staff.",
    alreadyStaff: "That person is already on your staff.",
  },
  /**
   * The link points at the centre's OWN hostname, not at whatever origin this
   * request arrived on. An owner who happens to be on the operator door, or on a
   * custom domain mid-migration, must not mint a link that lands somewhere the
   * invitee cannot sign in.
   */
  sendInvite: async (c, inv) => {
    const host = await canonicalHost(c.env as Env, c.env.DB, inv.tenantId);
    const url = acceptUrl(`https://${host}`, inv.invitationId);
    const orgName = inv.tenantName || "the centre";
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
      // The link comes back even when the mail did not — that is what makes an
      // invitation survive a misconfigured mailer.
      .catch((e) => ({ ok: false, error: String(e), url }));
  },
});
