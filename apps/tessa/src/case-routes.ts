/**
 * CASES — the other direction of the trace.
 *
 * The recall reads forwards: a load failed, which trays came out of it, which of
 * those were opened. A case reads BACKWARDS: this procedure happened, what went
 * into it, and — the question that makes the feature worth building — was any of
 * it from a load that has since failed.
 *
 * Both directions run over the same ledger rows. Nothing here is a second copy
 * of the truth; a case is a lens on `ledger.case_id`, which is why a case can be
 * opened after the fact and still be complete.
 *
 * ── TESSA.md Rule 1, at its sharpest ────────────────────────────────────────
 *
 * A case holds a `case_ref` — an opaque string the centre typed — and a
 * `procedure_code` the centre chose. No name, no date of birth, no diagnosis, no
 * description. This is the table where the temptation to add "just the patient's
 * initials" is strongest, and it is also the table where doing so would drag the
 * whole app into the health sector's regulatory weight for no gain: the question
 * a case answers is "what did we use", which never needs to know who it was for.
 * `conformance.test.ts` asserts the absence of those columns rather than trusting
 * this comment.
 *
 * ── Closing, and the amendment nobody plans for ─────────────────────────────
 *
 * Somebody remembers a gauze pack twenty minutes after closing. Refusing outright
 * makes the record wrong; letting a closed case absorb writes silently makes
 * "closed" mean nothing. So a closed case refuses, and REOPENING it is a person's
 * act that is counted — `reopen_count > 0` is what tells an auditor this record
 * was amended rather than written once.
 */

import { Hono } from "hono";
import { newId, nowIso } from "@4dl/core";
import { type AppEnv, requireTenant, requirePermission } from "./auth-context.js";

/** One consumption or opening logged against a case, with what it touched. */
interface CaseLine {
  id: string;
  at: string;
  actor_user_id: string;
  event: string;
  tracked_kind: string;
  tracked_id: string;
  quantity_delta: number | null;
  item_name: string | null;
  label_code: string | null;
  /** For a pack: the load it came out of, and how that load ended up. */
  cycle_id: string | null;
  cycle_status: string | null;
  cycle_number: string | null;
}

const caseOf = (db: D1Database, tenantId: string, id: string) =>
  db.prepare("SELECT * FROM cases WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first<Record<string, unknown>>();

/**
 * Everything logged against a case.
 *
 * The join to `sterilisation_cycles` is the point of the whole query: a pack
 * carries the load it came out of, so a case can be re-read later against
 * evidence that did not exist when it was closed. That is the same fact the
 * recall reports, arriving from the other side.
 */
async function linesFor(db: D1Database, tenantId: string, caseId: string): Promise<CaseLine[]> {
  const rows = await db
    .prepare(
      `SELECT l.id, l.at, l.actor_user_id, l.event, l.tracked_kind, l.tracked_id, l.quantity_delta,
              COALESCE(ci.name, u_ci.name, r.name) AS item_name,
              COALESCE(p.label_code, u.label_code, lo.lot_code) AS label_code,
              p.cycle_id AS cycle_id, cy.status AS cycle_status, cy.cycle_number AS cycle_number
       FROM ledger l
       LEFT JOIN catalog_items ci ON ci.id = l.catalog_item_id
       LEFT JOIN packs p  ON p.id  = l.tracked_id AND l.tracked_kind = 'pack'
       LEFT JOIN pack_recipes r ON r.id = p.recipe_id
       LEFT JOIN units u  ON u.id  = l.tracked_id AND l.tracked_kind = 'unit'
       LEFT JOIN catalog_items u_ci ON u_ci.id = u.catalog_item_id
       LEFT JOIN lots  lo ON lo.id = l.tracked_id AND l.tracked_kind = 'lot'
       LEFT JOIN sterilisation_cycles cy ON cy.id = p.cycle_id
       WHERE l.tenant_id = ? AND l.case_id = ?
       ORDER BY l.at DESC LIMIT 500`,
    )
    .bind(tenantId, caseId)
    .all<CaseLine>();
  return rows.results ?? [];
}

export const caseRoutes = new Hono<AppEnv>()

  .get("/cases", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const status = c.req.query("status");
    const rows = await c.env.DB
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM ledger l WHERE l.tenant_id = c.tenant_id AND l.case_id = c.id) AS line_count
         FROM cases c WHERE c.tenant_id = ? ${status ? "AND c.status = ?" : ""}
         ORDER BY c.opened_at DESC LIMIT 200`,
      )
      .bind(...(status ? [who.tenantId, status] : [who.tenantId]))
      .all();
    return c.json({ cases: rows.results ?? [] });
  })

  .get("/cases/:id", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const row = await caseOf(c.env.DB, who.tenantId, c.req.param("id"));
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ case: row, lines: await linesFor(c.env.DB, who.tenantId, c.req.param("id")) });
  })

  /**
   * OPEN A CASE.
   *
   * `caseRef` is required and everything else is not, because the reference is
   * the only thing that makes the record findable from the centre's own system —
   * a case with no reference is a list of consumed stock nobody can attach to
   * anything.
   */
  .post("/cases", async (c) => {
    const denied = requirePermission(c, { case: ["create"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { caseRef?: string; procedureCode?: string; locationId?: string; notes?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (!b.caseRef?.trim()) return c.json({ error: "a case reference is required" }, 400);
    if (b.locationId) {
      const loc = await c.env.DB.prepare("SELECT id FROM locations WHERE id = ? AND tenant_id = ?").bind(b.locationId, who.tenantId).first();
      if (!loc) return c.json({ error: "unknown location" }, 404);
    }

    const id = newId("cas");
    const at = nowIso();
    await c.env.DB
      .prepare("INSERT INTO cases (id, tenant_id, case_ref, procedure_code, location_id, status, opened_at, opened_by, reopen_count, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, 0, ?, ?, ?)")
      .bind(id, who.tenantId, b.caseRef.trim(), b.procedureCode ?? null, b.locationId ?? null, at, who.userId, b.notes ?? null, at, at)
      .run();
    return c.json({ id, caseRef: b.caseRef.trim() }, 201);
  })

  /**
   * CLOSE — and REOPEN, which is the same route because they are the same
   * decision made twice.
   *
   * Both record WHO. A close with no name is an assertion nobody made
   * (TESSA.md Rule 2), and a reopen with no name is worse: it is an amendment
   * with no author.
   */
  .post("/cases/:id/:action", async (c) => {
    const action = c.req.param("action");
    if (action !== "close" && action !== "reopen") return c.json({ error: "unknown action" }, 404);
    const denied = requirePermission(c, { case: ["close"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { notes?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);

    const row = await caseOf(c.env.DB, who.tenantId, c.req.param("id"));
    if (!row) return c.json({ error: "not found" }, 404);
    const status = row.status as string;
    if (action === "close" && status !== "open") return c.json({ error: "That case is already closed." }, 409);
    if (action === "reopen" && status === "open") return c.json({ error: "That case is already open." }, 409);

    const at = nowIso();
    if (action === "close") {
      await c.env.DB
        .prepare("UPDATE cases SET status = 'closed', closed_at = ?, closed_by = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'open'")
        .bind(at, who.userId, b.notes ?? null, at, row.id, who.tenantId)
        .run();
      return c.json({ ok: true, status: "closed" });
    }

    /**
     * `closed_at` is deliberately LEFT IN PLACE on a reopen.
     *
     * It is the timestamp everything logged from here on is late relative to,
     * and clearing it would erase the only marker of when the original record
     * stopped. The count says it was amended; the old close date says amended
     * *after what*.
     */
    await c.env.DB
      .prepare("UPDATE cases SET status = 'open', reopened_at = ?, reopened_by = ?, reopen_count = COALESCE(reopen_count, 0) + 1, notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ? AND status != 'open'")
      .bind(at, who.userId, b.notes ?? null, at, row.id, who.tenantId)
      .run();
    return c.json({ ok: true, status: "open", reopenCount: ((row.reopen_count as number) ?? 0) + 1 });
  })

  /**
   * THE REVERSE TRACE — what did this procedure use, and is any of it in doubt?
   *
   * `concerns` is the reason this endpoint exists rather than the case detail
   * being enough. A case closed on Tuesday was correct on Tuesday; on Thursday a
   * load it drew from failed, and the same rows now mean something different.
   * Nothing about the case changed — the evidence around it did, and only a
   * query that joins the two can say so.
   *
   * Behind `trace:read`, so an auditor holding nothing else can read it
   * (access.ts).
   */
  .get("/trace/case/:id", async (c) => {
    const denied = requirePermission(c, { trace: ["read"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    const row = await caseOf(c.env.DB, who.tenantId, c.req.param("id"));
    if (!row) return c.json({ error: "not found" }, 404);

    const lines = await linesFor(c.env.DB, who.tenantId, c.req.param("id"));

    /**
     * A tray from a failed load. Reported per LINE rather than deduplicated to a
     * count, because acting on it means going to each one — and because a count
     * of "1 concern" reads as smaller than it is.
     */
    const concerns = lines
      .filter((l) => l.tracked_kind === "pack" && l.cycle_status === "failed")
      .map((l) => ({ packId: l.tracked_id, labelCode: l.label_code, cycleId: l.cycle_id, cycleNumber: l.cycle_number, at: l.at }));

    /**
     * Instruments reach the case only through the tray they were in, so they are
     * resolved through membership rather than expected on the ledger row. An
     * instrument outlives the tray, which is what makes "has this forceps been
     * in a case that is now in doubt" answerable at all.
     */
    const packIds = [...new Set(lines.filter((l) => l.tracked_kind === "pack").map((l) => l.tracked_id))];
    const instruments = packIds.length
      ? await c.env.DB
          .prepare(
            `SELECT m.pack_id, m.unit_id, u.label_code, u.serial, u.cycle_count, ci.name AS item_name
             FROM pack_members m LEFT JOIN units u ON u.id = m.unit_id LEFT JOIN catalog_items ci ON ci.id = u.catalog_item_id
             WHERE m.tenant_id = ? AND m.pack_id IN (${packIds.map(() => "?").join(", ")})`,
          )
          .bind(who.tenantId, ...packIds)
          .all()
      : { results: [] };

    return c.json({
      case: row,
      lines,
      instruments: instruments.results ?? [],
      concerns,
      // Surfaced rather than left for the reader to derive from `reopen_count`:
      // an amended record is a different kind of document from one written once.
      amended: ((row.reopen_count as number) ?? 0) > 0,
    });
  });
