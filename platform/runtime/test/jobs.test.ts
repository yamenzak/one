/**
 * SCHEDULED WORK — and the two ways it fails, both of them silent.
 *
 * ⚠️ IT DOES NOT BREAK, IT STOPS. The first anybody knows is a workspace that
 * was never suspended, a budget that never expired, or a digest nobody received
 * for five weeks. Everything here is about making that state visible before
 * somebody else finds it.
 */

import { describe, expect, it } from "vitest";
import { job, type Instant, type JobSpec, type RegionId, type SqlHandle, type TenantId } from "@one/kernel";
import { jobHistory, JOB_SCHEMA, runDue } from "../src/jobs.js";

const AT = (iso: string) => iso as Instant;

/** A store that answers the four statements the runner issues. */
function global_() {
  const runs: Record<string, unknown>[] = [];
  return {
    runs,
    db: {
      async first<T>(sql: string, ...p: readonly unknown[]) {
        if (!sql.includes("job_run")) return null;
        const found = [...runs].reverse().find((r) => r.job === p[0] && r.failed === 0);
        return (found ? { started_at: found.started_at } : null) as T | null;
      },
      async all<T>(sql: string, ...p: readonly unknown[]) {
        if (sql.includes("tenant_directory")) return [] as T[];
        return [...runs].reverse().slice(0, Number(p[0] ?? 100)) as T[];
      },
      async run(sql: string, ...p: readonly unknown[]) {
        if (sql.startsWith("INSERT INTO job_run")) {
          runs.push({
            id: p[0], job: p[1], started_at: p[2], finished_at: p[3],
            done: p[4], skipped: p[5], idle: p[6], more: p[7], failed: p[8], detail: p[9],
          });
        }
      },
    } as unknown as SqlHandle,
  };
}

const deps = (g: ReturnType<typeof global_>, tenants: string[], now: string) => ({
  global: g.db,
  regions: ["auto"] as RegionId[],
  now: () => AT(now),
  bindingsFor: () => ({}),
  /* ⚠️ Resolved by the platform, so a handler never reads a billing table. */
  standingOf: async () => ({ standing: "active" as const, reason: "ok" as const }),
  tenants: async () => tenants.map((t) => ({ tenantId: t as TenantId, region: "auto" as RegionId })),
});

const sweeping = (over: Partial<JobSpec> = {}) =>
  job({
    id: "sweep", summary: "s", every: "daily", scope: "tenant", batch: 10,
    async handler() { return { done: 1, more: false }; },
    ...over,
  } as JobSpec);

/* ----------------------------------------------------------------- clock --- */

/*
  ⚠️ `isDue` IS PROVED IN THE KERNEL SUITE, WHERE THE FUNCTION LIVES. What is
  proved here is the QUERY that feeds it — and a fake that reimplemented the
  predicate would make the query untestable, which is exactly what the first
  version of this file did. See `hello/test/jobs.test.ts` for the real database.
*/

/* ------------------------------------------------------------------ runs --- */

describe("running what is due", () => {
  it("visits every tenant and adds up what they did", async () => {
    const g = global_();
    const out = await runDue([sweeping()], deps(g, ["t1", "t2", "t3"], "2026-01-10T00:00:00.000Z"));
    expect(out[0]).toMatchObject({ job: "sweep", ran: true, done: 3, failed: false });
  });

  /*
    ⚠️ THE SCHEDULE IS CHECKED PER JOB AND THE WORK IS DONE PER TENANT. A clock
    that advanced after the first tenant would sweep one workspace a day and
    report success; one that advanced per tenant would never be due again once a
    second workspace existed.
  */
  it("records exactly one run for a job however many tenants it visited", async () => {
    const g = global_();
    await runDue([sweeping()], deps(g, ["t1", "t2", "t3"], "2026-01-10T00:00:00.000Z"));
    expect(g.runs.filter((r) => r.job === "sweep").length).toBe(1);
  });

  it("skips a job that is not due, and says it did not run", async () => {
    const g = global_();
    g.runs.push({ job: "sweep", started_at: "2026-01-10T00:00:00.000Z", failed: 0 });
    const out = await runDue([sweeping()], deps(g, ["t1"], "2026-01-10T01:00:00.000Z"));
    expect(out[0]).toMatchObject({ ran: false, done: 0 });
    expect(g.runs.length, "a run that did not happen is not a run").toBe(1);
  });

  it("runs a platform-scoped job once, with no tenant", async () => {
    const g = global_();
    const seen: (string | null)[] = [];
    const once = sweeping({ scope: "platform", async handler(ctx) { seen.push(ctx.tenantId); return { done: 1, more: false }; } });
    await runDue([once], deps(g, ["t1", "t2"], "2026-01-10T00:00:00.000Z"));
    expect(seen).toEqual([null]);
  });

  /*
    ⚠️ ONE TENANT'S FAILURE IS ONE TENANT'S. A malformed row in one workspace
    must not stop the sweep for everybody else — that is how a single bad record
    freezes a whole deployment's billing ladder, invisibly, because the sweep
    still "ran".
  */
  it("carries on past a workspace that throws, and counts it as skipped", async () => {
    const g = global_();
    const brittle = sweeping({
      async handler(ctx) {
        if (ctx.tenantId === "t2") throw new Error("bad row");
        return { done: 1, more: false };
      },
    });
    const out = await runDue([brittle], deps(g, ["t1", "t2", "t3"], "2026-01-10T00:00:00.000Z"));
    expect(out[0]).toMatchObject({ done: 2, skipped: 1, failed: false });
  });

  /*
    ⚠️ ONE JOB'S FAILURE NEVER STOPS THE OTHERS. A sweep that throws must not
    take the dunning ladder down with it.
  */
  it("runs every other job after one fails outright", async () => {
    const g = global_();
    const broken = sweeping({ id: "broken", scope: "platform", async handler() { throw new Error("no"); } });
    const out = await runDue([broken, sweeping({ id: "fine" })], deps(g, ["t1"], "2026-01-10T00:00:00.000Z"));
    expect(out.map((r) => [r.job, r.failed])).toEqual([["broken", true], ["fine", false]]);
  });

  /*
    ⚠️ A FAILED RUN IS STILL RECORDED. The characteristic failure of scheduled
    work is silence, and a run table with nothing in it looks exactly like a
    deployment where nothing needed doing.
  */
  it("records the failure rather than losing it", async () => {
    const g = global_();
    await runDue([sweeping({ scope: "platform", async handler() { throw new TypeError("no"); } })], deps(g, [], "2026-01-10T00:00:00.000Z"));
    expect(g.runs[0]).toMatchObject({ failed: 1, detail: "TypeError" });
  });

  /*
    ⚠️ OUR WORDS, NEVER THE PROVIDER'S. A driver's message in an operator's table
    is the same disclosure problem as one on the wire.
  */
  it("records what kind of failure it was, not what the error said", async () => {
    const g = global_();
    await runDue([sweeping({ scope: "platform", async handler() { throw new Error("connection to db-7 at 10.0.0.4 refused"); } })], deps(g, [], "2026-01-10T00:00:00.000Z"));
    expect(String(g.runs[0]!.detail)).not.toContain("10.0.0.4");
  });

  /*
    ⚠️ `more` IS HOW A BOUND STAYS HONEST. A sweep that hit its ceiling and said
    nothing is indistinguishable from one that finished, so a backlog builds at
    exactly the rate the ceiling truncates it.
  */
  it("carries a hit ceiling up from any tenant that reported one", async () => {
    const g = global_();
    const full = sweeping({ async handler(ctx) { return { done: 10, more: ctx.tenantId === "t2" }; } });
    const out = await runDue([full], deps(g, ["t1", "t2"], "2026-01-10T00:00:00.000Z"));
    expect(out[0]!.more).toBe(true);
    expect(g.runs[0]).toMatchObject({ more: 1 });
  });

  it("hands the handler the bound the job declared, never a bigger one", async () => {
    const g = global_();
    const seen: number[] = [];
    await runDue([sweeping({ batch: 7, async handler(ctx) { seen.push(ctx.batch); return { done: 0, more: false }; } })],
      deps(g, ["t1", "t2"], "2026-01-10T00:00:00.000Z"));
    expect(seen).toEqual([7, 7]);
  });
});

/* --------------------------------------------------------------- history --- */

describe("what the scheduler has been doing", () => {
  it("is readable, most recent first", async () => {
    const g = global_();
    await runDue([sweeping({ id: "a", scope: "platform" })], deps(g, [], "2026-01-10T00:00:00.000Z"));
    await runDue([sweeping({ id: "b", scope: "platform" })], deps(g, [], "2026-01-10T00:00:00.000Z"));
    expect((await jobHistory(g.db, 10)).map((h) => h.job)).toEqual(["b", "a"]);
  });

  it("keeps its record in the global store, where the schedule is decided", () => {
    expect(JOB_SCHEMA.ddl[0]).toMatch(/job_run/);
    expect(JOB_SCHEMA.scoped, "a run belongs to the deployment, not to a workspace").toBeUndefined();
  });
});
