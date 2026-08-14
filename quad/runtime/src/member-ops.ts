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
import { PUBLIC, withinQuota } from "@quad/kernel";
import { noteInvitation } from "./directory.js";
import { inboxOf, markSeen, policyOf, preferenceOf, setPolicy, setPreference, unseenCount } from "./inbox.js";
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

    /* ------------------------------------------------------------ inbox --- */

    /*
      ⚠️ THE INBOX IS THE PLATFORM'S AND EVERY APP HAS IT. An app that had to
      declare "list my notifications" would be an app that could ship without
      one — which is precisely what a previous platform did, for three stages,
      with the schema, the routes and sixteen dispatch sites already in place.

      ⚠️ AND `PUBLIC` IS RIGHT HERE: this is a question about the caller, and a
      workspace permission on "what was I told" would be a role check on
      somebody's own record.
    */
    "inbox.list": op("inbox.list", "read", PUBLIC as unknown as string, "What you were told.",
      async (ctx) => ({
        items: ctx.accountId ? await inboxOf(ctx.db, ctx.tenantId as TenantId, ctx.accountId) : [],
        unseen: ctx.accountId ? await unseenCount(ctx.db, ctx.tenantId as TenantId, ctx.accountId) : 0,
      })),

    "inbox.seen": op("inbox.seen", "write", PUBLIC as unknown as string, "Mark as read.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        await markSeen(ctx.db, ctx.tenantId as TenantId, ctx.accountId,
          input.id ? String(input.id) : null, ctx.now);
        return { seen: true };
      }),

    /* ⚠️ Two levels, two operations, two authorities. A person narrowing their
       own notifications and a workspace setting the ceiling are not the same
       write, and sharing one would let either overwrite the other. */
    "inbox.preference": op("inbox.preference", "write", PUBLIC as unknown as string,
      "Choose how you are told.",
      async (ctx, input) => {
        if (!ctx.accountId) return ctx.fail("platform.unauthorized");
        await setPreference(ctx.db, ctx.tenantId as TenantId, ctx.accountId,
          String(input.type ?? ""), asChannels(input.channels));
        return { saved: true };
      }),

    "inbox.policy": op("inbox.policy", "write", "tenant:manage",
      "Choose what this workspace may be told about.",
      async (ctx, input) => {
        await setPolicy(ctx.db, ctx.tenantId as TenantId,
          String(input.type ?? ""), asChannels(input.channels));
        return { saved: true };
      }),

    "inbox.settings": op("inbox.settings", "read", PUBLIC as unknown as string,
      "The two levels of the notification policy.",
      async (ctx) => ({
        policy: await policyOf(ctx.db, ctx.tenantId as TenantId),
        preference: ctx.accountId
          ? await preferenceOf(ctx.db, ctx.tenantId as TenantId, ctx.accountId)
          : {},
      })),

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

/** ⚠️ A channel list from a request is untrusted; the kernel's policy rules
    refuse anything the type does not offer, and this only keeps the shape. */
const asChannels = (given: unknown): readonly ("inbox" | "email" | "push")[] =>
  (Array.isArray(given) ? given : [])
    .filter((c): c is "inbox" | "email" | "push" => c === "inbox" || c === "email" || c === "push");
