/**
 * LEAVING — and the rule the whole surface exists to keep.
 *
 * ⚠️ PAYING MUST BE A WAY OUT, NEVER THE ONLY ONE. A workspace that cannot be
 * closed while suspended is a trap, and one whose exit route is itself suspended
 * has no route at all. Everything here is on the `exit` lane, which survives
 * every rung by construction — and this asserts that it actually does, from the
 * bottom rung.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker, { REGIONAL_MODULES } from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { erasurePlan, bindingsFor } from "@one/runtime";
import { sql, type ResolvedRegion } from "@one/kernel";

const ORIGIN = "https://leave.hello.4dl.app";
let member = "";
let tenantId = "";

const handle = (binding: string) =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>)[binding] }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

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

beforeAll(async () => {
  const staff = await signIn("leave@example.test", SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: "leave" }, staff);
  tenantId = made.body.tenantId as string;
  member = await signIn("leave@example.test", ORIGIN);
  await call("/api/note.create", { title: "something worth keeping" });
});

/* --------------------------------------------------------------- export --- */

describe("taking everything with you", () => {
  /*
    ⚠️ DERIVED FROM THE SCHEMA, NEVER LISTED. A hand-written list in a shipping
    product named seven tables against a declaration of twenty-five, and a
    deleted workspace kept eighteen while the sweep reported success.
  */
  it("covers every table a module declares as a tenant's, with nothing hand-listed", async () => {
    const res = await call("/api/exit.export");
    expect(res.status).toBe(200);
    const tables = Object.keys(res.body.tables as unknown as Record<string, unknown>);
    for (const step of erasurePlan(REGIONAL_MODULES)) expect(tables, step.table).toContain(step.table);
  });

  it("actually carries the rows, not just the table names", async () => {
    const tables = (await call("/api/exit.export")).body.tables as unknown as Record<string, { title?: string }[]>;
    expect(tables.notes!.some((r) => r.title === "something worth keeping")).toBe(true);
  });

  /*
    ⚠️ WHAT WAS LEFT OUT IS REPORTED. A truncated export that says nothing reads
    as "this is everything you had" — a claim about somebody's own records, made
    falsely, in writing, at the moment they are leaving.
  */
  it("reports what it dropped rather than implying it dropped nothing", async () => {
    expect(await call("/api/exit.export").then((r) => r.body.dropped)).toEqual({});
  });
});

/* ---------------------------------------------------------------- close --- */

describe("closing, and changing your mind", () => {
  it("is reversible by cancelling rather than by paying", async () => {
    const closed = await call("/api/exit.close", { reason: "no longer needed" });
    expect(closed.status).toBe(200);
    expect((await call("/api/billing.standing")).body.standing).toMatchObject({ standing: "closing", reason: "closing" });

    expect((await call("/api/exit.cancel", {})).status).toBe(200);
    expect((await call("/api/billing.standing")).body.standing).toMatchObject({ standing: "active" });
  });

  /*
    ⚠️ FROM THE BOTTOM RUNG. A suspended workspace whose exit route is also
    suspended has no route at all — which is the trap this lane exists to keep
    open, and it is only ever tested by closing the gate first.
  */
  it("still works when the workspace has been blocked over an unpaid charge", async () => {
    await handle("DB").run(
      `UPDATE subscription SET plan_id = 'keeper', status = 'past_due', past_due_at = ? WHERE tenant_id = ?`,
      "2020-01-01T00:00:00.000Z", tenantId,
    );
    expect((await call("/api/note.create", { title: "blocked" })).status, "an ordinary write must be refused, or this proves nothing").toBe(402);

    expect((await call("/api/exit.export")).status).toBe(200);
    expect((await call("/api/exit.close", {})).status).toBe(200);
    await call("/api/exit.cancel", {});
    await handle("DB").run(`UPDATE subscription SET plan_id = NULL, status = 'none', past_due_at = NULL WHERE tenant_id = ?`, tenantId);
  });
});

/* --------------------------------------------------------------- erasure --- */

describe("being forgotten", () => {
  /*
    ⚠️ THE CONFIRMATION IS THE WORKSPACE'S OWN IDENTIFIER, TYPED. A yes/no dialog
    in front of something irreversible is a reflex rather than a decision, and
    this is the one operation in the platform with no undo at all.
  */
  it("refuses to erase on a reflex", async () => {
    expect((await call("/api/exit.erase", { confirm: "yes" })).status).toBe(400);
    expect(((await call("/api/exit.export")).body.tables as unknown as Record<string, unknown[]>).notes!.length).toBeGreaterThan(0);
  });

  it("forgets every derived table when the identifier is typed", async () => {
    const res = await call("/api/exit.erase", { confirm: tenantId });
    expect(res.status).toBe(200);
    expect((res.body.absent as unknown as string[])).toEqual([]);

    /*
      ⚠️ AND THE MEMBERSHIPS WERE ERASED TOO, WHICH IS WHY THIS CANNOT ASSERT ON
      AN EMPTY EXPORT. Erasure is derived from every module's own scope
      declaration, so the table saying who was in the workspace goes with the
      rest of it — and the caller who asked for the erasure is no longer a member
      of anything. Being locked out is the erasure working; reading back an empty
      export would mean the row that let them in had survived.
    */
    expect((await call("/api/exit.export")).status).toBe(403);
  });
});


/* ------------------------------------------------------------ retention --- */

/**
 * ⚠️ `export-then-purge` IS AN OBLIGATION ABOUT THE ORDER OF TWO OPERATIONS, and
 * it is easy to read backwards — the first implementation here read it as "never
 * export this" and withheld the table from the document, which is the opposite
 * of what the words say.
 *
 * It cannot be honoured by a filter, and it cannot be honoured by telling
 * somebody to take an export first: an instruction attached to the one operation
 * in this platform with no undo is a thing that gets skipped. So the destruction
 * hands the data over, and the promise cannot be broken by forgetting.
 */
describe("what may not be destroyed without being handed over", () => {
  it("comes back with the erasure", async () => {
    const fresh = `keeping${Math.random().toString(36).slice(2, 7)}`;
    const founding = await signIn(`${fresh}@example.test`, SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug: fresh }, founding);
    const origin = `https://${fresh}.hello.4dl.app`;
    const cookie = await signIn(`${fresh}@example.test`, origin);
    const at = (path: string, body?: unknown) => post(origin, path, body ?? {}, cookie);

    await at("/api/receipt.create", { total: { minor: 1_000, currency: "EUR" }, issuedOn: "2026-01-01" });
    await at("/api/note.create", { title: "not owed to anybody" });

    const erased = await at("/api/exit.erase", { confirm: made.body.tenantId as string });
    expect(erased.res.status, JSON.stringify(erased.body)).toBe(200);
    const taken = erased.body.taken as { tables: Record<string, unknown[]> } | undefined;

    expect(taken, "a collection declaring export-then-purge must leave with the workspace").toBeTruthy();
    /* ⚠️ The one that asked for it, carrying its rows. */
    expect(Object.keys(taken!.tables)).toContain("receipts");
    expect(taken!.tables.receipts!.length).toBe(1);
    /* ⚠️ And only the ones that asked. A collection with no such declaration is
       owed nothing, and handing it over anyway makes the declaration mean
       nothing in the other direction. */
    expect(Object.keys(taken!.tables)).not.toContain("notes");
  });
});
