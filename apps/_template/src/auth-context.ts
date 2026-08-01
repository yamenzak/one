/**
 * THE REQUEST IDENTITY — `@4dl/auth`'s middleware, told which app it is.
 *
 * The package owns the ORDER of the resolution and the fail-closed defaults:
 * host → session → membership OF THE HOST'S TENANT. That order is the security
 * property. Because the tenancy is pinned from the hostname BEFORE the session
 * is read, a session pointed at the wrong tenant grants nothing.
 *
 * This file supplies the four things it cannot know: how to build the auth
 * instance, how to resolve a host, how to turn a `member` row into a grant, and
 * how to apply the schema.
 */

import type { Context } from "hono";
import {
  bindGrants,
  can as authCan,
  isPlatformAdminFor,
  owns as authOwns,
  requireTenant as authRequireTenant,
  sessionMiddleware as buildSessionMiddleware,
  tenantOf as authTenantOf,
  type AuthEnv,
  type AuthUser,
  type AuthVars,
} from "@4dl/auth";
import type { Maintenance } from "@4dl/tenancy";
import { CUSTOMER_ROLE, statement } from "./access.js";
import { createAuth, type Auth } from "./auth.js";
import { ensureSchema } from "./db.js";
import { hostnameOf, resolveHost, shapeOf, type Branding, type HostContext } from "./host-context.js";
import type { Env } from "./env.js";

export type { AuthUser, HostContext };

/** The package's variables, plus the maintenance switch the middleware resolves. */
export type AppVars = AuthVars<Auth, Branding> & { maintenance: Maintenance };
export type AppEnv = { Bindings: Env; Variables: AppVars };
export type AppContext = Context<AppEnv>;
type PkgEnv = AuthEnv<Env, Auth, Branding>;

/**
 * ROLE → what that role may do, with any stored per-member override INTERSECTED
 * against it.
 *
 * Intersected, never unioned: a custom grant may narrow a role but can never
 * widen it past its preset, so a stored blob cannot be used to escalate.
 */
const grants = bindGrants({
  catalog: statement as unknown as Record<string, readonly string[]>,
  presets: {
    owner: Object.fromEntries(Object.entries(statement).map(([k, v]) => [k, [...v]])),
    [CUSTOMER_ROLE]: { record: ["create", "read", "update"], ai: ["use"] },
  },
  fallbackRole: CUSTOMER_ROLE,
  unboundedRoles: ["owner"],
});

export const sessionMiddleware = buildSessionMiddleware<Env, Auth, Branding>({
  createAuth: (env, origin, shape) => createAuth(env, origin, shape),
  getSession: (auth, headers) => auth.api.getSession({ headers }),
  resolveHost: (env, url) => resolveHost(env.DB, hostnameOf(url), env),
  // Must NOT throw: a request whose host cannot be resolved still has to reach
  // the route guard so the guard can refuse it, rather than 500 before it runs.
  bareHost: (env, url) => {
    const hostname = hostnameOf(url);
    return { hostname, shape: shapeOf(hostname, env), tenant: null, gate: null };
  },
  resolveGrant: (role, json) => grants.resolve(role, json),
  ensureSchema: (env) => ensureSchema(env.DB),
  db: (env) => env.DB,
});

const asPkg = (c: AppContext): Context<PkgEnv> => c as unknown as Context<PkgEnv>;

export const requireTenant = (c: AppContext) => authRequireTenant(asPkg(c));
export const tenantOf = (c: AppContext) => authTenantOf(asPkg(c));
/** Ownership guard: a D1 row belongs to the caller's tenant. */
export const owns = (c: AppContext, row: { tenant_id?: string | null } | null | undefined) => authOwns(asPkg(c), row);
export const can = (c: AppContext, permissions: Record<string, string[]>) => authCan(asPkg(c), permissions);

export function requirePermission(c: AppContext, permissions: Record<string, string[]>): Response | null {
  if (!requireTenant(c)) return c.json({ error: "unauthenticated" }, 401);
  if (!can(c, permissions) && !isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
  return null;
}

/** Platform super-admin — an allowlist, a separate axis from tenant RBAC. */
export const isPlatformAdmin = (c: AppContext): boolean => isPlatformAdminFor(c.env, c.get("user")?.email);
