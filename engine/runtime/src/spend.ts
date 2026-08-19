/**
 * WHERE THE CREDITS WENT — one row per run, and the fractions that do not fill
 * a credit yet.
 *
 * ⚠️ A BALANCE THAT DROPS WITH NO LINE BEHIND IT IS THE ONE THING NOBODY CAN
 * RECONSTRUCT. The wallet's ledger already records the movement; this records
 * what the movement was FOR — which product, which action, which model, how much
 * it consumed — because "you spent 400 credits this month" is not an answer to
 * "on what".
 *
 * ⚠️ IT HOLDS WHAT IT COST AND NEVER WHAT WAS SAID. No prompt, no output, no
 * input text. A previous platform kept both on every generation and what that
 * amounted to was a permanent record of everything every workspace had ever
 * typed, read by nothing, deleted by nobody. The cost is the fact somebody needs;
 * the content is a liability with no reader.
 *
 * ⚠️ AND THE FRACTIONS ACCRUE RATHER THAN ROUNDING. A credit is a cent and a
 * small call costs a fraction of one, so charging a whole credit is a
 * several-hundred-fold overcharge and makes every call — trivial or enormous —
 * read as "1 credit" on the statement. The remainder is carried in `ai_milli`
 * and drawn when it reaches a whole one, exactly as the storage meter does.
 */

import type { AppId, TenantId } from "@engine/kernel";
import { newId } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const SPEND_SCHEMA: SchemaModule = {
  id: "ai_spend",
  statements: [
    /* ⚠️ THE DIRECTORY, beside the wallet it draws from — a spend row on a shard
       and a balance in the directory is a statement that cannot be assembled by
       one query, for a workspace that has moved shard. */
    `CREATE TABLE IF NOT EXISTS ai_run (`
    + `id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, app_id TEXT NOT NULL, action TEXT NOT NULL, `
    + `model TEXT NOT NULL, lane TEXT NOT NULL, at TEXT NOT NULL, `
    + `held INTEGER NOT NULL, charged_milli INTEGER NOT NULL, cost_milli INTEGER, `
    + `units_in INTEGER, units_out INTEGER, source TEXT NOT NULL, log_id TEXT, `
    + `ok INTEGER NOT NULL, detail TEXT, trued INTEGER);`,
    `CREATE INDEX IF NOT EXISTS ix_ai_run_scope ON ai_run (tenant_id, at);`,
    /* ⚠️ The true-up sweep's own index: rows with a log id and no cost yet. */
    `CREATE INDEX IF NOT EXISTS ix_ai_run_open ON ai_run (trued, at);`,
    /* ⚠️ THE FRACTION OF A CREDIT NOT YET DRAWN — see `settle`. Every meter
       carries into the same column deliberately: two carries would each sit
       under a whole credit indefinitely, so a workspace running both would be
       charged for neither. WHAT it was spent on is the `ai_run` row's job. */
    `ALTER TABLE billing_account ADD COLUMN spend_milli INTEGER;`,
  ],
};

/* ------------------------------------------------------------------ shape --- */

/** Where the charged figure came from, so a statement can say how sure it is. */
export type Priced = "gateway" | "usage" | "reserve" | "cached";

export interface Spend {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly appId: AppId;
  readonly action: string;
  readonly model: string;
  readonly lane: string;
  readonly at: string;
  /** What was held, in whole credits. */
  readonly held: number;
  /** What was charged, in milli-credits. */
  readonly chargedMilli: number;
  /** What it cost US, in milli-credits — absent until the gateway says. */
  readonly costMilli: number | null;
  readonly unitsIn: number | null;
  readonly unitsOut: number | null;
  readonly source: Priced;
  readonly logId: string | null;
  readonly ok: boolean;
  readonly detail: string | null;
}

interface Row {
  readonly id: string; readonly tenant_id: string; readonly app_id: string;
  readonly action: string; readonly model: string; readonly lane: string;
  readonly at: string; readonly held: number; readonly charged_milli: number;
  readonly cost_milli: number | null; readonly units_in: number | null;
  readonly units_out: number | null; readonly source: string;
  readonly log_id: string | null; readonly ok: number; readonly detail: string | null;
}

const asSpend = (r: Row): Spend => ({
  id: r.id, tenantId: r.tenant_id as TenantId, appId: r.app_id as AppId,
  action: r.action, model: r.model, lane: r.lane, at: r.at,
  held: r.held, chargedMilli: r.charged_milli, costMilli: r.cost_milli,
  unitsIn: r.units_in, unitsOut: r.units_out, source: r.source as Priced,
  logId: r.log_id, ok: !!r.ok, detail: r.detail,
});

/* ------------------------------------------------------------------ write --- */

export interface Recording {
  readonly tenantId: TenantId;
  readonly appId: AppId;
  readonly action: string;
  readonly model: string;
  readonly lane: string;
  readonly held: number;
  readonly chargedMilli: number;
  readonly costMilli?: number | null;
  readonly unitsIn?: number | null;
  readonly unitsOut?: number | null;
  readonly source: Priced;
  readonly logId?: string | null;
  readonly ok: boolean;
  readonly detail?: string | null;
}

/**
 * ⚠️ A FAILED RUN IS RECORDED TOO, AND CHARGED NOTHING. Without the row, a
 * provider outage is a workspace watching a button do nothing with no trace
 * anywhere that it was ever pressed — and the support answer becomes "we cannot
 * see it".
 */
export async function recordRun(db: Db, it: Recording, now = new Date()): Promise<string> {
  const id = newId("air", now);
  await db.prepare(
    `INSERT INTO ai_run (id, tenant_id, app_id, action, model, lane, at, held, charged_milli,`
    + ` cost_milli, units_in, units_out, source, log_id, ok, detail, trued)`
    + ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, it.tenantId, it.appId, it.action, it.model, it.lane, now.toISOString(),
      it.held, it.chargedMilli, it.costMilli ?? null, it.unitsIn ?? null, it.unitsOut ?? null,
      it.source, it.logId ?? null, it.ok ? 1 : 0, it.detail ?? null,
      /* ⚠️ A run with no log id can never be trued up, so it is closed on
         arrival — otherwise the sweep carries it for ever, asking a gateway
         about a call it has no handle on. */
      it.logId && it.source !== "gateway" ? 0 : 1).run();
  return id;
}

/* ------------------------------------------------------------------- read --- */

/**
 * ⚠️ WHAT THE WORKSPACE IS SHOWN, AND `cost_milli` IS NOT IN IT. What a run cost
 * US is the other half of the margin; a statement carrying both publishes it.
 * The caller strips it — see `op.spend`.
 */
export async function spendOf(
  db: Db, tenantId: TenantId, opts: { readonly since?: string; readonly limit?: number } = {},
): Promise<readonly Spend[]> {
  const rows = await db.prepare(
    `SELECT id, tenant_id, app_id, action, model, lane, at, held, charged_milli, cost_milli,`
    + ` units_in, units_out, source, log_id, ok, detail FROM ai_run`
    + ` WHERE tenant_id = ? AND at >= ? ORDER BY at DESC LIMIT ?`)
    .bind(tenantId, opts.since ?? "", Math.min(opts.limit ?? 100, 500)).all<Row>();
  return rows.results.map(asSpend);
}

export interface Summed {
  readonly key: string;
  readonly runs: number;
  readonly chargedMilli: number;
}

/**
 * ⚠️ THE ANSWER TO "WHERE DID MY CREDITS GO", WHICH IS A GROUPING RATHER THAN A
 * LIST. A hundred rows is a log; four lines saying which product and which action
 * is the thing somebody actually asked for.
 */
export async function spendByAction(
  db: Db, tenantId: TenantId, since: string,
): Promise<readonly Summed[]> {
  const rows = await db.prepare(
    `SELECT app_id || '.' || action AS key, COUNT(*) AS runs, SUM(charged_milli) AS milli`
    + ` FROM ai_run WHERE tenant_id = ? AND at >= ? AND ok = 1`
    + ` GROUP BY key ORDER BY milli DESC`)
    .bind(tenantId, since).all<{ key: string; runs: number; milli: number }>();
  return rows.results.map((r) => ({ key: r.key, runs: r.runs, chargedMilli: r.milli ?? 0 }));
}
