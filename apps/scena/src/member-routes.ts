/**
 * Team management routes — the tenant admin's control over staff accounts
 * (BLUEPRINT §auth). List the workspace's members, provision staff with a
 * username + password, reset a password, change a role, or revoke access.
 *
 * RBAC (owner/operator manage members; receptionist/viewer can't) is enforced
 * upstream by the routeGuard via permissionFor(). Handlers just resolve the
 * caller's tenant and act on it, so a member of tenant A can never touch B.
 */
import type { Hono } from "hono";
import type { AppEnv } from "./auth-context.js";
import { tenantOf } from "./auth-context.js";
import { listTenantMembers, createStaff, resetStaffPassword, setMemberRole, setMemberPermissions, revokeMember, orgSlug, resolveWorkspace, ROLE_NAMES, normalizeUsername, resolveLoginEmail, usernameTaken, claimUsername } from "./members.js";

export function registerMemberRoutes(app: Hono<AppEnv>): void {
  /** Public: resolve a typed workspace (slug or name) → canonical login slug, so
   *  the staff sign-in form can build the synthetic credential email. Returns
   *  only the slug/name (no membership data), safe to expose unauthenticated. */
  app.get("/api/org/resolve", async (c) => {
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return c.json({ error: "missing workspace" }, 400);
    const org = await resolveWorkspace(c.env.DB, q);
    if (!org) return c.json({ error: "not found" }, 404);
    return c.json({ slug: org.slug, name: org.name });
  });

  /** Public: resolve a GLOBAL username → its login email, so the sign-in form
   *  can call the normal email+password provider with no workspace to type
   *  (§auth). Usernames aren't secret; only the login email is returned. */
  app.post("/api/username/resolve", async (c) => {
    const body = await c.req.json<{ username?: string }>().catch(() => ({}) as { username?: string });
    const u = normalizeUsername(body.username ?? "");
    if (!u) return c.json({ error: "invalid" }, 400);
    const email = await resolveLoginEmail(c.env.DB, u);
    if (!email) return c.json({ error: "not found" }, 404);
    return c.json({ email });
  });

  /** Public: is a username available? (Live check for the create-workspace form.) */
  app.get("/api/username/available", async (c) => {
    const u = normalizeUsername(c.req.query("u") ?? "");
    if (!u) return c.json({ available: false, reason: "invalid" });
    return c.json({ available: !(await usernameTaken(c.env.DB, u)) });
  });

  /** Authed: claim/rename the current user's global username (owner onboarding). */
  app.post("/api/username/claim", async (c) => {
    const userId = c.get("user")?.id;
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json<{ username?: string }>().catch(() => ({}) as { username?: string });
    const r = await claimUsername(c.env.DB, userId, body.username ?? "");
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, 400);
  });

  /** The tenant's team + the workspace login slug to share with staff. */
  app.get("/api/members", async (c) => {
    const tenant = tenantOf(c);
    const [members, slug] = await Promise.all([listTenantMembers(c.env.DB, tenant), orgSlug(c.env.DB, tenant)]);
    return c.json({ members, loginSlug: slug, roles: ROLE_NAMES });
  });

  /** Provision a staff account (username + password + role + optional custom
   *  permission grant — the role is a preset the admin can then fine-tune). */
  app.post("/api/members", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string; role?: string; name?: string; permissions?: unknown }>().catch(() => ({}) as never);
    const res = await createStaff(c.env.DB, tenantOf(c), {
      username: body.username ?? "",
      password: body.password ?? "",
      role: body.role ?? "receptionist",
      name: body.name,
      permissions: body.permissions,
    });
    if (!res.ok) return c.json({ error: res.error }, 400);
    return c.json(res);
  });

  /** Set a member's custom permission grant (empty ⇒ role preset applies). */
  app.post("/api/members/:id/permissions", async (c) => {
    const body = await c.req.json<{ permissions?: unknown }>().catch(() => ({}) as never);
    const res = await setMemberPermissions(c.env.DB, tenantOf(c), c.req.param("id"), body.permissions);
    if (!res.ok) return c.json({ error: res.error }, 400);
    return c.json({ ok: true });
  });

  /** Reset a staff member's password (admin — no old password required). */
  app.post("/api/members/:id/password", async (c) => {
    const body = await c.req.json<{ password?: string }>().catch(() => ({}) as never);
    const res = await resetStaffPassword(c.env.DB, tenantOf(c), c.req.param("id"), body.password ?? "");
    if (!res.ok) return c.json({ error: res.error }, 400);
    return c.json({ ok: true });
  });

  /** Change a member's role. */
  app.post("/api/members/:id/role", async (c) => {
    const body = await c.req.json<{ role?: string }>().catch(() => ({}) as never);
    const res = await setMemberRole(c.env.DB, tenantOf(c), c.req.param("id"), body.role ?? "");
    if (!res.ok) return c.json({ error: res.error }, 400);
    return c.json({ ok: true });
  });

  /** Revoke a member's access (removes membership + kills sessions). */
  app.delete("/api/members/:id", async (c) => {
    const res = await revokeMember(c.env.DB, tenantOf(c), c.req.param("id"));
    if (!res.ok) return c.json({ error: res.error }, 400);
    return c.json({ ok: true });
  });
}
