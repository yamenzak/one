/**
 * Kova's auth adapter — where `@4dl/auth` learns it is Kova.
 *
 * The package owns the ORDER of the identity resolution (host → session →
 * membership of the host's tenant) and the fail-closed defaults. This file
 * supplies the four things it cannot know: how to build the auth instance, how to
 * resolve a host, how to turn a `member` row into a grant, and how to apply the
 * schema.
 *
 * Everything below is re-exported at the shapes the ~60 call sites across the
 * worker already use, so none of them changed.
 */
import type { Context } from "hono";
import {
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
import { resolvePermissions } from "@kova/domain";
import type { Env } from "./env.js";
import type { RoleName } from "./access.js";
import { createAuth, type Auth } from "./auth.js";
import { ensureSchema } from "./db.js";
import { hostnameOf, resolveHost, shapeOf, type Branding, type HostContext, type HostTenant } from "./host-context.js";

export type { AuthUser, HostContext, HostTenant };

/** Kova's request variables — the package's, with the role narrowed to ours. */
export type KovaAuthVars = Omit<AuthVars<Auth, Branding>, "role"> & { role: RoleName | null };
export type AppEnv = { Bindings: Env; Variables: KovaAuthVars };
export type AppContext = Context<AppEnv>;

/** The package's env shape for this app, for the generic helpers below. */
type PkgEnv = AuthEnv<Env, Auth, Branding>;

export const sessionMiddleware = buildSessionMiddleware<Env, Auth, Branding>({
  createAuth: (env, origin, shape) => createAuth(env, origin, shape),
  getSession: (auth, headers) => auth.api.getSession({ headers }),
  resolveHost: (env, url) => resolveHost(env.DB, hostnameOf(url), env),
  // Must not throw: a request whose host cannot be resolved still has to reach
  // the route guard so the guard can refuse it, rather than 500 before it runs.
  bareHost: (env, url) => {
    const hostname = hostnameOf(url);
    return { hostname, shape: shapeOf(hostname, env), tenant: null, gate: null };
  },
  resolveGrant: (role, json) => resolvePermissions(role, json),
  ensureSchema: (env) => ensureSchema(env.DB),
  db: (env) => env.DB,
});

const asPkg = (c: AppContext): Context<PkgEnv> => c as unknown as Context<PkgEnv>;

/** True when there's a signed-in user bound to an active organization. */
export const requireTenant = (c: AppContext) => authRequireTenant(asPkg(c));
export const tenantOf = (c: AppContext) => authTenantOf(asPkg(c));

/** Ownership guard: a D1 row belongs to the caller's tenant. */
export const owns = (c: AppContext, row: { tenant_id?: string | null } | null | undefined) => authOwns(asPkg(c), row);

/** Action-level authorization against the caller's effective grant. */
export const can = (c: AppContext, permissions: Record<string, string[]>) => authCan(asPkg(c), permissions);

export function requirePermission(c: AppContext, permissions: Record<string, string[]>): Response | null {
  if (!requireTenant(c)) return c.json({ error: "unauthenticated" }, 401);
  if (!can(c, permissions) && !isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
  return null;
}

/** Platform super-admin — ADMIN_EMAILS allowlist, separate from tenant RBAC. */
export function isPlatformAdmin(c: AppContext): boolean {
  return isPlatformAdminFor(c.env, c.get("user")?.email);
}
