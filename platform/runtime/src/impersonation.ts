/**
 * ACTING AS SOMEBODY ELSE — time-boxed, announced, and written down.
 *
 * ⚠️ THE MANIFEST HAS DECLARED `impersonation: { maxMinutes, announce }` SINCE
 * THE FIRST APP AND NOTHING READ IT. `Actor.impersonatedBy` existed in the
 * primitives and was never set by anything. MANIFEST.md §9 lists this as
 * day-zero for one reason — "the audit trail must exist from the first support
 * session" — and the first support session is exactly when a platform is least
 * likely to have built it.
 *
 * ⚠️ THERE IS NO TOKEN, AND THAT IS THE DESIGN. A minted credential that grants
 * somebody else's powers is a thing that can be copied out of a log, pasted into
 * a chat, or kept after the session ended. What exists instead is a ROW: an
 * operator's own session plus a live grant naming a workspace. Ending it is a
 * delete; expiry is a comparison; there is nothing to leak and nothing to
 * revoke.
 *
 * ⚠️ AND IT LIVES IN THE GLOBAL STORE, beside the accounts. An operator is not a
 * member of the workspace they are helping — that is the whole situation — so a
 * grant kept in the workspace's own region would be a row about somebody who
 * does not appear anywhere else in it.
 */

import type { Instant, SchemaModule, SqlHandle } from "@one/kernel";

export const IMPERSONATION_SCHEMA: SchemaModule = {
  /** ⚠️ Global: the record of what operators did here, which a workspace closing must not delete. */
  global: "deployment",
  id: "impersonation",
  after: ["identity"],
  ddl: [
    `CREATE TABLE IF NOT EXISTS impersonations (id TEXT PRIMARY KEY, operator_id TEXT NOT NULL, tenant_id TEXT NOT NULL, reason TEXT NOT NULL, started_at TEXT NOT NULL, expires_at TEXT NOT NULL, ended_at TEXT);`,
    /* The one read: is this operator, in this workspace, live right now. */
    `CREATE INDEX IF NOT EXISTS idx_impersonations_live ON impersonations(operator_id, tenant_id, expires_at);`,
  ],
  /*
    ⚠️ NOT TENANT-SCOPED, DELIBERATELY. This is the record of what WE did to a
    workspace, and a workspace closing must not delete the evidence of the
    support sessions that happened inside it — which is the one erasure a
    regulator would ask about and the one an operator would most like gone.
  */
};

export interface Live {
  readonly id: string;
  readonly tenantId: string;
  readonly reason: string;
  readonly startedAt: string;
  readonly expiresAt: string;
}

export type ImpersonationRefusal = "no_reason" | "too_long" | "already_live";

/**
 * Begin one.
 *
 * ⚠️ THE REASON IS REQUIRED AND IS NOT A DROPDOWN. "Investigating a report of
 * missing records, ticket 4471" is what makes an audit row answerable six months
 * later; "support" is what makes it a row nobody can act on. Refusing an empty
 * one is the only moment the cost of writing it is smaller than the cost of not.
 */
export async function begin(
  db: SqlHandle,
  input: { readonly operatorId: string; readonly tenantId: string; readonly reason: string; readonly maxMinutes: number },
  now: Instant,
): Promise<{ readonly ok: true; readonly live: Live } | { readonly ok: false; readonly why: ImpersonationRefusal }> {
  const reason = input.reason.trim();
  if (reason.length < 8) return { ok: false, why: "no_reason" };
  if (!Number.isInteger(input.maxMinutes) || input.maxMinutes <= 0 || input.maxMinutes > 240) {
    return { ok: false, why: "too_long" };
  }
  /*
    ⚠️ ONE AT A TIME PER WORKSPACE. Two live grants for the same operator are two
    expiry times, and the longer one silently extends the shorter — which is how
    a time box stops being one.
  */
  if (await liveFor(db, input.operatorId, input.tenantId, now)) return { ok: false, why: "already_live" };

  const id = `imp_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const expiresAt = new Date(Date.parse(now) + input.maxMinutes * 60_000).toISOString();
  await db.run(
    `INSERT INTO impersonations (id, operator_id, tenant_id, reason, started_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
    id, input.operatorId, input.tenantId, reason, now, expiresAt,
  );
  return { ok: true, live: { id, tenantId: input.tenantId, reason, startedAt: now, expiresAt } };
}

/**
 * Whether this operator is currently acting inside this workspace.
 *
 * ⚠️ THE TIME BOX IS ENFORCED ON EVERY READ RATHER THAN BY A SWEEP. A grant that
 * expires when something remembers to expire it is one that is live for as long
 * as nothing runs — and the sweep is the thing most likely to be broken on the
 * deployment where somebody is doing support at three in the morning.
 */
export async function liveFor(
  db: SqlHandle, operatorId: string, tenantId: string, now: Instant,
): Promise<Live | null> {
  const row = await db.first<{ id: string; reason: string; started_at: string; expires_at: string }>(
    `SELECT id, reason, started_at, expires_at FROM impersonations
     WHERE operator_id = ? AND tenant_id = ? AND ended_at IS NULL AND expires_at > ?
     ORDER BY started_at DESC LIMIT 1`,
    operatorId, tenantId, now,
  ).catch(() => null);
  return row
    ? { id: row.id, tenantId, reason: row.reason, startedAt: row.started_at, expiresAt: row.expires_at }
    : null;
}

/**
 * End one early.
 *
 * ⚠️ ENDED RATHER THAN DELETED. The row is the evidence — that somebody was in
 * there, why, and for how long — and an operator who can delete their own
 * support session can delete the only record of what they did in it.
 */
export const end = (db: SqlHandle, id: string, operatorId: string, now: Instant): Promise<void> =>
  db.run(`UPDATE impersonations SET ended_at = ? WHERE id = ? AND operator_id = ? AND ended_at IS NULL`, now, id, operatorId);

/** Every session inside one workspace, most recent first. What was done to them. */
export async function historyFor(db: SqlHandle, tenantId: string, limit: number): Promise<readonly (Live & { readonly operatorId: string; readonly endedAt: string | null })[]> {
  const rows = await db.all<{ id: string; operator_id: string; reason: string; started_at: string; expires_at: string; ended_at: string | null }>(
    `SELECT id, operator_id, reason, started_at, expires_at, ended_at FROM impersonations
     WHERE tenant_id = ? ORDER BY started_at DESC LIMIT ?`,
    tenantId, limit,
  ).catch(() => []);
  return rows.map((r) => ({
    id: r.id, tenantId, reason: r.reason, startedAt: r.started_at,
    expiresAt: r.expires_at, operatorId: r.operator_id, endedAt: r.ended_at,
  }));
}
