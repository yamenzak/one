/**
 * PRESCRIBING, AND THE CONVERSATION AROUND IT.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together.
 *
 * The through-line of this file is a single question: who may decide. A client
 * may ASK to swap a movement and may not answer their own request; a coach may
 * repeat a week and may not do it to a plan that is not theirs; and the one act
 * with no undo — forgetting a person — asks for their name typed out and takes
 * the trail with it.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { joinAs, post, SETUP, signIn } from "./session.js";

const SLUG = "coldharbour";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const as = (cookie: string) => ({
  async call(path: string, body?: unknown) {
    const res = await worker.fetch(
      new Request(`${STUDIO}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
  /* ⚠️ A READ IS A GET, and its input travels as a query. Posting to one is a
     404 rather than a 405, which reads as "no such operation". */
  async get(path: string, query: Record<string, string> = {}) {
    const q = new URLSearchParams(query).toString();
    const res = await worker.fetch(
      new Request(`${STUDIO}${path}${q ? `?${q}` : ""}`, {
        headers: { ...(cookie ? { cookie } : {}) },
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
});

type Week = {
  days: readonly { name?: string; movements: readonly {
    movement: string; sets?: number; reps?: number; load?: number; group?: string;
  }[] }[];
};

let coachCookie = "";
let coach: ReturnType<typeof as>;
let client: ReturnType<typeof as>;
let ro = "";
let squat = "";
let gobletSquat = "";
let programme = "";

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  coachCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  coach = as(coachCookie);

  const person = await coach.call("/api/client.create", { name: "Ro Adeyemi" });
  expect(person.status, "the roster fixture must not have hit the client quota").toBe(200);
  ro = person.body.id as unknown as string;

  client = as(await joinAs(STUDIO, coachCookie, `ro-${SLUG}@example.test`, "client"));

  squat = (await coach.call("/api/movement.create", { name: "Back squat", pattern: "squat" })).body.id as unknown as string;
  gobletSquat = (await coach.call("/api/movement.create", { name: "Goblet squat", pattern: "squat" })).body.id as unknown as string;
});

/* ------------------------------------------------------------ alternatives --- */

/*
  ⚠️ A STAND-IN CARRIES ITS REASON, and the reason is the half that is worth
  storing. "Goblet squat for back squat" is a fact a coach already knows;
  "…when the bar hurts your shoulder" is the thing that lets a different coach —
  or the client — act on it six months later without asking.
*/
describe("movements that stand in for other movements", () => {
  let id = "";

  it("a coach writes one, with when to use it", async () => {
    const made = await coach.call("/api/alternative.create", {
      movement: squat, substitute: gobletSquat, why: "when the bar hurts your shoulder",
    });
    expect(made.status).toBe(200);
    id = made.body.id as unknown as string;
  });

  it("refuses one with no reason", async () => {
    const made = await coach.call("/api/alternative.create", { movement: squat, substitute: gobletSquat });
    expect(made.status).toBe(400);
  });

  /*
    ⚠️ DIRECTIONAL, AND THIS IS THE ASSERTION THAT KEEPS IT SO. What stands in
    for a back squat is not what a back squat stands in for — a leg press is a
    fine substitute for a squat and a squat is not a substitute for a leg press
    if the point was to avoid loading the spine. A symmetric list asserts both.
  */
  it("does not invent the reverse", async () => {
    const list = await coach.get("/api/alternative.list");
    const rows = list.body.rows as unknown as { movement: string; substitute: string }[];
    expect(rows.filter((r) => r.movement === squat && r.substitute === gobletSquat)).toHaveLength(1);
    expect(rows.filter((r) => r.movement === gobletSquat && r.substitute === squat)).toHaveLength(0);
  });

  /* The client reads them — that is what makes a swap request an informed one. */
  it("is readable by the person who has to do the movement", async () => {
    expect((await client.get("/api/alternative.list")).status).toBe(200);
  });

  it("is not writable by them", async () => {
    const made = await client.call("/api/alternative.create", { movement: squat, substitute: gobletSquat, why: "no" });
    expect(made.status).toBe(403);
    expect(id).not.toBe("");
  });
});

/* ------------------------------------------------------------------ usage --- */

/*
  ⚠️ THE QUESTION IS ASKED BEFORE A DESTRUCTIVE ACT, which is what makes it worth
  a surface of its own. A movement renamed under a live plan changes what a
  client reads tomorrow; one deleted takes every set ever logged against it, and
  the derived delete cannot say so — a count is a query the collection layer has
  no reason to run.
*/
describe("where a movement is used", () => {
  beforeAll(async () => {
    const week: Week = { days: [{ name: "Monday", movements: [
      { movement: squat, sets: 5, reps: 5, load: 100 },
    ] }] };
    programme = (await coach.call("/api/programme.create", {
      client: ro, kind: "training", title: "Strength block", weeks: [week],
    })).body.id as unknown as string;
    expect(programme).toBeTruthy();
  });

  it("counts the plans that name it", async () => {
    const seen = await coach.get("/api/movement.usage", { movementId: squat });
    expect(seen.status).toBe(200);
    expect(seen.body.programmes as unknown as number).toBeGreaterThanOrEqual(1);
  });

  it("counts a stand-in in either direction", async () => {
    const forSquat = await coach.get("/api/movement.usage", { movementId: squat });
    const forGoblet = await coach.get("/api/movement.usage", { movementId: gobletSquat });
    expect(forSquat.body.alternatives as unknown as number).toBe(1);
    expect(forGoblet.body.alternatives as unknown as number).toBe(1);
  });

  it("reports nothing for a movement nobody has used", async () => {
    const spare = (await coach.call("/api/movement.create", { name: "Sled push", pattern: "carry" })).body.id;
    const seen = await coach.get("/api/movement.usage", { movementId: spare as unknown as string });
    expect(seen.body).toMatchObject({ sets: 0, programmes: 0, alternatives: 0, swaps: 0 });
  });

  /*
    ⚠️ ONE WORKSPACE'S COUNT MUST NOT INCLUDE ANOTHER'S, and the assertion is
    made from the other side rather than by a 401. An unauthenticated request is
    refused by the door and proves nothing about the query; a signed-in operator
    of a different studio asking about THIS studio's movement is the shape that
    would leak, and the answer has to be zero across the board.
  */
  it("does not count another studio's plans", async () => {
    const other = "coldharbour-two";
    const founding = await signIn(`${other}@example.test`, SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: other }, founding);
    const cookie = await signIn(`${other}@example.test`, `https://${other}.kova.4dl.app`);
    const res = await worker.fetch(
      new Request(`https://${other}.kova.4dl.app/api/movement.usage?movementId=${squat}`, { headers: { cookie } }),
      env as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sets: 0, programmes: 0, alternatives: 0, swaps: 0 });
  });
});

/* --------------------------------------------------- what a plan may hold --- */

/*
  ⚠️ THE JSON COLUMN IS VALIDATED, and the assertion that it is refused is the
  one worth having. `field.json("programme.weeks")` names a schema, and until
  the manifest registered one that name was a comment: the column took any shape
  at all and the failure was silent. A body carrying `items` where every reader
  wants `movements` saved cleanly, and then the copy applied no progression and
  the report counted nothing prescribed — both with every number correct.
*/
describe("a plan body that is not a plan", () => {
  const create = (weeks: unknown) =>
    coach.call("/api/programme.create", { client: ro, kind: "training", title: "Malformed", weeks });

  it("refuses a day whose movements are under the wrong key", async () => {
    expect((await create([{ days: [{ items: [{ movement: squat }] }] }])).status).toBe(400);
  });

  it("refuses a movement with no movement", async () => {
    expect((await create([{ days: [{ movements: [{ sets: 3 }] }] }])).status).toBe(400);
  });

  it("refuses a body that is not a list of weeks", async () => {
    expect((await create({ days: [] })).status).toBe(400);
  });

  it("refuses a rep count that is not a whole number", async () => {
    expect((await create([{ days: [{ movements: [{ movement: squat, reps: 8.5 }] }] }])).status).toBe(400);
  });

  /* ⚠️ And the shape it DOES accept is the one the readers read. */
  it("accepts the declared shape", async () => {
    expect((await create([{ days: [{ name: "Monday", movements: [{ movement: squat, sets: 3, reps: 8 }] }] }])).status).toBe(200);
  });
});

/* ------------------------------------------------------------- copy a week --- */

/*
  ⚠️ THE ARITHMETIC IS PURE AND PROVED IN `plans.test.ts`. What is proved here is
  the part that touches a database: the week is read, the copy is appended, the
  version moves, and a plan that is not this workspace's is not found.
*/
describe("repeating a week", () => {
  /*
    ⚠️ ITS OWN PLAN, because this test MUTATES and the suite retries once. A
    shared fixture makes the retry read three weeks where the assertion says two,
    which fails as an arithmetic error and is nothing of the kind.
  */
  it("appends a copy with the progression asked for", async () => {
    const week: Week = { days: [{ movements: [{ movement: squat, sets: 5, reps: 5, load: 100 }] }] };
    const own = (await coach.call("/api/programme.create", {
      client: ro, kind: "training", title: "Copy me", weeks: [week],
    })).body.id as unknown as string;

    const done = await coach.call("/api/programme.copy-week", { programmeId: own, week: 1, loadPercent: 5 });
    expect(done.status).toBe(200);
    expect(done.body.weeks as unknown as number).toBe(2);

    const back = await coach.get("/api/programme.read", { id: own });
    const weeks = (back.body.row as unknown as { weeks: Week[] }).weeks;
    expect(weeks[1]!.days[0]!.movements[0]!.load).toBe(105);
    /* ⚠️ And the source is untouched. A "copy" that edited the original in place
       would be indistinguishable from this on the count alone. */
    expect(weeks[0]!.days[0]!.movements[0]!.load).toBe(100);
  });

  it("refuses a week that is not there", async () => {
    const done = await coach.call("/api/programme.copy-week", { programmeId: programme, week: 40 });
    expect(done.status).toBe(400);
  });

  it("refuses a plan this workspace does not have", async () => {
    const done = await coach.call("/api/programme.copy-week", { programmeId: "prg_nowhere", week: 1 });
    expect(done.status).toBe(404);
  });

  /* A client may read their plan and may not write one. Copying is writing. */
  it("is not something the client can do to their own plan", async () => {
    const done = await client.call("/api/programme.copy-week", { programmeId: programme, week: 1 });
    expect(done.status).toBe(403);
  });
});

/* ------------------------------------------------------ supersets and rounds --- */

/*
  ⚠️ A GROUP IS A LABEL ON AN ITEM, NOT A CONTAINER AROUND ONE. Nesting reads
  better in a document and is worse in every other way: it makes "the third
  movement of the day" ambiguous, it makes reordering a two-level edit, and a
  plan half-migrated between the two shapes is unreadable rather than merely odd.
  The round a set was logged in travels on the SET, which is where the person in
  the gym actually produces it.
*/
describe("supersets, circuits and the rounds they are logged in", () => {
  let grouped = "";
  let workout = "";

  beforeAll(async () => {
    const week: Week = { days: [{ name: "Monday", movements: [
      { movement: squat, sets: 3, reps: 8, group: "A" },
      { movement: gobletSquat, sets: 3, reps: 12, group: "A" },
    ] }] };
    grouped = (await coach.call("/api/programme.create", {
      client: ro, kind: "training", title: "Circuit day", weeks: [week],
    })).body.id as unknown as string;
    workout = (await coach.call("/api/workout.create", { client: ro, day: "2026-03-02", programme: grouped })).body.id as unknown as string;
  });

  it("keeps the grouping in the plan the client reads", async () => {
    const back = await client.get("/api/programme.read", { id: grouped });
    const items = (back.body.row as unknown as { weeks: Week[] }).weeks[0]!.days[0]!.movements;
    expect(items.map((i) => i.group)).toEqual(["A", "A"]);
  });

  it("logs a set with the round it was done in", async () => {
    const done = await client.call("/api/set.create", {
      client: ro, workout, movement: squat, reps: 8, load: 60, round: 2,
    });
    expect(done.status).toBe(200);
    const back = await client.get("/api/set.read", { id: done.body.id as unknown as string });
    expect((back.body.row as unknown as { round: number }).round).toBe(2);
  });

  /* ⚠️ Absent, not zero. A set logged outside a circuit has no round, and a
     default of 0 would make "round 0" a thing the renderer has to know to hide. */
  it("leaves the round absent on an ordinary set", async () => {
    const done = await client.call("/api/set.create", { client: ro, workout, movement: squat, reps: 5, load: 80 });
    const back = await client.get("/api/set.read", { id: done.body.id as unknown as string });
    expect((back.body.row as unknown as { round?: number }).round ?? null).toBeNull();
  });
});

/* --------------------------------------------------------- extra workouts --- */

/*
  ⚠️ A WORKOUT WITHOUT A PLAN IS A FIRST-CLASS WORKOUT. Somebody who played five
  a side on Thursday did training, and a product that can only record what it
  prescribed produces a history that disagrees with the person living it — which
  is exactly the history a coach is trying to read.
*/
describe("training that was not prescribed", () => {
  it("records one with no plan attached", async () => {
    const done = await client.call("/api/workout.create", { client: ro, day: "2026-03-05" });
    expect(done.status).toBe(200);
    const back = await client.get("/api/workout.read", { id: done.body.id as unknown as string });
    expect((back.body.row as unknown as { programme?: string }).programme ?? null).toBeNull();
  });

  it("takes sets like any other", async () => {
    const w = (await client.call("/api/workout.create", { client: ro, day: "2026-03-06" })).body.id as unknown as string;
    const done = await client.call("/api/set.create", { client: ro, workout: w, movement: squat, reps: 10, load: 40 });
    expect(done.status).toBe(200);
  });

  it("appears in their own history beside the prescribed ones", async () => {
    const list = await client.get("/api/workout.list");
    const days = (list.body.rows as unknown as { day: string }[]).map((r) => r.day);
    expect(days).toContain("2026-03-05");
    expect(days).toContain("2026-03-02");
  });
});

/* ------------------------------------------------------------------ swaps --- */

/*
  ⚠️ THE ANSWER IS THE COACH'S, AND THAT IS THE WHOLE REASON `swap.decide` IS NOT
  THE DERIVED UPDATE. A client holds `swap:write` so they can ask; the same
  permission on the derived update would let them mark their own request
  allowed — the question answering itself.
*/
describe("asking to do something else", () => {
  let asked = "";

  it("the client opens one", async () => {
    const made = await client.call("/api/swap.create", {
      client: ro, movement: squat, why: "my shoulder will not take the bar today",
    });
    expect(made.status).toBe(200);
    asked = made.body.id as unknown as string;
  });

  it("is not answered by the person who asked", async () => {
    const done = await client.call("/api/swap.decide", { swapId: asked, allow: true, substitute: gobletSquat });
    expect(done.status).toBe(403);
  });

  /*
    ⚠️ AND NOT BY EDITING THE ROW EITHER. Refusing the operation while leaving
    the derived update open is a door with a lock beside an open window — the
    client holds `swap:write` precisely so they can open one.
  */
  it("is not answered by editing the row directly", async () => {
    const done = await client.call("/api/swap.update", {
      id: asked, version: 1, changes: { state: "allowed", substitute: gobletSquat },
    });
    expect(done.status).toBe(403);
    const back = await client.get("/api/swap.read", { id: asked });
    expect((back.body.row as unknown as { state: string }).state).toBe("asked");
  });

  /* ⚠️ "Yes" on its own leaves somebody standing in a gym having been told they
     may do something unspecified. */
  it("refuses an allow with nothing to do instead", async () => {
    const done = await coach.call("/api/swap.decide", { swapId: asked, allow: true });
    expect(done.status).toBe(400);
  });

  it("the coach allows it, with the movement to use", async () => {
    const done = await coach.call("/api/swap.decide", {
      swapId: asked, allow: true, substitute: gobletSquat, answer: "goblet for today, back squat on Friday",
    });
    expect(done.status).toBe(200);
    expect(done.body.state as unknown as string).toBe("allowed");

    const back = await client.get("/api/swap.read", { id: asked });
    expect(back.body.row).toMatchObject({ state: "allowed", substitute: gobletSquat });
  });

  it("a refusal needs no substitute, and says so in words", async () => {
    const made = await client.call("/api/swap.create", {
      client: ro, movement: squat, why: "I would rather not",
    });
    const done = await coach.call("/api/swap.decide", {
      swapId: made.body.id as unknown as string, allow: false, answer: "let us keep it and drop the load",
    });
    expect(done.status).toBe(200);
    expect(done.body.state as unknown as string).toBe("refused");
  });

  it("refuses a request that is not this workspace's", async () => {
    expect((await coach.call("/api/swap.decide", { swapId: "swp_nowhere", allow: false })).status).toBe(404);
  });

  /* The count on the movement moves with them, which is what makes it useful
     before a rename: a movement half the roster is asking to avoid. */
  it("shows up on the movement's usage", async () => {
    const seen = await coach.get("/api/movement.usage", { movementId: squat });
    expect(seen.body.swaps as unknown as number).toBe(2);
  });
});

/* --------------------------------------------------------------- the trail --- */

describe("what was changed on somebody's record", () => {
  it("names the verb, the actor and the time", async () => {
    await coach.call("/api/client.update", { id: ro, version: 1, changes: { situation: "trains at home, four mornings" } });
    const trail = await coach.get("/api/client.activity", { id: ro });
    expect(trail.status).toBe(200);
    const rows = trail.body.entries as unknown as { verb: string; actor_id: string; at: string }[];
    expect(rows.map((r) => r.verb)).toContain("update");
    expect(rows.map((r) => r.verb)).toContain("create");
    expect(rows[0]!.actor_id).toBeTruthy();
    expect(Date.parse(rows[0]!.at)).not.toBeNaN();
  });

  /* ⚠️ Newest first. A trail read oldest-first shows somebody the day the record
     was made when what they asked was what just happened to it. */
  it("puts the most recent first", async () => {
    const rows = (await coach.get("/api/client.activity", { id: ro })).body.entries as unknown as { at: string }[];
    const times = rows.map((r) => Date.parse(r.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("is not the client's to read", async () => {
    expect((await client.get("/api/client.activity", { id: ro })).status).toBe(403);
  });
});

/* ------------------------------------------------------------- forgetting --- */

/*
  ⚠️ DELETING A CLIENT ARCHIVES THE RECORD AND THAT IS RIGHT FOR ALMOST EVERY
  CASE — a studio tidying its roster has not been asked to destroy anything. This
  is the other case, and the one somebody has a right to.
*/
describe("forgetting somebody, permanently", () => {
  let doomed = "";
  let ownTrail = 0;
  let trailCount = 0;

  beforeAll(async () => {
    const made = await coach.call("/api/client.create", { name: "Sam Okonkwo" });
    expect(made.status, "the roster fixture must not have hit the client quota").toBe(200);
    doomed = made.body.id as unknown as string;
    const w = (await coach.call("/api/workout.create", { client: doomed, day: "2026-03-09" })).body.id as unknown as string;
    await coach.call("/api/set.create", { client: doomed, workout: w, movement: squat, reps: 6, load: 70 });
    await coach.call("/api/client.update", { id: doomed, version: 1, changes: { situation: "evenings only" } });
    /* What the trail holds under the PERSON's own id — the rest hangs off their records. */
    ownTrail = ((await coach.get("/api/client.activity", { id: doomed })).body.entries as unknown as unknown[]).length;
    expect(ownTrail).toBeGreaterThan(0);
  });

  /* ⚠️ A yes/no dialog in front of something irreversible is a reflex. */
  it("refuses without their name typed out", async () => {
    const done = await coach.call("/api/client.forget", { clientId: doomed, confirm: "yes" });
    expect(done.status).toBe(400);
  });

  it("refuses a person this workspace does not have", async () => {
    expect((await coach.call("/api/client.forget", { clientId: "cli_nowhere", confirm: "x" })).status).toBe(404);
  });

  it("is the owner's act, not a coach's", async () => {
    const assistant = as(await joinAs(STUDIO, coachCookie, `assistant-${SLUG}@example.test`, "assistant"));
    expect((await assistant.call("/api/client.forget", { clientId: doomed, confirm: "Sam Okonkwo" })).status).toBe(403);
  });

  it("takes everything that hangs off them", async () => {
    const done = await coach.call("/api/client.forget", { clientId: doomed, confirm: "Sam Okonkwo" });
    expect(done.status).toBe(200);
    trailCount = done.body.trail as unknown as number;
    /* ⚠️ The list is DERIVED, so this asserts the walk reached the busy tables
       rather than asserting a hand-written list back to itself. */
    expect(done.body.tables as unknown as string[]).toContain("sets");
    expect(done.body.tables as unknown as string[]).toContain("workouts");

    expect((await coach.get("/api/client.read", { id: doomed })).status).toBe(404);
    const sets = await coach.get("/api/set.list");
    expect((sets.body.rows as unknown as { client: string }[]).some((r) => r.client === doomed)).toBe(false);
  });

  /*
    ⚠️ THE TRAIL IS TENANT-SCOPED, SO THE DERIVED CASCADE CANNOT SEE IT — and
    what it holds is a dated list of every time their record was touched. Left
    behind, "forget this person" produces a workspace that still knows they
    existed and when they were edited.
  */
  it("takes the activity trail with them", async () => {
    const trail = await coach.get("/api/client.activity", { id: doomed });
    expect((trail.body.entries as unknown as unknown[] | undefined) ?? []).toHaveLength(0);
  });

  /*
    ⚠️ AND THE TRAIL OF EVERYTHING THAT HUNG OFF THEM, WHICH IS THE HALF THAT
    NEEDS THE IDS READ FIRST. A trail entry names the row it is about; once the
    row is deleted there is nothing left to join to, so a run that erased the
    rows and then looked would find nothing to remove and report success over
    entries it can no longer attribute — to anyone, including us.

    Counted rather than read back, because the operations that would read these
    entries are gone with their rows.
  */
  it("takes the trail of their records too, not only their own", async () => {
    expect(trailCount, "the fixture must produce more trail than the client row alone")
      .toBeGreaterThan(ownTrail);
  });

  it("leaves everybody else's record alone", async () => {
    expect((await coach.get("/api/client.read", { id: ro })).status).toBe(200);
    const trail = await coach.get("/api/client.activity", { id: ro });
    expect((trail.body.entries as unknown as unknown[]).length).toBeGreaterThan(0);
  });
});
