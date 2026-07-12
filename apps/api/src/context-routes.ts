/**
 * Session context (SPEC §10) — `/api/me` (public probe) and `/api/context`
 * (the bundle the app boots from: personas, active tenant/role, entitlements,
 * resolved client flags).
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  resolveClientFlags,
  parseFlagsJson,
  type Budget,
  type PersonaRefRole,
} from "./context-helpers.js";
import type { PersonaRef, SessionContext } from "@mossa/protocol";
import { resolveUnits, type UnitPrefs } from "@mossa/domain";
import { type AppEnv, isPlatformAdmin, requireTenant } from "./auth-context.js";
import { clientForUser } from "./clients.js";
import { tenantEntitlements, seedBilling } from "./billing-store.js";
import { parseJson, j } from "./db.js";
import { nowIso } from "./ids.js";

export const contextRoutes = new Hono<AppEnv>()
  .get("/me", (c) => {
    const user = c.get("user");
    return c.json({ user, tenantId: c.get("tenantId"), role: c.get("role") });
  })

  .get("/context", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    await seedBilling(c.env.DB);

    // Client activation auto-link (SPEC §4): an invited client is a `clients`
    // row carrying their email with no login yet. On any sign-in, link every
    // matching unlinked record and mint the `client` membership. This is what
    // makes "invite = create the record; they sign in with that email" work.
    const unlinked = await c.env.DB.prepare(
      "SELECT id, tenant_id FROM clients WHERE user_id IS NULL AND LOWER(email) = LOWER(?) AND status != 'archived'",
    )
      .bind(user.email)
      .all<{ id: string; tenant_id: string }>();
    for (const row of unlinked.results ?? []) {
      await c.env.DB.prepare("UPDATE clients SET user_id = ? WHERE id = ? AND user_id IS NULL")
        .bind(user.id, row.id)
        .run();
      const member = await c.env.DB.prepare(
        'SELECT 1 AS x FROM "member" WHERE organizationId = ? AND userId = ?',
      )
        .bind(row.tenant_id, user.id)
        .first<{ x: number }>();
      if (!member) {
        await c.env.DB.prepare(
          'INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
        )
          .bind(`mem_${row.id}`, row.tenant_id, user.id, "client", new Date().toISOString())
          .run()
          .catch(() => undefined);
      }
    }

    const memberships = await c.env.DB.prepare(
      `SELECT m.organizationId AS tenant_id, m.role, o.name, o.slug FROM "member" m
       JOIN "organization" o ON o.id = m.organizationId WHERE m.userId = ?`,
    )
      .bind(user.id)
      .all<{ tenant_id: string; role: PersonaRefRole; name: string; slug: string }>();

    const personas: PersonaRef[] = [];
    for (const m of memberships.results ?? []) {
      const clientRec = await clientForUser(c.env.DB, m.tenant_id, user.id);
      personas.push({
        tenantId: m.tenant_id,
        tenantName: m.name,
        tenantSlug: m.slug,
        role: m.role,
        clientId: clientRec?.id ?? null,
      });
    }

    const tenantId = c.get("tenantId");
    const active = personas.find((p) => p.tenantId === tenantId) ?? null;

    let entitlements = null;
    let clientFlags = null;
    if (active) {
      entitlements = await tenantEntitlements(c.env.DB, active.tenantId);
      if (active.clientId) {
        // Resolve flags off the client's current subscription (if any).
        const sub = await c.env.DB.prepare(
          "SELECT budgets_json, flags_json, package_id FROM client_subscriptions WHERE client_id = ? AND status IN ('active','paused') ORDER BY started_at DESC LIMIT 1",
        )
          .bind(active.clientId)
          .first<{ budgets_json: string | null; flags_json: string | null; package_id: string | null }>();
        let packageFlags = null;
        if (sub?.package_id) {
          const pkg = await c.env.DB.prepare("SELECT flags_json FROM packages WHERE id = ?")
            .bind(sub.package_id)
            .first<{ flags_json: string | null }>();
          packageFlags = parseFlagsJson(pkg?.flags_json);
        }
        clientFlags = resolveClientFlags({
          packageFlags,
          subscriptionFlags: parseFlagsJson(sub?.flags_json),
          budgets: sub ? parseJson<Budget[]>(sub.budgets_json, []) : null,
          entitlements,
          nowIso: new Date().toISOString(),
        });
      }
    }

    let branding = null;
    if (active) {
      const row = await c.env.DB.prepare("SELECT branding_json FROM tenant_settings WHERE tenant_id = ?")
        .bind(active.tenantId)
        .first<{ branding_json: string | null }>();
      branding = parseJson<SessionContext["branding"]>(row?.branding_json ?? null, null);
    }

    const prefRow = await c.env.DB.prepare("SELECT units_json, widgets_json FROM user_prefs WHERE user_id = ?")
      .bind(user.id)
      .first<{ units_json: string | null; widgets_json: string | null }>();
    const units = resolveUnits(parseJson(prefRow?.units_json ?? null, null));
    const widgets = parseJson<SessionContext["user"]["widgets"]>(prefRow?.widgets_json ?? null, {});

    const ctx: SessionContext = {
      user: { id: user.id, email: user.email, name: user.name ?? null, units, widgets },
      personas,
      active,
      mode: "coach", // the app decides coach/train client-side; server default
      perms: c.get("perms") ?? {},
      entitlements: entitlements ?? (await tenantEntitlements(c.env.DB, "___none___")),
      clientFlags,
      branding,
      isPlatformAdmin: isPlatformAdmin(c),
      hostTenantId: c.get("hostTenant")?.tenantId ?? null,
    };
    return c.json(ctx);
  })

  // Switch active tenant (persona). Better Auth's org plugin owns the session
  // field; we call its endpoint through the server API for atomicity.
  .post("/context/switch", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const body = z.object({ tenantId: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    // On a custom domain the Host pins the tenant — no cross-tenant switching.
    const hostTenant = c.get("hostTenant");
    if (hostTenant && body.data.tenantId !== hostTenant.tenantId) {
      return c.json({ error: "this domain is locked to one workspace" }, 409);
    }
    const member = await c.env.DB.prepare(
      'SELECT 1 AS x FROM "member" WHERE organizationId = ? AND userId = ?',
    )
      .bind(body.data.tenantId, user.id)
      .first<{ x: number }>();
    if (!member) return c.json({ error: "not a member" }, 403);
    await c.get("auth").api.setActiveOrganization({
      headers: c.req.raw.headers,
      body: { organizationId: body.data.tenantId },
    });
    return c.json({ ok: true });
  })

  .get("/notifications", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const rows = await c.env.DB.prepare(
      "SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY created_at DESC LIMIT 50",
    )
      .bind(who.userId)
      .all();
    return c.json({ notifications: rows.results ?? [] });
  })

  // Real-time notification push (SPEC §8.10): a per-user WebSocket via InboxDO.
  // User-scoped (not tenant-scoped) — the bell is personal across tenancies.
  .get("/inbox/ws", (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    if (c.req.header("Upgrade") !== "websocket") return c.json({ error: "expected websocket" }, 426);
    const stub = c.env.INBOX.get(c.env.INBOX.idFromName(user.id));
    return stub.fetch(c.req.raw);
  })

  .post("/notifications/:id/read", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND recipient_user_id = ?")
      .bind(c.req.param("id"), who.userId)
      .run();
    return c.json({ ok: true });
  })

  // Personal unit preferences (cross-tenant) — any signed-in user.
  .patch("/me/units", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const parsed = z
      .object({
        weight: z.enum(["kg", "lb"]).optional(),
        height: z.enum(["cm", "ft_in"]).optional(),
        length: z.enum(["cm", "in"]).optional(),
        volume: z.enum(["ml", "oz"]).optional(),
        distance: z.enum(["km", "mi"]).optional(),
        energy: z.enum(["kcal", "kJ"]).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const row = await c.env.DB.prepare("SELECT units_json FROM user_prefs WHERE user_id = ?").bind(user.id).first<{ units_json: string | null }>();
    const merged = resolveUnits({ ...parseJson<Partial<UnitPrefs>>(row?.units_json ?? null, {}), ...parsed.data });
    const now = nowIso();
    await c.env.DB.prepare("INSERT INTO user_prefs (user_id, units_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET units_json = ?, updated_at = ?")
      .bind(user.id, j(merged), now, j(merged), now)
      .run();
    return c.json({ units: merged });
  })

  // Personal home-screen widget layout (cross-tenant) — per surface.
  .patch("/me/widgets", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthenticated" }, 401);
    const parsed = z
      .object({ surface: z.enum(["home", "coachHome"]), items: z.array(z.object({ id: z.string().max(40), size: z.enum(["big", "small"]) })).max(40) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const row = await c.env.DB.prepare("SELECT widgets_json FROM user_prefs WHERE user_id = ?").bind(user.id).first<{ widgets_json: string | null }>();
    const current = parseJson<Record<string, unknown>>(row?.widgets_json ?? null, {});
    const merged = { ...current, [parsed.data.surface]: parsed.data.items };
    const now = nowIso();
    await c.env.DB.prepare("INSERT INTO user_prefs (user_id, widgets_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET widgets_json = ?, updated_at = ?")
      .bind(user.id, j(merged), now, j(merged), now)
      .run();
    return c.json({ widgets: merged });
  });
