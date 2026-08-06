/**
 * STAFF, Scena's half.
 *
 * The routes are `@4dl/auth`'s `staffRoutes` — the host-pinned tenancy, the seat
 * accounting that counts a pending invitation as a reserved seat, and the three
 * guards that are each a permanent lockout if missing (not yourself, never the
 * last owner, no seat check on a sideways move). Read that file's header before
 * changing any of them; the reasons are not obvious from a call site.
 *
 * ── What went away ────────────────────────────────────────────────────────
 *
 * Four routes, and each was a hole:
 *
 *   POST /api/members            provisioned a colleague WITH A PASSWORD the
 *                                admin chose. Gone — invitations now.
 *   POST /api/members/:id/password
 *                                let an admin set that password again. Gone for
 *                                the same reason: an account whose credential
 *                                its administrator knows cannot attribute
 *                                anything to the person holding it.
 *   POST /api/username/resolve   PUBLIC handle → login address. It was a
 *   GET  /api/username/available public enumeration oracle over every account on
 *                                the platform, and it existed only to make
 *                                username sign-in work. Nothing signs in with a
 *                                handle any more.
 *   POST /api/username/claim     the owner's handle. Same.
 *
 * ── What is still Scena's ─────────────────────────────────────────────────
 *
 * The PER-MEMBER GRANT. Scena lets an owner narrow a member below their role —
 * a receptionist who may operate the queue board but not the room board — which
 * no other app here does, so it is not in the shared routes. It is now bounded:
 * `resolvePermissions` intersects the stored grant with the role preset, so this
 * route can only ever take capability away. It used to be able to add it.
 */

import { Hono } from "hono";
import { staffRoutes as sharedStaffRoutes, type StaffRoleMeta } from "@4dl/auth";
import { emailShell, sendEmail } from "./mailer.js";
import type { AppEnv } from "./auth-context.js";
import { tenantOf } from "./auth-context.js";
import { CREATOR_ROLE, SEAT_FREE_ROLES, ROLE_NAMES, roles, statement, type RoleName } from "./access.js";
import { checkStaffSeat } from "./auth.js";
import { sanitizePermissions } from "./perms.js";
import { listTenantMembers, orgSlug } from "./members.js";
import { tenantEntitlements } from "./billing-store.js";
import type { Env } from "./env.js";

/**
 * What each role is FOR, in the words Scena uses.
 *
 * Sent to the client rather than restated there: a screen that hard-codes the
 * list drifts the moment a role is added, and drifts silently — the new role is
 * assignable through the API and simply absent from the picker.
 */
const ROLE_COPY: Record<(typeof ROLE_NAMES)[number], StaffRoleMeta> = {
  owner: { label: "Owner", blurb: "Everything, including billing, the team and settings." },
  operator: { label: "Operator", blurb: "Runs the fleet and the content. No billing changes." },
  receptionist: { label: "Front desk", blurb: "Live boards and stations only — no content or settings." },
  viewer: { label: "Viewer", blurb: "Reads screens, content and analytics. Writes nothing." },
};

/** The invitation link Better Auth will accept. Must match its own `sendInvitationEmail`. */
const acceptUrl = (origin: string, id: string) => `${origin.replace(/\/$/, "")}/accept-invitation/${id}`;

const staff = sharedStaffRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    const tenantId = c.get("tenantId");
    const role = c.get("role");
    return user && tenantId ? { tenantId, userId: user.id, role: role ?? "" } : null;
  },
  creatorRole: CREATOR_ROLE,
  seatFreeRoles: SEAT_FREE_ROLES,
  roleNames: ROLE_NAMES,
  roleCopy: ROLE_COPY,
  roleGrants: Object.fromEntries(
    ROLE_NAMES.map((name) => [name, (roles[name as RoleName] as unknown as { statements: Record<string, readonly string[]> }).statements]),
  ),
  catalog: statement as unknown as Record<string, readonly string[]>,
  /**
   * A BOARD role never becomes a staff role through this screen, and the reverse
   * is equally refused — `roleNames` omits both, so neither is invitable or
   * assignable. Promoting a station account to `operator` would hand a device
   * bolted to a wall in a waiting room the run of the fleet.
   */
  claimsSeat: (from, to) => SEAT_FREE_ROLES.includes(from) && !SEAT_FREE_ROLES.includes(to),
  checkSeat: (db, tenantId, opts) => checkStaffSeat(db, tenantId, opts),
  seatCeiling: async (db, tenantId) => (await tenantEntitlements(db, tenantId)).quotas.seats,
  copy: {
    forbidden: "Only an owner can manage the team.",
    alreadyStaff: "That person is already on your team.",
  },
  sendInvite: async (c, inv) => {
    const url = acceptUrl(new URL(c.req.url).origin, inv.invitationId);
    const orgName = inv.tenantName || "the workspace";
    return sendEmail(
      c.env.DB,
      {
        to: inv.email,
        subject: `Join ${orgName} on Scena`,
        html: emailShell(
          `You're invited to ${orgName}`,
          `<p>Accept to set up your account — you'll sign in with a one-time code, no password to create.</p>
           <p><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#6d28d9;color:#fff;text-decoration:none">Accept invitation</a></p>`,
        ),
        text: `You've been invited to join ${orgName}: ${url}`,
      },
      (c.env as Env).EMAIL,
    )
      .then((r) => ({ ok: r.ok, error: r.ok ? null : (r.skipped ? "email is not configured" : (r.error ?? "unknown")), url }))
      // The link comes back even when the mail did not — that is what makes an
      // invitation survive a misconfigured mailer.
      .catch((e: unknown) => ({ ok: false, error: String(e), url }));
  },
});

export function registerMemberRoutes(app: Hono<AppEnv>): void {
  app.route("/api", staff);

  /** Public: resolve a typed workspace (slug or name) → its canonical slug, so
   *  the sign-in surface can send someone to the right door. Returns only
   *  slug/name — no membership data — and is safe unauthenticated. */
  app.get("/api/org/resolve", async (c) => {
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return c.json({ error: "missing workspace" }, 400);
    const { resolveWorkspace } = await import("./members.js");
    const org = await resolveWorkspace(c.env.DB, q);
    if (!org) return c.json({ error: "not found" }, 404);
    return c.json({ slug: org.slug, name: org.name });
  });

  /**
   * The roster, with each member's EFFECTIVE grant.
   *
   * Kept beside `/api/staff` rather than replacing it: the shared route answers
   * "who is here and how many seats are left", this one answers "and what
   * exactly may each of them do", which is the input to Scena's permission
   * editor. Stage 7 folds them into one screen; only one of them will survive.
   */
  app.get("/api/members", async (c) => {
    const tenant = tenantOf(c);
    const [members, slug] = await Promise.all([listTenantMembers(c.env.DB, tenant), orgSlug(c.env.DB, tenant)]);
    return c.json({ members, loginSlug: slug, roles: ROLE_NAMES });
  });

  /**
   * Narrow a member below their role. An empty grant clears the override and the
   * role preset applies again.
   *
   * ⚠️ This can only ever REMOVE capability. `resolvePermissions` intersects the
   * stored blob with the role's preset, so a grant naming `billing: ["manage"]`
   * on a receptionist resolves to nothing. Before Stage 2 it resolved to
   * `billing: ["manage"]` — the preset was not consulted at all once a blob
   * existed, which made this route a privilege-escalation primitive for anyone
   * who could reach it.
   */
  app.post("/api/members/:id/permissions", async (c) => {
    const body = await c.req.json<{ permissions?: unknown }>().catch(() => ({}) as { permissions?: unknown });
    const grant = sanitizePermissions(body.permissions);
    const json = Object.keys(grant).length ? JSON.stringify(grant) : null;
    const res = await c.env.DB
      .prepare('UPDATE "member" SET permissions_json = ? WHERE id = ? AND organizationId = ?')
      .bind(json, c.req.param("id"), tenantOf(c))
      .run();
    if (!res.meta.changes) return c.json({ error: "Member not found." }, 404);
    return c.json({ ok: true });
  });
}
