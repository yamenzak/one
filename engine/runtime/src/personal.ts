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
 * the two that create one and the one that reads the deployment's published
 * documents. None of the three grants anything: one sends a code to an address,
 * one exchanges a code for a session as whoever owns that address, and one
 * answers with text the worker already serves to anybody at `/legal/<id>`.
 * Nothing in this lane takes an account id from a caller.
 *
 * ⚠️ LEAVING IS ALWAYS ALLOWED. This lane is deliberately outside the standing
 * gate: a workspace in arrears must not be a trap, and paying has to be a way
 * out rather than the only one.
 */

import type {
  AccountId, AppId, AppSpec, DocumentBook, Door, PlanSpec, TenantId,
} from "@engine/kernel";
import {
  foundingAppRole, giftIsLive, legalUrlOf, newId, permissionsFor, residencyFor, slugOk,
  slugTaken, wouldStrand,
} from "@engine/kernel";
import {
  accountName, appsOfTenant, becomeCommercial, closeTenant, createTenant, forgetInvitation,
  invitationsFor,
  accountFace, giftsFor,
  liveAppsOfTenant, noteBelonging, presentationFrom, presentationOf, setAccountName, setPresentation,
  tenantBySlug, tenantsOf,
  upsertAccount, type TenantRow,
} from "./directory.js";
import { subscribeDevice, unsubscribeDevice, vapidOf } from "./push.js";
import { dossierOf, forgetPerson, forgetWorkspace, type Place } from "./dossier.js";
import { erase } from "./records.js";
import {
  askForExport, endEverySession, endSession, exportAllowedAt, forgetCode, forgetExport,
  issueCode, mintToken, noteProof, readSession,
  revokeToken, spendCode, spendExport, startSession, tokensOf, type Session,
} from "./identity.js";
import { claimInvitations, found, memberFor, membersOf } from "./membership.js";
import { applyGifts } from "./gifts.js";
import { inboxOf, markSeen, unseenCount } from "./inbox.js";
import { acceptancesOf } from "./legal.js";
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
  /**
   * ⚠️ `nobody` IS FOR WHAT SOMEBODY DOES BEFORE THEY ARE ANYBODY HERE — the two
   * operations that create a session, and reading the documents they are about
   * to be asked to agree to. Nothing on this setting takes an account id from a
   * caller, and nothing on it answers with anything belonging to a person.
   */
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

/**
 * WHAT SOMEBODY HAS SIGNED, WITH THE WORKSPACE NAMED.
 *
 * ⚠️ THE NAME, NOT THE ID. A row reading `t_01J…` is a record somebody cannot
 * check, which defeats the only reason to show them the list — and a workspace
 * they have since LEFT still has a row here, because the agreement happened.
 * A missing name means the workspace is gone; the row stays and says so.
 */
const signedBy = async (ctx: PersonalCtx, accountId: string) => {
  const signed = await acceptancesOf(ctx.directory, accountId as AccountId);
  if (!signed.length) return [];
  const named = new Map(
    (await tenantsOf(ctx.directory, accountId as AccountId)).map((t) => [t.id as string, t.name]));
  return signed.map((one) => ({
    document: one.document, version: one.version, at: one.at,
    tenantId: one.tenantId, appId: one.appId,
    where: one.tenantId ? named.get(one.tenantId) ?? null : null,
  }));
};

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
  /**
   * ⚠️ AND THE LETTER THAT CARRIES A COPY'S LINK, WHICH IS A DIFFERENT LETTER.
   * A sign-in code is six digits in the body; this is an address somebody
   * follows, on a deployment that may not be the one they are reading the mail
   * on. Folding it into `deliver` would mean one function whose second argument
   * is sometimes a code and sometimes a URL, and one caller getting that wrong
   * is a person mailed their own export token as though it were a sign-in code.
   *
   * ⚠️ REQUIRED, LIKE `deliver`. Optional, a deployment that forgot it would
   * take the ask, hold the weekly cap and send nothing — the shape where the
   * screen says "check your email" over a letter that was never written.
   *
   * ⚠️ IT TAKES THE TOKEN AND THE DEPLOYMENT BUILDS THE ADDRESS, because a
   * `Door` carries no host on the account side — and the deployment is the one
   * thing that knows its own roots. An operation guessing an origin is how a
   * letter comes to link somewhere nobody is served.
   */
  readonly deliverExport: (to: string, token: string) => Promise<void>;
  /**
   * WHICH PRODUCTS THIS DEPLOYMENT OFFERS AT FOUNDING, IN THE ORDER TO SHOW THEM.
   *
   * ⚠️ THIS WAS ONE HARDCODED ID, AND EVERY WORKSPACE EVER MADE GOT IT. A person
   * who wanted one product founded a workspace holding a different one, with no
   * screen anywhere able to change it — only an operator could, through the
   * console, on request. A deployment that serves several products and can only
   * hand out the first is not multi-product; it is one product with the others
   * built.
   *
   * ⚠️ IT IS A LIST RATHER THAN THE WHOLE REGISTRY, because "what this
   * deployment SERVES" and "what somebody may start with" are different
   * questions. A product still being built is mounted, reachable and answering
   * for the workspaces an operator put it in, and it has no business on a
   * stranger's first screen.
   */
  readonly sells: () => readonly string[];
  /**
   * ⚠️ WHETHER THIS ADDRESS RUNS THE DEPLOYMENT (D18), injected for the same
   * reason the console injects it: an operator is outside every workspace, so
   * no role and no roster can answer. Absent means this deployment has no
   * operator surface, which answers `false` for everybody.
   */
  readonly isOperator?: (email: string | null) => boolean;
  readonly plans?: () => readonly PlanSpec[];
  /**
   * ⚠️ WHAT A WORKSPACE IS ON, AND WHETHER ANYBODY IS PAYING FOR IT. Injected
   * for the reason the money reads all are: the subscription table belongs to a
   * module a deployment may not have applied, and reading it from `me.who` —
   * the one call every door makes before it draws anything — made a deployment
   * without it answer `no such table` to everybody.
   *
   * ⚠️ AND IT CARRIES THE GIFT, NOT ONLY THE TIER. A workspace on Max beside one
   * paying for Max is two rows a person cannot tell apart, and only one of them
   * has a card that can decline and a term that can end.
   */
  /**
   * ⚠️ WHAT A WORKSPACE IS ON, AND WHETHER ANYBODY IS PAYING FOR IT. Injected
   * rather than read, because the subscription table belongs to a module a
   * deployment may not have applied — reading it from `me.who`, the one call
   * every door makes before it draws anything, made a deployment without it
   * answer `no such table` to everybody.
   */
  readonly membership?: (directory: Db, tenantId: TenantId) => Promise<{
    readonly planId: string | null;
    readonly given: { readonly at: string; readonly until: string | null } | null;
    /**
     * ⚠️ WHETHER IT NEEDS SOMEBODY, AND IT REPLACED A WALK THAT COULD NOT ANSWER.
     * This was `needsAttention(directory, tenantId, appId)`, called once per
     * PRODUCT — and the plan moved to the workspace, where the row is filed
     * under no app. So `subscriptionFor(db, id, "hello")` matched nothing on
     * every deployment, the answer was always `false`, and the "Needs attention"
     * chip could not appear for a workspace whose card had been declined.
     *
     * ⚠️ ONE MEMBERSHIP, SO ONE ASK. It is also cheaper than what it replaces:
     * one read per workspace rather than one per product in it.
     */
    readonly attention: boolean;
  } | null>;
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
        const accountId = ctx.session.accountId;
        return {
          /*
            ⚠️ THE BOOK, WITHOUT THE WORDS — `legal.list` carries those, publicly,
            and it is the only thing that does. Two carriers of one wording is
            two renderings that agree until somebody edits one, which is the
            fault this whole area is a catalogue of. What this read is FOR is
            what is still owed by whoever is asking, which needs a session.
          */
          documents: Object.values(deps.documents ?? {}).map((d) => ({
            id: d.id, kind: d.kind, title: d.title, version: d.version,
            url: legalUrlOf(d), mustAccept: d.mustAccept, binds: d.binds,
          })),
          owed: deps.owed ? await deps.owed(ctx) : [],
          /*
            ⚠️ AND WHAT THEY ALREADY AGREED TO, WHICH IS THE HALF THIS READ DID
            NOT HAVE. Owed answers "is there a wall in front of me"; a person
            asking what they signed, to what version and when, had nowhere to
            look — and that is the question the record exists to answer. It is
            kept per VERSION, so a document accepted twice is two rows and the
            history is the point rather than a duplicate.

            ⚠️ NO FAN-OUT: acceptances are in the DIRECTORY, keyed by account,
            because one person accepts the terms once for the whole deployment
            (`platform-schema.ts`). The workspace NAME is resolved from the same
            database, so a business agreement says which business.
          */
          accepted: await signedBy(ctx, accountId),
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

    /*
      ⚠️ THE DOCUMENTS THEMSELVES, TO ANYBODY, WITH NO SESSION AT ALL. Deciding
      whether to agree is what somebody does BEFORE they are anybody here — so
      the sign-in door has to be able to show the terms without sending the
      person away from it, and it has nobody to ask as.

      ⚠️ IT IS NOT A NEW EXPOSURE. These are the same bytes the worker already
      serves unauthenticated at `/legal/<id>`; what this adds is a shape a sheet
      can render, so reading them is not a full page load away from whatever the
      person was doing. That page stays: it is the address the documents are
      published at, and a link somebody can send.

      ⚠️ AND IT IS THE ONE CARRIER OF THE WORDS. `me.agreements` says what is
      still OWED, which needs a session; this says what the documents SAY, which
      does not. Two reads carrying one wording is two renderings that agree until
      somebody edits one.
    */
    "legal.list": {
      kind: "read", needs: "nobody", beforeAccepting: true,
      async run(): Promise<unknown> {
        return {
          documents: Object.values(deps.documents ?? {}).map((d) => ({
            id: d.id, kind: d.kind, title: d.title, version: d.version,
            url: legalUrlOf(d), text: d.text ?? null,
            mustAccept: d.mustAccept, binds: d.binds,
          })),
        };
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
        } catch (why) {
          await forgetCode(ctx.directory, issued.id);
          /*
            ⚠️ THE ONE THING THAT KNEW WHY WAS BEING DISCARDED. A bare `catch {}`
            here turns "this deployment has no sender configured" into a generic
            apology with nothing anywhere saying more — and the person who could
            fix it in a minute has no way to learn what it was. It cannot be told
            to the CALLER, who is anonymous at a sign-in form and must not be
            handed the deployment's configuration state; so it goes to the log,
            under a reference the copy already promises.

            ⚠️ AND THE REFERENCE IS WHY `{ref}` WAS A LITERAL BRACE ON SCREEN.
            `platform.unavailable` reads "Quote {ref} if you tell us about it",
            and nothing minted one — so the refusal asked somebody to quote a
            token that had never been substituted. A promise in the copy is a
            parameter at the call site.
          */
          const ref = newId("err", ctx.now);
          console.error(`[me.code] ${ref} could not deliver:`, why);
          return ctx.fail("platform.unavailable", {}, { ref });
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
        } catch (why) {
          await forgetCode(ctx.directory, issued.id);
          /*
            ⚠️ THE ONE THING THAT KNEW WHY WAS BEING DISCARDED. A bare `catch {}`
            here turns "this deployment has no sender configured" into a generic
            apology with nothing anywhere saying more — and the person who could
            fix it in a minute has no way to learn what it was. It cannot be told
            to the CALLER, who is anonymous at a sign-in form and must not be
            handed the deployment's configuration state; so it goes to the log,
            under a reference the copy already promises.

            ⚠️ AND THE REFERENCE IS WHY `{ref}` WAS A LITERAL BRACE ON SCREEN.
            `platform.unavailable` reads "Quote {ref} if you tell us about it",
            and nothing minted one — so the refusal asked somebody to quote a
            token that had never been substituted. A promise in the copy is a
            parameter at the call site.
          */
          const ref = newId("err", ctx.now);
          console.error(`[me.prove.code] ${ref} could not deliver:`, why);
          return ctx.fail("platform.unavailable", {}, { ref });
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
        /*
          ⚠️ THE ACCOUNT'S OWN FACTS AND ITS WORKSPACES ARE TWO QUESTIONS, NOT
          TWO STEPS. Neither answer feeds the other, and this is the read the
          product makes before it can draw anything — so awaiting them in turn
          put a whole round trip between opening the app and knowing what to
          show. See `accountFace` for the two reads that used to be under it.
        */
        /*
          ⚠️ AND WHAT IS WAITING FOR THEM, ON THE READ EVERY DOOR ALREADY MAKES.
          A gift is made to an address before the person signs in, so the first
          thing they should see is that it is there — asked separately it would
          arrive after the screen, and the one moment it is worth saying is the
          moment they land with nothing.
        */
        const [face, tenants, gifts] = await Promise.all([
          accountFace(ctx.directory, accountId),
          tenantsOf(ctx.directory, accountId),
          giftsFor(ctx.directory, ctx.email ?? ""),
        ]);
        const belongs = await Promise.all(tenants.map(async (t) => {
          /* ⚠️ WHAT IS ON, NOT WHAT WAS EVER ON. This is a person's own list of
             where they can go; a product switched off keeps its records and its
             tables (see `Enablement`) and must not appear as somewhere to go. */
          const apps = await liveAppsOfTenant(ctx.directory, t.id);
          /* ⚠️ TOGETHER, BECAUSE THEY ARE THE SAME SHARD AND NEITHER FEEDS THE
             OTHER. Awaited one after the other this walk would cost two round
             trips per workspace on the read every door makes at boot; run
             concurrently it costs one query's latency however many there are. */
          const [member, unseen, sub] = await Promise.all([
            memberFor(ctx.shardOf(t), t.id, accountId),
            unseenCount(ctx.shardOf(t), t.id, accountId),
            /* ⚠️ AND WHAT IT IS ON, ASKED RATHER THAN READ. The subscription
               table belongs to a module a deployment may not have applied, and
               reading it from here made `me.who` throw `no such table` on one
               that had not — on the call every door makes before it can draw
               anything. */
            deps.membership
              ? deps.membership(ctx.directory, t.id)
              : Promise.resolve(null),
          ]);
          return {
            slug: t.slug, name: t.name,
            /* ⚠️ WHAT IT IS TRAVELS WITH THE LIST, because every screen that
               draws a workspace has to know: a business wears its own tile, has
               a brand to edit, and offers nothing about becoming one. Asked per
               workspace after the fact would be one round trip per row on the
               screen somebody lands on. */
            kind: t.kind,
            legalName: t.legalName,
            /* ⚠️ THE TIER AND WHETHER IT WAS GIVEN. `plan` alone would put a
               workspace on Max beside one paying for Max with nothing telling
               them apart — and only one of the two has a card that can decline
               and a term that can end. */
            plan: sub?.planId ?? null,
            given: sub?.given ?? null,
            platformRole: member?.platformRole ?? null,
            appRoles: member?.appRoles ?? {},
            apps,
            /* ⚠️ Only where it is worth saying. A badge on every row is texture;
               one on the workspace that stopped paying is why somebody looked. */
            attention: sub?.attention ?? false,
            /* ⚠️ CARRIED BY THE READ EVERY DOOR ALREADY MAKES. A bell with no
               number is a bell somebody has to open to learn anything from, and
               the count is the one fact that decides whether they do. Fetched
               separately it would be a second walk over the same shards. */
            unseen,
          };
        }));
        return {
          accountId, email: ctx.email,
          /* ⚠️ WHAT THEY ARE CALLED, WHICH IS OPTIONAL AND WAS UNREADABLE. The
             column existed, `upsertAccount` wrote `null` into it, and nothing
             answered it — so the account centre introduced somebody to
             themselves by their email address. */
          name: face.name,
          /* ⚠️ An account fact, not a workspace one — an operator stands
             outside every workspace, so no roster could answer it. */
          operator: deps.isOperator?.(ctx.email) === true,
          /*
            ⚠️ CARRIED BY THE READ EVERY DOOR ALREADY MAKES, because the first
            paint has dates on it. Fetched separately it would arrive after the
            screen, and every timestamp in the product would be drawn once in
            the browser's convention and then rewritten in theirs — a flicker on
            every list, on every load, for everybody who set a preference.
          */
          presentation: face.presentation,
          tenants: belongs,
          /*
            ⚠️ WHAT IS WAITING, NOT WHAT WAS EVER GIVEN. A gift spent last month
            is a fact for the console; what the person needs is the one still
            live, and only while it is — a row saying "a workspace at Max is
            waiting" over a workspace they already made on it is the interface
            asking them to do something twice.

            ⚠️ AND `by` AND `why` DO NOT TRAVEL. Which operator decided and what
            they typed into the reason are ours; what the person is owed is what
            they have. The console reads the whole row.
          */
          waiting: gifts
            .filter((g) => giftIsLive(g, ctx.now.toISOString()))
            .map((g) => ({
              id: g.id, kind: g.kind, planId: g.planId, credits: g.credits,
              left: g.workspaces - g.spent, until: g.until,
            })),
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

    /**
     * WHAT THIS DEPLOYMENT SELLS, FOR THE SCREEN THAT ASKS SOMEBODY TO CHOOSE.
     *
     * ⚠️ THE MANIFEST'S OWN WORDS, NEVER A SECOND LIST. A catalogue written
     * beside the wizard is a catalogue that is right on the day it is written
     * and describes a retired product a year later — and the one thing it would
     * be describing is what somebody is about to commit a workspace to.
     *
     * ⚠️ AND IT IS `session` RATHER THAN `nobody`, because it is only ever read
     * by somebody who is already signing up. A public list of products is a
     * thing to publish deliberately, on a page written for it, not a side effect
     * of a wizard's data needs.
     */
    "me.products": {
      kind: "read", needs: "session", beforeAccepting: true,
      doors: ["setup", "account"],
      async run(ctx): Promise<unknown> {
        return {
          items: deps.sells()
            .map((id) => ctx.app(id))
            .filter((a): a is NonNullable<typeof a> => !!a)
            .map((a) => ({ id: a.id, name: a.name, mark: a.mark })),
        };
      },
    },

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

        /*
          ⚠️ WHAT THEY ASKED FOR, NARROWED TO WHAT IS ON OFFER — never the other
          way round. Taking the ids from the body and trusting them would let
          anybody found a workspace holding a product this deployment does not
          sell, which is an app id in a table with no manifest behind it and a
          workspace whose every screen 404s.

          ⚠️ AND THE ORDER IS THE CATALOGUE'S, so two people who ticked the same
          boxes get the same workspace. A list built from the request is a list
          somebody can reorder, and the first product decides the landing screen.
        */
        const offered = deps.sells();
        const asked = new Set(
          Array.isArray(input.apps) ? input.apps.map((a) => String(a)) : [],
        );
        const chosen = offered.filter((id) => asked.has(id));

        /* ⚠️ AT LEAST ONE, AND SAID AS A FIELD. A workspace with no product is a
           name, an address and nothing to open — reachable, payable, and empty
           for ever, because the screen that would add one is inside it. */
        if (!chosen.length) {
          return ctx.fail("platform.invalid", {}, { fields: { apps: "Choose at least one" } });
        }

        /* ⚠️ Workspace authority is the PLATFORM'S to give — `found` makes the
           creator an `owner` regardless of any app. What the app declares is
           the role they hold INSIDE it (D15). */
        const roles: Record<string, string> = {};
        for (const id of chosen) {
          const app = ctx.app(id);
          if (!app) return ctx.fail("platform.unavailable");
          const role = foundingAppRole(app.access);
          if (!role) return ctx.fail("platform.unavailable");
          roles[id] = role;
        }

        const made = await createTenant(ctx.directory, {
          slug, name, country, where: residencyFor(country), apps: chosen as never,
        }, ctx.now);
        if (made === "slug_taken") return ctx.fail("platform.conflict");
        if (made === "nowhere_to_put_it") return ctx.fail("platform.unavailable");

        const accountId = ctx.session!.accountId;
        await found(ctx.shardOf(made.tenant), made.tenant.id, accountId,
          ctx.email ?? "", roles, ctx.now);
        await noteBelonging(ctx.directory, accountId, made.tenant.id, ctx.now);
        /*
          ⚠️ AND ANYTHING WAITING FOR THIS ADDRESS LANDS NOW. An operator gives a
          gift days before the person signs in; the workspace they then make is
          the one it was for, and a plan that arrived on tomorrow's sweep would
          be reported as broken on the day it was received.

          ⚠️ IT IS THE ORDINARY CASE THAT NOTHING IS WAITING, so this answers an
          empty list rather than refusing. See `applyGifts`.
        */
        const given = await applyGifts(
          ctx.directory, made.tenant.id, ctx.email ?? "", deps.plans?.() ?? [], ctx.now);
        return { slug: made.tenant.slug, id: made.tenant.id, given };
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
        /* ⚠️ THE SECOND PLACE A GIFT LANDS, AND IT IS THE SAME FUNCTION. A gift
           of a COMMERCIAL plan cannot be applied at founding — the workspace is
           personal until this moment, and a commercial plan on a personal
           workspace is a tier the kind gates refuse. So it is applied the
           instant the workspace becomes what the gift was for. */
        const given = await applyGifts(
          ctx.directory, tenant.id, ctx.email ?? "", deps.plans?.() ?? [], ctx.now);
        return { slug: done.slug, kind: done.kind, legalName: done.legalName, given };
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
    /*
      ⚠️ THE COPY IS ASKED FOR AND ARRIVES BY POST, WHICH IT DID NOT. The screen
      used to fetch the dossier and save it from the browser, so the most
      complete object this deployment can produce about one person came out of an
      open tab with nothing but a session behind it. Sending a link to the
      registered address moves the proof from "somebody is signed in here" to
      "somebody holds that mailbox" — the same proof signing in required in the
      first place.

      ⚠️ AND THE LETTER CARRIES A LINK, NEVER THE DATA. Mail is unencrypted at
      rest in a mailbox and in transit between two servers we do not own;
      attaching somebody's whole record to one would be a disclosure by design,
      and `buildMime` cannot attach anything anyway.

      ⚠️ THE REFUSAL SAYS WHEN, NOT NO — see `EXPORT_EVERY_MS` for why there is a
      cap at all. "You asked recently" with no date is a person pressing again
      tomorrow to find out.
    */
    "me.export.ask": {
      kind: "write", needs: "session", beforeAccepting: true,
      async run(ctx): Promise<unknown> {
        const to = ctx.email;
        /* ⚠️ THE REGISTERED ADDRESS, NEVER ONE FROM THE BODY. Taking a
           destination from the caller would make this endpoint a way to have
           somebody else's records posted anywhere. */
        if (!to) return ctx.fail("platform.unauthorized");

        const asked = await askForExport(ctx.directory, ctx.session!.accountId, ctx.now);
        if ("nextAt" in asked) return ctx.fail("platform.too_many", { retryAfter: asked.nextAt });

        /* ⚠️ A SEND THAT FAILED MUST NOT HOLD THE WEEK — the same rule the
           sign-in code follows one screen up, and the same fix: the row is
           written before the send is attempted, so it is withdrawn when the
           send throws or the person waits seven days for a letter nobody
           wrote. */
        try {
          await deps.deliverExport(to, asked.id);
        } catch (why) {
          await forgetExport(ctx.directory, asked.id);
          const ref = newId("err", ctx.now);
          console.error(`[me.export.ask] ${ref} could not deliver:`, why);
          return ctx.fail("platform.unavailable", { ref }, { ref });
        }
        return { sentTo: to, expiresAt: asked.expiresAt };
      },
    },

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

      ⚠️ AND IT NOW TAKES A TOKEN, WHICH IS THE HALF THAT CAME BY POST. A session
      alone is no longer enough: the walk runs when somebody holds both, and the
      token is spent in the same statement that checks it (see `spendExport`), so
      two tabs racing cannot both collect.
    */
    "me.export": {
      kind: "write", needs: "session", beforeAccepting: true,
      async run(ctx, input): Promise<unknown> {
        const token = String(input.take ?? "");
        /* ⚠️ ONE REFUSAL FOR MISSING, WRONG, SPENT, EXPIRED AND SOMEBODY
           ELSE'S. Distinguishing them here tells whoever is holding a token
           they should not have which of those it is. */
        if (!token || !await spendExport(ctx.directory, token, ctx.session!.accountId, ctx.now)) {
          return ctx.fail("platform.not_found");
        }
        return dossierOf(await everywhere(ctx), ctx.session!.accountId, ctx.email, ctx.now);
      },
    },

    /* ⚠️ WHETHER THE BUTTON MAY BE PRESSED, SO THE SCREEN CAN SAY SO BEFORE IT IS.
       A cap discovered only by pressing is a refusal where an explanation
       belongs. */
    "me.export.when": {
      kind: "read", needs: "session", beforeAccepting: true,
      async run(ctx): Promise<unknown> {
        return { nextAt: await exportAllowedAt(ctx.directory, ctx.session!.accountId, ctx.now) };
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
    /* -------------------------------------------------- how you read it --- */

    /**
     * ⚠️ ONE WRITE FOR THE WHOLE OBJECT, NOT A FIELD AT A TIME. The six choices
     * are read together on every render — a locale is composed from the language
     * AND the region — so saving them one at a time would leave the account in
     * combinations nobody chose for the length of a round trip each.
     *
     * ⚠️ AND IT IS `account`-DOORED LIKE THE REST OF `me.*`, ON PURPOSE: this
     * follows the person, so there is no workspace whose door should own it.
     */
    /**
     * ⚠️ A NAME IS OFFERED, NEVER DEMANDED. Sign-in is an email and a code; this
     * exists so a roster, an invitation and a notification can say who somebody
     * is rather than printing their address at them. Sending nothing clears it,
     * which has to be as reachable as setting it.
     */
    "me.name": {
      kind: "write", needs: "session",
      async run(ctx, input): Promise<unknown> {
        const name = await setAccountName(
          ctx.directory, ctx.session!.accountId, String(input.name ?? ""));
        return { name };
      },
    },

    "me.presentation": {
      kind: "write", needs: "session",
      async run(ctx, input): Promise<unknown> {
        const want = presentationFrom(input.presentation);
        const no = await setPresentation(ctx.directory, ctx.session!.accountId, want);
        /* ⚠️ THE REFUSAL IS NAMED, because the three are three different fixes:
           a language tag, a country code and a zone are not interchangeable and
           "invalid" would send somebody to check all three. */
        if (no.length) return ctx.fail("platform.invalid", { field: no[0]! });
        return { presentation: want };
      },
    },

    /* --------------------------------------------------------------- told --- */

    /*
      ⚠️ EVERY WORKSPACE'S NOTES, IN ONE LIST, BECAUSE A NOTIFICATION IS
      ADDRESSED TO A PERSON. Email and push already go to one address and one
      device — account-wide by construction. The inbox channel was the only one
      filed per workspace, so somebody in four workspaces had four inboxes and
      nowhere that said "something needs you". That is not a missing screen, it
      is the three channels disagreeing about who the audience is.

      ⚠️ IT FANS OUT, AND THE BOUND IS THE PERSON. `me.who` above already reads
      every one of this account's shards for a role and a standing, and states
      why: bounded by how many workspaces one person is in — a handful, not a
      catalogue. This is the same walk with one more read on it, concurrently, so
      it costs one query's latency rather than N.

      ⚠️ AND IT IS NOT WHAT D5 FORBIDS. That rule is about a CROSS-TENANT
      question — the operator console, the dunning sweep, purge — which fans out
      over every shard on the deployment and gets slower with each one added.
      A person's own workspaces are a list the directory already holds and that
      does not grow with the deployment.

      ⚠️ EACH NOTE CARRIES WHERE IT CAME FROM, or the merged list is a column of
      sentences about work with no way to tell which workspace any of them is
      about — which is worse than four inboxes, not better.
    */
    "me.inbox": {
      kind: "read", needs: "session",
      async run(ctx): Promise<unknown> {
        const accountId = ctx.session!.accountId;
        const tenants = await tenantsOf(ctx.directory, accountId);
        const per = await Promise.all(tenants.map(async (t) => {
          const notes = await inboxOf(ctx.shardOf(t), t.id, accountId);
          return notes.map((note) => ({ ...note, slug: t.slug, from: t.name }));
        }));
        /* ⚠️ SORTED ACROSS WORKSPACES, NOT CONCATENATED. `at` is an `Instant`, so
           the comparison is lexicographic and correct — which is the whole reason
           nothing here is stored in a reader's own conventions. */
        const items = per.flat().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
        return {
          items: items.slice(0, 50),
          /* ⚠️ COUNTED OVER EVERYTHING, NOT OVER THE PAGE. A bell reading `50`
             on an account with two hundred unread is a number that stops moving
             when somebody reads one. */
          unseen: items.filter((n) => !n.seen).length,
        };
      },
    },

    /*
      ⚠️ THE WORKSPACE IS NAMED BY THE CALLER, BECAUSE THE ROW IS ON ITS SHARD.
      There is no "mark this one read" that does not know which database the one
      is in — and a mark-all with no slug is a walk over the same handful, which
      is the only shape that can clear a merged list from the screen showing it.
    */
    "me.seen": {
      kind: "write", needs: "session",
      async run(ctx, input): Promise<unknown> {
        const accountId = ctx.session!.accountId;
        const slug = input.slug === undefined || input.slug === null
          ? null : String(input.slug);
        const tenants = (await tenantsOf(ctx.directory, accountId))
          .filter((t) => slug === null || t.slug === slug);
        /* ⚠️ A SLUG THAT NAMES NOTHING THIS ACCOUNT IS IN IS A REFUSAL, not a
           quiet no-op: the caller is asserting a membership, and answering 200
           to a false one is how a screen comes to show a cleared list that was
           never cleared. */
        if (slug !== null && !tenants.length) return ctx.fail("platform.not_found");
        const id = input.id ? String(input.id) : null;
        await Promise.all(tenants.map((t) =>
          markSeen(ctx.shardOf(t), t.id, accountId, id, ctx.now)));
        return { seen: true };
      },
    },

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
  /*
    ⚠️ ONE QUERY, BECAUSE THIS RUNS IN FRONT OF EVERY SINGLE REQUEST. Reading the
    session and then the account it belongs to is two round trips to learn one
    thing — who is asking — and the second only ever fetches an email address off
    a row the first already named. On a database that is not in the same building
    that is a tenth of a second on every navigation, every save and every poll in
    the product.

    ⚠️ AND THE JOIN IS LEFT, so a session whose account is gone still reads as a
    session with no email rather than as no session at all. The two are different
    answers: one signs somebody out, the other shows a person with a missing
    name, and only the second is true.
  */
  const row = await directory.prepare(
    `SELECT s.id, s.account_id, s.expires_at, s.proven_at, s.ended_at, a.email`
    + ` FROM session s LEFT JOIN account a ON a.id = s.account_id WHERE s.id = ?`)
    .bind(id).first<{
      id: string; account_id: string; expires_at: string;
      proven_at: string | null; ended_at: string | null; email: string | null;
    }>();

  /* ⚠️ THE SAME THREE REFUSALS `readSession` MAKES, and they stay here rather
     than being re-derived: ended, expired, or absent is nobody. */
  if (!row || row.ended_at) return { session: null, email: null, accountId: null };
  if (Date.parse(row.expires_at) < now.getTime()) {
    return { session: null, email: null, accountId: null };
  }
  return {
    session: { id: row.id, accountId: row.account_id as AccountId, provenAt: row.proven_at },
    email: row.email ?? null,
    accountId: row.account_id as AccountId,
  };
}

export { appsOfTenant };
