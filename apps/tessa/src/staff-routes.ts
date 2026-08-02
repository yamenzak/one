/**
 * STAFF — who works at this centre, and what each of them may do.
 *
 * ── Why these are Tessa's routes and not Better Auth's ──────────────────────
 *
 * The org plugin ships `invite-member`, `update-member-role` and `remove-member`
 * already, and using them would be less code. Two reasons not to:
 *
 *  1. **The tenant comes from the HOST here, never from the session.** Better
 *     Auth resolves the organization from `session.activeOrganizationId`, which
 *     `better-auth.ts` stamps as the user's FIRST membership by `createdAt`.
 *     For anyone who belongs to two centres that is the wrong one — so an owner
 *     standing on centre-B's subdomain could invite into centre-A. Every other
 *     route in this app pins the tenancy from the hostname before the session is
 *     read; this one has to as well or it is the exception that breaks the rule.
 *  2. **The guards it does not have.** Nothing in the plugin stops an owner
 *     demoting the last owner, or changing their own role. Both lock a centre
 *     out of its own billing and settings, permanently, with a 200.
 *
 * ACCEPTANCE still goes through Better Auth (`/accept-invitation/:id`), so the
 * package's `beforeAcceptInvitation` seat check is untouched — the seat is
 * verified again at the moment it is actually claimed.
 *
 * ── Owner-only, and that is the product ─────────────────────────────────────
 *
 * `access.ts` deliberately gives org-admin statements to `owner` alone. Staff
 * management is not a permission a centre can hand out, because the person who
 * can add staff can add themselves an owner.
 */

import { Hono } from "hono";
import { z } from "zod";
import { newId, nowIso } from "@4dl/core";
import { emailButton, emailShell, escapeHtml } from "@4dl/email";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { CREATOR_ROLE, roles, statement, type RoleName } from "./access.js";
import { checkStaffSeat } from "./auth.js";
import { canonicalHost } from "./host-context.js";
import { sendTenantEmail } from "./email-provider.js";
import { APP_BRAND } from "./mailer.js";
import { tenantEntitlements } from "./billing-store.js";
import type { Env } from "./env.js";

const ROLE_NAMES = Object.keys(roles) as [RoleName, ...RoleName[]];

/**
 * What each role is FOR, in the words a centre uses.
 *
 * Sent to the client rather than restated there: a screen that hard-codes the
 * list drifts the moment a role is added, and drifts silently — the new role is
 * assignable through the API and simply absent from the picker.
 */
const ROLE_COPY: Record<RoleName, { label: string; blurb: string }> = {
  owner: { label: "Owner", blurb: "Everything, including billing, staff and settings." },
  stockKeeper: { label: "Stock", blurb: "Receives, moves and counts. Never releases a sterile load." },
  cssd: { label: "CSSD", blurb: "Builds packs, runs the autoclave, and performs the Freigabe." },
  clinical: { label: "Treatment room", blurb: "Opens packs, consumes stock, logs a case." },
  auditor: { label: "Auditor", blurb: "Reads everything. Writes nothing, and spends no AI credits." },
};

/** The invitation link Better Auth will accept. Must match its own `sendInvitationEmail`. */
const acceptUrl = (origin: string, id: string) => `${origin.replace(/\/$/, "")}/accept-invitation/${id}`;

/** Owner-only. Returns the refusal to send, or null. */
function requireOwner(c: Parameters<typeof requireTenant>[0]): Response | null {
  if (!requireTenant(c)) return c.json({ error: "unauthenticated" }, 401);
  // `role` is the membership role for THIS host's tenant — the session
  // middleware resolved it against the hostname, not against an active-org id.
  if (c.get("role") !== CREATOR_ROLE) return c.json({ error: "Only an owner can manage staff." }, 403);
  return null;
}

async function ownerCount(db: D1Database, tenantId: string): Promise<number> {
  const r = await db
    .prepare('SELECT COUNT(*) AS n FROM "member" WHERE organizationId = ? AND role = ?')
    .bind(tenantId, CREATOR_ROLE)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export const staffRoutes = new Hono<AppEnv>()
  /**
   * The whole screen in one read: members, pending invitations, the seat
   * ceiling, and the role catalog.
   *
   * Readable by any member, not just the owner. Knowing who else works here and
   * what they can do is not privileged — and a centre where only one person can
   * see the staff list is a centre where nobody can check who has release rights
   * before handing over a shift.
   */
  .get("/staff", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);

    const [members, invitations, ent] = await Promise.all([
      c.env.DB
        .prepare(
          'SELECT m.id, m.userId, m.role, m.createdAt, u.name, u.email FROM "member" m ' +
            'LEFT JOIN "user" u ON u.id = m.userId WHERE m.organizationId = ? ORDER BY m.createdAt',
        )
        .bind(who.tenantId)
        .all<{ id: string; userId: string; role: string; createdAt: string; name: string | null; email: string | null }>(),
      c.env.DB
        .prepare('SELECT id, email, role, status, expiresAt FROM "invitation" WHERE organizationId = ? AND status = ? ORDER BY createdAt DESC')
        .bind(who.tenantId, "pending")
        .all<{ id: string; email: string; role: string; status: string; expiresAt: string }>(),
      tenantEntitlements(c.env.DB, who.tenantId),
    ]);

    const used = (members.results ?? []).length;
    const pending = (invitations.results ?? []).length;

    return c.json({
      members: members.results ?? [],
      invitations: invitations.results ?? [],
      seats: {
        used,
        // A pending invitation is a RESERVED seat, and saying so is what stops
        // "you have 2 seats left" turning into a refusal at the invite button.
        pending,
        max: ent.quotas.staffSeats,
        // `-1` is unlimited; the client must not compare it numerically.
        remaining: ent.quotas.staffSeats < 0 ? -1 : Math.max(0, ent.quotas.staffSeats - used - pending),
      },
      roles: ROLE_NAMES.map((name) => ({ name, ...ROLE_COPY[name], grant: (roles[name] as unknown as { statements: Record<string, readonly string[]> }).statements })),
      /** The catalog, so the screen can render "what this role can do" from one source. */
      catalog: statement,
      canManage: c.get("role") === CREATOR_ROLE,
    });
  })

  /**
   * Invite someone.
   *
   * The seat check is EXPLICIT here rather than inherited from the package's
   * `beforeCreateInvitation` hook, because this route does not go through the
   * plugin. `countPending: true` — a pending invitation holds a seat, or a
   * centre with one seat left could send five invitations and have four of them
   * fail at the moment a real person clicked accept.
   */
  .post("/staff/invite", async (c) => {
    const denied = requireOwner(c);
    if (denied) return denied;
    const who = requireTenant(c)!;

    const body = z
      .object({ email: z.string().email().max(200), role: z.enum(ROLE_NAMES) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "invalid body" }, 400);

    const email = body.data.email.trim().toLowerCase();

    // Already here. Re-inviting would create a second pending row that can never
    // be accepted (the accept hook sees the existing membership and returns),
    // leaving a row nobody can clear from the screen.
    const existing = await c.env.DB
      .prepare('SELECT 1 AS x FROM "member" m JOIN "user" u ON u.id = m.userId WHERE m.organizationId = ? AND LOWER(u.email) = ?')
      .bind(who.tenantId, email)
      .first<{ x: number }>();
    if (existing) return c.json({ error: "That person is already on your staff." }, 409);

    const pending = await c.env.DB
      .prepare('SELECT id FROM "invitation" WHERE organizationId = ? AND LOWER(email) = ? AND status = ?')
      .bind(who.tenantId, email, "pending")
      .first<{ id: string }>();
    if (pending) return c.json({ error: "They already have an invitation waiting.", invitationId: pending.id }, 409);

    const seat = await checkStaffSeat(c.env.DB, who.tenantId, { countPending: true });
    if (!seat.ok) return c.json({ error: seat.message, quota: "staffSeats", used: seat.used, limit: seat.max }, 403);

    const id = newId("inv");
    // Seven days. Long enough to survive a holiday, short enough that a link in
    // an old inbox is not a standing key to a medical centre.
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await c.env.DB
      .prepare('INSERT INTO "invitation" (id, organizationId, email, role, status, expiresAt, inviterId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, who.tenantId, email, body.data.role, "pending", expiresAt, c.get("user")?.id ?? null, nowIso())
      .run();

    /**
     * The link points at the centre's OWN hostname, not at whatever origin this
     * request arrived on. An owner who happens to be on the operator door, or on
     * a custom domain mid-migration, must not mint a link that lands somewhere
     * the invitee cannot sign in.
     */
    const host = await canonicalHost(c.env, c.env.DB, who.tenantId);
    const url = acceptUrl(`https://${host}`, id);
    const orgName = (await c.env.DB.prepare('SELECT name FROM "organization" WHERE id = ?').bind(who.tenantId).first<{ name: string }>())?.name ?? "the centre";

    const sent = await sendTenantEmail(c.env as Env, who.tenantId, {
      to: email,
      subject: `Join ${orgName}`,
      html: emailShell(
        `You're invited to ${escapeHtml(orgName)}`,
        `<p style="margin:0">Accept to set up your account — you'll sign in with a one-time code, no password to create.</p>
         ${emailButton("Accept invitation", url, APP_BRAND)}`,
        { brand: APP_BRAND, eyebrow: "Invitation" },
      ),
      text: `You've been invited to join ${orgName}: ${url}`,
    }).catch((e) => ({ ok: false as const, error: String(e), skipped: undefined }));

    /**
     * A send failure does NOT roll the invitation back, and it is reported.
     *
     * The row is the invitation; the email is only how the link travelled. If
     * mail is misconfigured the owner still has a working link to hand over in
     * person — which in a clinic is a completely normal way to do this. Deleting
     * the row would take that away and leave nothing behind but a toast.
     */
    return c.json({ id, url, emailed: sent.ok, emailError: sent.ok ? null : (sent.skipped ?? sent.error ?? "unknown") }, 201);
  })

  /** Revoke a pending invitation. */
  .delete("/staff/invitations/:id", async (c) => {
    const denied = requireOwner(c);
    if (denied) return denied;
    const who = requireTenant(c)!;
    // Scoped to the tenant: an unscoped delete by id would let one centre revoke
    // another's invitation.
    const r = await c.env.DB
      .prepare('DELETE FROM "invitation" WHERE id = ? AND organizationId = ?')
      .bind(c.req.param("id"), who.tenantId)
      .run();
    if (!r.meta?.changes) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  })

  /**
   * Change someone's role.
   *
   * Three guards, and each one is a permanent lockout if it is missing.
   */
  .patch("/staff/:userId/role", async (c) => {
    const denied = requireOwner(c);
    if (denied) return denied;
    const who = requireTenant(c)!;
    const userId = c.req.param("userId");

    const body = z.object({ role: z.enum(ROLE_NAMES) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    // 1. Not yourself. An owner demoting themselves is the single fastest way to
    //    a centre with no owner — and it reads as a normal action until the next
    //    page load refuses everything.
    if (userId === c.get("user")?.id) {
      return c.json({ error: "You can't change your own role. Ask another owner." }, 409);
    }

    const target = await c.env.DB
      .prepare('SELECT role FROM "member" WHERE organizationId = ? AND userId = ?')
      .bind(who.tenantId, userId)
      .first<{ role: string }>();
    if (!target) return c.json({ error: "not_found" }, 404);

    /**
     * 2. Never the last owner.
     *
     * ⚠️ UNREACHABLE through this route today, and kept anyway. Trace it: the
     * only caller is an owner, so demoting the last owner means demoting
     * THEMSELVES — which (1) already refused. Demoting a different owner implies
     * a second one exists, so the count is 2.
     *
     * It stays because the condition it guards is a permanent lockout with no
     * recovery path inside the app, and it becomes reachable the moment anything
     * else can re-role a member: a platform-admin override, a support tool, a
     * bulk import. Defence in depth on "the centre can never reach its own
     * billing again" is worth four lines. `staff.test.ts` asserts the reachable
     * half — that two owners CAN demote one — rather than pretending to cover
     * a branch it cannot get to.
     */
    if (target.role === CREATOR_ROLE && body.data.role !== CREATOR_ROLE && (await ownerCount(c.env.DB, who.tenantId)) <= 1) {
      return c.json({ error: "That's the only owner. Make someone else an owner first." }, 409);
    }

    // 3. No seat check on a sideways move: every role consumes a seat here (see
    //    access.ts on CUSTOMER_ROLE), so changing one cannot claim a new one.
    //    A check would refuse a reshuffle by a centre sitting exactly on its
    //    ceiling, which is the one time reshuffling matters most.
    await c.env.DB
      .prepare('UPDATE "member" SET role = ? WHERE organizationId = ? AND userId = ?')
      .bind(body.data.role, who.tenantId, userId)
      .run();
    return c.json({ ok: true, role: body.data.role });
  })

  /** Remove someone from the centre. Their records stay — the ledger is append-only. */
  .delete("/staff/:userId", async (c) => {
    const denied = requireOwner(c);
    if (denied) return denied;
    const who = requireTenant(c)!;
    const userId = c.req.param("userId");

    if (userId === c.get("user")?.id) {
      return c.json({ error: "You can't remove yourself. Ask another owner." }, 409);
    }

    const target = await c.env.DB
      .prepare('SELECT role FROM "member" WHERE organizationId = ? AND userId = ?')
      .bind(who.tenantId, userId)
      .first<{ role: string }>();
    if (!target) return c.json({ error: "not_found" }, 404);
    if (target.role === CREATOR_ROLE && (await ownerCount(c.env.DB, who.tenantId)) <= 1) {
      return c.json({ error: "That's the only owner. Make someone else an owner first." }, 409);
    }

    /**
     * The MEMBERSHIP goes; the person's history does not.
     *
     * `ledger.actor_user_id` and `sterilisation_cycles.released_by` name whoever
     * performed an act, and a Freigabe with no named releaser is not a record —
     * it is the absence of one. Under MPBetreibV that is the thing being kept.
     * Removing staff must never be a way to erase who released a load.
     */
    await c.env.DB.prepare('DELETE FROM "member" WHERE organizationId = ? AND userId = ?').bind(who.tenantId, userId).run();
    // Their sessions are pinned to this host's tenant by the middleware, so the
    // next request resolves no membership and the app shows them the door. No
    // session sweep needed — but any PENDING invitation for them should go, or
    // the screen shows a ghost.
    await c.env.DB
      .prepare('DELETE FROM "invitation" WHERE organizationId = ? AND status = ? AND LOWER(email) = (SELECT LOWER(email) FROM "user" WHERE id = ?)')
      .bind(who.tenantId, "pending", userId)
      .run()
      .catch(() => undefined);
    return c.json({ ok: true });
  });
