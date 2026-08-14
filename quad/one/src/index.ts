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

import type { AppSpec } from "@quad/kernel";
import {
  AUDIT_SCHEMA, BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, INBOX_SCHEMA,
  JOBS_SCHEMA, MEMBERSHIP_SCHEMA, REPLAY_SCHEMA, VAULT_SCHEMA,
  applySchema, appsOfTenant, locator, memberFor, permissionsOf, personalOps, rolesFor,
  schemaFor, serve, sessionIdFrom, shardFor, whoIs, type Db, type TenantRow,
} from "@quad/runtime";
import { hello } from "@quad/hello";
import { kova } from "@quad/kova";

/* ------------------------------------------------------------------ what --- */

/**
 * ⚠️ THE PRODUCTS THIS DEPLOYMENT SERVES, AS THUNKS. A thunk rather than a
 * manifest, because composition is lazy (D4): a request composes the app it is
 * for and no other, so the catalogue can grow without every cold start paying
 * for it.
 */
const APPS: Readonly<Record<string, () => AppSpec>> = { hello, kova };

/**
 * ⚠️ THE PLATFORM'S OWN TABLES, IN DEPENDENCY ORDER. A module that alters a
 * table another module creates simply finds nothing there — the runner swallows
 * it, everything reports success, and a column that was supposed to exist
 * silently never does.
 */
const DIRECTORY_MODULES = [DIRECTORY_SCHEMA, IDENTITY_SCHEMA, BILLING_SCHEMA, JOBS_SCHEMA];
const SHARD_MODULES = [MEMBERSHIP_SCHEMA, AUDIT_SCHEMA, REPLAY_SCHEMA, INBOX_SCHEMA, VAULT_SCHEMA];

export interface Env {
  readonly DIRECTORY: D1Database;
  readonly SHARD_EU_1: D1Database;
  /** The SPA. Served for everything that is not `/api/*` — see `fetch`. */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly ROOT: string;
  readonly ENVIRONMENT: string;
  readonly AUTH_SECRET: string;
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

const boot = (env: Env): Promise<void> => {
  booted ??= (async () => {
    await applySchema(env.DIRECTORY as unknown as Db, DIRECTORY_MODULES);
    /* Every app this deployment serves, on the one shard it has today. */
    await applySchema(env.SHARD_EU_1 as unknown as Db, [
      ...Object.values(APPS).map((make) => schemaFor(make())),
      ...SHARD_MODULES,
    ]);
  })();
  return booted;
};

/* ----------------------------------------------------------------- wiring --- */

const handler = (env: Env) => {
  const directory = env.DIRECTORY as unknown as Db;
  const shardOf = (tenant: TenantRow) => shardFor(env as never, tenant.shardId);

  return serve({
    roots: { root: env.ROOT },
    apps: APPS,
    directory,
    shardOf,

    /*
      ⚠️ SENDING IS THE ONE THING A DEPLOYMENT MUST NOT FAKE. In development the
      code goes to the log, which is how the suites and a person on a laptop read
      it; anywhere else, a deployment with no mailer REFUSES to pretend it sent
      something — a sign-in that answers "check your email" with nothing sent is
      a product that appears to work and cannot be used.
    */
    personal: personalOps({
      secret: env.AUTH_SECRET,
      appId: "kova",
      deliver: async (to, code) => {
        if (env.ENVIRONMENT !== "development") {
          throw new Error("this deployment has no mailer configured");
        }
        console.log(`[sign-in] ${to} → ${code}`);
      },
    }),

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
      const { session, email, accountId } = await whoIs(directory, sessionIdFrom(request), new Date());
      if (!session || !accountId) {
        return { caller: { signedIn: false, permissions: new Set(), provenAt: null }, accountId: null };
      }
      const app = APPS[located.apps[0] ?? ""]?.();
      const member = await memberFor(located.db, located.tenantId as never, accountId);
      const roles = await rolesFor(located.db, located.tenantId as never, app?.access.roles ?? {});
      return {
        accountId,
        email,
        caller: {
          signedIn: true,
          permissions: permissionsOf(member, roles),
          provenAt: session.provenAt,
        },
      };
    },
  });
};

/* ------------------------------------------------------------------ fetch --- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    await boot(env);

    const url = new URL(request.url);
    /*
      ⚠️ THE API IS THE PLATFORM'S AND EVERYTHING ELSE IS THE PAGE. A single-page
      app owns its own routing, so an unknown path is the SPA's business rather
      than a 404 from here — and `/api/*` is the one prefix that is ours, which
      is why every operation answers under it and nothing else does.
    */
    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      return handler(env)(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export { APPS, DIRECTORY_MODULES, SHARD_MODULES };
