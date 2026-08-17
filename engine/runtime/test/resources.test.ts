/**
 * THE RECONCILER, AGAINST A CLOUDFLARE THAT ANSWERS.
 *
 * ⚠️ THE FAKE IS THE POINT, NOT A SHORTCUT. Every failure this file asserts is
 * one that reports success against the real API too — a duplicate database, a
 * binding marked live before it exists, a resource destroyed on the pass that
 * noticed it was unwanted. None of them throw, so the only way to see them is to
 * drive the whole ladder and look at what it did.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { DRAIN_DAYS, type AppSpec } from "@engine/kernel";
import { applySchema } from "../src/schema.js";
import type { Db } from "../src/sql.js";
import type { Account } from "../src/cloudflare.js";
import { RESOURCE_SCHEMA, apply, observe, resources } from "../src/resources.js";

const db = () => env.DIRECTORY as unknown as Db;

/** A product that needs one bucket per jurisdiction and one queue everywhere. */
const app = (needs: AppSpec["needs"]): AppSpec => ({
  id: "hello" as never, name: "Hello", mark: "H",
  access: { roles: {}, permissions: {}, founding: "owner" } as never,
  entitlements: {}, plans: [], collections: [], operations: [], screens: [],
  needs,
});

/* --------------------------------------------------------------- the fake --- */

interface Made { kind: string; name: string; jurisdiction: string | null }

function cloudflare(opts: { failList?: boolean } = {}) {
  const made: Made[] = [];
  let bound: { type: string; name: string }[] = [{ type: "d1", name: "DIRECTORY" }];
  let patches = 0;

  const at: Account = {
    accountId: "acc", token: "tok", script: "one",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? "GET";
      const said = (result: unknown) =>
        new Response(JSON.stringify({ success: true, result }), { status: 200 });

      if (opts.failList && method === "GET" && !href.includes("/settings")) {
        return new Response(JSON.stringify({ success: false, errors: [{ message: "rate limited" }] }));
      }
      if (href.includes("/workers/scripts/one/settings")) {
        if (method === "GET") return said({ bindings: bound });
        patches++;
        const form = init!.body as FormData;
        bound = JSON.parse(String(form.get("settings"))).bindings;
        return said({});
      }
      if (href.includes("/r2/buckets")) {
        if (method === "GET") {
          return said({ buckets: made.filter((m) => m.kind === "r2").map((m) => ({ name: m.name })) });
        }
        const name = JSON.parse(String(init!.body)).name as string;
        made.push({ kind: "r2", name, jurisdiction: (init!.headers as Record<string, string>)["cf-r2-jurisdiction"] ?? null });
        return said({ name });
      }
      if (href.includes("/queues")) {
        if (method === "GET") {
          return said(made.filter((m) => m.kind === "queue")
            .map((m) => ({ queue_id: m.name, queue_name: m.name })));
        }
        if (method === "DELETE") {
          const id = href.split("/queues/")[1]!;
          const i = made.findIndex((m) => m.kind === "queue" && m.name === id);
          if (i >= 0) made.splice(i, 1);
          return said({});
        }
        const name = JSON.parse(String(init!.body)).queue_name as string;
        made.push({ kind: "queue", name, jurisdiction: null });
        return said({ queue_id: name, queue_name: name });
      }
      return new Response(JSON.stringify({ success: false, errors: [{ message: `no route ${href}` }] }));
    }) as never,
  };
  return { at, made, patches: () => patches, bound: () => bound };
}

/* ------------------------------------------------------------------ suite --- */

describe("what the deployment makes for itself", () => {
  beforeEach(async () => { await applySchema(db(), [RESOURCE_SCHEMA]); });

  const covers = {
    covers: { id: "covers", kind: "r2" as const, holds: "none" as const,
      why: "note covers", perResidency: true },
  };

  it("creates what a manifest declares, in the jurisdiction it was promised", async () => {
    const cf = cloudflare();
    const out = await apply({
      directory: db(), at: cf.at, deployment: "one",
      apps: [app(covers)], serves: ["eu"],
    });

    expect(out.refused).toEqual([]);
    /* ⚠️ THE JURISDICTION IS THE ASSERTION. Cloudflare fixes it at creation and
       there is no edit afterwards, so a bucket made without it is in the wrong
       regime until somebody copies every object out of it. */
    expect(cf.made).toEqual([{ kind: "r2", name: "one-hello-r2-covers-eu", jurisdiction: "eu" }]);
    expect(out.did.join()).toContain("created one-hello-r2-covers-eu");
  });

  /*
    ⚠️ THE SECOND RUN IS THE ONE THAT CATCHES THE EXPENSIVE BUG. `create`
    succeeds under any name it has not seen, so a reconciler that does not match
    on its own derived name makes a second, empty bucket every pass — and every
    read then succeeds against nothing while the real objects sit in the first.
  */
  it("makes nothing the second time", async () => {
    const cf = cloudflare();
    const once = { directory: db(), at: cf.at, deployment: "one", apps: [app(covers)], serves: ["eu" as const] };
    await apply(once);
    await apply(once);
    expect(cf.made).toHaveLength(1);
  });

  /*
    ⚠️ A FAILED LIST STOPS THE PASS. Creating on the basis of a list that ERRORED
    is exactly how the duplicate above gets made — the reconciler believes
    nothing exists because it could not see.
  */
  it("makes nothing at all when it could not see what exists", async () => {
    const cf = cloudflare({ failList: true });
    const out = await apply({
      directory: db(), at: cf.at, deployment: "one", apps: [app(covers)], serves: ["eu"],
    });
    expect(cf.made).toEqual([]);
    expect(out.refused.join()).toContain("rate limited");
  });

  /*
    ⚠️ A QUEUE CANNOT BE HELD TO A JURISDICTION — Cloudflare offers no residency
    control for one. Carrying a name through it under an EU promise is a promise
    broken the first time it runs, so the need is dropped there rather than
    provisioned. This is the whole legal half of the design, in one assertion.
  */
  it("refuses to provision what cannot keep the promise it was made under", async () => {
    const cf = cloudflare();
    const out = await apply({
      directory: db(), at: cf.at, deployment: "one", serves: ["eu"],
      apps: [app({
        jobs: { id: "jobs", kind: "queue", holds: "contact", why: "send later", perResidency: true },
      })],
    });
    expect(out.refused).toEqual([]);
    expect(cf.made).toEqual([]);

    /* ⚠️ And the SAME need is provisioned where nothing was promised — refusing
       it everywhere would take a working feature away from workspaces that were
       never told anything about where their data lives. */
    const open = cloudflare();
    await apply({
      directory: db(), at: open.at, deployment: "one", serves: ["global"],
      apps: [app({
        jobs: { id: "jobs", kind: "queue", holds: "contact", why: "send later", perResidency: true },
      })],
    });
    expect(open.made.map((m) => m.kind)).toEqual(["queue"]);
  });

  /*
    ⚠️ THE PATCH IS ADD-ONLY, AND THIS IS THE ASSERTION THAT MAKES A LEAKED TOKEN
    survivable. `DIRECTORY` is in the worker's bindings before the pass and has
    to be in them afterwards, unchanged.
  */
  it("never removes or repoints a binding it did not add", async () => {
    const cf = cloudflare();
    await apply({
      directory: db(), at: cf.at, deployment: "one", apps: [app(covers)], serves: ["eu"],
    });
    expect(cf.bound()).toContainEqual({ type: "d1", name: "DIRECTORY" });
    expect(cf.bound().some((b) => b.name === "HELLO_COVERS_EU")).toBe(true);
  });

  /*
    ⚠️ `bound` IS NOT `live`. The patch produced a new version the caller is not
    running, so the binding it just asked for is not in ITS `env` — and reporting
    it as usable is how a product reads `undefined` and renders an empty screen.
  */
  it("does not call a binding live until an isolate can see it", async () => {
    const cf = cloudflare();
    await apply({
      directory: db(), at: cf.at, deployment: "one", apps: [app(covers)], serves: ["eu"],
    });
    expect((await resources(db()))[0]?.state).toBe("bound");

    /* The next boot, on the version the patch produced. */
    await observe(db(), { HELLO_COVERS_EU: {} });
    expect((await resources(db()))[0]?.state).toBe("live");
  });

  /*
    ⚠️ AND NOTHING IS DESTROYED ON THE PASS THAT NOTICES. An app removed by a
    typo would otherwise take its bucket with it in the same minute.
  */
  it("drains an unwanted resource rather than destroying it", async () => {
    const cf = cloudflare();
    const queue = {
      jobs: { id: "jobs", kind: "queue" as const, holds: "none" as const, why: "send later" },
    };
    await apply({ directory: db(), at: cf.at, deployment: "one", apps: [app(queue)], serves: ["eu"] });
    expect(cf.made).toHaveLength(1);

    /* The need disappears. */
    const gone = { directory: db(), at: cf.at, deployment: "one", apps: [app({})], serves: ["eu" as const] };
    await apply(gone);
    expect(cf.made).toHaveLength(1);
    const row = (await resources(db()))[0]!;
    expect(row.state).toBe("draining");
    expect(row.drainAfter).toBeTruthy();

    /* A day later — still nothing. */
    await apply({ ...gone, now: () => new Date(Date.now() + 24 * 60 * 60 * 1000) });
    expect(cf.made).toHaveLength(1);

    /* Past the window, it goes. */
    const past = new Date(Date.now() + (DRAIN_DAYS + 1) * 24 * 60 * 60 * 1000);
    await apply({ ...gone, now: () => past });
    expect(cf.made).toEqual([]);
    expect((await resources(db()))[0]?.state).toBe("gone");
  });

  /* ⚠️ AND A DRAINING RESOURCE THAT IS WANTED AGAIN COMES BACK — the window is
     exactly the period in which undoing the mistake has to be free. */
  it("brings back a draining resource rather than making a second one", async () => {
    const cf = cloudflare();
    const queue = {
      jobs: { id: "jobs", kind: "queue" as const, holds: "none" as const, why: "send later" },
    };
    const on = { directory: db(), at: cf.at, deployment: "one", apps: [app(queue)], serves: ["eu" as const] };
    await apply(on);
    await apply({ ...on, apps: [app({})] });
    expect((await resources(db()))[0]?.state).toBe("draining");

    await apply(on);
    expect(cf.made).toHaveLength(1);
    expect((await resources(db()))[0]?.state).toBe("bound");
  });
});
