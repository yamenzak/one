/**
 * Shared auth context for Hono routes (SPEC §4).
 *
 * `AppEnv` carries the per-request Better Auth instance plus the resolved
 * identity: `user`, the active-organization `tenantId`, the caller's `role`,
 * and their effective permission grant. Platform super-admin is a separate
 * axis (`isPlatformAdmin`, ADMIN_EMAILS).
 */
import type { Context, MiddlewareHandler } from "hono";
import { resolvePermissions, grantSatisfies, type Grant } from "@mossa/domain";
import type { Env } from "./env.js";
import type { RoleName } from "./access.js";
import { createAuth, type Auth } from "./auth.js";
import { ensureSchema } from "./db.js";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface AuthVars {
  auth: Auth;
  user: AuthUser | null;
  tenantId: string | null;
  role: RoleName | null;
  perms: Grant | null;
}

export type AppEnv = { Bindings: Env; Variables: AuthVars };
export type AppContext = Context<AppEnv>;

/** Populate `auth`, `user`, `tenantId`, `role`, `perms` from the session cookie. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  c.set("auth", auth);
  c.set("user", null);
  c.set("tenantId", null);
  c.set("role", null);
  c.set("perms", null);
  // Better Auth's tables must exist before its handler touches D1. ensureSchema
  // is idempotent + cached per isolate.
  await ensureSchema(c.env.DB).catch(() => undefined);
  try {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (s?.user) {
      c.set("user", { id: s.user.id, email: s.user.email, name: s.user.name, image: s.user.image });
      const orgId = (s.session as { activeOrganizationId?: string }).activeOrganizationId ?? null;
      c.set("tenantId", orgId);
      if (orgId) {
        const row = await c.env.DB.prepare(
          'SELECT role, permissions_json FROM "member" WHERE organizationId = ? AND userId = ?',
        )
          .bind(orgId, s.user.id)
          .first<{ role: string | null; permissions_json: string | null }>()
          .catch(() => null);
        if (row) {
          c.set("role", (row.role as RoleName) ?? null);
          c.set("perms", resolvePermissions(row.role, row.permissions_json));
        }
      }
    }
  } catch {
    /* unauthenticated — leave nulls */
  }
  await next();
};

/** True when there's a signed-in user bound to an active organization. */
export function requireTenant(c: AppContext): { userId: string; tenantId: string } | null {
  const user = c.get("user");
  const tenantId = c.get("tenantId");
  if (!user || !tenantId) return null;
  return { userId: user.id, tenantId };
}

export function tenantOf(c: AppContext): string | null {
  return c.get("tenantId");
}

/** Ownership guard: a D1 row belongs to the caller's tenant. */
export function owns(c: AppContext, row: { tenant_id?: string | null } | null | undefined): boolean {
  return Boolean(row && row.tenant_id && row.tenant_id === c.get("tenantId"));
}

/** Action-level authorization against the caller's effective grant. */
export function can(c: AppContext, permissions: Record<string, string[]>): boolean {
  if (!c.get("user")) return false;
  const perms = c.get("perms");
  return perms ? grantSatisfies(perms, permissions) : false;
}

export function requirePermission(
  c: AppContext,
  permissions: Record<string, string[]>,
): Response | null {
  if (!requireTenant(c)) return c.json({ error: "unauthenticated" }, 401);
  if (!can(c, permissions) && !isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
  return null;
}

/**
 * Platform super-admin — ADMIN_EMAILS allowlist, separate from tenant RBAC.
 * Requires a signed-in session. When ADMIN_EMAILS is unset (dev), any
 * signed-in user passes; production always sets it.
 */
export function isPlatformAdmin(c: AppContext): boolean {
  const email = (c.get("user")?.email || "").trim().toLowerCase();
  if (!email) return false;
  const list = (c.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(email);
}
