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

import type { AnyOperation, AppSpec, BindingSpec, DeploymentSpec, Instant, LegalDoc, LegalForApp, Receiving, SchemaModule, Session, SqlHandle } from "@one/kernel";
import { ACCOUNT_HOLDER, PUBLIC, accountReceiving, operation, ropaOf, s, transfersOf, vaultActivities } from "@one/kernel";

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
  /**
   * ⚠️ EVERY WORKSPACE THIS PERSON IS IN, AND WHAT THEY ARE IN EACH. An
   * obligation follows a ROLE, and a person is an owner in one studio and
   * somebody's client in another — so "which documents do I owe" cannot be
   * answered from the door they happen to be standing at.
   */
  workspaces(): Promise<readonly WorkspacePlace[]>;
  /**
   * ⚠️ WHO RUNS THIS DEPLOYMENT, INJECTED. The content names a company, so it
   * cannot live in a product-agnostic package — but the obligation it carries is
   * owed by everybody with an account, including somebody in no product at all,
   * which is the one person no app's declaration reaches.
   *
   * Null where a deployment has not declared one, which is a self-host that has
   * not got there yet rather than an error.
   */
  readonly deployment: DeploymentSpec | null;
}

/** One place somebody belongs, as the legal surface needs it. */
export interface WorkspacePlace {
  readonly appId: string;
  readonly tenantId: string;
  readonly name: string;
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
    ⚠️ SCOPED TO THE ACCOUNT, NOT TO A WORKSPACE, and the distinction is the whole
    of it. This table lives in the GLOBAL store beside `accounts`, and closing one
    workspace must not delete the record that a person — who may still be in three
    others — agreed to the terms. It goes when the ACCOUNT goes, and saying so in
    a declaration is what puts it in the export and the erasure rather than in a
    sentence somebody has to remember.
  */
  scoped: { tenantColumn: "account_id", tenantTables: ["consents"] },
};

/**
 * EVERY APP'S LEGAL DECLARATION, IN THE GLOBAL STORE.
 *
 * ⚠️ A WORKER KNOWS ITS OWN MANIFEST AND NOTHING ABOUT THE PRODUCT BESIDE IT, so
 * the hub — which answers for every workspace somebody belongs to —
 * could only ever show the documents of whichever app happened to serve the
 * request. That is the problem the vault had, and this is its answer:
 * declarations published on boot, read by whoever renders all of them.
 *
 * ⚠️ NO TIMESTAMP, for the reason `vault_specs` has none: nothing reads when a
 * declaration was published — it is whatever the running bundle says — and the
 * column would make boot read the wall clock, which the injected-clock guard
 * correctly refuses.
 */
export const LEGAL_SPEC_SCHEMA: SchemaModule = {
  id: "legal_specs",
  ddl: [
    `CREATE TABLE IF NOT EXISTS legal_specs (app_id TEXT PRIMARY KEY, app_name TEXT NOT NULL, documents TEXT NOT NULL);`,
  ],
  /*
    ⚠️ AN ALTER, BECAUSE A `CREATE TABLE IF NOT EXISTS` CARRYING IT DOES NOTHING
    WHERE THE TABLE IS ALREADY THERE — a column that exists on fresh databases and
    nowhere else, and a read that comes back undefined for every deployment that
    was already running.

    ⚠️ AND IT IS THE ASSEMBLED `Receiving`, NOT THE DECLARATION. Three of its
    fields are computed from the tenancy, the bindings and the collections, so a
    stored `ProtectionSpec` could not answer "does anything leave".
  */
  alters: [`ALTER TABLE legal_specs ADD COLUMN protection TEXT NOT NULL DEFAULT '{}';`],
};

/**
 * ⚠️ TOTAL, LIKE THE VAULT'S. An app that cannot publish what it asks people to
 * agree to still has to serve — a boot that throws here takes a whole product
 * down over a screen in another one.
 */
export async function publishLegalSpec<B extends BindingSpec>(
  db: SqlHandle, app: AppSpec<B>, ours: DeploymentSpec | null = null,
): Promise<void> {
  try {
    const legal = app.governance?.legal ?? [];
    if (legal.length === 0) {
      await db.run(`DELETE FROM legal_specs WHERE app_id = ?`, app.id);
      return;
    }
    await db.run(
      `INSERT INTO legal_specs (app_id, app_name, documents, protection) VALUES (?, ?, ?, ?)
       ON CONFLICT(app_id) DO UPDATE SET app_name = excluded.app_name,
         documents = excluded.documents, protection = excluded.protection`,
      app.id, app.name, JSON.stringify(legal), JSON.stringify(receivingOf(app, ours)),
    );
  } catch (why) {
    /* ⚠️ SERVES ANYWAY, AND SAYS SO — see `publishVaultSpec`, whose silent
       version of this catch hid a type error for the life of the feature. */
    console.error("legal spec not published", app.id, why);
  }
}

/** Every app's documents, for the surface that renders all of them at once. */
export async function publishedLegal(
  db: SqlHandle,
): Promise<readonly { appId: string; appName: string; documents: readonly LegalDoc[]; receiving: Receiving | null }[]> {
  const rows = await db.all<{ app_id: string; app_name: string; documents: string; protection: string | null }>(
    `SELECT app_id, app_name, documents, protection FROM legal_specs ORDER BY app_id LIMIT 200`,
  ).catch(() => []);
  return rows.flatMap((r) => {
    /* ⚠️ A ROW THAT WILL NOT PARSE IS DROPPED, not thrown on. It was written by
       another worker, possibly a version ahead, and one product's bad row must
       not take the whole hub down with it. */
    try {
      /* ⚠️ THE DISCLOSURE IS ALLOWED TO BE ABSENT AND THE DOCUMENTS ARE NOT. A
         row written before the column existed has `{}`, and a screen that showed
         an empty controller would be stating that nobody is responsible. */
      const receiving = JSON.parse(r.protection ?? "{}") as Partial<Receiving>;
      return [{
        appId: r.app_id, appName: r.app_name,
        documents: JSON.parse(r.documents) as readonly LegalDoc[],
        receiving: receiving.controller ? (receiving as Receiving) : null,
      }];
    } catch { return []; }
  });
}

/**
 * ⚠️ ONE ASSEMBLY, TWO CALLERS, AND THAT IS THE WHOLE REASON IT IS A FUNCTION.
 * `protection.list` answers it for the app serving the request; boot publishes it
 * so every OTHER product's hub can show it. Written twice, the two
 * would agree until the first feature that changed one — and the disagreement
 * would be between what a person is told inside a product and what they are told
 * about it from their account.
 */
export function receivingOf<B extends BindingSpec>(app: AppSpec<B>, ours: DeploymentSpec | null = null): Receiving {
  const p = app.governance.protection;
  /*
    ⚠️ THE PLATFORM'S PROCESSORS ARE UNDER EVERY PRODUCT'S, and the app wins on a
    shared id. The host and the mail lane are reached by every app here, so each
    manifest declaring its own copy is the same company written N times and
    drifted by the second edit — but an app genuinely receives MORE through the
    same processor than the account does (a coaching product's host holds health
    data; the account's holds a session), so where both name an id the app's
    entry is the fuller one and is the one a transfer is computed from.
  */
  const own = new Set(p.subprocessors.map((sub) => sub.id));
  const subprocessors = [
    ...(ours?.subprocessors ?? []).filter((sub) => !own.has(sub.id)),
    ...p.subprocessors,
  ];
  return {
    controller: p.controller,
    contact: p.contact,
    subprocessors,
    /*
      ⚠️ THE REGIONS ARE THE ANSWER TO "WHERE IS IT", and they come from the
      tenancy declaration rather than from a sentence. A page that names a region
      the deployment does not have, or omits one it does, is wrong in the one
      field a residency question is asked about.
    */
    regions: app.tenancy.regions,
    /*
      ⚠️ RESIDENCY IS NOT ONLY STORAGE. A workspace choosing a region is choosing
      where its records are STORED; which models its generations reach is a
      separate question with a separate answer, and publishing the two together is
      what lets somebody choose knowing both. Read off the binding rather than
      described, so a region that permits everything says so plainly.
    */
    inference: Object.fromEntries(
      Object.entries(app.bindings as Record<string, { kind?: string; byRegion?: Record<string, readonly string[]>; subprocessors?: readonly string[] }>)
        .filter(([, store]) => store?.kind === "inference")
        .map(([name, store]) => [
          name,
          Object.fromEntries(app.tenancy.regions.map((r) => [r, store.byRegion?.[r] ?? store.subprocessors ?? []])),
        ]),
    ),
    /*
      ⚠️ THE ANSWER EVERY QUESTIONNAIRE ASKS, joined rather than written. "Do you
      transfer personal data outside the EEA and on what basis" needs what is HELD
      crossed with who RECEIVES it, and in every company that has both documents
      the answer is written from memory once and is wrong by the next feature.

      ⚠️ IT IS THE INTERSECTION, so a recipient's own entry cannot over-disclose: a
      company claiming to receive `financial` in an app that holds none would make
      the transfer look larger than it is, in the direction nobody checks.
    */
    transfers: transfersOf({ collections: app.collections, subprocessors }),
  };
}

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
    output: s.object({ documents: s.json(), outstanding: s.json(), accepted: s.json() }),
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
      /*
        ⚠️ THE DEPLOYMENT'S OWN DOCUMENTS TRAVEL WITH THE APP'S, on every door. The
        account terms are owed by anybody with an account and are enforced by the
        same consent gate — so a lane that answered only the app's would report an
        obligation the gate holds people to and no screen ever showed.
      */
      const ours = d.deployment?.legal ?? [];
      const documents = [...ours, ...app.governance.legal];
      if (!d.session) return { documents, outstanding: [], accepted: [] };
      const accepted = await consentsOf(d.directory, d.session.accountId);
      /*
        ⚠️ WHAT WAS AGREED AND WHEN, NOT JUST WHAT IS OUTSTANDING. `outstanding`
        answers "may this person carry on"; a person looking at their own record
        is asking the opposite question — which of these did I agree to, and on
        what day. Without the dates the screen can only say "accepted", which is
        the one part of an acceptance nobody disputes.

        ⚠️ EVERY VERSION, NOT THE LATEST. Agreeing to v3 does not unsay v1, and a
        ledger that showed only the current row would quietly rewrite what
        somebody signed up to.
      */
      return {
        documents,
        /* ⚠️ TWO ROLES, ONE LIST. What the deployment asks is owed for HAVING an
           account; what the app asks is owed for being something inside it. */
        outstanding: [
          ...outstandingFor(ours, ACCOUNT_HOLDER, accepted),
          ...outstandingFor(app.governance.legal, d.role, accepted),
        ],
        accepted,
      };
    },
  });

  /**
   * WHAT EVERY PRODUCT ASKS OF THIS PERSON, WHEREVER THEY BELONG.
   *
   * ⚠️ `legal.list` ANSWERS FOR ONE APP AND ONE ROLE — the app serving the
   * request, and whatever the caller is on the door they are standing at. That is
   * right inside a product and useless on the hub, which exists
   * precisely to answer across products: a person is an owner in one studio, a
   * client in another and a member of a third product entirely, and they owe
   * three different sets.
   *
   * ⚠️ ROLES ARE UNIONED PER APP, NOT LISTED PER WORKSPACE. An acceptance is
   * recorded per ACCOUNT per document per version, so accepting once satisfies
   * every workspace at once — listing the same document under each would show
   * somebody four rows that are one obligation, and ticking one would tick them
   * all. What a person owes an app is what ANY of their roles there owes.
   */
  const mine = operation({
    id: "legal.mine",
    kind: "read",
    summary: "Every product you belong to, what it asks you to agree to, and what you have.",
    input: s.object({}),
    output: s.object({ apps: s.json(), accepted: s.json() }),
    /*
      ⚠️ PUBLIC IS THE LANE AND THE SESSION IS THE ANSWER. Signed out this is an
      empty list rather than a refusal, for the same reason `legal.list` is
      public: nothing here is anybody's data until there is a person to attach it
      to.
    */
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) return { apps: [], accepted: [] };

      const [published, places, accepted] = await Promise.all([
        publishedLegal(d.directory),
        d.workspaces(),
        consentsOf(d.directory, d.session.accountId),
      ]);

      /* Which roles this person holds in each app, across every workspace. */
      const rolesByApp = new Map<string, Set<string>>();
      for (const place of places) {
        const set = rolesByApp.get(place.appId) ?? new Set<string>();
        set.add(place.role);
        rolesByApp.set(place.appId, set);
      }

      const apps: readonly LegalForApp[] = published
        /*
          ⚠️ ONLY THE PRODUCTS THEY ARE ACTUALLY IN. Every app on the deployment
          publishes here, and showing all of them would tell somebody about
          products they have never opened — and ask them to agree to the terms of
          one they do not use.
        */
        .filter((a) => rolesByApp.has(a.appId))
        .map((a) => {
          const roles = [...(rolesByApp.get(a.appId) ?? [])].sort();
          /* ⚠️ THE UNION, computed by asking the same function once per role
             rather than by re-implementing its rule here. */
          const owed = new Map<string, LegalDoc>();
          for (const role of roles) {
            for (const doc of outstandingFor(a.documents, role, accepted)) owed.set(doc.id, doc);
          }
          return {
            appId: a.appId, appName: a.appName, roles,
            documents: a.documents,
            outstanding: [...owed.values()],
            /* ⚠️ THIS PRODUCT'S OWN, published beside its documents. */
            receiving: a.receiving,
          };
        });

      /*
        ⚠️ THE DEPLOYMENT COMES FIRST, AND IT IS NOT A PRODUCT. It is the account
        itself — the thing that exists before any product and outlives all of
        them — so it is listed the same way rather than in a shape of its own,
        and it is first because that is the order the two things stand in.
      */
      const ours = d.deployment;
      const mineHere: readonly LegalForApp[] = ours
        ? [{
          appId: "", appName: ours.name,
          roles: [ACCOUNT_HOLDER],
          documents: ours.legal,
          outstanding: outstandingFor(ours.legal, ACCOUNT_HOLDER, accepted),
          /* ⚠️ ONE DISCLOSURE FOR THE ACCOUNT AND THE VAULT, AND IT HAS
             RECIPIENTS. It said "Nobody else" — an empty list under a controller
             and an address — while the platform's host stored the sessions table,
             the passkeys and the vault itself, and the mail lane carried every
             sign-in code. The assembly is the kernel's, because the preview draws
             the same thing and two of them would drift. */
          receiving: accountReceiving(ours),
        }]
        : [];

      return { apps: [...mineHere, ...apps], accepted };
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
      /* ⚠️ THE DEPLOYMENT'S COUNT AS KNOWN. Without this the one document
         everybody is asked for is the one nobody can accept. */
      const known = [...(d.deployment?.legal ?? []), ...app.governance.legal]
        .some((l) => l.id === input.document && l.version === input.version);
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
    async handler(ctx) {
      /* ⚠️ THE SAME ASSEMBLY BOOT PUBLISHES, DEPLOYMENT INCLUDED. See
         `receivingOf` — a product's own list without the platform's under it
         omits the host that stores every row it is about. */
      return receivingOf(app, deps(ctx).deployment);
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

  return [help, changes, legal, mine, accept, disclosure, record, ...consentOps] as unknown as readonly AnyOperation[];
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
