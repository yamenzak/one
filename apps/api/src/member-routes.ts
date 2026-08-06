/**
 * The roster read, and the CUSTOM PER-MEMBER GRANT.
 *
 * Everything else about staff — the roster with pending invitations, invite,
 * revoke, re-role, remove — is `@4dl/auth`'s `staffRoutes`, mounted alongside
 * this at `/api/staff`. What stays is the custom grant: an "assigned level" dial
 * that overrides a role's defaults per member, which no other app has and which
 * is not a staff-management primitive so much as a Kova permission feature.
 *
 * `GET /members` also stays, because it is the shape `ClientManage` reads to
 * pick a coach — a plain roster, with no seat arithmetic or invitation list
 * around it.
 *
 * Client activation is the auto-link in context-routes (invite = create the
 * client record with an email; the client signs in with that email via OTP).
 */

import { Hono } from "hono";
import { z } from "zod";
import { sanitizePermissions } from "@kova/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { j, parseJson } from "./db.js";
import { staffFaces } from "./staff-faces.js";

export const memberRoutes = new Hono<AppEnv>()
  .get("/members", async (c) => {
    const who = requireTenant(c)!;
    const rows = await c.env.DB.prepare(
      `SELECT m.id, m.userId, m.role, m.permissions_json, u.name, u.email FROM "member" m
       LEFT JOIN "user" u ON u.id = m.userId WHERE m.organizationId = ? ORDER BY m.createdAt`,
    )
      .bind(who.tenantId)
      .all<{ id: string; userId: string; role: string; permissions_json: string | null; name: string | null; email: string | null }>();
    // The same faces the staff roster resolves. Without this the coach picker
    // and the permissions screen drew a robot for someone whose photograph was
    // already on screen elsewhere — see staff-faces.ts.
    const people = (rows.results ?? []).map((r) => ({ userId: r.userId, email: r.email }));
    const faces = await staffFaces(c.env.DB, who.tenantId, people);
    return c.json({
      members: (rows.results ?? []).map((r) => ({
        id: r.id,
        userId: r.userId,
        role: r.role,
        customGrant: r.permissions_json ? sanitizePermissions(parseJson(r.permissions_json, {})) : null,
        name: r.name,
        email: r.email,
        ...(faces[r.userId] ?? {}),
      })),
    });
  })

  /**
   * Re-role moved to `@4dl/auth`'s `staffRoutes` (`PATCH /api/staff/:userId/role`).
   *
   * It lived here and was gated by `member:update` — a grant an owner can hand
   * to staff — so it needed its own "only an actual owner may hand out the owner
   * role" check to stop a trainer holding that grant from PATCHing themselves to
   * owner. The shared route requires the OWNER role for every write, so that
   * whole class of escalation is closed by construction rather than by a check.
   *
   * The two Kova-specific rules travelled with it as injected seams: `checkRole`
   * (the `frontDesk` entitlement that sells the assistant role, closed on the
   * invite AND the promotion) and `claimsSeat` (only client → staff claims a
   * seat; a sideways move consumes nothing and a demotion frees one).
   */

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
