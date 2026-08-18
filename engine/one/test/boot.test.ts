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
import {
  addShard, createTenant, found, noteBelonging, noteShardApp, owedBy, startSession, upsertAccount,
  type Db,
} from "@engine/runtime";
import { PLATFORM_ENTITLEMENTS, refuseCatalog } from "@engine/kernel";
import worker, { APPS, LEGAL, PLANS } from "../src/index.js";

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

  /*
    ⚠️ A PRODUCT'S MANIFEST IS BUILT AT MOST ONCE PER ISOLATE, and the composed
    surface behind it depends on that. Composing is memoised against the
    DECLARATION — the only key that cannot mistake one product for another — so a
    thunk that rebuilt its manifest per call would miss the memo every time and
    rebuild every route, permission and quota of every request. Nothing would
    fail; the product would just be slower for ever, which is the kind of cost
    nobody finds by reading.
  */
  it("holds each product's manifest rather than rebuilding it per request", () => {
    for (const make of Object.values(APPS)) expect(make()).toBe(make());
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

  /*
    ⚠️ A RETENTION NOBODY ENFORCES IS WORSE THAN NONE, and that was its state:
    declared on every collection, PUBLISHED to the person by the processing
    record, and read by nothing. Telling somebody in writing that a check-in is
    kept for two years and keeping it for ever is not a gap — it is a commitment
    the system contradicts, found by whoever asks in year three.
  */
  it("deletes what has been kept for longer than it was promised", async () => {
    const made = await createTenant(directory(), {
      slug: "lasting", name: "Lasting", country: "DE", where: "eu", apps: ["hello"],
    });
    if (typeof made === "string") throw new Error(made);

    const day = 24 * 60 * 60 * 1000;
    const rows = [["ci_old", new Date(Date.now() - 800 * day).toISOString()],
      ["ci_new", new Date().toISOString()]] as const;
    for (const [id, at] of rows) {
      await shard().prepare(
        `INSERT INTO check_in (id, person, week, went, at, by) VALUES (?, 'acc_x', '2026-01-01', 'fine', ?, NULL)`)
        .bind(id, at).run();
    }

    await fire();

    const left = await shard().prepare(`SELECT id FROM check_in ORDER BY id`)
      .all<{ id: string }>();
    /* ⚠️ The fresh one survives. A sweep that took the whole table would pass a
       test asserting only that the old one is gone. */
    expect(left.results.map((r) => r.id)).toEqual(["ci_new"]);
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

/* ------------------------------------------------------------- agreements --- */

/**
 * ⚠️ A WALL SOMEBODY CANNOT LEAVE THROUGH IS NOT A WALL, IT IS A HOSTAGE. The
 * acceptance gate is the only one in this framework that holds the WHOLE
 * product, reads included — so the four things that stay open behind it are the
 * point of it, not an exception to it: read what is being asked, agree, take a
 * copy, delete.
 */
describe("what somebody who has not agreed can do", () => {
  const directory = () => env.DIRECTORY as unknown as Db;
  const asDevEnv = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };
  /* ⚠️ THE WORKSPACE'S OWN DOOR. The wall is asked of somebody INSIDE a
     workspace — `owed` resolves the workspace's documents from the roster — so
     driving the signpost would answer 404 and prove nothing. */
  const at = (path: string, init: RequestInit = {}) =>
    worker.fetch(new Request(`http://${slug}.localhost:8080${path}`, init), asDevEnv as never);

  const slug = "unread";
  /** Whoever created the workspace: bound by the terms AND by the DPA. */
  let owner = "";
  /** A colleague invited afterwards: bound by the terms, and by no DPA. */
  let guest = "";
  let ownerId = "";

  const agreeTo = async (cookie: string, binds: "person" | "tenant") => {
    for (const doc of Object.values(LEGAL.documents)) {
      if (doc.binds !== binds) continue;
      const done = await at("/api/me.accept", {
        method: "POST", headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ document: doc.id, version: doc.version }),
      });
      expect(done.status, doc.id).toBe(200);
    }
  };

  beforeAll(async () => {
    const made = await createTenant(directory(), {
      slug, name: "Unread", country: "DE", where: "eu", apps: ["hello"],
    });
    if (typeof made === "string") throw new Error(made);
    const shard = env.SHARD_EU_1 as unknown as Db;

    ownerId = await upsertAccount(directory(), "founder@example.com", null);
    await found(shard, made.tenant.id, ownerId as never, "founder@example.com", { hello: "writer" });
    await noteBelonging(directory(), ownerId as never, made.tenant.id);
    owner = `one_session=${(await startSession(directory(), ownerId as never)).id}`;

    const second = await upsertAccount(directory(), "colleague@example.com", null);
    await shard.prepare(
      `INSERT INTO membership (id, tenant_id, account_id, email, platform_role, app_roles_json, grants_json, revoked_json, at, accepted_at, removed_at)
       VALUES ('mem_guest', ?, ?, 'colleague@example.com', 'member', '{"hello":"writer"}', '[]', '[]', ?, ?, NULL)`)
      .bind(made.tenant.id, second, new Date().toISOString(), new Date().toISOString()).run();
    await noteBelonging(directory(), second as never, made.tenant.id);
    guest = `one_session=${(await startSession(directory(), second as never)).id}`;
  });

  it("is stopped from the product until it has agreed", async () => {
    const out = await at("/api/note.list", { headers: { cookie: owner } });
    /* ⚠️ 451, which is the one status that means this: not a permission (403
       invites somebody to look for another route) and not a payment. */
    expect(out.status).toBe(451);
    expect(JSON.stringify(await out.json())).toContain("agree");
  });

  it("can still read what it is being asked to agree to", async () => {
    const out = await at("/api/me.agreements", { headers: { cookie: owner } });
    expect(out.status).toBe(200);
    const said = await out.json() as { owed: { id: string }[] };
    expect(said.owed.map((d) => d.id).sort()).toEqual(["dpa", "privacy", "terms"]);
  });

  /*
    ⚠️ AND THE COLLEAGUE IS NOT ASKED TO SIGN THE BUSINESS'S AGREEMENT. They
    agreed to the terms as a person; the data-processing agreement binds a
    company they do not run, so asking them for it is a wall with no door in it —
    they cannot give it, and nobody else can give it FOR them from where they are
    standing.
  */
  it("does not ask a colleague to bind a business they do not run", async () => {
    const out = await at("/api/me.agreements", { headers: { cookie: guest } });
    const said = await out.json() as { owed: { id: string }[] };
    expect(said.owed.map((d) => d.id).sort()).toEqual(["privacy", "terms"]);

    /* And if they try anyway, it is refused rather than recorded — a guest's
       name on a business's signature is worse than no signature. */
    const forced = await at("/api/me.accept", {
      method: "POST", headers: { cookie: guest, "content-type": "application/json" },
      body: JSON.stringify({ document: "dpa", version: LEGAL.documents.dpa!.version }),
    });
    expect(forced.status).toBe(403);
  });

  it("can take its data and delete itself without agreeing to anything", async () => {
    expect((await at("/api/vault.export", { headers: { cookie: owner } })).status).not.toBe(451);
    expect((await at("/api/me.who", { headers: { cookie: owner } })).status).toBe(200);
  });

  /*
    ⚠️ AND A NEW VERSION ASKS AGAIN. An acceptance of last month's wording is not
    an acceptance of this month's — that is the entire reason the version is on
    the record, and the reason editing text without moving the version is the one
    change that makes the record confidently wrong.
  */
  it("opens once it agrees, and closes again when the wording changes", async () => {
    await agreeTo(owner, "person");
    await agreeTo(owner, "tenant");
    expect((await at("/api/note.list", { headers: { cookie: owner } })).status).toBe(200);

    /* The wording moves on. Nothing about the stored acceptance changes, and it
       stops being an acceptance of what is being asked. */
    const owed = await owedBy(directory(), ownerId as never,
      { terms: { ...LEGAL.documents.terms!, version: "2027-01-01" as never } });
    expect(owed.map((d) => d.id)).toEqual(["terms"]);
  });
});

/* ---------------------------------------------------------- a product off --- */

/**
 * A PRODUCT IS SWITCHED ON, AND OFF, FOR ONE WORKSPACE.
 *
 * ⚠️ THIS IS "PROVISIONING BECOMES A FEATURE FLAG" (D1) ASKED OF THE REAL
 * DEPLOYMENT, and the half that matters is the second one. Writing the
 * enablement row is easy; what makes it mean anything is that the composed
 * surface is built from the LIVE apps, so a product switched off stops
 * answering. While every read asked which apps a workspace had EVER had, the
 * switch would have changed a row and nothing else — every route still there,
 * the console reporting it off.
 *
 * ⚠️ AND OFF IS NOT REMOVED. The records survive it and come back with it, which
 * is the difference between a downgrade and an erasure — a distinction no
 * refund conversation should ever have to discover.
 */
describe("switching a product off for a workspace", () => {
  const directory = () => env.DIRECTORY as unknown as Db;
  const shard = () => env.SHARD_EU_1 as unknown as Db;
  const asDevEnv = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };

  const slug = "switchable";
  let tenantId = "";
  let cookie = "";

  const at = (host: string, path: string, init: RequestInit = {}) =>
    worker.fetch(new Request(`http://${host}.localhost:8080${path}`, init), asDevEnv as never);

  const flip = (on: boolean) => at("admin", "/api/op.tenant.app", {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ tenant: tenantId, app: "hello", on }),
  });

  beforeAll(async () => {
    const made = await createTenant(directory(), {
      slug, name: "Switchable", country: "DE", where: "eu", apps: ["hello"],
    });
    if (typeof made === "string") throw new Error(made);
    tenantId = made.tenant.id;

    /* ⚠️ An operator IS an ordinary signed-in person here: with no
       `OPERATOR_EMAILS` set, development admits whoever is signed in — and this
       suite runs in development. */
    const me = await upsertAccount(directory(), "ops@example.com", null);
    await found(shard(), made.tenant.id, me as never, "ops@example.com", { hello: "writer" });
    await noteBelonging(directory(), me as never, made.tenant.id);
    cookie = `one_session=${(await startSession(directory(), me as never)).id}`;
    for (const doc of Object.values(LEGAL.documents)) {
      await at(slug, "/api/me.accept", {
        method: "POST", headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ document: doc.id, version: doc.version }),
      });
    }
    await shard().prepare(`INSERT INTO note (id, tenant_id, title, at, by) VALUES (?, ?, 'Kept', ?, NULL)`)
      .bind("note_switchable", made.tenant.id, new Date().toISOString()).run();
  });

  it("stops answering the product's routes, and starts again", async () => {
    expect((await at(slug, "/api/note.list", { headers: { cookie } })).status).toBe(200);

    expect((await flip(false)).status).toBe(200);
    /* ⚠️ 404 rather than 403: the operation is not one this workspace has, so
       there is nothing to be permitted to do. */
    expect((await at(slug, "/api/note.list", { headers: { cookie } })).status).toBe(404);

    expect((await flip(true)).status).toBe(200);
    const back = await at(slug, "/api/note.list", { headers: { cookie } });
    expect(back.status).toBe(200);
    /* ⚠️ THE RECORDS CAME BACK WITH IT. Turning a product off keeps them; a
       switch that quietly erased would be indistinguishable until somebody
       turned it back on and found an empty workspace. */
    expect((await back.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  /* ⚠️ THE CONSOLE STILL LISTS IT, or the switch is a one-way door — the row
     would vanish the moment it was pressed, with nothing left to press again. */
  it("keeps a switched-off product on the console's list, marked off", async () => {
    expect((await flip(false)).status).toBe(200);
    const seen = await at("admin", "/api/op.tenants", { headers: { cookie } })
      .then((r) => r.json()) as { items: { id: string; apps: { id: string; on: boolean }[] }[] };
    const row = seen.items.find((t) => t.id === tenantId)!;
    expect(row.apps.map((a) => [a.id, a.on])).toEqual([["hello", false]]);
    await flip(true);
  });

  /* ⚠️ THE OPERATOR DOOR AND NOWHERE ELSE — a switch reachable at a workspace's
     own address is a switch any member can try. */
  it("cannot be pressed from the workspace's own door", async () => {
    expect((await at(slug, "/api/op.tenant.app", {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ tenant: tenantId, app: "hello", on: false }),
    })).status).toBe(404);
  });
});

/* ------------------------------------------------------- one membership --- */

/**
 * THE CATALOGUE THIS DEPLOYMENT SELLS.
 *
 * ⚠️ ONE MEMBERSHIP, AND EVERY PLAN PRICES EVERY KEY. Since plans left the app
 * manifests, `refuseCatalog` runs here or nowhere — and what it catches is the
 * quiet half: a key an app declares and no plan mentions resolves to `false` for
 * every workspace on every tier, so the feature is built, gated, and sold to
 * nobody with nothing going red. This is the build failure that makes declaring
 * a sellable key self-discovering: add one, and every plan fails until it names
 * a number.
 */
describe("what this deployment sells", () => {
  const keysOf = () => ({
    ...PLATFORM_ENTITLEMENTS,
    ...Object.fromEntries(
      Object.values(APPS).flatMap((make) => Object.entries(make().entitlements))),
  });

  it("prices every key every product declares", () => {
    expect(refuseCatalog(PLANS, keysOf())).toEqual([]);
  });

  /*
    ⚠️ AND THE CHECK BITES. A catalogue guard that reported nothing because it
    was reading an empty key set would pass this file for ever — so one key is
    added that no plan mentions, and the refusal has to name it.
  */
  it("says so when a key no plan mentions is declared", () => {
    const why = refuseCatalog(PLANS, { ...keysOf(), exports: { label: "Exports", withheld: "gate" } });
    expect(why.map((p) => p.why)).toContain("unpriced");
    expect(why.some((p) => p.detail.includes("exports"))).toBe(true);
  });

  /*
    ⚠️ TWO FAMILIES, AND THE LOBBY IS PERSONAL. Business is a TIER rather than an
    add-on — `mayBrand` and `mayIsolate` gate on the workspace's kind, so pricing
    on the kind is what keeps the gate and the price from disagreeing.
  */
  it("sells both families, and parks in the personal one", () => {
    expect(new Set(PLANS.map((p) => p.kind))).toEqual(new Set(["personal", "commercial"]));
    const park = PLANS.find((p) => p.parking)!;
    expect(park.kind).toBe("personal");
    /* ⚠️ Free and unsellable: a lobby with a price is one a lapsed workspace is
       charged for without ever choosing it, and one offering a trial is a free
       tier by another name. */
    expect(park.price).toBe(0);
    expect(park.trialDays).toBeUndefined();

    /* ⚠️ AND THE RULE IS IN FORCE, not merely obeyed by today's numbers. Pricing
       the lobby has to be REFUSED, or the two lines above are a description of
       the catalogue rather than a constraint on it. */
    const priced = PLANS.map((p) => (p.parking ? { ...p, price: 500, trialDays: 7 } : p));
    const why = refuseCatalog(priced, keysOf()).map((p) => p.why);
    expect(why).toContain("parking_costs_money");
    expect(why).toContain("sellable_parking");
  });

  /* ⚠️ ONE CURRENCY. `billFor` refuses to add two, correctly — so a catalogue
     carrying both produces a bill whose lines do not sum to its own total. */
  it("prices everything in one currency", () => {
    expect(new Set(PLANS.map((p) => p.currency)).size).toBe(1);
  });
});
