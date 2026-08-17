/**
 * ONE — THE DEPLOYMENT.
 *
 * ⚠️ ONE WORKER ANSWERS EVERY DOOR FOR EVERY PRODUCT (D3), and this file is the
 * whole of it. Adding a product is a line in `APPS` below and a row in a
 * database — no worker, no domain binding, no provisioning workflow, no secret.
 * The previous platform needed four YAML edits, a registry entry and a workflow
 * run per product, and that machinery existed only because resources were
 * per-app.
 *
 * ⚠️ AND THE WIRING IS THE INTERESTING PART, BECAUSE THERE IS SO LITTLE OF IT.
 * Everything below is a value handed to `serve`: which apps exist, where the
 * records are, who is asking, whether this deployment can take a payment. A
 * deployment that assembled any of it differently would be one where a gate
 * quietly reads something else — which is why `locator` is one function rather
 * than six lookups each caller does for itself.
 */

import type { AppSpec } from "@engine/kernel";
import {
  AI_ACTION_SCHEMA, AUDIT_SCHEMA, BILLING_SCHEMA, BRANDING_SCHEMA, DIRECTORY_SCHEMA,
  IDENTITY_SCHEMA, INBOX_SCHEMA,
  JOBS_SCHEMA, MEMBERSHIP_SCHEMA, OPERATOR_SCHEMA, PACKAGE_SCHEMA, REPLAY_SCHEMA, SETTING_SCHEMA, VAULT_SCHEMA,
  NOBODY, accountOfToken, addShard, applySchema, appsOfTenant, bearerFrom, locator, memberFor, noteShardApp,
  operatorOps, permissionsResolver, personalOps, schemaFor, serve, sessionIdFrom, shardFor,
  subscriptionFor, whoIs,
  type Db, type TenantRow,
} from "@engine/runtime";
import { hello } from "@engine/hello";

/* ------------------------------------------------------------------ what --- */

/**
 * ⚠️ THE PRODUCTS THIS DEPLOYMENT SERVES, AS THUNKS. A thunk rather than a
 * manifest, because composition is lazy (D4): a request composes the app it is
 * for and no other, so the catalogue can grow without every cold start paying
 * for it.
 */
const APPS: Readonly<Record<string, () => AppSpec>> = { hello };

/**
 * ⚠️ THE PLATFORM'S OWN TABLES, IN DEPENDENCY ORDER. A module that alters a
 * table another module creates simply finds nothing there — the runner swallows
 * it, everything reports success, and a column that was supposed to exist
 * silently never does.
 */
const DIRECTORY_MODULES = [DIRECTORY_SCHEMA, IDENTITY_SCHEMA, BILLING_SCHEMA, BRANDING_SCHEMA, JOBS_SCHEMA, OPERATOR_SCHEMA, AI_ACTION_SCHEMA];
const SHARD_MODULES = [MEMBERSHIP_SCHEMA, PACKAGE_SCHEMA, SETTING_SCHEMA, AI_ACTION_SCHEMA, AUDIT_SCHEMA, REPLAY_SCHEMA, INBOX_SCHEMA, VAULT_SCHEMA];

export interface Env {
  readonly DIRECTORY: D1Database;
  readonly SHARD_EU_1: D1Database;
  /** The SPA. Served for everything that is not `/api/*` — see `fetch`. */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly ROOT: string;
  readonly ENVIRONMENT: string;
  readonly AUTH_SECRET: string;
  /**
   * ⚠️ WHO MAY OPEN THE OPERATOR CONSOLE — comma-separated addresses. Empty in
   * development means the signed-in developer; empty anywhere else means the
   * console admits NOBODY, which is the honest reading of "unconfigured".
   */
  readonly OPERATOR_EMAILS?: string;
  /** ⚠️ Absent means this deployment cannot charge — see `standingFor`. */
  readonly STRIPE_KEY?: string;
  readonly [binding: string]: unknown;
}

/* ------------------------------------------------------------------ boot --- */

/**
 * ⚠️ THE SCHEMA IS APPLIED ONCE PER ISOLATE, NOT PER REQUEST. It is stamped with
 * a hash of itself, so the second call is a single `SELECT` — but doing that on
 * every request would still put a round trip in front of every read for no
 * possible finding.
 *
 * ⚠️ AND IT IS AWAITED RATHER THAN FIRED. A request served while the tables are
 * still being created answers "no such table" to whoever happened to be first,
 * which is a fault that appears exactly once per deploy and never reproduces.
 */
let booted: Promise<void> | null = null;

/**
 * ⚠️ A DEPLOYMENT WITH NO SIGNING SECRET MUST NOT SERVE. Without it every
 * sign-in code is signed with `undefined` — which is a constant, and a constant
 * anybody reading this repository already has, so the codes are forgeable and
 * nothing anywhere looks wrong. Refusing is loud; the alternative is an
 * authentication system that appears to work.
 *
 * ⚠️ AND IT IS CHECKED AT BOOT RATHER THAN AT THE SIGN-IN ROUTE. A check on the
 * route leaves `/health` answering 200 on a deployment that cannot safely sign
 * anybody in, which is the reverse of what a probe is for.
 */
const REQUIRED: readonly (keyof Env & string)[] = ["ROOT", "AUTH_SECRET"];

/**
 * ⚠️ CHECKED ON EVERY REQUEST, NOT ONCE — and the cost of that is two string
 * reads, against an invariant whose absence is forgeable sign-in codes. Folded
 * into the memoised boot below it becomes order-dependent: whichever
 * configuration reached the isolate first decides for every request after it,
 * and the check is then something that has already happened rather than
 * something that is true.
 */
const missingConfig = (env: Env): readonly string[] =>
  REQUIRED.filter((key) => !String(env[key] ?? "").trim());

const boot = (env: Env): Promise<void> => {
  booted ??= (async () => {
    const directory = env.DIRECTORY as unknown as Db;
    await applySchema(directory, DIRECTORY_MODULES);
    /* Every app this deployment serves, on the one shard it has today. */
    await applySchema(env.SHARD_EU_1 as unknown as Db, [
      ...Object.values(APPS).map((make) => schemaFor(make())),
      ...SHARD_MODULES,
    ]);
    /*
      ⚠️ THE SHARD THIS DEPLOYMENT BINDS IS DECLARED AT BOOT, IDEMPOTENTLY. The
      directory places every new workspace on a registered shard — with no row,
      creating one answers "nowhere to put it" on a deployment whose database
      is RIGHT THERE, bound and migrated. Both writes are upserts, so a
      thousand cold starts write what one did.
    */
    await addShard(directory, "eu-1", "eu", 10_000);
    for (const id of Object.keys(APPS)) await noteShardApp(directory, "eu-1", id as never);
  })();
  return booted;
};

/* ----------------------------------------------------------------- wiring --- */

const handler = (env: Env) => {
  const directory = env.DIRECTORY as unknown as Db;
  const shardOf = (tenant: TenantRow) => shardFor(env as never, tenant.shardId);

  /*
    ⚠️ WHO RUNS THE DEPLOYMENT, DECIDED ONCE. The console is behind it and the
    hub draws the operator's place from it, and two copies of this rule is how
    a place gets drawn over a console that then refuses every call. The
    development fallback admits the signed-in developer and NOBODY in
    production — an empty allow-list on a live deployment is unconfigured, not
    open.
  */
  const isOperator = (email: string | null): boolean => {
    if (!email) return false;
    const listed = (env.OPERATOR_EMAILS ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (listed.length) return listed.includes(email.toLowerCase());
    return env.ENVIRONMENT === "development";
  };

  return serve({
    roots: { root: env.ROOT },
    apps: APPS,
    /*
      ⚠️ WHO WE ARE, FOR THE TILES THAT WEAR OUR MARK. A personal workspace is
      not trading under anybody's name, so it installs as ours — and there is no
      honest way to draw that from a hostname, which is why a deployment that
      has not said serves no manifest at all rather than a plausible wrong one.
    */
    installable: { name: "One", mark: "◇" },
    directory,
    shardOf,

    /*
      ⚠️ SENDING IS THE ONE THING A DEPLOYMENT MUST NOT FAKE. In development the
      code goes to the log, which is how the suites and a person on a laptop read
      it; anywhere else, a deployment with no mailer REFUSES to pretend it sent
      something — a sign-in that answers "check your email" with nothing sent is
      a product that appears to work and cannot be used.
    */
    personal: {
      ...personalOps({
        secret: env.AUTH_SECRET,
        appId: "hello",
        deliver: async (to, code) => {
          if (env.ENVIRONMENT !== "development") {
            throw new Error("this deployment has no mailer configured");
          }
          console.log(`[sign-in] ${to} → ${code}`);
        },
        /* ⚠️ The same allow-list the console is behind (D18) — the hub draws
           the operator's place from this, and a place drawn over nothing is a
           promise the next screen takes back. */
        isOperator,
        /* ⚠️ Injected because the money tables are a module a deployment may
           not have applied — see `IdentityDeps`. Only a workspace that stopped
           paying carries a badge; one on every row is texture. */
        needsAttention: async (db, tenantId, appId) =>
          (await subscriptionFor(db, tenantId, appId))?.status === "past_due",
      }),
      /*
        ⚠️ THE OPERATOR OPERATIONS RIDE THE PERSONAL LANE, on the operator door
        only, with the deployment deciding who counts. The development fallback
        admits the signed-in developer and NOBODY in production — an empty
        allow-list on a live deployment is unconfigured, not open.
      */
      ...operatorOps({ apps: APPS, isOperator }),
    },

    /*
      ⚠️ ONE FUNCTION FOR THE WHOLE RESOLUTION. The workspace, its shard, its
      standing, what its plan includes, what it has left to spend and what it has
      used — six questions with one right set of answers, every one of which
      feeds a gate.
    */
    locate: locator({
      directory,
      shardOf,
      appsOf: async (tenant) => {
        const ids = await appsOfTenant(directory, tenant.id);
        return ids.map((id) => APPS[id]?.()).filter((a): a is AppSpec => !!a);
      },
      /* ⚠️ Gating "has not paid" on a deployment that cannot take a payment
         strands every workspace over OUR misconfiguration. */
      charging: !!env.STRIPE_KEY,
    }),

    /*
      ⚠️ WHO IS ASKING COMES FROM THE SESSION AND THE WORKSPACE'S OWN ROSTER, and
      never from anything the request said about itself. Resolved per request, so
      a role taken away stops working immediately rather than at the next sign-in
      — which is exactly when it matters that it does.
    */
    identify: async (request, located) => {
      /*
        ⚠️ TWO WAYS TO SAY WHO YOU ARE, ONE ANSWER TO WHAT YOU MAY DO. A person
        arrives with a session cookie; an agent arrives with a bearer token the
        account minted at the account centre. Both resolve to an ACCOUNT, and
        everything after — the membership, the roles, the permissions — is the
        workspace's own roster answering per request, identically. A token
        never carries `provenAt`: anything a machine can hold must not satisfy
        the `recent` proof gate, which exists against exactly that.
      */
      const now = new Date();
      const bearer = bearerFrom(request);
      const viaToken = bearer ? await accountOfToken(directory, bearer, env.AUTH_SECRET, now) : null;
      const { session, email, accountId: viaSession } = viaToken
        ? { session: null, email: null, accountId: null }
        : await whoIs(directory, sessionIdFrom(request), now);

      const accountId = viaToken ?? viaSession;
      if (!accountId) return NOBODY;
      const member = await memberFor(located.db, located.tenantId as never, accountId);
      return {
        accountId,
        email,
        signedIn: true,
        provenAt: session?.provenAt ?? null,
        /* ⚠️ Per app (D15) — the flat set this replaced was resolved against
           `located.apps[0]`, so a role in the second product granted nothing. */
        permissionsIn: permissionsResolver(located.db, located.tenantId as never, member,
          (appId) => APPS[appId]?.().access.roles ?? null, now),
      };
    },
  });
};

/* ------------------------------------------------------------------ fetch --- */

/** ⚠️ The reason goes to the log, where the operator is. The request gets a
    status a probe can act on and nothing about our configuration. */
const unavailable = (): Response =>
  new Response(
    JSON.stringify({ problem: { code: "platform.unavailable", title: "One is not configured" } }),
    { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
  );

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    /*
      ⚠️ A DEPLOYMENT THAT CANNOT START SAYS SO ON EVERY PATH, `/health`
      INCLUDED. Letting the throw escape answers 500 with no body — which is
      what a previous platform did for a day behind a green deploy workflow,
      while the page still loaded because static assets never reach the worker.
      The reason goes to the log, where the operator is; the request gets a
      status a probe can act on.
    */
    const unconfigured = missingConfig(env);
    if (unconfigured.length) {
      console.error(
        `[boot] One cannot serve: ${unconfigured.join(", ")} is not set. ` +
        `In development copy engine/one/.dev.vars.example to .dev.vars; in a ` +
        `deployment ROOT is a var and AUTH_SECRET is a worker secret.`,
      );
      return unavailable();
    }

    try {
      await boot(env);
    } catch (why) {
      console.error("[boot]", why);
      return unavailable();
    }

    const url = new URL(request.url);
    /*
      ⚠️ THE API IS THE PLATFORM'S AND EVERYTHING ELSE IS THE PAGE. A single-page
      app owns its own routing, so an unknown path is the SPA's business rather
      than a 404 from here — and `/api/*` is the one prefix that is ours, which
      is why every operation answers under it and nothing else does.
    */
    if (url.pathname.startsWith("/api/") || url.pathname === "/health" || url.pathname === "/mcp") {
      return handler(env)(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export { APPS, DIRECTORY_MODULES, SHARD_MODULES };
