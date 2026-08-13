/**
 * THE REQUEST PIPELINE — one order, no step skippable.
 *
 *   hostname → door → tenant → region → handles → standing → permission → handler
 *
 * ⚠️ THE ORDER IS THE SECURITY MODEL. The tenancy is pinned from the hostname
 * before any session is read, so a session pointed at the wrong tenant grants
 * nothing — not because it is rejected, but because the tenancy was never taken
 * from it. And the directory is read before any regional store is touched, which
 * is what makes it possible to touch the right one at all.
 *
 * Everything an app writes hangs off the end of this. Nothing an app writes is
 * anywhere else in it.
 */

import type {
  Actor, AnyOperation, AppSpec, AuditEntry, BindingSpec, Caller, Ctx, Instant, Problem,
  ConfigRegistry, DeploymentSpec, InferenceHandle, ObjectHandle, ProblemCatalog, RegionId, Resolved, ResolvedBindings, ResolvedRegion, SchemaModule, Session, SqlHandle, StandingState, TenantId,
} from "@one/kernel";
import {
  ACCOUNT_HOLDER, ALWAYS_ALLOWED, CONSENT_EXEMPT_LANES, accountCascade, assertComposable, auditFor, check, consentGate, cookieDomainFor, gateFor, laneOf, weekStarting, PLATFORM_PROBLEMS, SEATS_ENTITLEMENT, STORAGE_ENTITLEMENT, SUPPORT_SESSION,
  catalogueOf, detailFor, floorPlan, fromQuery, provenRecently, PUBLIC, relyingPartyFor, resolveEntitlements, resolveRequest, routeFor, tableNameFor, validateSession, withinQuota,
} from "@one/kernel";
import { bindingsFor, globalSql, secretFor, type RawEnv } from "./env.js";
import { applySchema } from "./schema.js";
import { COMMERCE, commerceOperations, customerOperations, providerOperations, type CommerceCarrier } from "./commerce-ops.js";
import { INBOX, inboxOperations, type InboxCarrier } from "./inbox-ops.js";
import { DATA, dataOperations, type DataCarrier } from "./data-ops.js";
import { FILES, fileOperations, allowanceFrom, type FilesCarrier } from "./files-ops.js";
import { GENERATION, generationOperations, type GenerationCarrier } from "./generate-ops.js";
import { choicesOf, disabledFrom } from "./generate.js";
import { consentsOf, outstandingFor } from "./reference-ops.js";
import { OPERATE, OPERATOR, operatorOperations, planOverrides, type OperatorCarrier } from "./operator-ops.js";
import { CONFIG, configOperations, type ConfigCarrier } from "./config-ops.js";
import { SETTINGS, settingsFor, settingsOperations, domainAdminOperations, type SettingsCarrier } from "./settings-ops.js";
import { readSettings, wordingFor } from "./settings.js";
import { remember, replayed, replayKeyOf, REPLAY_HEADER } from "./replay.js";
import { LOOKUP, type Fetcher, type LookupCarrier } from "./lookup.js";
import { chargeableFrom, readAll, readRates } from "./config.js";
import { send, type Deliver } from "./mail.js";

/**
 * THE ONE PLACE THAT KNOWS ABOUT `cloudflare:email`.
 *
 * ⚠️ THE IMPORT IS DYNAMIC AND INSIDE THE CALL, deliberately. `cloudflare:email`
 * does not resolve outside a Worker, so a static import at module scope would
 * make every Node-side test and every tool that merely LOADS this file fail on
 * an import it never needed — including the ones for apps that send nothing.
 *
 * ⚠️ AND A MISSING BINDING RESOLVES TO NULL RATHER THAN THROWING. `send` reports
 * `no_binding`, which is a different thing for an operator to go and fix than a
 * refused send: one is a line of `wrangler.jsonc`, the other is DNS.
 */
function deliverVia(env: RawEnv, binding: string | undefined): Deliver | null {
  const raw = binding ? (env as Record<string, unknown>)[binding] : undefined;
  if (!raw) return null;
  return async (from, to, mime) => {
    try {
      /* ⚠️ The specifier is built rather than written literally: TypeScript
         resolves `cloudflare:email` only with the Workers types loaded, and this
         package is also compiled for a Node-side test runner that has no reason
         to know about it. The module is still resolved at runtime, inside a
         Worker, which is the only place it exists. */
      const { EmailMessage } = (await import(/* @vite-ignore */ ["cloudflare", "email"].join(":"))) as {
        EmailMessage: new (from: string, to: string, raw: string) => unknown;
      };
      /* ⚠️ The BARE address, never the display name — `Kova <a@b>` as an
         envelope sender is rejected by the binding outright. */
      const bare = /<([^>]+)>/.exec(from)?.[1] ?? from;
      await (raw as { send(m: unknown): Promise<void> }).send(new EmailMessage(bare.trim(), to, mime));
      return { ok: true };
    } catch {
      /* ⚠️ The sender's own words never travel — same disclosure question as a
         database error, read by somebody who wanted a name they can act on. */
      return { ok: false };
    }
  };
}
import { PLATFORM_GLOBAL, SHARED_MODULES } from "./modules.js";
import { GUIDE, guideOperations, type GuideCarrier } from "./guide-ops.js";
import { MILESTONES, milestoneOperations, type MilestoneCarrier } from "./milestone-ops.js";
import { MILESTONE_EARNED, dayIn, earnerOf, recognise } from "./milestone.js";
import { OUTCOME_HEADER, outcomeHeader, type Raised } from "./outcome.js";
import { fetchMedia, usedBytes } from "./files.js";
import { readMaintenance, refuses } from "./maintenance.js";
import { runDue, type RunReport } from "./jobs.js";
import { dispatch, interpolatable, type Delivery } from "./inbox.js";
import { customerFlagsFor, PARKED, readSubscription, standingFor } from "./commerce.js";
import { claim, memberOf, membersOf, permissionsOf, revoke, seatsUsed, subjectFor, wouldStrand } from "./membership.js";
import { MEMBERS, membershipOperations, type MemberCarrier } from "./membership-ops.js";
import { sqlDirectory } from "./directory.js";
import { collectionOperations } from "./collection-ops.js";
import { DIRECTORY, FOUNDER, TOOLS, foundingRole, platformOperations, toolOperations, type DirectoryCarrier, type FounderCarrier, type ToolCarrier } from "./platform-ops.js";
import { identityOperations, PLATFORM, type PlatformCarrier, type PlatformDeps } from "./identity-ops.js";
import { identityStore, readCookie, SESSION_COOKIE, sessionStore } from "./identity.js";
import { REFERENCE, referenceOperations, type ReferenceCarrier } from "./reference-ops.js";
import { VAULT, vaultOperations, type VaultCarrier } from "./vault-ops.js";
import { exportScoped, keptBy, retentionJob } from "./data.js";
import { auditJob, recordAudit } from "./audit.js";
import { countRequest, limitJob } from "./limit.js";
import { liveFor } from "./impersonation.js";

/* -------------------------------------------------------------------- ref --- */

/**
 * ⚠️ THE FIELD THAT MAKES SECRECY USABLE RATHER THAN HOSTILE.
 *
 * A customer gets something they can quote to support; the provider's raw error
 * is logged against the same id and never sent. Withholding the detail without
 * offering this is not caution, it is an unhelpful error message.
 */
export const newRef = (): string => `ONE-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

const problemResponse = (p: Omit<Problem, "ref">, ref: string): Response =>
  new Response(JSON.stringify({ ...p, ref }), {
    status: p.status,
    headers: { "content-type": "application/problem+json" },
  });

/** Never a provider's words, and never a binding's name. */
const UNAVAILABLE = { code: "platform.unavailable", status: 503, title: "Something went wrong on our side", retryable: true } as const;
const NOT_FOUND = { code: "platform.not_found", status: 404, title: "Not found", retryable: false } as const;
/*
  ⚠️ ITS OWN CODE, NOT A 403. "Your plan does not include this" and "your plan
  includes twenty of these and you have twenty" are different problems with
  different ways out, and one code produces copy that is wrong for whichever
  case it was not written for. `402` because the answer is a payment decision.
*/
const QUOTA_REACHED = { code: "platform.quota_reached", status: 402, title: "You've reached what your plan includes", retryable: false } as const;

/* --------------------------------------------------------------- options --- */

export interface RuntimeOptions<B extends BindingSpec> {
  /**
   * ⚠️ THE DIRECTORY IS ITS OWN BINDING, resolved before any regional one, and
   * it cannot come from the resolver: the resolver needs a region, and the
   * region is the question the directory answers.
   */
  readonly directoryBinding: string;
  /**
   * ⚠️ THE IDENTITY STORE IS GLOBAL AND MAY BE THE SAME PHYSICAL STORE AS THE
   * DIRECTORY. Naming it separately is what makes splitting them later a config
   * change rather than a migration — and they will split, because one is read at
   * sign-in and the other on every request.
   */
  readonly identityBinding: string;
  /** Where a session's regional row lives. Read per request; never global. */
  readonly sessionsBinding: keyof B & string;
  readonly sessionDays?: number;
  /**
   * How a sign-in code travels.
   *
   * ⚠️ OPTIONAL, AND OMITTING IT IS RIGHT FOR ALMOST EVERY APP. The default is
   * the deployment's own mail lane, chosen from its configuration — because an
   * app that supplies this owns a decision that is a deployment's, and every app
   * that supplied one wrote a `Map`. A map is not a mail provider; it is a
   * sign-in code nobody receives, reported as delivered.
   */
  deliverCode?(email: string, code: string): Promise<void>;
  /**
   * What this caller may do, given who they are.
   *
   * ⚠️ OPTIONAL, AND OMITTING IT IS THE RIGHT ANSWER FOR ALMOST EVERY APP. The
   * default resolves the caller's MEMBERSHIP of this workspace and reads their
   * permissions from the manifest's roles — which is the same question every app
   * was answering, and every app in this repository answered it with a scaffold
   * that handed OWNER to any signed-in caller. A scaffold in this position
   * typechecks, passes every test, and is an authorization bypass.
   *
   * ⚠️ IDENTITY IS NOT AUTHORIZATION. The platform answers "who is this" from a
   * session; "what may they do here" is a question about a membership in one
   * tenant of one app. The membership store is the platform's now; supplying
   * this is for a product whose answer genuinely is not a membership.
   *
   * ⚠️ IT RETURNS PERMISSIONS, NEVER ENTITLEMENTS OR A GATE. What a workspace
   * bought and where it stands on the payment ladder are the PLATFORM's answers,
   * resolved from the subscription row below — because an app that assembled its
   * own `Caller` could hand the gate a set it made up, and the one that did
   * handed it every declared key unconditionally. There is no honest reason for
   * an app to be able to widen its own entitlements at the door.
   */
  resolveCaller?(session: Session | null, at: Resolved): Promise<{
    readonly actor: Actor;
    readonly permissions: ReadonlySet<string>;
    /**
     * WHO THIS CALLER IS ON THE CUSTOMER RAIL, where an app has one.
     *
     * ⚠️ A NAME, NOT A RESOLVED SET. Only the app knows which of its records is
     * the customer a caller is acting as — in one product it is the signed-in
     * person, in another a record they were assigned to. What that customer may
     * do is then resolved by the platform through the same walk the capabilities
     * screen reads, so the two cannot disagree.
     */
    readonly subjectId?: string;
  }>;
  /**
   * Whether this deployment can actually take money.
   *
   * ⚠️ FAIL CLOSED ON THEIR NON-PAYMENT, OPEN ON OURS. A workspace that has not
   * chosen a plan is held to setup only where a plan could have been bought; on
   * a self-host, or before a payment provider is configured, gating it would
   * strand every workspace over our own misconfiguration. Defaults to false, so
   * a deployment that says nothing sells nothing.
   */
  /**
   * ⚠️ EVERY KEY THIS DEPLOYMENT READS, DECLARED. The console shows exactly this
   * list, refuses anything outside it, and knows from it which values are
   * secrets and which may reach the shared store — so a typo in a key name is a
   * refusal rather than a row nothing consumes.
   */
  readonly config?: ConfigRegistry;
  /**
   * The store every app binds by the same id.
   *
   * ⚠️ ABSENT IS THE ORDINARY CASE and changes nothing: a deployment with one
   * app resolves its own values and falls through to nothing. It is what a
   * self-host and every test run are.
   */
  readonly sharedConfigBinding?: string;
  /**
   * How anything this platform sends actually leaves the process.
   *
   * ⚠️ INJECTED SO A SUITE CAN DRIVE THE REAL PATH. The alternative is a test
   * that stubs the mailer, which leaves the request a provider actually receives
   * — the one place a wrong sender or a wrong field lives — asserted by nothing.
   */
  readonly deliver?: Deliver;
  /**
   * ⚠️ THE BINDING NAME CLOUDFLARE EMAIL SENDING IS BOUND UNDER, because a
   * worker may bind several senders and the platform must not guess which. A
   * deployment that binds none sends nothing and says `no_binding` — which is a
   * different thing to go and fix than a refused send.
   */
  readonly sendEmailBinding?: string;
  /**
   * ⚠️ THE OUTBOUND LANE FOR DECLARED SERVICES, injected for the same reason the
   * mailer is: a suite must not be able to reach a real third party by accident,
   * and the path itself is worth exercising rather than stubbing out.
   */
  readonly lookup?: Fetcher;
  /**
   * How to count what a key's ceiling applies to, where a collection cannot.
   *
   * ⚠️ SEATS ARE THE CASE THIS EXISTS FOR. A collection's quota is counted from
   * its own table by the platform; a seat is a membership row in whatever the
   * app calls its member table, and no framework can know which of those rows count.
   */
  countQuota?(key: string, db: SqlHandle, tenantId: string): Promise<number>;
  /**
   * Who is in this workspace, and in what role.
   *
   * ⚠️ OPTIONAL, AND THE DEFAULT IS THE MEMBERSHIP ROSTER — which is what "who
   * is in this workspace" now means everywhere. Supplying it is for a product
   * whose audience genuinely is not its members.
   *
   * ⚠️ AND ONLY ACCEPTED MEMBERS ARE TOLD ANYTHING. An invitation nobody has
   * claimed has no account behind it, so a notification addressed to it is a row
   * nobody can ever read.
   */
  audienceFor?(tenantId: string, db: SqlHandle): Promise<readonly { readonly userId: string; readonly role: string }[]>;
  /**
   * Which role a caller is acting in, for anything that differs per persona.
   *
   * ⚠️ DERIVED FROM PERMISSIONS THE APP ALREADY RESOLVED, never from the
   * request. A checklist keyed on a role the caller could name would be one
   * somebody can use to read another persona's list.
   */
  roleOf?(permissions: ReadonlySet<string>): string;
  /**
   * How an interruption travels.
   *
   * ⚠️ THE DECISION IS THE PLATFORM'S; THE SENDING IS NOT — but "not sending at
   * all" is not a third option. Absent, the deployment's own mail lane carries
   * it, so a notification whose channel says `email` actually leaves the process
   * rather than being computed, recorded, and dropped.
   */
  send?(delivery: Delivery): Promise<void>;
  /**
   * The regional modules this app composes.
   *
   * ⚠️ EXPORT AND ERASURE ARE DERIVED FROM THESE, so an app that adds a module
   * gets both paths covered on the same commit. A hand-written erasure list in a
   * shipping product named seven tables against a declaration of twenty-five,
   * and the sweep reported success while a deleted workspace kept eighteen.
   */
  readonly regionalModules?: readonly SchemaModule[];
  /**
   * The GLOBAL modules this app composes — the store that holds an account.
   *
   * ⚠️ THE PERSON'S OWN EXPORT IS DERIVED FROM THESE, and it is separate from the
   * regional list because a person is not a workspace: their vault, their
   * consents and their passkeys are keyed by account and live in one store for
   * every product. Absent, the platform's own list is used — which is right until
   * an app adds a global module of its own, and then it is a table missing from
   * somebody's account export with nothing anywhere saying so.
   */
  readonly globalModules?: readonly SchemaModule[];
  /**
   * WHO RUNS THIS DEPLOYMENT — the operator, their contact, and what they ask of
   * everybody with an account.
   *
   * ⚠️ INJECTED BECAUSE IT NAMES A COMPANY. This package is product-agnostic and
   * a deployment is not; the shape is the kernel's and the one object filling it
   * lives in the deployment's own module, imported by every worker.
   *
   * ⚠️ ABSENT MEANS NOBODY IS ASKED FOR ACCOUNT TERMS, which is a self-host that
   * has not declared any rather than a mistake to refuse at boot.
   */
  readonly deployment?: DeploymentSpec;
  /** Where files live. `media` by convention, named so an app may differ. */
  readonly objectsBinding?: keyof B & string;
  /**
   * ⚠️ ABSENT MEANS THIS DEPLOYMENT GENERATES NOTHING, and every feature refuses
   * rather than falling back. A platform-side mock reachable by getting a
   * binding wrong is how a product ends up fabricating output in production and
   * charging for it.
   */
  readonly inferenceBinding?: keyof B & string;
  /**
   * The NAME of the deployment variable holding the provider's signing secret.
   *
   * ⚠️ ABSENT MEANS THE WEBHOOK REFUSES, and that is the safe direction. The
   * endpoint is public by construction — a provider cannot hold a session — so
   * the signature is the whole of its authentication, and a deployment that has
   * not configured one has an open door that grants paid access to anybody who
   * finds it.
   */
  readonly webhookSecretVar?: string;
  /** Applied once per database, before the first request it serves. */
  readonly onBoot?: {
    /** The global store: the directory, and anything else routing needs. */
    global(directory: SqlHandle): Promise<void>;
    /**
     * ⚠️ ONE COMPOSITION PER REGION, NOT ONE PER DEPLOYMENT. Applying the
     * schema to the default region's database and calling it booted leaves
     * every other region without the app's tables — so a tenant placed there
     * resolves correctly, reaches the right database, and finds nothing in it.
     * Lazy per region, so a region nobody is in costs nothing.
     */
    region(bind: ResolvedBindings<B>, region: RegionId): Promise<void>;
  };
}

export interface Runtime {
  fetch(request: Request, env: RawEnv): Promise<Response>;
  /**
   * ⚠️ THE SCHEDULED ENTRY POINT, and it is part of the runtime rather than
   * something an app wires. A worker whose `scheduled` handler is written by
   * hand is one where the run record, the isolation between jobs and the bound
   * on a sweep are all optional — and every one of them is invisible when it is
   * missing.
   */
  scheduled(env: RawEnv): Promise<readonly RunReport[]>;
}

/* --------------------------------------------------------------- dispatch --- */

export function createRuntime<B extends BindingSpec>(app: AppSpec<B>, opts: RuntimeOptions<B>): Runtime {
  /*
    ⚠️ THE COMMERCE REFUSALS, RE-ASSERTED AT THE CHOKEPOINT. `defineApp` already
    runs them and names the manifest, which is where the error is most useful —
    but an `AppSpec` is structurally typed, so an app can assemble one without
    ever calling the constructor. A check that is skipped by not using a helper
    is a check with an undocumented opt-out, and this is the one door every app
    must come through.
  */
  assertComposable(app);
  /*
    ⚠️ THE ROUTE TABLE IS BUILT FROM THE OPERATION REGISTRY, ONCE. There is no
    other way to reach a handler — no `router.get`, no mount, no registration
    step to forget. A capability that exists and cannot be reached is the exact
    failure this platform was started over, and here it is unrepresentable
    rather than caught by a guard afterwards.
  */
  const byPath = new Map<string, AnyOperation>();
  for (const op of [...platformOperations(app), ...identityOperations(app), ...commerceOperations(app), ...customerOperations(app), ...providerOperations(app), ...inboxOperations(app), ...dataOperations(app), ...fileOperations(app), ...generationOperations(app), ...operatorOperations(app), ...configOperations(app), ...settingsOperations(app), ...domainAdminOperations(OPERATE), ...guideOperations(app), ...milestoneOperations(app), ...membershipOperations(app), ...referenceOperations(app), ...vaultOperations(app), ...toolOperations()]) byPath.set(routeFor(op).path, op);

  /*
    ⚠️ A COLLECTION'S OPERATIONS ARE DERIVED HERE, NOT BY THE APP. Leaving it to
    an app makes "declare a collection and forget to mount it" expressible — a
    table applied, rows written by some other path, and no route to reach any of
    it, with every suite green. That is the exact failure this platform was
    started over, and here it cannot be written.
  */
  for (const spec of app.collections) {
    for (const op of collectionOperations(spec, {}, app.schemas ?? {})) {
      const path = routeFor(op).path;
      /*
        ⚠️ AND A COLLECTION MAY NOT SHADOW ONE EITHER — which was checked for an
        app's HAND-WRITTEN operations and not for its DERIVED ones, so the whole
        rule was one collection id away from being decorative.

        It happened: this app declares a collection called `release` (a coach
        asking to be let go of a client), whose derived `release.list` quietly
        replaced the platform's changelog reader. The route answered, with the
        collection's permission, about the wrong thing — and the only symptom was
        a 403 for a reader who should have been told what changed.

        A derived collision is worse than a declared one, because nobody wrote
        the colliding line: it appears the day somebody names a collection after
        a word the platform already uses.
      */
      if (byPath.has(path)) {
        throw new Error(
          `${app.id}: collection "${spec.id}" derives "${op.id}", which collides with a platform operation. ` +
          `Rename the collection — the platform's own ids are reserved.`,
        );
      }
      byPath.set(path, op);
    }
  }
  for (const op of app.operations as readonly AnyOperation[]) {
    const path = routeFor(op).path;
    /*
      ⚠️ AN APP MAY NOT SHADOW A PLATFORM OPERATION. Last-registration-wins would
      let a manifest quietly replace tenant creation, standing or erasure with
      its own version, and every test of the platform's would still pass.
    */
    if (byPath.has(path)) throw new Error(`${app.id}: "${op.id}" collides with a platform operation`);
    byPath.set(path, op);
  }

  /*
    ⚠️ THE PLATFORM'S CODES ARE MERGED LAST, so an app cannot redefine
    `platform.forbidden` as a 200 or drop the copy from `platform.conflict`. It
    also means an operation may always fail with one without declaring it —
    which it must, since the gate and the resolver raise them on the app's
    behalf and long before its handler runs.
  */
  const problems: ProblemCatalog = { ...app.problems, ...PLATFORM_PROBLEMS };

  const resolveConfig = {
    appRoot: app.tenancy.appRoot,
    platformRoot: app.identity.rootRelyingParty,
    reserved: [...app.tenancy.reservedSlugs],
    /*
      ⚠️ THE APP'S OWN DECLARATION, WHICH NOTHING READ FOR THE WHOLE OF STAGE 7.
      `slug` is the manifest's word for the tenant door — the label a workspace
      takes — and `classifyHost` calls that door `tenant`, so the one rename
      happens here rather than in either vocabulary.
    */
    doors: app.tenancy.doors.map((d) => (d === "slug" ? "tenant" : d)),
    directoryRegion: app.identity.directoryRegion,
  };
  const regional = (env: RawEnv) => bindingsFor(app.bindings, env, { defaultRegion: app.tenancy.defaultRegion });

  /*
    ⚠️ ONE ANSWER TO "WHO IS IN THIS WORKSPACE", used by the dispatcher and by
    the checklist alike. Two would drift, and the way they drift is that a
    notification reaches somebody the checklist says is not there.
  */
  const audienceOf = async (tenantId: TenantId, db: SqlHandle) => {
    if (opts.audienceFor) return opts.audienceFor(tenantId, db);
    const members = await membersOf(db, tenantId);
    return members
      .filter((m) => m.accountId !== null)
      .map((m) => ({ userId: m.accountId as string, role: m.role }));
  };

  /*
    ⚠️ A CEILING NOBODY CAN COUNT IS NOT A CEILING, and this is where that stops
    being expressible. A collection that declares a `quota` is counted by the
    platform from its own table; anything else needs the app to say how, because
    only the app knows what a seat is. An operation naming a key neither can
    count would report the obligation on every request and have it silently
    discharged as "fine" — a limit on a price list that refuses nothing.
  */
  const counters = new Map<string, (db: SqlHandle, tenantId: string) => Promise<number>>();
  for (const spec of app.collections) {
    if (!spec.quota) continue;
    const table = tableNameFor(spec);
    counters.set(spec.quota, async (db, tenantId) => {
      const row = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?`, tenantId);
      return row?.n ?? 0;
    });
  }
  /*
    ⚠️ THE PLATFORM COUNTS ITS OWN CEILING. Storage is bytes stored rather than
    rows kept, so no collection can count it — and leaving it to the app would
    make an upload surface that silently enforces nothing the default.
  */
  if (Object.keys(app.filePurposes ?? {}).length) {
    counters.set(STORAGE_ENTITLEMENT, (db, tenantId) => usedBytes(db, tenantId));
  }
  /*
    ⚠️ A PERMISSION NO ROLE CAN HOLD IS A REFUSAL FOR EVERYBODY, FOREVER — and it
    reads as a feature nobody uses. The gate compares the operation's permission
    against what the caller holds, and what a caller can hold comes from
    `access.roles`, whose values come from `access.permissions`; so an operation
    naming something absent from that list is unreachable by construction.

    It is checked HERE rather than at composition because the platform derives
    operations an app never wrote — the checklist, the inbox, the shelf — and
    each of those names a permission the app has to declare for its own people.
    An app that declares milestones and forgets `milestone:read` gets a surface
    that 403s for its owner, which is indistinguishable from a bug in the gate.
  */
  const declaredPermissions = new Set(app.access.permissions);
  const unreachable = [...byPath.values()].filter((op) => op.permission !== PUBLIC && !declaredPermissions.has(op.permission));
  if (unreachable.length) {
    throw new Error(
      `${app.id}: operation(s) ${unreachable.map((op) => `"${op.id}" (${op.permission})`).join(", ")} name a permission this app does not declare, so no role can hold it.`,
    );
  }

  /*
    ⚠️ AND DECLARING ONE IS NOT THE SAME AS ANYBODY BEING ABLE TO HOLD IT. A
    permission in `access.permissions` that appears in no role and in no personal
    set refuses every caller, forever, including the workspace owner — and the
    symptom is a 403 indistinguishable from a permission somebody forgot to
    grant, on a feature that reads as one nobody uses.

    ⚠️ IT IS CHECKED HERE RATHER THAN IN THE MANIFEST because the surface an app
    declares is not the surface it has: files, the inbox, billing, the member list and
    the checklist all arrive from the platform, and half the keys this catches
    belong to operations nobody in the app wrote.
  */
  const holdable = new Set<string>([...app.access.personal, ...Object.values(app.access.roles).flat()]);
  const unheld = [...new Set(
    [...byPath.values()].filter((op) => op.permission !== PUBLIC && !holdable.has(op.permission)).map((op) => op.permission),
  )];
  if (unheld.length) {
    throw new Error(
      `${app.id}: no role and no personal set holds ${unheld.join(", ")}, so the operation(s) needing them refuse everybody — including the owner.`,
    );
  }

  for (const op of byPath.values()) {
    /* ⚠️ Seats are counted from the memberships by the platform, which is
       where the rows are — see `seatsUsed`. */
    if (op.quota && op.quota !== SEATS_ENTITLEMENT && !counters.has(op.quota) && !opts.countQuota) {
      throw new Error(`${app.id}: "${op.id}" counts against "${op.quota}", which nothing can count — declare it on a collection or supply countQuota.`);
    }
  }

  /**
   * ⚠️ A CEILING ON HOW MANY WORKSPACES ONE SWEEP VISITS, because "every tenant"
   * is a number that only grows and a scheduled run has a time limit. The
   * per-job `batch` bounds the work inside one workspace; this bounds how many
   * workspaces are opened at all.
   */
  const SWEEP_TENANTS = 500;

  const booted = new Map<string, Promise<void>>();
  const once = (key: string, run: () => Promise<void>) => {
    const existing = booted.get(key);
    if (existing) return existing;
    const p = run();
    booted.set(key, p);
    return p;
  };

  return {
    /*
      ⚠️ A REGION IS SWEPT AT A TIME AND THE TENANTS IN IT ARE BOUNDED. The
      directory is global, so the runner reads which workspaces exist before it
      knows which database to open — and it takes a page rather than all of
      them, because "every tenant" is a number that only grows.
    */
    async scheduled(env) {
      const directoryDb = globalSql(env, opts.directoryBinding);
      /*
        ⚠️ NO DIRECTORY MEANS NOTHING TO SWEEP, and that is not a failure. A
        deployment mid-provisioning has no store yet; throwing here would turn
        every scheduled tick into an alert about a state that resolves itself.
      */
      if (!directoryDb) return [];
      if (opts.onBoot) await once("global", () => opts.onBoot!.global(directoryDb));
      /*
        ⚠️ THE PLATFORM'S OWN SWEEPS RUN BESIDE THE APP'S, and retention is one
        of them: `CollectionSpec.retention` is a declaration every app makes and
        nothing read, so a limit written in a manifest deleted nothing.
      */
      return runDue([...(app.jobs ?? []), retentionJob(app.collections), auditJob(app.governance.auditRetentionDays), limitJob()], {
        global: directoryDb,
        regions: app.tenancy.regions,
        now: () => new Date().toISOString() as Instant,
        bindingsFor: (region) => regional(env)(region as ResolvedRegion),
        tenants: async (region) => {
          const rows = await directoryDb.all<{ tenant_id: string }>(
            `SELECT tenant_id FROM tenant_directory WHERE region = ? ORDER BY tenant_id LIMIT ?`,
            region, SWEEP_TENANTS,
          ).catch(() => []);
          return rows.map((r) => ({ tenantId: r.tenant_id as TenantId, region }));
        },
      });
    },

    async fetch(request, env) {
      const ref = newRef();
      const url = new URL(request.url);

      /*
        ⚠️ HEALTH ANSWERS FIRST, AND DEPENDS ON NOTHING. It is what a deploy
        probe asks, so it must not need a directory read, a tenant, a region or
        a binding — every one of which is a thing that can be misconfigured, and
        every one of which a probe exists to report without being unable to
        answer for the same reason.
      */
      if (url.pathname === "/health") {
        return Response.json({ ok: true, app: app.id, manifest: app.manifestVersion });
      }

      const directoryDb = globalSql(env, opts.directoryBinding);
      const identityDb = globalSql(env, opts.identityBinding);
      if (!directoryDb || !identityDb) return problemResponse(UNAVAILABLE, ref);

      /*
        ⚠️ BOOT RUNS BEFORE THE DIRECTORY IS READ, because the directory read IS
        a query against a schema. Booting after resolution reads a table that
        does not exist yet on a fresh database — and the failure is not a missing
        feature, it is every request 500ing from the first line of the pipeline.

        Memoised as a PROMISE rather than a boolean: concurrent first requests
        would otherwise each start their own composition, and two runners racing
        on the same marker table is a state neither of them describes.
      */
      if (opts.onBoot) await once("global", () => opts.onBoot!.global(directoryDb));

      const resolution = await resolveRequest(url.hostname, resolveConfig, sqlDirectory(directoryDb));
      if (!resolution.ok) return problemResponse(resolution.problem, ref);
      const at = resolution.at;

      let bind: ResolvedBindings<B>;
      try {
        bind = regional(env)(at.region as ResolvedRegion);
      } catch {
        /*
          A provisioning gap, not a caller's mistake. The response names neither
          the binding nor the region — that would describe our infrastructure to
          whoever asked — and the `ref` is how an operator finds it in the log.
        */
        return problemResponse(UNAVAILABLE, ref);
      }

      if (opts.onBoot) await once(at.region, () => opts.onBoot!.region(bind, at.region));

      const op = byPath.get(url.pathname);
      if (!op || routeFor(op).method !== request.method) return problemResponse(NOT_FOUND, ref);

      /*
        ⚠️ MAINTENANCE IS THE STANDING GATE ONE LEVEL UP, AND IT IS ABOVE THE
        PUBLIC LANE. "Sign-in is disabled" is a claim about a lane that has no
        session yet, so a check placed after the session read would leave exactly
        the doors open that a full stop exists to close.

        ⚠️ AND IT DOES NOT STAND DOWN IN DEVELOPMENT. Sparing every request there
        spares the whole test suite too, so the switch would appear to work while
        withholding nothing.
      */
      const closed = await readMaintenance(directoryDb);
      if (refuses(closed, laneOf(op), routeFor(op).method !== "GET", at.door === "admin")) {
        return problemResponse({
          code: "platform.maintenance", status: 503,
          title: closed.message || "We're doing some work — back shortly",
          retryable: true,
        }, ref);
      }

      /*
        ⚠️ THE SESSION IS VALIDATED AGAINST THE ORIGIN IT ARRIVED ON, always. A
        cookie can be sent somewhere it was not meant for — a widened domain
        attribute, a proxy, a future edit — and this check is what makes that
        inert rather than a cross-product compromise. Braces as well as belt, on
        the one thing where the belt alone would be a bad trade.
      */
      /*
        ⚠️ THE SHARED STORE IS BOOTED THE FIRST TIME ANY APP TOUCHES IT, and by
        the platform rather than by an app's own boot hook. Every app binds it by
        the same id, so leaving the composition to each of them means N chances
        to forget — and the failure is a table that is not there, read through a
        `catch` that answers "nothing configured".
      */
      const sharedConfigDb = opts.sharedConfigBinding ? globalSql(env, opts.sharedConfigBinding) : null;
      if (sharedConfigDb) await once("shared-config", () => applySchema(sharedConfigDb, SHARED_MODULES).then(() => undefined));

      const identity = identityStore(identityDb);
      /* ⚠️ THE DIRECTORY TRAVELS WITH THE STORE, because signing in indexes a
         session globally and reading one weighs it against that index. Without
         it a session is invisible to the account centre and unrevokable from
         there — which is exactly the session somebody would want to end. */
      const sessions = sessionStore(bind[opts.sessionsBinding] as SqlHandle, identityDb);
      const cookieId = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
      let session: Session | null = null;
      if (cookieId) {
        const now = new Date().toISOString() as Instant;
        const found = await sessions.read(cookieId, now);
        if (found) {
          const verdict = validateSession(found, { origin: url.origin, appId: app.id }, now);
          if (verdict.ok) session = verdict.session;
          // An expired row is deleted rather than left to accumulate; a row for
          // another origin is left alone, because it is somebody else's session.
          else if (verdict.why === "expired") await sessions.revoke(found.id);
        }
      }

      const cookies: string[] = [];
      const platform: PlatformDeps = {
        directory: identityDb, identity, sessions,
        origin: url.origin,
        /*
          ⚠️ THE RELYING PARTY IS DERIVED FROM THE HOST, NEVER FROM THE REQUEST
          BODY. `relyingPartyFor` returns the platform root under our own roots
          and the hostname itself for a tenant's own domain — which is a WebAuthn
          invariant rather than a policy, and also exactly what whitelabel wants.
        */
        relyingParty: relyingPartyFor(at.host),
        /* ⚠️ The manifest's own scope. It declared one and nothing read it, so
           every session widened to the app root whatever the app asked for. */
        cookieDomain: cookieDomainFor(at.host, app.identity.sessionScope),
        secureCookies: url.protocol === "https:",
        sessionDays: opts.sessionDays ?? 30,
        session,
        setCookie: (value) => cookies.push(value),
        /*
          ⚠️ ASKED OF EACH REGION, because memberships are regional and the
          directory is global — so "which of these do I belong to" is a question
          neither store can answer alone. A list built from the directory alone
          would be every workspace on the deployment.
        */
        mineIn: async (tenantIds) => {
          const out = new Map<string, string>();
          if (!session || tenantIds.length === 0) return out;
          for (const region of app.tenancy.regions) {
            const there = regional(env)(region as ResolvedRegion);
            if (opts.onBoot) await once(region, () => opts.onBoot!.region(there, region));
            /*
              ⚠️ `revoked_at IS NULL`, WHICH WAS MISSING. Without it a workspace
              somebody LEFT stayed on their list for ever — the row is revoked
              rather than deleted, deliberately, so that "who was in this
              workspace and when" survives, and every reader has to say it means
              a past membership.

              ⚠️ AND THE ROLE TRAVELS, because the question upstairs is no longer
              only "am I in this" — it is "what am I here", which decides which
              documents this person is asked to accept. A second walk to fetch it
              would be a second chance to disagree with the first.
            */
            const rows = await (there.db as SqlHandle).all<{ tenant_id: string; role: string }>(
              `SELECT tenant_id, role FROM membership WHERE account_id = ? AND revoked_at IS NULL`,
              session.accountId,
            ).catch(() => []);
            for (const row of rows) if (tenantIds.includes(row.tenant_id)) out.set(row.tenant_id, row.role);
          }
          return out;
        },
        /*
          ⚠️ THE REGION IS FOUND BY LOOKING, AND THE STORE IT WAS FOUND IN IS WHAT
          COMES BACK. A workspace lives in exactly one region and this door knows
          none of them, so the walk is the lookup — and binding the write to the
          handle the read came from is what stops a rule checked against one
          region's members from being applied to another's.

          ⚠️ ONLY WHERE THE CALLER IS ALREADY A MEMBER. Without that this is a
          members read for any workspace on the deployment, from any session.
        */
        membershipIn: async (tenantId) => {
          if (!session || !tenantId) return null;
          for (const region of app.tenancy.regions) {
            const there = regional(env)(region as ResolvedRegion);
            if (opts.onBoot) await once(region, () => opts.onBoot!.region(there, region));
            const db = there.db as SqlHandle;
            const here = await db.first<{ tenant_id: string }>(
              `SELECT tenant_id FROM membership WHERE tenant_id = ? AND account_id = ? AND revoked_at IS NULL`,
              tenantId, session.accountId,
            ).catch(() => null);
            if (!here) continue;
            return {
              members: await membersOf(db, tenantId as TenantId),
              revoke: (id, at) => revoke(db, tenantId as TenantId, id, at),
            };
          }
          return null;
        },
        /*
          ⚠️ EVERY WORKSPACE THIS PERSON IS THE LAST ADMINISTRATOR OF, asked of
          every region because that is where memberships live. Bounded by the
          number of workspaces one account is in, which is the only ceiling that
          means anything here — a cap would silently understate the answer, and
          the whole value of this list is that it is complete.

          ⚠️ IT ASKS `wouldStrand`, WHICH IS ALSO WHAT REFUSES THE LEAVE. Deriving
          "you cannot close" from a different rule than the one that refuses is
          how a screen comes to offer a button that always fails.
        */
        /*
          ⚠️ TWO STORES, AND NEITHER IS OPTIONAL. Everything scoped to an account
          — the vault, its disclosure log, the consents, the passkeys, the
          sessions — is in the GLOBAL store; where somebody belongs is in every
          REGION. An export that read one of them would be complete-looking and
          wrong in the half nobody checks.

          ⚠️ THE ACCOUNT'S OWN ROW IS FETCHED SEPARATELY, and it is the one honest
          special case in here: a cascade filters `WHERE <column> = ?`, and this
          row is keyed by `id`. Everything else is derived.
        */
        exportMe: async (at) => {
          if (!session) return { at, tables: {}, dropped: {}, account: null, workspaces: [] };
          const whole = await exportScoped(
            directoryDb, accountCascade(opts.globalModules ?? PLATFORM_GLOBAL), session.accountId, at,
          );
          const account = await directoryDb.first<Record<string, unknown>>(
            `SELECT * FROM accounts WHERE id = ?`, session.accountId,
          ).catch(() => null);
          const belongs: Record<string, unknown>[] = [];
          for (const region of app.tenancy.regions) {
            const there = regional(env)(region as ResolvedRegion);
            if (opts.onBoot) await once(region, () => opts.onBoot!.region(there, region));
            const rows = await (there.db as SqlHandle).all<Record<string, unknown>>(
              `SELECT tenant_id, role, invited_at, accepted_at, revoked_at FROM membership WHERE account_id = ?`,
              session.accountId,
            ).catch(() => []);
            /* ⚠️ REVOKED ONES TOO. "I used to be in that workspace" is a fact
               about them that we still hold, so withholding it from their own
               export is the omission this whole shape exists to prevent. */
            for (const row of rows) belongs.push({ ...row, region });
          }
          return { ...whole, account: account ?? null, workspaces: belongs };
        },
        wouldStrandOnLeaving: async () => {
          if (!session) return [];
          const stuck: string[] = [];
          for (const region of app.tenancy.regions) {
            const there = regional(env)(region as ResolvedRegion);
            if (opts.onBoot) await once(region, () => opts.onBoot!.region(there, region));
            const db = there.db as SqlHandle;
            const rows = await db.all<{ tenant_id: string; id: string }>(
              `SELECT tenant_id, id FROM membership WHERE account_id = ? AND revoked_at IS NULL`,
              session.accountId,
            ).catch(() => []);
            for (const row of rows) {
              const members = await membersOf(db, row.tenant_id as TenantId);
              if (wouldStrand(app.access.roles, members, row.id)) stuck.push(row.tenant_id);
            }
          }
          return stuck;
        },
        /*
          ⚠️ THE DEPLOYMENT'S OWN LANE UNLESS THE APP INSISTS. A refusal here is
          reported by `identity.code.request` rather than swallowed: a code that
          could not be sent and a code that was are not the same answer, and
          telling somebody to check their inbox for neither is the failure.
        */
        deliverCode: opts.deliverCode ?? (async (email, code) => {
          const values = { ...(await readAll(sharedConfigDb)), ...await readAll(directoryDb) };
          const out = await send(values, {
            to: email,
            subject: `${app.name}: your sign-in code`,
            body: `Your code is ${code}. It is good for a few minutes and can be used once.`,
          }, opts.deliver ?? deliverVia(env, opts.sendEmailBinding), new Date().toISOString() as Instant);
          if (!out.ok) throw new Error(`mail:${out.why}`);
        }),
      };

      /**
       * How an interruption actually leaves the process.
       *
       * ⚠️ THE FALLBACK IS THE DEPLOYMENT'S OWN MAIL LANE, and it had to be
       * written rather than described. `send` was optional with a comment saying
       * an absent one meant the deployment carried it — and absent meant NOBODY
       * carried it, so every notification whose channel said `email` was
       * resolved, rendered, counted and dropped. Which is the failure this whole
       * platform is a reaction to, sitting inside the platform.
       *
       * ⚠️ THE ADDRESS COMES FROM THE ACCOUNT, NOT FROM THE DISPATCH. A delivery
       * carries who it is for; letting it carry where to send would make every
       * raise site a place somebody can be mailed from.
       */
      const deliver = opts.send ?? (async (delivery: Delivery) => {
        if (delivery.channel !== "email") return;
        const who = await directoryDb.first<{ email: string }>(
          `SELECT email FROM accounts WHERE id = ?`, delivery.userId,
        ).catch(() => null);
        /* ⚠️ No address is silence, not a throw. The inbox row is already
           written and it is the record; mail is the interruption. */
        if (!who?.email) return;
        const values = { ...(await readAll(sharedConfigDb)), ...await readAll(directoryDb) };
        await send(values, {
          to: who.email,
          subject: delivery.title,
          /* ⚠️ A message with no body is its own title. An email whose whole
             content is a subject line reads as a truncated one. */
          body: delivery.body ?? delivery.title,
        }, opts.deliver ?? deliverVia(env, opts.sendEmailBinding),
          new Date().toISOString() as Instant).catch(() => undefined);
      });

      /*
        ⚠️ ONE READ, ONE WALK, AND THE GATE IS DOWNSTREAM OF BOTH. The
        subscription row is the single source for what a workspace bought and
        where it stands — resolved here so that the router, the tool filter and
        every handler are looking at the same answer. The directory carries a
        standing column too; that one is the ROUTING copy, written by a sweep and
        read before a region is known, and it is deliberately not what gates a
        request.
      */
      const regionalDb = bind[opts.sessionsBinding] as SqlHandle;

      /*
        ⚠️ THE MEMBERSHIP IS READ ONCE, HERE, and everything about the caller
        follows from it. Resolving it inside a handler would mean resolving it
        differently in the next one.
      */
      let membership = null as Awaited<ReturnType<typeof memberOf>>;
      if (session && at.tenant) {
        membership = await memberOf(regionalDb, at.tenant.tenantId, session.accountId);
        /*
          ⚠️ AND AN UNCLAIMED INVITATION IS PICKED UP ON SIGHT. An invitation
          that needed a separate "accept" call is one a person can only redeem
          from an email they may no longer have — signing in with the address it
          was sent to IS the acceptance, and the claim is refused unless the row
          is still unclaimed.
        */
        if (!membership) {
          membership = await claim(regionalDb, at.tenant.tenantId, session.accountId, session.snapshot.email, new Date().toISOString() as Instant);
        }
      }

      /*
        ⚠️ AN OPERATOR ACTING INSIDE A WORKSPACE, RESOLVED BEFORE THE CALLER IS.
        There is no token — what exists is a row naming an operator and a
        workspace, with an expiry the read enforces rather than a sweep. So this
        is a lookup on the request, and a grant that ran out five minutes ago is
        simply not found.

        ⚠️ AND IT IS ONLY EVER A LOOKUP FOR SOMEBODY WHO IS SIGNED IN AND IN A
        WORKSPACE. Doing it for every request would be a global-store read on the
        hot path for the overwhelming majority of them, which are neither.
      */
      const acting = session && at.tenant
        ? await liveFor(directoryDb, session.accountId, at.tenant.tenantId, new Date().toISOString() as Instant)
        : null;
      /* ⚠️ Whose behalf it is on, for the audit. Null is the ordinary case. */
      const actingFor = acting ? acting.id : null;

      const { actor, permissions, subjectId } = opts.resolveCaller
        ? await opts.resolveCaller(session, at)
        : {
            actor: {
              userId: session?.accountId ?? null,
              tenantId: at.tenant?.tenantId ?? null,
              kind: (session ? "user" : "system") as Actor["kind"],
              /* ⚠️ Set at last. The field existed in the primitives from stage 1
                 and nothing ever wrote it, so every trail read as ordinary. */
              ...(acting ? { impersonatedBy: session!.accountId } : {}),
            },
            /*
              ⚠️ A SIGNED-IN PERSON WHO IS NOT A MEMBER HOLDS THE PERSONAL SET
              AND NOTHING ELSE. Somebody has to be able to create their first
              workspace before belonging to one, and that is the whole of what
              `access.personal` is for — an empty set there means an app where
              only an invitation can let anybody in, which is a real product.
            */
            /*
              ⚠️ THREE ANSWERS, AND THE DOOR DECIDES WHICH. Inside a workspace it
              is the membership. On the OPERATOR door there is no workspace to be
              a member of, so it is the app's `operator` role — the door itself is
              the control, exactly as it already is for every other operator-only
              behaviour. Everywhere else it is the personal set, which is what
              somebody holds before they belong to anything.

              DEFER(one-172) stage:7 — the operator door admits any signed-in
              account. An allow-list belongs here, and it is the same gap the
              door has had since it was added.
            */
            permissions: at.tenant
              /*
                ⚠️ A LIVE SUPPORT SESSION CONFERS THE FOUNDING ROLE AND NOTHING
                WIDER. An operator helping somebody needs to see what they see;
                what they must not get is a set assembled from the operator's own
                powers, which would let a support session do things no member of
                that workspace can do — and every one of them recorded against
                the workspace rather than against us.
              */
              ? acting
                ? new Set(app.access.roles[foundingRole(app) ?? ""] ?? [])
                : permissionsOf(app.access.roles, membership)
              : !session
                ? new Set<string>()
                : at.door === "admin" && app.access.roles.operator
                  ? new Set(app.access.roles.operator)
                  : new Set(app.access.personal),
            /*
              ⚠️ WHO THE CUSTOMER IS, FROM THE MANIFEST. `"member"` means the
              signed-in account; `"record"` means the membership names one. Every
              app's own resolver returned the account id, which is correct for
              the first shape and silently wrong for the second — a coach would
              resolve as their own customer and hold their client's package.
            */
            subjectId: subjectFor(app.access.customerRail, session?.accountId ?? null, membership),
          };
      /*
        ⚠️ WHETHER WE CAN CHARGE IS READ, NOT DECLARED. It was a boolean an app
        passed in, so the gate that holds an unpaid workspace to setup could say
        "we can charge" while the payment provider had no key at all — and the
        failure is not a 500, it is every workspace on a self-host stranded in
        setup over OUR misconfiguration.
      */
      const chargeable = chargeableFrom(await readAll(directoryDb));
      /*
        ⚠️ THE CATALOGUE AS IT IS ACTUALLY SOLD, NOT AS IT WAS DECLARED. An
        operator's edit that the gate never reads is a price list screen with no
        effect on anything — the plan a workspace is on would keep resolving to
        the ceilings the app shipped with, so raising a limit for a customer who
        paid for it would change nothing and the only symptom is a refusal they
        were told would not happen.
      */
      const selling = catalogueOf(app.access.plans, await planOverrides(directoryDb));
      const sub = at.tenant ? await readSubscription(regionalDb, at.tenant.tenantId) : PARKED;
      const standingState = at.tenant
        ? standingFor(sub, new Date().toISOString() as Instant, chargeable)
        : ({ standing: "active", reason: "ok" } as StandingState);
      const gate = gateFor(standingState);
      const entitlements = resolveEntitlements({
        declared: app.access.entitlements,
        plan: selling.find((p) => p.id === sub.planId) ?? null,
        overrides: sub.overrides,
        gate,
        /*
          ⚠️ THE SAME "OPEN ON OURS" THE STANDING GATE APPLIES ONE LINE ABOVE.
          With no payment provider there is no plan to buy, so the parking
          allowances would hold a workspace at one of everything with no way
          out — a punishment for OUR missing configuration. `standingFor`
          already stands down here; the allowances have to as well, or the gate
          opens onto a product that permits nothing.
        */
        floorPlan: chargeable ? null : floorPlan(selling),
      });
      /*
        ⚠️ THE SECOND RAIL RESOLVES THROUGH THE SAME WALK THE CAPABILITIES SCREEN
        READS, and it is INTERSECTED with the first — a workspace cannot sell
        what it did not itself buy, and losing a plan does not quietly rewrite
        what its customers were sold, it withholds it while the plan is gone.
      */
      const customerFlags = app.access.customerRail && subjectId && at.tenant
        ? await customerFlagsFor(regionalDb, at.tenant.tenantId, subjectId, app.access.customerFlags, entitlements, new Date().toISOString() as Instant)
        : undefined;
      /*
        ⚠️ PROVEN IS THE SESSION'S OWN AGE, AND NOTHING ELSE RECORDS IT. A session
        exists because somebody completed a ceremony, so "recently proven" and
        "recently created" are one fact — and re-proving mints a new session,
        which resets it. A second timestamp would be a copy that can disagree,
        including in the direction that says somebody proved themselves when they
        did not.
      */
      const caller: Caller = {
        permissions, customerFlags, entitlements, gate,
        provenRecently: session ? provenRecently(session, new Date().toISOString() as Instant) : false,
      };

      /*
        ⚠️ THE MEMBERSHIP KNOWS IT, so nothing has to guess. `roleOf` derives one
        from a permission set, which is a reconstruction of something the row
        already says — and a reconstruction that disagrees is a person who is an
        owner to the checklist and a reader to the shelf.

        ⚠️ RESOLVED HERE RATHER THAN AT THE DISPATCH, because the consent gate
        below needs it: which documents somebody must accept depends on what they
        are acting AS, and the same person is an owner in one workspace and
        somebody's customer in another.
      */
      /*
        ⚠️ NO MEMBERSHIP IS NO ROLE — IT IS NOT "OWNER". Falling back to owner for
        anybody signed in made every person on a door with no workspace an owner
        of nothing, and the consent gate believed it: a Kova client opening the
        account centre was told they owed the Terms of service and the data
        processing agreement — both `mustAccept: ["owner"]` — and was answered 451
        on `me.preferences.set` until they agreed to a contract between the
        platform and a studio. Measured, not reasoned about.

        ⚠️ THE OPERATOR DOOR KEEPS "OWNER", AND THAT IS A DEFERRAL RATHER THAN A
        DECISION. It is the other no-membership case, and it is a lie of the same
        kind — but both apps declare their DEPLOYMENT checklists as
        `roles: ["owner"]` on the strength of it, so correcting the runtime alone
        empties the operator's list. The manifests have to move with it.
        // DEFER(one-189) stage:7 — an operator is called `owner` on their own
        //   door, so deployment checklists and any `mustAccept` are resolved
        //   against a role they do not hold. Needs the manifests changed with it.

        Everybody else with no membership is a guest of this workspace, which is
        what they are.

        ⚠️ THIS NEVER GRANTS ANYTHING. Permission comes from `permissionsOf` and
        the membership row; the role decides which DOCUMENTS are owed and what an
        audit row says somebody was acting as. Both were wrong.
      */
      const personRole = membership?.role
        ?? opts.roleOf?.(permissions)
        /* ⚠️ THE DOOR, NOT `actor.kind`. The default `resolveCaller` never sets
             `operator` — it writes `user` or `system` — so testing the kind is a
             branch that is never taken, which is how this first read as fixed and
             emptied the operator's own checklist instead. `at.door === "admin"` is
             what the permission block twenty lines up already uses. */
        ?? (at.door === "admin" ? "owner" : "guest");

      /*
        ⚠️ THE GATE RUNS ONCE, FOR EVERY TRANSPORT, FROM HERE. A per-route check
        is one somebody forgets on the four hundredth route, and the symptom is a
        single endpoint that answers when it should not.

        `ALWAYS_ALLOWED` is not a convenience list. Identity, exit, billing,
        webhooks and health survive every rung because paying must be a way out
        rather than the only one — and a workspace whose exit route is itself
        suspended has no exit at all.
      */
      /*
        ⚠️ AN ALWAYS-ALLOWED LANE OPENS THE STANDING GATE AND NOTHING ELSE.
        Skipping `check` entirely for those lanes skips the permission,
        entitlement and customer-flag questions with it — so signing in, paying,
        leaving and every webhook would answer to anybody who asked. Standing is
        a fact about the WORKSPACE; permission is a fact about the CALLER, and
        no rung of the billing ladder has anything to say about the second.
      */
      const forGate = ALWAYS_ALLOWED.includes(laneOf(op))
        ? { ...caller, gate: { reads: true as const, writes: true, app: true } }
        : caller;
      const verdict = check(op, forGate);
      if (!verdict.allowed) return problemResponse(refusalProblem(verdict.refusal), ref);

      /*
        ⚠️ AND WHETHER THEY HAVE AGREED TO ANYTHING YET.

        `outstandingFor` was computed by `legal.list` and enforced by nothing —
        no route, no gate, no guard — so a person could use an entire product,
        forever, without accepting the terms, the privacy notice or the
        processing agreement, and the ledger would faithfully record that they
        never did. A consent ledger nothing gates records an obligation instead
        of discharging one.

        ⚠️ WRITES ONLY, AND ONLY WITH A SESSION, so the query is not on the read
        path and not on the public one. Reading is never refused for this:
        withholding somebody's own records because they have not clicked
        anything is punitive, while refusing to record NEW information about a
        person until they have been told what will be done with it is the actual
        obligation.
      */
      /* ⚠️ The lane is checked HERE as well as inside `consentGate`, and the
         duplication is deliberate: it is what keeps the directory query off
         every sign-in, every exit and every acceptance. `consentGate` still owns
         the rule, and `kernel/test/app.test.ts` covers it on its own. */
      if (op.kind === "write" && session && !CONSENT_EXEMPT_LANES.includes(laneOf(op))) {
        /*
          ⚠️ BOTH SETS, AND THE ACCOUNT'S IS THE ONE NOTHING HELD ANYBODY TO. The
          deployment's terms are owed for HAVING an account — an address, a
          passkey, a vault — so they are asked of `ACCOUNT_HOLDER` rather than of
          a role inside a product, and a gate reading only the app's documents
          enforced every product's terms and none of the platform's. That is the
          shape the consent gate itself exists to prevent, one level up.
        */
        const accepted = await consentsOf(directoryDb, session.accountId);
        const outstanding = [
          ...outstandingFor(opts.deployment?.legal ?? [], ACCOUNT_HOLDER, accepted),
          ...outstandingFor(app.governance.legal, personRole, accepted),
        ];
        const consent = consentGate({ kind: "write", lane: laneOf(op), outstanding: outstanding.map((d) => d.id) });
        if (!consent.allowed) {
          return problemResponse(
            {
              ...problems["platform.consent_required"]!, code: "platform.consent_required",
              meta: { documents: consent.documents.join(", ") },
            } as never,
            ref,
          );
        }
      }

      /*
        ⚠️ HOW OFTEN, WHERE THE OPERATION SAID SO. Declared since stage 0 and
        counted by nothing, so every `rateLimit` in every manifest was a ceiling
        with no counter — a field an app fills in and believes.

        ⚠️ COUNTED BEFORE THE HANDLER AND NEVER GIVEN BACK. A limit that only
        counts successes is one somebody exhausts for free by sending requests
        that fail, which for the operations worth limiting is the whole of it.
      */
      if (op.rateLimit) {
        const verdict = await countRequest(regionalDb, op.id, op.rateLimit, {
          actorId: session?.accountId ?? null,
          tenantId: at.tenant?.tenantId ?? null,
          ip: request.headers.get("cf-connecting-ip"),
        }, new Date().toISOString() as Instant);
        if (!verdict.allowed) {
          return problemResponse(
            { ...problems["platform.too_many"]!, code: "platform.too_many", meta: { limit: String(verdict.max), used: String(verdict.used) } } as never,
            ref,
          );
        }
      }

      /*
        ⚠️ AND THE CEILING, the same way. Counting needs a query, so the gate
        reports the obligation rather than discharging it — and a returned
        obligation nobody acts on reads as though the limit were enforced.
      */
      if (verdict.quotaRequired && at.tenant) {
        const key = verdict.quotaRequired.key;
        const count = counters.get(key);
        const used = count
          ? await count(regionalDb, at.tenant.tenantId)
          : key === SEATS_ENTITLEMENT
            ? await seatsUsed(regionalDb, at.tenant.tenantId as TenantId, app.access.seats.counts)
            : await opts.countQuota!(key, regionalDb, at.tenant.tenantId);
        if (!withinQuota(verdict.quotaRequired.allowance, used)) {
          return problemResponse({ ...QUOTA_REACHED, meta: { limit: String(verdict.quotaRequired.allowance), used: String(used) } }, ref);
        }
      }

      /*
        ⚠️ THE BODY IS READ AS TEXT AND PARSED FROM THAT, NEVER READ TWICE. A
        signed webhook is verified over the EXACT bytes that were sent, so a
        handler that re-serialises a parsed object is verifying a different
        document — key order, number formatting and unicode escaping are all free
        to differ, and the failure is intermittent rather than total.
      */
      /*
        ⚠️ AN UPLOAD IS READ AS BYTES AND NEVER AS TEXT. Decoding a photograph as
        UTF-8 replaces every invalid sequence with a replacement character, and
        re-encoding it produces a file that is the right length, the right type,
        and corrupt — with nothing anywhere reporting a failure.

        Everything ABOUT the file travels in the query string, so the body stays
        exactly what the browser sent and progress can be reported on it.
      */
      const isUpload = op.id === "file.upload";
      const rawBody = isUpload ? await request.arrayBuffer() : new ArrayBuffer(0);
      const bodyText = request.method === "GET" || isUpload ? "" : await request.text();
      const raw = request.method === "GET" || isUpload
        ? fromQuery(op.input.json, Object.fromEntries(url.searchParams))
        : ((): unknown => { try { return JSON.parse(bodyText || "{}"); } catch { return {}; } })();

      /*
        ⚠️ PARSED AT THE BOUNDARY, ONCE, BEFORE THE HANDLER RUNS. A type
        assertion compiles, reads like validation, and lets a number reach a TEXT
        column — where SQLite stores it happily, because its types are per value.
        The row is wrong, nothing throws, and it surfaces later as a rendering
        bug in a screen nobody associates with the write.

        The issues come back per FIELD, so a form puts each message where it
        belongs rather than showing one sentence about the whole request.
      */
      const parsed = op.input.parse(raw);
      if (!parsed.ok) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.issues) fields[issue.path] = issue.message;
        return problemResponse({ ...PLATFORM_PROBLEMS["platform.invalid"], code: "platform.invalid", fields }, ref);
      }
      const input = parsed.value;

      /*
        ⚠️ THE ROW-LEVEL OBLIGATION, DISCHARGED. `check` reports it rather than
        performing it, because performing it needs the parsed input and the gate
        is pure so a whole tool catalogue can be filtered without touching a
        store. A returned obligation nobody acts on is worse than one that was
        never mentioned: the code reads as though the narrowing happens.

        ⚠️ THE RULE IS THE ONE A SUBJECT-SCOPED COLLECTION ALREADY USES. A caller
        who IS a customer may address only themselves; a caller who is not one is
        staff, and their reach is decided by their permissions. Without it, any
        customer holding a read permission could name somebody else's id and be
        answered — which is the whole of what row scope exists to stop.
      */
      if (verdict.scopeRequired && op.scope && subjectId) {
        const required = op.scope(input as never);
        const mine = Object.values(required).every((value) => value === subjectId);
        if (!mine) return problemResponse(refusalProblem("scope"), ref);
      }


      /*
        ⚠️ ONE ROLE, RESOLVED ONCE, FOR EVERY SURFACE THAT IS PER-PERSON. The
        checklist, the shelf and a milestone's announcement all filter by it, and
        three separate resolutions is how a person comes to be an owner to one
        and a reader to the next.
      */
      /*
        ⚠️ THE DEVICE SAYS WHERE IT IS STANDING; THE MANIFEST IS THE FALLBACK.
        A day boundary is the one thing a streak is made of, and UTC is nobody's
        day — see `dayIn`. An absent or unknown header degrades to the app's
        declared zone rather than to a refusal.
      */
      const zone = request.headers.get("x-one-time-zone") || app.format.timeZone;

      /*
        ⚠️ ONE DISPATCH PATH FOR BOTH TRANSPORTS. A tool call runs the same
        handler, behind the same gate, with the same context — the only
        difference is the actor's kind and what the audit records. A second
        dispatch path is how an agent ends up able to do something the route
        cannot, and the divergence is invisible until somebody looks for it.
      */
      /**
       * ⚠️ RAISED BY THE PLATFORM, NEVER DECLARED BY AN APP. A celebration
       * belongs to a milestone — a rule over an event, earned once per person —
       * and `momentProblems` refuses an operation that tries to declare one.
       */
      let celebrated: Raised | undefined;

      /**
       * How this workspace talks — its rephrasings and its sign-off.
       *
       * ⚠️ A WORKSPACE THAT HAS CHANGED NOTHING COSTS ONE EMPTY QUERY AND GETS
       * THE PLATFORM'S WORDS, which is the case for almost every dispatch. The
       * alternative — resolving it up front on every request — would read a
       * table on requests that raise nothing at all.
       */
      const theirVoice = async (tenantId: string) => {
        const [wording, values] = await Promise.all([
          wordingFor(regionalDb, tenantId).catch(() => ({})),
          readSettings(regionalDb, settingsFor(app), tenantId)
            .catch(() => ({} as Readonly<Record<string, string | number | boolean>>)),
        ]);
        return { wording, signature: String(values["mail.signature"] ?? "") };
      };

      const run = async (target: AnyOperation, payload: unknown, via: AuditEntry["via"]) => {
        /*
          ⚠️ A REPLAY IS ANSWERED BEFORE ANYTHING ELSE HAPPENS — before the audit
          entry, before the handler, before the dispatch. A phone that queued a
          write in a basement cannot know whether the first attempt landed (the
          ANSWER is what went missing, not the request), so it asks again; and a
          second audit row, a second notification and a second set are three
          things that look like the person did more than they did.
        */
        // vocabulary-exempt: the HTTP caller, not somebody's customer — the
        // mode's own name, declared in the kernel with the same exemption.
        const replayKey = target.idempotency.mode === "client-supplied"
          ? replayKeyOf(request.headers.get(REPLAY_HEADER))
          : "";
        const replayActor = session?.accountId ?? "anonymous";
        if (replayKey && at.tenant) {
          const before = await replayed(regionalDb, at.tenant.tenantId, replayActor, target.id, replayKey);
          if (before) return before.answer;
        }

        const entry = auditFor(target, payload, via);
        if (entry) audit.push(entry);
        const raw = await target.handler(ctx as never, payload as never);
        /*
          ⚠️ THE HANDLER WITHHOLDS AND THE PLATFORM REPORTS, so a caller can tell
          a lens they did not buy from one that is empty. Merged rather than
          returned by the handler, because an operation that had to remember to
          report it is one that will not — and then a thinner payload and an
          empty one are the same answer again.
        */
        const result = target.shape
          ? { ...(raw as Record<string, unknown>), included: ctx.included }
          : raw;

        /*
          ⚠️ THE INBOX IS WRITTEN FROM `emits`, AFTER THE HANDLER SUCCEEDS, AND
          NEVER BY THE HANDLER ITSELF. A handler that sends its own notification
          can forget one, can send something different from what the webhook
          catalogue advertises, and puts its copy at the call site where nothing
          can translate or check it. Here one declaration produces the inbox row,
          the webhook event and the audit entry.

          ⚠️ AND A FAILED DISPATCH NEVER FAILS THE OPERATION. The write already
          happened and was already answered; throwing here would report a
          successful change as an error and invite a retry that duplicates it.
        */
        if (target.emits?.length && at.tenant) {
          const audience = await audienceOf(at.tenant.tenantId as TenantId, regionalDb).catch(() => []);
          /*
            ⚠️ READ ONCE FOR THE WHOLE DISPATCH, not once per person. A workspace
            writing to eleven people is one sentence eleven times, and a lookup
            inside the loop would be its whole copy read eleven times to send it.
          */
          const voice = await theirVoice(at.tenant.tenantId);
          for (const type of target.emits) {
            await dispatch({
              db: regionalDb, registry: app.notifications, tenantId: at.tenant.tenantId,
              type, audience,
              values: interpolatable(payload, result),
              at: new Date().toISOString() as Instant,
              ...voice,
              send: deliver,
            }).catch(() => undefined);
          }
        }

        /*
          ⚠️ RECOGNITION READS THE SAME `emits`, AND ONLY FOR A PERSON. There is
          no second thing to instrument and nothing for a handler to remember —
          a milestone is a rule over an event the manifest already declares. A
          system actor earns nothing: a sweep that closed somebody's month is not
          an achievement, and crediting the last person to touch the row would
          hand it to somebody who was asleep.

          ⚠️ AND IT NEVER FAILS THE OPERATION. The write already happened; a
          badge is the least important thing in this function.
        */
        const earner = earnerOf(actor, session);
        if (target.emits?.length && at.tenant && earner && Object.keys(app.milestones ?? {}).length) {
          const day = dayIn(new Date().toISOString() as Instant, zone);
          for (const event of target.emits) {
            const earned = await recognise({
              db: regionalDb, registry: app.milestones ?? {}, tenantId: at.tenant.tenantId,
              userId: earner, role: personRole, event, today: day,
              at: new Date().toISOString() as Instant,
            }).catch(() => [] as readonly string[]);
            /*
              ⚠️ EARNING SOMETHING PUNCTUATES THE RESPONSE THAT CAUSED IT. The
              inbox row is the record; the moment is the acknowledgement, in the
              place the person is actually looking — and it REPLACES the
              operation's own "Saved", because "saved" is not news standing next
              to "you earned something". `strongest` is what decides, once.
            */
            const first = earned[0];
            if (first) celebrated = { moment: "celebrate", message: (app.milestones ?? {})[first]!.title };
            const voice = await theirVoice(at.tenant.tenantId);
            for (const id of earned) {
              await dispatch({
                db: regionalDb, registry: app.notifications, tenantId: at.tenant.tenantId,
                type: MILESTONE_EARNED,
                audience: [{ userId: earner, role: personRole }],
                values: { milestone: id, title: (app.milestones ?? {})[id]!.title },
                at: new Date().toISOString() as Instant,
                ...voice,
                send: deliver,
              }).catch(() => undefined);
            }
          }
        }
        /*
          ⚠️ REMEMBERED ONLY AFTER THE HANDLER SUCCEEDED. Recording the key first
          would turn a write that failed halfway into one nobody can retry: the
          client asks again with the same key and is told, truthfully, that we
          have seen it, and falsely, that it worked.
        */
        if (replayKey && at.tenant) {
          await remember(
            regionalDb, at.tenant.tenantId, replayActor, target.id, replayKey,
            result, new Date().toISOString() as Instant,
          );
        }
        return result;
      };
      const audit: AuditEntry[] = [];

      const ctx: Ctx<B> & DirectoryCarrier & PlatformCarrier & ToolCarrier & CommerceCarrier & InboxCarrier & DataCarrier & FilesCarrier & GenerationCarrier & OperatorCarrier & ConfigCarrier & SettingsCarrier & LookupCarrier & GuideCarrier & MilestoneCarrier & MemberCarrier & FounderCarrier & ReferenceCarrier & VaultCarrier = {
        [CONFIG]: {
          own: directoryDb,
          /*
            ⚠️ THE SAME TABLE IN ANOTHER DATABASE, bound by the same id in every
            app. Null where a deployment binds none, which resolves to this app's
            own values and nothing else.
          */
          shared: sharedConfigDb,
          registry: opts.config ?? {},
          /*
            ⚠️ THE NETWORK, INJECTED. One file reaches it, and a test supplies
            its own — so nothing in a suite can reach a real provider by
            accident, and the send path is exercised rather than stubbed out.
          */
          deliver: opts.deliver ?? deliverVia(env, opts.sendEmailBinding),
        },
        [OPERATOR]: {
          global: directoryDb,
          /*
            ⚠️ ANOTHER WORKSPACE'S REGION, BOOTED. An operator acts from one door
            on workspaces in every region, and a region nobody has visited yet
            has no tables until something opens it.
          */
          regionalIn: async (region) => {
            const there = regional(env)(region as ResolvedRegion);
            if (opts.onBoot) await once(region, () => opts.onBoot!.region(there, region));
            return there.db as SqlHandle;
          },
          /* ⚠️ Every region, because holding an existing subscriber at what they
             were sold must reach all of them — a snapshot written only where the
             operator happens to be is a promise kept for some customers. */
          regions: app.tenancy.regions,
          operatorId: session?.accountId ?? null,
          /* ⚠️ The manifest's ceiling, read here rather than guessed at the
             call site — a support session bounded by a number nobody declared
             is one bounded by whatever somebody typed. */
          maxMinutes: app.governance.impersonation.maxMinutes,
          announce: app.governance.impersonation.announce,
          announceTo: async (tenantId, reason) => {
            /* ⚠️ The workspace's OWN region, resolved from the directory. An
               operator acts from one door on workspaces in every region, so the
               caller's own store is the wrong one for all but one of them. */
            const place = await directoryDb.first<{ region: string }>(
              `SELECT region FROM tenant_directory WHERE tenant_id = ?`, tenantId,
            ).catch(() => null);
            if (!place) return;
            const bound = regional(env)(place.region as ResolvedRegion);
            if (opts.onBoot) await once(place.region, () => opts.onBoot!.region(bound, place.region as RegionId));
            const there = bound.db as SqlHandle;
            await dispatch({
              db: there, registry: app.notifications, tenantId,
              type: SUPPORT_SESSION,
              audience: await audienceOf(tenantId as TenantId, there).catch(() => []),
              values: { reason },
              at: new Date().toISOString() as Instant,
              send: deliver,
            }).catch(() => undefined);
          },
          actorId: actor.userId ?? "system",
        },
        [GENERATION]: {
          db: regionalDb,
          /*
            ⚠️ THE DEPLOYMENT'S OWN RATES, READ LAZILY. Only a request that
            actually generates pays for the query — and the shared store is where
            they live, because a price change is not a deploy.
          */
          rates: () => readRates(sharedConfigDb),
          /*
            ⚠️ THE WORKSPACE'S OWN PICKS AND THE OPERATOR'S OWN TOGGLES, both
            read lazily for the same reason the rates are: a request that never
            generates should not pay for either query.

            They are separate because they are separate people's decisions. The
            choice is a row in the tenant's own region; the disabled list is this
            deployment's configuration, and it is deliberately NOT shared —
            turning a model off for one product must not take it away from the
            others.
          */
          chosen: () => choicesOf(regionalDb, at.tenant?.tenantId ?? ""),
          disabled: async () => disabledFrom((await readAll(directoryDb))["ai.models.disabled"]),
          /*
            ⚠️ NULL WHERE NOTHING IS BOUND. `generate` refuses on it; nothing
            anywhere substitutes an answer.
          */
          inference: (bind[opts.inferenceBinding ?? "ai"] as InferenceHandle | undefined) ?? null,
          tenantId: at.tenant?.tenantId ?? "",
          actorId: actor.userId ?? "system",
        },
        [INBOX]: { db: regionalDb, tenantId: at.tenant?.tenantId ?? "", userId: session?.accountId ?? null },
        [LOOKUP]: {
          services: app.services ?? {},
          /* ⚠️ Read lazily: only a request that actually looks something up pays
             for the query. */
          values: () => readAll(sharedConfigDb ?? directoryDb),
          /*
            ⚠️ THE NETWORK, INJECTED — the same shape as the mail lane. Nothing
            in a suite can reach a real service by accident, and the path is
            exercised rather than stubbed out.
          */
          fetcher: opts.lookup ?? ((url, init) => fetch(url, init as RequestInit)),
        },
        /*
          ⚠️ THE ROLE TRAVELS, because which documents somebody must accept
          depends on what they are acting as here rather than on who they are.
        */
        [REFERENCE]: {
          directory: directoryDb, regional: regionalDb,
          tenantId: at.tenant?.tenantId ?? "", session, role: personRole,
          deployment: opts.deployment ?? null,
          /* ⚠️ THE SAME WALK THE VAULT'S SURFACE USES, and deliberately the same
             one: both screens answer "everywhere I belong", and two derivations
             of that is two answers to the question the account centre exists to
             ask. */
          workspaces: async () => {
            if (!session) return [];
            const rows = await directoryDb.all<{ tenant_id: string; slug: string; app_id: string | null }>(
              `SELECT tenant_id, slug, app_id FROM tenant_directory ORDER BY slug LIMIT 200`,
            ).catch(() => []);
            const mine = await platform.mineIn(rows.map((r) => r.tenant_id));
            return rows
              .filter((r) => mine.has(r.tenant_id) && r.app_id)
              .map((r) => ({ appId: r.app_id!, tenantId: r.tenant_id, name: r.slug, role: mine.get(r.tenant_id)! }));
          },
        },
        /*
          ⚠️ THE DIRECTORY, NEVER THE REGIONAL STORE. A vault fact belongs to
          the ACCOUNT — it outlives every workspace the person is in — and a
          regional copy would be taken away by leaving the workspace that
          happened to ask for it first.

          ⚠️ AND `tenantId` IS NULL RATHER THAN "" ON A TENANTLESS DOOR. The
          empty string is a real workspace id to a grant lookup, so an
          app-wide grant (`tenantId: null`) and a request from the account
          centre would resolve as two different scopes.
        */
        [VAULT]: {
          directory: directoryDb,
          session,
          appId: app.id,
          tenantId: at.tenant?.tenantId ?? null,
          now: new Date().toISOString() as Instant,
          today: dayIn(new Date().toISOString() as Instant, zone),
          /*
            ⚠️ THE SAME TWO-STORE WALK `me.workspaces` DOES, and reusing it is the
            point: the directory is global, memberships are regional, and a second
            implementation of "which workspaces are mine" is two answers that
            eventually disagree about somebody's.

            ⚠️ AN UNATTRIBUTED ROW IS DROPPED. A directory entry written before
            apps were recorded belongs to no product, and the vault would have
            nothing to match its declaration against — so it is left out rather
            than guessed at, which is the safe direction on a screen about
            disclosure.
          */
          workspaces: async () => {
            if (!session) return [];
            const rows = await directoryDb.all<{ tenant_id: string; slug: string; app_id: string | null }>(
              `SELECT tenant_id, slug, app_id FROM tenant_directory ORDER BY slug LIMIT 200`,
            ).catch(() => []);
            const mine = await platform.mineIn(rows.map((r) => r.tenant_id));
            return rows
              .filter((r) => mine.has(r.tenant_id) && r.app_id)
              .map((r) => ({ appId: r.app_id!, tenantId: r.tenant_id, name: r.slug, role: mine.get(r.tenant_id)! }));
          },
        },
        [SETTINGS]: {
          db: regionalDb,
          /* ⚠️ The branding copy and the domain claims are looked up before a
             region is known, so they live beside the directory. */
          directory: directoryDb,
          tenantId: at.tenant?.tenantId ?? "",
          isOperator: actor.kind === "operator",
        },
        [FILES]: {
          db: regionalDb,
          objects: bind[opts.objectsBinding ?? "media"] as ObjectHandle,
          tenantId: at.tenant?.tenantId ?? "",
          actorId: actor.userId ?? "system",
          body: rawBody,
          /*
            ⚠️ THE TYPE COMES FROM THE HEADER AND IS TRIMMED OF ITS PARAMETERS.
            A browser sends `image/jpeg` and a form sends
            `multipart/form-data; boundary=…`; comparing the whole header against
            a declared list refuses the first the day somebody adds a charset.
          */
          contentType: (request.headers.get("content-type") ?? "").split(";")[0]!.trim(),
          fileName: url.searchParams.get("name") ?? "",
          purpose: url.searchParams.get("purpose") ?? "",
          allowance: allowanceFrom(caller.entitlements[STORAGE_ENTITLEMENT]),
        },
        /*
          ⚠️ THE FACTS ARE READ LAZILY, because the checklist is one surface of
          many and three of these are queries into stores this request has not
          otherwise opened. A person past their first week never sees them.
        */
        [GUIDE]: {
          db: regionalDb,
          tenantId: at.tenant?.tenantId ?? "",
          userId: session?.accountId ?? "",
          role: personRole,
          facts: async () => ({
            plan_chosen: Boolean(sub.planId ?? sub.pendingPlanId),
            passkey_registered: session ? (await identity.credentials(session.accountId).catch(() => [])).length > 0 : false,
            file_stored: ((await regionalDb.first<{ n: number }>(
              `SELECT COUNT(*) AS n FROM media WHERE tenant_id = ?`, at.tenant?.tenantId ?? "",
            ).catch(() => null))?.n ?? 0) > 0,
            colleague_invited: (await audienceOf((at.tenant?.tenantId ?? "") as TenantId, regionalDb).catch(() => [])).length > 1,
            /*
              ⚠️ THE DEPLOYMENT'S, NOT A WORKSPACE'S. Read from the same flag the
              standing gate reads, so "we cannot take money" is one fact with one
              source — a second copy is how a wizard asks an operator to
              configure something the gate already believes is configured.
            */
            payments_configured: chargeable,
          }),
          ...(subjectId ? { subjectId } : {}),
          /*
            ⚠️ THE OPERATOR DOOR ASKS ABOUT THE DEPLOYMENT. It is the only place a
            deployment step can be acted on, and showing one inside a workspace is
            a task nobody there can do and would not understand.
          */
          setup: at.door === "admin" ? "deployment" : "workspace",
        },
        [MEMBERS]: {
          db: regionalDb,
          tenantId: (at.tenant?.tenantId ?? "") as TenantId,
          userId: session?.accountId ?? null,
          permissions: caller.permissions,
          /*
            ⚠️ THE CEILING COMES FROM THE RESOLVED WALK, not from the plan row. A
            grandfathered or operator-adjusted seat count is the whole reason
            that walk exists, and reading the plan here would quietly ignore it.
          */
          seatsAllowed: caller.entitlements[SEATS_ENTITLEMENT] ?? 0,
        },
        [MILESTONES]: {
          db: regionalDb,
          tenantId: at.tenant?.tenantId ?? "",
          userId: session?.accountId ?? "",
          role: personRole,
        },
        [DATA]: {
          db: regionalDb,
          global: directoryDb,
          tenantId: at.tenant?.tenantId ?? "",
          modules: opts.regionalModules ?? [],
          keeping: keptBy(app.collections),
          auditRetentionDays: app.governance.auditRetentionDays,
          isOperator: at.door === "admin",
          /* ⚠️ The same store the uploads went to, so erasure reaches the bytes. */
          objects: (bind[opts.objectsBinding ?? "media"] as ObjectHandle | undefined) ?? null,
        },
        [PLATFORM]: platform,
        [FOUNDER]: {
          sessionsIn: async (region) => {
            const there = regional(env)(region as ResolvedRegion);
            if (opts.onBoot) await once(region, () => opts.onBoot!.region(there, region));
            return there[opts.sessionsBinding] as SqlHandle;
          },
          email: session?.snapshot.email ?? null,
          userId: session?.accountId ?? null,
        },
        [COMMERCE]: {
          db: regionalDb,
          tenantId: at.tenant?.tenantId ?? "",
          chargeable,
          /* ⚠️ The same list the gate resolved against. Two reads is how a shelf
             comes to show a price the gate does not enforce. */
          selling,
          /* ⚠️ Read from config, so turning billing on is a setting rather than
             a deploy — and absent is reported rather than linked to. */
          portalUrl: (await readAll(directoryDb))["billing.portal_url"] ?? null,
          entitlements: caller.entitlements,
          global: directoryDb,
          /*
            ⚠️ A WEBHOOK WRITES TO A REGION THE REQUEST DID NOT ARRIVE IN. The
            event names a customer, the global store says which workspace, and
            that workspace's data may be on another continent — so the handler is
            given a way to reach it rather than the one handle the host implied.
          */
          forTenant: async (tenantId: string) => {
            const row = await directoryDb.first<{ region: string }>(`SELECT region FROM tenant_directory WHERE tenant_id = ?`, tenantId);
            if (!row) return null;
            return regional(env)(row.region as ResolvedRegion)[opts.sessionsBinding] as SqlHandle;
          },
          currentPlanId: sub.planId ?? null,
          /*
            ⚠️ THE SAME COUNTERS THE QUOTA GATE USES, handed over rather than
            re-derived. A storefront that counted its own way would promise a
            downgrade the very next write then refuses.
          */
          usage: (key: string) => {
            const count = counters.get(key);
            return count && at.tenant ? count(regionalDb, at.tenant.tenantId) : null;
          },
          signature: request.headers.get("x-provider-signature") ?? "",
          body: bodyText,
          webhookSecret: opts.webhookSecretVar ? secretFor(env, opts.webhookSecretVar) : "",
        },
        [TOOLS]: {
          operations: [...byPath.values()],
          caller,
          /*
            ⚠️ THE ACTOR BECOMES `tool`, WHICH IS VISIBLE AND NON-PRIVILEGING. An
            operation may know it is being driven by a model — worth recording,
            worth showing on an activity log — and that knowledge changes nothing
            about what it is ALLOWED to do, because the gate already ran on the
            same caller.
          */
          dispatch: (target, payload) => run(target, payload, "tool"),
        },
        /*
          ⚠️ The directory rides on a SYMBOL that `Ctx` does not declare, so a
          platform operation can reach it and an app's cannot — including by
          casting, since the symbol is not exported from the contract layer.
        */
        [DIRECTORY]: directoryDb,
        bind,
        actor,
        tenantId: (at.tenant?.tenantId ?? null) as TenantId,
        ...(subjectId ? { subjectId } : {}),
        /*
          ⚠️ RESOLVED BY THE GATE, HANDED TO THE HANDLER, AND MERGED BACK INTO
          THE ANSWER. `check` has always computed this and, until now, nothing
          read it — the shape mechanism was declared, resolved, and reachable by
          nobody, which is the exact failure this platform is a reaction to.
        */
        included: verdict.included ?? {},
        region: at.region,
        /*
          ⚠️ THE SAME SET THE GATE JUDGED WITH. Recomputing it here from roles
          would be a second resolver, and the two would agree until one of them
          learned about impersonation or a customer rail and the other did not.
        */
        holds: (permission: string) => caller.permissions.has(permission),
        now: () => new Date().toISOString() as Instant,
        /* ⚠️ The manifest's own boundary, so two weekly reads in one product
           cannot disagree about which day a week starts on. */
        weekOf: (day: string) => weekStarting(day, app.format.weekStart),
        fail: (code, meta) => { throw new DeclaredFailure(code, meta); },
      };

      try {
        const out = await run(op, input, "http");

        /*
          ⚠️ WRITTEN AFTER THE OPERATION SUCCEEDED, and this is where the entries
          finally go. They were built, pushed into an array and never read —
          every operator action, every money movement and every declared
          `audit:` in every app, recorded nowhere at all.

          A failure to record is not a failure of the operation: the change has
          already happened and been answered, so throwing here would report a
          completed action as an error and invite a retry that does it twice.
        */
        if (audit.length && at.tenant) {
          await recordAudit(
            regionalDb, at.tenant.tenantId, session?.accountId ?? null, actingFor,
            audit, new Date().toISOString() as Instant,
          );
        }

        /*
          ⚠️ A FILE READ ANSWERS WITH THE BYTES, NOT WITH JSON ABOUT THEM. An
          envelope means base64, which is a third larger, cannot be streamed and
          cannot be put in an `<img>` — so every consumer decodes it by hand and
          one of them gets it wrong.

          It is still an OPERATION: the same gates, the same row scope, the same
          audit. Only the envelope differs.
        */
        if (op.id === "file.read" && at.tenant) {
          const found = await fetchMedia(regionalDb, bind[opts.objectsBinding ?? "media"] as ObjectHandle, at.tenant.tenantId, (input as { id: string }).id);
          if (found) {
            const bytes = new Response(found.body, {
              headers: {
                "content-type": found.row.contentType,
                /* ⚠️ PRIVATE. A shared cache holding one workspace's photograph
                   is the one place a caching header is a disclosure. */
                "cache-control": "private, max-age=3600",
                "content-disposition": `inline; filename="${found.row.name.replace(/["\\]/g, "")}"`,
              },
            });
            for (const c of cookies) bytes.headers.append("set-cookie", c);
            return bytes;
          }
        }

        const res = Response.json(out);
        for (const c of cookies) res.headers.append("set-cookie", c);
        /*
          ⚠️ THE OUTCOME TRAVELS IN A HEADER, AND THE BODY STAYS THE DECLARED
          OUTPUT. Every operation declares an `output` shape; the API document,
          the typed client and every test are written against it — so wrapping
          the body in `{ data, outcome }` would make all three describe a shape
          the manifest does not mention.

          It is presentation metadata about the response rather than part of the
          resource, which is the same reason `Content-Disposition` is a header.

          ⚠️ AND IT WAS DECLARED EVERYWHERE AND DELIVERED NOWHERE. Twelve
          operations in this runtime carry an `outcome` and not one of them
          reached a client — a mechanism with no surface, which is the failure
          this platform was started over, sitting inside the platform itself.
        */
        const punctuation = outcomeHeader(op.outcome, celebrated);
        if (punctuation) res.headers.set(OUTCOME_HEADER, punctuation);
        return res;
      } catch (e) {
        if (e instanceof DeclaredFailure) {
          const def = problems[e.code];
          if (!def) return problemResponse(UNAVAILABLE, ref);
          return problemResponse(
            {
              code: e.code, status: def.status, title: def.title, retryable: def.retryable,
              /* ⚠️ Withheld rather than rendered with a hole in it. See `detailFor`. */
              ...((() => { const d = detailFor(def, e.meta); return d ? { detail: d } : {}; })()),
              ...(e.meta ? { meta: e.meta } : {}),
              ...(def.help ? { help: def.help } : {}),
            },
            ref,
          );
        }
        /*
          ⚠️ AN UNRECOGNISED FAILURE IS NOT A CATEGORY TO PASS THROUGH. Whatever
          threw may carry a model name, a quota internal, an account id or a
          slice of a prompt — all written for us, none written for a customer.
          It becomes `platform.unavailable` with a ref, and the text goes to the
          log where the ref can find it.
        */
        console.error(ref, e);
        return problemResponse(UNAVAILABLE, ref);
      }
    },
  };
}

export class DeclaredFailure extends Error {
  constructor(readonly code: string, readonly meta?: Record<string, string | number | boolean>) {
    super(code);
    this.name = "DeclaredFailure";
  }
}

/*
  ⚠️ A REFUSAL IS ANSWERED IN THE WORDS OF THE THING THAT REFUSED IT. Standing is
  about the workspace, proof is about the person holding the cookie, and
  permission is about the role — three different problems with three different
  ways out, and one 403 for all of them is copy that is wrong for two.
*/
const refusalProblem = (refusal: string): Omit<Problem, "ref"> =>
  refusal === "standing"
    ? { code: "platform.read_only", status: 402, title: "This workspace is read-only", retryable: false }
    : refusal === "proof"
      /* ⚠️ 401, NOT 403, BECAUSE THE ANSWER CHANGES. A client reading 403 has no
         reason to offer the one thing that resolves this, which is proving it is
         you again — and on a passkey that is a single tap. */
      ? {
          code: "platform.proof_required", status: 401, title: "Confirm it is you",
          detail: "Sign in again to continue. It takes one tap with a passkey.", retryable: false,
        }
      : { code: "platform.forbidden", status: 403, title: "You don't have access to this", retryable: false };


