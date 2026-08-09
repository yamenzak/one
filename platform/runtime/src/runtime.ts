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
  Actor, AnyOperation, AppSpec, BindingSpec, Caller, Ctx, Instant, Problem,
  ProblemCatalog, RegionId, Resolved, ResolvedBindings, ResolvedRegion, Session, SqlHandle, TenantId,
} from "@one/kernel";
import {
  ALWAYS_ALLOWED, check, cookieDomainFor, laneOf, PLATFORM_PROBLEMS, relyingPartyFor,
  resolveRequest, routeFor, validateSession,
} from "@one/kernel";
import { bindingsFor, globalSql, type RawEnv } from "./env.js";
import { sqlDirectory } from "./directory.js";
import { DIRECTORY, platformOperations, type DirectoryCarrier } from "./platform-ops.js";
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
   */
  resolveCaller(session: Session | null, at: Resolved): Promise<{ actor: Actor; caller: Caller }>;
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
    ⚠️ THE ROUTE TABLE IS BUILT FROM THE OPERATION REGISTRY, ONCE. There is no
    other way to reach a handler — no `router.get`, no mount, no registration
    step to forget. A capability that exists and cannot be reached is the exact
    failure this platform was started over, and here it is unrepresentable
    rather than caught by a guard afterwards.
  */
  const byPath = new Map<string, AnyOperation>();
  for (const op of [...platformOperations(app), ...identityOperations(app)]) byPath.set(routeFor(op).path, op);
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

      const { actor, caller } = await opts.resolveCaller(session, at);

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

      const input = request.method === "GET"
        ? Object.fromEntries(url.searchParams)
        : await request.json().catch(() => ({}));

      const ctx: Ctx<B> & DirectoryCarrier & PlatformCarrier = {
        [PLATFORM]: platform,
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
        const out = await op.handler(ctx as never, input as never);
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

