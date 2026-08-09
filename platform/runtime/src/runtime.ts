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
  ProblemCatalog, RegionId, Resolved, ResolvedBindings, ResolvedRegion, Session, SqlHandle, StandingState, TenantId,
} from "@one/kernel";
import {
  ALWAYS_ALLOWED, assertComposable, auditFor, check, cookieDomainFor, gateFor, laneOf, PLATFORM_PROBLEMS,
  fromQuery, relyingPartyFor, resolveEntitlements, resolveRequest, routeFor, tableNameFor, validateSession, withinQuota,
} from "@one/kernel";
import { bindingsFor, globalSql, secretFor, type RawEnv } from "./env.js";
import { COMMERCE, commerceOperations, customerOperations, providerOperations, type CommerceCarrier } from "./commerce-ops.js";
import { INBOX, inboxOperations, type InboxCarrier } from "./inbox-ops.js";
import { dispatch, interpolatable, type Delivery } from "./inbox.js";
import { customerFlagsFor, PARKED, readSubscription, standingFor } from "./commerce.js";
import { sqlDirectory } from "./directory.js";
import { collectionOperations } from "./collection-ops.js";
import { DIRECTORY, TOOLS, platformOperations, toolOperations, type DirectoryCarrier, type ToolCarrier } from "./platform-ops.js";
import { identityOperations, PLATFORM, type PlatformCarrier, type PlatformDeps } from "./identity-ops.js";
import { identityStore, readCookie, SESSION_COOKIE, sessionStore } from "./identity.js";

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
  /** The platform owns the code; an app owns how it travels. */
  deliverCode(email: string, code: string): Promise<void>;
  /**
   * What this caller may do, given who they are.
   *
   * ⚠️ IDENTITY IS NOT AUTHORIZATION. The platform answers "who is this" from a
   * session; "what may they do here" is a question about a membership in one
   * tenant of one app, and it stays the app's. Handing the resolved account in
   * rather than letting an app read the cookie is what keeps the session format
   * — and its validation — in one place.
   *
   * ⚠️ IT RETURNS PERMISSIONS, NEVER ENTITLEMENTS OR A GATE. What a workspace
   * bought and where it stands on the payment ladder are the PLATFORM's answers,
   * resolved from the subscription row below — because an app that assembled its
   * own `Caller` could hand the gate a set it made up, and the one that did
   * handed it every declared key unconditionally. There is no honest reason for
   * an app to be able to widen its own entitlements at the door.
   */
  resolveCaller(session: Session | null, at: Resolved): Promise<{
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
  readonly chargeable?: boolean;
  /**
   * How to count what a key's ceiling applies to, where a collection cannot.
   *
   * ⚠️ SEATS ARE THE CASE THIS EXISTS FOR. A collection's quota is counted from
   * its own table by the platform; a seat is a membership row in whatever the
   * app calls its roster, and no framework can know which of those rows count.
   */
  countQuota?(key: string, db: SqlHandle, tenantId: string): Promise<number>;
  /**
   * Who is in this workspace, and in what role.
   *
   * ⚠️ THE PLATFORM DECIDES WHETHER TO TELL SOMEBODY; THE APP SAYS WHO THERE IS.
   * A roster is the one thing a framework genuinely cannot know — in one product
   * it is a membership table, in another every signed-in account. Absent means
   * notifications are recorded nowhere, which is honest for an app with no
   * roster and visible in the tests rather than silently empty.
   */
  audienceFor?(tenantId: string, db: SqlHandle): Promise<readonly { readonly userId: string; readonly role: string }[]>;
  /** How an interruption travels. The DECISION is the platform's; the sending is not. */
  send?(delivery: Delivery): Promise<void>;
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
  for (const op of [...platformOperations(app), ...identityOperations(app), ...commerceOperations(app), ...customerOperations(app), ...providerOperations(app), ...inboxOperations(app), ...toolOperations()]) byPath.set(routeFor(op).path, op);

  /*
    ⚠️ A COLLECTION'S OPERATIONS ARE DERIVED HERE, NOT BY THE APP. Leaving it to
    an app makes "declare a collection and forget to mount it" expressible — a
    table applied, rows written by some other path, and no route to reach any of
    it, with every suite green. That is the exact failure this platform was
    started over, and here it cannot be written.
  */
  for (const spec of app.collections) {
    for (const op of collectionOperations(spec)) byPath.set(routeFor(op).path, op);
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
    directoryRegion: app.identity.directoryRegion,
  };
  const regional = (env: RawEnv) => bindingsFor(app.bindings, env, { defaultRegion: app.tenancy.defaultRegion });

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
  for (const op of byPath.values()) {
    if (op.quota && !counters.has(op.quota) && !opts.countQuota) {
      throw new Error(`${app.id}: "${op.id}" counts against "${op.quota}", which nothing can count — declare it on a collection or supply countQuota.`);
    }
  }

  const booted = new Map<string, Promise<void>>();
  const once = (key: string, run: () => Promise<void>) => {
    const existing = booted.get(key);
    if (existing) return existing;
    const p = run();
    booted.set(key, p);
    return p;
  };

  return {
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
        ⚠️ THE SESSION IS VALIDATED AGAINST THE ORIGIN IT ARRIVED ON, always. A
        cookie can be sent somewhere it was not meant for — a widened domain
        attribute, a proxy, a future edit — and this check is what makes that
        inert rather than a cross-product compromise. Braces as well as belt, on
        the one thing where the belt alone would be a bad trade.
      */
      const identity = identityStore(identityDb);
      const sessions = sessionStore(bind[opts.sessionsBinding] as SqlHandle);
      const cookieId = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
      let session: Session | null = null;
      if (cookieId) {
        const found = await sessions.read(cookieId);
        const now = new Date().toISOString() as Instant;
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
        cookieDomain: cookieDomainFor(at.host),
        secureCookies: url.protocol === "https:",
        sessionDays: opts.sessionDays ?? 30,
        session,
        setCookie: (value) => cookies.push(value),
        deliverCode: opts.deliverCode,
      };

      const { actor, permissions, subjectId } = await opts.resolveCaller(session, at);

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
      const sub = at.tenant ? await readSubscription(regionalDb, at.tenant.tenantId) : PARKED;
      const standingState = at.tenant
        ? standingFor(sub, new Date().toISOString() as Instant, opts.chargeable ?? false)
        : ({ standing: "active", reason: "ok" } as StandingState);
      const gate = gateFor(standingState);
      const entitlements = resolveEntitlements({
        declared: app.access.entitlements,
        plan: app.access.plans.find((p) => p.id === sub.planId) ?? null,
        overrides: sub.overrides,
        gate,
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
      const caller: Caller = { permissions, customerFlags, entitlements, gate };

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
        ⚠️ THE OBLIGATION `check` RETURNED, DISCHARGED HERE. It is reported rather
        than performed there because counting needs a query and the gate is pure
        so a whole tool catalogue can be filtered without touching a store — but a
        returned obligation nobody acts on is worse than one that was never
        mentioned, because the code reads as though the limit is enforced.
      */
      if (verdict.quotaRequired && at.tenant) {
        const key = verdict.quotaRequired.key;
        const count = counters.get(key);
        const used = count
          ? await count(regionalDb, at.tenant.tenantId)
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
      const bodyText = request.method === "GET" ? "" : await request.text();
      const raw = request.method === "GET"
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
        ⚠️ ONE DISPATCH PATH FOR BOTH TRANSPORTS. A tool call runs the same
        handler, behind the same gate, with the same context — the only
        difference is the actor's kind and what the audit records. A second
        dispatch path is how an agent ends up able to do something the route
        cannot, and the divergence is invisible until somebody looks for it.
      */
      const run = async (target: AnyOperation, payload: unknown, via: AuditEntry["via"]) => {
        const entry = auditFor(target, payload, via);
        if (entry) audit.push(entry);
        const result = await target.handler(ctx as never, payload as never);

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
        if (target.emits?.length && at.tenant && opts.audienceFor) {
          const audience = await opts.audienceFor(at.tenant.tenantId, regionalDb).catch(() => []);
          for (const type of target.emits) {
            await dispatch({
              db: regionalDb, registry: app.notifications, tenantId: at.tenant.tenantId,
              type, audience,
              values: interpolatable(payload, result),
              at: new Date().toISOString() as Instant,
              send: opts.send,
            }).catch(() => undefined);
          }
        }
        return result;
      };
      const audit: AuditEntry[] = [];

      const ctx: Ctx<B> & DirectoryCarrier & PlatformCarrier & ToolCarrier & CommerceCarrier & InboxCarrier = {
        [INBOX]: { db: regionalDb, tenantId: at.tenant?.tenantId ?? "", userId: session?.accountId ?? null },
        [PLATFORM]: platform,
        [COMMERCE]: {
          db: regionalDb,
          tenantId: at.tenant?.tenantId ?? "",
          chargeable: opts.chargeable ?? false,
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
        region: at.region,
        now: () => new Date().toISOString() as Instant,
        fail: (code, meta) => { throw new DeclaredFailure(code, meta); },
      };

      try {
        const out = await run(op, input, "http");
        const res = Response.json(out);
        for (const c of cookies) res.headers.append("set-cookie", c);
        return res;
      } catch (e) {
        if (e instanceof DeclaredFailure) {
          const def = problems[e.code];
          if (!def) return problemResponse(UNAVAILABLE, ref);
          return problemResponse(
            {
              code: e.code, status: def.status, title: def.title, retryable: def.retryable,
              ...(def.detail && e.meta ? { detail: def.detail(e.meta) } : {}),
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

const refusalProblem = (refusal: string): Omit<Problem, "ref"> =>
  refusal === "standing"
    ? { code: "platform.read_only", status: 402, title: "This workspace is read-only", retryable: false }
    : { code: "platform.forbidden", status: 403, title: "You don't have access to this", retryable: false };


