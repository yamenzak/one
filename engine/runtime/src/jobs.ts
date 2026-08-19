/**
 * THE SCHEDULER, AND THE RECORD THAT IT RAN.
 *
 * ⚠️ THE CLOCK IS THE DEPLOYMENT'S `scheduled` HANDLER, AND THE TRIGGER THAT
 * CALLS IT IS IN `wrangler.jsonc`. Both halves are needed and only one of them
 * is code: a handler with no `triggers.crons` compiles, typechecks, passes its
 * tests and never runs — which is what this file described for three stages,
 * while `dueForErasure` was asked by nobody and a workspace past its date was
 * never erased.
 *
 * ⚠️ A JOB THAT STOPS RUNNING DOES NOT FAIL — IT GOES QUIET. Nothing is waiting
 * for its answer, so a throw at 03:00 has no user, no request, no 500 and no red
 * test. The dunning ladder simply stops climbing, or the sweep stops sweeping,
 * and it is found weeks later by somebody wondering why nobody was ever charged.
 * Every run is recorded, successes and failures alike, and the console reads the
 * LAST run rather than the next one — a job that is scheduled tells you nothing.
 *
 * ⚠️ AND THE SWEEP DERIVES ITS WORK FROM THE DIRECTORY, NEVER FROM THE SHARDS
 * (D5). "Which workspaces are past due" answered by asking every shard is a walk
 * that gets slower with every shard and times out at the size where it matters.
 */

import type { AppId, Instant, JobBook, TenantId } from "@engine/kernel";
import { dueForPurge, newId } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

export const JOBS_SCHEMA: SchemaModule = {
  id: "jobs",
  statements: [
    `CREATE TABLE IF NOT EXISTS job_run (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, ok INTEGER, detail TEXT, touched INTEGER NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS ix_job_run_job ON job_run (job_id, started_at);`,
  ],
};

export interface RunRow {
  readonly id: string;
  readonly jobId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly ok: boolean | null;
  readonly detail: string | null;
  readonly touched: number;
}

/**
 * Run one job and record what happened.
 *
 * ⚠️ THE ROW IS WRITTEN BEFORE THE WORK AND CLOSED AFTER IT, so a run that never
 * came back is visible as a row with no end — which is exactly the state a job
 * that hangs leaves behind, and the state a scheduler with only success rows can
 * never show.
 */
export async function run(
  db: Db, jobId: string, work: () => Promise<{ touched: number; detail?: string }>,
  now = new Date(),
): Promise<RunRow> {
  const id = newId("run", now);
  await db.prepare(
    `INSERT INTO job_run (id, job_id, started_at, ended_at, ok, detail, touched)
     VALUES (?, ?, ?, NULL, NULL, NULL, 0)`)
    .bind(id, jobId, now.toISOString()).run();

  try {
    const out = await work();
    await db.prepare(`UPDATE job_run SET ended_at = ?, ok = 1, detail = ?, touched = ? WHERE id = ?`)
      .bind(new Date().toISOString(), out.detail ?? null, out.touched, id).run();
    return { id, jobId, startedAt: now.toISOString(), endedAt: new Date().toISOString(),
      ok: true, detail: out.detail ?? null, touched: out.touched };
  } catch (thrown) {
    /*
      ⚠️ RECORDED AND RE-THROWN IS NOT THE CHOICE HERE. Nothing is waiting for
      this, so throwing further only loses the message; what the failure needs is
      to be visible in the console and to whatever `onFail` names.
    */
    const detail = thrown instanceof Error ? thrown.message : String(thrown);
    await db.prepare(`UPDATE job_run SET ended_at = ?, ok = 0, detail = ? WHERE id = ?`)
      .bind(new Date().toISOString(), detail, id).run();
    return { id, jobId, startedAt: now.toISOString(), endedAt: new Date().toISOString(),
      ok: false, detail, touched: 0 };
  }
}

export async function runsOf(db: Db, book: JobBook, limit = 20): Promise<readonly RunRow[]> {
  const ids = Object.keys(book);
  if (!ids.length) return [];
  const rows = await db.prepare(
    `SELECT * FROM job_run ORDER BY started_at DESC LIMIT ?`).bind(limit).all();
  return rows.results.map((r) => ({
    id: r.id as string, jobId: r.job_id as string, startedAt: r.started_at as string,
    endedAt: (r.ended_at as string | null) ?? null,
    ok: r.ok === null ? null : r.ok === 1,
    detail: (r.detail as string | null) ?? null,
    touched: (r.touched as number) ?? 0,
  }));
}

/* ---------------------------------------------------------------- dunning --- */

export interface Overdue {
  readonly tenantId: TenantId;
  readonly appId: AppId;
  readonly days: number;
}

/**
 * ⚠️ ONE QUERY OVER THE DIRECTORY. Every workspace past due, across every
 * product, in one place — which is the whole reason subscriptions live in the
 * directory rather than beside a tenant's records (D5).
 */
export async function pastDue(db: Db, now: Instant): Promise<readonly Overdue[]> {
  const rows = await db.prepare(
    `SELECT tenant_id, app_id, past_due_at FROM subscription
     WHERE status = 'past_due' AND past_due_at IS NOT NULL ORDER BY past_due_at`)
    .all<{ tenant_id: string; app_id: string; past_due_at: string }>();
  const day = 24 * 60 * 60 * 1000;
  return rows.results.map((r) => ({
    tenantId: r.tenant_id as TenantId,
    appId: r.app_id as AppId,
    days: Math.floor((Date.parse(now) - Date.parse(r.past_due_at)) / day),
  }));
}

/**
 * ⚠️ THE SWEEP DECIDES; IT DOES NOT DELETE. Erasure crosses into a shard, needs
 * that shard's handle, and is the one operation nobody wants a scheduler doing
 * as a side effect of a status query. This answers WHO, and the caller — which
 * has the handles — does it.
 */
export async function dueForErasure(db: Db, now: Instant): Promise<readonly Overdue[]> {
  const all = await pastDue(db, now);
  return all.filter((o) => dueForPurge({ status: "past_due", pastDueAt: anchor(o, now) }, now));
}

const anchor = (o: Overdue, now: Instant): Instant =>
  new Date(Date.parse(now) - o.days * 24 * 60 * 60 * 1000).toISOString() as Instant;

/**
 * ⚠️ AND A WORKSPACE THAT IS ITSELF SUSPENDED MUST NOT BE SHREDDING ANYTHING OF
 * ITS OWN CUSTOMERS'. Any ladder a tenant runs against the people it serves is
 * frozen while the tenant is not in good standing — a business we have stopped
 * serving is not one that should be deleting a roster it can no longer see.
 */
/* DEFER(engine-35) stage:35 — OURS, NOT THEIRS. This freezes a ladder a
   WORKSPACE runs against its own customers while we have stopped serving that
   workspace, and no product here sells to customers of its own yet. The sweep
   above runs our ladder against workspaces, which is the other direction. */
export const frozen = (standing: { readonly serving: boolean }): boolean => !standing.serving;
