/**
 * THE CORE LOOP, END TO END — version 0.1's whole reason to exist.
 *
 * A coach writes a programme and publishes it; the person following it records
 * what they actually did, set by set; the coach sees it. Everything else in
 * [KOVA-INVENTORY.md](../../docs/KOVA-INVENTORY.md) arrives in a later version.
 *
 * ⚠️ NOTHING IN THIS APP ROUTES, GATES OR STORES ANYTHING. Two operations are
 * declared — publishing and finishing — because neither is a field. The other
 * thirty-odd surfaces this suite drives are derived from six collections.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { readOutcome } from "@one/runtime";

const STUDIO = "https://northgate.kova.4dl.app";
let coach = "";

const call = async (path: string, body?: unknown, cookie = coach) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never>, outcome: readOutcome(res.headers) };
};

const rows = (body: Record<string, never>) => body.rows as unknown as Record<string, unknown>[];

let clientId = "";
let movementId = "";
let programmeId = "";
let workoutId = "";

beforeAll(async () => {
  const staff = await signIn("northgate@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "northgate" }, staff);
  coach = await signIn("northgate@example.test", STUDIO);
});

/* ------------------------------------------------------------- the setup --- */

describe("a studio starts with nothing, and is told what to do about it", () => {
  /*
    ⚠️ KOVA SHIPS NO LIBRARY. Content a studio did not choose is something to
    delete, not a head start — so the checklist asks for movements rather than
    handing over forty rows somebody has to audit.
  */
  it("asks for a plan and a library before anything else", async () => {
    const guide = (await call("/api/guide.progress")).body as unknown as {
      wizard: { steps: { id: string }[]; done: boolean };
    };
    expect(guide.wizard.steps.map((s) => s.id)).toEqual(["choose-plan", "first-movement"]);
    expect(guide.wizard.done).toBe(false);
  });

  it("has a library with nothing in it", async () => {
    expect(rows((await call("/api/movement.list")).body)).toEqual([]);
  });
});

/* -------------------------------------------------------------- the loop --- */

describe("a coach writes a programme and somebody follows it", () => {
  it("adds a person and a movement", async () => {
    const person = await call("/api/client.create", { name: "Marion", email: "marion@example.test" });
    await call("/api/consent.record", { subject: person.body.id });
    expect(person.status).toBe(200);
    clientId = person.body.id as unknown as string;

    const movement = await call("/api/movement.create", { name: "Back squat", pattern: "squat", how: "Brace, then sit between your feet." });
    expect(movement.status).toBe(200);
    movementId = movement.body.id as unknown as string;
  });

  /*
    ⚠️ A TEMPLATE IS A PROGRAMME WITH NO CLIENT — the same thing, not yet
    addressed to anybody. The old product had four tables for this idea.
  */
  it("writes it as a template first, and refuses to publish that", async () => {
    const template = await call("/api/programme.create", {
      title: "Base — 4 weeks", kind: "training", weeks: [{ days: [{ movements: [{ movement: movementId, sets: 5, reps: 5 }] }] }],
    });
    expect(template.status).toBe(200);

    const refused = await call("/api/programme.publish", { programmeId: template.body.id as unknown as string });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("coaching.programme_has_no_client");
  });

  it("addresses one to somebody and publishes it", async () => {
    const made = await call("/api/programme.create", {
      title: "Marion — block 1",
      kind: "training",
      client: clientId,
      weeks: [{ days: [{ movements: [{ movement: movementId, sets: 5, reps: 5 }] }] }],
    });
    expect(made.status).toBe(200);
    programmeId = made.body.id as unknown as string;

    const published = await call("/api/programme.publish", { programmeId });
    expect(published.status).toBe(200);
    expect(published.outcome).toMatchObject({ message: "Programme published", moment: "acknowledge" });
  });

  /*
    ⚠️ ONE PROGRAMME IS CURRENT AT A TIME, and the previous one steps down in the
    same breath. Writing `active: true` through the derived update would leave two
    current and nobody told — which is why publishing is an operation and not a
    field.
  */
  it("stands the previous one down when a second is published", async () => {
    const second = await call("/api/programme.create", {
      title: "Marion — block 2", kind: "training", client: clientId, weeks: [{ days: [] }],
    });
    expect((await call("/api/programme.publish", { programmeId: second.body.id as unknown as string })).status).toBe(200);

    const listed = rows((await call("/api/programme.list")).body);
    const current = listed.filter((p) => p.active === 1 || p.active === true);
    expect(current).toHaveLength(1);
    expect(current[0]!.title).toBe("Marion — block 2");
  });
});

/* ----------------------------------------------------------- the reading --- */

describe("what actually happened is recorded, and then frozen", () => {
  it("records a workout set by set", async () => {
    const workout = await call("/api/workout.create", { day: "2026-08-10", programme: programmeId, client: clientId });
    expect(workout.status).toBe(200);
    workoutId = workout.body.id as unknown as string;

    for (const reps of [5, 5, 4]) {
      const set = await call("/api/set.create", {
        workout: workoutId, movement: movementId, reps, load: 100, effort: 8, client: clientId,
      });
      expect(set.status, `${reps} reps`).toBe(200);
    }
    expect(rows((await call("/api/set.list")).body)).toHaveLength(3);
  });

  /*
    ⚠️ A WORKOUT ASSERTS THAT SOMETHING HAPPENED, so finishing it freezes what it
    asserts. A training history that can be quietly edited is not a history.
  */
  /*
    ⚠️ ITS OWN WORKOUT, because the suite retries once and submitting is not
    idempotent — a retry would be refused by the very rule the assertion is
    about, and read as a bug in the lifecycle. Finding 120, in a new file.
  */
  it("freezes the day and the programme once it is submitted", async () => {
    const made = await call("/api/workout.create", { day: "2026-08-11", client: clientId });
    const id = made.body.id as unknown as string;
    expect((await call("/api/workout.submit", { id })).status).toBe(200);

    const after = rows((await call("/api/workout.list")).body).find((w) => w.id === id)!;
    const edited = await call("/api/workout.update", {
      id, version: after.version, changes: { day: "2026-01-01" },
    });
    /* Refused as an invalid change, naming the frozen field rather than the row. */
    expect(edited.status).toBe(400);
    expect(edited.body.meta).toMatchObject({ fields: "day" });

    /* ⚠️ And what was NOT frozen still moves — the freeze is per field. */
    const note = await call("/api/workout.update", {
      id, version: after.version, changes: { howItWent: "heavy but fine" },
    });
    expect(note.status).toBe(200);
  });

  /*
    ⚠️ AND FINISHING IS AN EVENT, which is a different fact from a row existing.
    It is what a person's streak is made of, and what the coach is told about.
  */
  it("counts as done, and is recognised the first time", async () => {
    const done = await call("/api/workout.complete", { workoutId });
    expect(done.status).toBe(200);

    const shelf = ((await call("/api/milestone.list")).body as unknown as
      { rows: { id: string; earned: boolean }[] }).rows;
    expect(shelf.find((m) => m.id === "first-plan")).toMatchObject({ earned: true });
  });

  it("shows the coach what was lifted", async () => {
    const sets = rows((await call("/api/set.list")).body);
    expect(sets.map((s) => s.reps)).toEqual([4, 5, 5]);
    expect(sets.every((s) => s.movement === movementId)).toBe(true);
  });
});

/* ------------------------------------------------------------ recording --- */

describe("everything somebody writes down lives in one place", () => {
  /*
    ⚠️ ONE COLLECTION WHERE THERE WERE SIX TABLES. `sleep_logs`, `mood_logs`,
    `water_logs`, `steps_logs`, `activity_logs` and `measurements` were six
    shapes for "a person recorded a number on a day", plus a check-in that wrote
    copies into them. Three documented bug classes came out of that and none of
    them is expressible here.
  */
  it("takes a weight, a sleep and a mood through one surface", async () => {
    for (const [kind, value] of [["weight", 81.4], ["sleep", 7.5], ["mood", 4]] as const) {
      const made = await call("/api/entry.create", { day: "2026-08-10", kind, value, client: clientId });
      expect(made.status, kind).toBe(200);
    }
    const listed = rows((await call("/api/entry.list")).body);
    expect(listed.map((e) => e.kind).sort()).toEqual(["mood", "sleep", "weight"]);
  });

  it("refuses a kind nobody declared", async () => {
    const bad = await call("/api/entry.create", { day: "2026-08-10", kind: "vibes", value: 1, client: clientId });
    expect(bad.status).toBe(400);
  });
});
