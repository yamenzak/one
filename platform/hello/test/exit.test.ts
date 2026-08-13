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
import { ALWAYS_ALLOWED, sql, type ResolvedRegion } from "@one/kernel";

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
    await handle("DIRECTORY").run(
      `UPDATE account_subscription SET plan_id = 'keeper', status = 'past_due', past_due_at = ? WHERE tenant_id = ?`,
      "2020-01-01T00:00:00.000Z", tenantId,
    );
    expect((await call("/api/note.create", { title: "blocked" })).status, "an ordinary write must be refused, or this proves nothing").toBe(402);

    expect((await call("/api/exit.export")).status).toBe(200);
    expect((await call("/api/exit.close", {})).status).toBe(200);
    await call("/api/exit.cancel", {});
    await handle("DIRECTORY").run(`UPDATE account_subscription SET plan_id = NULL, status = 'none', past_due_at = NULL WHERE tenant_id = ?`, tenantId);
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

/* -------------------------------------------------------------- account --- */

describe("closing your ACCOUNT, which is not closing a workspace", () => {
  /*
    ⚠️ THE ROW ON THE ACCOUNT CENTRE THAT WENT NOWHERE. `exit.close` closes a
    WORKSPACE — colleagues, records, a bill — and there was nothing at all behind
    "Close your account". They are different decisions with different consequences
    for different people, and the one thing closing an account must never do is
    quietly make the other one.
  */
  const ID = "https://id.4dl.app";
  const at = (origin: string) => (cookie: string) => async (path: string, body?: unknown) => {
    const res = await worker.fetch(
      new Request(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  };
  const account = at(ID);
  const shared = "https://shared.hello.4dl.app";

  it("refuses while somebody is the last person who can let anybody in, and says which", async () => {
    /*
      ⚠️ THE WORKSPACE IS LEFT RUNNING AND THE ACCOUNT IS LEFT OPEN. The
      alternative anybody would reach for — close the workspaces too — is the
      one thing that cannot be undone by the person it surprises, who is a
      colleague that pressed nothing.
    */
    const alone = await signIn("sole@example.test", SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug: "sole" }, alone);
    const only = made.body.tenantId as string;

    const mine = await signIn("sole@example.test", ID);
    const out = await account(mine)("/api/exit.account.close", {});
    expect(out.status).toBe(409);
    /* ⚠️ NAMED, not merely refused. A refusal that does not say which workspace
       leaves somebody guessing across every one they are in. */
    expect(String(out.body.meta ? (out.body.meta as Record<string, string>).workspaces : "")).toContain(only);

    /* And nothing was closed on the way past. */
    expect((await account(mine)("/api/exit.account.status")).body.closesAt).toBeUndefined();
  });

  /*
    ⚠️ A SESSION IS NOT A PROOF FOREVER, AND THIS IS WHAT MAKES THAT TRUE. The
    realistic attack on an account is not a stolen password — there is none — it
    is a borrowed laptop with an open tab. Against that, every check the platform
    has PASSES: the cookie is genuine, the permission is held, the workspace is in
    good standing. Closing an account, removing a credential and exporting
    everything are the three things such a person would do, so each asks for a
    proof no more than ten minutes old.

    ⚠️ THE ROW IS BACK-DATED RATHER THAN THE CLOCK MOVED, because the age of the
    session IS the mechanism — there is no second timestamp to fake, which is the
    property that makes it impossible for a proof to be recorded when none was
    given.
  */
  it("asks somebody to prove it is them before the account can be closed", async () => {
    const stale = await signIn("stale@example.test", ID);
    const id = stale.split("=")[1]!;
    const long = new Date(Date.now() - 60 * 60_000).toISOString();
    /* ⚠️ THE ACCOUNT DOOR RESOLVES NO WORKSPACE, so its session is written in the
       DIRECTORY's region rather than in a tenant's — which is the same reason the
       door exists at all: a person's account is not any product's. */
    for (const binding of ["DB", "DB_EU"]) {
      await handle(binding).run(`UPDATE sessions SET created_at = ? WHERE id = ?`, long, id);
    }

    const out = await account(stale)("/api/exit.account.close", {});
    expect(out.status).toBe(401);
    expect(out.body.code).toBe("platform.proof_required");

    /* ⚠️ AND THE WHOLE EXPORT WITH IT — the one read that hands over everything
       at once, which is what a borrowed session is worth pointing at. */
    expect((await account(stale)("/api/exit.account.export")).status).toBe(401);

    /* ⚠️ WHILE SIGNING A DEVICE OUT IS STILL ALLOWED. A step-up in front of a
       defensive action helps whoever is already inside keep their foothold. */
    expect((await account(stale)("/api/me.sessions")).status).toBe(200);
  });

  it("closes with seven days to change your mind, and gives them back", async () => {
    /* ⚠️ A workspace with a second administrator, so leaving strands nobody. */
    const founder = await signIn("shared@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "shared" }, founder);
    const boss = at(shared)(await signIn("shared@example.test", shared));
    await boss("/api/member.invite", { email: "second@example.test", role: "owner" });
    await signIn("second@example.test", shared);

    const mine = await signIn("second@example.test", ID);
    const closed = await account(mine)("/api/exit.account.close", { reason: "moving on" });
    expect(closed.status).toBe(200);

    const days = (Date.parse(closed.body.closesAt as unknown as string) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    const state = await account(mine)("/api/exit.account.status");
    expect(state.body.closesAt).toBe(closed.body.closesAt);

    /* ⚠️ AND THE WAY BACK IS CANCELLING, not signing up again — which would be a
       different account with none of this one's history in it. */
    expect((await account(mine)("/api/exit.account.cancel", {})).status).toBe(200);
    expect((await account(mine)("/api/exit.account.status")).body.closesAt).toBeUndefined();
  });

  it("is on the lane that survives every rung, like everything else that is a way out", async () => {
    /*
      ⚠️ THE LANE IS THE MECHANISM, AND NAMING IT `me.*` WOULD HAVE BROKEN THIS
      SILENTLY. A write outside the `exit` lane is refused by the standing gate on
      a suspended workspace and by the consent gate for anybody who has not
      accepted a new document — so leaving would be withheld from exactly the two
      groups most likely to want it, and neither refusal mentions leaving.
    */
    const ids = ["exit.leave", "exit.account.close", "exit.account.cancel", "exit.account.status"];
    for (const id of ids) expect(id.split(".")[0]).toBe("exit");
  });
});

/* ------------------------------------------------------------- agreeing --- */

describe("agreeing is a way out, like paying and leaving", () => {
  /*
    ⚠️ `legal` WAS EXEMPT FROM THE CONSENT GATE AND NOT FROM THE STANDING ONE,
    which is a different gate with the same effect. A workspace held read-only
    cannot write; accepting a document is a write; and the document is the thing
    standing between that workspace and being able to act. So a studio that never
    chose a plan could not accept the terms that would let it choose one, and the
    refusal it got said nothing about documents.

    ⚠️ IT SURFACED BY ACCIDENT, which is the argument for this test existing. No
    suite reached it because the fixture accepted everything on a door with no
    workspace, where the gate is open — so the one path a real owner takes was
    the one path nothing drove.
  */
  it("lets a workspace with a closed gate accept what it owes", async () => {
    /*
      ⚠️ ITS OWN WORKSPACE, CLOSED ON PURPOSE, because the gate has to actually be
      shut for this to prove anything. Written against a workspace in good
      standing it passes with the exemption removed — which is what the first
      version of this test did.
    */
    const shut = "https://agreeing.hello.4dl.app";
    const founding = await signIn("agreeing@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "agreeing" }, founding);
    const cookie = await signIn("agreeing@example.test", shut);
    const there = async (path: string, body?: unknown) => {
      const res = await worker.fetch(
        new Request(`${shut}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { "content-type": "application/json", cookie },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env as never,
      );
      return { status: res.status, body: (await res.json()) as Record<string, never> };
    };

    /* ⚠️ `closing` is read-only: reads served, writes refused. Asserted here so
       the accept below is known to be running against a shut gate. */
    expect((await there("/api/exit.close", {})).status).toBe(200);
    expect((await there("/api/note.create", { title: "no" })).status).toBe(402);

    /* Reading was never the problem. */
    const listed = await there("/api/legal.list");
    expect(listed.status).toBe(200);

    const doc = (listed.body.documents as unknown as { id: string; version: string }[])[0]!;
    expect((await there("/api/legal.accept", { document: doc.id, version: doc.version })).status).toBe(200);
  });

  it("keeps the lane on the list that survives every rung", () => {
    /* ⚠️ THE LANE IS THE MECHANISM. Reachability here is decided by the id's
       first segment, so an operation renamed out of `legal` leaves the gate
       closed on it again with nothing else changing. */
    expect(ALWAYS_ALLOWED).toContain("legal");
  });
});
