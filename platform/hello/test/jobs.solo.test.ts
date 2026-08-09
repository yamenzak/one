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
import { bindingsFor, jobHistory, lastSuccess, runDue } from "@one/runtime";
import { job, sql, type Instant, type RegionId, type ResolvedRegion, type SqlHandle, type TenantId } from "@one/kernel";

const ORIGIN = "https://sweep.hello.4dl.app";
let member = "";

const handle = (binding: string): SqlHandle =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>)[binding] }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

beforeAll(async () => {
  const staff = await signIn("sweep@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "sweep" }, staff);
  member = await signIn("sweep-owner@example.test", ORIGIN);
});

const deps = (now: string) => ({
  global: handle("DIRECTORY"),
  regions: ["auto"] as RegionId[],
  now: () => now as Instant,
  bindingsFor: () => ({ db: handle("DB") }),
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

  it("answers the operator surface too", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/billing.jobs`, { headers: { cookie: member } }),
      env as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: { job: string }[] };
    expect(body.runs.length).toBeGreaterThan(0);
  });
});
