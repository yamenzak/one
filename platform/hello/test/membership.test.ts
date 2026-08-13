/**
 * THE ROSTER, WHERE THE CEILING IS BIG ENOUGH TO SEE IT WORKING.
 *
 * ⚠️ TWO RULES HERE ARE ONLY OBSERVABLE ON A PLAN WITH ROOM IN IT: that an
 * unanswered invitation occupies a seat, and that an address which has moved
 * between accounts cannot be taken over by whoever holds it now. Both are
 * silent when they break — the first shows up as a bill, the second as somebody
 * in a workspace they were never invited to.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { sql, type ResolvedRegion } from "@one/kernel";
import { bindingsFor } from "@one/runtime";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "cohort";
const ORIGIN = `https://${SLUG}.hello.4dl.app`;

const as = (cookie: string) => async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const db = () =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DB }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

type Roster = { members: { id: string; email: string; state: string }[]; seats: { used: number; allowed: number } };

let owner: ReturnType<typeof as>;
let tenantId = "";

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  tenantId = made.body.tenantId as string;
  owner = as(await signIn(`${SLUG}@example.test`, ORIGIN));
});

describe("an invitation occupies a seat before it is answered", () => {
  /*
    ⚠️ A CEILING THAT COUNTS ONLY ACCEPTED MEMBERS IS ONE ANYBODY CAN PASS by
    inviting twenty people and waiting. The overage then arrives days later, all
    at once, on the day they happen to sign in — as a bill rather than a refusal,
    which is the wrong end of the product to discover a limit from.
  */
  const seats = async () => ((await owner("/api/member.list")).body as unknown as Roster).seats;

  it("counts a pending invitation against the plan", async () => {
    expect(await seats()).toMatchObject({ used: 1, allowed: 5 });

    expect((await owner("/api/member.invite", { email: "pending-one@example.test", role: "reader" })).status).toBe(200);
    const after = ((await owner("/api/member.list")).body as unknown as Roster);
    /* ⚠️ Nobody has signed in with that address, and the seat is already spent. */
    expect(after.members.find((m) => m.email === "pending-one@example.test")!.state).toBe("invited");
    expect(after.seats.used).toBe(2);
  });

  it("refuses the one that would go over, while the seats are still only promised", async () => {
    for (const n of [2, 3, 4]) {
      expect((await owner("/api/member.invite", { email: `pending-${n}@example.test`, role: "reader" })).status).toBe(200);
    }
    expect((await seats()).used).toBe(5);
    expect((await owner("/api/member.invite", { email: "one-too-many@example.test", role: "reader" })).status).toBe(402);
  });

  it("frees the seat again when the invitation is withdrawn", async () => {
    const roster = ((await owner("/api/member.list")).body as unknown as Roster);
    const pending = roster.members.find((m) => m.email === "pending-4@example.test")!;
    expect((await owner("/api/member.remove", { id: pending.id })).status).toBe(200);
    expect((await seats()).used).toBe(4);
  });
});

describe("an address that has moved between accounts", () => {
  /*
    ⚠️ A CLAIM MAY ONLY TAKE AN UNCLAIMED ROW, and the state that makes it matter
    is one the API cannot construct today: a membership already attached to some
    account, whose address now belongs to a different one. Identities are global
    and long-lived — an address changes hands — so the predicate is what stops
    "sign in with the address on an old invitation" from being a way into
    somebody else's workspace.
  */
  it("is not taken over by whoever holds it now", async () => {
    const store = db();
    await store.run(
      `INSERT INTO membership (id, tenant_id, email, role, account_id, invited_at, accepted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "mem_theirs", tenantId, "changed-hands@example.test", "owner", "u_somebody_else",
      "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    );

    const arrival = as(await signIn("changed-hands@example.test", ORIGIN));
    expect((await arrival("/api/note.list")).status).toBe(403);

    /* And the row still belongs to whoever it belonged to. */
    const row = await store.first<{ account_id: string }>(
      `SELECT account_id FROM membership WHERE id = ?`, "mem_theirs",
    );
    expect(row!.account_id).toBe("u_somebody_else");
  });
});

describe("nobody may grant what they do not hold", () => {
  /*
    ⚠️ ITS OWN WORKSPACE, because the seat arithmetic above fills this plan on
    purpose and a deputy needs a seat. A test that borrows another's fixture
    fails on whichever assertion runs first rather than on the one it is about.
  */
  let boss: ReturnType<typeof as>;
  let pupilId = "";
  let deputyId = "";
  const DEPUTY = "https://deputies.hello.4dl.app";
  const at = (cookie: string) => async (path: string, body?: unknown) => {
    const res = await worker.fetch(
      new Request(`${DEPUTY}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  };

  beforeAll(async () => {
    const founding = await signIn("deputies@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "deputies" }, founding);
    boss = at(await signIn("deputies@example.test", DEPUTY));

    await boss("/api/member.invite", { email: "pupil@example.test", role: "reader" });
    await boss("/api/member.invite", { email: "deputy@example.test", role: "owner" });
    const listed = ((await boss("/api/member.list")).body as unknown as Roster).members;
    pupilId = listed.find((m) => m.email === "pupil@example.test")!.id;
    deputyId = listed.find((m) => m.email === "deputy@example.test")!.id;
  });

  /*
    ⚠️ THE TWO-STEP ESCALATION THIS CLOSES: anybody who can edit permissions
    grants themselves the key they lack, then uses it. It is only reachable once
    somebody who CAN manage members has themselves been narrowed — which is
    exactly the arrangement a workspace makes when it wants a deputy — and the
    only sign it is missing is that somebody has been an owner for a month.
  */
  it("refuses a deputy handing out a key that was taken away from them", async () => {
    expect((await boss("/api/member.permissions", { id: deputyId, grants: [], revoked: ["note:write"] })).status).toBe(200);

    const deputy = at(await signIn("deputy@example.test", DEPUTY));
    expect((await deputy("/api/member.list")).status).toBe(200);

    /* ⚠️ And cannot give it to anybody — including, one step later, themselves. */
    expect((await deputy("/api/member.permissions", { id: pupilId, grants: ["note:write"], revoked: [] })).status).toBe(403);
    expect((await deputy("/api/member.permissions", { id: deputyId, grants: ["note:write"], revoked: [] })).status).toBe(403);
  });

  /* And what they DO hold they may still hand on, or this is not delegation. */
  it("lets them pass on what they still have", async () => {
    const deputy = at(await signIn("deputy@example.test", DEPUTY));
    const out = await deputy("/api/member.permissions", { id: pupilId, grants: ["note:read"], revoked: [] });
    expect(out.status).toBe(200);
    expect(out.body.permissions as unknown as string[]).toContain("note:read");
  });
});

describe("the person who makes a workspace is in it, by account and not just by address", () => {
  /*
    ⚠️ `invite` WRITES AN ADDRESS WITH NO ACCOUNT BEHIND IT, which is right for an
    invitation and wrong for the founder — they are standing there. Every
    cross-workspace question is asked by ACCOUNT: which workspaces am I in, where
    am I the last administrator, what may I leave. So a founding row left
    unclaimed made somebody absent from their own hub until they
    happened to visit the workspace, and made closing their account willing to
    strand a workspace nothing could see they were alone in.

    ⚠️ IT WAS INVISIBLE BECAUSE NOTHING READ `me.workspaces`. Every suite reached
    a workspace by its own origin, where the sign-in claims the row on the way
    past — so the one path that does not go through a workspace was the one path
    with no test.
  */
  it("lists it in the hub before they have ever opened it", async () => {
    const ID = "https://id.4dl.app";
    const founding = await signIn("founder@example.test", SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug: "founded" }, founding);

    const mine = await signIn("founder@example.test", ID);
    const res = await worker.fetch(
      new Request(`${ID}/api/me.workspaces`, { headers: { cookie: mine } }), env as never,
    );
    const listed = ((await res.json()) as { workspaces: { tenantId: string; appId: string; role: string }[] }).workspaces;
    expect(listed.map((w) => w.tenantId)).toContain(made.body.tenantId as string);

    /*
      ⚠️ AND IT SAYS WHICH PRODUCT AND WHAT THEY ARE THERE, because the list spans
      products now — it is read from the cross-product index rather than from this
      worker's own regional memberships, which could only ever answer for one.
      Without the product on the row, two workspaces at the same slug in different
      products are indistinguishable on the one screen that shows both.
    */
    const found = listed.find((w) => w.tenantId === made.body.tenantId);
    expect(found?.appId).toBe("hello");
    expect(found?.role).not.toBe("");
  });

  /*
    ⚠️ REMOVED FROM A WORKSPACE IS REMOVED FROM THE HUB, and it is a different
    table from the one `member.remove` writes. The regional row is REVOKED rather
    than deleted — "who was in this workspace and when" is where every
    investigation starts — so a hub reading the index has to be told separately,
    and a workspace left on somebody's list is one that refuses them at the door.
  */
  it("takes a workspace off the hub when somebody is removed from it", async () => {
    const ID = "https://id.4dl.app";
    const owner = await signIn("evictor@example.test", SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug: "evicting" }, owner);
    const at = "https://evicting.hello.4dl.app";
    const host = await signIn("evictor@example.test", at);

    await post(at, "/api/member.invite", { email: "guest@example.test", role: "reader" }, host);
    /* ⚠️ Signing in at the workspace is what CLAIMS the invitation; the hub is a
       different origin and therefore a different session, which is the platform's
       own rule rather than a fixture quirk. */
    await signIn("guest@example.test", at);
    const guest = await signIn("guest@example.test", ID);
    const theirs = async () => {
      const r = await worker.fetch(new Request(`${ID}/api/me.workspaces`, { headers: { cookie: guest } }), env as never);
      return ((await r.json()) as { workspaces: { tenantId: string }[] }).workspaces.map((w) => w.tenantId);
    };
    expect(await theirs()).toContain(made.body.tenantId as string);

    const roster = await worker.fetch(new Request(`${at}/api/member.list`, { headers: { cookie: host } }), env as never);
    const them = ((await roster.json()) as { members: { id: string; email: string }[] }).members
      .find((m) => m.email === "guest@example.test")!;
    await post(at, "/api/member.remove", { id: them.id }, host);

    expect(await theirs()).not.toContain(made.body.tenantId as string);
  });
});

describe("leaving, which is the way out an ordinary member did not have", () => {
  /*
    ⚠️ THE TWO OPERATIONS EITHER SIDE OF THIS ONE BOTH REFUSE. `member.remove`
    wants `member:manage`, which somebody removing themselves does not have, and
    `exit.close` wants `workspace:close` and takes the workspace down for
    everybody in it. So a reader invited once was in for life and had to ask the
    people they were leaving to let them out.

    ⚠️ AND IT IS DRIVEN FROM THE ACCOUNT DOOR, which is the whole point. Leaving
    somewhere must not require going there — a workspace whose standing has closed
    its own origin is precisely one somebody wants out of.
  */
  const HOME = "https://leaving.hello.4dl.app";
  const ID = "https://id.4dl.app";
  const call = (origin: string) => (cookie: string) => async (path: string, body?: unknown) => {
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
  const here = call(HOME);
  const account = call(ID);

  let boss: ReturnType<typeof here>;
  let home = "";

  beforeAll(async () => {
    const founding = await signIn("leaving@example.test", SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug: "leaving" }, founding);
    home = made.body.tenantId as string;
    boss = here(await signIn("leaving@example.test", HOME));
    await boss("/api/member.invite", { email: "goer@example.test", role: "reader" });
  });

  it("lets a member out, and frees the seat behind them", async () => {
    /* ⚠️ Signing in at the workspace is what CLAIMS the invitation — a membership
       with no account behind it is not somebody who can leave. */
    const goer = await signIn("goer@example.test", HOME);
    expect((await here(goer)("/api/note.list")).status).toBe(200);

    const before = ((await boss("/api/member.list")).body as unknown as Roster);
    expect(before.seats.used).toBe(2);

    /*
      ⚠️ AND A SECOND SESSION FOR THE ACCOUNT DOOR, because the product's cookie
      does not travel to `id.4dl.app` — it sits beside `hello.4dl.app` rather than
      under it. What crosses is the ACCOUNT. Reusing the workspace's cookie here
      is a test that would pass on a deployment where one product's session opened
      every other product's account controls.
    */
    const mine = await signIn("goer@example.test", ID);
    expect((await account(goer)("/api/exit.leave", { tenantId: home })).status).toBe(403);
    expect((await account(mine)("/api/exit.leave", { tenantId: home })).status).toBe(200);

    const after = ((await boss("/api/member.list")).body as unknown as Roster);
    expect(after.members.some((m) => m.email === "goer@example.test")).toBe(false);
    expect(after.seats.used).toBe(1);
    /* ⚠️ And the door shuts with them. */
    expect((await here(goer)("/api/note.list")).status).toBe(403);
  });

  it("refuses the last person who can let anybody back in", async () => {
    /*
      ⚠️ A WORKSPACE WHOSE LAST ADMINISTRATOR WALKS OUT IS NOT CLOSED — it is
      unreachable, with its records intact, its bill running, and nobody able to
      invite anybody into it. This is the same rule `member.remove` asks, which is
      why it is one function: the doors differ in who may knock, never in the
      answer.
    */
    const owner = await signIn("leaving@example.test", ID);
    const out = await account(owner)("/api/exit.leave", { tenantId: home });
    expect(out.status).toBe(409);

    const roster = ((await boss("/api/member.list")).body as unknown as Roster);
    expect(roster.members.some((m) => m.email === "leaving@example.test")).toBe(true);
  });

  it("answers a workspace somebody is not in exactly as it answers one that is not there", async () => {
    /*
      ⚠️ OR THIS IS AN EXISTENCE ORACLE. Two different refusals would let any
      signed-in account discover which workspace ids are real, one guess at a
      time, from a door every account can reach.
    */
    const stranger = await signIn("not-in-it@example.test", ID);
    const real = await account(stranger)("/api/exit.leave", { tenantId: home });
    const invented = await account(stranger)("/api/exit.leave", { tenantId: "t_no_such_thing" });
    expect(real.status).toBe(404);
    expect(invented.status).toBe(404);
    /* ⚠️ EVERYTHING BUT THE `ref`, which is one request's own id and is SUPPOSED
       to differ — it is what joins a refusal somebody saw to the line in the log
       that explains it. Comparing the whole body asserts that two requests are
       the same request. */
    const { ref: _one, ...said } = real.body as Record<string, unknown>;
    const { ref: _two, ...alsoSaid } = invented.body as Record<string, unknown>;
    expect(said).toEqual(alsoSaid);
  });
});
