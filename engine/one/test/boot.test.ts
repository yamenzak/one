/**
 * THE DEPLOYMENT BOOTS AND ANSWERS ON EVERY DOOR.
 *
 * ⚠️ THIS IS THE TEST THE PREVIOUS PLATFORM DID NOT HAVE, AND IT COST A DAY. An
 * app shipped green from its deploy workflow while `createAuth` threw in the
 * first middleware, so every route answered 500 — including `/health` — and the
 * page still loaded, because static assets never reach the worker. "Deployed" is
 * not "working", and the only thing that tells them apart is a request.
 *
 * ⚠️ AND IT DRIVES THE REAL HOST TOPOLOGY. Miniflare preserves the Host exactly
 * as the edge does, so `setup.localhost` IS the setup door. A suite that drove
 * one origin and asserted door behaviour from a flag would be testing the flag.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { addShard, createTenant, noteShardApp, type Db } from "@engine/runtime";
import worker, { APPS } from "../src/index.js";

const call = (host: string, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`http://${host}:8080${path}`, init), env as never);

/** ⚠️ What `wrangler dev` passes; the deployed config says `production`. */
const asDev = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };
const callDev = (host: string, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`http://${host}:8080${path}`, init), asDev as never);

beforeAll(async () => {
  /* The worker applies its own schema on the first request — that is the thing
     being tested — so all this needs is somewhere to put a workspace. */
  await callDev("localhost", "/health");
  await addShard(env.DIRECTORY as unknown as Db, "eu-1", "eu", 100);
  for (const id of Object.keys(APPS)) await noteShardApp(env.DIRECTORY as unknown as Db, "eu-1", id);
});

describe("the worker on its own", () => {
  /*
    ⚠️ `/health` ANSWERING IS THE WHOLE POINT. It is the one request a deploy can
    make that proves the isolate got past its own boot — and the previous
    platform's did not, for a day, behind a green workflow.
  */
  it("answers /health on every door", async () => {
    for (const host of ["localhost", "id.localhost", "setup.localhost", "admin.localhost"]) {
      const res = await callDev(host, "/health");
      expect(res.status, host).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true });
    }
  });

  /* ⚠️ And it names which door it is, because the doors ARE the tenancy. */
  it("knows which door each hostname is", async () => {
    const doors: Record<string, string> = {
      "localhost": "signpost",
      "id.localhost": "account",
      "setup.localhost": "setup",
      "admin.localhost": "operator",
      "ironworks.localhost": "tenant",
    };
    for (const [host, kind] of Object.entries(doors)) {
      expect((await callDev(host, "/health").then((r) => r.json())) as { door: string }, host)
        .toMatchObject({ door: kind });
    }
  });

  /* ⚠️ An unrecognised host is nothing, never a default. */
  it("answers nothing at a hostname it was never told about", async () => {
    expect((await callDev("someone-elses.example", "/health")).status).toBe(404);
  });

  /*
    ⚠️ AND IT REFUSES TO SERVE WITHOUT THE THINGS IT CANNOT SAFELY GUESS. With
    no signing secret every sign-in code is signed with `undefined` — a constant,
    and one anybody reading this repository already has, so the codes are
    forgeable and nothing looks wrong anywhere. With no `ROOT` every hostname
    classifies as no door at all. Neither is a degraded feature.

    ⚠️ It is checked at BOOT rather than at the sign-in route, so `/health` says
    it too — a probe that reports healthy on a deployment which cannot sign
    anybody in is the reverse of a probe.
  */
  it("refuses to serve at all when it cannot sign anything", async () => {
    for (const absent of ["AUTH_SECRET", "ROOT"]) {
      const crippled = { ...asDev, [absent]: "" };
      const res = await worker.fetch(
        new Request("http://localhost:8080/health"), crippled as never);
      expect(res.status, absent).toBe(503);
    }
  });

  /*
    ⚠️ THE SCHEMA IS APPLIED BY THE WORKER, ONCE, BEFORE THE FIRST REQUEST IS
    ANSWERED. Firing it rather than awaiting it answers "no such table" to
    whoever happens to be first after a deploy — a fault that appears once and
    never reproduces.
  */
  it("has its tables before it answers anything", async () => {
    const row = await (env.DIRECTORY as unknown as Db)
      .prepare(`SELECT COUNT(*) AS n FROM tenant`).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});

/* ------------------------------------------------------------- the page --- */

describe("what a browser gets", () => {
  /*
    ⚠️ EVERYTHING THAT IS NOT `/api/*` IS THE PAGE. A single-page app owns its
    own routing, so an unknown path is its business — and `/api/` is the one
    prefix that is ours, which is why every operation answers under it.
  */
  it("hands an ordinary path to the Hub rather than 404ing it", async () => {
    const res = await callDev("id.localhost", "/settings/notifications");
    /* The assets binding is not mounted in this suite, so what is asserted is
       that the worker DELEGATED rather than answered — a 404 from the platform
       would mean the SPA never gets a chance to route. */
    expect(res.status).not.toBe(404);
  });

  it("keeps the api to itself", async () => {
    const res = await callDev("setup.localhost", "/api/nothing.here");
    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty("problem");
  });
});

/* ------------------------------------------------------------- sign in --- */

describe("signing in through the deployment", () => {
  /*
    ⚠️ A DEPLOYMENT THAT CANNOT SEND MUST NOT PRETEND. "Check your email" with
    nothing sent is a product that appears to work and cannot be used — so
    outside development, no mailer is a refusal rather than a shrug.
  */
  it("refuses to claim it sent a code it could not send", async () => {
    const res = await call("setup.localhost", "/api/me.code", {
      method: "POST", body: JSON.stringify({ email: "sam@example.com" }),
    });
    expect(res.status).toBe(503);
  });

  /*
    ⚠️ AND IT WITHDRAWS THE CODE IT COULD NOT SEND. The row is written before the
    send is attempted — it has to be, or a delivered code could be one we never
    recorded — so leaving it there refuses the next attempt as "too often" while
    nothing was ever delivered. The person is then told to wait a minute for a
    code that does not exist, which is a sentence pointing at them rather than at
    us. This suite found it by trying the same address twice.
  */
  it("leaves nothing behind when the send failed", async () => {
    const rows = await (env.DIRECTORY as unknown as Db)
      .prepare(`SELECT COUNT(*) AS n FROM code WHERE email = ?`)
      .bind("sam@example.com").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("sends one in development, and exchanges it for a session", async () => {
    const asked = await callDev("setup.localhost", "/api/me.code", {
      method: "POST", body: JSON.stringify({ email: "sam@example.com" }),
    });
    expect(asked.status).toBe(200);

    const code = await (env.DIRECTORY as unknown as Db)
      .prepare(`SELECT id FROM code WHERE email = ? ORDER BY at DESC LIMIT 1`)
      .bind("sam@example.com").first<{ id: string }>();
    expect(code).toBeTruthy();
  });
});

/* ---------------------------------------------------------------- the clock --- */

/**
 * ⚠️ THE SWEEP IS THE ONE THING NOBODY IS WAITING FOR, WHICH IS WHY IT NEEDS A
 * TEST MORE THAN A ROUTE DOES. A route that stops working is a person on the
 * phone; a scheduled handler that stops working is silence, and the thing it
 * does — destroying the records of a workspace 37 days past due — is the one
 * step nothing else in the platform will ever take.
 *
 * ⚠️ AND IT IS DRIVEN THROUGH `worker.scheduled`, not through the sweep it
 * calls. The handler compiling, typechecking and being unit-tested is exactly
 * the state this deployment was in an hour ago, with nothing calling it.
 */
describe("what happens to a workspace nobody is looking at", () => {
  const directory = () => env.DIRECTORY as unknown as Db;
  const shard = () => env.SHARD_EU_1 as unknown as Db;
  const asDevEnv = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };

  const fire = async () => {
    const waited: Promise<unknown>[] = [];
    await worker.scheduled!({}, asDevEnv as never, { waitUntil: (p) => { waited.push(p); } });
    await Promise.all(waited);
  };

  /** Past due by `days`, with one record on its shard. */
  const overdue = async (slug: string, days: number) => {
    const made = await createTenant(directory(), {
      slug, name: slug, country: "DE", where: "eu", apps: ["hello"],
    });
    if (typeof made === "string") throw new Error(made);
    const at = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    await directory().prepare(
      `INSERT INTO subscription (tenant_id, app_id, plan_id, status, past_due_at, at)
       VALUES (?, 'hello', 'free', 'past_due', ?, ?)`)
      .bind(made.tenant.id, at, at).run();
    await shard().prepare(
      `INSERT INTO note (id, tenant_id, title, at, by) VALUES (?, ?, 'Kept', ?, NULL)`)
      .bind(`note_${slug}`, made.tenant.id, at).run();
    return made.tenant.id;
  };

  const notesOf = async (tenantId: string) => {
    const rows = await shard().prepare(`SELECT id FROM note WHERE tenant_id = ?`)
      .bind(tenantId).all<{ id: string }>();
    return rows.results.length;
  };

  it("erases what is past the last rung and leaves what is not", async () => {
    const doomed = await overdue("faded", 40);
    const inArrears = await overdue("lately", 10);

    await fire();

    expect(await notesOf(doomed)).toBe(0);
    /* ⚠️ READ-ONLY IS NOT ERASED. Ten days past due is a conversation about a
       bill; the ladder's destructive rung is 37, and a sweep that took the
       whole list would delete the records of everybody who was merely late. */
    expect(await notesOf(inArrears)).toBe(1);
  });

  /* ⚠️ RE-RUNNABLE, BECAUSE A SCHEDULER NOBODY DARES RE-RUN AFTER A FAILURE IS
     ONE THAT STAYS FAILED. */
  it("finds nothing to do the second time", async () => {
    /* ⚠️ BOTH RUNS HERE, because the pool gives each test its own storage — a
       second test that leaned on the first one's rows would be asserting the
       pool's behaviour rather than the sweep's. */
    await overdue("gone", 40);
    await fire();
    await fire();
    const runs = await directory().prepare(
      `SELECT ok, touched FROM job_run WHERE job_id = 'erasure' ORDER BY started_at`)
      .all<{ ok: number; touched: number }>();
    expect(runs.results.length).toBeGreaterThanOrEqual(2);
    expect(runs.results.every((r) => r.ok === 1)).toBe(true);
    expect(runs.results.at(-1)?.touched).toBe(0);
  });
});
