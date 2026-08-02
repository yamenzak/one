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
import { FALLBACK_ROLE, roles, statement } from "./access.js";
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
 * against it. Intersected, never unioned: a custom grant may narrow a role but
 * can never widen it past its preset, so a stored blob cannot escalate.
 *
 * ── The presets are DERIVED from `access.ts`, never restated ────────────────
 *
 * ⚠️ This block used to list `owner` and the fallback BY HAND, and the other
 * three roles were simply absent — so `bindGrants` fell every one of them back
 * to the read-only preset. `access.ts` defined `stockKeeper`, `cssd` and
 * `clinical` carefully and none of them did anything: a CSSD member could not
 * run the autoclave or perform a **Freigabe**, and a stock keeper could not
 * receive stock. Only the owner worked, and nothing failed — the roles resolved,
 * they just resolved to "read".
 *
 * Two registries that must agree, with nothing checking that they do, is the
 * shape. Deriving removes the second registry;
 * `apps/tessa/test/roles.test.ts` asserts every role still resolves to its own
 * grant, so a role added to `access.ts` and forgotten here is a test failure
 * rather than a member who can read and nothing else.
 *
 * Better Auth's `newRole` keeps the grant on `.statements`, which is the same
 * object literal `access.ts` passed in.
 */
const presets = Object.fromEntries(
  Object.entries(roles).map(([name, role]) => [
    name,
    Object.fromEntries(
      Object.entries((role as { statements: Record<string, readonly string[]> }).statements)
        // Better Auth's own org statements (`organization`, `member`, …) ride
        // along on the owner role. They are not in this app's catalog, and
        // `sanitizeGrant` would drop them anyway — dropping them here keeps the
        // resolved grant readable in a debugger.
        .filter(([resource]) => resource in statement)
        .map(([resource, actions]) => [resource, [...actions]]),
    ),
  ]),
);

const grants = bindGrants({
  catalog: statement as unknown as Record<string, readonly string[]>,
  presets,
  fallbackRole: FALLBACK_ROLE,
  unboundedRoles: ["owner"],
});

/**
 * The resolver, exposed for `roles.test.ts`.
 *
 * The middleware below is the only production caller; a test that reached for
 * `bindGrants` itself would be re-deriving the presets and asserting against its
 * own copy, which is exactly the duplication that caused the bug.
 */
export const resolveGrantFor = (role: string | null, permsJson: string | null): Record<string, string[]> =>
  grants.resolve(role, permsJson);

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
