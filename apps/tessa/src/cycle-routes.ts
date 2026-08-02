/**
 * STERILISATION LOADS, FREIGABE, AND THE RECALL.
 *
 * The reason Tessa exists rather than a spreadsheet. Everything before this file
 * is inventory; this is the part that answers "load 47 failed on Thursday —
 * where did it go", and it can only answer it because the ledger recorded every
 * step rather than overwriting a status column.
 *
 * ── The lifecycle, and why it has four states and not two ───────────────────
 *
 *   running           the door is shut, trays committed to the load
 *   ended             out of the machine; physical + chemical evidence recorded
 *   released          a NAMED person signed for it (Freigabe) — trays usable
 *   failed            it will not be used, at any point in the above
 *
 * `ended` and `released` are separate because the gap between them is where a
 * qualified person looks at the evidence. Collapsing them makes the autoclave
 * the releaser, which is exactly the control German practice imposes and the
 * line TESSA.md Rule 2 draws: the app records a person's decision, it does not
 * make one. `@tessa/domain`'s `releaseCheck` reports whether the evidence
 * PERMITS a release and stops there.
 *
 * ── The recall ──────────────────────────────────────────────────────────────
 *
 * The biological indicator is incubated and comes back a day or two later, so a
 * load is routinely released on the fast evidence and can fail afterwards. When
 * it does, this file quarantines every tray it can still reach and REPORTS the
 * ones it cannot — the opened ones, which have already been over a patient. That
 * second list is the point. A report showing only what it successfully froze
 * would read as a completed job and be the most dangerous screen in the product.
 */

import { Hono } from "hono";
import { biologicalOutcome, recallDisposition, releaseCheck, summariseRecall, type CycleEvidence } from "@tessa/domain";
import { newId, nowIso } from "@4dl/core";
import { type AppEnv, requireTenant, requirePermission } from "./auth-context.js";
import { applyEvents, type EventInput } from "./ledger.js";
import { notifyCategoryAudience } from "./notify.js";

/**
 * How a load is named to somebody who was not standing at the machine.
 *
 * "Load 47 on Autoclave 2" is what a person says out loud; a `cyc_…` id is not.
 * The cycle number is optional in the schema (some centres do not keep one), so
 * the machine carries the sentence when it is absent.
 */
function loadName(cycle: { machine?: string | null; cycle_number?: string | null }): string {
  return cycle.cycle_number ? `Load ${cycle.cycle_number} on ${cycle.machine ?? "the autoclave"}` : `The load on ${cycle.machine ?? "the autoclave"}`;
}

/** Copy for the refusals `releaseCheck` can produce. Sentences, not enums. */
const BLOCK_TEXT: Record<string, string> = {
  not_ended: "This load hasn't finished yet.",
  already_released: "This load was already released.",
  cycle_failed: "This load failed and can't be released.",
  missing_physical: "Record the machine's printout first.",
  missing_chemical: "Record the chemical indicator first.",
  indicator_failed: "An indicator failed — this load can't be released.",
  biological_pending: "This load needs its biological indicator before release.",
};

interface CycleRow {
  id: string;
  status: string;
  /** Both only for naming the load in a notification — see `loadName`. */
  machine?: string | null;
  cycle_number?: string | null;
  physical_ok: number | null;
  chemical_ok: number | null;
  biological_ok: number | null;
  require_biological?: number | null;
}

/** SQLite has no booleans. Null stays null — it means "not read yet". */
const bool = (v: number | null | undefined): boolean | null => (v == null ? null : v === 1);

const evidenceOf = (row: CycleRow): CycleEvidence => ({
  status: row.status as CycleEvidence["status"],
  physicalOk: bool(row.physical_ok),
  chemicalOk: bool(row.chemical_ok),
  biologicalOk: bool(row.biological_ok),
});

const cycleOf = (db: D1Database, tenantId: string, id: string) =>
  db.prepare("SELECT * FROM sterilisation_cycles WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first<CycleRow>();

const packsIn = (db: D1Database, tenantId: string, cycleId: string) =>
  db
    .prepare(
      `SELECT p.id, p.label_code, p.status, p.location_id, p.case_id, p.opened_at, p.sterilised_at, p.expiry, r.name AS recipe_name, r.sterile_shelf_days
       FROM packs p LEFT JOIN pack_recipes r ON r.id = p.recipe_id
       WHERE p.tenant_id = ? AND p.cycle_id = ?`,
    )
    .bind(tenantId, cycleId)
    .all<{ id: string; label_code: string; status: string; case_id: string | null; opened_at: string | null; sterilised_at: string | null; sterile_shelf_days: number | null }>();

/**
 * Freeze everything in a load that can still be frozen, and report what cannot.
 *
 * Used by BOTH failure paths — an indicator that fails at the end of the run and
 * a biological that fails days later — because the action is identical and only
 * the tragedy differs. Sharing it means the late path cannot quietly do less
 * than the early one.
 */
async function quarantineLoad(
  db: D1Database,
  tenantId: string,
  actorUserId: string,
  cycleId: string,
  reason: string,
): Promise<{ summary: ReturnType<typeof summariseRecall>; unreachable: unknown[]; frozen: string[] }> {
  const packs = (await packsIn(db, tenantId, cycleId)).results ?? [];
  const dispositions = packs.map((p) => recallDisposition(p.status));

  const freezable = packs.filter((_, i) => dispositions[i] === "quarantine");
  if (freezable.length > 0) {
    const events: EventInput[] = freezable.map((p) => ({
      tenantId,
      actorUserId,
      event: "quarantined",
      trackedKind: "pack",
      trackedId: p.id,
      cycleId,
      note: reason,
    }));
    await applyEvents(db, events);
  }

  /**
   * The unreachable list carries the CASE it was opened for, because that is the
   * only thread back to a person — and per TESSA.md Rule 1 the case reference is
   * an opaque string the clinic typed, which Tessa cannot resolve and does not
   * try to. Handing over the reference is the whole of what this app can do; the
   * rest happens in the centre's own records, by people, outside it.
   */
  const unreachable = packs
    .filter((_, i) => dispositions[i] === "unreachable")
    .map((p) => ({ id: p.id, labelCode: p.label_code, caseId: p.case_id, openedAt: p.opened_at }));

  return { summary: summariseRecall(dispositions), unreachable, frozen: freezable.map((p) => p.id) };
}

export const cycleRoutes = new Hono<AppEnv>()

  .get("/cycles", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const status = c.req.query("status");
    const rows = await c.env.DB
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM packs p WHERE p.tenant_id = c.tenant_id AND p.cycle_id = c.id) AS pack_count
         FROM sterilisation_cycles c WHERE c.tenant_id = ? ${status ? "AND c.status = ?" : ""}
         ORDER BY c.started_at DESC LIMIT 200`,
      )
      .bind(...(status ? [who.tenantId, status] : [who.tenantId]))
      .all();
    return c.json({ cycles: rows.results ?? [] });
  })

  .get("/cycles/:id", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const cycle = await cycleOf(c.env.DB, who.tenantId, c.req.param("id"));
    if (!cycle) return c.json({ error: "not found" }, 404);
    const packs = (await packsIn(c.env.DB, who.tenantId, cycle.id)).results ?? [];
    return c.json({
      cycle,
      packs,
      // What the evidence currently permits, so the release button can explain
      // itself instead of just being disabled.
      release: releaseCheck(evidenceOf(cycle), { requireBiological: cycle.require_biological === 1 }),
    });
  })

  /**
   * START A LOAD.
   *
   * The trays go in with it. Committing them at START rather than at end is what
   * makes "what was in load 47" answerable while the load is still running —
   * without it, a load that fails mid-run has no recoverable membership, which
   * is precisely when you most want one.
   */
  .post("/cycles", async (c) => {
    const denied = requirePermission(c, { sterilisation: ["run"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { machine?: string; program?: string; cycleNumber?: string; packIds?: string[]; requireBiological?: boolean; notes?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (!b.machine) return c.json({ error: "which machine?" }, 400);
    const packIds = [...new Set(b.packIds ?? [])];
    if (packIds.length === 0) return c.json({ error: "scan the trays going in" }, 400);

    const found = await c.env.DB
      .prepare(`SELECT id, status, label_code FROM packs WHERE tenant_id = ? AND id IN (${packIds.map(() => "?").join(", ")})`)
      .bind(who.tenantId, ...packIds)
      .all<{ id: string; status: string; label_code: string }>();
    const packs = found.results ?? [];
    if (packs.length !== packIds.length) return c.json({ error: "one of those trays isn't here" }, 404);

    // Only a built tray goes in. A tray already `in_cycle` is in another
    // machine, and one that is `sterile` would come out with a second cycle
    // recorded against an expiry derived from the first.
    const notReady = packs.filter((p) => p.status !== "packed");
    if (notReady.length > 0) {
      return c.json({ error: "not_ready", instruments: notReady.map((p) => ({ id: p.id, labelCode: p.label_code, status: p.status })) }, 409);
    }

    const id = newId("cyc");
    await c.env.DB
      .prepare("INSERT INTO sterilisation_cycles (id, tenant_id, machine, program, cycle_number, started_at, operator, status, require_biological, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)")
      .bind(id, who.tenantId, b.machine, b.program ?? null, b.cycleNumber ?? null, nowIso(), who.userId, b.requireBiological ? 1 : 0, b.notes ?? null, nowIso(), nowIso())
      .run();

    const r = await applyEvents(
      c.env.DB,
      packIds.map((p): EventInput => ({ tenantId: who.tenantId, actorUserId: who.userId, event: "loaded", trackedKind: "pack", trackedId: p, cycleId: id })),
    );
    if (!r.ok) {
      await c.env.DB.prepare("DELETE FROM sterilisation_cycles WHERE id = ? AND tenant_id = ?").bind(id, who.tenantId).run().catch(() => undefined);
      return c.json({ error: "Couldn't start that load — check the trays and try again.", reason: r.reason }, 409);
    }
    return c.json({ id, packs: packIds.length }, 201);
  })

  /**
   * END A LOAD — the fast evidence.
   *
   * Physical and chemical are read the moment the door opens; the biological is
   * still in an incubator. Recording all three as one boolean here is the single
   * change that would make a recall impossible to describe later, which is why
   * the schema keeps them apart and this route only ever writes two of them.
   */
  .post("/cycles/:id/end", async (c) => {
    const denied = requirePermission(c, { sterilisation: ["run"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { physicalOk?: boolean; chemicalOk?: boolean; evidenceKey?: string; notes?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (typeof b.physicalOk !== "boolean") return c.json({ error: "did the machine's printout pass?" }, 400);
    if (typeof b.chemicalOk !== "boolean") return c.json({ error: "did the chemical indicator pass?" }, 400);

    const cycle = await cycleOf(c.env.DB, who.tenantId, c.req.param("id"));
    if (!cycle) return c.json({ error: "not found" }, 404);
    if (cycle.status !== "running") return c.json({ error: "This load has already finished." }, 409);

    const failed = !b.physicalOk || !b.chemicalOk;
    const at = nowIso();
    await c.env.DB
      .prepare("UPDATE sterilisation_cycles SET status = ?, ended_at = ?, physical_ok = ?, chemical_ok = ?, evidence_key = ?, failed_at = ?, failure_reason = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'running'")
      .bind(
        failed ? "failed" : "ended",
        at,
        b.physicalOk ? 1 : 0,
        b.chemicalOk ? 1 : 0,
        b.evidenceKey ?? null,
        failed ? at : null,
        failed ? (!b.physicalOk ? "physical indicator" : "chemical indicator") : null,
        b.notes ?? null,
        at,
        cycle.id,
        who.tenantId,
      )
      .run();

    if (failed) {
      // Same freeze as a late biological failure — see `quarantineLoad`. Nothing
      // in this load has been used yet, so `unreachable` should be empty; it is
      // still reported rather than assumed.
      const recall = await quarantineLoad(c.env.DB, who.tenantId, who.userId, cycle.id, `cycle failed: ${!b.physicalOk ? "physical" : "chemical"} indicator`);
      // `force` — a failed load is not a preference. Nothing here has been used,
      // so this is the cheap kind of bad news, but the people who plan the day's
      // sets need it before they go looking for trays that are frozen.
      await notifyCategoryAudience(c.env, who.tenantId, {
        type: "cycle_failed",
        title: `${loadName(cycle)} failed`,
        message: `The ${!b.physicalOk ? "machine's printout" : "chemical indicator"} did not pass. ${recall.frozen.length} tray(s) are quarantined and cannot be used.`,
        link: `/cycles/${cycle.id}`,
        dedupeKey: `cycfail_${cycle.id}`,
        force: true,
      });
      return c.json({ status: "failed", ...recall });
    }

    /**
     * The trays come out sterilised but NOT yet usable. `awaiting_release` is a
     * real state, not a formality: it is what makes the Freigabe below a
     * decision somebody makes rather than a side effect of the door opening.
     */
    const packs = (await packsIn(c.env.DB, who.tenantId, cycle.id)).results ?? [];
    const r = await applyEvents(
      c.env.DB,
      packs
        .filter((p) => p.status === "in_cycle")
        .map((p): EventInput => ({ tenantId: who.tenantId, actorUserId: who.userId, event: "sterilised", trackedKind: "pack", trackedId: p.id, cycleId: cycle.id })),
    );
    if (!r.ok) return c.json({ error: "Couldn't record that load.", reason: r.reason }, 409);
    // The Freigabe is frequently not the person who ran the machine, and until
    // they give it the trays are sterile and unusable. A load sitting in
    // `awaiting_release` overnight is the ordinary way a centre runs short.
    await notifyCategoryAudience(c.env, who.tenantId, {
      type: "release_pending",
      title: `${loadName(cycle)} is waiting on a release`,
      message: `${packs.length} tray(s) came out clean and can't be used until somebody signs for the load.`,
      link: `/cycles/${cycle.id}`,
      dedupeKey: `cycend_${cycle.id}`,
    });
    return c.json({ status: "ended", packs: packs.length, release: releaseCheck({ ...evidenceOf(cycle), status: "ended", physicalOk: true, chemicalOk: true }, { requireBiological: cycle.require_biological === 1 }) });
  })

  /**
   * FREIGABE — release, by a named person.
   *
   * `sterilisation:release` is a permission of its own, separate from
   * `sterilisation:run` (access.ts): German practice expects a qualified person
   * to release a load against its evidence, and that is frequently not whoever
   * loaded the machine. Collapsing the two would make every autoclave operator a
   * releaser by default, which is the control the regulation exists to impose.
   */
  .post("/cycles/:id/release", async (c) => {
    const denied = requirePermission(c, { sterilisation: ["release"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    const cycle = await cycleOf(c.env.DB, who.tenantId, c.req.param("id"));
    if (!cycle) return c.json({ error: "not found" }, 404);

    const verdict = releaseCheck(evidenceOf(cycle), { requireBiological: cycle.require_biological === 1 });
    if (!verdict.ok) return c.json({ error: BLOCK_TEXT[verdict.reason] ?? "This load can't be released.", reason: verdict.reason }, 409);

    const at = nowIso();
    const packs = (await packsIn(c.env.DB, who.tenantId, cycle.id)).results ?? [];

    /**
     * The pack's expiry is MATERIALISED here, and this is the one place in Tessa
     * where a derived date is stored rather than computed at read.
     *
     * A lot's effective expiry is recomputed every time because one of its
     * inputs is a catalog default that can change. A released pack is the
     * opposite case: the date goes on a physical label that goes into a drawer,
     * and if someone edits the recipe's shelf life next month the sticker in the
     * drawer does not change with it. Recomputing would make the app disagree
     * with the label, and the label is what the person holding the tray reads.
     */
    const events: EventInput[] = packs
      .filter((p) => p.status === "awaiting_release")
      .map((p): EventInput => {
        const days = p.sterile_shelf_days ?? 0;
        const from = p.sterilised_at ?? at;
        const expiry = days > 0 ? new Date(Date.parse(`${from.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10) : null;
        return { tenantId: who.tenantId, actorUserId: who.userId, event: "released", trackedKind: "pack", trackedId: p.id, cycleId: cycle.id, expiresAt: expiry };
      });
    if (events.length === 0) return c.json({ error: "There are no trays awaiting release in this load." }, 409);

    const r = await applyEvents(c.env.DB, events);
    if (!r.ok) return c.json({ error: "Couldn't release that load.", reason: r.reason }, 409);

    await c.env.DB
      .prepare("UPDATE sterilisation_cycles SET status = 'released', released_at = ?, released_by = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'ended'")
      .bind(at, who.userId, at, cycle.id, who.tenantId)
      .run();

    /**
     * Each instrument in a released tray has been through one more reprocessing
     * cycle. `cycle_count` is a COUNTER, not a state: it is derived from the
     * pack's `released` ledger rows over pack membership and is rebuildable from
     * them, which is why it moves with a plain UPDATE rather than an event of
     * its own. MPBetreibV expects the service history to be there; this is the
     * cheap half of it.
     */
    await c.env.DB
      .prepare(
        `UPDATE units SET cycle_count = cycle_count + 1, updated_at = ?
         WHERE tenant_id = ? AND id IN (SELECT unit_id FROM pack_members WHERE tenant_id = ? AND pack_id IN (${events.map(() => "?").join(", ")}))`,
      )
      .bind(at, who.tenantId, who.tenantId, ...events.map((e) => e.trackedId))
      .run();

    await notifyCategoryAudience(c.env, who.tenantId, {
      type: "load_released",
      title: `${loadName(cycle)} was released`,
      message: `${events.length} tray(s) are now usable.${verdict.biologicalPending ? " The biological indicator is still incubating." : ""}`,
      link: `/cycles/${cycle.id}`,
      dedupeKey: `cycrel_${cycle.id}`,
    });

    return c.json({ ok: true, released: events.length, biologicalPending: verdict.biologicalPending });
  })

  /**
   * THE BIOLOGICAL INDICATOR — the reading that arrives late.
   *
   * On a released load a failure here is a RECALL, and that is the whole reason
   * every step above is an event rather than a column: nothing else can say what
   * the state of a tray was at the moment it was opened.
   */
  .post("/cycles/:id/biological", async (c) => {
    const denied = requirePermission(c, { sterilisation: ["release"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    type Body = { passed?: boolean; notes?: string };
    const b = await c.req.json<Body>().catch(() => ({}) as Body);
    if (typeof b.passed !== "boolean") return c.json({ error: "did the biological indicator pass?" }, 400);

    const cycle = await cycleOf(c.env.DB, who.tenantId, c.req.param("id"));
    if (!cycle) return c.json({ error: "not found" }, 404);

    const outcome = biologicalOutcome(evidenceOf(cycle), b.passed);
    if (outcome === "contradiction") {
      /**
       * A second reading that disagrees with the first is refused, not applied.
       * Overwriting it would quietly rewrite the evidence this load's release
       * was justified by — the one thing an audit trail may never do. A person
       * has to say which reading is true and why.
       */
      return c.json(
        { error: "This load already has a different biological result recorded. That has to be resolved by hand.", reason: "contradiction", recorded: bool(cycle.biological_ok) },
        409,
      );
    }

    const at = nowIso();
    await c.env.DB
      .prepare("UPDATE sterilisation_cycles SET biological_ok = ?, biological_read_at = ?, biological_read_by = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(b.passed ? 1 : 0, at, who.userId, b.notes ?? null, at, cycle.id, who.tenantId)
      .run();

    if (outcome === "confirmed" || outcome === "cleared") return c.json({ outcome });

    // Failed. The load is marked failed whether or not it had been released —
    // and if it HAD, everything reachable is frozen and everything that is not
    // is named.
    await c.env.DB
      .prepare("UPDATE sterilisation_cycles SET status = 'failed', failed_at = ?, failure_reason = 'biological indicator', updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(at, at, cycle.id, who.tenantId)
      .run();
    const recall = await quarantineLoad(c.env.DB, who.tenantId, who.userId, cycle.id, "biological indicator failed");
    /**
     * The one notification in this app that is genuinely urgent, and the reason
     * the whole inbox is worth wiring: this load may already have been released,
     * and `recall.unreachable` is the list of trays that were opened over a
     * patient. `force` bypasses every preference — nobody opts out of this.
     */
    await notifyCategoryAudience(c.env, who.tenantId, {
      type: "recall_issued",
      title: `RECALL — ${loadName(cycle)} failed its biological indicator`,
      message:
        recall.unreachable.length > 0
          ? `${recall.frozen.length} tray(s) frozen. ${recall.unreachable.length} were already opened and cannot be recalled — open the report for their case references.`
          : `${recall.frozen.length} tray(s) frozen. Nothing from this load had been opened.`,
      link: `/cycles/${cycle.id}`,
      dedupeKey: `cycbio_${cycle.id}`,
      force: true,
    });
    return c.json({ outcome, ...recall });
  })

  /**
   * THE RECALL REPORT — readable at any time, not only at the moment of failure.
   *
   * Separate from the failure route on purpose. A recall is not a single moment
   * somebody was looking at a screen for: it is a document a clinic works
   * through over days and hands to an inspector afterwards, so it has to be
   * re-openable, and it has to be readable by an auditor who can do nothing else
   * (`trace:read` — access.ts).
   */
  .get("/trace/cycle/:id", async (c) => {
    const denied = requirePermission(c, { trace: ["read"] });
    if (denied) return denied;
    const who = requireTenant(c)!;
    const cycle = await cycleOf(c.env.DB, who.tenantId, c.req.param("id"));
    if (!cycle) return c.json({ error: "not found" }, 404);

    const packs = (await packsIn(c.env.DB, who.tenantId, cycle.id)).results ?? [];
    const dispositions = packs.map((p) => recallDisposition(p.status));

    /**
     * The instruments too. A recall reads backwards from the load to the trays
     * to the instruments that were inside them — and the instruments outlive the
     * trays, so "this forceps was in the failed load" stays true after the tray
     * it was in has been opened and dissolved.
     */
    const instruments = packs.length
      ? await c.env.DB
          .prepare(
            `SELECT m.pack_id, m.unit_id, u.label_code, u.status, c2.name AS item_name
             FROM pack_members m LEFT JOIN units u ON u.id = m.unit_id LEFT JOIN catalog_items c2 ON c2.id = u.catalog_item_id
             WHERE m.tenant_id = ? AND m.pack_id IN (${packs.map(() => "?").join(", ")})`,
          )
          .bind(who.tenantId, ...packs.map((p) => p.id))
          .all()
      : { results: [] };

    return c.json({
      cycle,
      summary: summariseRecall(dispositions),
      packs: packs.map((p, i) => ({ ...p, disposition: dispositions[i] })),
      instruments: instruments.results ?? [],
    });
  });
