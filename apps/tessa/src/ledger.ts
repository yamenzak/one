/**
 * THE ONE WAY A TRACKED THING CHANGES.
 *
 * Tessa's schema says the ledger is the truth and `lots.quantity`,
 * `units.status`, `packs.status` are caches of it. That is only true if it is
 * impossible to write one without the other, and a convention that each route
 * remembers is not impossible — it is merely usual. This module is the
 * enforcement: **no route writes a lot, unit or pack directly. They call
 * `applyEvent`.**
 *
 * It is Tessa's equivalent of Kova's `requireClientAccess`: one chokepoint, and
 * the value is entirely in it never being bypassed.
 *
 * ── The three properties it has to have ─────────────────────────────────────
 *
 * ATOMIC. The ledger row and the state change go in a single `db.batch()`, which
 * D1 runs as one transaction. Two separate `run()` calls would leave a window in
 * which a crash produces either a state change nobody can account for or a
 * ledger entry describing something that did not happen — and the audit trail is
 * worth nothing if it can be wrong in either direction.
 *
 * CONCURRENT-SAFE. The state update carries a compare-and-set on the value that
 * was read. Two people consuming the last two units of the same lot at the same
 * moment is not a hypothetical in a busy clinic; without the CAS both succeed
 * and the shelf disagrees with the app. Same technique as Kova's runway update.
 *
 * REFUSING. Insufficient stock, a terminal status, an event that does not apply
 * to this kind of thing — all are refusals, never clamps. See
 * `@tessa/domain`'s `nextQuantity` for why a clamp is worse than an error.
 */

import {
  EVENTS,
  eventAppliesTo,
  isFinished,
  isFrozen,
  nextQuantity,
  type EventName,
  type TrackedKind,
} from "@tessa/domain";
import { newId, nowIso } from "@4dl/core";
import { j } from "./db.js";

export interface EventInput {
  tenantId: string;
  /** WHO. Never a system actor — TESSA.md Rule 2. */
  actorUserId: string;
  event: EventName;
  trackedKind: TrackedKind;
  trackedId: string;
  /** Required for `consumed` / `wasted` / `received`; ignored otherwise. */
  quantity?: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  caseId?: string | null;
  cycleId?: string | null;
  note?: string | null;
  meta?: Record<string, unknown> | null;
}

export type EventFailure =
  | "not_found"
  | "not_applicable"
  | "finished"
  | "frozen"
  | "insufficient"
  | "bad_delta"
  | "not_divisible"
  | "conflict";

export type EventOutcome = { ok: true; ledgerId: string; quantity?: number } | { ok: false; reason: EventFailure };

/** The columns every tracked kind exposes to this module. */
interface TrackedRow {
  id: string;
  status: string;
  location_id: string | null;
  quantity: number | null;
  catalog_item_id: string | null;
  divisible: number | null;
}

const TABLE: Record<TrackedKind, string> = { lot: "lots", unit: "units", pack: "packs" };

/**
 * Read the thing, scoped to its tenant.
 *
 * `WHERE id = ? AND tenant_id = ?` on the READ is what makes every write below
 * tenant-safe without each caller remembering — the CAS then re-asserts it.
 *
 * `divisible` is joined from the catalog rather than stored on the instance: it
 * is a property of the TYPE, and copying it onto every lot would let the two
 * drift the first time someone corrects a catalog entry.
 */
async function readTracked(db: D1Database, kind: TrackedKind, tenantId: string, id: string): Promise<TrackedRow | null> {
  if (kind === "lot") {
    return db
      .prepare(
        "SELECT l.id, l.status, l.location_id, l.quantity, l.catalog_item_id, CASE WHEN c.consumption = 'divisible' THEN 1 ELSE 0 END AS divisible FROM lots l LEFT JOIN catalog_items c ON c.id = l.catalog_item_id WHERE l.id = ? AND l.tenant_id = ?",
      )
      .bind(id, tenantId)
      .first<TrackedRow>();
  }
  /**
   * A PACK has no catalog item and cannot borrow one: it is an assembly of
   * several, described by a recipe. The ledger row for a pack event therefore
   * carries a null `catalog_item_id`, which is the honest answer — the earlier
   * version selected the column generically and 500'd on every pack event,
   * because `packs` does not have it.
   */
  const columns = kind === "unit" ? "catalog_item_id" : "NULL AS catalog_item_id";
  return db
    .prepare(`SELECT id, status, location_id, NULL AS quantity, ${columns}, 0 AS divisible FROM ${TABLE[kind]} WHERE id = ? AND tenant_id = ?`)
    .bind(id, tenantId)
    .first<TrackedRow>();
}

/**
 * What a given event does to the thing's own row.
 *
 * Per KIND, not per event, because the same word means different things: opening
 * a LOT starts the post-opening clock, while opening a PACK commits the whole
 * thing. Returning the SQL fragment plus its binds — rather than running it —
 * keeps this a pure decision that the caller batches with the ledger insert.
 *
 * Each column is declared with the value it moves TO and the value it came
 * FROM, so the same declaration yields both the update and the statement that
 * puts the row back. `applyEvents` needs the second half: when one member of a
 * multi-row act loses its compare-and-set, the members that already landed have
 * to be unwound, and a hand-written unwind is exactly the code that rots out of
 * step with the projection it is supposed to mirror.
 */
interface Projection {
  sql: string;
  binds: unknown[];
  /** Puts the row back. Null when the change cannot be expressed as an undo. */
  revert: { sql: string; binds: unknown[] } | null;
}

function projection(
  kind: TrackedKind,
  input: EventInput,
  row: TrackedRow,
  nextQty: number | null,
  at: string,
): Projection | null {
  const table = TABLE[kind];
  /** `to` may be a raw value or a SQL expression; an expression cannot be undone. */
  const cols: { col: string; to: unknown; expr?: string; from: unknown }[] = [];
  const set = (col: string, to: unknown, from: unknown) => cols.push({ col, to, from });

  if (nextQty !== null) {
    set("quantity", nextQty, row.quantity);
    // A lot that reaches zero is closed rather than left at 0 and "active": an
    // empty-but-active lot keeps appearing in pick lists forever.
    if (nextQty === 0) set("status", input.event === "wasted" ? "discarded" : "consumed", row.status);
  }

  if (input.event === "moved" && input.toLocationId) set("location_id", input.toLocationId, row.location_id);

  /**
   * Packing, per kind. The pack becomes a thing that exists; each member unit
   * stops being available to be packed into a second tray at the same time.
   *
   * The unit half is not bookkeeping — without it, "which instruments were in
   * the load that failed" has no answer, and that question is the product.
   */
  if (input.event === "packed" && kind === "unit") set("status", "packed", row.status);

  /**
   * A unit coming back out of an opened pack lands in the DIRTY pool, not in
   * `clean`. It has been through a procedure; deciding it is clean is a
   * reprocessing act somebody performs and records, and short-cutting it here
   * would let an instrument go from a patient straight into the next tray.
   */
  if (input.event === "returned" && kind === "unit") set("status", "dirty", row.status);

  if (input.event === "cleaned" && kind === "unit") set("status", "clean", row.status);

  if (input.event === "opened") {
    if (kind === "lot") {
      /**
       * Only if not already open. Re-opening would restart the post-opening
       * clock and silently EXTEND an expiry — the unsafe direction.
       *
       * COALESCE makes this the one projection that cannot be undone: the
       * update is a no-op over an existing value, so an undo would have to know
       * whether it wrote anything. `revert` is therefore null and the plural
       * path refuses the event outright rather than guessing.
       */
      cols.push({ col: "opened_at", to: at, expr: "COALESCE(opened_at, ?)", from: null });
      cols.push({ col: "opened_by", to: input.actorUserId, expr: "COALESCE(opened_by, ?)", from: null });
    } else {
      set("status", "opened", row.status);
      set("opened_at", at, null);
      set("opened_by", input.actorUserId, null);
      if (input.caseId) set("case_id", input.caseId, null);
    }
  }

  if (input.event === "quarantined") {
    set("status", "quarantined", row.status);
    set("quarantine_reason", input.note ?? null, null);
  }

  if (input.event === "retired") {
    set("status", "retired", row.status);
    set("retired_at", at, null);
    set("retired_reason", input.note ?? null, null);
  }

  if (cols.length === 0) return null;

  /**
   * The compare-and-set. `status` and `quantity` are both re-asserted against
   * what was read, so a concurrent writer that changed either makes this update
   * affect zero rows and the whole batch is reported as a conflict rather than
   * silently overwriting them.
   */
  const guard = kind === "lot" ? "AND status = ? AND quantity = ?" : "AND status = ?";
  const at_ = (c: string) => cols.find((x) => x.col === c);
  const wroteStatus = at_("status");
  const readGuard = kind === "lot" ? [row.status, row.quantity] : [row.status];
  // The revert's CAS names what this call WROTE, so a third party who changed
  // the row in between keeps their change instead of being rolled back.
  const wroteGuard = kind === "lot"
    ? [wroteStatus ? wroteStatus.to : row.status, nextQty ?? row.quantity]
    : [wroteStatus ? wroteStatus.to : row.status];

  const assign = cols.map((c) => `${c.col} = ${c.expr ?? "?"}`).join(", ");
  const sql = `UPDATE ${table} SET ${assign}, updated_at = ? WHERE id = ? AND tenant_id = ? ${guard}`;
  const binds = [...cols.map((c) => c.to), at, row.id, input.tenantId, ...readGuard];

  const undoable = cols.every((c) => !c.expr);
  return {
    sql,
    binds,
    revert: undoable
      ? {
          sql: `UPDATE ${table} SET ${cols.map((c) => `${c.col} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND tenant_id = ? ${guard}`,
          binds: [...cols.map((c) => c.from), at, row.id, input.tenantId, ...wroteGuard],
        }
      : null,
  };
}

/** Everything a single event needs, resolved — or the reason it cannot happen. */
type Prepared =
  | { ok: true; ledgerId: string; insert: D1PreparedStatement; update: Projection | null; nextQty: number | null }
  | { ok: false; reason: EventFailure };

/**
 * Validate one event and build its statements, WITHOUT running anything.
 *
 * Split out because the plural path has to decide about every member of an act
 * before it writes any of them: a tray whose third instrument turns out to be
 * retired must be refused whole, not half-assembled and then apologised for.
 */
async function prepare(db: D1Database, input: EventInput, at: string): Promise<Prepared> {
  const spec = EVENTS[input.event];
  if (!spec) return { ok: false, reason: "not_applicable" };
  if (!eventAppliesTo(input.event, input.trackedKind)) return { ok: false, reason: "not_applicable" };

  const row = await readTracked(db, input.trackedKind, input.tenantId, input.trackedId);
  if (!row) return { ok: false, reason: "not_found" };

  // A finished thing takes no further part. Checked BEFORE the quantity maths so
  // "this instrument was retired" is the reason reported, rather than a
  // confusing arithmetic error further down.
  if (isFinished(row.status)) return { ok: false, reason: "finished" };
  // Frozen is reversible and therefore a different refusal — except for the
  // events that exist to resolve it. Quarantining twice is harmless; moving a
  // quarantined pack onto a shelf is the thing being prevented.
  if (isFrozen(row.status) && input.event !== "quarantined") return { ok: false, reason: "frozen" };

  let nextQty: number | null = null;
  if (spec.quantity !== "none") {
    const q = nextQuantity(row.quantity ?? 0, input.event, input.quantity ?? 0, {
      divisible: row.divisible === 1,
    });
    if (!q.ok) return { ok: false, reason: q.reason };
    nextQty = q.next;
  }

  const ledgerId = newId("evt");
  const insert = db
    .prepare(
      "INSERT INTO ledger (id, tenant_id, at, actor_user_id, event, tracked_kind, tracked_id, catalog_item_id, quantity_delta, from_location_id, to_location_id, case_id, cycle_id, note, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      ledgerId,
      input.tenantId,
      at,
      input.actorUserId,
      input.event,
      input.trackedKind,
      input.trackedId,
      row.catalog_item_id,
      // Stored SIGNED, so a sum over the ledger reproduces the balance without
      // the reader having to know which events subtract.
      spec.quantity === "none" ? null : spec.quantity === "decrease" ? -(input.quantity ?? 0) : (input.quantity ?? 0),
      input.fromLocationId ?? row.location_id,
      input.toLocationId ?? null,
      input.caseId ?? null,
      input.cycleId ?? null,
      input.note ?? null,
      input.meta ? j(input.meta) : null,
    );

  return { ok: true, ledgerId, insert, update: projection(input.trackedKind, input, row, nextQty, at), nextQty };
}

/**
 * Record an event and apply its consequence, atomically.
 *
 * The ONLY way a lot, unit or pack changes. A route that writes one of those
 * tables directly has bypassed the audit trail, and no test downstream will
 * notice — which is why this is a chokepoint rather than a helper.
 */
export async function applyEvent(db: D1Database, input: EventInput): Promise<EventOutcome> {
  const at = nowIso();
  const p = await prepare(db, input, at);
  if (!p.ok) return p;

  const statements = [p.insert];
  if (p.update) statements.push(db.prepare(p.update.sql).bind(...p.update.binds));

  // One transaction. See the header: separate calls leave a window where the
  // audit trail and the world disagree.
  const results = await db.batch(statements);

  if (p.update && (results[1]?.meta?.changes ?? 0) === 0) {
    /**
     * The CAS lost. The batch is already committed, so the ledger row exists
     * describing something that did not take effect — and leaving it would be
     * exactly the lie this module prevents. Removing it is safe precisely
     * because the state update did nothing.
     */
    await db.prepare("DELETE FROM ledger WHERE id = ? AND tenant_id = ?").bind(p.ledgerId, input.tenantId).run().catch(() => undefined);
    return { ok: false, reason: "conflict" };
  }

  return { ok: true, ledgerId: p.ledgerId, ...(p.nextQty !== null ? { quantity: p.nextQty } : {}) };
}

/**
 * The events the PLURAL path will run. Deliberately short.
 *
 * Everything on this list moves a row into a state it enters exactly once, from
 * a state where the columns involved are null — which is what makes the undo in
 * `projection` exact. `opened` on a LOT is the counter-example and is absent on
 * purpose: its COALESCE may write nothing at all, so an undo would have to guess
 * whether it did.
 *
 * A new event does not silently inherit the plural path. Adding one here is a
 * claim that its projection is exactly undoable, and `projection` returning a
 * null `revert` is the backstop that catches the claim being wrong.
 */
const PLURAL_SAFE: ReadonlySet<EventName> = new Set(["packed", "returned", "opened", "quarantined", "issued", "sterilised", "released"]);

export type PluralOutcome =
  | { ok: true; ledgerIds: string[] }
  | { ok: false; reason: EventFailure | "not_undoable"; index: number };

/**
 * ONE ACT THAT TOUCHES SEVERAL THINGS — all of it, or none of it.
 *
 * Building a tray is not five independent events that happen to be adjacent. It
 * is one act: the pack exists and four instruments are inside it, or nothing
 * happened. Run through `applyEvent` in a loop, the third instrument turning out
 * to be someone else's leaves two units marked `packed` inside a tray that was
 * never assembled — invisible stock, and a recall that names the wrong
 * instruments.
 *
 * ── How it gets there, given what D1 actually offers ────────────────────────
 *
 * `db.batch()` is one transaction, so all the writes land together. What it does
 * NOT give is a conditional abort: a compare-and-set that matches zero rows is a
 * successful statement that changed nothing, not an error, so the batch commits
 * around it. That is the whole difficulty, and it is why this is three phases:
 *
 *   1. PREPARE every member and refuse the whole act on the first problem, so
 *      the common failures (retired instrument, wrong tenant, already packed)
 *      never write anything at all
 *   2. BATCH every ledger row and every guarded update together
 *   3. VERIFY each update landed; if any lost its CAS — someone else took that
 *      instrument in the microseconds in between — UNWIND the ones that did, and
 *      delete every ledger row this call wrote
 *
 * The unwind is compensation, not rollback, and the difference is worth being
 * honest about: for the instant between phase 2 and phase 3 the partial state is
 * readable. Nothing here can close that window — D1 has no interactive
 * transaction — so the unwind is guarded on the values THIS call wrote, and a
 * third party who changed a row in between keeps their change rather than being
 * silently reverted.
 */
export async function applyEvents(db: D1Database, inputs: EventInput[]): Promise<PluralOutcome> {
  if (inputs.length === 0) return { ok: true, ledgerIds: [] };

  // One timestamp for the whole act, so a tray's assembly reads as a single
  // moment in history rather than five that happen to be close together.
  const at = nowIso();
  const tenantId = inputs[0]!.tenantId;

  const prepared: Extract<Prepared, { ok: true }>[] = [];
  for (const [index, input] of inputs.entries()) {
    if (!PLURAL_SAFE.has(input.event)) return { ok: false, reason: "not_undoable", index };
    const p = await prepare(db, input, at);
    if (!p.ok) return { ok: false, reason: p.reason, index };
    // The backstop for the PLURAL_SAFE claim above: a projection that cannot
    // describe its own undo must not run here, whatever the list says.
    if (p.update && !p.update.revert) return { ok: false, reason: "not_undoable", index };
    prepared.push(p);
  }

  const statements: D1PreparedStatement[] = [];
  /** Where each member's update landed in `statements`, so results line up. */
  const updateAt: (number | null)[] = [];
  for (const p of prepared) {
    statements.push(p.insert);
    if (p.update) {
      updateAt.push(statements.length);
      statements.push(db.prepare(p.update.sql).bind(...p.update.binds));
    } else {
      updateAt.push(null);
    }
  }

  const results = await db.batch(statements);

  const lost = updateAt.findIndex((pos) => pos !== null && (results[pos]?.meta?.changes ?? 0) === 0);
  if (lost !== -1) {
    const unwind: D1PreparedStatement[] = [];
    for (const [i, p] of prepared.entries()) {
      const pos = updateAt[i];
      // Only the ones that actually landed need putting back.
      if (i !== lost && pos != null && (results[pos]?.meta?.changes ?? 0) > 0 && p.update?.revert) {
        unwind.push(db.prepare(p.update.revert.sql).bind(...p.update.revert.binds));
      }
    }
    // Every ledger row from this call goes, including the losers'. A row
    // describing something that did not take effect is the lie this module
    // exists to prevent, and here it would name instruments that were never
    // packed — the worst possible thing for a recall to read.
    unwind.push(
      db
        .prepare(`DELETE FROM ledger WHERE tenant_id = ? AND id IN (${prepared.map(() => "?").join(", ")})`)
        .bind(tenantId, ...prepared.map((p) => p.ledgerId)),
    );
    await db.batch(unwind).catch(() => undefined);
    return { ok: false, reason: "conflict", index: lost };
  }

  return { ok: true, ledgerIds: prepared.map((p) => p.ledgerId) };
}

/** One tracked thing's history, newest first — the "what happened to this" read. */
export async function historyOf(
  db: D1Database,
  tenantId: string,
  kind: TrackedKind,
  id: string,
  limit = 200,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .prepare("SELECT * FROM ledger WHERE tenant_id = ? AND tracked_kind = ? AND tracked_id = ? ORDER BY at DESC LIMIT ?")
    .bind(tenantId, kind, id, limit)
    .all<Record<string, unknown>>();
  return rows.results ?? [];
}
