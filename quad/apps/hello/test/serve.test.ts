/**
 * A MANIFEST BOOTS AND SERVES A DECLARED OPERATION, END TO END.
 *
 * ⚠️ THIS IS STAGE 3'S EXIT CRITERION, AND WHAT IT REALLY ASSERTS IS THAT
 * `hello/src/index.ts` CONTAINS NO INFRASTRUCTURE. There is no router in that
 * file, no schema, no migration, no gate call and no audit call — so every
 * behaviour below is the platform doing it, to every operation, without the app
 * asking. The day one of these needs a line in the app is the day the framework
 * stopped having the property it exists to have.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Caller } from "@quad/kernel";
import {
  AUDIT_SCHEMA, DIRECTORY_SCHEMA, REPLAY_SCHEMA, addShard, applySchema, compose, createTenant,
  forget, noteShardApp, schemaFor, serve, surfaceOfComposed, type Db, type Located, type Who,
} from "@quad/runtime";
import { HELLO, hello } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;

/* ⚠️ ONE SLUG PER TEST FILE. The pool gives each file its own isolate and ONE
   database, so two files that both call their workspace the same thing race on
   a unique index — which surfaces as a 503 in whichever file lost, nowhere near
   the code that caused it.

   ⚠️ AND NOT `acme`, WHICH IS RESERVED — it is the certificate-issuance protocol's
   own label, and a workspace holding it would answer on the path a certificate
   authority validates against. The obvious example company name is the one that
   cannot be used, which is exactly why the reserved list is checked rather than
   remembered. */
const ROOTS = { root: "quad.test" };

/* --------------------------------------------------------------- fixtures --- */

let tenantId = "";

/** ⚠️ Who is asking is a seam identity fills at stage 4 — see `Who`. */
let who: Who = { caller: { signedIn: false, permissions: new Set(), provenAt: null }, accountId: null };

const asOwner = (over: Partial<Caller> = {}): Who => ({
  accountId: "acc_owner",
  caller: {
    signedIn: true,
    permissions: new Set(HELLO.access.roles.owner ?? []),
    provenAt: new Date().toISOString(),
    ...over,
  },
});

let standing: Located["standing"];
let entitlements: Located["entitlements"] = [];
let used: (key: string) => number = () => 0;

const app = () => serve({
  roots: ROOTS,
  apps: { hello },
  directory: directory(),
  locate: async (door) =>
    door.kind === "tenant" && door.slug === "westwind"
      ? {
        tenantId, db: shard(), apps: ["hello"],
        ...(standing ? { standing } : {}),
        entitlements, used,
      }
      : null,
  identify: async () => who,
});

const call = (path: string, init: RequestInit = {}) =>
  app()(new Request(`https://westwind.quad.test${path}`, init));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(path, { method: "POST", body: JSON.stringify(body), headers });

beforeAll(async () => {
  await applySchema(directory(), [DIRECTORY_SCHEMA]);
  await applySchema(shard(), [schemaFor(HELLO), AUDIT_SCHEMA, REPLAY_SCHEMA]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
  forget();
  for (const t of ["note", "audit", "replay"]) await shard().exec(`DELETE FROM ${t};`);
  await directory().exec(`DELETE FROM tenant;`);
  const made = await createTenant(directory(), {
    slug: "westwind", name: "Westwind", country: "DE", where: "eu", apps: ["hello"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;

  who = asOwner();
  standing = undefined;
  entitlements = [
    { key: "notes", value: 20, source: "plan", plan: 20 },
    { key: "publishing", value: true, source: "plan", plan: true },
    { key: "seats", value: 10, source: "plan", plan: 10 },
  ];
  used = () => 0;
});

/* ------------------------------------------------------------ the surface --- */

describe("what the manifest produced", () => {
  /*
    ⚠️ NOTHING IS REGISTERED. One collection produced five operations and their
    routes; the declared one is beside them and indistinguishable downstream.

    ⚠️ AND THE ROSTER IS THERE WITHOUT THE APP DECLARING IT. Every workspace has
    people in it, so every app has these — and because they are the platform's,
    the two doors that bound an invitation are bounded once rather than per
    product.
  */
  it("derives every route from the declarations alone", () => {
    expect(surfaceOfComposed(compose(HELLO)).map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/member.invite",
      "GET /api/member.list",
      "POST /api/member.remove",
      "POST /api/member.role",
      "POST /api/note.create",
      "POST /api/note.delete",
      "GET /api/note.list",
      "POST /api/note.publish",
      "GET /api/note.read",
      "POST /api/note.update",
    ]);
  });

  /* ⚠️ A generated operation carries the same permission grammar a written one
     does, so nothing downstream needs a branch for "the generated ones". */
  it("gives a generated operation the permission its collection implies", () => {
    const byId = compose(HELLO).byId;
    expect(byId.get("note.list")?.permission).toBe("note:read");
    expect(byId.get("note.create")?.permission).toBe("note:write");
    expect(byId.get("note.create")?.spec.quota).toBe("notes");
  });
});

/* --------------------------------------------------------------- the door --- */

describe("which door a request arrived at", () => {
  it("serves a workspace at its own address", async () => {
    expect((await call("/health")).status).toBe(200);
  });

  /*
    ⚠️ AN UNRECOGNISED HOST IS NOTHING, NEVER A DEFAULT. Falling back to "the
    first tenant" is how a hostname somebody points at us becomes an address for
    a workspace they do not own.
  */
  it("answers nothing at a host it does not know", async () => {
    const out = await app()(new Request("https://someone-elses.example/api/note.list"));
    expect(out.status).toBe(404);
  });

  /* ⚠️ `/api/admin/*` on a workspace door would be the console reachable from
     inside a tenant, which is the shape that shipped twice before. */
  it("does not answer an operation at the operator door", async () => {
    const out = await app()(new Request("https://admin.quad.test/api/note.list"));
    expect(out.status).toBe(404);
  });
});

/* --------------------------------------------------------------- the gate --- */

describe("the gates, applied to every operation", () => {
  /*
    ⚠️ THE APP NEVER CHECKS A PERMISSION. This 403 comes from the platform, and
    the fact that `hello/src/index.ts` has no gate call in it is the assertion.
  */
  it("refuses a caller who does not hold the key, without the handler running", async () => {
    who = { accountId: "acc_x", caller: { signedIn: true, permissions: new Set(["note:read"]), provenAt: null } };
    const out = await post("/api/note.create", { title: "Nope" });
    expect(out.status).toBe(403);
    const rows = await shard().prepare(`SELECT COUNT(*) n FROM note`).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("asks somebody signed out to sign in", async () => {
    who = { accountId: null, caller: { signedIn: false, permissions: new Set(), provenAt: null } };
    expect((await call("/api/note.list")).status).toBe(401);
  });

  /*
    ⚠️ "YOUR PLAN DOES NOT INCLUDE THIS" AND "YOU HAVE USED ALL OF YOURS" ARE
    DIFFERENT SENTENCES, and the numbers are the sentence — raised without them
    it renders "your plan includes undefined".
  */
  it("says what the plan includes and how many are in use", async () => {
    used = () => 20;
    const out = await post("/api/note.create", { title: "One too many" });
    expect(out.status).toBe(402);
    const body = await out.json() as { problem: { code: string; title: string } };
    expect(body.problem.code).toBe("platform.quota_reached");
    expect(body.problem.title).toContain("20");
    expect(body.problem.title).not.toContain("undefined");
  });

  it("refuses a declared operation the plan does not include", async () => {
    entitlements = [{ key: "publishing", value: false, source: "plan", plan: false }];
    const out = await post("/api/note.publish", { id: "note_x" });
    expect(out.status).toBe(402);
    expect((await out.json() as { problem: { code: string } }).problem.code)
      .toBe("platform.payment_required");
  });

  /*
    ⚠️ READS ARE NEVER GATED BY ARREARS, AT ANY RUNG. Withholding a business's
    own records over an unpaid invoice is holding their data hostage; what
    arrears take away is the ability to change things.
  */
  it("lets a workspace in arrears read and not write", async () => {
    standing = { writable: false, serving: true, reason: "There is an invoice outstanding." };
    expect((await call("/api/note.list")).status).toBe(200);
    const out = await post("/api/note.create", { title: "Blocked" });
    expect(out.status).toBe(402);
    const body = await out.json() as { problem: { code: string; detail?: string } };
    expect(body.problem.code).toBe("platform.read_only");
    expect(body.problem.detail).toContain("invoice");
  });
});

/* ------------------------------------------------------------ end to end --- */

describe("a declared operation, all the way through", () => {
  it("writes, reads back, and lists — with the scope the platform supplied", async () => {
    const made = await post("/api/note.create", { title: "First", pinned: false });
    expect(made.status).toBe(200);
    const { id } = await made.json() as { id: string };

    const read = await (await call(`/api/note.read?id=${id}`)).json() as
      { title: string; tenant_id: string };
    expect(read.title).toBe("First");
    /* ⚠️ The scope was written by the platform, from the resolved request — never
       from anything the caller sent. */
    expect(read.tenant_id).toBe(tenantId);

    const listed = await (await call("/api/note.list")).json() as { items: unknown[] };
    expect(listed.items).toHaveLength(1);
  });

  it("runs a hand-written handler through the same path", async () => {
    const { id } = await (await post("/api/note.create", { title: "Draft" })).json() as { id: string };
    const out = await post("/api/note.publish", { id });
    expect(await out.json()).toEqual({ id, published: true });
  });

  /* ⚠️ A handler refuses with a catalogue code, never a bare throw — so the
     answer is a sentence rather than "something went wrong". */
  it("turns a handler's refusal into the declared problem", async () => {
    const out = await post("/api/note.publish", { id: "note_missing" });
    expect(out.status).toBe(404);
    expect((await out.json() as { problem: { code: string } }).problem.code).toBe("platform.not_found");
  });

  it("refuses a write whose values do not match the declaration", async () => {
    const out = await post("/api/note.create", { title: 42 });
    expect(out.status).toBe(400);
  });

  /* ⚠️ A GET with a body is dropped by proxies; a write in the URL ends up in
     every access log on the way. The method is part of the declaration. */
  it("answers a read on GET and a write on POST, and not the other way round", async () => {
    expect((await post("/api/note.list", {})).status).toBe(404);
    expect((await call("/api/note.create")).status).toBe(404);
  });
});

/* ----------------------------------------------------------------- replay --- */

describe("the same request twice", () => {
  /*
    ⚠️ A PHONE THAT QUEUED A WRITE IN A BASEMENT CANNOT KNOW WHETHER THE FIRST
    ATTEMPT LANDED — the answer went missing, not the request. Without this it
    gets a second audit row, a second notification and a second charge.
  */
  it("answers a replay with the first answer and does nothing twice", async () => {
    const { id } = await (await post("/api/note.create", { title: "Once" })).json() as { id: string };

    const first = await post("/api/note.publish", { id });
    const again = await post("/api/note.publish", { id });
    expect(await again.json()).toEqual(await first.json());
    expect(again.headers.get("idempotent-replay")).toBe("true");

    const rows = await shard().prepare(
      `SELECT COUNT(*) n FROM audit WHERE op = 'note.publish'`).first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });
});

/* ------------------------------------------------------------------ audit --- */

describe("what was recorded", () => {
  /*
    ⚠️ THE ENTRY IS WRITTEN BY THE RUNTIME. A previous platform made auditing
    something a handler called, and twenty of its own writes were recorded
    nowhere with every suite green — a missing entry is indistinguishable from an
    action nobody took.
  */
  it("records a write nobody asked it to record", async () => {
    await post("/api/note.create", { title: "Recorded" });
    const row = await shard().prepare(
      `SELECT op, verb, actor, ok FROM audit ORDER BY at DESC`).first<
        { op: string; verb: string; actor: string; ok: number }>();
    expect(row).toMatchObject({ op: "note.create", verb: "create", actor: "acc_owner", ok: 1 });
  });

  /* ⚠️ AND A REFUSAL TOO. An audit of only the successes answers "did anybody
     try" with silence, which is the question actually asked after an incident. */
  it("records an attempt that was refused", async () => {
    who = { accountId: "acc_x", caller: { signedIn: true, permissions: new Set(["note:read"]), provenAt: null } };
    await post("/api/note.create", { title: "Refused" });
    const row = await shard().prepare(`SELECT ok, problem FROM audit`).first<
      { ok: number; problem: string }>();
    expect(row).toMatchObject({ ok: 0, problem: "platform.forbidden" });
  });

  /* ⚠️ Reads are not audited by default: an audit of every read grows faster
     than the data and nobody has ever opened it. */
  it("does not record a read", async () => {
    await call("/api/note.list");
    const rows = await shard().prepare(`SELECT COUNT(*) n FROM audit`).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});
