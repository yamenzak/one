/**
 * THE BOOT BUNDLE — what the app needs before it can draw anything.
 *
 * One request, answered once, carrying the four things every screen depends on:
 * who you are, which workspace you are in, what you may do in it, and whether
 * the workspace is in good standing. Splitting these across four endpoints would
 * make the first paint wait on the slowest of them and give the app four ways to
 * be half-loaded.
 *
 * ── The two are deliberately different endpoints ────────────────────────────
 *
 * `/api/me` is the cheap probe: am I signed in at all. It survives the standing
 * gate (route-guard.ts `allowedWhileReadOnly`), because a person whose workspace
 * has lapsed must still be able to see who they are and leave.
 *
 * `/api/context` is the bundle. It needs a tenant, so it answers only on a
 * workspace door — which is the same rule the guard already enforces, restated
 * here so a caller on the wrong door gets a sentence rather than an empty shell.
 *
 * ── Why `permissions` ships to the browser ──────────────────────────────────
 *
 * So the UI can hide a button the server would refuse. That is a COURTESY, never
 * a control: every one of these permissions is re-checked server-side at the
 * route, and a client that lies to itself about its own grant achieves nothing
 * but a 403 with better timing. Shipping it is what stops the alternative —
 * showing a CSSD nurse a Release button that always fails.
 */

import { Hono } from "hono";
import { type AppEnv, isPlatformAdmin } from "./auth-context.js";

/** One workspace this user belongs to, for the switcher. */
interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export const contextRoutes = new Hono<AppEnv>()

  .get("/me", (c) => {
    const user = c.get("user");
    return c.json({ user, tenantId: c.get("tenantId"), role: c.get("role") });
  })

  .get("/context", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const host = c.get("host");

    /**
     * Every workspace this person belongs to — read from Better Auth's own
     * tables, because membership IS the auth package's fact and a second copy
     * would drift the first time someone is removed.
     */
    const rows = await c.env.DB
      .prepare(
        'SELECT o.id, o.name, o.slug, m.role FROM "member" m JOIN "organization" o ON o.id = m.organizationId WHERE m.userId = ? ORDER BY o.name LIMIT 50',
      )
      .bind(user.id)
      .all<Workspace>();
    const workspaces = rows.results ?? [];

    /**
     * The ACTIVE workspace comes from the host, never from the session.
     *
     * That inversion is the whole tenancy model (`auth-context.ts`): the
     * hostname pins the tenant before the session is read, so a session pointed
     * at the wrong workspace grants nothing. Reporting a session-chosen "active"
     * here would put a second, disagreeing answer in the browser.
     */
    const tenantId = c.get("tenantId");
    const active = tenantId ? (workspaces.find((w) => w.id === tenantId) ?? null) : null;

    return c.json({
      user,
      workspaces,
      active: active
        ? {
            ...active,
            permissions: c.get("perms") ?? {},
            /**
             * Spread whole, never hand-picked. In Kova, selecting fields off the
             * gate is exactly how `blocked` reached the model and the resolver
             * while the app kept reading an undefined flag and rendering the
             * ordinary read-only UI (CLAUDE.md). The same mistake is available
             * here and costs the same.
             */
            gate: host.gate ? { ...host.gate } : null,
          }
        : null,
      isPlatformAdmin: isPlatformAdmin(c),
      branding: host.tenant?.branding ?? null,
    });
  });
