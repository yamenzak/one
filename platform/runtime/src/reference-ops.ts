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
import { PUBLIC, operation, ropaOf, s, transfersOf, vaultActivities } from "@one/kernel";

/** ⚠️ A symbol, so an app cannot reach the ledger by writing a property name. */
export const REFERENCE = Symbol.for("one.runtime.reference");

export interface ReferenceDeps {
  /**
   * ⚠️ THE REGIONAL STORE, because a SUBJECT's consent lives where that
   * workspace's records live. The document ledger beside it is global for the
   * opposite reason: a person in three workspaces accepted the terms once.
   */
  readonly regional: SqlHandle;
  readonly tenantId: string;
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
    output: s.object({ controller: s.text(), contact: s.text(), subprocessors: s.json(), regions: s.json(), inference: s.json(), transfers: s.json() }),
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
        /*
          ⚠️ THE ANSWER TO THE QUESTION EVERY QUESTIONNAIRE ASKS, joined rather
          than written. "Do you transfer personal data outside the EEA and on
          what basis" needs what is HELD crossed with who RECEIVES it, and in
          every company that has both documents the answer is written from
          memory once and is wrong by the next feature.

          ⚠️ IT IS THE INTERSECTION, so a recipient's own entry cannot
          over-disclose: a company claiming to receive `financial` in an app that
          holds none would make the transfer look larger than it is, in the
          direction nobody checks.
        */
        transfers: transfersOf({ collections: app.collections, subprocessors: p.subprocessors }),
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
          /* ⚠️ WHAT THIS APP READS THROUGH THE VAULT AND STORES NOWHERE. Invisible
             to the collections by construction, so without this line an app whose
             only health data is read through a grant produces a record saying it
             holds none — true, and the most misleading thing the document could
             say. */
          disclosed: vaultActivities(app.vault),
        }),
      };
    },
  });

  /*
    ⚠️ THE ONLY COLLECTIONS THIS APP HAS THAT NEED IT, computed once. An app with
    none gets no surface at all rather than one that refuses — a screen offering
    to record consent for processing that does not happen is a screen that
    teaches people the word means nothing.
  */
  const guarded = app.collections.filter((c) => needsExplicitConsent(c as never)).map((c) => c.id);

  const consentRead = operation({
    id: "consent.status",
    kind: "read",
    summary: "Whether explicit consent is held for this person, and what it covers.",
    input: s.object({ subject: s.text({ max: 60 }) }),
    output: s.object({ given: s.bool(), at: s.optional(s.text()), withdrawnAt: s.optional(s.text()), covers: s.json() }),
    permission: "consent:read",
    idempotency: { mode: "none" },
    async handler(ctx, input: { subject: string }) {
      const d = deps(ctx);
      const held = await consentOf(d.regional, d.tenantId, input.subject);
      return {
        given: held.given,
        ...(held.at ? { at: held.at } : {}),
        ...(held.withdrawnAt ? { withdrawnAt: held.withdrawnAt } : {}),
        /* ⚠️ WHAT IT COVERS, DERIVED. Consent to "everything" is not specific,
           which is one of the three things Article 9 requires it to be. */
        covers: guarded,
      };
    },
  });

  const give = operation({
    id: "consent.record",
    kind: "write",
    summary: "Record that this person gave explicit consent to what is held about them.",
    input: s.object({ subject: s.text({ max: 60 }) }),
    output: s.object({ given: s.bool() }),
    permission: "consent:manage",
    idempotency: { mode: "natural", key: "subject" },
    audit: (i: { subject: string }) => ({ subject: i.subject, verb: "consent:give" }),
    outcome: { message: "Recorded", tone: "success", invalidates: ["consent.status"] },
    /*
      ⚠️ NOT A TOOL, AND FOR THE SAME REASON ACCEPTING TERMS IS NOT. A model that
      can record somebody's consent to processing their medical information makes
      the ledger worthless as evidence, which is the only thing it is for.
    */
    tool: false,
    async handler(ctx, input: { subject: string }) {
      const d = deps(ctx);
      /*
        ⚠️ RE-GIVING CLEARS A WITHDRAWAL rather than being refused as a
        duplicate. Somebody who withdrew and changed their mind is an ordinary
        thing that happens, and a ledger that could not express it would leave
        them permanently unable to use the product they came back to.
      */
      await d.regional.run(
        `INSERT INTO subject_consent (tenant_id, subject_id, given_at, withdrawn_at, by_account)
         VALUES (?, ?, ?, NULL, ?)
         ON CONFLICT(tenant_id, subject_id) DO UPDATE SET given_at = excluded.given_at, withdrawn_at = NULL, by_account = excluded.by_account`,
        d.tenantId, input.subject, ctx.now() as Instant, d.session?.accountId ?? null,
      );
      return { given: true };
    },
  });

  const withdraw = operation({
    id: "consent.withdraw",
    kind: "write",
    summary: "Withdraw that consent. Nothing new is recorded afterwards.",
    input: s.object({ subject: s.text({ max: 60 }) }),
    output: s.object({ withdrawn: s.bool() }),
    /*
      ⚠️ WITHDRAWING IS EASIER THAN GIVING, WHICH IS THE LAW AND ALSO THE POINT.
      Article 7(3) requires it to be as easy to withdraw as to give; making it
      the same permission is the least that satisfies that, and a narrower one
      would be a product where consent is a one-way door.
    */
    permission: "consent:manage",
    idempotency: { mode: "natural", key: "subject" },
    audit: (i: { subject: string }) => ({ subject: i.subject, verb: "consent:withdraw" }),
    outcome: { message: "Withdrawn", tone: "success", invalidates: ["consent.status"] },
    fails: ["platform.not_found"],
    tool: false,
    async handler(ctx, input: { subject: string }) {
      const d = deps(ctx);
      /*
        ⚠️ A COLUMN, NEVER A DELETE. Removing the row destroys the evidence that
        consent was ever held — which is exactly what is needed to show the
        processing that already happened was lawful. Withdrawal is not
        retroactive; the record of both moments is the whole value.
      */
      const changed = await d.regional.run(
        `UPDATE subject_consent SET withdrawn_at = ? WHERE tenant_id = ? AND subject_id = ? AND withdrawn_at IS NULL`,
        ctx.now() as Instant, d.tenantId, input.subject,
      ).then(() => true).catch(() => false);
      if (!changed) ctx.fail("platform.not_found", { field: "subject" });
      return { withdrawn: true };
    },
  });

  /*
    ⚠️ AN APP WITH NOTHING TO CONSENT TO GETS NO SURFACE, rather than one that
    refuses. `hello` holds nothing personal, so offering it a consent screen
    would be a control over processing that does not happen.
  */
  const consentOps = guarded.length ? [consentRead, give, withdraw] : [];

  return [help, changes, legal, accept, disclosure, record, ...consentOps] as unknown as readonly AnyOperation[];
}

/* ------------------------------------------------- article 9 consent --- */

/**
 * EXPLICIT CONSENT TO SPECIAL-CATEGORY PROCESSING, FROM THE PERSON IT IS ABOUT.
 *
 * ⚠️ THIS IS NOT THE DOCUMENT LEDGER ONE FILE UP, AND CONFLATING THEM IS THE
 * MISTAKE THIS EXISTS TO PREVENT. Accepting a privacy notice is being TOLD what
 * happens. Article 9 explicit consent is agreeing to a specific thing, and it
 * carries a property no document acceptance has: it can be WITHDRAWN, at any
 * time, as easily as it was given.
 *
 * Fifteen of Kova's collections declared `condition: "explicit_consent"` and
 * nothing anywhere collected any. The declaration asserted a legal basis the
 * product did not have — which is worse than declaring the wrong one, because it
 * reads as diligence.
 *
 * ⚠️ AND IT IS PER SUBJECT, NOT PER ACCOUNT. The person whose health data it is
 * may have no account at all: a studio records a client's weight, and the client
 * is a row before they are ever a login. Keying this on an account would collect
 * consent from whoever was typing.
 */
export const SUBJECT_CONSENT_SCHEMA: SchemaModule = {
  id: "subject_consent",
  ddl: [
    /*
      ⚠️ ONE ROW PER SUBJECT, WITH A WITHDRAWAL COLUMN RATHER THAN A DELETE.
      Deleting the row on withdrawal would destroy the evidence that consent was
      ever held — which is exactly what is needed to show the processing that
      already happened was lawful. Withdrawal is not retroactive; the record of
      both moments is the point.
    */
    `CREATE TABLE IF NOT EXISTS subject_consent (tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, given_at TEXT NOT NULL, withdrawn_at TEXT, by_account TEXT, PRIMARY KEY (tenant_id, subject_id));`,
    `CREATE INDEX IF NOT EXISTS idx_subject_consent_tenant ON subject_consent(tenant_id);`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["subject_consent"] },
};

export interface SubjectConsent {
  readonly given: boolean;
  readonly at: string | null;
  readonly withdrawnAt: string | null;
}

/** ⚠️ Withdrawn is NOT given. A row is not the question; a live row is. */
export async function consentOf(db: SqlHandle, tenantId: string, subjectId: string): Promise<SubjectConsent> {
  const row = await db.first<{ given_at: string; withdrawn_at: string | null }>(
    `SELECT given_at, withdrawn_at FROM subject_consent WHERE tenant_id = ? AND subject_id = ?`,
    tenantId, subjectId,
  ).catch(() => null);
  if (!row) return { given: false, at: null, withdrawnAt: null };
  return { given: !row.withdrawn_at, at: row.given_at, withdrawnAt: row.withdrawn_at };
}

/**
 * ⚠️ WHICH COLLECTIONS NEED IT, DERIVED FROM WHAT THEY SAID THEY HOLD.
 *
 * Nobody maintains a list. A collection declaring a special category with
 * `explicit_consent` is one whose rows may not be written without it, and adding
 * such a collection is the whole of what it takes to bring it under this rule.
 */
/**
 * Record it from inside an app's own handler.
 *
 * ⚠️ THE MOMENT SOMEBODY ADDS THEMSELVES IS THE MOMENT THEY CONSENT, and an app
 * whose self-registration did not record it created people nothing could ever be
 * written about — a person on the roster whose every log is refused, with no
 * screen anywhere explaining why. The gate found exactly that.
 */
export async function recordSubjectConsent(
  db: SqlHandle, tenantId: string, subjectId: string, at: Instant, byAccount: string | null = null,
): Promise<void> {
  await db.run(
    `INSERT INTO subject_consent (tenant_id, subject_id, given_at, withdrawn_at, by_account)
     VALUES (?, ?, ?, NULL, ?)
     ON CONFLICT(tenant_id, subject_id) DO UPDATE SET given_at = excluded.given_at, withdrawn_at = NULL`,
    tenantId, subjectId, at, byAccount,
  );
}

export const needsExplicitConsent = (spec: {
  readonly holding: { readonly kind: string; readonly condition?: string };
  readonly scope: { readonly of: string };
}): boolean =>
  spec.holding.kind === "personal" && spec.holding.condition === "explicit_consent" && spec.scope.of === "subject";
