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

import type { AccountId, AppSpec, Door, TenantId } from "@engine/kernel";
import {
  foundingAppRole, permissionsFor, residencyFor, slugOk, slugTaken, wouldStrand,
} from "@engine/kernel";
import {
  appsOfTenant, becomeCommercial, createTenant, forgetInvitation, invitationsFor, noteBelonging,
  tenantsOf, upsertAccount, type TenantRow,
} from "./directory.js";
import {
  endSession, forgetCode, issueCode, mintToken, readSession, revokeToken, spendCode,
  startSession, tokensOf, type Session,
} from "./identity.js";
import { claimInvitations, found, memberFor, membersOf } from "./membership.js";
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
  /**
   * ⚠️ `values` FILLS THE SENTENCE'S TOKENS; `fields` SAYS WHICH INPUT IS WRONG.
   * They are different things and conflating them loses the second: a refusal
   * about one field arrived as the catalogue's generic "check the highlighted
   * fields", with nothing highlighted, because the only channel for saying WHICH
   * was a token the copy did not contain. `Problem.fields` is what the edit
   * sheet reads (`refusedOn`), so a refusal that names a field lands on it.
   */
  readonly fail: (
    code: string,
    values?: Record<string, string | number>,
    extra?: { readonly fields?: Readonly<Record<string, string>>; readonly ref?: string },
  ) => never;
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
  /**
   * ⚠️ WHETHER THIS ADDRESS RUNS THE DEPLOYMENT (D18), injected for the same
   * reason the console injects it: an operator is outside every workspace, so
   * no role and no roster can answer. Absent means this deployment has no
   * operator surface, which answers `false` for everybody.
   */
  readonly isOperator?: (email: string | null) => boolean;
  /**
   * ⚠️ WHETHER A WORKSPACE NEEDS SOMEBODY'S ATTENTION, ASKED RATHER THAN READ.
   * The answer lives in the money module, which a deployment may not have
   * applied — reading its table from here made `me.who` throw
   * `no such table: subscription` on one that had not, and `me.who` is the one
   * call every door makes before it can draw anything. Absent means nothing is
   * flagged, which is the honest answer when nothing is being charged.
   */
  readonly needsAttention?: (
    directory: Db, tenantId: TenantId, appId: string,
  ) => Promise<boolean>;
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

    /*
      ⚠️ WHAT THE HUB IS BUILT FROM, AND IT IS AN ACCOUNT'S ANSWER. Who you are,
      everywhere you belong and whether you run the deployment — none of which
      is a fact about any one workspace, which is why the hub can be opened
      from every door and show the same thing.

      ⚠️ THE ROLE COMES FROM EACH WORKSPACE'S OWN SHARD, which is a fan-out and
      is bounded by how many workspaces one person is in — a handful, not a
      catalogue. It is worth it: a list of workspaces with no role and no
      standing is a list nobody can scan, and the alternative is publishing
      memberships into the directory, where another product's worker could
      read them (D5).
    */
    "me.who": {
      kind: "read", needs: "session",
      async run(ctx): Promise<unknown> {
        const accountId = ctx.session!.accountId;
        const tenants = await tenantsOf(ctx.directory, accountId);
        const belongs = await Promise.all(tenants.map(async (t) => {
          const apps = await appsOfTenant(ctx.directory, t.id);
          const member = await memberFor(ctx.shardOf(t), t.id, accountId);
          /* ⚠️ Only where it is worth saying. A badge on every row is texture;
             one on the workspace that stopped paying is why somebody looked. */
          const owing = deps.needsAttention
            ? await Promise.all(apps.map((appId) =>
              deps.needsAttention!(ctx.directory, t.id, appId)))
            : [];
          return {
            slug: t.slug, name: t.name,
            /* ⚠️ WHAT IT IS TRAVELS WITH THE LIST, because every screen that
               draws a workspace has to know: a business wears its own tile, has
               a brand to edit, and offers nothing about becoming one. Asked per
               workspace after the fact would be one round trip per row on the
               screen somebody lands on. */
            kind: t.kind,
            legalName: t.legalName,
            platformRole: member?.platformRole ?? null,
            appRoles: member?.appRoles ?? {},
            apps,
            attention: owing.some(Boolean),
          };
        }));
        return {
          accountId, email: ctx.email,
          /* ⚠️ An account fact, not a workspace one — an operator stands
             outside every workspace, so no roster could answer it. */
          operator: deps.isOperator?.(ctx.email) === true,
          tenants: belongs,
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
        /* ⚠️ ASKED, NOT REPEATED. A workspace at `admin.` or `id.` is a takeover,
           so which labels are ours is a security control — and it was written out
           here AND in `door.ts` while `slugTaken`, which answers exactly this, was
           called by neither. Two copies of a control agree until one is edited. */
        if (!name || !slugOk(slug) || slugTaken(slug)) {
          return ctx.fail("platform.invalid");
        }
        if (!/^[A-Z]{2}$/.test(country)) return ctx.fail("platform.invalid");

        const app = ctx.app(deps.appId);
        if (!app) return ctx.fail("platform.unavailable");
        /* ⚠️ Workspace authority is the PLATFORM'S to give — `found` makes the
           creator an `owner` regardless of any app. What the app declares is
           the role they hold INSIDE it (D15). */
        const role = foundingAppRole(app.access);
        if (!role) return ctx.fail("platform.unavailable");

        const made = await createTenant(ctx.directory, {
          slug, name, country, where: residencyFor(country), apps: [deps.appId],
        }, ctx.now);
        if (made === "slug_taken") return ctx.fail("platform.conflict");
        if (made === "nowhere_to_put_it") return ctx.fail("platform.unavailable");

        const accountId = ctx.session!.accountId;
        await found(ctx.shardOf(made.tenant), made.tenant.id, accountId,
          ctx.email ?? "", { [deps.appId]: role }, ctx.now);
        await noteBelonging(ctx.directory, accountId, made.tenant.id, ctx.now);
        return { slug: made.tenant.slug, id: made.tenant.id };
      },
    },

    /* ------------------------------------------------- becoming a business --- */

    /**
     * ⚠️ THE PERSONAL LANE, BECAUSE THE WORKSPACE'S OWN DOOR IS THE WRONG PLACE
     * TO STAND. This is a decision about what the workspace IS, made by whoever
     * founded it, and it is reached from the hub beside the list of workspaces
     * rather than from inside one — the same reason creating one lives here.
     *
     * ⚠️ AND IT IS ONE WAY. There is no `me.tenant.personal`, deliberately: see
     * `mayBecome`. Rolling back would mean withdrawing a brand a business's own
     * customers have seen and moving records off a shard they were promised.
     */
    "me.tenant.commercial": {
      kind: "write", needs: "session",
      /*
        ⚠️ THE WORKSPACE'S OWN DOOR IS ALLOWED HERE AND NOT ON `create`, AND THE
        DIFFERENCE IS WHAT THE OPERATION IS ABOUT. Creating a workspace from
        inside somebody else's invites a person who followed a colleague's link
        to start a second one. This is about the workspace they are standing in —
        offered anywhere else it would be a decision made at a distance from the
        thing it changes.
      */
      doors: ["setup", "account", "tenant"],
      async run(ctx, input): Promise<unknown> {
        const slug = String(input.slug ?? "");
        const legalName = String(input.legalName ?? "").trim();

        /* ⚠️ Only from the list of workspaces this account is actually in — a
           slug in a body is otherwise a way to name somebody else's. */
        const tenants = await tenantsOf(ctx.directory, ctx.session!.accountId);
        const tenant = tenants.find((t) => t.slug === slug);
        if (!tenant) return ctx.fail("platform.not_found");

        const mine = await memberFor(ctx.shardOf(tenant), tenant.id, ctx.session!.accountId);
        /* ⚠️ The workspace's own authority, asked through the one resolver.
           Nobody but somebody who can run the place may decide it is a
           business — it puts a legal name on invoices in their name. */
        if (!mine || !permissionsFor(mine, null).has("tenant:manage")) {
          return ctx.fail("platform.forbidden");
        }

        /* DEFER(engine-21) stage:21 — nothing takes a card yet, so `paid` is
           false and the only lane through is an operator's allowance. The
           refusal is already the right one, which is the half that matters:
           when payment lands it sets this and nothing else here changes. */
        const done = await becomeCommercial(
          ctx.directory, tenant.id, ctx.session!.accountId,
          { legalName, paid: false }, ctx.now);

        if (done === "no_such_tenant") return ctx.fail("platform.not_found");
        if (done === "already") return ctx.fail("platform.conflict");
        if (done === "legal_name") return ctx.fail("platform.invalid");
        if (done === "unpaid") return ctx.fail("platform.payment_required");
        return { slug: done.slug, kind: done.kind, legalName: done.legalName };
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
          nobody able to invite anybody back in. Asked of the PLATFORM authority,
          through the kernel's one rule — a second local copy of "who can run
          this place" is how the two answers drift.
        */
        if (wouldStrand(members, ctx.session!.accountId)) return ctx.fail("platform.conflict");

        await db.prepare(`UPDATE membership SET removed_at = ? WHERE id = ?`)
          .bind(ctx.now.toISOString(), mine.id).run();
        await ctx.directory.prepare(`DELETE FROM belongs WHERE account_id = ? AND tenant_id = ?`)
          .bind(ctx.session!.accountId, tenant.id).run();
        return { left: slug };
      },
    },

    /* ------------------------------------------------------------- tokens --- */

    /*
      ⚠️ A TOKEN IS MINTED AT THE ACCOUNT CENTRE AND NOWHERE ELSE. It is an
      account credential — what it may do in a workspace is that workspace's
      roster answering per request — so the place that mints it is the door
      about who you are, not any one workspace's. Shown once; stored as a hash;
      dead in ninety days unless re-minted; revocable this instant because it is
      a row (see `identity.ts`).
    */
    "me.token.create": {
      kind: "write", needs: "session", doors: ["account"],
      async run(ctx, input): Promise<unknown> {
        const label = String(input.label ?? "").trim();
        if (!label || label.length > 80) return ctx.fail("platform.invalid");
        return mintToken(ctx.directory, ctx.session!.accountId, label, deps.secret, ctx.now);
      },
    },

    "me.token.list": {
      kind: "read", needs: "session", doors: ["account"],
      async run(ctx): Promise<unknown> {
        return { items: await tokensOf(ctx.directory, ctx.session!.accountId) };
      },
    },

    "me.token.revoke": {
      kind: "write", needs: "session", doors: ["account"],
      async run(ctx, input): Promise<unknown> {
        const done = await revokeToken(
          ctx.directory, ctx.session!.accountId, String(input.id ?? ""), ctx.now);
        if (!done) return ctx.fail("platform.not_found");
        return { id: String(input.id) };
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
