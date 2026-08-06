/**
 * THE REQUEST IDENTITY — `@4dl/auth`'s middleware, told which app it is.
 *
 * The package owns the ORDER and the fail-closed defaults: host → session →
 * membership OF THE HOST'S TENANT. That order is the security property, and it
 * is the one thing Scena's own version could not do.
 *
 * ── What changed, and why it matters more here than it reads ───────────────
 *
 * The old middleware took the tenant from `session.activeOrganizationId` — a
 * value Better Auth stamps ONCE, at session creation, to the user's oldest
 * membership. Scena had a single origin, so that was the only source available
 * and it was fine for one workspace per person.
 *
 * With a door per workspace it stops being fine: a person in two workspaces
 * could open `b.scena.4dl.app`, see B's brand, and have every screen, channel
 * and board call scoped to A. Nothing in the UI would say so, and no route
 * could notice — they all just called `tenantOf(c)`.
 *
 * Now the HOST pins the tenancy and the session only proves identity. The role
 * and grant come from a `member` row for `(hostTenant, user)`, so a stranger to
 * this workspace gets `tenantId: null` — signed in, with no scope. On the
 * platform doors (root/setup/admin/device), where there is no host tenant, the
 * session's active org decides, because there is nothing else to ask.
 *
 * This file supplies the four things the package cannot know: how to build the
 * auth instance, how to resolve a host, how to turn a `member` row into a grant,
 * and how to apply the schema.
 */

import type { Context, MiddlewareHandler } from "hono";
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
import { createAuth, type Auth } from "./auth.js";
import { ensureSchema } from "./db.js";
import { resolvePermissions } from "./perms.js";
import { hostnameOf, resolveHost, shapeOf, type Branding, type HostContext } from "./host-context.js";
import type { Env } from "./env.js";

export type { AuthUser, HostContext };

export type AppVars = AuthVars<Auth, Branding>;
export type AppEnv = { Bindings: Env; Variables: AppVars };
export type AppContext = Context<AppEnv>;
type PkgEnv = AuthEnv<Env, Auth, Branding>;

/*
  Annotated explicitly rather than inferred. The inferred type reaches through
  the passkey plugin into `@simplewebauthn/server`, a transitive package this
  app does not depend on by name — so `tsc` refuses to write a portable
  declaration for it. Naming the shape is both the fix and the honest signature.
*/
export const sessionMiddleware: MiddlewareHandler<PkgEnv> = buildSessionMiddleware<Env, Auth, Branding>({
  createAuth: (env, origin, shape) => createAuth(env, origin, shape),
  getSession: (auth, headers) => auth.api.getSession({ headers }),
  resolveHost: (env, url) => resolveHost(env.DB, hostnameOf(url), env),
  // Must NOT throw: a request whose host cannot be resolved still has to reach
  // the route guard so the guard can refuse it, rather than 500 before it runs.
  bareHost: (env, url) => {
    const hostname = hostnameOf(url);
    return { hostname, shape: shapeOf(hostname, env), tenant: null, gate: null };
  },
  // Scena's presets are DERIVED from `access.ts` and a stored custom grant is
  // INTERSECTED with the role's — see `perms.ts` for what that fixed.
  resolveGrant: (role, json) => resolvePermissions(role, json),
  ensureSchema: (env) => ensureSchema(env.DB),
  db: (env) => env.DB,
});

const asPkg = (c: AppContext): Context<PkgEnv> => c as unknown as Context<PkgEnv>;

export const requireTenant = (c: AppContext) => authRequireTenant(asPkg(c));

/**
 * The tenant every store call is keyed by. NON-NULL, and it THROWS rather than
 * guessing.
 *
 * ⚠️ It used to fall back to `DEMO_TENANT`, a single-tenant leftover that turned
 * "no tenancy" into "the demo workspace" — so a request that resolved no tenant
 * did not fail, it wrote into a real workspace's data. Forty-one routes call
 * this, and none of them checked.
 *
 * The invariant that makes a throw safe: the route guard refuses any request
 * without `tenantId` before a handler runs, and no route in the PUBLIC lane
 * calls this (checked — the device and manifest lanes derive their tenant from
 * the row they are reading, which is the only correct source for a caller with
 * no session). So reaching here without a tenant means a route was added to the
 * public lane and left calling this, and a 500 naming that is the right report.
 * The alternative is silence and a cross-tenant write.
 *
 * `requireTenant` is the shape for a handler that legitimately may not have one.
 */
export function tenantOf(c: AppContext): string {
  const tenantId = authTenantOf(asPkg(c));
  if (!tenantId) {
    throw new Error(
      `tenantOf() on a request with no tenant: ${c.req.method} ${c.req.path}. ` +
        "Either the route belongs behind the guard, or it should read its tenant from the row it is loading.",
    );
  }
  return tenantId;
}

/** Ownership guard: a D1 row belongs to the caller's tenant. */
export const owns = (c: AppContext, row: { tenant_id?: string | null } | null | undefined) => authOwns(asPkg(c), row);
export const can = (c: AppContext, permissions: Record<string, string[]>) => authCan(asPkg(c), permissions);

export function requirePermission(c: AppContext, permissions: Record<string, string[]>): Response | null {
  if (!requireTenant(c)) return c.json({ error: "unauthenticated" }, 401);
  if (!can(c, permissions) && !isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
  return null;
}

/**
 * Platform super-admin — the ADMIN_EMAILS allowlist, a separate axis from tenant
 * RBAC. An unauthenticated request is never an admin; when the list is empty any
 * signed-in user is (the dev-only fail-open, which production closes by setting
 * the variable).
 */
export const isPlatformAdmin = (c: AppContext): boolean => isPlatformAdminFor(c.env, c.get("user")?.email);
