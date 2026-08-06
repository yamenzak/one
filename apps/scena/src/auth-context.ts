/**
 * Shared auth context for Hono routes.
 *
 * `AppEnv` carries the per-request Better Auth instance plus the resolved
 * identity: `user`, the active-organization `tenantId` (an organization IS a
 * Scena tenant), and the caller's `role` in that org. `resolveSession` populates
 * it; `can` gates writes via the RBAC roles (see access.ts).
 * Platform super-admin (the console) is a separate axis — `isPlatformAdmin`.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "./env.js";
import type { RoleName } from "./access.js";
import { createAuth, type Auth } from "./auth.js";
import { ensureSchema, DEMO_TENANT } from "./db.js";
import { resolvePermissions, grantSatisfies } from "./perms.js";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface AuthVars {
  /** Better Auth built for this request (bindings are request-scoped). */
  auth: Auth;
  /** The signed-in user, or null when unauthenticated. */
  user: AuthUser | null;
  /** Active organization id = the tenant every store call is keyed by. */
  tenantId: string | null;
  /** The user's role in the active org (owner/operator/receptionist/viewer). */
  role: RoleName | null;
  /** The caller's effective permission grant (custom per-user, else role preset). */
  perms: Record<string, string[]> | null;
}

export type AppEnv = { Bindings: Env; Variables: AuthVars };
export type AppContext = Context<AppEnv>;

/** Populate `auth`, `user`, `tenantId`, and `role` from the session cookie. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  c.set("auth", auth);
  c.set("user", null);
  c.set("tenantId", null);
  c.set("role", null);
  c.set("perms", null);
  // Better Auth's tables must exist before its handler (mounted under /api/auth/*)
  // touches D1. ensureSchema is idempotent + cached, so this is a no-op after the
  // first request of an isolate.
  await ensureSchema(c.env.DB).catch(() => undefined);
  try {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (s?.user) {
      c.set("user", { id: s.user.id, email: s.user.email, name: s.user.name, image: s.user.image });
      const orgId = (s.session as { activeOrganizationId?: string }).activeOrganizationId ?? null;
      c.set("tenantId", orgId);
      if (orgId) {
        try {
          const member = await auth.api.getActiveMember({ headers: c.req.raw.headers });
          const role = (member?.role as RoleName) ?? null;
          c.set("role", role);
          // Resolve the caller's effective grant: their custom per-user set if
          // stored, else the role's preset. This is what can() enforces.
          const row = await c.env.DB.prepare('SELECT permissions_json FROM "member" WHERE organizationId = ? AND userId = ?')
            .bind(orgId, s.user.id).first<{ permissions_json: string | null }>().catch(() => null);
          c.set("perms", resolvePermissions(role, row?.permissions_json ?? null));
        } catch {
          /* no active member (e.g. org not set yet) */
        }
      }
    }
  } catch {
    /* unauthenticated or schema not ready — leave nulls */
  }
  await next();
};

/**
 * The active-organization tenant id for the current request. Safe to call from
 * any operator route — the routeGuard guarantees a tenant is present there, so
 * this is non-null in that context. Falls back to DEMO_TENANT only for legacy
 * unauthenticated/cron paths that opt out of the guard.
 */
export function tenantOf(c: AppContext): string {
  return c.get("tenantId") ?? DEMO_TENANT;
}

/** Ownership guard: a D1 row belongs to the caller's tenant (by tenant_id). */
export function owns(c: AppContext, row: { tenant_id?: string | null } | null | undefined): boolean {
  return Boolean(row && row.tenant_id === tenantOf(c));
}

/** True when there's a signed-in user bound to an active organization. */
export function requireTenant(c: AppContext): { userId: string; tenantId: string } | null {
  const user = c.get("user");
  const tenantId = c.get("tenantId");
  if (!user || !tenantId) return null;
  return { userId: user.id, tenantId };
}

/** Server-side authorization check against the caller's effective grant in their
 *  active org — the custom per-user permission set when present, else the role
 *  preset. Falls back to Better Auth's role check only when no grant resolved. */
export async function can(c: AppContext, permissions: Record<string, string[]>): Promise<boolean> {
  if (!c.get("user")) return false;
  const perms = c.get("perms");
  if (perms) return grantSatisfies(perms, permissions);
  try {
    const r = await c.get("auth").api.hasPermission({ headers: c.req.raw.headers, body: { permissions } });
    return Boolean(r?.success);
  } catch {
    return false;
  }
}

/**
 * Platform super-admin (console) — the ADMIN_EMAILS allowlist, a separate axis
 * from tenant RBAC roles. Requires an authenticated session: an unauthenticated
 * request is never an admin (this closes the pre-auth hole where the API trusted
 * the OPERATOR_EMAIL fallback for everyone). When ADMIN_EMAILS is unset, any
 * signed-in user is treated as admin — dev convenience; production sets it.
 */
export function isPlatformAdmin(c: AppContext): boolean {
  const email = (c.get("user")?.email || "").trim().toLowerCase();
  if (!email) return false; // must be signed in
  const list = (c.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true; // dev: any signed-in user
  return list.includes(email);
}
