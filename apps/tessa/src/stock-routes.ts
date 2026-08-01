/**
 * STOCK — locations, receiving, moving, using.
 *
 * The first surface a stock keeper touches, and the one that has to be fast in a
 * room where nobody has a spare hand. Every write goes through `applyEvent`
 * (ledger.ts): these routes never touch `lots` directly, which is what keeps the
 * audit trail complete by construction rather than by discipline.
 *
 * ── A trust distinction that matters, and is easy to get backwards ──────────
 *
 * TESSA.md Rule 3 says AI never auto-commits a safety-relevant value. A GS1
 * barcode is NOT that. It is a deterministic parse of what the manufacturer
 * printed, with a check digit — the same class of evidence as reading the label
 * with your eyes, and rather more reliable. So GS1 expiry and lot ARE committed
 * directly, while a vision-model reading of the same box would not be.
 *
 * The distinction is worth naming because collapsing it in either direction is
 * bad: treat the barcode as a guess and you have rebuilt the typing you set out
 * to remove; treat a model's reading as a barcode and you have put a
 * hallucinated expiry on a shelf.
 */

import { Hono } from "hono";
import { parseGs1, effectiveExpiry, expiryStatus, daysUntilExpiry } from "@tessa/domain";
import { newId, nowIso } from "@4dl/core";
import { type AppEnv, requireTenant, requirePermission } from "./auth-context.js";
import { applyEvent, historyOf } from "./ledger.js";

/** Map a chokepoint refusal onto an HTTP answer the UI can act on. */
const FAILURE_STATUS: Record<string, 400 | 404 | 409> = {
  not_found: 404,
  not_applicable: 400,
  bad_delta: 400,
  not_divisible: 400,
  insufficient: 409,
  finished: 409,
  frozen: 409,
  conflict: 409,
};

/** Copy the message the person holding the box needs, not the enum. */
const FAILURE_TEXT: Record<string, string> = {
  not_found: "That item isn't here.",
  not_applicable: "That action doesn't apply to this kind of item.",
  bad_delta: "Enter how many.",
  not_divisible: "This item is counted in whole units.",
  insufficient: "There isn't that much left — count the shelf and adjust.",
  finished: "This item is finished and can't be changed.",
  frozen: "This item is quarantined. Release it first.",
  conflict: "Someone else just changed this. Check the amount and try again.",
};

export const stockRoutes = new Hono<AppEnv>()

  // ── Locations ─────────────────────────────────────────────────────────────
  .get("/locations", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const rows = await c.env.DB
      .prepare("SELECT id, parent_id, kind, name, code FROM locations WHERE tenant_id = ? AND active = 1 ORDER BY kind, name LIMIT 500")
      .bind(who.tenantId)
      .all();
    return c.json({ locations: rows.results ?? [] });
  })

  .post("/locations", async (c) => {
    const denied = requirePermission(c, { settings: ["manage"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { name?: string; kind?: string; parentId?: string; code?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (!b.name) return c.json({ error: "name is required" }, 400);
    const kind = b.kind ?? "room";
    if (!["site", "room", "bin"].includes(kind)) return c.json({ error: "unknown kind" }, 400);
    // A parent must belong to the same tenant. Without this check a location
    // could be nested under another clinic's site and inherit its tree.
    if (b.parentId) {
      const parent = await c.env.DB.prepare("SELECT id FROM locations WHERE id = ? AND tenant_id = ?").bind(b.parentId, who.tenantId).first();
      if (!parent) return c.json({ error: "unknown parent" }, 400);
    }
    const id = newId("loc");
    await c.env.DB
      .prepare("INSERT INTO locations (id, tenant_id, parent_id, kind, name, code, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
      .bind(id, who.tenantId, b.parentId ?? null, kind, b.name, b.code ?? null, nowIso())
      .run();
    return c.json({ id }, 201);
  })

  /**
   * RECEIVE — the two-scan flow, and the reason the GS1 parser exists.
   *
   * Scan the bin, scan the box: the barcode supplies product, expiry and lot, so
   * the only thing left to type is a quantity. When the barcode names a product
   * the catalog does not know, this answers 409 with everything it DID read, so
   * the app can offer "add this to your catalog" pre-filled rather than dumping
   * the person into an empty form.
   */
  .post("/stock/receive", async (c) => {
    const denied = requirePermission(c, { stock: ["receive"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = {
      barcode?: string;
      catalogItemId?: string;
      locationId?: string;
      quantity?: number;
      lotCode?: string;
      expiry?: string;
      supplier?: string;
    };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (!b.locationId) return c.json({ error: "scan a location first" }, 400);
    if (!b.quantity || b.quantity <= 0) return c.json({ error: "how many?" }, 400);

    const loc = await c.env.DB.prepare("SELECT id FROM locations WHERE id = ? AND tenant_id = ?").bind(b.locationId, who.tenantId).first();
    if (!loc) return c.json({ error: "unknown location" }, 404);

    // The barcode is authoritative where it speaks; the body fills the rest.
    const scan = b.barcode ? parseGs1(b.barcode, new Date()) : null;
    const lotCode = b.lotCode ?? scan?.lot ?? null;
    const expiry = b.expiry ?? scan?.expiry?.iso ?? null;

    let catalogItemId = b.catalogItemId ?? null;
    if (!catalogItemId && scan?.gtin) {
      const hit = await c.env.DB
        .prepare("SELECT id FROM catalog_items WHERE tenant_id = ? AND gtin = ? AND active = 1")
        .bind(who.tenantId, scan.gtin)
        .first<{ id: string }>();
      catalogItemId = hit?.id ?? null;
    }
    if (!catalogItemId) {
      // Everything we managed to read comes back, so the next screen is a
      // confirmation rather than a blank form. `warnings` rides along because a
      // failed check digit is exactly what the person needs to know here.
      return c.json(
        { error: "unknown_product", scan: scan ? { gtin: scan.gtin, lot: scan.lot, expiry: scan.expiry?.iso, warnings: scan.warnings } : null },
        409,
      );
    }
    const item = await c.env.DB.prepare("SELECT id FROM catalog_items WHERE id = ? AND tenant_id = ?").bind(catalogItemId, who.tenantId).first();
    if (!item) return c.json({ error: "unknown product" }, 404);

    /**
     * One lot row per (product, lot code, location, expiry).
     *
     * A second delivery of the same lot into the same bin tops up the row it is
     * genuinely the same physical stock as. Creating a new row instead would
     * fragment the shelf into rows nobody can reconcile against it — and would
     * make FEFO picking pick arbitrarily between identical lots.
     */
    const existing = lotCode
      ? await c.env.DB
          .prepare("SELECT id FROM lots WHERE tenant_id = ? AND catalog_item_id = ? AND location_id = ? AND lot_code IS ? AND printed_expiry IS ? AND status = 'active'")
          .bind(who.tenantId, catalogItemId, b.locationId, lotCode, expiry)
          .first<{ id: string }>()
      : null;

    let lotId = existing?.id ?? null;
    if (!lotId) {
      lotId = newId("lot");
      await c.env.DB
        .prepare("INSERT INTO lots (id, tenant_id, catalog_item_id, location_id, lot_code, gtin, printed_expiry, quantity, received_at, received_by, supplier, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'active', ?, ?)")
        .bind(lotId, who.tenantId, catalogItemId, b.locationId, lotCode, scan?.gtin ?? null, expiry, nowIso(), who.userId, b.supplier ?? null, nowIso(), nowIso())
        .run();
    }

    // The quantity arrives through the chokepoint, never as part of the INSERT —
    // so a received lot has a ledger row justifying every unit on the shelf.
    const r = await applyEvent(c.env.DB, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      event: "received",
      trackedKind: "lot",
      trackedId: lotId,
      quantity: b.quantity,
      toLocationId: b.locationId,
      note: b.supplier ?? null,
    });
    if (!r.ok) return c.json({ error: FAILURE_TEXT[r.reason], reason: r.reason }, FAILURE_STATUS[r.reason] ?? 400);
    return c.json({ lotId, quantity: r.quantity, expiry, lotCode, warnings: scan?.warnings ?? [] }, 201);
  })

  /** Move · use · discard · quarantine — one shape, because they differ only in
   *  which event they name. Each is a distinct permission. */
  .post("/stock/:lotId/:action", async (c) => {
    const action = c.req.param("action");
    const EVENT: Record<string, { event: "moved" | "consumed" | "wasted" | "quarantined" | "opened"; perm: string }> = {
      move: { event: "moved", perm: "move" },
      use: { event: "consumed", perm: "consume" },
      discard: { event: "wasted", perm: "consume" },
      quarantine: { event: "quarantined", perm: "quarantine" },
      open: { event: "opened", perm: "consume" },
    };
    const spec = EVENT[action];
    if (!spec) return c.json({ error: "unknown action" }, 404);
    const denied = requirePermission(c, { stock: [spec.perm] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { quantity?: number; toLocationId?: string; caseId?: string; note?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);

    if (spec.event === "moved") {
      if (!b.toLocationId) return c.json({ error: "scan where it's going" }, 400);
      const loc = await c.env.DB.prepare("SELECT id FROM locations WHERE id = ? AND tenant_id = ?").bind(b.toLocationId, who.tenantId).first();
      if (!loc) return c.json({ error: "unknown location" }, 404);
    }

    const r = await applyEvent(c.env.DB, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      event: spec.event,
      trackedKind: "lot",
      trackedId: c.req.param("lotId"),
      quantity: b.quantity,
      toLocationId: b.toLocationId ?? null,
      caseId: b.caseId ?? null,
      note: b.note ?? null,
    });
    if (!r.ok) return c.json({ error: FAILURE_TEXT[r.reason], reason: r.reason }, FAILURE_STATUS[r.reason] ?? 400);
    return c.json({ ok: true, quantity: r.quantity });
  })

  /**
   * What is on the shelf, with the expiry that actually applies.
   *
   * `effectiveExpiry` is computed per row rather than stored (see schema.ts): it
   * depends on a catalog default that can change, so a stored copy would go
   * stale silently — and stale in the direction of showing something as usable.
   */
  .get("/stock", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const locationId = c.req.query("locationId");
    const rows = await c.env.DB
      .prepare(
        `SELECT l.id, l.catalog_item_id, l.location_id, l.lot_code, l.printed_expiry, l.opened_at, l.quantity, l.status,
                c.name AS item_name, c.unit_of_measure, c.post_opening_days, c.consumption
         FROM lots l LEFT JOIN catalog_items c ON c.id = l.catalog_item_id
         WHERE l.tenant_id = ? AND l.status = 'active' ${locationId ? "AND l.location_id = ?" : ""}
         ORDER BY l.printed_expiry IS NULL, l.printed_expiry LIMIT 500`,
      )
      .bind(...(locationId ? [who.tenantId, locationId] : [who.tenantId]))
      .all<Record<string, string | number | null>>();

    const today = nowIso().slice(0, 10);
    const lots = (rows.results ?? []).map((r) => {
      const eff = effectiveExpiry({
        printed: r.printed_expiry as string | null,
        openedAt: r.opened_at as string | null,
        postOpeningDays: r.post_opening_days as number | null,
      });
      return {
        ...r,
        // The winning clock travels with the date, so the UI can say WHY —
        // "expires Friday because it was opened Monday" can be checked and
        // corrected; a bare date cannot.
        expiry: eff.at,
        expiryReason: eff.reason,
        expiryStatus: expiryStatus(eff.at, today),
        daysLeft: daysUntilExpiry(eff.at, today),
      };
    });
    return c.json({ lots });
  })

  /** One lot's whole history — the "what happened to this" read. */
  .get("/stock/:lotId/history", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    return c.json({ events: await historyOf(c.env.DB, who.tenantId, "lot", c.req.param("lotId")) });
  });
