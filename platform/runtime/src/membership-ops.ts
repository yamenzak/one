/**
 * THE ROSTER'S SURFACE — invite, re-role, remove, and the roles themselves.
 *
 * ⚠️ THE ROLE BUILDER IS HERE RATHER THAN IN A FILE OF ITS OWN, because every
 * question it asks is a question this file already answers: what the caller
 * holds, which registry a role is looked up in, and who is still in one. Given
 * its own deps it would be a second answer to each, and the two would disagree
 * the first time one of them was changed.
 *
 * ⚠️ LEAVING IS NOT HERE. It is `me.leave` in `identity-ops.ts`, on the ACCOUNT's
 * door, because everything in this file wants `member:manage` — which is exactly
 * what somebody removing themselves does not have. The two share `wouldStrand`
 * and nothing else: one rule, asked by both doors, so a workspace cannot be
 * stranded through the one nobody re-checked.
 *
 * ⚠️ THERE IS NO `member.create`. A membership is made by inviting an ADDRESS
 * and claimed by whoever signs in with it; an operation that took an account id
 * would let anybody holding one add themselves to a workspace they were never
 * invited to. That is the reason this is a hand-written surface rather than a
 * collection: a collection derives a create, and this table must not have one.
 *
 * ⚠️ AND THE SEAT CEILING IS CHECKED ON INVITE, NOT ON ACCEPT. Counting only
 * accepted members lets anybody past the ceiling by inviting twenty people and
 * waiting — the overage then arrives days later, all at once, as a surprise.
 */

import type { AnyOperation, AppSpec, BindingSpec, Instant, RoleRegistry, SqlHandle, TenantId, UserId } from "@one/kernel";
import { canAssignRole, canGrant, operation, s, withinQuota } from "@one/kernel";
import { invite, membersOf, permissionsOf, revoke, seatsUsed, setPermissions, setRole, wouldStrand, type Indexing } from "./membership.js";
import { refuseRole, removeRole, roleInUse, rolesOf, saveRole } from "./tenant-role.js";

/** ⚠️ A symbol, so an app cannot reach the store by writing a property name. */
export const MEMBERS = Symbol.for("one.runtime.members");

export interface MemberDeps {
  readonly db: SqlHandle;
  /**
   * ⚠️ WHERE THE CROSS-PRODUCT INDEX GOES. Memberships are regional and per-app;
   * the hub answers "everywhere you belong" and can read only its own product's,
   * so every write here is mirrored to the global store. It is an INDEX and
   * never a grant — see `membership-directory.ts`.
   */
  readonly index: Indexing;
  readonly tenantId: TenantId;
  readonly userId: UserId | null;
  /**
   * ⚠️ WHAT THE CALLER THEMSELVES HOLDS, because nobody may grant what they do
   * not hold. Resolved once per request like everything else on the caller —
   * re-deriving it here would be the second implementation of the one question
   * this whole file exists to answer.
   */
  readonly permissions: ReadonlySet<string>;
  /**
   * ⚠️ THE APP'S ROLES MERGED WITH THE WORKSPACE'S OWN, resolved once per request
   * with everything else about the caller. A role list captured when the surface
   * was composed is the app's declarations and nothing else — so a workspace
   * could make a role, see it on its own screen, and be told on invite that it is
   * "not a role here". Every question this file asks about roles asks the merged
   * one, including who counts as an administrator when somebody is removed.
   */
  readonly roles: RoleRegistry;
  /** What the workspace's own plan allows, already resolved. */
  readonly seatsAllowed: number | boolean;
}

export interface MemberCarrier { readonly [MEMBERS]: MemberDeps }

const deps = (ctx: unknown): MemberDeps => (ctx as MemberCarrier)[MEMBERS];

/**
 * ⚠️ THE SEAT ROLES ARE THE APP'S, AND A ROLE OUTSIDE THEM IS FREE. Kova's
 * clients are members of a studio and are not staff; counting them against a
 * seat ceiling would price a coaching business by its customers.
 */
export function membershipOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const counted = app.access.seats.counts;

  /*
    ⚠️ ABSENT ENTIRELY WHERE NO ROLE COULD USE IT, rather than present and
    refusing. An operation nobody can reach reads as a broken feature: it appears
    in the route list, in the tool catalogue and in the generated document, and
    every call answers 403 with no way to tell that from a permission somebody
    forgot to grant. The customer rail is absent on the same argument.
  */
  const declared = new Set(app.access.permissions);
  const holders = (key: string) => Object.values(app.access.roles).some((keys) => keys.includes(key));
  const readable = holders("member:read");
  const manageable = holders("member:manage");
  if (!readable && !manageable) return [];

  const list = operation({
    id: "member.list",
    kind: "read",
    summary: "Who is in this workspace, including anybody who has not accepted yet.",
    input: s.object({}),
    output: s.object({ members: s.json(), seats: s.json() }),
    permission: "member:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const members = await membersOf(d.db, d.tenantId);
      return {
        members: members.map((m) => ({
          id: m.id, email: m.email, role: m.role,
          /*
            ⚠️ REPORTED, NOT INFERRED FROM A NULL. "Invited" and "accepted" are
            two states a member list has to show differently, and leaving a screen to
            work it out from an absent timestamp is how the pending half stops
            being drawn.
          */
          state: m.acceptedAt ? "accepted" : "invited",
          subjectId: m.subjectId,
          invitedAt: m.invitedAt, acceptedAt: m.acceptedAt,
        })),
        seats: {
          used: await seatsUsed(d.db, d.tenantId, counted),
          allowed: d.seatsAllowed,
          counts: counted,
        },
      };
    },
  });

  const add = operation({
    id: "member.invite",
    kind: "write",
    summary: "Invite somebody into this workspace, in a role.",
    input: s.object({
      email: s.text({ min: 3, max: 200 }),
      role: s.text({ max: 40 }),
      subjectId: s.optional(s.text({ max: 120 })),
    }),
    output: s.object({ id: s.text(), email: s.text(), role: s.text(), state: s.text() }),
    permission: "member:manage",
    idempotency: { mode: "natural", key: "email" },
    audit: (i: { email: string }) => ({ subject: i.email, verb: "invite" }),
    outcome: { message: "Invitation sent", tone: "success", invalidates: ["member.list"] },
    fails: ["platform.invalid", "platform.forbidden", "platform.quota_reached"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL. Adding somebody to a workspace is granting
      access to everything in it, and a model that can do it from a sentence in
      a document it was asked to summarise is a model that can be asked to.
    */
    tool: false,
    async handler(ctx, input: { email: string; role: string; subjectId?: string }) {
      const d = deps(ctx);
      /*
        ⚠️ A ROLE NEITHER THE MANIFEST NOR THE WORKSPACE DECLARES GRANTS NOTHING,
        FOREVER, and it looks exactly like a colleague who cannot see anything for
        no reason. Refusing at the door is the only place the mistake is legible.
      */
      const known = Object.keys(d.roles);
      if (!known.includes(input.role)) {
        ctx.fail("platform.invalid", { field: "role", reason: `not a role here: ${known.join(", ")}` });
      }
      /*
        ⚠️ AND NOBODY MAY INVITE SOMEBODY INTO A ROLE THEY COULD NOT GRANT KEY BY
        KEY. `member.permissions` has closed that two-step escalation since it was
        written and this door was left open beside it — so the way to become an
        owner was to invite a second address of your own as one. `canAssignRole`
        is the kernel's answer to exactly this and had no caller at all.
      */
      if (!canAssignRole(d.permissions, input.role, d.roles)) {
        ctx.fail("platform.forbidden", { field: "role", reason: "you do not hold everything that role carries" });
      }
      if (counted.includes(input.role)) {
        const used = await seatsUsed(d.db, d.tenantId, counted);
        /*
          ⚠️ THE TWO NUMBERS ARE THE MESSAGE. `platform.quota_reached` renders
          "Your plan includes {limit}, and {used} are in use" — so raising it
          with neither produces "Your plan includes undefined, and undefined are
          in use", which is what somebody hitting a seat limit actually read.
          A problem's meta is not decoration; it IS the sentence.
        */
        if (!withinQuota(d.seatsAllowed, used)) {
          ctx.fail("platform.quota_reached", { field: "seats", limit: String(d.seatsAllowed), used: String(used) });
        }
      }
      const made = await invite(
        d.db, d.index, d.tenantId,
        { email: input.email, role: input.role, subjectId: input.subjectId ?? null, invitedBy: d.userId },
        ctx.now(),
      );
      return { id: made.id, email: made.email, role: made.role, state: made.acceptedAt ? "accepted" : "invited" };
    },
  });

  const remove = operation({
    id: "member.remove",
    kind: "write",
    summary: "Remove somebody from this workspace and free their seat.",
    input: s.object({ id: s.text({ max: 40 }) }),
    output: s.object({ removed: s.text() }),
    permission: "member:manage",
    idempotency: { mode: "none" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "remove" }),
    outcome: { message: "Removed", tone: "success", invalidates: ["member.list"] },
    fails: ["platform.not_found", "platform.conflict"],
    tool: false,
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      const members = await membersOf(d.db, d.tenantId);
      const target = members.find((m) => m.id === input.id);
      if (!target) ctx.fail("platform.not_found", { field: "id" });
      /*
        ⚠️ THE SAME RULE `me.leave` ASKS, and asking it here in its own words is
        what this call replaced. Stranding a workspace is one question about one
        table; the two doors differ in who may knock, never in the answer.

        ⚠️ AND IT IS ASKED OF THE MERGED REGISTRY, because a workspace that made
        its own administrator role has administrators the manifest never named.
        The declared roles alone would call the last declared owner irremovable
        while five people hold a custom role carrying the same keys.
      */
      if (wouldStrand(d.roles, members, input.id)) {
        ctx.fail("platform.conflict", { field: "id", reason: "last_administrator" });
      }
      await revoke(d.db, d.index, d.tenantId, target!.id, ctx.now());
      return { removed: target!.id };
    },
  });

  /*
    ⚠️ RE-ROLE EXISTED IN THIS FILE'S OWN HEADER AND NOWHERE ELSE IN IT. Without
    it the only way to change what somebody does is to remove them and invite them
    again — which frees and re-takes a seat, loses the invitation trail, and asks
    a colleague to accept a second time to keep the access they already had.
    Custom roles made the gap visible: a workspace could compose a role and had no
    way to put anybody in it.
  */
  const rerole = operation({
    id: "member.role",
    kind: "write",
    summary: "Move somebody into a different role.",
    input: s.object({ id: s.text({ max: 40 }), role: s.text({ max: 40 }) }),
    output: s.object({ id: s.text(), role: s.text() }),
    permission: "member:manage",
    idempotency: { mode: "none" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "role" }),
    outcome: { message: "Role changed", tone: "success", invalidates: ["member.list"] },
    fails: ["platform.not_found", "platform.invalid", "platform.forbidden", "platform.conflict", "platform.quota_reached"],
    tool: false,
    async handler(ctx, input: { id: string; role: string }) {
      const d = deps(ctx);
      const members = await membersOf(d.db, d.tenantId);
      const target = members.find((m) => m.id === input.id);
      if (!target) ctx.fail("platform.not_found", { field: "id" });

      const known = Object.keys(d.roles);
      if (!known.includes(input.role)) {
        ctx.fail("platform.invalid", { field: "role", reason: `not a role here: ${known.join(", ")}` });
      }
      /*
        ⚠️ BOUNDED EXACTLY AS AN INVITATION IS. A re-role without it is the same
        escalation with a shorter first step — grant nothing, move somebody into
        the role that already carries what you lack, or move yourself.
      */
      if (!canAssignRole(d.permissions, input.role, d.roles)) {
        ctx.fail("platform.forbidden", { field: "role", reason: "you do not hold everything that role carries" });
      }
      /*
        ⚠️ AND MOVING THE LAST ADMINISTRATOR OUT IS THE SAME STRANDING AS REMOVING
        THEM. It is a workspace nobody can administer either way, and it is the
        quieter of the two because everybody is still in the room.

        ⚠️ WHAT IT ASKS ABOUT IS WHERE THEY ARE GOING, not that they are moving.
        The last owner promoted into a custom role that also manages members
        strands nobody — refusing that would make a workspace's own
        administrator role the one role its administrator can never hold.
      */
      const stillManages = (d.roles[input.role] ?? []).includes("member:manage");
      if (!stillManages && wouldStrand(d.roles, members, input.id)) {
        ctx.fail("platform.conflict", { field: "id", reason: "last_administrator" });
      }
      /*
        ⚠️ A MOVE INTO A COUNTED ROLE TAKES A SEAT, so it meets the ceiling that
        an invitation does. Otherwise the way past a seat limit is to invite
        somebody free and move them.
      */
      if (counted.includes(input.role) && !counted.includes(target!.role)) {
        const used = await seatsUsed(d.db, d.tenantId, counted);
        if (!withinQuota(d.seatsAllowed, used)) {
          ctx.fail("platform.quota_reached", { field: "seats", limit: String(d.seatsAllowed), used: String(used) });
        }
      }
      await setRole(d.db, d.index, d.tenantId, target!.id, input.role, ctx.now());
      return { id: target!.id, role: input.role };
    },
  });

  const narrow = operation({
    id: "member.permissions",
    kind: "write",
    summary: "Narrow or widen what one member may do, within their role.",
    input: s.object({
      id: s.text({ max: 40 }),
      grants: s.json(),
      revoked: s.json(),
    }),
    output: s.object({ id: s.text(), permissions: s.json() }),
    permission: "member:manage",
    idempotency: { mode: "none" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "permissions" }),
    outcome: { message: "Permissions updated", tone: "success", invalidates: ["member.list"] },
    fails: ["platform.not_found", "platform.invalid", "platform.forbidden"],
    tool: false,
    async handler(ctx, input: { id: string; grants: unknown; revoked: unknown }) {
      const d = deps(ctx);
      const target = (await membersOf(d.db, d.tenantId)).find((m) => m.id === input.id);
      if (!target) ctx.fail("platform.not_found", { field: "id" });

      const asList = (of: unknown) => (Array.isArray(of) ? of.filter((v): v is string => typeof v === "string") : []);
      const grants = asList(input.grants);
      const revoked = asList(input.revoked);

      /*
        ⚠️ A KEY THE MANIFEST DOES NOT DECLARE IS INERT, and it looks exactly
        like a permission that was granted and does nothing. Refusing at the
        door is the only place the typo is legible.
      */
      const unknown = [...grants, ...revoked].filter((k) => !declared.has(k));
      if (unknown.length) ctx.fail("platform.invalid", { field: "grants", reason: `not a permission here: ${unknown.join(", ")}` });

      /*
        ⚠️ NOBODY MAY GRANT WHAT THEY DO NOT HOLD. Without this, any member who
        can edit permissions escalates to owner in two steps: grant themselves
        the key they lack, then use it. The check belongs beside the resolution
        rather than in whichever screen happens to call this.
      */
      if (!canGrant(d.permissions, grants)) ctx.fail("platform.forbidden", { field: "grants" });

      await setPermissions(d.db, d.tenantId, target!.id, { grants, revoked }, ctx.now());
      const after = (await membersOf(d.db, d.tenantId)).find((m) => m.id === target!.id)!;
      return { id: after.id, permissions: [...permissionsOf(d.roles, after)] };
    },
  });

  /*
    ⚠️ THE ROLE BUILDER EVERY APP GETS WITHOUT DECLARING ONE. An app declares
    permissions and a few roles; a workspace bundles those permissions its own
    way. Nothing here is app-specific — which is the whole argument for it being
    here rather than a screen each product builds again.
  */
  const roleList = operation({
    id: "role.list",
    kind: "read",
    summary: "Every role in this workspace, the product's and its own, and every permission there is to put in one.",
    input: s.object({}),
    output: s.object({ roles: s.json(), permissions: s.json() }),
    permission: "member:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const own = await rolesOf(d.db, d.tenantId);
      const members = await membersOf(d.db, d.tenantId);
      const held = (id: string) => members.filter((m) => m.role === id).length;
      return {
        /*
          ⚠️ ONE LIST, LABELLED, RATHER THAN TWO. A screen that draws the app's
          roles and the workspace's in separate sections invites the reading that
          they behave differently at a member's door, and they do not — the
          registry is merged and a role is a role. What differs is only whether
          this workspace may edit it.
        */
        roles: [
          ...Object.entries(app.access.roles).map(([id, permissions]) => ({
            id, name: id, permissions: [...permissions], source: "app", editable: false, held: held(id),
          })),
          ...own.map((r) => ({
            id: r.id, name: r.name, permissions: [...r.permissions], source: "workspace",
            /*
              ⚠️ WHAT THE AUTHOR MAY ACTUALLY DO WITH IT, answered here rather
              than guessed by the screen. A role carrying a key the person
              reading does not hold is one they may see and may not edit, and a
              form that lets them try produces a refusal for a rule that was
              knowable before they filled it in.
            */
            editable: canGrant(d.permissions, r.permissions), held: held(r.id),
          })),
        ],
        /* ⚠️ Only what the caller could actually put in a role. The rest would be
           a checkbox that answers `beyond_you` on save. */
        permissions: app.access.permissions.filter((p) => d.permissions.has(p)),
      };
    },
  });

  const roleSave = operation({
    id: "role.save",
    kind: "write",
    summary: "Create or change one of this workspace's own roles.",
    input: s.object({
      id: s.text({ min: 2, max: 40 }),
      name: s.text({ min: 1, max: 60 }),
      permissions: s.json(),
    }),
    output: s.object({ id: s.text(), name: s.text(), permissions: s.json() }),
    permission: "member:manage",
    idempotency: { mode: "natural", key: "id" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "role:save" }),
    outcome: { message: "Saved", tone: "success", invalidates: ["role.list", "member.list"] },
    fails: ["platform.invalid", "platform.forbidden"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL, for the reason `member.invite` is not: a role is
      what access is made of, and a model that can compose one from a sentence in
      a document it was asked to summarise is a model that can be asked to.
    */
    tool: false,
    async handler(ctx, input: { id: string; name: string; permissions: unknown }) {
      const d = deps(ctx);
      const permissions = Array.isArray(input.permissions)
        ? input.permissions.filter((v): v is string => typeof v === "string")
        : [];
      const refusal = refuseRole(
        { id: input.id, name: input.name, permissions },
        app.access.roles, declared, d.permissions,
      );
      /*
        ⚠️ EACH REFUSAL IS ITS OWN SENTENCE, and they are not one message because
        they are not one thing to do next. A bad id is a typo, a taken name is a
        role that already exists, an unknown key is a permission that would grant
        nothing, and `beyond_you` is the escalation — collapsed into "invalid",
        the last one reads as a bug in the form.
      */
      if (refusal === "id") ctx.fail("platform.invalid", { field: "id", reason: "letters, numbers and hyphens, starting with a letter" });
      if (refusal === "declared") ctx.fail("platform.invalid", { field: "id", reason: "this product already has a role by that name" });
      if (refusal === "undeclared_permission") ctx.fail("platform.invalid", { field: "permissions", reason: "not a permission here" });
      if (refusal === "beyond_you") ctx.fail("platform.forbidden", { field: "permissions", reason: "you do not hold everything this role would carry" });

      await saveRole(d.db, d.tenantId, { id: input.id, name: input.name, permissions }, ctx.now());
      return { id: input.id, name: input.name, permissions };
    },
  });

  const roleRemove = operation({
    id: "role.remove",
    kind: "write",
    summary: "Delete one of this workspace's own roles.",
    input: s.object({ id: s.text({ max: 40 }) }),
    output: s.object({ removed: s.text() }),
    permission: "member:manage",
    idempotency: { mode: "none" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "role:remove" }),
    outcome: { message: "Deleted", tone: "success", invalidates: ["role.list", "member.list"] },
    fails: ["platform.not_found", "platform.conflict", "platform.forbidden"],
    tool: false,
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      const mine = (await rolesOf(d.db, d.tenantId)).find((r) => r.id === input.id);
      if (!mine) ctx.fail("platform.not_found", { field: "id" });
      /*
        ⚠️ AND DELETING ONE IS BOUNDED THE SAME WAY MAKING ONE IS. Otherwise
        somebody who cannot compose a role can still destroy one that carries
        keys they do not hold, which is a permission change to everybody on it
        made by somebody with no standing to make it.
      */
      if (!canGrant(d.permissions, mine!.permissions)) {
        ctx.fail("platform.forbidden", { field: "id", reason: "you do not hold everything this role carries" });
      }
      /*
        ⚠️ A ROLE SOMEBODY HOLDS IS REFUSED, NEVER QUIETLY DELETED. Deleting it
        leaves every member on it resolving to no permissions at all — signed in,
        in the workspace, able to do nothing, with nothing on any screen saying
        why. Moving them somewhere automatically is worse: a permission change
        nobody asked for, applied to people who are not in the room.
      */
      const holding = await roleInUse(d.db, d.tenantId, input.id);
      if (holding > 0) {
        ctx.fail("platform.conflict", { field: "id", reason: `${holding} member${holding === 1 ? "" : "s"} still hold this role` });
      }
      await removeRole(d.db, d.tenantId, input.id);
      return { removed: input.id };
    },
  });

  return [
    ...(readable ? [list, roleList] : []),
    ...(manageable ? [add, rerole, remove, narrow, roleSave, roleRemove] : []),
  ] as unknown as readonly AnyOperation[];
}
