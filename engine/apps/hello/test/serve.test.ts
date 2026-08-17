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
import { PLATFORM_ROLES } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  AUDIT_SCHEMA, DIRECTORY_SCHEMA, NOBODY, REPLAY_SCHEMA, addShard, applySchema, compose,
  createTenant, noteShardApp, schemaFor, serve, surfaceOfComposed,
  type Db, type Located, type Who,
} from "@engine/runtime";
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
const ROOTS = { root: "one.test" };

/* --------------------------------------------------------------- fixtures --- */

let tenantId = "";

/** ⚠️ Who is asking is a seam identity fills at stage 4 — see `Who`. */
let who: Who = NOBODY;

/** A signed-in caller whose keys are the same in every app's context. */
const whoWith = (permissions: ReadonlySet<string>): Who => ({
  accountId: "acc_x", signedIn: true, provenAt: null,
  permissionsIn: async () => permissions,
});

/* A founder: the platform's `owner` office plus the app's founding role (D15). */
const asOwner = (): Who => ({
  accountId: "acc_owner",
  signedIn: true,
  provenAt: new Date().toISOString(),
  permissionsIn: async () =>
    new Set([...(PLATFORM_ROLES.owner ?? []), ...(HELLO.access.roles.writer ?? [])]),
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
  app()(new Request(`https://westwind.one.test${path}`, init));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(path, { method: "POST", body: JSON.stringify(body), headers });

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [schemaFor(HELLO), ...SHARD_MODULES]);
  await addShard(directory(), "eu-1", "eu", 100);
  await noteShardApp(directory(), "eu-1", "hello");
});

beforeEach(async () => {
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

    ⚠️ AND THE ROSTER AND THE INBOX ARE THERE WITHOUT THE APP DECLARING THEM.
    Every workspace has people in it and everybody has been told things, so every
    app has both — and because they are the platform's, the two doors that bound
    an invitation are bounded once rather than per product, and no app can ship
    without somewhere to read its own notifications.
  */
  it("derives every route from the declarations alone", () => {
    expect(surfaceOfComposed(compose(HELLO)).map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/ai.word",
      "GET /api/ai.wording",
      /* ⚠️ The workspace's OWN identity, mounted in every product — one brand
         across the apps under one roof, edited from wherever somebody is. */
      /* ⚠️ The icon is its own operation, not a field on `brand.write` — it is
         bytes rather than JSON, and folding it in would mean every colour change
         re-uploading the picture. */
      "POST /api/brand.icon",
      "GET /api/brand.read",
      "POST /api/brand.write",
      "GET /api/centre.view",
      "POST /api/check-in.create",
      "POST /api/check-in.delete",
      "GET /api/check-in.list",
      "GET /api/check-in.read",
      "GET /api/check-in.team",
      "POST /api/check-in.update",
      "GET /api/inbox.list",
      "POST /api/inbox.policy",
      "POST /api/inbox.preference",
      "POST /api/inbox.seen",
      "GET /api/inbox.settings",
      /* ⚠️ FOUR ROUTES NO APP DECLARED. `note.cover` is a `media` field, so the
         composer mounts uploading, listing, fetching and deleting — and
         `needsOf` derives the bucket they write to. A product declares a field
         and gets storage, in the right jurisdiction, with an erasure. */
      "POST /api/media.delete",
      "GET /api/media.list",
      "GET /api/media.read",
      "POST /api/media.upload",
      "POST /api/member.invite",
      "GET /api/member.list",
      "POST /api/member.remove",
      "POST /api/member.role",
      "GET /api/money.view",
      "POST /api/note.ask",
      "POST /api/note.create",
      "POST /api/note.delete",
      "POST /api/note.draft",
      "GET /api/note.list",
      "POST /api/note.publish",
      "GET /api/note.read",
      "POST /api/note.share",
      "GET /api/note.start",
      "POST /api/note.update",
      "POST /api/package.archive",
      "POST /api/package.create",
      "POST /api/package.grant",
      "GET /api/package.held",
      "GET /api/package.list",
      "POST /api/package.revoke",
      "GET /api/setting.read",
      "POST /api/setting.write",
      /* ⚠️ AND THE VAULT'S EIGHT, BECAUSE THIS APP DECLARES A SPECIAL CATEGORY.
         An app that declares none gets none of them — a consent sheet with
         nothing on it reads as a product that asked and was told yes. */
      "POST /api/vault.consent",
      "GET /api/vault.consents",
      "GET /api/vault.export",
      "POST /api/vault.forget",
      "POST /api/vault.grant",
      "GET /api/vault.grants",
      "GET /api/vault.looks",
      "GET /api/vault.processing",
      "POST /api/vault.revoke",
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
    const out = await app()(new Request("https://admin.one.test/api/note.list"));
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
    who = whoWith(new Set(["note:read"]));
    const out = await post("/api/note.create", { title: "Nope" });
    expect(out.status).toBe(403);
    const rows = await shard().prepare(`SELECT COUNT(*) n FROM note`).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("asks somebody signed out to sign in", async () => {
    who = NOBODY;
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
    /* ⚠️ The title is answered because the notification reads it — see the
       operation's own output. A variable the platform cannot see reaches an
       inbox as a literal brace. */
    expect(await out.json()).toEqual({ id, title: "Draft", published: true });
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
    who = whoWith(new Set(["note:read"]));
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

/* ------------------------------------------------------- changing a record --- */

/**
 * ⚠️ THE GENERATED `update` WAS A READ AND A `return { id }`. It passed the gate,
 * wrote an audit entry saying the change had happened, answered 200 with the id,
 * and changed nothing — in every collection of every app, with every suite
 * green, because the only thing asserted about it was that the route existed.
 *
 * ⚠️ SO WHAT IS ASSERTED HERE IS THE ROW, NEVER THE RESPONSE. A test that reads
 * back what the API returned is a test the original defect passes.
 */
describe("changing a record", () => {
  const rowOf = (id: string) =>
    shard().prepare(`SELECT * FROM note WHERE id = ?`).bind(id).first<Record<string, unknown>>();

  const makeNote = async (): Promise<string> => {
    const out = await post("/api/note.create", { title: "First", body: "Original", pinned: false });
    return (await out.json() as { id: string }).id;
  };

  it("actually writes the new value", async () => {
    const id = await makeNote();
    expect((await post("/api/note.update", { id, title: "Second" })).status).toBe(200);
    expect((await rowOf(id))?.title).toBe("Second");
  });

  /* ⚠️ ABSENT IS UNTOUCHED, NEVER NULLED. Treating a missing field as "set to
     nothing" turns every edit into a silent erasure of everything the form did
     not happen to carry. */
  it("leaves alone what the caller did not send", async () => {
    const id = await makeNote();
    await post("/api/note.update", { id, title: "Second" });
    expect((await rowOf(id))?.body).toBe("Original");
  });

  /* ⚠️ An edit is not a smaller create: demanding every required field would
     make renaming a note mean resending its body. */
  it("does not demand the fields it is not changing", async () => {
    const id = await makeNote();
    expect((await post("/api/note.update", { id, pinned: true })).status).toBe(200);
    expect((await rowOf(id))?.pinned).toBe(1);
  });

  /* ⚠️ Refused rather than ignored — a caller who misspells a field otherwise
     gets a 200 and no change, which is the original bug with a typo in it. */
  it("refuses a field nobody declared", async () => {
    const id = await makeNote();
    expect((await post("/api/note.update", { id, ttile: "typo" })).status).toBe(400);
  });

  it("still applies the declaration's rules to what it is given", async () => {
    const id = await makeNote();
    expect((await post("/api/note.update", { id, title: "x".repeat(500) })).status).toBe(400);
    expect((await rowOf(id))?.title).toBe("First");
  });

  /* ⚠️ The scope is in the statement's own WHERE, so a guessed id from another
     workspace matches no row — and the answer must be the same one a missing
     record gets, or the refusal itself tells somebody which ids are real. */
  it("cannot reach a record that is not the caller's", async () => {
    const id = await makeNote();
    await shard().prepare(`UPDATE note SET tenant_id = ? WHERE id = ?`)
      .bind("ten_somebody_else", id).run();
    expect((await post("/api/note.update", { id, title: "Taken" })).status).toBe(404);
    expect((await rowOf(id))?.title).toBe("First");
  });

  /* -------------------------------------------------------- provenance --- */

  /**
   * ⚠️ FOUR COLUMNS ON EVERY COLLECTION, DECLARED BY NO APP. An app that had to
   * ask for these is an app that could ship without them, and the first time
   * anybody wants them is after something went wrong.
   */
  it("records who made it and when, without the app declaring anything", async () => {
    const id = await makeNote();
    const row = await rowOf(id);
    expect(row?.by).toBe("acc_owner");
    expect(String(row?.at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /* ⚠️ NULL until something is edited, deliberately: defaulting it to the
     creation time makes "never touched" and "edited the instant it was made" the
     same row, which is the first question anybody asks of a suspicious record. */
  it("leaves the edit stamp empty until there is an edit", async () => {
    const row = await rowOf(await makeNote());
    expect(row?.edited_at).toBeNull();
    expect(row?.edited_by).toBeNull();
  });

  it("records who changed it and when", async () => {
    const id = await makeNote();
    who = asOwner();
    await post("/api/note.update", { id, title: "Second" });
    const row = await rowOf(id);
    expect(row?.edited_by).toBe("acc_owner");
    expect(String(row?.edited_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    /* ⚠️ And the creation stamp survives the edit. An `at` that moves is a
       creation time nobody has. */
    expect(row?.at).toBeTruthy();
  });

  /* ⚠️ Reviewing a record and leaving it as it was IS a fact worth keeping, and
     answering "nothing to do" would make a no-op look like a refusal. */
  it("stamps a review that changed nothing", async () => {
    const id = await makeNote();
    await post("/api/note.update", { id, title: "First" });
    expect((await rowOf(id))?.edited_at).toBeTruthy();
  });
});
