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
