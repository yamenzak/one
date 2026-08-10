/**
 * WHAT AN APP DECLARES FOR A PERSON TO READ — help, the law, and what changed.
 *
 * ⚠️ THESE THREE REGISTRIES WERE DECLARED, VALIDATED, GUARDED AND UNREADABLE.
 *
 * Kova declared eleven help articles; `helpProblems` checked their length and
 * vocabulary, `danglingHelp` refused a link to one that did not exist, and no
 * route served a single word of any of them. Its governance declared two legal
 * documents with `mustAccept` roles against no ledger and no route. Its manifest
 * carried twenty-one versions of release notes that nothing in the runtime ever
 * read.
 *
 * That is the failure this whole platform is a reaction to — a mechanism with no
 * surface — three times over, INSIDE the platform, and each one invisible
 * because the checking was thorough enough to look like coverage. A guard that
 * asks whether an article is well written cannot ask whether anybody can reach
 * it.
 *
 * ⚠️ THE READERS LIVE TOGETHER BECAUSE THE MISTAKE DOES. `scripts/surface.test.mjs`
 * now classifies every field on `AppSpec` as either read by a person or consumed
 * by the platform, so a registry added later cannot join this list quietly.
 */

import type { AnyOperation, AppSpec, BindingSpec, Instant, LegalDoc, SchemaModule, Session, SqlHandle } from "@one/kernel";
import { PUBLIC, operation, ropaOf, s } from "@one/kernel";

/** ⚠️ A symbol, so an app cannot reach the ledger by writing a property name. */
export const REFERENCE = Symbol.for("one.runtime.reference");

export interface ReferenceDeps {
  /**
   * ⚠️ THE GLOBAL STORE, because an acceptance belongs to a PERSON. Somebody in
   * two workspaces accepted the terms once, not twice — and a regional copy is
   * two answers that disagree the first time one of them is written.
   */
  readonly directory: SqlHandle;
  readonly session: Session | null;
  /** What this caller is acting as here. Decides which documents they must accept. */
  readonly role: string;
}

export interface ReferenceCarrier { readonly [REFERENCE]: ReferenceDeps }

const deps = (ctx: unknown): ReferenceDeps => (ctx as ReferenceCarrier)[REFERENCE];

/* ---------------------------------------------------------------- schema --- */

export const CONSENT_SCHEMA: SchemaModule = {
  id: "consent",
  after: ["identity"],
  ddl: [
    /*
      ⚠️ PER PERSON PER DOCUMENT PER VERSION, and the version in the key is the
      whole point. An acceptance recorded against a document rather than against
      a VERSION of it means publishing new terms silently inherits every consent
      ever given — which is the one property the ledger exists to deny, and the
      one a regulator asks about first.
    */
    `CREATE TABLE IF NOT EXISTS consents (account_id TEXT NOT NULL, document TEXT NOT NULL, version TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (account_id, document, version));`,
    `CREATE INDEX IF NOT EXISTS idx_consents_account ON consents(account_id);`,
  ],
  /*
    ⚠️ NO TENANT SCOPE, AND THAT IS DELIBERATE RATHER THAN FORGOTTEN. This table
    lives in the GLOBAL store beside `accounts`, and neither is a workspace's to
    erase: closing one workspace must not delete the record that a person — who
    may still be in three others — agreed to the terms. It goes when the ACCOUNT
    goes.
  */
};

/* --------------------------------------------------------------- reading --- */

export interface Accepted { readonly document: string; readonly version: string; readonly at: string }

export async function consentsOf(db: SqlHandle, accountId: string): Promise<readonly Accepted[]> {
  const rows = await db.all<{ document: string; version: string; at: string }>(
    `SELECT document, version, at FROM consents WHERE account_id = ?`, accountId,
  ).catch(() => []);
  return rows;
}

/**
 * What this person still has to agree to.
 *
 * ⚠️ COMPUTED FROM THE ROLE THEY ARE ACTING IN, not from the account. The same
 * person is an owner in one workspace and somebody's customer in another, and
 * the documents each of those must accept are different — so an obligation
 * resolved once per account would either demand a processing agreement from a
 * customer or excuse an owner from one.
 */
export function outstandingFor(
  legal: readonly LegalDoc[],
  role: string,
  accepted: readonly Accepted[],
): readonly LegalDoc[] {
  const held = new Set(accepted.map((a) => `${a.document}@${a.version}`));
  return legal.filter((d) => d.mustAccept.includes(role) && !held.has(`${d.id}@${d.version}`));
}

/* ------------------------------------------------------------ operations --- */

export function referenceOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const help = operation({
    id: "help.list",
    kind: "read",
    summary: "The help this product ships, and what each article explains.",
    input: s.object({ surface: s.optional(s.text({ max: 60 })) }),
    output: s.object({ articles: s.json() }),
    /*
      ⚠️ PUBLIC, BECAUSE HELP IS THE PRODUCT'S OWN DOCUMENTATION. It is identical
      for every workspace, contains no workspace's data, and the person most
      likely to need it is the one who cannot get in. Putting a session in front
      of a help centre is how "I can't sign in" becomes unanswerable.
    */
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(_ctx, input: { surface?: string }) {
      const all = Object.entries(app.help).map(([id, a]) => ({ id, ...a }));
      /* ⚠️ Offered FROM a surface rather than searched for — which is the whole
         reason an article names the collections it explains. */
      return { articles: input.surface ? all.filter((a) => (a.surfaces ?? []).includes(input.surface!)) : all };
    },
  });

  const changes = operation({
    /*
      ⚠️ `changelog`, NOT `release` — and the rename is a scar. A collection
      called `release` derives `release.list`, which silently replaced this
      operation in the app that has one. The collision is refused at composition
      now; the id still moves, because a platform lane that reads like an
      ordinary noun is one every app has to avoid naming a collection after.
    */
    id: "changelog.list",
    kind: "read",
    summary: "What changed in this product, most recent first.",
    input: s.object({}),
    output: s.object({ version: s.text(), releases: s.json() }),
    /*
      ⚠️ PUBLIC FOR THE SAME REASON, and the version travels with it. A changelog
      whose entries a reader cannot place against what they are running is a list
      of claims — and "is my deployment the one with that fix" is the only
      question anybody opens one to answer.
    */
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler() {
      return { version: app.manifestVersion, releases: app.releases };
    },
  });

  const legal = operation({
    id: "legal.list",
    kind: "read",
    summary: "The documents this product asks you to agree to, and which you have.",
    input: s.object({}),
    output: s.object({ documents: s.json(), outstanding: s.json() }),
    /*
      ⚠️ THE DOCUMENTS ARE PUBLIC AND THE ACCEPTANCES ARE NOT. Somebody deciding
      whether to sign up must be able to read the terms first; what they have
      personally agreed to is theirs, and is answered from the session or not at
      all. One operation rather than two, because a screen that shows the terms
      and whether you have accepted them is one screen.
    */
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const documents = app.governance.legal;
      if (!d.session) return { documents, outstanding: [] };
      const accepted = await consentsOf(d.directory, d.session.accountId);
      return { documents, outstanding: outstandingFor(documents, d.role, accepted) };
    },
  });

  const accept = operation({
    id: "legal.accept",
    kind: "write",
    summary: "Record that you agree to one of them.",
    input: s.object({ document: s.text({ max: 60 }), version: s.text({ max: 40 }) }),
    output: s.object({ ok: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "natural", key: "document" },
    audit: (i: { document: string; version: string }) => ({ subject: i.document, verb: `accept:${i.version}` }),
    outcome: { message: "Thank you", tone: "success", invalidates: ["legal.list"] },
    fails: ["platform.forbidden", "platform.not_found"],
    /*
      ⚠️ NOT A TOOL, AND THIS IS THE ONE WHERE THAT MATTERS MOST. Consent is the
      single thing in this platform that must come from a person: a model that
      can agree to terms on somebody's behalf makes the entire ledger worthless
      as evidence, which is the only thing it is for.
    */
    tool: false,
    async handler(ctx, input: { document: string; version: string }) {
      const d = deps(ctx);
      /*
        ⚠️ PUBLIC IS THE LANE, NOT THE AUDIENCE. The document is readable without
        a session; agreeing to one needs somebody to agree, or this is an
        unauthenticated write against whatever account id arrived.
      */
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });

      /*
        ⚠️ THE VERSION MUST BE ONE WE ARE ASKING FOR. Without this a client can
        record consent to a version that was never published — which is a ledger
        row that satisfies the obligation and refers to nothing, and it satisfies
        it forever.
      */
      const known = app.governance.legal.some((l) => l.id === input.document && l.version === input.version);
      if (!known) ctx.fail("platform.not_found", { field: "document" });

      await d.directory.run(
        `INSERT INTO consents (account_id, document, version, at) VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id, document, version) DO NOTHING`,
        d.session!.accountId, input.document, input.version, ctx.now() as Instant,
      );
      return { ok: true };
    },
  });

  /*
    ⚠️ THE DISCLOSURE HALF, AND IT IS PUBLIC FOR THE SAME REASON THE TERMS ARE.
    Articles 13 and 14 oblige telling somebody who else receives their data
    BEFORE it is collected, so a list that needs a session is a list published
    after the moment it is owed. It is also the page a customer's own compliance
    team asks for, and answering that with a PDF sent by email is how a
    sub-processor list comes to differ from the product.
  */
  const disclosure = operation({
    id: "protection.list",
    kind: "read",
    summary: "Who else receives data held here, what they receive, and where they process it.",
    input: s.object({}),
    output: s.object({ controller: s.text(), contact: s.text(), subprocessors: s.json(), regions: s.json(), inference: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler() {
      const p = app.governance.protection;
      return {
        controller: p.controller,
        contact: p.contact,
        subprocessors: p.subprocessors,
        /*
          ⚠️ THE REGIONS ARE THE ANSWER TO "WHERE IS IT", and they come from the
          tenancy declaration rather than from a sentence. A page that names a
          region the deployment does not have, or omits one it does, is wrong in
          the one field a residency question is asked about.
        */
        regions: app.tenancy.regions,
        /*
          ⚠️ RESIDENCY IS NOT ONLY STORAGE, AND THIS IS WHERE THAT STOPS BEING A
          SENTENCE IN A COMMENT. A workspace choosing a region is choosing where
          its records are STORED; which models its generations reach is a
          separate question with a separate answer, and publishing the two
          together is what lets somebody choose knowing both.

          It is read off the binding rather than described, so a region that
          permits everything says so plainly instead of implying otherwise by
          being absent.
        */
        inference: Object.fromEntries(
          Object.entries(app.bindings as Record<string, { kind?: string; byRegion?: Record<string, readonly string[]>; subprocessors?: readonly string[] }>)
            .filter(([, store]) => store?.kind === "inference")
            .map(([name, store]) => [
              name,
              Object.fromEntries(app.tenancy.regions.map((r) => [r, store.byRegion?.[r] ?? store.subprocessors ?? []])),
            ]),
        ),
      };
    },
  });

  /*
    ⚠️ THE ARTICLE 30 RECORD, PRODUCED RATHER THAN MAINTAINED.
    A record of processing is a document every controller must keep and produce
    on request, and every one in the world is a spreadsheet describing the
    product as it was when somebody last had time. This one is computed from the
    declarations the product cannot boot without, so it cannot describe a version
    of the product that is not running.
  */
  const record = operation({
    id: "protection.record",
    kind: "read",
    summary: "The record of processing activities for this deployment.",
    input: s.object({}),
    output: s.object({ record: s.json() }),
    /* ⚠️ The same permission that reads the audit and closes the workspace: it
       is about the business rather than about anybody's own records. */
    permission: "workspace:close",
    idempotency: { mode: "none" },
    tool: false,
    async handler() {
      return {
        record: ropaOf({
          collections: app.collections,
          protection: app.governance.protection,
          regions: app.tenancy.regions,
        }),
      };
    },
  });

  return [help, changes, legal, accept, disclosure, record] as unknown as readonly AnyOperation[];
}
