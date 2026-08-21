/**
 * A NIGHT'S WORK REACHING A PERSON.
 *
 * ⚠️ THE FAILURE THIS IS ABOUT IS AN INBOX THAT STAYS EMPTY. Every piece around
 * this was already built — the sweep runs, `batch.due` computes an expiry, the
 * inbox can be read, the bell draws a count — and a job had no way to tell
 * anybody anything, so the whole value of writing a date on a delivery was that
 * somebody could go and look for it themselves. An empty inbox is
 * indistinguishable from an inbox nothing writes to, which is why every gap of
 * this shape in this repository went unnoticed for stages at a time.
 *
 * ⚠️ AND AN UNDECLARED EVENT IS REFUSED, LOUDLY, PER WORKSPACE. `emits` is what
 * the manifest checked a notification against; a body free to raise anything
 * would be a body raising events nothing listens to — which returns cleanly,
 * tells nobody, and looks exactly like success.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { JobDef, TenantId } from "@engine/kernel";
import { JOBS_SCHEMA, applySchema, runJob, type Db, type RunnerDeps } from "../src/index.js";

const db = () => env.DIRECTORY as unknown as Db;
const TENANT = "ten_night" as TenantId;
const NOW = new Date("2026-08-21T05:00:00.000Z");

beforeEach(async () => {
  await applySchema(db(), [JOBS_SCHEMA]);
  await db().exec(`DELETE FROM job_run;`);
});

/** A job that finds one thing and says so, exactly as the expiry sweep does. */
const sweep = (work: JobDef["work"], emits?: readonly string[]): JobDef => ({
  id: "expiry", label: "What runs out", why: "Says what crossed a line overnight.",
  schedule: "0 5 * * *", scope: "per-tenant",
  onFail: { then: "park" },
  rerunnable: true,
  ...(emits ? { emits } : {}),
  work,
});

const told: { event: string; values: Record<string, unknown>; tenantId: string }[] = [];

const deps = (extra: Partial<RunnerDeps> = {}): RunnerDeps => ({
  directory: db(),
  tenants: async () => [TENANT],
  shardOf: async () => db(),
  telling: async ({ tenantId, event, values }) => { told.push({ tenantId, event, values }); },
  ...extra,
});

beforeEach(() => { told.length = 0; });

/* ------------------------------------------------------------- the budget --- */

describe("how long a pass may take", () => {
  /*
    ⚠️ THE BUDGET IS WALL-CLOCK, AND MIXING IT WITH THE LOGICAL INSTANT MADE
    EVERY PASS A NO-OP. The deadline was `now.getTime() + budget`, so a caller
    handing over any instant in the past — a test, a replay, a run scheduled
    from a stored time — set a deadline that `Date.now()` was already past. The
    loop broke before the first workspace and the run reported `ok` with
    "stopped on its budget", which reads as a busy night that ran out of time.

    ⚠️ AND IT PASSED OR FAILED BY THE HOUR. Every test in this file used a fixed
    05:00, so the whole suite was green before six in the morning and red after
    it — the most expensive shape a test can have, because the first person to
    see it red assumes they broke it.
  */
  it("runs a pass handed an instant from long ago", async () => {
    const row = await runJob(deps(), sweep(async () => ({ touched: 7 })),
      new Date("2020-01-01T00:00:00.000Z"));

    expect(row?.ok).toBe(true);
    expect(row?.touched).toBe(7);
    expect(row?.detail ?? "").not.toContain("budget");
  });

  /* ⚠️ AND THE INSTANT IS STILL WHAT THE WORK IS TOLD, because what a sweep
     records happened at the time it was run FOR, not at the moment the machine
     got round to it. */
  it("hands the work the instant it was given", async () => {
    let said = "";
    await runJob(deps(), sweep(async (ctx) => { said = ctx.now; return { touched: 0 }; }),
      new Date("2020-01-01T00:00:00.000Z"));
    expect(said).toBe("2020-01-01T00:00:00.000Z");
  });
});

describe("a job that tells somebody", () => {
  /*
    ⚠️ THE ORDINARY CASE, AND IT IS THE ONE THAT DID NOT EXIST. The job is called
    once per workspace with that workspace's database, and what it raises goes
    into THAT workspace's inbox — the audience resolved by permission, exactly as
    a request's would be.
  */
  it("raises what it declares, in the workspace it found it in", async () => {
    const row = await runJob(deps(), sweep(
      async (ctx) => {
        await ctx.tell?.("batch.expired", { count: "3 things" });
        return { touched: 3 };
      },
      ["batch.expired"],
    ), NOW);

    expect(row?.ok).toBe(true);
    expect(told).toEqual([
      { tenantId: TENANT, event: "batch.expired", values: { count: "3 things" } },
    ]);
  });

  /*
    ⚠️ AN UNDECLARED EVENT IS REFUSED RATHER THAN FILED, and the refusal lands in
    the run record where an operator can read it. Filing it would be worse than
    the throw: the manifest never checked a notification against it, so nothing
    is listening, and the job would report a clean night having told nobody.
  */
  it("refuses an event it did not declare, and says which workspace", async () => {
    const row = await runJob(deps(), sweep(
      async (ctx) => {
        await ctx.tell?.("stock.low", { count: "1 thing" });
        return { touched: 1 };
      },
      ["batch.expired"],
    ), NOW);

    expect(told).toEqual([]);
    /* ⚠️ THE PASS SURVIVES ONE WORKSPACE'S FAULT — it is reported, not fatal. */
    expect(row?.ok).toBe(true);
    expect(row?.detail).toContain(TENANT);
    expect(row?.detail).toContain("does not declare");
  });

  /*
    ⚠️ NO `emits`, NO `tell` — absent rather than present and inert. A body then
    reads `ctx.tell?.(…)` and does its work either way, which is what every test
    harness and every deployment with no inbox wired actually is.
  */
  it("hands no tell to a job that declares no events", async () => {
    let had: unknown = "unset";
    await runJob(deps(), sweep(async (ctx) => { had = ctx.tell; return { touched: 0 }; }), NOW);
    expect(had).toBeUndefined();
  });

  /* ⚠️ AND NONE TO A DEPLOYMENT THAT CANNOT TELL ANYBODY. `telling` absent is a
     state — no inbox, a test — rather than a fault, and the sweep still sweeps. */
  it("hands no tell where the deployment has no inbox", async () => {
    let had: unknown = "unset";
    const row = await runJob(
      { ...deps(), telling: undefined },
      sweep(async (ctx) => { had = ctx.tell; return { touched: 7 }; }, ["batch.expired"]),
      NOW,
    );
    expect(had).toBeUndefined();
    expect(row?.touched).toBe(7);
  });
});

describe("a job reading what the workspace switched on", () => {
  /*
    ⚠️ THE SAME NUMBERS THE SCREEN READS. "How many days counts as soon" is a
    decision about a business — three for a kitchen, ninety for a pharmacy — and
    a sweep that could not read it would hard-code one, so the notification and
    the list it links to would be drawn at two different thresholds with nothing
    anywhere saying which is the workspace's answer.
  */
  it("reads a setting, once per workspace however often it is asked", async () => {
    let asks = 0;
    const seen: unknown[] = [];
    await runJob(
      deps({
        settings: async () => { asks++; return { "inventory.warn_days": 90 }; },
      }),
      sweep(async (ctx) => {
        seen.push(await ctx.setting?.("inventory.warn_days"));
        seen.push(await ctx.setting?.("inventory.warn_days"));
        return { touched: 0 };
      }),
      NOW,
    );
    expect(seen).toEqual([90, 90]);
    expect(asks).toBe(1);
  });

  /* ⚠️ AND ABSENT IS ABSENT, so a body falls back in the open rather than being
     handed a resolver that answers `undefined` for everything. */
  it("hands no setting where the runner has no app to resolve against", async () => {
    let had: unknown = "unset";
    await runJob(
      { ...deps(), settings: undefined },
      sweep(async (ctx) => { had = ctx.setting; return { touched: 0 }; }),
      NOW,
    );
    expect(had).toBeUndefined();
  });
});
