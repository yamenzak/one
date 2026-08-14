/**
 * THE OPERATIONS ABOUT YOURSELF, WHICH BELONG TO NO WORKSPACE.
 *
 * ⚠️ SOMEBODY HAS TO BE ABLE TO ACT BEFORE THEY BELONG TO ANYTHING. Signing in,
 * making a first workspace, seeing which ones you are in, leaving one — none of
 * these can be gated by a role, because a role is held inside a workspace and
 * the caller is outside every workspace at the moment they need them. That is
 * what `PUBLIC` means in the kernel and what this lane is.
 *
 * ⚠️ AND IT IS NOT A HOLE. Every operation here still requires a session except
 * the two that create one, and neither of those grants anything: one sends a
 * code to an address, the other exchanges a code for a session as whoever owns
 * that address. Nothing in this lane takes an account id from a caller.
 *
 * ⚠️ LEAVING IS ALWAYS ALLOWED. This lane is deliberately outside the standing
 * gate: a workspace in arrears must not be a trap, and paying has to be a way
 * out rather than the only one.
 */

import type { AccountId, AppSpec, Door, TenantId } from "@quad/kernel";
import { RESERVED_SLUGS, foundingRole, residencyFor, slugOk } from "@quad/kernel";
import {
  appsOfTenant, createTenant, forgetInvitation, invitationsFor, noteBelonging, tenantsOf,
  upsertAccount, type TenantRow,
} from "./directory.js";
import {
  endSession, forgetCode, issueCode, readSession, spendCode, startSession, type Session,
} from "./identity.js";
import { claimInvitations, found, membersOf } from "./membership.js";
import type { Db } from "./sql.js";

/* ------------------------------------------------------------------ shape --- */

export interface PersonalCtx {
  readonly directory: Db;
  readonly session: Session | null;
  readonly email: string | null;
  readonly door: Door;
  readonly now: Date;
  /** The database a workspace's records are on. */
  readonly shardOf: (tenant: TenantRow) => Db;
  readonly app: (id: string) => AppSpec | null;
  /** ⚠️ Set on the response by the runtime, so no handler writes a header. */
  readonly issue: (session: Session | null) => void;
  readonly fail: (code: string, values?: Record<string, string | number>) => never;
}

export interface PersonalOp {
  readonly kind: "read" | "write";
  /** ⚠️ `nobody` is only for the two operations that create a session. */
  readonly needs: "session" | "nobody";
  /** Which doors it answers on. A workspace is not where a workspace is made. */
  readonly doors?: readonly Door["kind"][];
  readonly run: (ctx: PersonalCtx, input: Record<string, unknown>) => Promise<unknown>;
}

export type PersonalBook = Readonly<Record<string, PersonalOp>>;

/* ------------------------------------------------------------------ seams --- */

export interface IdentityDeps {
  /** The secret codes are hashed with. Never the code itself. */
  readonly secret: string;
  /**
   * ⚠️ SENDING IS INJECTED, AND A DEPLOYMENT THAT CANNOT SEND MUST NOT PRETEND.
   * A sign-in that answers "check your email" with nothing sent is a product
   * that appears to work and cannot be used — so a failure here is a refusal.
   */
  readonly deliver: (to: string, code: string) => Promise<void>;
  /** Which role a workspace's founder gets. Derived from the app, not named. */
  readonly appId: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The operations every deployment has, whatever apps it serves.
 *
 * ⚠️ THEY ARE THE PLATFORM'S, NOT AN APP'S. An app that had to declare "sign in"
 * would be an app that could declare it differently — and then a person's
 * identity would mean something slightly different per product, which is the
 * thing one account across every product exists to prevent.
 */
export function personalOps(deps: IdentityDeps): PersonalBook {
  return {
    /* ------------------------------------------------------------ sign in --- */

    "me.code": {
      kind: "write", needs: "nobody",
      async run(ctx, input): Promise<unknown> {
        const email = String(input.email ?? "").trim().toLowerCase();
        if (!EMAIL.test(email)) return ctx.fail("platform.invalid");

        /* ⚠️ The signpost issues no code: there is no tenancy for one to be
           about, and a code sent from nowhere is a code that signs you in to
           nothing. */
        if (ctx.door.kind === "signpost" || ctx.door.kind === "device") return ctx.fail("platform.not_found");

        const issued = await issueCode(ctx.directory, email, deps.secret, ctx.now);
        if (issued === "too_soon") return ctx.fail("platform.too_many", { retryAfter: 60 });

        /*
          ⚠️ A FAILURE TO SEND IS A REFUSAL, NOT A SHRUG — see `deliver`. And the
          issued code is withdrawn with it: the row is written before the send is
          attempted, so leaving it there means the next attempt is refused as
          "too often" while no code was ever delivered.
        */
        try {
          await deps.deliver(email, issued.code);
        } catch {
          await forgetCode(ctx.directory, issued.id);
          return ctx.fail("platform.unavailable");
        }
        return { sent: true };
      },
    },

    "me.session": {
      kind: "write", needs: "nobody",
      async run(ctx, input): Promise<unknown> {
        const email = String(input.email ?? "").trim().toLowerCase();
        const code = String(input.code ?? "").trim();
        const wrong = await spendCode(ctx.directory, email, code, deps.secret, ctx.now);
        /*
          ⚠️ ONE ANSWER FOR EVERY WAY A CODE CAN BE WRONG. Distinguishing "no
          such code" from "wrong code" here would tell somebody enumerating
          addresses which ones have been asked to sign in.
        */
        if (wrong) return ctx.fail("platform.unauthorized");

        const accountId = await upsertAccount(ctx.directory, email, null, ctx.now);
        const session = await startSession(ctx.directory, accountId, ctx.now);
        ctx.issue(session);

        /*
          ⚠️ INVITATIONS ARE CLAIMED HERE, BY ADDRESS. The directory answers
          which workspaces invited it — one query for somebody who belongs to
          nothing yet — and the membership row in each shard is what is claimed.
        */
        const invited = await invitationsFor(ctx.directory, email);
        for (const tenant of invited) {
          await claimInvitations(ctx.shardOf(tenant), accountId, email, ctx.now);
          await noteBelonging(ctx.directory, accountId, tenant.id, ctx.now);
          await forgetInvitation(ctx.directory, email, tenant.id);
        }
        return { signedIn: true, joined: invited.map((t) => t.slug) };
      },
    },

    "me.signout": {
      kind: "write", needs: "session",
      async run(ctx): Promise<unknown> {
        if (ctx.session) await endSession(ctx.directory, ctx.session.id, ctx.now);
        ctx.issue(null);
        return { signedOut: true };
      },
    },

    /* --------------------------------------------------------------- you --- */

    "me.who": {
      kind: "read", needs: "session",
      async run(ctx): Promise<unknown> {
        const accountId = ctx.session!.accountId;
        const tenants = await tenantsOf(ctx.directory, accountId);
        return {
          accountId, email: ctx.email,
          tenants: tenants.map((t) => ({ slug: t.slug, name: t.name })),
        };
      },
    },

    /* ---------------------------------------------------- a new workspace --- */

    "me.tenant.create": {
      kind: "write", needs: "session",
      /* ⚠️ ONE PLACE A WORKSPACE IS MADE. Offered on a workspace's own door, it
         invites somebody who followed a colleague's link to start a second one
         — which a previous platform shipped, on that workspace's own branded
         sign-in page. */
      doors: ["setup", "account"],
      async run(ctx, input): Promise<unknown> {
        const slug = String(input.slug ?? "").trim().toLowerCase();
        const name = String(input.name ?? "").trim();
        const country = String(input.country ?? "").trim().toUpperCase();
        if (!name || !slugOk(slug) || RESERVED_SLUGS.includes(slug)) {
          return ctx.fail("platform.invalid");
        }
        if (!/^[A-Z]{2}$/.test(country)) return ctx.fail("platform.invalid");

        const app = ctx.app(deps.appId);
        if (!app) return ctx.fail("platform.unavailable");
        /* ⚠️ The founding role is chosen by CAPABILITY, not by the name
           "owner" — an app whose administrators are called something else still
           gets a workspace somebody can run. */
        const role = foundingRole(app.access.roles);
        if (!role) return ctx.fail("platform.unavailable");

        const made = await createTenant(ctx.directory, {
          slug, name, country, where: residencyFor(country), apps: [deps.appId],
        }, ctx.now);
        if (made === "slug_taken") return ctx.fail("platform.conflict");
        if (made === "nowhere_to_put_it") return ctx.fail("platform.unavailable");

        const accountId = ctx.session!.accountId;
        await found(ctx.shardOf(made.tenant), made.tenant.id, accountId,
          ctx.email ?? "", role, ctx.now);
        await noteBelonging(ctx.directory, accountId, made.tenant.id, ctx.now);
        return { slug: made.tenant.slug, id: made.tenant.id };
      },
    },

    /* ------------------------------------------------------------ leaving --- */

    "me.leave": {
      kind: "write", needs: "session",
      async run(ctx, input): Promise<unknown> {
        const slug = String(input.slug ?? "");
        const tenants = await tenantsOf(ctx.directory, ctx.session!.accountId);
        const tenant = tenants.find((t) => t.slug === slug);
        if (!tenant) return ctx.fail("platform.not_found");

        const db = ctx.shardOf(tenant);
        const members = await membersOf(db, tenant.id);
        const mine = members.find((m) => m.accountId === ctx.session!.accountId);
        if (!mine) return ctx.fail("platform.not_found");

        /*
          ⚠️ LEAVING IS ALWAYS ALLOWED, EXCEPT WHERE IT WOULD STRAND THE
          WORKSPACE. The last person who can manage members walking out does not
          close it — it makes it unreachable, with the bill still running and
          nobody able to invite anybody back in.
        */
        const app = ctx.app(deps.appId);
        const roles = app?.access.roles ?? {};
        const managers = members.filter((m) => roles[m.role]?.includes("member:manage"));
        if (managers.length === 1 && managers[0]?.id === mine.id) return ctx.fail("platform.conflict");

        await db.prepare(`UPDATE membership SET removed_at = ? WHERE id = ?`)
          .bind(ctx.now.toISOString(), mine.id).run();
        await ctx.directory.prepare(`DELETE FROM belongs WHERE account_id = ? AND tenant_id = ?`)
          .bind(ctx.session!.accountId, tenant.id).run();
        return { left: slug };
      },
    },
  };
}

/* ----------------------------------------------------------------- helpers --- */

/** Read the session and the address behind it, in one place. */
export async function whoIs(
  directory: Db, id: string | null, now: Date,
): Promise<{ session: Session | null; email: string | null; accountId: AccountId | null }> {
  if (!id) return { session: null, email: null, accountId: null };
  const session = await readSession(directory, id, now);
  if (!session) return { session: null, email: null, accountId: null };
  const row = await directory.prepare(`SELECT email FROM account WHERE id = ?`)
    .bind(session.accountId).first<{ email: string }>();
  return { session, email: row?.email ?? null, accountId: session.accountId };
}

export { appsOfTenant };
