/**
 * STAFF — who works at this tenant, and what each of them may do.
 *
 * ── Why these are OUR routes and not Better Auth's ──────────────────────────
 *
 * The org plugin ships `invite-member`, `update-member-role` and `remove-member`
 * already, and using them is less code. Two reasons not to, and both are
 * lockouts rather than preferences:
 *
 *  1. **The tenant comes from the HOST, never from the session.** Better Auth
 *     resolves the organization from `session.activeOrganizationId`, which
 *     `better-auth.ts` stamps as the user's FIRST membership by `createdAt`.
 *     For anyone who belongs to two tenants that is the wrong one — so an owner
 *     standing on tenant-B's subdomain could invite into tenant-A. Every other
 *     route in these apps pins the tenancy from the hostname before the session
 *     is read; this one has to as well, or it is the exception that breaks the
 *     rule.
 *  2. **The guards the plugin does not have.** Nothing in it stops an owner
 *     demoting the last owner, or changing their own role. Both lock a tenant
 *     out of its own billing and settings, permanently, with a 200.
 *
 * ACCEPTANCE still goes through Better Auth (`/accept-invitation/:id`), so the
 * package's own `beforeAcceptInvitation` seat check is untouched — the seat is
 * verified again at the moment it is actually claimed.
 *
 * ── What this being shared actually fixed ───────────────────────────────────
 *
 * Both live apps could already SEND a staff invitation, and it was recorded
 * otherwise. What one of them could not do was SEE a pending one or REVOKE it:
 * its roster read joined `member` alone, so an invitation sent to a mistyped
 * address was invisible and permanent until it expired. Nor could it remove a
 * member at all. Those are the three routes it gains by mounting this.
 *
 * ── Manage-role-only, and that is the product ───────────────────────────────
 *
 * Staff management is not a permission a tenant can hand out, because whoever
 * can add staff can add themselves an owner. Every write below is gated on the
 * CREATOR role specifically, not on a grant.
 */

import { Hono } from "hono";
import type { Context, Env as HonoEnv } from "hono";
import { newId, nowIso, type HasDb } from "@4dl/core";
import { pendingStaffSeats, staffSeatsUsed, type SeatVerdict } from "./seats.js";

/** The slice of an app's Hono env these routes read. */
export type StaffRouteEnv = { Bindings: HasDb };
// Deliberately no `Variables` constraint — a context typed by Better Auth's
// inferred session has no index signature, so requiring one rejects every real
// app. Identity comes through the injected accessors instead.

/** Who this request is, resolved from the HOST's tenancy. */
export interface StaffActor {
  tenantId: string;
  userId: string;
  /** Their membership role in THIS tenant. */
  role: string;
}

export interface StaffRoleMeta {
  label: string;
  blurb: string;
}

/** Everything the invite email needs; the app owns branding and the origin. */
export interface StaffInvite {
  email: string;
  role: string;
  invitationId: string;
  tenantId: string;
  tenantName: string;
  /** Seven days out by default — see `inviteDays`. */
  expiresAt: string;
}

export interface StaffSendResult {
  ok: boolean;
  /** Why it did not send, for the owner to act on. Never thrown away. */
  error?: string | null;
  /**
   * The accept link, echoed back in the response.
   *
   * The app builds it — only the app knows the tenant's canonical hostname — but
   * it has to come back out, and that is the whole point of the invite route
   * surviving a mail failure: the manager still has a working link to hand over
   * in person. Without it a failed send leaves nothing but a toast.
   */
  url?: string | null;
}

/**
 * The sentences these routes say. Defaulted, and overridable in full: one app
 * calls its tenant a studio and another a centre, and an app running `@4dl/i18n`
 * hands over translated strings.
 */
export interface StaffCopy {
  unauthenticated: string;
  forbidden: string;
  alreadyStaff: string;
  alreadyInvited: string;
  notFound: string;
  ownRole: string;
  ownRemoval: string;
  lastOwner: string;
}

const DEFAULT_COPY: StaffCopy = {
  unauthenticated: "unauthenticated",
  forbidden: "Only an owner can manage staff.",
  alreadyStaff: "That person is already on your staff.",
  alreadyInvited: "They already have an invitation waiting.",
  notFound: "not_found",
  ownRole: "You can't change your own role. Ask another owner.",
  ownRemoval: "You can't remove yourself. Ask another owner.",
  lastOwner: "That's the only owner. Make someone else an owner first.",
};

export interface StaffRouteDeps<E extends StaffRouteEnv & HonoEnv> {
  /** The signed-in member of THIS host's tenant, or null. */
  actorOf: (c: Context<E>) => StaffActor | null;
  /** The role that manages staff, and that a tenant must never run out of. */
  creatorRole: string;
  /**
   * The staff roles, in picker order. The response carries them so no screen
   * hard-codes a list — one that does drifts silently the moment a role is
   * added: assignable through the API, absent from the picker.
   *
   * The CUSTOMER role is deliberately not among them, which is what stops the
   * staff invite path minting a customer.
   */
  roleNames: readonly string[];
  /**
   * Roles a re-role may target, when that is wider than `roleNames`. One app
   * demotes a staff member to its customer role from this screen — a valid
   * destination that must never be an invitable one. Defaults to `roleNames`.
   */
  assignableRoles?: readonly string[];
  /**
   * A refusal RESPONSE for putting somebody in `role`, or null. Applied to an
   * INVITE and to a RE-ROLE, because a capability sold by the plan has to close
   * at both doors — gating only the invite leaves promotion as the way in.
   *
   * A whole Response rather than a message, so an app's existing entitlement
   * gate can be handed over unchanged and its refusal BODY survives: the one in
   * Kova names the missing feature (`{ feature: "frontDesk" }`), which is what
   * lets a client tell a plan refusal from a seat refusal. Flattening it to a
   * string throws that away, and both arrive as 403.
   */
  checkRole?: (c: Context<E>, tenantId: string, role: string) => Promise<Response | null>;
  /**
   * Whether moving `from` → `to` CLAIMS a new staff seat.
   *
   * Defaults to never, which is right for an app where every role is a staff
   * seat: a sideways move consumes nothing new, so a tenant sitting exactly on
   * its ceiling can still reshuffle. An app with a seat-free customer role
   * returns true for customer → staff, and only that direction — the reverse
   * frees a seat.
   */
  claimsSeat?: (from: string, to: string) => boolean;
  /** What each role is FOR, in the words the product uses. */
  roleCopy: Record<string, StaffRoleMeta>;
  /** Per-role grant statements, so a screen can render "what this role can do". */
  roleGrants: Record<string, Record<string, readonly string[]>>;
  /** The full statement catalog, so that rendering has one source. */
  catalog: Record<string, readonly string[]>;
  /** Seat verdict. `countPending` reserves pending invitations against the ceiling. */
  checkSeat: (db: D1Database, tenantId: string, opts: { countPending?: boolean }) => Promise<SeatVerdict>;
  /** The staff-seat ceiling, for the counters. `-1` is unlimited. */
  seatCeiling: (db: D1Database, tenantId: string) => Promise<number>;
  /**
   * Enrich the roster rows with fields only the APP knows about.
   *
   * The one that forced this seam: a FACE. This package joins `member` to
   * `user`, which on a passwordless stack carries a name and an email and
   * nothing else — so a staff roster could only ever draw initials or a robot
   * seeded from an id. Meanwhile the same person's photo was sitting in the
   * app's own subject table, and the app bar was already drawing it. One human,
   * two faces, depending on which screen you were on.
   *
   * Deliberately a decorator over the finished rows rather than extra columns in
   * the query: the table the photo lives in is the app's, this package has no
   * business naming it, and an app with no such table simply omits the hook.
   */
  decorateMembers?: (
    db: D1Database,
    tenantId: string,
    members: { userId: string; email: string | null }[],
  ) => Promise<Record<string, Record<string, unknown>>>;
  /**
   * The role that is NOT a staff seat — the app's end customer.
   *
   * Required, and it is the same value `SeatConfig.customerRole` takes, because
   * the two have to agree: `/staff` reports the seat count and `checkSeat`
   * enforces it, and they were counting different things. See the route.
   */
  customerRole: string;
  /** Deliver the invitation. Failure is REPORTED, never rolled back — see the route. */
  sendInvite: (c: Context<E>, invite: StaffInvite) => Promise<StaffSendResult>;
  /** Invitation lifetime. Seven days: long enough to survive a holiday, short
   *  enough that a link in an old inbox is not a standing key to a tenant. */
  inviteDays?: number;
  copy?: Partial<StaffCopy>;
}

export function staffRoutes<E extends StaffRouteEnv & HonoEnv>(deps: StaffRouteDeps<E>) {
  const copy: StaffCopy = { ...DEFAULT_COPY, ...deps.copy };
  const inviteMs = (deps.inviteDays ?? 7) * 86_400_000;
  const assignable = deps.assignableRoles ?? deps.roleNames;
  const isInvitable = (r: unknown): r is string => typeof r === "string" && deps.roleNames.includes(r);
  const isAssignable = (r: unknown): r is string => typeof r === "string" && assignable.includes(r);

  /** Manage-role only. Returns the refusal to send, or the actor. */
  function manager(c: Context<E>): { actor: StaffActor } | { refusal: Response } {
    const actor = deps.actorOf(c);
    if (!actor) return { refusal: c.json({ error: copy.unauthenticated }, 401) };
    // The role is the membership role for THIS host's tenant — resolved against
    // the hostname, not against an active-org id.
    if (actor.role !== deps.creatorRole) return { refusal: c.json({ error: copy.forbidden }, 403) };
    return { actor };
  }

  async function ownerCount(db: D1Database, tenantId: string): Promise<number> {
    const r = await db
      .prepare('SELECT COUNT(*) AS n FROM "member" WHERE organizationId = ? AND role = ?')
      .bind(tenantId, deps.creatorRole)
      .first<{ n: number }>();
    return r?.n ?? 0;
  }

  return new Hono<E>()
    /**
     * The whole screen in one read: members, pending invitations, the seat
     * ceiling, and the role catalog.
     *
     * Readable by any member, not only the manager. Knowing who else works here
     * and what they can do is not privileged — and a tenant where only one
     * person can see the staff list is one where nobody can check who holds a
     * capability before handing over a shift.
     */
    .get("/staff", async (c) => {
      const actor = deps.actorOf(c);
      if (!actor) return c.json({ error: copy.unauthenticated }, 401);

      const [members, invitations, max] = await Promise.all([
        c.env.DB
          .prepare(
            'SELECT m.id, m.userId, m.role, m.createdAt, u.name, u.email FROM "member" m ' +
              'LEFT JOIN "user" u ON u.id = m.userId WHERE m.organizationId = ? ORDER BY m.createdAt',
          )
          .bind(actor.tenantId)
          .all<{ id: string; userId: string; role: string; createdAt: string; name: string | null; email: string | null }>(),
        c.env.DB
          .prepare('SELECT id, email, role, status, expiresAt FROM "invitation" WHERE organizationId = ? AND status = ? ORDER BY createdAt DESC')
          .bind(actor.tenantId, "pending")
          .all<{ id: string; email: string; role: string; status: string; expiresAt: string }>(),
        deps.seatCeiling(c.env.DB, actor.tenantId),
      ]);

      /*
        THE COUNT THE SCREEN SHOWS AND THE COUNT THE INVITE ENFORCES ARE THE
        SAME COUNT — through the same two functions, which is the only way to
        keep them that way.

        This read `members.results.length`: EVERY membership row, customers
        included. A studio with two coaches and two clients was told it had used
        four staff seats, and `remaining` was computed off that inflated number
        — so a five-seat plan reported one seat left with three actually free,
        and at the boundary the screen said "none left" while the invite button
        worked perfectly. The seat count was moved server-side in the first place
        to stop exactly this kind of divergence; it just moved the divergence
        rather than removing it, because the route re-derived instead of calling
        `staffSeatsUsed`.

        The same applied to `pending`: `invitation` rows were counted whatever
        their role, while `pendingStaffSeats` filters customers out and drops
        expired ones.
      */
      const [used, pending] = await Promise.all([
        staffSeatsUsed(c.env.DB, actor.tenantId, deps.customerRole),
        pendingStaffSeats(c.env.DB, actor.tenantId, deps.customerRole),
      ]);

      // The app's own fields, keyed by userId. A hook that throws must not take
      // the whole staff screen with it — a missing photo is a worse face, not a
      // broken roster.
      const rows = members.results ?? [];
      const extra: Record<string, Record<string, unknown>> = deps.decorateMembers
        ? await deps.decorateMembers(c.env.DB, actor.tenantId, rows.map((m) => ({ userId: m.userId, email: m.email }))).catch(() => ({}))
        : {};

      return c.json({
        members: rows.map((m) => ({ ...m, ...(extra[m.userId] ?? {}) })),
        invitations: invitations.results ?? [],
        seats: {
          used,
          // A pending invitation is a RESERVED seat, and saying so is what stops
          // "you have 2 seats left" turning into a refusal at the invite button.
          pending,
          max,
          // `-1` is unlimited; the client must not compare it numerically.
          remaining: max < 0 ? -1 : Math.max(0, max - used - pending),
        },
        roles: deps.roleNames.map((name) => ({
          name,
          ...(deps.roleCopy[name] ?? { label: name, blurb: "" }),
          grant: deps.roleGrants[name] ?? {},
        })),
        catalog: deps.catalog,
        canManage: actor.role === deps.creatorRole,
      });
    })

    /**
     * Invite someone.
     *
     * The seat check is EXPLICIT here rather than inherited from the plugin's
     * `beforeCreateInvitation` hook, because this route does not go through the
     * plugin. `countPending: true` — a pending invitation holds a seat, or a
     * tenant with one seat left could send five invitations and have four of
     * them fail at the moment a real person clicked accept.
     */
    .post("/staff/invite", async (c) => {
      const m = manager(c);
      if ("refusal" in m) return m.refusal;
      const { actor } = m;

      const body = (await c.req.json().catch(() => null)) as { email?: unknown; role?: unknown } | null;
      const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      // Deliberately permissive on shape and strict on the two things that
      // matter: it has to look like an address, and the role has to exist.
      if (!rawEmail || rawEmail.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
        return c.json({ error: "That doesn't look like an email address." }, 400);
      }
      if (!isInvitable(body?.role)) return c.json({ error: "invalid role" }, 400);
      const role = body.role;

      const roleRefusal = await deps.checkRole?.(c, actor.tenantId, role);
      if (roleRefusal) return roleRefusal;

      // Already here. Re-inviting would create a second pending row that can
      // never be accepted (the accept hook sees the existing membership and
      // returns), leaving a row nobody can clear from the screen.
      const existing = await c.env.DB
        .prepare('SELECT 1 AS x FROM "member" m JOIN "user" u ON u.id = m.userId WHERE m.organizationId = ? AND LOWER(u.email) = ?')
        .bind(actor.tenantId, rawEmail)
        .first<{ x: number }>();
      if (existing) return c.json({ error: copy.alreadyStaff }, 409);

      const pending = await c.env.DB
        .prepare('SELECT id FROM "invitation" WHERE organizationId = ? AND LOWER(email) = ? AND status = ?')
        .bind(actor.tenantId, rawEmail, "pending")
        .first<{ id: string }>();
      if (pending) return c.json({ error: copy.alreadyInvited, invitationId: pending.id }, 409);

      const seat = await deps.checkSeat(c.env.DB, actor.tenantId, { countPending: true });
      if (!seat.ok) return c.json({ error: seat.message, quota: "staffSeats", used: seat.used, limit: seat.max }, 403);

      const id = newId("inv");
      const expiresAt = new Date(Date.now() + inviteMs).toISOString();
      await c.env.DB
        .prepare('INSERT INTO "invitation" (id, organizationId, email, role, status, expiresAt, inviterId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, actor.tenantId, rawEmail, role, "pending", expiresAt, actor.userId, nowIso())
        .run();

      const tenantName =
        (await c.env.DB.prepare('SELECT name FROM "organization" WHERE id = ?').bind(actor.tenantId).first<{ name: string }>())?.name ?? "";

      const sent = await deps
        .sendInvite(c, { email: rawEmail, role, invitationId: id, tenantId: actor.tenantId, tenantName, expiresAt })
        .catch((e) => ({ ok: false, error: String(e) }) as StaffSendResult);

      /**
       * A send failure does NOT roll the invitation back, and it is reported.
       *
       * The row IS the invitation; the email is only how the link travelled. If
       * mail is misconfigured the manager still has a working link to hand over
       * in person — which in a small business is a completely normal way to do
       * this. Deleting the row would take that away and leave nothing behind but
       * a toast.
       */
      /**
       * `error` is passed through as the APP wrote it.
       *
       * `sendInvite` is injected, so the app owns the mail provider and is the
       * only side that can turn a provider mechanic into a sentence — this
       * package importing `@4dl/email` to explain a string it never produced
       * would be a dependency bought for a formatting job. Kova's binding runs
       * `explainSendError`; the contract here is only that whatever arrives is
       * fit to show someone.
       */
      return c.json({ id, url: sent.url ?? null, emailed: sent.ok, emailError: sent.ok ? null : (sent.error ?? "unknown") }, 201);
    })

    /** Revoke a pending invitation. */
    .delete("/staff/invitations/:id", async (c) => {
      const m = manager(c);
      if ("refusal" in m) return m.refusal;
      // Scoped to the tenant: an unscoped delete by id would let one tenant
      // revoke another's invitation.
      const r = await c.env.DB
        .prepare('DELETE FROM "invitation" WHERE id = ? AND organizationId = ?')
        .bind(c.req.param("id"), m.actor.tenantId)
        .run();
      if (!r.meta?.changes) return c.json({ error: copy.notFound }, 404);
      return c.json({ ok: true });
    })

    /**
     * Change someone's role. Three guards, and each is a permanent lockout if
     * it is missing.
     */
    .patch("/staff/:userId/role", async (c) => {
      const m = manager(c);
      if ("refusal" in m) return m.refusal;
      const { actor } = m;
      const userId = c.req.param("userId");

      const body = (await c.req.json().catch(() => null)) as { role?: unknown } | null;
      if (!isAssignable(body?.role)) return c.json({ error: "invalid role" }, 400);
      const role = body.role;

      const roleRefusal = await deps.checkRole?.(c, actor.tenantId, role);
      if (roleRefusal) return roleRefusal;

      // 1. Not yourself. A manager demoting themselves is the single fastest way
      //    to a tenant with no manager — and it reads as a normal action until
      //    the next page load refuses everything.
      if (userId === actor.userId) return c.json({ error: copy.ownRole }, 409);

      const target = await c.env.DB
        .prepare('SELECT role FROM "member" WHERE organizationId = ? AND userId = ?')
        .bind(actor.tenantId, userId)
        .first<{ role: string }>();
      if (!target) return c.json({ error: copy.notFound }, 404);

      /**
       * 2. Never the last owner.
       *
       * ⚠️ UNREACHABLE through this route today, and kept anyway. Trace it: the
       * only caller is a manager, so demoting the last one means demoting
       * THEMSELVES — which (1) already refused. Demoting a different owner
       * implies a second exists, so the count is 2.
       *
       * It stays because the condition it guards is a permanent lockout with no
       * recovery path inside the app, and it becomes reachable the moment
       * anything else can re-role a member: a platform-admin override, a support
       * tool, a bulk import. Defence in depth on "the tenant can never reach its
       * own billing again" is worth four lines.
       */
      if (target.role === deps.creatorRole && role !== deps.creatorRole && (await ownerCount(c.env.DB, actor.tenantId)) <= 1) {
        return c.json({ error: copy.lastOwner }, 409);
      }

      /**
       * 3. A seat check only where a seat is actually CLAIMED.
       *
       * The default `claimsSeat` is never, which is right where every role is a
       * staff seat: a sideways move consumes nothing new, and checking anyway
       * would refuse a reshuffle by a tenant sitting exactly on its ceiling —
       * the one time reshuffling matters most. An app with a seat-free customer
       * role says so, and promoting one to staff is counted. That direction was
       * an uncounted seat bypass in one of these apps once.
       */
      if (deps.claimsSeat?.(target.role, role)) {
        const seat = await deps.checkSeat(c.env.DB, actor.tenantId, {});
        if (!seat.ok) return c.json({ error: seat.message, quota: "staffSeats", used: seat.used, limit: seat.max }, 403);
      }
      await c.env.DB
        .prepare('UPDATE "member" SET role = ? WHERE organizationId = ? AND userId = ?')
        .bind(role, actor.tenantId, userId)
        .run();
      return c.json({ ok: true, role });
    })

    /** Remove someone. Their records stay — see below. */
    .delete("/staff/:userId", async (c) => {
      const m = manager(c);
      if ("refusal" in m) return m.refusal;
      const { actor } = m;
      const userId = c.req.param("userId");

      if (userId === actor.userId) return c.json({ error: copy.ownRemoval }, 409);

      const target = await c.env.DB
        .prepare('SELECT role FROM "member" WHERE organizationId = ? AND userId = ?')
        .bind(actor.tenantId, userId)
        .first<{ role: string }>();
      if (!target) return c.json({ error: copy.notFound }, 404);
      if (target.role === deps.creatorRole && (await ownerCount(c.env.DB, actor.tenantId)) <= 1) {
        return c.json({ error: copy.lastOwner }, 409);
      }

      /**
       * The MEMBERSHIP goes; the person's history does not.
       *
       * Audit columns name whoever performed an act, and a record with no named
       * actor is not a record — it is the absence of one. Removing staff must
       * never be a way to erase who did something.
       */
      await c.env.DB.prepare('DELETE FROM "member" WHERE organizationId = ? AND userId = ?').bind(actor.tenantId, userId).run();
      // Their sessions are pinned to this host's tenant by the middleware, so the
      // next request resolves no membership and the app shows them the door. No
      // session sweep needed — but any PENDING invitation for them should go, or
      // the screen shows a ghost.
      await c.env.DB
        .prepare('DELETE FROM "invitation" WHERE organizationId = ? AND status = ? AND LOWER(email) = (SELECT LOWER(email) FROM "user" WHERE id = ?)')
        .bind(actor.tenantId, "pending", userId)
        .run()
        .catch(() => undefined);
      return c.json({ ok: true });
    });
}
