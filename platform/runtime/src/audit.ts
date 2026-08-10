/**
 * THE AUDIT — who did what, and it has to actually be written down.
 *
 * ⚠️ EVERY OPERATION IN THIS PLATFORM COULD DECLARE AN `audit` AND NOT ONE OF
 * THEM WAS RECORDED. The entries were built by `auditFor`, pushed into an array
 * in the request handler, and the array was never read. Fifteen of one app's
 * operations declared one; so does every operator action — comping a workspace,
 * adjusting its ceilings, topping up its credits, replaying a payment event.
 * None of it left a trace.
 *
 * That is the day-zero item MANIFEST.md §9 describes as "a table, and evidence
 * you cannot reconstruct". A missing audit is not a feature that is late: it is
 * a month of support sessions, operator actions and money movements about which
 * there is now permanently nothing to say.
 *
 * ⚠️ AND IT IS SEPARATE FROM A COLLECTION'S `activity`. Activity answers "what
 * happened to this record"; the audit answers "what did this person do", which
 * includes everything that touches no record at all — an operator comping a
 * plan, somebody reading an export, a session started on another person's
 * behalf.
 */

import type { AuditEntry, Instant, JobSpec, SchemaModule, SqlHandle } from "@one/kernel";

export const AUDIT_SCHEMA: SchemaModule = {
  id: "audit",
  ddl: [
    `CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT, on_behalf_of TEXT, operation TEXT NOT NULL, subject TEXT NOT NULL, verb TEXT NOT NULL, via TEXT NOT NULL, at TEXT NOT NULL);`,
    /*
      ⚠️ INDEXED ON THE QUESTION IT IS ASKED. "What happened here recently" and
      "what did this person do" are the only two reads an audit ever gets, and
      an un-indexed one is a table scan over the fastest-growing table in the
      product.
    */
    `CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(tenant_id, at);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit(tenant_id, actor_id, at);`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["audit"] },
};

/**
 * ⚠️ `AuditRow`, not `Recorded` — the credit ledger already exports one, and two
 * things called `Recorded` in one namespace is a name somebody imports the wrong
 * one of. The same reasoning renames `record` to `recordAudit`.
 */
export interface AuditRow extends AuditEntry {
  readonly actorId: string | null;
  /** ⚠️ Whose behalf this was on, where an operator was acting as somebody. */
  readonly onBehalfOf: string | null;
  readonly at: string;
}

/**
 * Write what happened.
 *
 * ⚠️ AFTER THE OPERATION SUCCEEDED, AND NEVER INSTEAD OF IT. A failed write that
 * left an audit row says somebody did something they did not do, which is worse
 * than no record — and a row written first is exactly that whenever the handler
 * throws afterwards.
 *
 * ⚠️ AND A FAILURE TO RECORD IS NOT A FAILURE OF THE OPERATION. The change has
 * already happened and been answered; throwing here would report a completed
 * action as an error and invite a retry that does it twice. The honest cost is
 * that an audit can have a hole in it — which is why it is written on the same
 * request rather than queued somewhere that can be lost more quietly.
 */
export async function recordAudit(
  db: SqlHandle,
  tenantId: string,
  actorId: string | null,
  onBehalfOf: string | null,
  entries: readonly AuditEntry[],
  at: Instant,
): Promise<void> {
  for (const e of entries) {
    await db.run(
      `INSERT INTO audit (id, tenant_id, actor_id, on_behalf_of, operation, subject, verb, via, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), tenantId, actorId, onBehalfOf, e.operationId, e.subject, e.verb, e.via, at,
    ).catch(() => undefined);
  }
}

/** What happened in this workspace, most recent first. */
export async function auditTrail(
  db: SqlHandle, tenantId: string, limit: number, actorId?: string,
): Promise<readonly AuditRow[]> {
  const rows = await db.all<{
    actor_id: string | null; on_behalf_of: string | null; operation: string;
    subject: string; verb: string; via: string; at: string;
  }>(
    actorId
      ? `SELECT actor_id, on_behalf_of, operation, subject, verb, via, at FROM audit WHERE tenant_id = ? AND actor_id = ? ORDER BY at DESC LIMIT ?`
      : `SELECT actor_id, on_behalf_of, operation, subject, verb, via, at FROM audit WHERE tenant_id = ? ORDER BY at DESC LIMIT ?`,
    ...(actorId ? [tenantId, actorId, limit] : [tenantId, limit]),
  ).catch(() => []);
  return rows.map((r) => ({
    operationId: r.operation, subject: r.subject, verb: r.verb,
    via: r.via as AuditEntry["via"],
    actorId: r.actor_id, onBehalfOf: r.on_behalf_of, at: r.at,
  }));
}

/**
 * Delete audit rows past the deployment's declared retention.
 *
 * ⚠️ A RETENTION THAT NOTHING ENFORCES IS A NUMBER IN A MANIFEST. Every app
 * declares `auditRetentionDays` and nothing read it, so the audit — once it
 * exists at all — grows forever, which is both a cost and a liability: the
 * longest-held personal data in the product, kept by omission rather than by
 * decision.
 *
 * ⚠️ BOUNDED PER RUN, so a deployment that has never pruned catches up over
 * several rather than crossing the time limit and never pruning at all.
 */
export async function pruneAudit(
  db: SqlHandle, tenantId: string, days: number, now: Instant, batch = 500,
): Promise<number> {
  if (!Number.isInteger(days) || days <= 0) return 0;
  const before = new Date(Date.parse(now) - days * 86_400_000).toISOString();
  const due = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (SELECT 1 FROM audit WHERE tenant_id = ? AND at < ? LIMIT ?)`,
    tenantId, before, batch,
  ).catch(() => null);
  if (!due || due.n === 0) return 0;
  await db.run(
    `DELETE FROM audit WHERE rowid IN (SELECT rowid FROM audit WHERE tenant_id = ? AND at < ? LIMIT ?)`,
    tenantId, before, batch,
  ).catch(() => undefined);
  return due.n;
}

/**
 * THE PLATFORM'S OWN PRUNE.
 *
 * ⚠️ A JOB RATHER THAN A FILTER, for the same reason retention is: a limit
 * enforced by hiding rows leaves them on disk, and "we keep this for two years"
 * is a claim about what a subpoena finds rather than about what a screen shows.
 */
export const auditJob = (days: number): JobSpec => ({
  id: "platform.audit",
  summary: "Delete audit rows past the retention this deployment declared.",
  every: "daily",
  scope: "tenant",
  batch: 500,
  async handler(ctx) {
    /* ⚠️ No declared retention is `idle`, not `done`. A deployment that keeps
       its audit forever has made a decision; reporting a sweep as having worked
       on every workspace of it fills the run table with rows that mean nothing. */
    if (!Number.isInteger(days) || days <= 0) return { done: 0, idle: 1, more: false };
    const gone = await pruneAudit(ctx.bind.db as SqlHandle, ctx.tenantId!, days, ctx.now(), 500);
    return { done: gone, more: gone >= 500 };
  },
});
