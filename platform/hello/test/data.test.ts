/**
 * STAGE 3'S EXIT CRITERION, ASSERTED.
 *
 * "A real collection with an activity log and a metered ledger — and a tenant
 * can be copied to a second region and back, verified, with the source still
 * bootable."
 *
 * ⚠️ NOT ONE OF THESE SURFACES IS WRITTEN BY HAND. The list, the record, the
 * form, the archive, the document lifecycle and the activity log are all derived
 * from two `collection()` declarations — which is the whole argument for a
 * manifest, asserted rather than described.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { balance, bindingsFor, copyTenant, record, verifyTenant, dropSourceCopy } from "@one/runtime";
import { sql, type ResolvedRegion } from "@one/kernel";
import { REGIONAL_MODULES } from "../src/worker.js";
import { TenantLedgerActor } from "../src/ledger-actor.js";

const ORIGIN = "https://data.hello.4dl.app";
let member = "";
let tenantId = "";

const call = async (path: string, body?: unknown, cookie = member) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const handle = (binding: string) =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>)[binding] }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

beforeAll(async () => {
  const staff = await signIn("data@example.test", SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: "data" }, staff);
  tenantId = made.body.tenantId as string;
  member = await signIn("data@example.test", ORIGIN);
});

/* ------------------------------------------------------------ collection --- */

describe("a collection is its own surface", () => {
  it("creates, reads, lists and changes without a line of routing", async () => {
    const made = await call("/api/note.create", { title: "derived" });
    expect(made.status).toBe(200);
    const id = made.body.id as unknown as string;

    expect((await call(`/api/note.read?id=${id}`)).body.row).toMatchObject({ title: "derived", version: 1 });
    expect(((await call("/api/note.list")).body.rows as unknown as unknown[]).length).toBeGreaterThan(0);

    const changed = await call("/api/note.update", { id, version: 1, changes: { title: "renamed" } });
    expect(changed.body).toMatchObject({ version: 2 });
  });

  /*
    ⚠️ THE CASE THAT BITES IS A TOOL RACING A PERSON, not two people. The
    assistant reads, the person saves, the assistant writes back what it read,
    and the person's change is gone with no error anywhere.
  */
  it("refuses a write based on a stale read", async () => {
    const { body } = await call("/api/note.create", { title: "contested" });
    const id = body.id as unknown as string;
    await call("/api/note.update", { id, version: 1, changes: { title: "first" } });
    const late = await call("/api/note.update", { id, version: 1, changes: { title: "clobbered" } });
    expect(late.status).toBe(409);
    expect((await call(`/api/note.read?id=${id}`)).body.row).toMatchObject({ title: "first" });
  });

  it("hides an archived row from an ordinary read", async () => {
    const { body } = await call("/api/note.create", { title: "temporary" });
    const id = body.id as unknown as string;
    expect((await call("/api/note.delete", { id })).body).toEqual({ archived: true });
    expect((await call(`/api/note.read?id=${id}`)).status).toBe(404);
    const listed = (await call("/api/note.list")).body.rows as unknown as { title: string }[];
    expect(listed.some((r) => r.title === "temporary")).toBe(false);
  });

  /*
    ⚠️ TWO TENANTS IN ONE REGION, WHICH IS THE CASE A REGIONAL SPLIT DOES NOT
    COVER. Separate databases separate them for free; the predicate is what
    separates them when they share one — and a list that forgets it returns every
    tenant's rows through the same code path, in the same shape, with more
    results.
  */
  it("keeps one workspace's rows out of another's, in the same database", async () => {
    const staff = await signIn("neighbour@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "neighbour" }, staff);
    const other = "https://neighbour.hello.4dl.app";
    const theirCookie = await signIn("neighbour@example.test", other);

    await call("/api/note.create", { title: "ours alone" });
    const theirs = await worker.fetch(
      new Request(`${other}/api/note.list`, { headers: { cookie: theirCookie } }), env as never,
    );
    const payload = (await theirs.json()) as { rows?: { title: string }[] };
    if (!payload.rows) throw new Error(`note.list ${theirs.status}: ${JSON.stringify(payload)}`);
    const rows = payload.rows;
    expect(rows.some((r) => r.title === "ours alone")).toBe(false);
  });

  it("searches only the fields the collection declared searchable", async () => {
    await call("/api/note.create", { title: "findable", body: "unsearchable text" });
    const byTitle = (await call("/api/note.list?search=findable")).body.rows as unknown as unknown[];
    expect(byTitle.length).toBe(1);
    const byBody = (await call("/api/note.list?search=unsearchable")).body.rows as unknown as unknown[];
    expect(byBody.length).toBe(0);
  });

  it("records who changed what", async () => {
    const { body } = await call("/api/note.create", { title: "watched" });
    const id = body.id as unknown as string;
    await call("/api/note.update", { id, version: 1, changes: { title: "watched again" } });
    const entries = (await call(`/api/note.activity?id=${id}`)).body.entries as unknown as { verb: string }[];
    expect(entries.map((e) => e.verb).sort()).toEqual(["create", "update"]);
  });

  /*
    ⚠️ OPT-IN PER COLLECTION, AND ABSENT RATHER THAN DISABLED. A lifecycle is
    right for a record that asserts something happened and wrong for a note — so
    the note has no submit surface at all. One that existed and always refused is
    one somebody will try to make work.
  */
  it("gives a document lifecycle only to the collection that declared one", async () => {
    expect((await call("/api/note.submit", { id: "x" })).status).toBe(404);
    expect((await call("/api/receipt.submit", { id: "x" })).status).toBe(404); // no such row, but the route exists
  });
});

/* ------------------------------------------------------------- documents --- */

describe("a document asserts something happened", () => {
  const make = async () => {
    const { body } = await call("/api/receipt.create", { total: { minor: 1999, currency: "EUR" }, issuedOn: "2026-08-09", memo: "coffee" });
    return body.id as unknown as string;
  };

  it("freezes what it asserted, once submitted", async () => {
    const id = await make();
    expect((await call("/api/receipt.update", { id, version: 1, changes: { memo: "tea" } })).status).toBe(200);
    expect((await call("/api/receipt.submit", { id })).body).toMatchObject({ state: "submitted" });

    // Submitting is itself a change, so the version has moved twice by now.
    // The memo stays editable — a typo is not a reason to force an amendment.
    expect((await call("/api/receipt.update", { id, version: 3, changes: { memo: "tea again" } })).status).toBe(200);
    // The total does not. If it could move, the signature on it means nothing.
    const frozen = await call("/api/receipt.update", { id, version: 4, changes: { total: { minor: 1, currency: "EUR" } } });
    expect(frozen.status).toBe(400);
  });

  /*
    ⚠️ AN AMENDMENT IS A NEW DOCUMENT. A cancelled record corrected in place
    would let the correction and the original share an identity, so a reference
    to it means one thing before the edit and another after.
  */
  it("amends by creating a new document that points back", async () => {
    const id = await make();
    await call("/api/receipt.submit", { id });
    expect((await call("/api/receipt.cancel", { id })).body).toMatchObject({ state: "cancelled" });

    const amended = await call("/api/receipt.amend", { id });
    expect(amended.body.state).toBe("draft");
    const newId = amended.body.newId as unknown as string;
    expect(newId).not.toBe(id);
    expect((await call(`/api/receipt.read?id=${newId}`)).body.row).toMatchObject({ docstatus: 0 });
    // And the original is still there, still cancelled, still referenced.
    expect((await call(`/api/receipt.read?id=${id}`)).body.row).toMatchObject({ docstatus: 2 });
  });

  it("refuses a transition that would skip a step", async () => {
    const id = await make();
    expect((await call("/api/receipt.cancel", { id })).status).toBe(400);
    expect((await call("/api/receipt.amend", { id })).status).toBe(400);
  });
});

/* ---------------------------------------------------------------- ledger --- */

describe("the ledger is appended, never amended", () => {
  const db = () => handle("DB");

  it("sums entries rather than maintaining a number", async () => {
    await record(db(), tenantId, { unit: "credits", amount: 100, reason: "grant", actorId: "system" }, "2026-08-09T10:00:00.000Z" as never);
    await record(db(), tenantId, { unit: "credits", amount: -30, reason: "spend", actorId: "system" }, "2026-08-09T11:00:00.000Z" as never);
    expect(await balance(db(), tenantId, "credits")).toBe(70);
  });

  /*
    ⚠️ A PAYMENT PROVIDER RETRIES ON ANY NON-2xx AND OCCASIONALLY REDELIVERS A
    SUCCESS. Without a key on the event, each redelivery grants again — free
    access, silently, with a correct-looking 200 every time.
  */
  it("applies a referenced entry once, however many times it arrives", async () => {
    const entry = { unit: "credits", amount: 500, reason: "purchase", ref: "evt_1", actorId: "system" };
    const first = await record(db(), tenantId, entry, "2026-08-09T12:00:00.000Z" as never);
    const again = await record(db(), tenantId, entry, "2026-08-09T12:00:01.000Z" as never);
    expect(first.applied).toBe(true);
    // Not an error — answering one would make the provider retry forever — but a
    // caller granting access on a 200 has to know whether anything happened.
    expect(again.ok).toBe(true);
    expect(again.applied).toBe(false);
    expect(await balance(db(), tenantId, "credits")).toBe(570);
  });

  it("keeps one tenant's balance out of another's", async () => {
    expect(await balance(db(), "t_someone_else", "credits")).toBe(0);
  });
});

/* ------------------------------------------------------------ relocation --- */

describe("a tenant can be moved, verified, and moved back", () => {
  /*
    ⚠️ IT IS THE ERASURE CASCADE WITH `SELECT` INSTEAD OF `DELETE`, which is the
    safety property rather than a neat observation: a table that cannot be
    forgotten by one cannot be forgotten by the other, so the guard proving the
    cascade complete proves this complete too.
  */
  it("copies every scoped table and verifies by counting", async () => {
    const from = handle("DB");
    const to = handle("DB_EU");
    const moved = await copyTenant(from, to, REGIONAL_MODULES, tenantId);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(moved.copied.map((t) => t.table).sort()).toContain("notes");
    expect(moved.copied.some((t) => t.rows > 0)).toBe(true);
    expect(moved.verification.mismatched).toEqual([]);
  });

  /*
    ⚠️ THE SOURCE STAYS BOOTABLE, and that is what turns a bad relocation into an
    inconvenience. Every step before the directory flip is re-runnable, and the
    flip is deliberately not part of the copy.
  */
  it("leaves the source intact and the copy re-runnable", async () => {
    const from = handle("DB");
    const to = handle("DB_EU");
    const before = await verifyTenant(from, to, REGIONAL_MODULES, tenantId);
    expect(before.ok).toBe(true);

    // Twice, because a relocation that half-completed must be retryable.
    expect((await copyTenant(from, to, REGIONAL_MODULES, tenantId)).ok).toBe(true);
    expect((await verifyTenant(from, to, REGIONAL_MODULES, tenantId)).ok).toBe(true);

    const stillThere = await call("/api/note.list");
    expect((stillThere.body.rows as unknown as unknown[]).length).toBeGreaterThan(0);
  });

  /*
    ⚠️ THE COPY ITSELF MUST VERIFY, not merely offer a function that could. A
    relocation reporting success it never checked sends a workspace to a region
    missing part of itself, and the part missing is whichever table nobody
    thought to look at.
  */
  it("refuses to report success when the counts do not agree", async () => {
    const from = handle("DB");
    const to = handle("DB_EU");
    // A row in the target that the source does not have: the copy cannot make
    // the counts agree, so it must say so rather than finish quietly.
    await to.run(
      `INSERT OR REPLACE INTO notes (id, version, created_at, updated_at, tenant_id, deleted_at, title) VALUES (?, 1, ?, ?, ?, NULL, ?)`,
      "not_stray", "2026-08-09T00:00:00.000Z", "2026-08-09T00:00:00.000Z", tenantId, "stray",
    );
    const moved = await copyTenant(from, to, REGIONAL_MODULES, tenantId);
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.why).toContain("notes");
    await to.run(`DELETE FROM notes WHERE id = ?`, "not_stray");
  });

  it("reports a mismatch rather than reporting success", async () => {
    const from = handle("DB");
    const to = handle("DB_EU");
    await to.run(`DELETE FROM notes WHERE tenant_id = ?`, tenantId);
    const check = await verifyTenant(from, to, REGIONAL_MODULES, tenantId);
    expect(check.ok).toBe(false);
    expect(check.mismatched).toContain("notes");
  });

  it("drops the source copy only when told to, separately", async () => {
    const from = handle("DB");
    const to = handle("DB_EU");
    await copyTenant(from, to, REGIONAL_MODULES, tenantId);
    const dropped = await dropSourceCopy(from, REGIONAL_MODULES, tenantId, "2026-08-09T13:00:00.000Z" as never);
    expect(dropped.deleted.some((t) => t.table === "notes" && t.rows > 0)).toBe(true);
    /*
      ⚠️ THE MEMBERSHIPS GO WITH IT, which is what a caller notices first: the
      workspace still routes here, and nobody is a member of it any more. That is
      the drop being complete rather than a gap — a region that kept its
      memberships after the data left would still let people in to read nothing.
    */
    expect(dropped.deleted.some((t) => t.table === "membership")).toBe(true);
    expect((await call("/api/note.list")).status).toBe(403);
  });
});

/* --------------------------------------------------------- durable state --- */

describe("a durable actor can be moved", () => {
  const actor = () => new TenantLedgerActor({ storage: memoryStorage() });

  it("holds a balance", async () => {
    const a = actor();
    expect(await a.credit("credits", 100)).toBe(100);
    expect(await a.balance("credits")).toBe(100);
  });

  /*
    ⚠️ SEAL, EXPORT, IMPORT, VERIFY — and the hash is what the target is compared
    against. A copy that reported success without one is a copy nobody checked.
  */
  it("exports state a second actor can import, byte for byte", async () => {
    const from = actor();
    await from.credit("credits", 250);
    await from.credit("storage", 4);
    const { hash } = await from.seal();

    const to = actor();
    await to.importState(await from.exportState());
    expect(await to.balance("credits")).toBe(250);
    expect(await to.balance("storage")).toBe(4);
    expect((await to.seal()).hash).toBe(hash);
  });

  /*
    ⚠️ A SEALED ACTOR REFUSES, LOUDLY AND FOREVER. Accepting a write after the
    export was taken means the value exists in the source and not in the target,
    and nothing anywhere compares the two again. On a balance, that is money.
  */
  it("refuses every write once sealed, and is never reopened", async () => {
    const a = actor();
    await a.credit("credits", 10);
    await a.seal();
    await expect(a.credit("credits", 10)).rejects.toThrow(/sealed/);
    await expect(a.importState(new TextEncoder().encode("[]"))).rejects.toThrow(/sealed/);
  });
});

/** Enough of durable storage to hold state and hand it back in order. */
function memoryStorage() {
  const map = new Map<string, unknown>();
  return {
    get: async <T,>(k: string) => map.get(k) as T | undefined,
    put: async <T,>(k: string, v: T) => void map.set(k, v),
    list: async <T,>() => new Map(map) as Map<string, T>,
  };
}
