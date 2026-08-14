/**
 * THE ROSTER, WHICH EVERY APP HAS AND NO APP DECLARES.
 *
 * ⚠️ MEMBERSHIP IS THE PLATFORM'S, NOT A PRODUCT'S. An app that had to declare
 * "invite a colleague" would be an app that could declare it differently — and
 * the two doors that bound an invitation (you may not grant what you do not
 * hold; an invitation takes a seat before it is answered) would then be two
 * doors per product, each of which somebody could leave open. A previous
 * platform shipped exactly that: the function that bounds a role assignment
 * existed and had no caller at all, so the way to become an owner was to invite
 * a second address of your own as one.
 *
 * ⚠️ THESE RUN WITH MORE THAN A HANDLER GETS. They write the directory's
 * invitation index as well as the workspace's own roster, which is a reach an
 * app handler deliberately does not have — so they are marked, and the extra
 * context is passed only to them.
 */

import type { Allowance, AppSpec, TenantId } from "@quad/kernel";
import { withinQuota } from "@quad/kernel";
import { noteInvitation } from "./directory.js";
import { invite, membersOf, remove, rolesFor, setRole } from "./membership.js";
import type { Ctx, Resolved } from "./compose.js";
import type { Db } from "./sql.js";

/**
 * ⚠️ WHAT A PLATFORM OPERATION SEES THAT AN APP'S DOES NOT. Widening `Ctx`
 * itself would hand every app handler the directory, and then "the handler never
 * reaches around the platform" would be a convention rather than a shape.
 */
export interface PlatformCtx extends Ctx {
  readonly directory: Db;
  readonly permissions: ReadonlySet<string>;
  readonly email: string | null;
  readonly allowance: (key: string) => Allowance;
}

const asPlatform = (ctx: Ctx): PlatformCtx => ctx as PlatformCtx;

/**
 * The roster operations, derived from the app's own access declaration.
 *
 * ⚠️ THE SEAT CEILING COMES FROM THE ENTITLEMENT THE APP NAMED, so a product
 * that sells seats differently sells them by declaring it rather than by writing
 * this again.
 */
export function memberOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  const seats = app.access.seats;
  const roles = () => app.access.roles;

  const op = (
    id: string, kind: "read" | "write", permission: string, summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    permission,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission,
      idempotency: { mode: "none" },
      ...(kind === "write" ? { emits: [`${id}d`] } : {}),
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: (ctx, input) => run(asPlatform(ctx), input),
  });

  return {
    "member.list": op("member.list", "read", "member:read", "Everybody in this workspace.",
      async (ctx) => ({
        items: (await membersOf(ctx.db, ctx.tenantId as TenantId)).map((m) => ({
          id: m.id, email: m.email, role: m.role, accepted: m.acceptedAt !== null,
        })),
      })),

    "member.invite": op("member.invite", "write", "member:manage", "Invite somebody by email.",
      async (ctx, input) => {
        const email = String(input.email ?? "").trim().toLowerCase();
        const role = String(input.role ?? "");
        const allowed = ctx.allowance(seats.entitlement);
        /* ⚠️ Reported as a ceiling with its numbers, because "you have used all
           of yours" without them renders "your plan includes undefined". */
        const used = (await membersOf(ctx.db, ctx.tenantId as TenantId))
          .filter((m) => seats.counts.includes(m.role)).length;
        if (!withinQuota(allowed, used)) {
          return ctx.fail("platform.quota_reached", { limit: String(allowed), used });
        }

        const merged = await rolesFor(ctx.db, ctx.tenantId as TenantId, roles());
        const made = await invite(ctx.db, ctx.tenantId as TenantId, { email, role },
          { permissions: ctx.permissions }, merged,
          { counts: seats.counts, allowed: typeof allowed === "number" ? allowed : -1 }, ctx.now);

        if (made === "beyond_you") return ctx.fail("platform.forbidden");
        if (made === "already_here") return ctx.fail("platform.conflict");
        if (made === "no_such_role") return ctx.fail("platform.invalid");
        if (made === "no_seats") return ctx.fail("platform.quota_reached", { limit: String(allowed), used });

        /* ⚠️ THE INDEX IS WHAT MAKES IT CLAIMABLE. Without this row the person
           signs in, belongs to nothing, and the only way to find their
           invitation is to search every shard for it (D5). */
        await noteInvitation(ctx.directory, email, ctx.tenantId as TenantId, ctx.now);
        return { id: made.id, email: made.email, role: made.role };
      }),

    "member.role": op("member.role", "write", "member:manage", "Change somebody's role.",
      async (ctx, input) => {
        const merged = await rolesFor(ctx.db, ctx.tenantId as TenantId, roles());
        const out = await setRole(ctx.db, ctx.tenantId as TenantId, String(input.id ?? ""),
          String(input.role ?? ""), { permissions: ctx.permissions }, merged);
        if (out === "beyond_you") return ctx.fail("platform.forbidden");
        if (out === "no_such_member") return ctx.fail("platform.not_found");
        if (out === "no_such_role") return ctx.fail("platform.invalid");
        if (out === "would_strand") return ctx.fail("platform.conflict");
        return { id: String(input.id) };
      }),

    "member.remove": op("member.remove", "write", "member:manage", "Remove somebody.",
      async (ctx, input) => {
        const merged = await rolesFor(ctx.db, ctx.tenantId as TenantId, roles());
        const out = await remove(ctx.db, ctx.tenantId as TenantId, String(input.id ?? ""),
          { permissions: ctx.permissions }, merged, ctx.now);
        if (out === "beyond_you") return ctx.fail("platform.forbidden");
        if (out === "no_such_member") return ctx.fail("platform.not_found");
        /* ⚠️ Removing the last person who can run the place does not close it —
           it makes it unreachable, with the bill still running. */
        if (out === "would_strand") return ctx.fail("platform.conflict");
        return { id: String(input.id) };
      }),
  };
}
