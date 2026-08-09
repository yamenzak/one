/**
 * THE LEDGER — every billable unit, appended, never amended.
 *
 * ⚠️ APPEND-ONLY IS THE WHOLE PROPERTY. A balance is a SUM over entries rather
 * than a number somebody maintains, so there is no write that can be lost, no
 * pair of writes that can race to a wrong total, and no state a crash can leave
 * halfway. Recomputing from the entries is always possible; recovering a mutated
 * counter is not.
 */

import type { Instant, SchemaModule, SqlHandle } from "@one/kernel";

export const LEDGER_SCHEMA: SchemaModule = {
  id: "ledger",
  ddl: [
    `CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, unit TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT, actor_id TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_tenant ON ledger(tenant_id, unit);`,
    /*
      ⚠️ THE UNIQUE INDEX IS THE IDEMPOTENCY. A payment provider retries on any
      non-2xx and occasionally redelivers a success; without a key on the event,
      each redelivery grants again — free access, silently, with a correct-looking
      200 every time. A partial index, so entries with no reference are unbounded.
    */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_ref ON ledger(tenant_id, unit, ref) WHERE ref IS NOT NULL;`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["ledger"] },
};

export interface Entry {
  readonly unit: string;
  /** Signed. A grant is positive, a charge is negative. One column, one sum. */
  readonly amount: number;
  readonly reason: string;
  /** ⚠️ Present makes the entry idempotent. Absent makes it unbounded. */
  readonly ref?: string;
  readonly actorId: string;
}

export type Recorded = { readonly ok: true; readonly applied: boolean };

/**
 * Append one entry.
 *
 * ⚠️ `applied: false` IS A SUCCESS, and telling it apart matters. A redelivered
 * event that was already recorded is not an error — answering one would make a
 * provider retry forever — but a caller that grants access on the strength of a
 * 200 has to know whether anything happened.
 */
export async function record(db: SqlHandle, tenantId: string, entry: Entry, at: Instant): Promise<Recorded> {
  const before = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ledger WHERE tenant_id = ? AND unit = ?`, tenantId, entry.unit);
  await db.run(
    `INSERT OR IGNORE INTO ledger (id, tenant_id, unit, amount, reason, ref, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), tenantId, entry.unit, entry.amount, entry.reason, entry.ref ?? null, entry.actorId, at,
  );
  const after = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ledger WHERE tenant_id = ? AND unit = ?`, tenantId, entry.unit);
  return { ok: true, applied: (after?.n ?? 0) > (before?.n ?? 0) };
}

/** The balance, summed. Never stored, so it cannot disagree with the entries. */
export async function balance(db: SqlHandle, tenantId: string, unit: string): Promise<number> {
  const row = await db.first<{ total: number | null }>(
    `SELECT SUM(amount) AS total FROM ledger WHERE tenant_id = ? AND unit = ?`, tenantId, unit,
  );
  return row?.total ?? 0;
}
