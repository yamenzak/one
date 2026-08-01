/**
 * THE ROUTE SEAM — how a package can ship Hono routes without importing auth.
 *
 * This is the piece the extraction was missing. `domain-routes.ts` and
 * `org-guard.ts` belong to tenancy by subject: they are entirely about hostnames,
 * certificates and DNS labels. But every route needs the request identity —
 * "who is this, and may they" — and that lives in `@4dl/auth`, which already
 * depends on THIS package. Importing it back would be a cycle, so both modules
 * stayed in the app for four stages with a note saying why.
 *
 * The fix is the same shape as every other injection here: describe what is
 * needed, structurally, and let the app supply it.
 *
 *   the CONTEXT   `RouteEnv` names only the variables these routes READ —
 *                 `host` and `user`. Hono's context is structurally typed, so an
 *                 app whose env has twenty more variables satisfies it by shape.
 *   the GUARDS    `RouteGuards` takes the three authorization questions as
 *                 FUNCTIONS. `@4dl/auth`'s implementations satisfy them; so does
 *                 an app with no authorization at all, which passes stubs.
 *
 * The alternative — a type parameter threaded through every handler — was tried
 * and abandoned: Hono's `Context<E>` is invariant enough that it forces every
 * call site to name the app's full env, which is exactly the coupling this
 * avoids.
 */

import type { Context } from "hono";
import type { HostContext, RootDomainEnv, TenancyBindings } from "./host-context.js";
import type { Maintenance } from "./maintenance.js";

/** The bindings any tenancy route needs. */
export type RouteBindings = TenancyBindings & RootDomainEnv;

/**
 * The context variables these routes read, and no others.
 *
 * `user` is optional and deliberately minimal: the only thing tenancy does with
 * it is stamp `created_by` on a hostname row. It does not decide anything.
 */
export interface RouteVars {
  host: HostContext<unknown>;
  user?: { id: string } | null;
  /**
   * The deployment-wide maintenance switch, resolved once per request by
   * `maintenanceMiddleware`.
   *
   * Optional so an app that never mounts the middleware still satisfies this
   * structurally — the host probe reports `off` and nothing is withheld.
   */
  maintenance?: Maintenance | null;
}

export type RouteEnv = { Bindings: RouteBindings; Variables: RouteVars };
export type RouteContext = Context<RouteEnv>;

/**
 * The authorization questions, injected.
 *
 * Each returns the same shape `@4dl/auth` already produces, so binding them is a
 * one-line pass-through in the app rather than an adapter.
 */
export interface RouteGuards {
  /** The caller's tenant + user, or null when unauthenticated. */
  requireTenant: (c: RouteContext) => { tenantId: string; userId: string } | null;
  /** A `Response` to return when the caller lacks the grant, else null. */
  requirePermission: (c: RouteContext, permissions: Record<string, string[]>) => Response | null;
  /** Platform operator — a separate axis from tenant RBAC. */
  isPlatformAdmin: (c: RouteContext) => boolean;
  /**
   * A CAPABILITY gate, if the app sells custom domains as a feature.
   *
   * Optional, and the default is permissive: an app that does not bill its
   * tenants has nothing to gate, and a package that fails closed on a feature
   * registry it cannot see would simply be unusable. Kova binds
   * `gateFeature(c, "branding")`.
   */
  gateCustomDomain?: (c: RouteContext) => Promise<Response | null>;
  /**
   * The bot-check config the pre-auth client needs, if the app runs one.
   *
   * Reported by the host probe because that is the one endpoint a client reads
   * before it has a session — not because tenancy has an opinion about bots.
   */
  turnstile?: (db: D1Database) => Promise<{ siteKey: string | null; enabled: boolean } | null>;
}
