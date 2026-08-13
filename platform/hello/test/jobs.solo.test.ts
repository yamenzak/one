/**
 * THE SCHEDULER, AGAINST A REAL DATABASE.
 *
 * ⚠️ ITS OWN INVOCATION, because a sweep runs across every workspace in the
 * deployment — the same reason maintenance has one. A run here would otherwise
 * delete another suite's rows while it was looking at them.
 *
 * ⚠️ AND THE QUERY IS THE POINT. `lastSuccess` reads past failed runs to the
 * last one that worked, and that is a predicate in SQL — a fake that answered
 * it in JavaScript would make the actual query untestable, which is what the
 * first version of the unit test did.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { arrearsJob, bindingsFor, jobHistory, lastSuccess, runDue } from "@one/runtime";
import { job, sql, type Instant, type RegionId, type ResolvedRegion, type SqlHandle, type TenantId } from "@one/kernel";

const ORIGIN = "https://sweep.hello.4dl.app";
let member = "";

const handle = (binding: string): SqlHandle =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>)[binding] }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

beforeAll(async () => {
  const staff = await signIn("sweep@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "sweep" }, staff);
  member = await signIn("sweep@example.test", ORIGIN);
});

const deps = (now: string) => ({
  global: handle("DIRECTORY"),
  regions: ["auto"] as RegionId[],
  now: () => now as Instant,
  bindingsFor: () => ({ db: handle("DB") }),
  /* ⚠️ Resolved by the platform, so a handler never reads a billing table. */
  standingOf: async () => ({ standing: "active" as const, reason: "ok" as const }),
  tenants: async () => [{ tenantId: "t_sweep" as TenantId, region: "auto" as RegionId }],
});

const sweeping = (id: string, handler: () => Promise<{ done: number; more: boolean }>) =>
  job({ id, summary: "s", every: "daily", scope: "tenant", batch: 5, handler });

/* ----------------------------------------------------------------- clock --- */

describe("the clock, in SQL", () => {
  /*
    ⚠️ THE LAST SUCCESS, NOT THE LAST ATTEMPT. A job that fails every time and
    advances its clock anyway never retries: it looks busy, the run table fills
    with failures nobody is watching, and the work is never done.
  */
  it("reads past a failed run to the last one that worked", async () => {
    const g = handle("DIRECTORY");
    await runDue([sweeping("clock", async () => ({ done: 1, more: false }))], deps("2026-01-01T00:00:00.000Z"));
    expect(await lastSuccess(g, "clock")).toBe("2026-01-01T00:00:00.000Z");

    await runDue([sweeping("clock", async () => { throw new Error("no"); })], deps("2026-01-09T00:00:00.000Z"));
    expect(
      await lastSuccess(g, "clock"),
      "a failure must not advance the clock, or a broken job never retries",
    ).toBe("2026-01-01T00:00:00.000Z");
  });

  it("is due again because the failure did not count", async () => {
    const ran: string[] = [];
    await runDue([sweeping("clock", async () => { ran.push("x"); return { done: 1, more: false }; })], deps("2026-01-03T00:00:00.000Z"));
    expect(ran.length, "two days after the last SUCCESS, a daily job is due").toBe(1);
  });

  it("keeps one job's clock to itself", async () => {
    const g = handle("DIRECTORY");
    await runDue([sweeping("other", async () => ({ done: 1, more: false }))], deps("2026-02-01T00:00:00.000Z"));
    expect(await lastSuccess(g, "clock")).not.toBe("2026-02-01T00:00:00.000Z");
  });
});

/* --------------------------------------------------------------- the app --- */

describe("the app's own sweep", () => {
  /*
    ⚠️ THE SCHEDULED HANDLER IS THE RUNTIME'S. A worker that writes its own is
    one where the run record, the isolation between jobs and the bound on a
    sweep are each optional — and every one of them is invisible when missing.
  */
  it("runs from the worker's scheduled entry point", async () => {
    const reports = (await (worker as unknown as { scheduled(c: unknown, e: unknown): Promise<{ job: string }[]> })
      .scheduled(null, env)) as { job: string }[];
    expect(reports.map((r) => r.job)).toContain("notes.tidy");
  });

  it("is readable by an operator afterwards", async () => {
    const history = await jobHistory(handle("DIRECTORY"), 50);
    expect(history.some((h) => h.job === "notes.tidy")).toBe(true);
  });

  /*
    ⚠️ ON THE OPERATOR DOOR, AND NOT ON A WORKSPACE'S. The run table is the whole
    deployment's — every workspace any sweep visited — so a workspace owner
    holding the key to it is reading somebody else's operations.
  */
  it("answers the operator surface too", async () => {
    const operator = await signIn("op@tidy.example.test", "https://admin.hello.4dl.app");
    const res = await worker.fetch(
      new Request(`https://admin.hello.4dl.app/api/billing.jobs`, { headers: { cookie: operator } }),
      env as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: { job: string }[] };
    expect(body.runs.length).toBeGreaterThan(0);

    const refused = await worker.fetch(
      new Request(`${ORIGIN}/api/billing.jobs`, { headers: { cookie: member } }),
      env as never,
    );
    expect(refused.status).toBe(403);
  });
});

/* --------------------------------------------------------------- the last rung --- */

/**
 * THE ONLY SWEEP IN THE PLATFORM THAT DESTROYS ANYTHING.
 *
 * ⚠️ IT HAD A PURE FUNCTION AND NOTHING CALLING IT. `standingOf` reported
 * `blocked` from the tenth day and `dueForErasure` was never invoked — so a
 * workspace that stopped paying stayed withheld forever, its records kept, and
 * the deployment paid to store them. That is a mechanism with no surface where
 * the surface is a SWEEP, which nobody notices because there is no screen to be
 * missing.
 */
describe("erasing a workspace that never paid", () => {
  const NOW = "2026-08-13T00:00:00.000Z";
  const ago = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

  const arrears = async (over: { pastDueAt?: string | null; closingAt?: string | null } = {}) => {
    const slug = `gone${Math.random().toString(36).slice(2, 7)}`;
    const staff = await signIn(`${slug}@example.test`, SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug }, staff);
    const tenantId = made.body.tenantId as string;
    await handle("DIRECTORY").run(
      `INSERT INTO account_subscription (id, account_id, product_id, tenant_id, plan_id, status, past_due_at, closing_at, started_at, updated_at)
       VALUES (?, 'acc', 'hello', ?, 'keeper', ?, ?, ?, ?, ?)`,
      `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, tenantId,
      over.closingAt ? "active" : "past_due", over.pastDueAt ?? null, over.closingAt ?? null, NOW, NOW,
    );
    return { tenantId, slug };
  };

  const stillThere = async (tenantId: string) =>
    (await handle("DIRECTORY").first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tenant_directory WHERE tenant_id = ?`, tenantId,
    ))?.n === 1;

  /*
    ⚠️ A DAY OF ITS OWN PER SWEEP, because `runDue` is DAILY and every call in
    this block shares one deployment. Run on one clock, the first sweep succeeds
    and the next three report `ran: false` — so three assertions about a
    destructive path would pass against a job that never executed, which is the
    exact shape of pass this suite exists to refuse.
  */
  let day = 0;
  const sweep = async (tenantId: string) =>
    runDue([arrearsJob(() => ({
      global: handle("DIRECTORY"),
      objectsFor: () => null,
      modules: [],
      keeping: [],
    }))], {
      ...deps(new Date(Date.parse(NOW) + day++ * 86_400_000).toISOString()),
      tenants: async () => [{ tenantId: tenantId as TenantId, region: "auto" as RegionId }],
    });

  /*
    ⚠️ NOT BEFORE THE LAST RUNG. Every rung before this one is reversible by
    paying, and erasing at the blocked rung would take a workspace three weeks
    before the ladder says it may — while every screen said sixty days.
  */
  it("leaves a blocked workspace alone until the ladder says otherwise", async () => {
    const { tenantId } = await arrears({ pastDueAt: ago(40) });
    await sweep(tenantId);
    expect(await stillThere(tenantId)).toBe(true);
  });

  it("erases one that is past it, and takes its subscription with it", async () => {
    const { tenantId } = await arrears({ pastDueAt: ago(70) });
    const out = await sweep(tenantId);
    expect(out[0]!.done).toBe(1);
    expect(await stillThere(tenantId)).toBe(false);
    /* ⚠️ OR THE NEXT RUN FINDS A WORKSPACE WITH NO ROWS, erases nothing, and
       reports success every day forever. */
    expect((await handle("DIRECTORY").first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM account_subscription WHERE tenant_id = ?`, tenantId,
    ))?.n).toBe(0);
  });

  /*
    ⚠️ AND A WORKSPACE ITS OWNER CLOSED GOES ON ITS OWN DATE. Somebody who
    decided to leave is not in arrears and must not wait two months for a
    decision they already made — but it is the same erasure, because two branches
    disagree eventually and the disagreement is about whether records still exist.
  */
  it("erases one the owner closed, on the date they were given", async () => {
    const { tenantId } = await arrears({ closingAt: ago(1) });
    await sweep(tenantId);
    expect(await stillThere(tenantId)).toBe(false);
  });

  it("waits while a closure is still in its notice period", async () => {
    /* ⚠️ Well clear of the clock this block advances, so what is asserted is the
       notice period rather than the order the tests happen to run in. */
    const { tenantId } = await arrears({ closingAt: new Date(Date.parse(NOW) + 30 * 86_400_000).toISOString() });
    await sweep(tenantId);
    expect(await stillThere(tenantId)).toBe(true);
  });

  /*
    ⚠️ A WORKSPACE WITH NO SUBSCRIPTION IS NEVER ERASED. One made before this
    rail existed, or by an operator, has no row — and reading that absence as
    "unpaid forever" would delete exactly the workspaces nobody ever charged.
  */
  it("never erases a workspace nobody ever charged", async () => {
    const slug = `kept${Math.random().toString(36).slice(2, 7)}`;
    const staff = await signIn(`${slug}@example.test`, SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug }, staff);
    const tenantId = made.body.tenantId as string;
    await handle("DIRECTORY").run(`DELETE FROM account_subscription WHERE tenant_id = ?`, tenantId);
    await sweep(tenantId);
    expect(await stillThere(tenantId)).toBe(true);
  });
});
