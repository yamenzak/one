/**
 * STAGE 1'S EXIT CRITERION, ASSERTED.
 *
 * "A generated app boots, creates a tenant, answers `/health` — and no handler
 * has seen a raw binding." Every clause below is one of those, driven through
 * the real worker on the real host topology.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { BindingMissing, bindingsFor, physicalName } from "@one/runtime";
import type { RegionId, ResolvedRegion } from "@one/kernel";
import { cache, sql } from "@one/kernel";

const call = (url: string, init?: RequestInit & { as?: string[] }) =>
  worker.fetch(
    new Request(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-one-permissions": (init?.as ?? []).join(","),
        ...(init?.headers ?? {}),
      },
    }),
    env as never,
  );

const json = async (r: Response) => [r.status, await r.json()] as const;

/* ------------------------------------------------------------------ boot --- */

describe("the app boots", () => {
  /*
    ⚠️ HEALTH DEPENDS ON NOTHING, and that is what makes it worth probing. A
    health route that reads the directory reports "down" for a misconfigured
    binding by being unable to answer at all — which is the one moment an
    operator needs it to speak.
  */
  it("answers /health before it has resolved anything", async () => {
    const [status, body] = await json(await call("https://hello.4dl.app/health"));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, app: "hello", manifest: "0.1.0" });
  });

  it("answers /health on a hostname that belongs to nobody", async () => {
    // A probe hits the deployment, not a tenant. It must not need one to exist.
    expect((await call("https://unclaimed.example.test/health")).status).toBe(200);
  });
});

/* ------------------------------------------------------------- workspace --- */

describe("a workspace is created, and only the platform may create it", () => {
  const setup = "https://setup.hello.4dl.app/api/identity.workspace.create";

  beforeAll(async () => {
    // The first request composes both schemas. Nothing else primes anything.
    await call("https://hello.4dl.app/health");
  });

  it("creates one on the setup door", async () => {
    const [status, body] = await json(await call(setup, {
      method: "POST", as: ["workspace:create"], body: JSON.stringify({ slug: "acme" }),
    }));
    expect(status).toBe(200);
    expect(body).toMatchObject({ slug: "acme", region: "auto" });
    expect((body as { tenantId: string }).tenantId).toMatch(/^t_/);
  });

  it("refuses a second workspace at the same address", async () => {
    const [status, body] = await json(await call(setup, {
      method: "POST", as: ["workspace:create"], body: JSON.stringify({ slug: "acme" }),
    }));
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: "platform.conflict" });
  });

  /*
    ⚠️ A RESERVED LABEL IS A TAKEOVER WITH A FRIENDLY NAME. A workspace at
    `admin` is the operator console; at `_acme-challenge` it is certificate
    issuance. This is a security control, not a naming preference.
  */
  it("refuses a reserved address", async () => {
    for (const slug of ["admin", "setup", "_acme-challenge", "hello"]) {
      const [status] = await json(await call(setup, {
        method: "POST", as: ["workspace:create"], body: JSON.stringify({ slug }),
      }));
      expect(status, slug).toBe(400);
    }
  });

  /*
    ⚠️ A REGION THIS DEPLOYMENT DOES NOT HAVE would route every later request to
    a binding that does not exist. The workspace is unreachable from the moment
    it is created, and the row looks perfectly correct.
  */
  it("refuses a region the deployment does not have", async () => {
    const [status] = await json(await call(setup, {
      method: "POST", as: ["workspace:create"], body: JSON.stringify({ slug: "elsewhere", region: "mars" }),
    }));
    expect(status).toBe(400);
  });

  it("refuses a caller without the permission", async () => {
    const [status] = await json(await call(setup, { method: "POST", body: JSON.stringify({ slug: "nope" }) }));
    expect(status).toBe(403);
  });

  /*
    ⚠️ AN APP MAY NOT SHADOW A PLATFORM OPERATION, so there is no manifest that
    replaces workspace creation with its own. Asserted by construction: the
    route resolves whether or not the app declared anything at that path.
  */
  it("serves workspace creation from the platform, not from the manifest", async () => {
    const { hello } = await import("../src/manifest.js");
    expect(hello.operations.map((o) => o.id)).not.toContain("identity.workspace.create");
    expect((await call(setup, { method: "POST", as: ["workspace:create"], body: JSON.stringify({ slug: "second" }) })).status).toBe(200);
  });
});

/* ---------------------------------------------------------------- tenant --- */

describe("a request resolves to a tenant and its region", () => {
  beforeAll(async () => {
    await call("https://setup.hello.4dl.app/api/identity.workspace.create", {
      method: "POST", as: ["workspace:create"], body: JSON.stringify({ slug: "north", region: "eu" }),
    });
  });

  it("serves a workspace at its own address", async () => {
    const [status, body] = await json(await call("https://north.hello.4dl.app/api/notes.list", { as: ["note:read"] }));
    expect(status).toBe(200);
    expect(body).toEqual({ notes: [] });
  });

  /*
    ⚠️ THE REGION IS THE TENANT'S, RESOLVED BEFORE ANY STORE IS TOUCHED. `north`
    is in `eu` and `acme` is in `auto`, so the same operation reads two different
    databases — and a note written in one is not visible in the other. That is
    the whole regional model, asserted end to end rather than by inspecting a
    resolver.
  */
  it("writes to the region the tenant lives in, and nowhere else", async () => {
    const write = await call("https://north.hello.4dl.app/api/notes.create", {
      method: "POST", as: ["note:write"], body: JSON.stringify({ title: "in the EU" }),
    });
    expect(write.status).toBe(200);

    const [, mine] = await json(await call("https://north.hello.4dl.app/api/notes.list", { as: ["note:read"] }));
    expect((mine as { notes: unknown[] }).notes).toHaveLength(1);

    const [, theirs] = await json(await call("https://acme.hello.4dl.app/api/notes.list", { as: ["note:read"] }));
    expect((theirs as { notes: unknown[] }).notes).toHaveLength(0);
  });

  it("404s a workspace that does not exist", async () => {
    expect((await call("https://nobody.hello.4dl.app/api/notes.list", { as: ["note:read"] })).status).toBe(404);
  });

  it("reports a declared failure as a Problem, with a reference", async () => {
    const [status, body] = await json(await call("https://north.hello.4dl.app/api/notes.create", {
      method: "POST", as: ["note:write"], body: JSON.stringify({ title: "" }),
    }));
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: "notes.title_required", title: "A note needs a title" });
    expect((body as { ref: string }).ref).toMatch(/^ONE-/);
  });
});

/* -------------------------------------------------------------- bindings --- */

describe("no handler sees a raw binding", () => {
  it("keeps the bare name for the default region and suffixes the others", () => {
    // Additive, so adding a region never renames a binding a live worker holds.
    expect(physicalName("db", sql(), "auto" as RegionId, "auto" as RegionId)).toBe("DB");
    expect(physicalName("db", sql(), "eu" as RegionId, "auto" as RegionId)).toBe("DB_EU");
    // A non-regional store has one instance, so it never takes a suffix.
    expect(physicalName("cache", cache(), "eu" as RegionId, "auto" as RegionId)).toBe("CACHE");
  });

  /*
    ⚠️ A MISSING BINDING THROWS, NAMING WHAT AND WHERE. Resolving what exists and
    letting the handler find out turns a provisioning gap into
    `Cannot read properties of undefined`, from whichever query happened to run
    first, naming neither the store nor the region.
  */
  it("refuses to resolve a region it has no store for", () => {
    const resolve = bindingsFor({ db: sql() }, env as never, { defaultRegion: "auto" as RegionId });
    expect(() => resolve("apac" as ResolvedRegion)).toThrow(BindingMissing);
    expect(() => resolve("apac" as ResolvedRegion)).toThrow(/DB_APAC/);
  });

  it("hands out handles, not stores", () => {
    const bind = bindingsFor({ db: sql(), cache: cache() }, env as never, { defaultRegion: "auto" as RegionId })(
      "auto" as ResolvedRegion,
    );
    // The narrow surface, and nothing of the vendor's underneath it.
    expect(Object.keys(bind.db).sort()).toEqual(["all", "batch", "first", "run"]);
    expect(bind.db).not.toHaveProperty("prepare");
    expect(Object.keys(bind.cache).sort()).toEqual(["delete", "get", "put"]);
  });
});
