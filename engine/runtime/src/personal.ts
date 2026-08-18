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

import type { AccountId, AppSpec, DocumentBook, Door, TenantId } from "@engine/kernel";
import {
  foundingAppRole, permissionsFor, residencyFor, slugOk, slugTaken, wouldStrand,
} from "@engine/kernel";
import {
  appsOfTenant, becomeCommercial, closeTenant, createTenant, forgetInvitation, invitationsFor,
  liveAppsOfTenant, noteBelonging, tenantBySlug, tenantsOf, upsertAccount, type TenantRow,
} from "./directory.js";
import { subscribeDevice, unsubscribeDevice, vapidOf } from "./push.js";
import { dossierOf, forgetPerson, forgetWorkspace, type Place } from "./dossier.js";
import { erase } from "./records.js";
import {
  endEverySession, endSession, forgetCode, issueCode, mintToken, noteProof, readSession,
  revokeToken, spendCode, startSession, tokensOf, type Session,
} from "./identity.js";
import { claimInvitations, found, memberFor, membersOf } from "./membership.js";
import { eraseObjects, type Bucket, type Where } from "./storage.js";
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
  /**
   * ⚠️ WHERE ITS FILES ARE — the bucket the reconciler made for that workspace's
   * jurisdiction. Absent means this deployment stores no files, which is the
   * honest state of one whose bucket is not live yet.
   */
  readonly bucketOf?: (where: Where) => Bucket | null;
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
  /**
   * ⚠️ REACHABLE BY SOMEBODY WHO HAS NOT AGREED TO THE TERMS. Holding the
   * documents over somebody is fair; holding their DATA over them is not — so
   * reading what is being asked, agreeing, leaving with a copy, deleting and
   * signing out all stay open. A wall nobody can leave through is a hostage.
   */
  readonly beforeAccepting?: true;
  /**
   * ⚠️ THE SAME FIFTEEN MINUTES THE KERNEL'S PROOF GATE USES, and the same
   * argument: destroying somebody's records cannot be undone and must not be
   * doable from a borrowed laptop with a tab left open. It is enforced in the
   * runtime rather than in a handler, because a handler that could forget it is
   * a handler that eventually will.
   */
  readonly proof?: "recent";
  readonly run: (ctx: PersonalCtx, input: Record<string, unknown>) => Promise<unknown>;
}

export type PersonalBook = Readonly<Record<string, PersonalOp>>;

/* ------------------------------------------------------------------ seams --- */

export interface IdentityDeps {
  /** The secret codes are hashed with. Never the code itself. */
  readonly secret: string;
  /**
   * ⚠️ THE DEPLOYMENT'S OWN DOCUMENTS — terms, the privacy notice, the DPA. They
   * bind a legal entity rather than a feature, so there is one set for every app
   * here and it is injected rather than declared per product.
   */
  readonly documents?: DocumentBook;
  /**
   * ⚠️ WHAT THIS CALLER STILL OWES AN AGREEMENT TO. Absent means this deployment
   * asks for none — which is the honest state of one that has declared no
   * documents, and is checked at boot rather than typed at every call site: a
   * required parameter here would be satisfied with `async () => []` by whoever
   * was in a hurry, and that reads exactly like "everybody has agreed".
   */
  readonly owed?: (ctx: PersonalCtx) => Promise<readonly unknown[]>;
  /**
   * ⚠️ IT MAY REFUSE, AND THE REFUSAL HAS TO COME BACK. Where an acceptance is
   * recorded is derived from what the document binds (`acceptanceScope`), so the two
   * honest failures are structural: the business's agreement asked at a door
   * with no business behind it, and asked of somebody who cannot bind it.
   * Returning `void` would answer both with a cheerful 200 and no row — a
   * screen that says "agreed" over a wall that is still up.
   */
  readonly accept?: (
    ctx: PersonalCtx, document: string, version: string,
  ) => Promise<void | "needs_a_workspace" | "not_yours_to_give">;
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
 * EVERY DATABASE THIS PERSON COULD BE IN — the directory, and each shard holding
 * a workspace they belong to.
 *
 * ⚠️ ONE ENTRY PER DATABASE, NOT PER WORKSPACE. Two workspaces on one shard
 * share its tables, so a place per workspace reads the same rows twice: an
 * export that lists somebody's notifications twice, and a deletion whose second
 * pass reports zero and reads exactly like a shard that was missed.
 *
 * ⚠️ AND THE APPS ARE THE UNION OF WHAT IS ENABLED THERE, because a
 * subject-scoped collection is walked per database rather than per workspace for
 * the same reason.
 */
async function everywhere(ctx: PersonalCtx): Promise<readonly Place[]> {
  const byDb = new Map<string, { db: Db; of: string; apps: Map<string, AppSpec> }>();
  for (const tenant of await tenantsOf(ctx.directory, ctx.session!.accountId)) {
    const at = byDb.get(tenant.shardId)
      ?? { db: ctx.shardOf(tenant), of: tenant.shardId, apps: new Map<string, AppSpec>() };
    for (const appId of await appsOfTenant(ctx.directory, tenant.id)) {
      const app = ctx.app(appId);
      if (app) at.apps.set(appId, app);
    }
    byDb.set(tenant.shardId, at);
  }
  return [
    { db: ctx.directory, of: "directory", apps: [] },
    ...[...byDb.values()].map((at) => ({ db: at.db, of: at.of, apps: [...at.apps.values()] })),
  ];
}

/**
 * WHICH WORKSPACE'S DOOR THIS IS, OR NONE.
 *
 * ⚠️ FROM THE HOST AND NOTHING THE CALLER SAID. A slug in a body would let
 * somebody file their device under a workspace they are not in — and the
 * consequence is not a leak but something stranger: their phone would start
 * showing a business's logo on notifications they are not entitled to receive,
 * and receive none of them, because the audience is resolved from the roster.
 */
const tenantAtDoor = async (ctx: PersonalCtx): Promise<TenantId | null> =>
  ctx.door.kind === "tenant" && ctx.door.slug
    ? ((await tenantBySlug(ctx.directory, ctx.door.slug))?.id as TenantId | undefined) ?? null
    : null;

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
    /* --------------------------------------------------------- agreements --- */

    /*
      ⚠️ READABLE BY SOMEBODY WHO HAS NOT AGREED, WHICH IS THE WHOLE POINT. A
      wall that will not show what is behind it is a wall nobody can get past —
      this is the read the acceptance gate must never refuse, because it is how
      its own refusal is answered.
    */
    "me.agreements": {
      kind: "read", needs: "session", beforeAccepting: true,
      async run(ctx): Promise<unknown> {
        if (!ctx.session) return ctx.fail("platform.unauthorized");
        return {
          documents: Object.values(deps.documents ?? {}).map((d) => ({
            id: d.id, kind: d.kind, title: d.title, version: d.version,
            url: d.url ?? null, mustAccept: d.mustAccept, binds: d.binds,
          })),
          owed: deps.owed ? await deps.owed(ctx) : [],
        };
      },
    },

    /*
      ⚠️ ACCEPTING IS OF A VERSION, AND THE VERSION IS SENT BACK. A press meaning
      "whatever is current" would record an agreement to text the person may
      never have seen — the screen showed one wording and the server stored
      another, which is exactly the confusion the version exists to prevent.
    */
    "me.accept": {
      kind: "write", needs: "session", beforeAccepting: true,
      async run(ctx, input): Promise<unknown> {
        if (!ctx.session) return ctx.fail("platform.unauthorized");
        const id = String(input.document ?? "");
        const version = String(input.version ?? "");
        const def = (deps.documents ?? {})[id];
        if (!def) return ctx.fail("platform.not_found");
        if (def.version !== version) {
          return ctx.fail("platform.invalid", {}, {
            fields: { version: "this changed since it was shown to you — read it again" },
          });
        }
        if (!deps.accept) return ctx.fail('platform.unavailable');
        const refused = await deps.accept(ctx, id, version);
        if (refused === "needs_a_workspace") {
          return ctx.fail("platform.not_found");
        }
        if (refused === "not_yours_to_give") {
          /* ⚠️ A permission, and it is the right shape: whoever runs the
             workspace can give this and they cannot. Recording it anyway would
             put a guest's name on a business's agreement. */
          return ctx.fail("platform.forbidden");
        }
        return { document: id, version };
      },
    },

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
      kind: "write", needs: "session", beforeAccepting: true,
      async run(ctx): Promise<unknown> {
        if (ctx.session) await endSession(ctx.directory, ctx.session.id, ctx.now);
        ctx.issue(null);
        return { signedOut: true };
      },
    },


    /**
     * EVERY SESSION, EVERYWHERE.
     *
     * ⚠️ THIS IS THE REASON A SESSION IS A ROW RATHER THAN A SIGNED CLAIM, and
     * for as long as no operation ended them all, that reason was a design note
     * paying no rent. A signed token cannot be withdrawn before it expires, so a
     * laptop somebody lost stays signed in — and "sign out everywhere" is the one
     * thing a person reaches for when they know it has happened.
     *
     * ⚠️ IT ENDS THIS ONE TOO, AND SAYING SO IS THE DESIGN. A control that signs
     * out every device except the one pressing it has to explain itself, and the
     * explanation is always worse than the sentence "you will be signed out
     * here as well".
     *
     * ⚠️ AND IT IS REACHABLE BEFORE THE TERMS, like the rest of leaving. Somebody
     * who has just realised a device is compromised must not meet an agreement
     * wall first.
     */
    "me.signout.everywhere": {
      kind: "write", needs: "session", beforeAccepting: true,
      async run(ctx): Promise<unknown> {
        await endEverySession(ctx.directory, ctx.session!.accountId, ctx.now);
        ctx.issue(null);
        return { signedOut: true };
      },
    },

    /* ------------------------------------------------------- proving again --- */

    /*
      ⚠️ THE PROOF GATE HAD NO WAY TO SATISFY IT ONCE THE WINDOW CLOSED. `proof:
      "recent"` is fifteen minutes from the SIGN-IN, so an operation behind it —
      erasing your account — was reachable for a quarter of an hour after signing
      in and refused for ever after, with the refusal telling somebody to do
      something they had no control that could do.

      ⚠️ AND IT IS A STAMP ON THIS SESSION, NEVER A SECOND ONE. The threat is a
      borrowed laptop with an open tab, so what has to be recent is the
      CONFIRMATION rather than the sign-in — a new session would answer a
      different question and leave the old one open.
    */
    "me.prove.code": {
      kind: "write", needs: "session",
      async run(ctx): Promise<unknown> {
        /* ⚠️ THE CALLER'S OWN ADDRESS, NEVER ONE IN THE BODY. Taking an address
           here would let somebody with a stolen cookie prove themselves at an
           inbox they own — which is the whole of what this gate is against. */
        const email = ctx.email;
        if (!email) return ctx.fail("platform.unauthorized");

        const issued = await issueCode(ctx.directory, email, deps.secret, ctx.now);
        if (issued === "too_soon") return ctx.fail("platform.too_many", { retryAfter: 60 });
        try {
          await deps.deliver(email, issued.code);
        } catch {
          await forgetCode(ctx.directory, issued.id);
          return ctx.fail("platform.unavailable");
        }
        return { sent: true };
      },
    },

    "me.prove": {
      kind: "write", needs: "session",
      async run(ctx, input): Promise<unknown> {
        const email = ctx.email;
        if (!email) return ctx.fail("platform.unauthorized");
        const wrong = await spendCode(
          ctx.directory, email, String(input.code ?? "").trim(), deps.secret, ctx.now);
        if (wrong) return ctx.fail("platform.unauthorized");

        await noteProof(ctx.directory, ctx.session!.id, ctx.now);
        /*
          ⚠️ THE COOKIE IS NOT REISSUED AND THE SESSION IS NOT REPLACED. What
          moved is a column on the row the gate already reads per request, so the
          very next call is inside the window — and every OTHER device of theirs
          is untouched, which is what makes this a confirmation rather than a
          sign-in.
        */
        return { provenAt: ctx.now.toISOString() };
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
      kind: "read", needs: "session", beforeAccepting: true,
      async run(ctx): Promise<unknown> {
        const accountId = ctx.session!.accountId;
        const tenants = await tenantsOf(ctx.directory, accountId);
        const belongs = await Promise.all(tenants.map(async (t) => {
          /* ⚠️ WHAT IS ON, NOT WHAT WAS EVER ON. This is a person's own list of
             where they can go; a product switched off keeps its records and its
             tables (see `Enablement`) and must not appear as somewhere to go. */
          const apps = await liveAppsOfTenant(ctx.directory, t.id);
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
          /*
            ⚠️ WHAT THEY STILL OWE AN AGREEMENT TO, CARRIED BY THE ONE READ EVERY
            DOOR MAKES BEFORE IT DRAWS ANYTHING. The wall has to be known before
            the page is chosen: asked afterwards, somebody sees the product for
            a moment and then loses it, and every write behind it refuses with a
            status the screen has no reason to expect.
          */
          owed: deps.owed ? await deps.owed(ctx) : [],
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

        /*
          ⚠️ `paid: false` HERE IS NOT A GAP, IT IS THE ALLOWANCE LANE. This
          route spends what an operator granted; the OTHER way in is buying a
          commercial tier, which sets the kind from the signed event that says
          the money moved (`money.checkout` carries the legal name, the webhook
          calls `becomeCommercial` with `paid: true`). A route that could set
          `paid` itself would be a route that makes any workspace a business for
          nothing.
        */
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
      kind: "write", needs: "session", beforeAccepting: true,
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

    /* --------------------------------------------------- taking and going --- */

    /*
      ⚠️ EVERY PLACE THEY COULD BE, NOT THE PLACES SOMEBODY REMEMBERED. The walk
      is `dossierOf` over the directory and every shard holding a workspace they
      belong to, driven by a ledger a guard checks against the schema — so a
      table added next year is a red gate rather than a row quietly missing from
      an answer that says "everything we hold".

      ⚠️ AND IT IS OPEN BEFORE THEY HAVE AGREED TO ANYTHING. Holding the terms
      over somebody is fair; holding their data over them is not, and a wall
      nobody can leave through is a hostage.

      ⚠️ THE VAULT'S CIPHERTEXT IS IN THE COPY AND IS NOT THE ANSWER. Handing
      somebody the encrypted bytes of their own health record satisfies a walk
      and not a person — `vault.export` decrypts, at the workspace that holds it.
    */
    "me.export": {
      kind: "read", needs: "session", beforeAccepting: true,
      async run(ctx): Promise<unknown> {
        return dossierOf(await everywhere(ctx), ctx.session!.accountId, ctx.email, ctx.now);
      },
    },

    /*
      ⚠️ AND THE SAME WALK DELETES. Two lists is how an export and an erasure
      come to disagree about what is held — one says a table exists and the other
      never touches it, and both report success.

      ⚠️ IT ASKS FOR PROOF, because destroying somebody's records cannot be
      undone and must not be doable from a borrowed laptop with an open tab.

      ⚠️ A WORKSPACE ONLY THEY CAN RUN GOES WITH THEM. Leaving it behind makes it
      unreachable rather than closed — nobody left who can invite anybody in, the
      bill still running — and refusing over it would be a deletion request with
      no way to satisfy it. One they merely belong to is untouched: a colleague
      leaving is not a business closing.
    */
    "me.forget": {
      kind: "write", needs: "session", proof: "recent", beforeAccepting: true,
      async run(ctx): Promise<unknown> {
        const me = ctx.session!.accountId;
        const places = await everywhere(ctx);

        const closed: string[] = [];
        const gone = [];
        for (const tenant of await tenantsOf(ctx.directory, me)) {
          const db = ctx.shardOf(tenant);
          if (!wouldStrand(await membersOf(db, tenant.id), me)) continue;
          /* ⚠️ THE OBJECTS BEFORE THE ROWS — the row is the only thing that
             knows an object's key, so doing this afterwards leaves every file
             in the bucket for ever, after a workspace was reported erased. */
          await eraseObjects(db, ctx.bucketOf?.({ tenantId: tenant.id, residency: tenant.residency }) ?? null, { tenantId: tenant.id });
          for (const appId of await appsOfTenant(ctx.directory, tenant.id)) {
            const app = ctx.app(appId);
            if (app) await erase(db, app.collections, "tenant", tenant.id);
          }
          /* ⚠️ REPORTED IN THE SAME LIST AS THE REST. The workspace's erasure
             takes most of this person's rows with it — their roster line, their
             notifications, their vault — so a report of only the second walk
             says "account, session" over a deletion that emptied six tables,
             which reads exactly like a walk that missed them. */
          gone.push(...await forgetWorkspace(
            [{ db, of: tenant.shardId, apps: [] }, { db: ctx.directory, of: "directory", apps: [] }],
            tenant.id));
          await closeTenant(ctx.directory, tenant.id, ctx.now);
          closed.push(tenant.slug);
        }

        /* ⚠️ AND THEIR OWN FILES IN THE WORKSPACES THEY ARE MERELY LEAVING. A
           workspace that survives their departure keeps its own records; the
           files that were THEIRS go with them, and only the ledger's
           `subject_id` can tell the two apart. */
        for (const tenant of await tenantsOf(ctx.directory, me)) {
          await eraseObjects(ctx.shardOf(tenant), ctx.bucketOf?.({ tenantId: tenant.id, residency: tenant.residency }) ?? null, { subjectId: me });
        }

        gone.push(...await forgetPerson(places, me, ctx.email, ctx.now));
        /* ⚠️ The session is ended last: it is what the walk above needed to know
           who was asking, and it is deleted by the walk itself. */
        ctx.issue(null);
        return {
          closed,
          deleted: gone.filter((g) => g.rows > 0),
          /* ⚠️ WHAT WAS LOOKED IN AND FOUND EMPTY IS PART OF THE ANSWER. A
             report of only what was deleted cannot be told apart from one whose
             walk skipped half the deployment. */
          lookedIn: gone.length,
        };
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

    /* --------------------------------------------------------------- push --- */

    /*
      ⚠️ THE PERSONAL LANE, AND ON EVERY DOOR THAT IS A PLACE. A push
      subscription belongs to the ORIGIN it was made at — a service worker cannot
      belong to two — so this has to be answerable wherever somebody is standing
      when they turn notifications on, which is usually the workspace they use
      rather than the account centre. It is the same screen either way: OneSpace
      is reserved on every door.

      ⚠️ AND IT IS PERSONAL RATHER THAN A WORKSPACE OPERATION, because a device is
      the account's. Filed per workspace it would be a permission somebody could
      lose, which would then unsubscribe their phone.
    */

    /**
     * ⚠️ WHAT THE BROWSER NEEDS BEFORE IT CAN ASK. `applicationServerKey` is the
     * deployment's VAPID public key, and a subscription made with the wrong one
     * is undeliverable for ever — so it comes from the server rather than from a
     * constant compiled into the page.
     *
     * ⚠️ `null` IS THE HONEST ANSWER ON A DEPLOYMENT WITH NO KEYPAIR, and the
     * screen turns it into an absent control rather than a switch that fails.
     */
    "me.push.key": {
      kind: "read", needs: "session", doors: ["account", "tenant", "setup"],
      async run(ctx): Promise<unknown> {
        return { key: (await vapidOf(ctx.directory))?.publicKey ?? null };
      },
    },

    "me.push.subscribe": {
      kind: "write", needs: "session", doors: ["account", "tenant", "setup"],
      async run(ctx, input): Promise<unknown> {
        /* ⚠️ REFUSED BEFORE THE ROW, on a deployment that cannot send. A stored
           subscription against no keypair is a device that reports itself as
           subscribed and is never reachable. */
        if (!await vapidOf(ctx.directory)) return ctx.fail("platform.unavailable");

        const done = await subscribeDevice(ctx.directory, ctx.session!.accountId,
          await tenantAtDoor(ctx), {
            endpoint: String(input.endpoint ?? ""),
            p256dh: String(input.p256dh ?? ""),
            auth: String(input.auth ?? ""),
          }, ctx.now);
        if (done === "incomplete") return ctx.fail("platform.invalid");
        return done;
      },
    },

    /**
     * ⚠️ BY ENDPOINT AND SCOPED TO THE CALLER, so turning notifications off on
     * this laptop cannot turn them off on somebody else's phone. The browser
     * hands its own endpoint back from `getSubscription`, so nothing here has to
     * be remembered by the screen.
     */
    "me.push.forget": {
      kind: "write", needs: "session", doors: ["account", "tenant", "setup"],
      async run(ctx, input): Promise<unknown> {
        const endpoint = String(input.endpoint ?? "");
        if (!endpoint) return ctx.fail("platform.invalid");
        await unsubscribeDevice(ctx.directory, ctx.session!.accountId, endpoint);
        return { endpoint };
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
