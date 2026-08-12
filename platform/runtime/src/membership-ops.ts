/**
 * THE ROSTER'S SURFACE — invite, re-role, and remove.
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

import type { AnyOperation, AppSpec, BindingSpec, Instant, SqlHandle, TenantId, UserId } from "@one/kernel";
import { canGrant, operation, s, withinQuota } from "@one/kernel";
import { invite, membersOf, permissionsOf, revoke, seatsUsed, setPermissions, wouldStrand } from "./membership.js";

/** ⚠️ A symbol, so an app cannot reach the store by writing a property name. */
export const MEMBERS = Symbol.for("one.runtime.members");

export interface MemberDeps {
  readonly db: SqlHandle;
  readonly tenantId: TenantId;
  readonly userId: UserId | null;
  /**
   * ⚠️ WHAT THE CALLER THEMSELVES HOLDS, because nobody may grant what they do
   * not hold. Resolved once per request like everything else on the caller —
   * re-deriving it here would be the second implementation of the one question
   * this whole file exists to answer.
   */
  readonly permissions: ReadonlySet<string>;
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
  const roles = Object.keys(app.access.roles);

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
    fails: ["platform.invalid", "platform.quota_reached"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL. Adding somebody to a workspace is granting
      access to everything in it, and a model that can do it from a sentence in
      a document it was asked to summarise is a model that can be asked to.
    */
    tool: false,
    async handler(ctx, input: { email: string; role: string; subjectId?: string }) {
      const d = deps(ctx);
      /*
        ⚠️ A ROLE THE MANIFEST DOES NOT DECLARE GRANTS NOTHING, FOREVER, and it
        looks exactly like a colleague who cannot see anything for no reason.
        Refusing at the door is the only place the mistake is legible.
      */
      if (!roles.includes(input.role)) {
        ctx.fail("platform.invalid", { field: "role", reason: `not a role here: ${roles.join(", ")}` });
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
        d.db, d.tenantId,
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
      */
      if (wouldStrand(app.access.roles, members, input.id)) {
        ctx.fail("platform.conflict", { field: "id", reason: "last_administrator" });
      }
      await revoke(d.db, d.tenantId, target!.id, ctx.now());
      return { removed: target!.id };
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
      return { id: after.id, permissions: [...permissionsOf(app.access.roles, after)] };
    },
  });

  return [
    ...(readable ? [list] : []),
    ...(manageable ? [add, remove, narrow] : []),
  ] as unknown as readonly AnyOperation[];
}
