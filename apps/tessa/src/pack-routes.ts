/**
 * INSTRUMENTS AND TRAYS — the CSSD loop, minus the autoclave.
 *
 * A lot is a number on a shelf. A unit is an object with a life, and a pack is
 * several of them assembled into a thing that has its own life: built, run
 * through a cycle, released, put on a shelf with a date, opened once, and
 * dissolved back into dirty instruments. That last transition is the loop, and
 * it is the reason a single-granularity inventory model cannot describe this
 * building (TESSA.md §3.1).
 *
 * ── Why building a tray goes through `applyEvents` and not a loop ───────────
 *
 * Assembling a tray is ONE act touching N+1 rows. Done as N+1 separate calls,
 * the fourth instrument turning out to belong to another clinic leaves three
 * marked `packed` inside a tray that was never built: invisible stock, and — far
 * worse — a recall that names the wrong instruments. The plural chokepoint
 * refuses the whole act or performs the whole act; see ledger.ts.
 *
 * ── The shortfall is REPORTED, not enforced ─────────────────────────────────
 *
 * A recipe says what a tray is supposed to contain, and a build that does not
 * match it is worth knowing about. It is not worth refusing: a centre
 * legitimately builds variants, and an app that blocks the build is an app
 * people assemble trays beside instead of inside. So the difference is computed,
 * returned, and written into the ledger row's `meta` — where an auditor can find
 * it later — and the person decides. TESSA.md Rule 2, applied to a checklist.
 */

import { Hono } from "hono";
import { effectiveExpiry, expiryStatus, daysUntilExpiry } from "@tessa/domain";
import { newId, nowIso } from "@4dl/core";
import { type AppEnv, requireTenant, requirePermission } from "./auth-context.js";
import { applyEvent, applyEvents, historyOf, type EventInput } from "./ledger.js";

const FAILURE_STATUS: Record<string, 400 | 404 | 409> = {
  not_found: 404,
  not_applicable: 400,
  bad_delta: 400,
  not_divisible: 400,
  insufficient: 409,
  finished: 409,
  frozen: 409,
  conflict: 409,
  not_undoable: 400,
};

const FAILURE_TEXT: Record<string, string> = {
  not_found: "That isn't here.",
  not_applicable: "That action doesn't apply to this.",
  finished: "This is finished and can't be changed.",
  frozen: "This is quarantined. Release it first.",
  conflict: "Someone else just changed this. Check and try again.",
  not_undoable: "That action can't be part of a batch.",
};

export const packRoutes = new Hono<AppEnv>()

  // ── Instruments: one object, tracked for life ─────────────────────────────
  .get("/instruments", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const status = c.req.query("status");
    const rows = await c.env.DB
      .prepare(
        `SELECT u.id, u.catalog_item_id, u.location_id, u.serial, u.label_code, u.status, u.cycle_count, u.acquired_at,
                c.name AS item_name, c.reprocessing_class
         FROM units u LEFT JOIN catalog_items c ON c.id = u.catalog_item_id
         WHERE u.tenant_id = ? ${status ? "AND u.status = ?" : "AND u.status != 'retired'"}
         ORDER BY c.name, u.label_code LIMIT 500`,
      )
      .bind(...(status ? [who.tenantId, status] : [who.tenantId]))
      .all();
    return c.json({ instruments: rows.results ?? [] });
  })

  /**
   * Register an instrument.
   *
   * `label_code` is what gets printed and scanned, and it is UNIQUE per tenant
   * (schema.ts). That uniqueness is load-bearing rather than tidy: two
   * instruments answering to one scanned code makes every downstream history —
   * cycle counts, service records, the recall — attach to whichever row the
   * query happened to return.
   */
  .post("/instruments", async (c) => {
    const denied = requirePermission(c, { instrument: ["manage"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { catalogItemId?: string; serial?: string; labelCode?: string; locationId?: string; acquiredAt?: string; notes?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (!b.catalogItemId) return c.json({ error: "which instrument is it?" }, 400);
    if (!b.labelCode) return c.json({ error: "a label code is required" }, 400);

    const item = await c.env.DB
      .prepare("SELECT id FROM catalog_items WHERE id = ? AND tenant_id = ?")
      .bind(b.catalogItemId, who.tenantId)
      .first();
    if (!item) return c.json({ error: "unknown product" }, 404);
    if (b.locationId) {
      const loc = await c.env.DB.prepare("SELECT id FROM locations WHERE id = ? AND tenant_id = ?").bind(b.locationId, who.tenantId).first();
      if (!loc) return c.json({ error: "unknown location" }, 404);
    }

    const id = newId("unt");
    try {
      await c.env.DB
        .prepare("INSERT INTO units (id, tenant_id, catalog_item_id, location_id, serial, label_code, acquired_at, cycle_count, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'clean', ?, ?, ?)")
        .bind(id, who.tenantId, b.catalogItemId, b.locationId ?? null, b.serial ?? null, b.labelCode, b.acquiredAt ?? nowIso(), b.notes ?? null, nowIso(), nowIso())
        .run();
    } catch {
      // The unique index is the only thing that can reject this insert.
      return c.json({ error: "that label code is already in use" }, 409);
    }
    return c.json({ id }, 201);
  })

  /** Reprocess · retire · quarantine — the single-instrument acts. */
  .post("/instruments/:id/:action", async (c) => {
    const action = c.req.param("action");
    const SPEC: Record<string, { event: "cleaned" | "retired" | "quarantined"; perm: string }> = {
      clean: { event: "cleaned", perm: "manage" },
      retire: { event: "retired", perm: "retire" },
      quarantine: { event: "quarantined", perm: "manage" },
    };
    const spec = SPEC[action];
    if (!spec) return c.json({ error: "unknown action" }, 404);
    const denied = requirePermission(c, { instrument: [spec.perm] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { note?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);

    /**
     * An instrument inside a built tray is not reprocessable or retirable where
     * it stands — the tray has to be opened first. Without this the pack's
     * member list would keep naming an instrument that is no longer in it.
     */
    if (spec.event !== "quarantined") {
      const u = await c.env.DB.prepare("SELECT status FROM units WHERE id = ? AND tenant_id = ?").bind(c.req.param("id"), who.tenantId).first<{ status: string }>();
      if (u?.status === "packed") return c.json({ error: "This instrument is in a tray. Open the tray first." }, 409);
    }

    const r = await applyEvent(c.env.DB, {
      tenantId: who.tenantId,
      actorUserId: who.userId,
      event: spec.event,
      trackedKind: "unit",
      trackedId: c.req.param("id"),
      note: b.note ?? null,
    });
    if (!r.ok) return c.json({ error: FAILURE_TEXT[r.reason], reason: r.reason }, FAILURE_STATUS[r.reason] ?? 400);
    return c.json({ ok: true });
  })

  .get("/instruments/:id/history", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    return c.json({ events: await historyOf(c.env.DB, who.tenantId, "unit", c.req.param("id")) });
  })

  // ── Recipes: what a tray is supposed to contain ───────────────────────────
  .get("/recipes", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const recipes = await c.env.DB
      .prepare("SELECT id, name, code, sterile_shelf_days, notes FROM pack_recipes WHERE tenant_id = ? AND active = 1 ORDER BY name LIMIT 200")
      .bind(who.tenantId)
      .all<Record<string, unknown>>();
    const items = await c.env.DB
      .prepare("SELECT r.recipe_id, r.catalog_item_id, r.quantity, c.name FROM pack_recipe_items r LEFT JOIN catalog_items c ON c.id = r.catalog_item_id WHERE r.tenant_id = ? LIMIT 2000")
      .bind(who.tenantId)
      .all<{ recipe_id: string }>();
    return c.json({
      recipes: (recipes.results ?? []).map((r) => ({ ...r, items: (items.results ?? []).filter((i) => i.recipe_id === r.id) })),
    });
  })

  .post("/recipes", async (c) => {
    const denied = requirePermission(c, { pack: ["build"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { name?: string; code?: string; sterileShelfDays?: number; notes?: string; items?: { catalogItemId: string; quantity?: number }[] };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (!b.name) return c.json({ error: "name is required" }, 400);
    /**
     * The sterile shelf life is what turns a released tray into a dated one. A
     * recipe without it produces packs that never expire, which is wrong in the
     * unsafe direction, so it is required rather than defaulted — there is no
     * number we could pick here that would be right for a customer's practice.
     */
    if (!b.sterileShelfDays || b.sterileShelfDays <= 0) return c.json({ error: "how many days does a sterile pack last?" }, 400);

    const id = newId("rec");
    const statements = [
      c.env.DB
        .prepare("INSERT INTO pack_recipes (id, tenant_id, name, code, sterile_shelf_days, notes, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
        .bind(id, who.tenantId, b.name, b.code ?? null, b.sterileShelfDays, b.notes ?? null, nowIso(), nowIso()),
    ];
    for (const it of b.items ?? []) {
      if (!it.catalogItemId) continue;
      statements.push(
        c.env.DB
          .prepare("INSERT INTO pack_recipe_items (id, tenant_id, recipe_id, catalog_item_id, quantity) VALUES (?, ?, ?, ?, ?)")
          .bind(newId("rci"), who.tenantId, id, it.catalogItemId, it.quantity ?? 1),
      );
    }
    await c.env.DB.batch(statements);
    return c.json({ id }, 201);
  })

  // ── Packs ────────────────────────────────────────────────────────────────
  .get("/packs", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const status = c.req.query("status");
    const rows = await c.env.DB
      .prepare(
        `SELECT p.id, p.recipe_id, p.location_id, p.label_code, p.status, p.packed_at, p.cycle_id, p.sterilised_at,
                p.released_at, p.expiry, p.opened_at, p.case_id, r.name AS recipe_name, r.sterile_shelf_days
         FROM packs p LEFT JOIN pack_recipes r ON r.id = p.recipe_id
         WHERE p.tenant_id = ? ${status ? "AND p.status = ?" : "AND p.status != 'opened'"}
         ORDER BY p.expiry IS NULL, p.expiry LIMIT 500`,
      )
      .bind(...(status ? [who.tenantId, status] : [who.tenantId]))
      .all<Record<string, string | number | null>>();

    const today = nowIso().slice(0, 10);
    return c.json({
      packs: (rows.results ?? []).map((p) => {
        /**
         * A pack's expiry is computed from the same three-clock function as a
         * lot's, so the two surfaces cannot drift — but a released pack also
         * carries a stored `expiry`, and the stored one wins. See the release
         * route for why: it is printed on a physical label.
         */
        const eff = p.expiry
          ? { at: p.expiry as string, reason: "sterile" as const }
          : effectiveExpiry({ sterilisedAt: p.sterilised_at as string | null, sterileShelfDays: p.sterile_shelf_days as number | null });
        return { ...p, expiry: eff.at, expiryReason: eff.reason, expiryStatus: expiryStatus(eff.at, today), daysLeft: daysUntilExpiry(eff.at, today) };
      }),
    });
  })

  .get("/packs/:id", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const pack = await c.env.DB
      .prepare("SELECT p.*, r.name AS recipe_name, r.sterile_shelf_days FROM packs p LEFT JOIN pack_recipes r ON r.id = p.recipe_id WHERE p.id = ? AND p.tenant_id = ?")
      .bind(id, who.tenantId)
      .first<Record<string, unknown>>();
    if (!pack) return c.json({ error: "not found" }, 404);
    const members = await c.env.DB
      .prepare(
        `SELECT m.unit_id, u.label_code, u.serial, u.status, u.cycle_count, c.name AS item_name
         FROM pack_members m LEFT JOIN units u ON u.id = m.unit_id LEFT JOIN catalog_items c ON c.id = u.catalog_item_id
         WHERE m.tenant_id = ? AND m.pack_id = ?`,
      )
      .bind(who.tenantId, id)
      .all();
    return c.json({ pack, members: members.results ?? [], events: await historyOf(c.env.DB, who.tenantId, "pack", id) });
  })

  /**
   * BUILD A TRAY.
   *
   * The one act, through the plural chokepoint. Everything before the call is
   * validation that produces a sentence a person can act on ("instrument 4 is
   * already in another tray"), because `applyEvents`' refusals are correct but
   * terse — it knows `finished`, not "this one was retired last month".
   */
  .post("/packs", async (c) => {
    const denied = requirePermission(c, { pack: ["build"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { recipeId?: string; labelCode?: string; locationId?: string; unitIds?: string[]; notes?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (!b.recipeId) return c.json({ error: "which tray is this?" }, 400);
    if (!b.labelCode) return c.json({ error: "a label code is required" }, 400);
    const unitIds = [...new Set(b.unitIds ?? [])];
    if (unitIds.length !== (b.unitIds ?? []).length) return c.json({ error: "an instrument is listed twice" }, 400);
    if (unitIds.length === 0) return c.json({ error: "scan the instruments going in" }, 400);

    const recipe = await c.env.DB
      .prepare("SELECT id, name FROM pack_recipes WHERE id = ? AND tenant_id = ? AND active = 1")
      .bind(b.recipeId, who.tenantId)
      .first<{ id: string; name: string }>();
    if (!recipe) return c.json({ error: "unknown tray type" }, 404);
    if (b.locationId) {
      const loc = await c.env.DB.prepare("SELECT id FROM locations WHERE id = ? AND tenant_id = ?").bind(b.locationId, who.tenantId).first();
      if (!loc) return c.json({ error: "unknown location" }, 404);
    }

    /**
     * Every instrument, read in ONE query scoped to the tenant. Read one at a
     * time and an unknown id is indistinguishable from another clinic's — and
     * the report below would leak which of the two it was.
     */
    const found = await c.env.DB
      .prepare(`SELECT id, status, label_code, catalog_item_id FROM units WHERE tenant_id = ? AND id IN (${unitIds.map(() => "?").join(", ")})`)
      .bind(who.tenantId, ...unitIds)
      .all<{ id: string; status: string; label_code: string; catalog_item_id: string }>();
    const units = found.results ?? [];
    if (units.length !== unitIds.length) return c.json({ error: "one of those instruments isn't here" }, 404);

    // `clean` and nothing else. `applyEvents` would happily pack a `dirty`
    // instrument — it only refuses what is finished or frozen — so the rule that
    // an instrument is reprocessed before it goes in a tray lives here.
    const notClean = units.filter((u) => u.status !== "clean");
    if (notClean.length > 0) {
      return c.json(
        {
          error: "not_clean",
          message: `${notClean.length === 1 ? "One instrument isn't" : `${notClean.length} instruments aren't`} ready to be packed.`,
          instruments: notClean.map((u) => ({ id: u.id, labelCode: u.label_code, status: u.status })),
        },
        409,
      );
    }

    /**
     * The prep checklist: what the recipe asks for, against what was scanned.
     * Reported, never enforced — see the file header.
     */
    const wanted = await c.env.DB
      .prepare("SELECT catalog_item_id, quantity FROM pack_recipe_items WHERE tenant_id = ? AND recipe_id = ?")
      .bind(who.tenantId, b.recipeId)
      .all<{ catalog_item_id: string; quantity: number }>();
    const have = new Map<string, number>();
    for (const u of units) have.set(u.catalog_item_id, (have.get(u.catalog_item_id) ?? 0) + 1);
    const shortfall = (wanted.results ?? [])
      .map((w) => ({ catalogItemId: w.catalog_item_id, wanted: w.quantity, have: have.get(w.catalog_item_id) ?? 0 }))
      .filter((d) => d.have !== d.wanted);

    const packId = newId("pck");
    try {
      await c.env.DB
        .prepare("INSERT INTO packs (id, tenant_id, recipe_id, location_id, label_code, status, packed_at, packed_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'packed', ?, ?, ?, ?)")
        .bind(packId, who.tenantId, b.recipeId, b.locationId ?? null, b.labelCode, nowIso(), who.userId, nowIso(), nowIso())
        .run();
    } catch {
      return c.json({ error: "that label code is already in use" }, 409);
    }
    await c.env.DB.batch(
      unitIds.map((u) =>
        c.env.DB.prepare("INSERT INTO pack_members (id, tenant_id, pack_id, unit_id, added_at) VALUES (?, ?, ?, ?, ?)").bind(newId("pkm"), who.tenantId, packId, u, nowIso()),
      ),
    );

    const events: EventInput[] = [
      {
        tenantId: who.tenantId,
        actorUserId: who.userId,
        event: "packed",
        trackedKind: "pack",
        trackedId: packId,
        toLocationId: b.locationId ?? null,
        note: b.notes ?? null,
        // The discrepancy is recorded where an auditor will look for it, rather
        // than only shown to whoever happened to be building the tray.
        meta: shortfall.length > 0 ? { shortfall } : null,
      },
      ...unitIds.map(
        (u): EventInput => ({ tenantId: who.tenantId, actorUserId: who.userId, event: "packed", trackedKind: "unit", trackedId: u, meta: { packId } }),
      ),
    ];
    const r = await applyEvents(c.env.DB, events);
    if (!r.ok) {
      /**
       * Nothing in `units`/`packs` changed — the chokepoint unwound it. The
       * shell rows this route wrote are ours to clean up.
       *
       * ⚠️ This branch is NOT covered by the test suite, and cannot be: reaching
       * it needs an instrument to change status in the window between the
       * validation read above and the chokepoint's batch, which no single-isolate
       * test can produce. `packs.test.ts` drives two concurrent builds over one
       * instrument and asserts the invariant that holds either way, but in
       * practice that race always resolves through the `not_clean` check. Treat
       * this as reasoned-about, not proven.
       */
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM pack_members WHERE tenant_id = ? AND pack_id = ?").bind(who.tenantId, packId),
        c.env.DB.prepare("DELETE FROM packs WHERE tenant_id = ? AND id = ?").bind(who.tenantId, packId),
      ]).catch(() => undefined);
      return c.json({ error: FAILURE_TEXT[r.reason] ?? "Couldn't build that tray.", reason: r.reason }, FAILURE_STATUS[r.reason] ?? 400);
    }

    return c.json({ id: packId, labelCode: b.labelCode, members: unitIds.length, shortfall }, 201);
  })

  /**
   * OPEN A TRAY — the transition the whole model exists to express.
   *
   * The pack is finished (a sterile pack is single-use on opening) and every
   * instrument inside it lands in the dirty pool in the same act. Splitting the
   * two is how an instrument ends up `packed` inside a tray that was used an hour
   * ago, i.e. available to be packed again, unreprocessed.
   */
  .post("/packs/:id/open", async (c) => {
    const denied = requirePermission(c, { pack: ["open"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    const packId = c.req.param("id");
    type Body = { caseId?: string; note?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);

    const pack = await c.env.DB.prepare("SELECT id, status, expiry FROM packs WHERE id = ? AND tenant_id = ?").bind(packId, who.tenantId).first<{ status: string; expiry: string | null }>();
    if (!pack) return c.json({ error: "not found" }, 404);
    if (b.caseId) {
      const cs = await c.env.DB.prepare("SELECT id FROM cases WHERE id = ? AND tenant_id = ?").bind(b.caseId, who.tenantId).first();
      if (!cs) return c.json({ error: "unknown case" }, 404);
    }

    /**
     * An expired tray is REPORTED, not refused.
     *
     * Refusing here would be the app making a clinical decision, which TESSA.md
     * Rule 2 says it does not do — and it would be doing it in a treatment room
     * with a patient on the table, which is where people work around software.
     * The answer carries the fact so the UI can make it impossible to miss, and
     * the ledger records that it was opened knowingly.
     */
    const expired = pack.expiry ? expiryStatus(pack.expiry, nowIso().slice(0, 10)) === "expired" : false;

    const members = await c.env.DB
      .prepare("SELECT unit_id FROM pack_members WHERE tenant_id = ? AND pack_id = ?")
      .bind(who.tenantId, packId)
      .all<{ unit_id: string }>();

    const events: EventInput[] = [
      {
        tenantId: who.tenantId,
        actorUserId: who.userId,
        event: "opened",
        trackedKind: "pack",
        trackedId: packId,
        caseId: b.caseId ?? null,
        note: b.note ?? null,
        meta: expired ? { openedExpired: true, expiry: pack.expiry } : null,
      },
      ...(members.results ?? []).map(
        (m): EventInput => ({
          tenantId: who.tenantId,
          actorUserId: who.userId,
          event: "returned",
          trackedKind: "unit",
          trackedId: m.unit_id,
          caseId: b.caseId ?? null,
          meta: { packId },
        }),
      ),
    ];
    const r = await applyEvents(c.env.DB, events);
    if (!r.ok) return c.json({ error: FAILURE_TEXT[r.reason] ?? "Couldn't open that tray.", reason: r.reason }, FAILURE_STATUS[r.reason] ?? 400);
    return c.json({ ok: true, returned: members.results?.length ?? 0, expired });
  });
