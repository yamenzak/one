/**
 * WHO IS IN A STUDIO — end to end, through the doors a real person uses.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together — the second request overwrites the first's code, the
 * verify fails, and what a reader sees is a 403 from a caller who looks signed
 * in. Shared fixture addresses are how a suite becomes order-dependent.
 *
 * ⚠️ THIS SUITE EXISTS BECAUSE THE ANSWER USED TO BE "EVERYBODY, AS AN OWNER".
 * Every app here resolved its caller with `permissions: new Set(roles.owner)`
 * for anybody signed in — a scaffold that typechecks, passes every other test,
 * and hands any account that finds a studio's address the owner's powers over
 * it. Nothing in a green suite distinguishes that from a working roster, which
 * is why the assertions below are about REFUSAL as much as about access.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "marsden";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const as = (cookie: string) => async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

type Member = { id: string; email: string; role: string; state: string; subjectId: string | null };
type Roster = { members: Member[]; seats: { used: number; allowed: number | boolean } };

let owner: ReturnType<typeof as>;

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  owner = as(await signIn(`${SLUG}@example.test`, STUDIO));
});

/* ------------------------------------------------------------ the founder --- */

describe("creating a studio makes you its first member", () => {
  /*
    ⚠️ WRITTEN BY THE CREATION ITSELF, OR NEVER. A workspace whose creator has no
    membership is not empty — it is unreachable: the directory row is correct,
    the tables exist, every request answers 403, and there is no later step that
    could fix it, because inviting somebody requires already being a member.
  */
  it("puts the person who made it on the roster, as the role that can invite", async () => {
    const r = (await owner("/api/member.list")).body as unknown as Roster;
    expect(r.members).toHaveLength(1);
    expect(r.members[0]).toMatchObject({ email: `${SLUG}@example.test`, role: "owner", state: "accepted" });
  });

  it("counts them against the seats the plan allows", async () => {
    const r = (await owner("/api/member.list")).body as unknown as Roster;
    expect(r.seats.used).toBe(1);
    expect(r.seats.allowed).toBe(1);
  });
});

/* --------------------------------------------------------------- refusal --- */

describe("a signed-in stranger holds nothing here", () => {
  /*
    ⚠️ THE ASSERTION THE OLD SCAFFOLD WOULD HAVE FAILED. Somebody with a
    perfectly valid account, signed in on this studio's own origin, who was
    never invited: they are not a member, so they hold no permission at all.
  */
  it("cannot read the roster, or anything else", async () => {
    const stranger = as(await signIn("passer-by@marsden.example.test", STUDIO));
    expect((await stranger("/api/member.list")).status).toBe(403);
    expect((await stranger("/api/client.list")).status).toBe(403);
    expect((await stranger("/api/client.create", { name: "Mine now" })).status).toBe(403);
  });
});

/* ------------------------------------------------------------ invitations --- */

describe("an invitation is claimed by signing in", () => {
  /*
    ⚠️ THERE IS NO SEPARATE "ACCEPT". An invitation that needed one is an
    invitation a person can only redeem from a link in an email they may no
    longer have — signing in with the address it was sent to IS the acceptance.

    ⚠️ AND THE INVITEE HERE IS A CLIENT, WHICH IS THE PATH THAT MATTERS MOST FOR
    THIS PRODUCT: the people a studio coaches are members of it, sign in on its
    own address, and see only what they were given. A studio's staff go through
    exactly the same door — see the seat ceiling below for why one of them
    cannot be used to test this on the entry plan.
  */
  it("is pending until somebody signs in with that address, and then it is theirs", async () => {
    const sent = await owner("/api/member.invite", { email: "Ro@Marsden.Example.test", role: "client" });
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ state: "invited" });

    /* ⚠️ Folded: people do not type their own address consistently. */
    const before = (await owner("/api/member.list")).body as unknown as Roster;
    expect(before.members.find((m) => m.email === "ro@marsden.example.test")!.state).toBe("invited");

    const ro = as(await signIn("ro@marsden.example.test", STUDIO));
    expect((await ro("/api/programme.list")).status).toBe(200);

    const after = (await owner("/api/member.list")).body as unknown as Roster;
    expect(after.members.find((m) => m.email === "ro@marsden.example.test")!.state).toBe("accepted");
  });

  /*
    ⚠️ THE ROLE IS WHAT THEY WERE INVITED AS, NOT THE INVITER'S. This is the
    single assertion the scaffold this file replaced would have failed: it gave
    every signed-in caller the owner's set, so a client reached the roster, the
    billing lane and every other client's record.
  */
  it("gives them their role and not the inviter's", async () => {
    const ro = as(await signIn("ro@marsden.example.test", STUDIO));
    expect((await ro("/api/member.list")).status).toBe(403);
    expect((await ro("/api/client.create", { name: "Somebody else" })).status).toBe(403);
    expect((await ro("/api/member.invite", { email: "nobody@example.test", role: "owner" })).status).toBe(403);
  });

  it("refuses a role this app does not have", async () => {
    const bad = await owner("/api/member.invite", { email: "ghost@marsden.example.test", role: "superuser" });
    expect(bad.status).toBe(400);
    expect(bad.body.meta).toMatchObject({ field: "role" });
  });
});

/* ---------------------------------------------------------------- seats --- */

describe("the seat ceiling", () => {
  /*
    ⚠️ COUNTED ON INVITE, NOT ON ACCEPT. Counting only accepted members lets
    anybody past the ceiling by inviting twenty people and waiting — and the
    overage arrives days later, all at once, as a bill rather than a refusal.

    The entry plan is one seat and the founder holds it, which is the plan being
    what it says it is: a solo trainer.
  */
  it("refuses a staff invitation once the plan's seats are used", async () => {
    const r = (await owner("/api/member.list")).body as unknown as Roster;
    expect(r.seats.used).toBe(r.seats.allowed);

    const over = await owner("/api/member.invite", { email: "colleague@marsden.example.test", role: "trainer" });
    expect(over.status).toBe(402);
  });

  /*
    ⚠️ AND A CLIENT IS NOT A SEAT. A studio's customers are members of it, and
    counting them would price a coaching business by the number of people it
    coaches — twice, since it already pays per client.
  */
  it("does not count the people the studio coaches", async () => {
    const before = ((await owner("/api/member.list")).body as unknown as Roster).seats.used;
    expect((await owner("/api/member.invite", { email: "second-client@marsden.example.test", role: "client" })).status).toBe(200);
    expect(((await owner("/api/member.list")).body as unknown as Roster).seats.used).toBe(before);
  });
});

/* --------------------------------------------------------------- removal --- */

describe("removing somebody", () => {
  it("takes their access away at once", async () => {
    const roster = (await owner("/api/member.list")).body as unknown as Roster;
    const ro = roster.members.find((m) => m.email === "ro@marsden.example.test")!;

    expect((await owner("/api/member.remove", { id: ro.id })).status).toBe(200);
    /* ⚠️ Now, not when their session expires — a cookie outlives a removal by days. */
    const gone = as(await signIn("ro@marsden.example.test", STUDIO));
    expect((await gone("/api/programme.list")).status).toBe(403);

    const after = (await owner("/api/member.list")).body as unknown as Roster;
    expect(after.members.some((m) => m.email === "ro@marsden.example.test")).toBe(false);
  });

  /*
    ⚠️ AND THEY CAN BE INVITED BACK. The address is still the one their revoked
    row occupies, so without clearing the revocation the insert conflicts, the
    update leaves them revoked, and an owner can never undo a removal.
  */
  it("lets a removed person be invited back", async () => {
    expect((await owner("/api/member.invite", { email: "ro@marsden.example.test", role: "client" })).status).toBe(200);
    const roster = (await owner("/api/member.list")).body as unknown as Roster;
    expect(roster.members.some((m) => m.email === "ro@marsden.example.test")).toBe(true);
  });

  /*
    ⚠️ THE LAST ADMINISTRATOR MAY NOT GO. A studio whose last owner leaves is not
    closed — it is unreachable, with its data intact and nobody able to invite
    anybody back into it. Leaving is a different operation, with an export.
  */
  it("refuses to remove the last person who can manage the roster", async () => {
    const roster = (await owner("/api/member.list")).body as unknown as Roster;
    const boss = roster.members.find((m) => m.role === "owner")!;
    const refused = await owner("/api/member.remove", { id: boss.id });
    expect(refused.status).toBe(409);
    expect(refused.body.meta).toMatchObject({ reason: "last_administrator" });
  });
});
/* ----------------------------------------------------------- narrowing --- */

describe("narrowing one person within their role", () => {
  /*
    ⚠️ A DIFF, NOT A REPLACEMENT SET. "Everything a trainer may do, except
    publishing" is the request a real studio makes, and it has to survive the
    role gaining a permission next month — which a stored set does not.
  */
  it("takes one thing away and leaves the rest of the role", async () => {
    const roster = (await owner("/api/member.list")).body as unknown as Roster;
    const ro = roster.members.find((m) => m.email === "ro@marsden.example.test")!;

    const out = await owner("/api/member.permissions", { id: ro.id, grants: [], revoked: ["workout:write"] });
    expect(out.status).toBe(200);
    const held = out.body.permissions as unknown as string[];
    expect(held).not.toContain("workout:write");
    expect(held).toContain("workout:read");

    const them = as(await signIn("ro@marsden.example.test", STUDIO));
    expect((await them("/api/workout.list")).status).toBe(200);
    expect((await them("/api/workout.create", { client: ro.subjectId ?? "cli_x", day: "2026-08-01" })).status).toBe(403);
  });

  /*
    ⚠️ NOBODY MAY GRANT WHAT THEY DO NOT HOLD. Without this, anybody who can edit
    permissions escalates in two steps: grant themselves the key they lack, then
    use it — and the only sign is that somebody has been an owner for a month.
  */
  it("refuses to hand out something the granter does not have themselves", async () => {
    const roster = (await owner("/api/member.list")).body as unknown as Roster;
    const ro = roster.members.find((m) => m.email === "ro@marsden.example.test")!;

    /* A trainer may read the team; they may not widen anybody, including themselves. */
    await owner("/api/member.invite", { email: "second-client@marsden.example.test", role: "client" });
    const lesser = as(await signIn("second-client@marsden.example.test", STUDIO));
    expect((await lesser("/api/member.permissions", { id: ro.id, grants: ["client:write"], revoked: [] })).status).toBe(403);
  });

  it("refuses a permission this app does not declare", async () => {
    const roster = (await owner("/api/member.list")).body as unknown as Roster;
    const ro = roster.members.find((m) => m.email === "ro@marsden.example.test")!;
    const bad = await owner("/api/member.permissions", { id: ro.id, grants: ["everythng:read"], revoked: [] });
    expect(bad.status).toBe(400);
    expect(bad.body.meta).toMatchObject({ field: "grants" });
  });
});
