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

import type { AppId, Instant, JobBook, JobCtx, JobDef, TenantId } from "@engine/kernel";
import { dueForPurge, dueNow, newId, nextRun, scheduleOk } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

export const JOBS_SCHEMA: SchemaModule = {
  id: "jobs",
  statements: [
    `CREATE TABLE IF NOT EXISTS job_run (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, ok INTEGER, detail TEXT, touched INTEGER NOT NULL, by TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_job_run_job ON job_run (job_id, started_at);`,
    /*
      ⚠️ A CADENCE AN OPERATOR MOVED, AND NOTHING ELSE. Not in
      `deployment_config`: that store's write is gated on a closed CREDENTIALS
      registry because it holds Stripe keys under `CONFIG_SECRET`, and widening
      a secret-handling allow-list to carry a cron string is a security boundary
      moved for a convenience. This is job state and it belongs beside the runs.

      ⚠️ AND ONLY THE SCHEDULE. The floor, the budget, the failure route and
      whether a job deletes stay the declaration's, where `refuseJob` can see
      them — a console that could edit a `floorDays` would be a console that can
      turn a retention rule into data loss.
    */
    `CREATE TABLE IF NOT EXISTS job_schedule (job_id TEXT PRIMARY KEY, schedule TEXT NOT NULL, at TEXT NOT NULL, by TEXT);`,
  ],
};

/** ⚠️ Every override, read once — the runner asks per job and there are few. */
export async function schedulesOf(db: Db): Promise<Readonly<Record<string, string>>> {
  const rows = await db.prepare(`SELECT job_id, schedule FROM job_schedule`)
    .all<{ job_id: string; schedule: string }>();
  return Object.fromEntries(rows.results.map((r) => [r.job_id as string, r.schedule as string]));
}

/**
 * ⚠️ REFUSED HERE RATHER THAN AT THE NEXT SWEEP. A cron that cannot be parsed is
 * a job that silently never runs again, and the operator who typed it would find
 * out weeks later — which is the failure the whole of this file is about. The
 * same two checks composition makes: it must parse, and it must name a minute
 * that actually happens.
 */
export async function setSchedule(
  db: Db, jobId: string, schedule: string, by: string | null, now = new Date(),
): Promise<"ok" | "unparseable" | "never_fires"> {
  const want = schedule.trim();
  /* ⚠️ Blank is "back to what the code says", never a stored empty string. */
  if (!want) {
    await db.prepare(`DELETE FROM job_schedule WHERE job_id = ?`).bind(jobId).run();
    return "ok";
  }
  if (!scheduleOk(want)) return "unparseable";
  if (nextRun(want, new Date(0)) === null) return "never_fires";
  await db.prepare(
    `INSERT INTO job_schedule (job_id, schedule, at, by) VALUES (?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET schedule = excluded.schedule, at = excluded.at, by = excluded.by`)
    .bind(jobId, want, now.toISOString(), by).run();
  return "ok";
}

export interface RunRow {
  readonly id: string;
  readonly jobId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly ok: boolean | null;
  readonly detail: string | null;
  readonly touched: number;
  /**
   * ⚠️ WHO PRESSED IT, AND NULL MEANS THE CLOCK. A run started by hand can erase
   * a workspace's records out of hours, so "the schedule did it" and "somebody
   * did it" must not be the same row. Operator operations ride the personal lane
   * and never resolve a workspace, so the ordinary audit — which is keyed on
   * one — cannot carry this; the run record is where it belongs anyway.
   */
  readonly by: string | null;
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
  now = new Date(), by: string | null = null,
): Promise<RunRow> {
  const id = newId("run", now);
  await db.prepare(
    `INSERT INTO job_run (id, job_id, started_at, ended_at, ok, detail, touched, by)
     VALUES (?, ?, ?, NULL, NULL, NULL, 0, ?)`)
    .bind(id, jobId, now.toISOString(), by).run();

  try {
    const out = await work();
    await db.prepare(`UPDATE job_run SET ended_at = ?, ok = 1, detail = ?, touched = ? WHERE id = ?`)
      .bind(new Date().toISOString(), out.detail ?? null, out.touched, id).run();
    return { id, jobId, startedAt: now.toISOString(), endedAt: new Date().toISOString(),
      ok: true, detail: out.detail ?? null, touched: out.touched, by };
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
      ok: false, detail, touched: 0, by };
  }
}

/* ------------------------------------------------------------- the runner --- */

/**
 * WHAT A JOB NEEDS FROM THE DEPLOYMENT TO BE RUNNABLE.
 *
 * ⚠️ THE FAN-OUT IS THE RUNNER'S, NOT THE JOB'S (D5). A `per-tenant` job is
 * called once per workspace with that workspace's database; a job that resolved
 * its own would be a job asking every shard, which is the walk that gets slower
 * with every shard and times out at the size where it matters.
 */
export interface RunnerDeps {
  readonly directory: Db;
  /** Every workspace this deployment serves, for a per-tenant fan-out. */
  readonly tenants: () => Promise<readonly TenantId[]>;
  /** Where a workspace's records are. Null when its shard is not bound here. */
  readonly shardOf: (tenantId: TenantId) => Promise<Db | null>;
  /**
   * ⚠️ WHAT A SCHEDULE WAS CHANGED TO, IF ANYTHING. An operator may move a job
   * without a deploy; the declaration stays the authority for everything else.
   */
  readonly scheduleOf?: (jobId: string) => string | undefined;
  /** ⚠️ `onFail: tell` — the notification the declaration names. */
  readonly tell?: (notification: string, detail: string) => Promise<void>;
  /**
   * ⚠️ HOW A JOB REACHES A PERSON, AND IT IS A DIFFERENT THING FROM `tell`
   * ABOVE. That one reports a job that BROKE, to an operator. This one carries
   * what a job FOUND into the workspace it found it in — which is the ordinary
   * case, and the reason a nightly sweep is worth running at all.
   *
   * ⚠️ IT IS HANDED THE WORKSPACE'S DATABASE RATHER THAN RESOLVING ONE. The
   * runner already has it open; a second lookup per note would be a shard
   * resolution per row on a job whose whole shape is many rows per workspace.
   *
   * ⚠️ ABSENT IS A DEPLOYMENT WITH NO INBOX WIRED, which is what every test
   * harness is. `ctx.tell` is then absent too, so a body reads `ctx.tell?.(…)`
   * and the sweep does its work either way.
   */
  readonly telling?: (of: {
    readonly jobId: string;
    readonly tenantId: TenantId;
    readonly db: Db;
    readonly event: string;
    readonly values: Record<string, unknown>;
  }) => Promise<void>;
  /**
   * ⚠️ WHAT ONE WORKSPACE SWITCHED ON, FOR THE APP THIS JOB BELONGS TO. Resolved
   * by the deployment because only it can map a job back to a manifest — see
   * `jobAppsFor`. Absent is a runner with no app book, which is every test
   * harness and every platform job.
   */
  readonly settings?: (of: {
    readonly jobId: string;
    readonly tenantId: TenantId;
    readonly db: Db;
  }) => Promise<Readonly<Record<string, unknown>>>;
  readonly now?: () => Date;
}

/** ⚠️ The last START of a job, which is what due-ness is measured from. */
async function lastStart(db: Db, jobId: string): Promise<Date | null> {
  const row = await db.prepare(
    `SELECT started_at FROM job_run WHERE job_id = ? ORDER BY started_at DESC LIMIT 1`)
    .bind(jobId).first<{ started_at: string }>();
  return row ? new Date(row.started_at as string) : null;
}

/**
 * ⚠️ A RUN WITH NO END IS ONE STILL GOING, OR ONE THAT DIED MID-FLIGHT, and
 * `overlap` is the declaration that says which of those is tolerable. Default is
 * no: two copies of a sweep deleting the same rows is the shape that turns a
 * slow job into a corrupted one.
 */
async function inFlight(db: Db, jobId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT id FROM job_run WHERE job_id = ? AND ended_at IS NULL LIMIT 1`).bind(jobId).first();
  return row !== null;
}

/**
 * WHAT ONE WORKSPACE'S PASS IS HANDED BEYOND ITS DATABASE — or nothing.
 *
 * ⚠️ AN UNDECLARED EVENT IS REFUSED RATHER THAN FILED, and that is the half
 * that makes `emits` mean something. The manifest checks a notification against
 * what the app declares it raises; a body free to raise anything would be a
 * body raising events no notification listens to — a `tell` that returns
 * cleanly, tells nobody, and cannot be told apart from one that worked.
 *
 * ⚠️ AND THE REFUSAL IS A THROW, which the per-workspace catch turns into a
 * named line in the run record. Nothing is waiting for this, so the only place
 * it can be seen is the console — silence there is the failure mode.
 *
 * ⚠️ THE SETTINGS ARE READ ONCE PER WORKSPACE, NOT PER ASK. The promise is the
 * memo, exactly as it is on the request side: a body reading three settings in a
 * loop over four hundred rows would otherwise run twelve hundred queries.
 */
const handed = (
  deps: RunnerDeps, def: JobDef, tenantId: TenantId, db: Db,
): Pick<JobCtx, "tell" | "setting"> => {
  const raises = def.emits ?? [];
  let asked: Promise<Readonly<Record<string, unknown>>> | null = null;
  return {
    ...(deps.telling && raises.length
      ? {
        tell: async (event: string, values: Record<string, unknown>) => {
          if (!raises.includes(event)) {
            throw new Error(`${def.id} raised "${event}", which it does not declare`);
          }
          await deps.telling!({ jobId: def.id, tenantId, db, event, values });
        },
      }
      : {}),
    ...(deps.settings
      ? {
        setting: async (id: string) => {
          asked ??= deps.settings!({ jobId: def.id, tenantId, db });
          return (await asked)[id];
        },
      }
      : {}),
  };
};

/**
 * RUN ONE JOB, WHATEVER ITS SCOPE, RECORDING WHAT HAPPENED.
 *
 * ⚠️ ONE ROW PER JOB, NOT PER WORKSPACE. A per-tenant job over four hundred
 * workspaces would otherwise write four hundred rows a night and the console
 * would be a log rather than a list of what is running. The fan-out is summed:
 * what an operator needs is "it ran, it touched 12 things across 400
 * workspaces, and 2 of them refused".
 *
 * ⚠️ AND ONE WORKSPACE'S FAILURE DOES NOT END THE PASS. A throw inside the loop
 * used to be the whole job's throw, so a single workspace with a bad row stopped
 * every workspace after it in the list — alphabetically, invisibly, for as long
 * as that row existed.
 */
export async function runJob(
  deps: RunnerDeps, def: JobDef, now = new Date(), by: string | null = null,
): Promise<RunRow | null> {
  if (!def.overlap && await inFlight(deps.directory, def.id)) return null;

  /*
    ⚠️ THE BUDGET IS WALL-CLOCK, MEASURED FROM WHEN THE PASS STARTS — never from
    the logical instant. They are the same thing in production, where `now` IS
    the clock, and they are not the same thing anywhere else: a caller passing a
    fixed instant (a test, a replay, a run scheduled from a stored time) sets a
    deadline in the past, `Date.now()` is already beyond it, and the loop breaks
    before the first workspace.

    ⚠️ AND THE SYMPTOM IS A CLEAN NIGHT. The run reports `ok`, with "stopped on
    its budget, carries on next time" — a sweep that touched nothing and said so
    politely. The suite that caught this passed or failed by the hour of the day
    it was run at, which is the most expensive kind of test there is.
  */
  const deadline = Date.now() + (def.budgetSeconds ?? 60) * 1000;
  const at = now.toISOString();

  const body = async (): Promise<{ touched: number; detail?: string }> => {
    if (def.scope === "deployment") {
      const out = await def.work({ db: deps.directory, deadline, now: at });
      return { touched: out.touched, detail: out.detail };
    }

    let touched = 0;
    let done = 0;
    let stopped = false;
    const refused: string[] = [];
    const said: string[] = [];
    for (const tenantId of await deps.tenants()) {
      /* ⚠️ THE BUDGET IS CHECKED BETWEEN WORKSPACES, WHICH IS THE ONLY PLACE IT
         CAN BE. A run that stops mid-pass reports how far it got and the next
         one carries on — which is why `rerunnable` is a declaration rather than
         a hope. */
      if (Date.now() > deadline) { stopped = true; break; }
      const db = await deps.shardOf(tenantId);
      /* ⚠️ A workspace on a shard this deployment does not bind is REPORTED,
         never fatal — see the erasure sweep, which made the same choice. */
      if (!db) { refused.push(tenantId); continue; }
      try {
        const out = await def.work({ db, tenantId, deadline, now: at, ...handed(deps, def, tenantId, db) });
        touched += out.touched;
        done++;
        if (out.detail && out.touched) said.push(`${tenantId}: ${out.detail}`);
      } catch (thrown) {
        refused.push(`${tenantId} (${thrown instanceof Error ? thrown.message : String(thrown)})`);
      }
    }
    const detail = [
      `${done} workspace(s)`,
      stopped ? "stopped on its budget, carries on next time" : "",
      refused.length ? `refused: ${refused.join(", ")}` : "",
      said.slice(0, 5).join("; "),
    ].filter(Boolean).join(" · ");
    return { touched, detail };
  };

  /*
    ⚠️ RETRY IS THE RUNNER'S, BECAUSE `run` RECORDS AND DOES NOT RE-THROW. A
    declaration saying "retry three times" with nothing that retries is the same
    class of lie as a schedule nothing evaluates.
  */
  const attempts = def.onFail.then === "retry" ? Math.max(1, def.onFail.times) : 1;
  let last: RunRow | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await run(deps.directory, def.id, body, i === 0 ? now : new Date(), by);
    if (last.ok) break;
  }

  /* ⚠️ AND `tell` IS SAID, or the one route a failure declared goes nowhere. */
  if (last && !last.ok && def.onFail.then === "tell" && deps.tell) {
    await deps.tell(def.onFail.notification, `${def.label} failed: ${last.detail ?? "no detail"}`);
  }
  return last;
}

/**
 * RUN EVERY JOB THAT IS DUE, IN DECLARATION ORDER.
 *
 * ⚠️ DECLARATION ORDER IS LOAD-BEARING FOR THE PLATFORM'S OWN. The allowance is
 * the money and everything after it reads a balance, so allowances run before
 * the storage meter and the meter before the top-ups — an object's keys are
 * ordered by insertion, and the book is built in that order on purpose.
 *
 * ⚠️ AND `due` IS ASKED OF THE OVERRIDE FIRST. An operator who moved a job
 * expects the job to move; the declaration stays the authority for its floor,
 * its budget and its failure route, none of which a console may edit.
 */
export async function runDue(
  deps: RunnerDeps, book: JobBook,
): Promise<readonly RunRow[]> {
  const now = (deps.now ?? (() => new Date()))();
  const out: RunRow[] = [];
  for (const def of Object.values(book)) {
    const schedule = deps.scheduleOf?.(def.id) ?? def.schedule;
    if (!dueNow(schedule, await lastStart(deps.directory, def.id), now)) continue;
    const row = await runJob(deps, def, now);
    if (row) out.push(row);
  }
  return out;
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
    by: (r.by as string | null) ?? null,
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
