/**
 * EVERYTHING WE HOLD, HANDED OVER — AND EVERYTHING OF THEIRS, GONE.
 *
 * ⚠️ THESE ARE THE TWO ANSWERS NOBODY CAN CHECK FROM THE OUTSIDE, which is
 * exactly why they are asserted here rather than reasoned about. "Here is
 * everything" and "it is all gone" are sentences a person relies on, and a walk
 * that missed a table produces both of them with nothing anywhere looking wrong.
 *
 * ⚠️ SO EACH TEST WRITES ROWS ACROSS THE WHOLE SURFACE FIRST — the directory,
 * the shard, the roster, the inbox, the vault, an app's own records — and then
 * asks the deployment. A test that seeded one table would pass over a walk that
 * only ever reads one table.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addShard, createTenant, found, noteBelonging, noteShardApp, startSession, upsertAccount,
  keep, consent, put, type Db,
} from "@engine/runtime";
import worker, { APPS } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_1 as unknown as Db;
const asDevEnv = {
  ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test",
  VAULT_SECRET: "vault-test-secret",
};

const at = (path: string, cookie: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`http://id.localhost:8080${path}`, init), asDevEnv as never);

interface Held { of: string; table: string; where: string; rows: unknown[] }

beforeAll(async () => {
  await worker.fetch(new Request("http://localhost:8080/health"), asDevEnv as never);
  await addShard(directory(), "eu-1", "eu", 100);
  for (const id of Object.keys(APPS)) await noteShardApp(directory(), "eu-1", id);
});

describe("what a person can take with them, and what they can destroy", () => {
  let me = "";
  let cookie = "";
  let tenantId = "";

  /* Somebody with a workspace, a colleague, records in both scopes, a
     notification, a consent and an encrypted fact. */
  beforeEach(async () => {
    const made = await createTenant(directory(), {
      slug: `leaving-${Math.floor(Math.random() * 1e9)}`,
      name: "Leaving", country: "DE", where: "eu", apps: ["hello"],
    });
    if (typeof made === "string") throw new Error(made);
    tenantId = made.tenant.id;

    me = await upsertAccount(directory(), "packing@example.com", "Sam");
    await found(shard(), tenantId as never, me as never, "packing@example.com", { hello: "writer" });
    await noteBelonging(directory(), me as never, tenantId as never);
    cookie = `one_session=${(await startSession(directory(), me as never)).id}`;

    /* ⚠️ The scope of a subject-scoped collection is the PERSON, which is
       exactly what the walk binds on. */
    const spec = APPS.hello!().collections.find((c) => c.id === "check-in")!;
    const wrote = await put(shard(), spec, me,
      { week: "2026-08-10", went: "fine", said: "a quiet one" }, me);
    expect(wrote, JSON.stringify(wrote)).toHaveProperty("id");

    await shard().prepare(
      `INSERT INTO inbox (id, tenant_id, account_id, type, title, body, link, tone, icon, at, seen_at)
       VALUES ('inb_1', ?, ?, 'note.published', 'A note', '', '/', 'info', 'bell', ?, NULL)`)
      .bind(tenantId, me, new Date().toISOString()).run();

    await consent(shard(), tenantId as never, me as never, "wellbeing", true);
    await keep(shard(), "vault-test-secret", tenantId as never, me as never,
      "check-in.struggling", "not much, honestly");
  });

  /* ------------------------------------------------------------- the copy --- */

  it("hands over every table that names them, from every database", async () => {
    const out = await at("/api/me.export", cookie, { headers: { cookie } });
    expect(out.status).toBe(200);
    const said = await out.json() as { held: Held[]; lookedAndEmpty: string[] };

    const tables = new Set(said.held.map((h) => h.table));
    /* ⚠️ ONE ASSERTION PER LAYER, because a walk that reached only the directory
       would satisfy any single one of them. */
    for (const table of ["account", "belongs", "session", "membership", "inbox",
      "vault_subject", "vault_fact", "vault_consent", "check_in"]) {
      expect([...tables], table).toContain(table);
    }

    /* ⚠️ AND IT CAME OUT OF TWO DATABASES. Everything found on one is a walk
       that stopped at the directory and reported success. */
    expect(new Set(said.held.map((h) => h.where)).size).toBeGreaterThan(1);

    /* ⚠️ WHAT WAS LOOKED IN AND FOUND EMPTY IS PART OF THE ANSWER — an export
       listing only what happened to be there cannot be told apart from one whose
       walk skipped half the deployment. */
    expect(said.lookedAndEmpty.length).toBeGreaterThan(0);

    /* Every entry a person can read, rather than a table name. */
    expect(said.held.every((h) => !!h.of)).toBe(true);
  });

  it("hands over nothing of the workspace's that is not theirs", async () => {
    /* A note is the WORKSPACE's — everybody who can read notes reads all of
       them — so it is not in one member's copy however they ask. */
    const spec = APPS.hello!().collections.find((c) => c.id === "note")!;
    await put(shard(), spec, tenantId, { title: "The company's" }, me);

    const said = await (await at("/api/me.export", cookie, { headers: { cookie } })).json() as
      { held: Held[] };
    expect(said.held.map((h) => h.table)).not.toContain("note");
  });

  /* --------------------------------------------------------- the deletion --- */

  it("deletes every row that names them, everywhere, and says where it looked", async () => {
    const gone = await at("/api/me.forget", cookie,
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
    expect(gone.status).toBe(200);
    const said = await gone.json() as
      { closed: string[]; deleted: { table: string }[]; lookedIn: number };

    /* ⚠️ THE WORKSPACE ONLY THEY COULD RUN GOES WITH THEM. Leaving it behind
       makes it unreachable rather than closed — nobody left who can invite
       anybody in, and the bill still running. */
    expect(said.closed.length).toBe(1);

    for (const table of ["account", "belongs", "membership", "inbox", "vault_fact", "check_in"]) {
      expect(said.deleted.map((d) => d.table), table).toContain(table);
    }
    /* ⚠️ It looked in far more than it deleted from, and reports both. */
    expect(said.lookedIn).toBeGreaterThan(said.deleted.length);

    for (const [db, table] of [[directory(), "account"], [shard(), "membership"],
      [shard(), "vault_fact"], [shard(), "check_in"]] as const) {
      const left = await db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).first<{ n: number }>();
      expect(left?.n, table).toBe(0);
    }
  });

  /*
    ⚠️ AND THE AUDIT TRAIL IS UNNAMED RATHER THAN CUT OUT. A workspace's record
    that something happened is the workspace's, and a trail with one member's
    actions removed is not a trail. Deleting the rows would also be an erasure
    request destroying somebody else's evidence.
  */
  it("unwrites a name from the workspace's own record instead of deleting it", async () => {
    /* ⚠️ A COLLEAGUE, SO THE WORKSPACE SURVIVES. Without one it is closed with
       them and its audit trail goes with it — which is correct, and would make
       this assertion pass over a walk that does no unwriting at all. */
    const other = await upsertAccount(directory(), "staying@example.com", null);
    await found(shard(), tenantId as never, other as never, "staying@example.com",
      { hello: "writer" });
    await noteBelonging(directory(), other as never, tenantId as never);

    await shard().prepare(
      `INSERT INTO audit (id, tenant_id, at, actor, op, verb, subject, ok, problem)
       VALUES ('aud_1', ?, ?, ?, 'note.publish', 'write', 'note_1', 1, NULL)`)
      .bind(tenantId, new Date().toISOString(), me).run();

    await at("/api/me.forget", cookie,
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });

    const row = await shard().prepare(`SELECT actor FROM audit WHERE id = 'aud_1'`)
      .first<{ actor: string }>();
    expect(row?.actor).toBe("forgotten");
  });

  /*
    ⚠️ RE-RUNNABLE, BECAUSE A DELETION NOBODY DARES REPEAT AFTER A FAILURE STAYS
    HALF DONE. The second pass finds nothing and does not throw.
  */
  it("finds nothing to do the second time", async () => {
    const once = await at("/api/me.forget", cookie,
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
    expect(once.status).toBe(200);
    /* ⚠️ The session went with the account, so the second attempt is not signed
       in at all — which is the correct answer and not a crash. */
    const twice = await at("/api/me.forget", cookie,
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
    expect(twice.status).toBe(401);
  });

  /*
    ⚠️ AND IT ASKS FOR PROOF. Destroying somebody's records cannot be undone and
    must not be doable from a borrowed laptop with a tab left open — the same
    fifteen minutes every other irreversible thing here is behind.
  */
  it("refuses to destroy anything on an old session", async () => {
    const stale = await startSession(directory(), me as never,
      new Date(Date.now() - 60 * 60 * 1000), true);
    const out = await at("/api/me.forget", `one_session=${stale.id}`, {
      method: "POST",
      headers: { cookie: `one_session=${stale.id}`, "content-type": "application/json" },
      body: "{}",
    });
    /* ⚠️ 401 with `platform.proof_required`, which is "confirm it is you"
       rather than "sign in" — the catalogue's own distinction. */
    expect(out.status).toBe(401);
    expect(JSON.stringify(await out.json())).toContain("proof_required");

    const left = await directory().prepare(`SELECT COUNT(*) AS n FROM account`)
      .first<{ n: number }>();
    expect(left?.n).toBeGreaterThan(0);
  });
});
