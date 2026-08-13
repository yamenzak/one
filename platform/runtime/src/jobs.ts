/**
 * THE RUNNER — and the record that makes "did it run" answerable.
 *
 * ⚠️ EVERY RUN IS RECORDED, INCLUDING THE ONES THAT FAILED. The characteristic
 * failure of scheduled work is not an error, it is SILENCE: a sweep stops, and
 * the first anybody knows is a workspace that was never suspended or a digest
 * nobody received for five weeks. A run table is the difference between noticing
 * in a day and noticing when a customer asks.
 *
 * ⚠️ AND ONE JOB'S FAILURE NEVER STOPS THE OTHERS. A sweep that throws on one
 * tenant's malformed row must not take the dunning ladder down with it — so
 * every job and every tenant is isolated, and what failed is recorded rather
 * than raised.
 */

import {
  isDue, type Instant, type JobCtx, type JobResult, type JobSpec,
  type RegionId, type SchemaModule, type SqlHandle, type StandingState, type TenantId,
} from "@one/kernel";

export const JOB_SCHEMA: SchemaModule = {
  id: "jobs",
  ddl: [
    /*
      ⚠️ GLOBAL, because a job's schedule is a fact about the DEPLOYMENT rather
      than about any workspace — and because the runner has to know what is due
      before it knows which region to open.
    */
    /* ⚠️ `idle` is separate from `skipped`: one is an error signal and the other
       is "nothing to do", and the runner reads them differently. */
    `CREATE TABLE IF NOT EXISTS job_run (id TEXT PRIMARY KEY, job TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, done INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0, idle INTEGER NOT NULL DEFAULT 0, more INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, detail TEXT);`,
    `CREATE INDEX IF NOT EXISTS idx_job_run_recent ON job_run(job, started_at);`,
  ],
  /* ⚠️ For a database that already has the table. The runner tolerates a
     duplicate-column failure here and nowhere else, which is what makes adding
     one to a live deployment an edit rather than a migration. */
  alters: [`ALTER TABLE job_run ADD COLUMN idle INTEGER NOT NULL DEFAULT 0;`],
};

/* ------------------------------------------------------------- the clock --- */

/**
 * ⚠️ THE LAST SUCCESSFUL START, NOT THE LAST ATTEMPT.
 *
 * A job that fails every time and updates its clock anyway is one that never
 * retries: it looks busy, the run table fills with failures nobody is watching,
 * and the work is never done. Reading the last SUCCESS means a broken job keeps
 * trying at its own cadence, which is what somebody debugging it needs.
 */
export async function lastSuccess(db: SqlHandle, jobId: string): Promise<Instant | null> {
  const row = await db.first<{ started_at: string }>(
    `SELECT started_at FROM job_run WHERE job = ? AND failed = 0 ORDER BY started_at DESC LIMIT 1`,
    jobId,
  ).catch(() => null);
  return (row?.started_at ?? null) as Instant | null;
}

/* -------------------------------------------------------------- the runs --- */

export interface RunReport {
  readonly job: string;
  readonly ran: boolean;
  readonly done: number;
  readonly skipped: number;
  readonly idle: number;
  readonly more: boolean;
  readonly failed: boolean;
  readonly detail?: string;
}

export interface RunDeps<B> {
  readonly global: SqlHandle;
  /** Tenants to sweep, per region, already bounded by the caller. */
  tenants(region: RegionId): Promise<readonly { readonly tenantId: TenantId; readonly region: RegionId }[]>;
  regions: readonly RegionId[];
  bindingsFor(region: RegionId): B;
  /**
   * WHERE A WORKSPACE STANDS WITH US, RESOLVED ONCE BY THE PLATFORM.
   *
   * ⚠️ AN APP MUST NEVER ANSWER THIS FOR ITSELF, and the reason is a defect that
   * was live: a sweep acting on a workspace's own customers asked whether the
   * workspace was in arrears by reading a subscription row directly. When the
   * payer moved from the workspace to the account, that row stopped being
   * written — the read kept succeeding, and every suspended workspace quietly
   * resumed acting on records it could no longer see. Nothing failed.
   */
  standingOf(tenantId: TenantId): Promise<StandingState>;
  now(): Instant;
}

/**
 * Run everything that is due.
 *
 * ⚠️ THE SCHEDULE IS CHECKED PER JOB AND THE WORK IS DONE PER TENANT, and
 * collapsing those two is the mistake worth naming. A per-tenant job whose
 * clock advanced after the first tenant would sweep one workspace per day and
 * report success; one whose clock advanced per tenant would never be due at all
 * once a second tenant existed.
 */
export async function runDue<B>(
  jobs: readonly JobSpec[],
  deps: RunDeps<B>,
): Promise<readonly RunReport[]> {
  const reports: RunReport[] = [];

  for (const spec of jobs) {
    const startedAt = deps.now();
    if (!isDue(spec, await lastSuccess(deps.global, spec.id), startedAt)) {
      reports.push({ job: spec.id, ran: false, done: 0, skipped: 0, idle: 0, more: false, failed: false });
      continue;
    }

    let done = 0;
    let skipped = 0;
    let idle = 0;
    let more = false;
    let failed = false;
    let detail: string | undefined;

    try {
      if (spec.scope === "platform") {
        const out = await one(spec, deps, deps.regions[0] ?? ("auto" as RegionId), null);
        done += out.done; skipped += out.skipped ?? 0; idle += out.idle ?? 0; more ||= out.more;
      } else {
        for (const region of deps.regions) {
          for (const tenant of await deps.tenants(region)) {
            /*
              ⚠️ ONE TENANT'S FAILURE IS ONE TENANT'S. A malformed row in one
              workspace must not stop the sweep for everybody else — that is how
              a single bad record freezes a whole deployment's billing ladder,
              and it is invisible because the sweep still "ran".
            */
            try {
              const out = await one(spec, deps, region, tenant.tenantId);
              done += out.done; skipped += out.skipped ?? 0; idle += out.idle ?? 0; more ||= out.more;
            } catch (e) {
              skipped++;
              detail = describe(e);
            }
          }
        }
      }
    } catch (e) {
      failed = true;
      detail = describe(e);
    }

    /*
      ⚠️ EVERY TENANT FAILING IS THE JOB FAILING, and this is not the same rule
      as the one above it. Isolating a tenant is right — one malformed row must
      not freeze a whole deployment's ladder — but a run where NOTHING succeeded
      and something was skipped is a broken job wearing a partial success's
      clothes. Recorded as a success, its clock advances and it never retries:
      the run table fills with healthy-looking rows and the work stops.
    */
    /*
      ⚠️ `idle` IS NOT PART OF THIS RULE. Most workspaces have not configured most
      features, so a sweep that reports one idle per workspace is the ordinary
      case — folding it in here made an ordinary deployment a permanently failing
      job, which is the alarm nobody ends up reading.
    */
    if (!failed && skipped > 0 && done === 0) {
      failed = true;
      detail = detail ?? "every tenant skipped";
    }

    await record(deps.global, spec.id, startedAt, deps.now(), { done, skipped, idle, more, failed, detail });
    reports.push({ job: spec.id, ran: true, done, skipped, idle, more, failed, ...(detail ? { detail } : {}) });
  }

  return reports;
}

const one = async <B>(spec: JobSpec, deps: RunDeps<B>, region: RegionId, tenantId: TenantId | null): Promise<JobResult> =>
  spec.handler({
    bind: deps.bindingsFor(region),
    tenantId,
    region,
    /* ⚠️ RESOLVED PER TENANT, HERE, so no handler has a reason to look it up —
       and a platform-scoped job has no workspace, which is `null` rather than a
       default somebody could mistake for "in good standing". */
    standing: tenantId ? await deps.standingOf(tenantId) : null,
    now: deps.now,
    batch: spec.batch,
  } as unknown as JobCtx<never>);

/**
 * ⚠️ OUR WORDS, NEVER THE PROVIDER'S. A stack trace or a driver's message in a
 * table an operator reads is the same disclosure problem as one on the wire, and
 * it is read by somebody who is already looking for what went wrong rather than
 * for a name they can act on.
 */
const describe = (e: unknown): string => (e instanceof Error ? e.name : "unknown");

async function record(
  db: SqlHandle,
  jobId: string,
  startedAt: Instant,
  finishedAt: Instant,
  out: { done: number; skipped: number; idle: number; more: boolean; failed: boolean; detail?: string },
): Promise<void> {
  await db.run(
    `INSERT INTO job_run (id, job, started_at, finished_at, done, skipped, idle, more, failed, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(), jobId, startedAt, finishedAt, out.done, out.skipped, out.idle, out.more ? 1 : 0, out.failed ? 1 : 0, out.detail ?? null,
  ).catch(() => undefined);
}

/* ------------------------------------------------------------- the report --- */

export interface JobHistory {
  readonly job: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly done: number;
  readonly skipped: number;
  readonly idle: number;
  readonly more: boolean;
  readonly failed: boolean;
  readonly detail: string | null;
}

/**
 * What the scheduler has actually been doing.
 *
 * ⚠️ THE SURFACE IS THE POINT. A run table nobody can read is the same silence
 * with an extra table — the same argument as the payment dead letter, and the
 * same conclusion: it is not optional and it is behind an operator permission.
 */
export async function jobHistory(db: SqlHandle, limit: number): Promise<readonly JobHistory[]> {
  const rows = await db.all<{
    job: string; started_at: string; finished_at: string | null;
    done: number; skipped: number; idle: number; more: number; failed: number; detail: string | null;
  }>(`SELECT job, started_at, finished_at, done, skipped, idle, more, failed, detail FROM job_run ORDER BY started_at DESC LIMIT ?`, limit)
    .catch(() => []);
  return rows.map((r) => ({
    job: r.job, startedAt: r.started_at, finishedAt: r.finished_at,
    done: r.done, skipped: r.skipped, idle: r.idle, more: r.more === 1, failed: r.failed === 1, detail: r.detail,
  }));
}
