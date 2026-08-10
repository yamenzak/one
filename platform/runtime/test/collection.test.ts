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
