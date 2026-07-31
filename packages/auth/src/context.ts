/**
 * THE REQUEST IDENTITY — resolved once, read everywhere.
 *
 * One middleware answers three questions in a fixed order, and the order is the
 * security property:
 *
 *   1. WHERE did this request arrive?   (`@4dl/tenancy` resolves the host)
 *   2. WHO is calling?                  (the session cookie)
 *   3. WHAT may they do HERE?           (their membership of the HOST's tenant)
 *
 * ── Why the tenant comes from the host and not the session ─────────────────
 *
 * A session carries an "active organization", stamped once at creation to the
 * user's oldest membership. If that decided scope, a user who belongs to two
 * tenants could enter through tenant B's branded door and have every call scoped
 * to tenant A — the right brand over the wrong tenancy, with nothing in the UI to
 * show it.
 *
 * So on any tenant host the HOST pins the tenancy and the session merely proves
 * identity: the role and grant come from a `member` row for `(hostTenant, user)`,
 * and a stranger to that tenant gets `tenantId: null` — signed in, with no scope.
 * Only on the platform doors (root/setup/admin), where there is no host tenant,
 * does the session's active org decide.
 *
 * ── What the app supplies ──────────────────────────────────────────────────
 *
 * Everything product-shaped is a parameter: the auth instance factory, the host
 * resolver, the grant resolver, and the schema gate. This module owns the ORDER
 * and the fail-closed defaults, which is the part that must not be re-derived per
 * app.
 */

import type { Context, MiddlewareHandler } from "hono";
import type { HostContext, HostShape } from "@4dl/tenancy";
import { grantSatisfies, type Grant } from "./grants.js";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

/**
 * What the middleware puts on the context.
 *
 * `A` is the app's auth instance type (whatever its `createAuth` returns) and `B`
 * its branding blob — both opaque here.
 */
export interface AuthVars<A = unknown, B = unknown> {
  auth: A;
  user: AuthUser | null;
  tenantId: string | null;
  role: string | null;
  perms: Grant | null;
  /**
   * The tenant this HOST belongs to, or null on the platform doors. When set, it
   * (not the session) pins the tenant.
   */
  hostTenant: HostContext<B>["tenant"];
  /**
   * The full host resolution: which door, which tenant, and that tenant's gate.
   * Every route that needs to know *where* it was called reads it from here
   * rather than re-parsing the URL, so classification happens exactly once.
   */
  host: HostContext<B>;
}

/** The Hono environment an app assembles from its bindings and these vars. */
export type AuthEnv<E extends object, A = unknown, B = unknown> = { Bindings: E; Variables: AuthVars<A, B> };

export interface SessionConfig<E extends object, A, B> {
  /** Build the per-request auth instance. Bindings are request-scoped on Workers,
   *  so this cannot be hoisted to module scope. */
  createAuth: (env: E, origin: string, shape: HostShape) => A;
  /** Ask the auth instance for the current session. */
  getSession: (auth: A, headers: Headers) => Promise<{ user?: AuthUser; session?: unknown } | null>;
  /** Resolve the request's host. */
  resolveHost: (env: E, url: string) => Promise<HostContext<B>>;
  /** A host resolution for when the resolver itself fails — must not throw. */
  bareHost: (env: E, url: string) => HostContext<B>;
  /** Turn a `member` row into the caller's effective grant. */
  resolveGrant: (role: string | null, permissionsJson: string | null) => Grant;
  /** Apply the schema before anything touches D1. Idempotent, cached per isolate. */
  ensureSchema: (env: E) => Promise<void>;
  /** The user's D1 handle, for the membership lookup. */
  db: (env: E) => D1Database;
}

/**
 * Populate `auth`, `host`, `hostTenant`, `user`, `tenantId`, `role`, `perms`.
 *
 * Every failure path leaves nulls rather than throwing: an unauthenticated
 * request is not an error, and a request whose host cannot be resolved must
 * still reach the route guard so the guard can refuse it — not 500 before the
 * guard has run.
 */
export function sessionMiddleware<E extends object, A, B>(cfg: SessionConfig<E, A, B>): MiddlewareHandler<AuthEnv<E, A, B>> {
  return async (c, next) => {
    c.set("user", null);
    c.set("tenantId", null);
    c.set("role", null);
    c.set("perms", null);
    c.set("hostTenant", null);

    const env = c.env as E;
    // The auth tables must exist before the auth handler touches D1.
    await cfg.ensureSchema(env).catch(() => undefined);

    const host = await cfg.resolveHost(env, c.req.url).catch(() => cfg.bareHost(env, c.req.url));
    c.set("host", host);
    c.set("hostTenant", host.tenant);

    // The auth instance is constructed WITH the resolved host, so the passkey RP
    // ID and the session cookie's Domain follow the door.
    const auth = cfg.createAuth(env, new URL(c.req.url).origin, host.shape);
    c.set("auth", auth);

    try {
      const s = await cfg.getSession(auth, c.req.raw.headers);
      if (s?.user) {
        const u = s.user;
        c.set("user", { id: u.id, email: u.email, name: u.name, image: u.image });
        const sessionOrg = (s.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId ?? null;
        const orgId = host.tenant ? host.tenant.tenantId : sessionOrg;
        if (orgId) {
          const row = await cfg
            .db(env)
            .prepare('SELECT role, permissions_json FROM "member" WHERE organizationId = ? AND userId = ?')
            .bind(orgId, u.id)
            .first<{ role: string | null; permissions_json: string | null }>()
            .catch(() => null);
          if (row) {
            c.set("tenantId", orgId);
            c.set("role", row.role ?? null);
            c.set("perms", cfg.resolveGrant(row.role, row.permissions_json));
          }
          // hostTenant + non-member ⇒ leave tenantId null: signed in, but with no
          // access to this door's tenant. They can still switch or self-register.
        }
      }
    } catch {
      /* unauthenticated — leave the nulls */
    }
    await next();
  };
}

type Ctx<E extends object, A, B> = Context<AuthEnv<E, A, B>>;

/** A signed-in user bound to a tenant, or null. */
export function requireTenant<E extends object, A, B>(c: Ctx<E, A, B>): { userId: string; tenantId: string } | null {
  const user = c.get("user");
  const tenantId = c.get("tenantId");
  if (!user || !tenantId) return null;
  return { userId: user.id, tenantId };
}

export function tenantOf<E extends object, A, B>(c: Ctx<E, A, B>): string | null {
  return c.get("tenantId");
}

/** Ownership guard: a row belongs to the caller's tenant. */
export function owns<E extends object, A, B>(c: Ctx<E, A, B>, row: { tenant_id?: string | null } | null | undefined): boolean {
  return Boolean(row && row.tenant_id && row.tenant_id === c.get("tenantId"));
}

/** Action-level authorization against the caller's effective grant. */
export function can<E extends object, A, B>(c: Ctx<E, A, B>, permissions: Record<string, string[]>): boolean {
  if (!c.get("user")) return false;
  const perms = c.get("perms");
  return perms ? grantSatisfies(perms, permissions) : false;
}

/**
 * Platform super-admin — an email allowlist, a SEPARATE AXIS from tenant RBAC.
 *
 * Fails CLOSED when the allowlist is empty. The dev convenience (any signed-in
 * user passes) is gated on an explicit `ENVIRONMENT=development`, never on the
 * mere absence of config: an unset allowlist in production silently promoting
 * every user to operator is a full platform compromise from one missing variable.
 */
export function isPlatformAdminFor(env: { ADMIN_EMAILS?: string; ENVIRONMENT?: string }, email: string | null | undefined): boolean {
  const addr = (email || "").trim().toLowerCase();
  if (!addr) return false;
  const list = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length > 0) return list.includes(addr);
  return env.ENVIRONMENT === "development";
}
