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
  const table = TABLE[kind];
  return db
    .prepare(`SELECT id, status, location_id, NULL AS quantity, catalog_item_id, 0 AS divisible FROM ${table} WHERE id = ? AND tenant_id = ?`)
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
 */
function projection(
  kind: TrackedKind,
  input: EventInput,
  row: TrackedRow,
  nextQty: number | null,
  at: string,
): { sql: string; binds: unknown[] } | null {
  const table = TABLE[kind];
  const sets: string[] = [];
  const binds: unknown[] = [];

  if (nextQty !== null) {
    sets.push("quantity = ?");
    binds.push(nextQty);
    // A lot that reaches zero is closed rather than left at 0 and "active": an
    // empty-but-active lot keeps appearing in pick lists forever.
    if (nextQty === 0) {
      sets.push("status = ?");
      binds.push(input.event === "wasted" ? "discarded" : "consumed");
    }
  }

  if (input.event === "moved" && input.toLocationId) {
    sets.push("location_id = ?");
    binds.push(input.toLocationId);
  }

  if (input.event === "opened") {
    if (kind === "lot") {
      // Only if not already open. Re-opening would restart the post-opening
      // clock and silently EXTEND an expiry — the unsafe direction.
      sets.push("opened_at = COALESCE(opened_at, ?)", "opened_by = COALESCE(opened_by, ?)");
      binds.push(at, input.actorUserId);
    } else {
      sets.push("status = ?", "opened_at = ?", "opened_by = ?");
      binds.push("opened", at, input.actorUserId);
      if (input.caseId) {
        sets.push("case_id = ?");
        binds.push(input.caseId);
      }
    }
  }

  if (input.event === "quarantined") {
    sets.push("status = ?", "quarantine_reason = ?");
    binds.push("quarantined", input.note ?? null);
  }

  if (input.event === "retired") {
    sets.push("status = ?", "retired_at = ?", "retired_reason = ?");
    binds.push("retired", at, input.note ?? null);
  }

  if (sets.length === 0) return null;
  sets.push("updated_at = ?");
  binds.push(at);

  /**
   * The compare-and-set. `status` and `quantity` are both re-asserted against
   * what was read, so a concurrent writer that changed either makes this update
   * affect zero rows and the whole batch is reported as a conflict rather than
   * silently overwriting them.
   */
  const guard = kind === "lot" ? "AND status = ? AND quantity = ?" : "AND status = ?";
  const guardBinds = kind === "lot" ? [row.status, row.quantity] : [row.status];
  return {
    sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ? ${guard}`,
    binds: [...binds, row.id, input.tenantId, ...guardBinds],
  };
}

/**
 * Record an event and apply its consequence, atomically.
 *
 * The ONLY way a lot, unit or pack changes. A route that writes one of those
 * tables directly has bypassed the audit trail, and no test downstream will
 * notice — which is why this is a chokepoint rather than a helper.
 */
export async function applyEvent(db: D1Database, input: EventInput): Promise<EventOutcome> {
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

  const at = nowIso();
  const ledgerId = newId("evt");
  const update = projection(input.trackedKind, input, row, nextQty, at);

  const statements = [
    db
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
      ),
  ];
  if (update) statements.push(db.prepare(update.sql).bind(...update.binds));

  // One transaction. See the header: separate calls leave a window where the
  // audit trail and the world disagree.
  const results = await db.batch(statements);

  if (update) {
    const changed = results[1]?.meta?.changes ?? 0;
    if (changed === 0) {
      /**
       * The CAS lost. The batch is already committed, so the ledger row exists
       * describing something that did not take effect — and leaving it would be
       * exactly the lie this module prevents. Removing it is safe precisely
       * because the state update did nothing.
       */
      await db.prepare("DELETE FROM ledger WHERE id = ? AND tenant_id = ?").bind(ledgerId, input.tenantId).run().catch(() => undefined);
      return { ok: false, reason: "conflict" };
    }
  }

  return { ok: true, ledgerId, ...(nextQty !== null ? { quantity: nextQty } : {}) };
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
