/**
 * Session context (SPEC §10) — `/api/me` (public probe) and `/api/context`
 * (the bundle the app boots from: personas, active tenant/role, entitlements,
 * resolved client flags).
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  type PersonaRefRole,
} from "./context-helpers.js";
import type { PersonaRef, SessionContext } from "@mossa/protocol";
import { resolveUnits, overallDaysRemaining, NOTIF_TYPES, notifVisibleInSurface, type UnitPrefs, type NotifType } from "@mossa/domain";
import { type AppEnv, isPlatformAdmin, requireTenant } from "./auth-context.js";
import { clientForUser } from "./clients.js";
import { resolveClientFlagsFor, loadClientAccessRows, accessBudgetsOf } from "./client-flags.js";
import { tenantEntitlements, seedBilling } from "./billing-store.js";
import { checkStaffSeat } from "./auth.js";
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

    // Staff invitation auto-accept (SPEC §4): a pending `invitation` row addressed
    // to this email mints the staff membership on sign-in — the mirror of the
    // client auto-link above, so an invited trainer/assistant lands in the studio
    // the moment they verify their code (the /accept-invitation deep link is a
    // convenience, not the only path). Seat quota is enforced here, at the point
    // the seat is actually consumed: past the plan's staffSeats ceiling the
    // invite stays pending (the owner must free a seat or upgrade) rather than
    // over-filling the roster.
    const nowMsT = Date.now();
    const invites = await c.env.DB.prepare(
      "SELECT id, organizationId, role, expiresAt FROM \"invitation\" WHERE status = 'pending' AND LOWER(email) = LOWER(?)",
    )
      .bind(user.email)
      .all<{ id: string; organizationId: string; role: string | null; expiresAt: string | number | null }>();
    for (const inv of invites.results ?? []) {
      const exp = inv.expiresAt != null ? new Date(inv.expiresAt as string).getTime() : NaN;
      if (Number.isFinite(exp) && exp < nowMsT) continue; // expired — leave it
      const already = await c.env.DB.prepare(
        'SELECT 1 AS x FROM "member" WHERE organizationId = ? AND userId = ?',
      )
        .bind(inv.organizationId, user.id)
        .first<{ x: number }>();
      if (!already) {
        // The SAME seat check Better Auth's `beforeAcceptInvitation` hook runs
        // (`checkStaffSeat`, auth.ts) — one definition, so this lane and the deep
        // link can never disagree about who fits. Pending invitations are NOT
        // counted here: the invite being claimed would count itself out.
        const seat = await checkStaffSeat(c.env.DB, inv.organizationId);
        if (!seat.ok) continue; // over the seat ceiling — keep the invite pending
        const role = inv.role && inv.role !== "client" ? inv.role : "trainer";
        await c.env.DB.prepare(
          'INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
        )
          .bind(`mem_${inv.id}`, inv.organizationId, user.id, role, new Date().toISOString())
          .run()
          .catch(() => undefined);
      }
      await c.env.DB.prepare('UPDATE "invitation" SET status = ? WHERE id = ?')
        .bind("accepted", inv.id)
        .run()
        .catch(() => undefined);
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

    // Adopt a tenant when the session has none. `tenantId` comes from the
    // session's activeOrganizationId, which auth.ts stamps at session CREATE —
    // i.e. before the client auto-link and the invitation auto-accept above have
    // minted anything. So an invited client or staffer gets a membership here and
    // still resolves `active: null` on this request AND every later one, because
    // nothing ever writes activeOrganizationId afterwards. The app early-returns
    // on a null active and renders Start ("Create workspace"), so an invited
    // trainer's only escape was to sign out and back in. Persist the adoption so
    // the whole session agrees, and only when there is exactly one candidate —
    // with several memberships, picking one for the user would be a guess, and
    // the studio switcher is the right answer.
    let tenantId = c.get("tenantId");
    // NEVER adopt on a tenant's custom domain. There the Host pins the tenant
    // (auth-context.ts), and a non-member must keep resolving to null — that is
    // the §14.1 isolation invariant, and adopting the user's own unrelated studio
    // here would hand them an active persona on someone else's branded domain.
    const hostPinned = Boolean(c.get("hostTenant"));
    if (!tenantId && !hostPinned && personas.length === 1) {
      const adopted = personas[0]!.tenantId;
      await c.env.DB
        .prepare('UPDATE "session" SET activeOrganizationId = ? WHERE userId = ? AND activeOrganizationId IS NULL')
        .bind(adopted, user.id)
        .run()
        .catch(() => undefined);
      // Serve this request as adopted regardless of whether the write landed —
      // the persona is real either way, and a failed stamp would only mean the
      // next request re-adopts. Guarded on `IS NULL`, so an explicit tenant
      // choice made elsewhere (the switcher) is never overwritten.
      tenantId = adopted;
      c.set("tenantId", adopted);
    }
    const active = personas.find((p) => p.tenantId === tenantId) ?? null;

    let entitlements = null;
    let clientFlags = null;
    if (active) {
      entitlements = await tenantEntitlements(c.env.DB, active.tenantId);
      if (active.clientId) {
        // Resolve flags off the client's current subscription (shared resolver).
        clientFlags = await resolveClientFlagsFor(c.env.DB, active.tenantId, active.clientId);
      }
    }

    let branding = null;
    let marketplaceJson: string | null = null;
    if (active) {
      const row = await c.env.DB.prepare("SELECT branding_json, marketplace_json FROM tenant_settings WHERE tenant_id = ?")
        .bind(active.tenantId)
        .first<{ branding_json: string | null; marketplace_json: string | null }>();
      branding = parseJson<SessionContext["branding"]>(row?.branding_json ?? null, null);
      marketplaceJson = row?.marketplace_json ?? null;
    }

    // Access-economy status for the client persona: does a live plan/package
    // cover them, and does this tenant require one to use the app?
    let clientAccess: SessionContext["clientAccess"] = null;
    if (active?.clientId) {
      const now = new Date().toISOString();
      const required = Boolean(parseJson<{ requireActiveAccess?: boolean }>(marketplaceJson, {}).requireActiveAccess);
      // Same read as the enforcing gate (`client-flags.ts`) and the Today banner:
      // every live row, tenant-scoped, budgets concatenated. Days stack across
      // packages, so this banner and the routes can never disagree.
      const rows = await loadClientAccessRows(c.env.DB, active.tenantId, active.clientId);
      const days = overallDaysRemaining(accessBudgetsOf(rows), now);
      clientAccess = { active: days > 0, required, daysRemaining: rows.length ? days : null };
    }

    const prefRow = await c.env.DB.prepare("SELECT units_json, widgets_json FROM user_prefs WHERE user_id = ?")
      .bind(user.id)
      .first<{ units_json: string | null; widgets_json: string | null }>();
    const units = resolveUnits(parseJson(prefRow?.units_json ?? null, null));
    const widgets = parseJson<SessionContext["user"]["widgets"]>(prefRow?.widgets_json ?? null, {});

    const ctx: SessionContext = {
      user: { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null, units, widgets },
      personas,
      active,
      mode: "coach", // the app decides coach/train client-side; server default
      perms: c.get("perms") ?? {},
      entitlements: entitlements ?? (await tenantEntitlements(c.env.DB, "___none___")),
      clientFlags,
      branding,
      clientAccess,
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

  // Mark every unread notification read. Scoped to the current SURFACE when one
  // is given (train mode clears only client notifications, coach mode only
  // staff/owner) so "mark all read" respects the mode you're in.
  .post("/notifications/read-all", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { surface?: string };
    const surface = body.surface === "client" || body.surface === "staff" ? body.surface : null;
    if (surface) {
      const types = (Object.keys(NOTIF_TYPES) as NotifType[]).filter((t) => notifVisibleInSurface(t, surface));
      if (types.length === 0) return c.json({ ok: true });
      const ph = types.map(() => "?").join(",");
      await c.env.DB.prepare(`UPDATE notifications SET read = 1 WHERE recipient_user_id = ? AND read = 0 AND type IN (${ph})`).bind(who.userId, ...types).run();
    } else {
      await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE recipient_user_id = ? AND read = 0").bind(who.userId).run();
    }
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
