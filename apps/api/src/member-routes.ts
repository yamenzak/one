/**
 * Staff management (SPEC §4) — roster list, role changes, custom grants.
 * Invitations ride Better Auth's organization endpoints (/api/auth/organization/*);
 * client activation is the auto-link in context-routes (invite = create the
 * client record with an email; the client signs in with that email via OTP).
 */

import { Hono } from "hono";
import { z } from "zod";
import { sanitizePermissions } from "@mossa/domain";
import { type AppEnv, requireTenant, isPlatformAdmin } from "./auth-context.js";
import { checkStaffSeat } from "./auth.js";
import { gateFeature } from "./client-flags.js";
import { j, parseJson } from "./db.js";

const ROLES = ["owner", "trainer", "assistant", "client"] as const;

export const memberRoutes = new Hono<AppEnv>()
  .get("/members", async (c) => {
    const who = requireTenant(c)!;
    const rows = await c.env.DB.prepare(
      `SELECT m.id, m.userId, m.role, m.permissions_json, u.name, u.email FROM "member" m
       LEFT JOIN "user" u ON u.id = m.userId WHERE m.organizationId = ? ORDER BY m.createdAt`,
    )
      .bind(who.tenantId)
      .all<{ id: string; userId: string; role: string; permissions_json: string | null; name: string | null; email: string | null }>();
    return c.json({
      members: (rows.results ?? []).map((r) => ({
        id: r.id,
        userId: r.userId,
        role: r.role,
        customGrant: r.permissions_json ? sanitizePermissions(parseJson(r.permissions_json, {})) : null,
        name: r.name,
        email: r.email,
      })),
    });
  })

  .patch("/members/:userId/role", async (c) => {
    const who = requireTenant(c)!;
    const body = z.object({ role: z.enum(ROLES) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    // Only an actual owner (or platform admin) may HAND OUT the owner role. The
    // route is gated by member:update, which an owner can custom-grant to staff —
    // without this a trainer/assistant holding that grant could PATCH their own
    // role to owner (full billing/settings/staff control) and self-escalate.
    if (body.data.role === "owner" && c.get("role") !== "owner" && !isPlatformAdmin(c)) {
      return c.json({ error: "only an owner can assign the owner role" }, 403);
    }
    // The assistant seat is the OTHER half of what `frontDesk` sells (SPEC §5:
    // "Assistant role + sessions/booking"). Only the sessions half used to be
    // gated, so a tenant on a plan without frontDesk could still mint assistants —
    // and `access.ts` grants that role real powers (whole-roster read, the whole
    // scheduling surface). Gating the role itself closes the paid capability at
    // both ends. The invite path is gated in `auth.ts`'s `beforeCreateInvitation`,
    // so neither door is left open.
    if (body.data.role === "assistant") {
      const gate = await gateFeature(c, "sessions");
      if (gate) return gate;
    }
    const target = await c.env.DB.prepare(
      'SELECT role FROM "member" WHERE organizationId = ? AND userId = ?',
    )
      .bind(who.tenantId, c.req.param("userId"))
      .first<{ role: string }>();
    // Protect the last owner.
    if (body.data.role !== "owner" && target?.role === "owner") {
      const owners = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM "member" WHERE organizationId = ? AND role = 'owner'`,
      )
        .bind(who.tenantId)
        .first<{ n: number }>();
      if ((owners?.n ?? 0) <= 1) return c.json({ error: "cannot demote the last owner" }, 409);
    }
    // Seat ceiling: promoting a CLIENT-role member to staff claims a new staff
    // seat, which was previously uncounted — the third `staffSeats` bypass. Only
    // this direction is checked: a sideways staff→staff move consumes nothing new
    // (so a studio sitting exactly on its ceiling can still reshuffle roles), and
    // a demotion to `client` frees a seat.
    if (body.data.role !== "client" && target?.role === "client") {
      const seat = await checkStaffSeat(c.env.DB, who.tenantId);
      if (!seat.ok) return c.json({ error: seat.message, quota: "staffSeats", used: seat.used, limit: seat.max }, 403);
    }
    await c.env.DB.prepare('UPDATE "member" SET role = ? WHERE organizationId = ? AND userId = ?')
      .bind(body.data.role, who.tenantId, c.req.param("userId"))
      .run();
    return c.json({ ok: true });
  })

  // Custom per-member grant — the "assigned level" dial (null clears it).
  .patch("/members/:userId/permissions", async (c) => {
    const who = requireTenant(c)!;
    const body = z
      .object({ permissions: z.record(z.string(), z.array(z.string())).nullable() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const grant = body.data.permissions ? sanitizePermissions(body.data.permissions) : null;
    await c.env.DB.prepare(
      'UPDATE "member" SET permissions_json = ? WHERE organizationId = ? AND userId = ?',
    )
      .bind(grant && Object.keys(grant).length ? j(grant) : null, who.tenantId, c.req.param("userId"))
      .run();
    return c.json({ ok: true });
  });
