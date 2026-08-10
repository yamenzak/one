/**
 * THE THIRD SCOPE — the one that was declared and dead.
 *
 * ⚠️ `Scope` has had a `subject` variant since stage 0, with DDL, an index and a
 * place in the erasure cascade, and no derived operation ever wrote its column —
 * which is `NOT NULL`. So every subject-scoped collection was a table that could
 * not be written to, and nothing in the platform noticed, because nothing in the
 * platform declared one. A whole variant of a core type, reachable by nobody.
 */

import { describe, expect, it } from "vitest";
import { collectionOperations } from "../src/collection-ops.js";
import { collection, field, type SqlHandle } from "@one/kernel";

const owned = collection({
  id: "entry",
  label: { one: "Entry", many: "Entries" },
  scope: { of: "subject", subject: "customer" },
  version: true,
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  fields: { note: field.text({ required: true }) },
});

const ops = new Map(collectionOperations(owned).map((op) => [op.id, op]));

/** Any query at all is the failure — the refusal happens before the store. */
const explode = () => { throw new Error("the store was touched"); };
const exploding = { all: explode, first: explode, run: explode, batch: explode } as unknown as SqlHandle;

const ctxFor = (subjectId?: string) => ({
  bind: { db: exploding },
  tenantId: "t_1",
  actor: { userId: "u_1" },
  ...(subjectId ? { subjectId } : {}),
  now: () => "2026-03-01T00:00:00.000Z",
  fail: (code: string) => { throw new Error(code); },
});

describe("a row that belongs to one customer needs one", () => {
  /*
    ⚠️ A ROW WITH NO SUBJECT IS A ROW NOBODY OWNS, and the column will not take a
    null — so without this refusal the failure is a constraint violation
    surfacing as "something went wrong on our side", on a request that was
    missing one field.
  */
  it("refuses to create one for a caller who is not a customer", async () => {
    await expect(ops.get("entry.create")!.handler(ctxFor() as never, { note: "hi" } as never))
      .rejects.toThrow("platform.invalid");
  });

  /*
    ⚠️ STAFF WRITE ON SOMEBODY'S BEHALF. A coach records a workout for a client
    constantly, and a caller with no subject of their own is staff — so the body
    names whose it is, and the row is theirs.
  */
  it("takes the subject from the body when the caller has none", async () => {
    const wrote: unknown[][] = [];
    const db = { ...exploding, run: async (...args: unknown[]) => { wrote.push(args); } } as unknown as SqlHandle;
    const ctx = { ...ctxFor(), bind: { db } };
    await ops.get("entry.create")!.handler(ctx as never, { note: "hi", customer: "c_1" } as never);
    expect(String(wrote[0]![0])).toContain("customer_id");
    expect(wrote[0]).toContain("c_1");
  });

  /*
    ⚠️ AND THE CALLER'S OWN SUBJECT WINS OVER THE BODY. A customer naming
    somebody else is writing into another person's history, so the field is
    ignored rather than trusted — the narrowing cannot be argued out of over the
    wire.
  */
  it("ignores a subject in the body when the caller has one of their own", async () => {
    const wrote: unknown[][] = [];
    const db = { ...exploding, run: async (...args: unknown[]) => { wrote.push(args); } } as unknown as SqlHandle;
    const ctx = { ...ctxFor("c_mine"), bind: { db } };
    await ops.get("entry.create")!.handler(ctx as never, { note: "hi", customer: "c_someone_else" } as never);
    expect(wrote[0]).toContain("c_mine");
    expect(wrote[0]).not.toContain("c_someone_else");
  });

  /*
    ⚠️ AND IT REFUSES BEFORE TOUCHING THE STORE. Reaching the insert and letting
    the database decide is the same outcome with a worse error and a wasted
    round trip — and it is the version that starts reporting 503s the day a
    column default is added.
  */
  it("refuses without opening the database", async () => {
    await expect(ops.get("entry.create")!.handler(ctxFor() as never, { note: "hi" } as never))
      .rejects.not.toThrow("the store was touched");
  });
});

/* ------------------------------------------------------ a narrower field --- */

/**
 * ⚠️ A FIELD MAY BE NARROWER THAN THE ROW IT LIVES IN, and until this ran, the
 * `write` declaration on one was read by nothing at all.
 *
 * The shape it exists for is a record a customer OPENS and the studio ANSWERS.
 * They must hold the collection's write permission to open one — and that same
 * permission opens the derived update, so they could set the answering field
 * themselves. Putting the answer behind its own operation while the update is
 * still there is a lock beside an open window.
 */
const answerable = collection({
  id: "question",
  label: { one: "Question", many: "Questions" },
  scope: { of: "tenant" },
  version: true,
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "purge" },
  fields: {
    asking: field.text({ required: true }),
    state: field.enum(["asked", "answered"], { required: true, initial: "asked", write: "staff:write" }),
    answer: field.text({ write: "staff:write" }),
  },
});

const answerOps = new Map(collectionOperations(answerable).map((op) => [op.id, op]));

const holder = (...held: string[]) => {
  const writes: { names: string[]; values: unknown[] }[] = [];
  const db = {
    all: async () => [],
    first: async () => ({ version: 1 }),
    run: async (sql: string, ...binds: unknown[]) => { writes.push({ names: [sql], values: binds }); },
    batch: async () => undefined,
  } as unknown as SqlHandle;
  return {
    writes,
    ctx: {
      bind: { db },
      tenantId: "t_1",
      actor: { userId: "u_1" },
      holds: (p: string) => held.includes(p),
      now: () => "2026-03-01T00:00:00.000Z",
      fail: (code: string, meta?: Record<string, unknown>) => {
        throw new Error(`${code}:${JSON.stringify(meta ?? {})}`);
      },
    },
  };
};

describe("a field the row's own writer may not set", () => {
  it("refuses a create that sets it", async () => {
    const { ctx } = holder("question:write");
    await expect(
      (answerOps.get("question.create") as { handler: (c: unknown, i: unknown) => Promise<unknown> })
        .handler(ctx, { asking: "may I?", state: "answered" }),
    ).rejects.toThrow(/platform\.forbidden.*state/);
  });

  it("refuses an update that sets it", async () => {
    const { ctx } = holder("question:write");
    await expect(
      (answerOps.get("question.update") as { handler: (c: unknown, i: unknown) => Promise<unknown> })
        .handler(ctx, { id: "que_1", version: 1, changes: { answer: "yes" } }),
    ).rejects.toThrow(/platform\.forbidden.*answer/);
  });

  it("allows it for somebody who holds the narrower permission", async () => {
    const { ctx } = holder("question:write", "staff:write");
    await expect(
      (answerOps.get("question.update") as { handler: (c: unknown, i: unknown) => Promise<unknown> })
        .handler(ctx, { id: "que_1", version: 1, changes: { answer: "yes", state: "answered" } }),
    ).resolves.toBeTruthy();
  });

  /* ⚠️ The fields the caller MAY write are untouched by the check. A refusal
     that fired on an ordinary edit would make the collection unusable. */
  it("leaves the ordinary fields alone", async () => {
    const { ctx } = holder("question:write");
    await expect(
      (answerOps.get("question.update") as { handler: (c: unknown, i: unknown) => Promise<unknown> })
        .handler(ctx, { id: "que_1", version: 1, changes: { asking: "rephrased" } }),
    ).resolves.toBeTruthy();
  });

  /*
    ⚠️ REFUSED, NOT DROPPED. Ignoring a field somebody sent is a save that
    reports success and stores something else — the failure this platform treats
    as worse than an error, because nothing anywhere says it happened.
  */
  it("refuses rather than silently substituting the initial", async () => {
    const { ctx } = holder("question:write");
    await expect(
      (answerOps.get("question.create") as { handler: (c: unknown, i: unknown) => Promise<unknown> })
        .handler(ctx, { asking: "may I?", state: "answered" }),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("a declared starting value", () => {
  /*
    ⚠️ THE PIECE THAT MAKES A NARROWER `write` USABLE AT ALL. Required plus
    write-restricted, with no initial, is a collection the person the feature is
    for cannot write a row into — the declaration would refuse its own use.
  */
  it("is filled in by the create when the body omits it", async () => {
    const { ctx, writes } = holder("question:write");
    await (answerOps.get("question.create") as { handler: (c: unknown, i: unknown) => Promise<unknown> })
      .handler(ctx, { asking: "may I?" });
    expect(writes[0]!.values).toContain("asked");
  });

  it("does not make the field required on the wire", () => {
    const shape = (answerOps.get("question.create") as { input: { parse(v: unknown): { ok: boolean } } }).input;
    expect(shape.parse({ asking: "may I?" }).ok).toBe(true);
  });
});

/* --------------------------------------------------------- one vocabulary --- */

/**
 * ⚠️ A COLLECTION SPEAKS ONE VOCABULARY IN BOTH DIRECTIONS.
 *
 * Writes have always taken declared field names, real booleans and real
 * objects. Reads handed back STORAGE — `how_it_went` for a field called
 * `howItWent`, `1` for a bool, a JSON column as the text it is stored in.
 *
 * The mismatch is not untidy, it is a corruption path: the obvious client reads
 * a record, changes one thing and sends it back, so a JSON field goes out as a
 * string and comes back as one. The column then holds an encoded encoding, the
 * next read returns a string that parses to a string, and nothing throws at any
 * point.
 */
const spoken = collection({
  id: "reading",
  label: { one: "Reading", many: "Readings" },
  scope: { of: "tenant" },
  version: true,
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "purge" },
  fields: {
    howItWent: field.text(),
    done: field.bool(),
    body: field.json("reading.body"),
  },
});

const readOne = async (row: Record<string, unknown>) => {
  const db = { all: async () => [row], first: async () => row, run: async () => undefined, batch: async () => undefined } as unknown as SqlHandle;
  const op = new Map(collectionOperations(spoken).map((o) => [o.id, o])).get("reading.read") as
    { handler: (c: unknown, i: unknown) => Promise<{ row: Record<string, unknown> }> };
  return (await op.handler({
    bind: { db }, tenantId: "t_1", actor: { userId: "u_1" },
    holds: () => true, now: () => "2026-03-01T00:00:00.000Z",
    fail: (code: string) => { throw new Error(code); },
  }, { id: "rea_1" })).row;
};

describe("what a read hands back", () => {
  it("names a field the way the writer declared it", async () => {
    const row = await readOne({ id: "rea_1", version: 1, how_it_went: "well", done: 1, body: "{}" });
    expect(row.howItWent).toBe("well");
    expect(row).not.toHaveProperty("how_it_went");
  });

  it("gives back a boolean rather than SQLite's integer", async () => {
    expect((await readOne({ id: "rea_1", done: 1, body: "{}" })).done).toBe(true);
    expect((await readOne({ id: "rea_1", done: 0, body: "{}" })).done).toBe(false);
  });

  /* ⚠️ Absent is not false. A bool nobody has set is a question nobody answered. */
  it("leaves an unset boolean null rather than calling it false", async () => {
    expect((await readOne({ id: "rea_1", done: null, body: "{}" })).done).toBeNull();
  });

  it("parses a json column instead of handing back its text", async () => {
    const row = await readOne({ id: "rea_1", body: '{"weeks":[{"days":[]}]}' });
    expect(row.body).toEqual({ weeks: [{ days: [] }] });
  });

  /*
    ⚠️ AN UNPARSEABLE COLUMN TRAVELS AS IT IS RATHER THAN AS AN ERROR. It is
    somebody's record, and a read that refuses is a record they can no longer see
    at all — strictly worse than one they can see is wrong.
  */
  it("hands back an unreadable json column rather than refusing the whole record", async () => {
    expect((await readOne({ id: "rea_1", body: "{not json" })).body).toBe("{not json");
  });

  it("keeps the platform's own columns under their storage names", async () => {
    const row = await readOne({ id: "rea_1", version: 3, created_at: "2026-01-01T00:00:00.000Z", body: "{}" });
    expect(row).toMatchObject({ id: "rea_1", version: 3, created_at: "2026-01-01T00:00:00.000Z" });
  });
});
