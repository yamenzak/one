/**
 * ONE CLIENT'S WHOLE PICTURE, END TO END — version 0.4.
 *
 * ⚠️ A REPORT IS THE EASIEST PLACE IN A PRODUCT TO BE CONFIDENTLY WRONG. Every
 * number here is a claim about somebody's body, their effort or their food, and
 * each of the four this suite pins is wrong in a way that looks perfectly
 * plausible on screen: an average that divides by seven, a best set chosen by
 * weight, a bar at nought per cent for somebody with no programme, and a goal
 * whose progress went stale the moment a weigh-in was corrected.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const STUDIO = "https://calder.kova.4dl.app";
let cookie = "";

const call = async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type Report = {
  window: { since: string; until: string; days: number; client: { id: string; name: string } };
  body: {
    latest: Record<string, { day: string; value: number }>;
    goals: { kind: string; progress: { done: number; reached: boolean } | null; daysLeft: number | null }[];
  };
  training: {
    workouts: number;
    prescribedPerWeek: number | null;
    consistency: { done: number; expected: number; ratio: number | null };
    bests: { name: string | null; of: { load: number; reps: number }; estimate: { value: number; beyond: boolean } }[];
  };
  nutrition: { days: number; mean: { protein: number; carbs: number; fat: number }; energy: number | null };
};

let ro = "";
let bare = "";
let plain = "";
/* ⚠️ A GET WITH A QUERY STRING, because a read is a GET. See `routeFor`. */
const report = async (clientId: string, days?: number) =>
  (await call(`/api/client.report?clientId=${clientId}${days === undefined ? "" : `&days=${days}`}`)).body as unknown as Report;

beforeAll(async () => {
  const staff = await signIn("calder@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "calder" }, staff);
  cookie = await signIn("calder@example.test", STUDIO);

  ro = (await call("/api/client.create", { name: "Ro" })).body.id as unknown as string;

  await call("/api/consent.record", { subject: ro });
  /* Somebody with nothing at all: no programme, no entries, no food. */
  bare = (await call("/api/client.create", { name: "Bare" })).body.id as unknown as string;
  await call("/api/consent.record", { subject: bare });
  /*
    ⚠️ AND SOMEBODY WITH THE FORMS BUT NOT THE CONTENT — a published programme
    with no days in it and a goal with nothing weighed against it. Both are the
    cases where a report is tempted to answer zero, and zero is an accusation.
  */
  plain = (await call("/api/client.create", { name: "Plain" })).body.id as unknown as string;
  await call("/api/consent.record", { subject: plain });
  const hollow = await call("/api/programme.create", {
    title: "Nothing in it", kind: "training", client: plain, weeks: [],
  });
  await call("/api/programme.publish", { programmeId: hollow.body.id as unknown as string });
  await call("/api/goal.create", { client: plain, kind: "weight", start: 90, target: 80 });

  /* A four-week block that deloads: 4, 4, 4, 2 — three and a half a week. */
  const week = (days: number) => ({ days: Array.from({ length: days }, () => ({ movements: [{ movement: "x" }] })) });
  const programme = await call("/api/programme.create", {
    title: "Winter block", kind: "training", client: ro, weeks: [week(4), week(4), week(4), week(2)],
  });
  await call("/api/programme.publish", { programmeId: programme.body.id as unknown as string });

  const squat = (await call("/api/movement.create", { name: "Back squat", pattern: "squat" })).body.id as unknown as string;
  const press = (await call("/api/movement.create", { name: "Bench press", pattern: "push" })).body.id as unknown as string;

  /* Eight sessions in the last four weeks, against sixteen asked for. */
  for (let i = 0; i < 8; i++) {
    const made = await call("/api/workout.create", { client: ro, day: daysAgo(i * 3 + 1) });
    const id = made.body.id as unknown as string;
    await call("/api/set.create", { client: ro, workout: id, movement: squat, load: 100 + i, reps: 5 });
    await call("/api/workout.submit", { id });
  }
  /*
    ⚠️ A HEAVY SINGLE AND A LIGHTER FIVE, and the five is worth more. A "best"
    chosen by what was on the bar picks the 200; the 180 × 5 is the harder set.
  */
  const single = await call("/api/workout.create", { client: ro, day: daysAgo(2) });
  await call("/api/set.create", { client: ro, workout: single.body.id as unknown as string, movement: press, load: 200, reps: 1 });
  await call("/api/set.create", { client: ro, workout: single.body.id as unknown as string, movement: press, load: 180, reps: 5 });
  await call("/api/workout.submit", { id: single.body.id as unknown as string });

  /* A weigh-in well outside the window, and one inside it. */
  await call("/api/entry.create", { client: ro, day: daysAgo(200), kind: "weight", value: 90 });
  await call("/api/entry.create", { client: ro, day: daysAgo(3), kind: "weight", value: 85 });
  await call("/api/goal.create", { client: ro, kind: "weight", start: 90, target: 80, dueOn: daysAgo(-30) });

  /* Two days of food inside a twenty-eight-day window. */
  const rice = (await call("/api/food.create", {
    name: "Rice", per: 100, unit: "g", protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4,
  })).body.id as unknown as string;
  for (const day of [daysAgo(2), daysAgo(4)]) {
    await call("/api/portion.create", { client: ro, day, meal: "lunch", food: rice, amount: 200 });
  }
});

/* ------------------------------------------------------------------ body --- */

describe("where their body is", () => {
  /*
    ⚠️ THE LATEST READING IS OVER ALL TIME, NOT OVER THE WINDOW. Somebody who did
    not weigh in this month still has a weight, and a blank would read as "they
    have never recorded one".
  */
  it("shows the most recent reading of each kind, whenever it was taken", async () => {
    const r = await report(ro, 7);
    expect(r.body.latest.weight).toMatchObject({ value: 85 });
  });

  /*
    ⚠️ PROGRESS IS COMPUTED, WHICH IS WHY CORRECTING A WEIGH-IN CORRECTS IT. A
    stored figure would keep the old answer with nothing about it looking wrong.
  */
  it("measures a goal from its baseline, and follows a correction", async () => {
    expect((await report(ro)).body.goals[0]!.progress).toMatchObject({ done: 0.5, reached: false });

    const rows = ((await call("/api/entry.list")).body as unknown as { rows: { id: string; version: number; day: string; kind: string }[] }).rows;
    const latest = rows.filter((e) => e.kind === "weight").sort((a, b) => b.day.localeCompare(a.day))[0]!;
    expect((await call("/api/entry.update", { id: latest.id, version: latest.version, changes: { value: 80 } })).status).toBe(200);

    expect((await report(ro)).body.goals[0]!.progress).toMatchObject({ done: 1, reached: true });
  });

  it("has no progress to report when nothing has been recorded", async () => {
    const r = await report(bare);
    expect(r.body.latest).toEqual({});
    expect(r.body.goals).toEqual([]);
  });

  /*
    ⚠️ A GOAL WITH NOTHING WEIGHED AGAINST IT HAS NO PROGRESS, WHICH IS NOT NOUGHT
    PER CENT. Falling back to the baseline draws an empty bar and reads as "they
    have not moved" — a claim about somebody who simply has not stepped on the
    scales yet.
  */
  it("says nothing rather than nought for a goal with no reading behind it", async () => {
    const goal = (await report(plain)).body.goals[0]!;
    expect(goal.progress).toBeNull();
    /* And no date set is no deadline, rather than a deadline of today. */
    expect(goal.daysLeft).toBeNull();
  });
});

/* -------------------------------------------------------------- training --- */

describe("how much of the programme happened", () => {
  /*
    ⚠️ MEASURED AGAINST WHAT THE BLOCK AVERAGES, not against its first week. A
    block that deloads asks for less than week one does, and measuring against
    week one tells somebody they fell behind by following the plan.
  */
  it("counts what was done against what was asked for", async () => {
    const r = await report(ro, 28);
    expect(r.training.workouts).toBe(9);
    /* 3.5 a week over 28 days = 14. */
    expect(r.training.prescribedPerWeek).toBe(3.5);
    expect(r.training.consistency.expected).toBe(14);
    expect(r.training.consistency.ratio).toBeCloseTo(9 / 14, 5);
  });

  /*
    ⚠️ NOBODY PRESCRIBED ANYTHING, SO THERE IS NOTHING TO BE BEHIND ON. Zero per
    cent is an accusation about sessions that were never asked for.
  */
  it("says nothing rather than nought per cent for somebody with no programme", async () => {
    const r = await report(bare);
    expect(r.training.consistency.ratio).toBeNull();
    expect(r.training.consistency.expected).toBe(0);
  });

  /*
    ⚠️ AND THE SAME FOR A PROGRAMME THAT ASKS FOR NOTHING. A published block with
    no days in it — or one written in a shape this cannot read — has prescribed
    nothing, and turning that into "0 of 0, 0%" invents sessions to be behind on.
  */
  it("says nothing for a published programme with nothing in it", async () => {
    const r = await report(plain);
    expect(r.training.prescribedPerWeek).toBeNull();
    expect(r.training.consistency.ratio).toBeNull();
  });

  /*
    ⚠️ THE BEST SET IS CHOSEN BY WHAT IT WAS WORTH AND SHOWN AS WHAT HAPPENED. A
    200 × 1 outweighs a 150 × 8 on the bar and is worth far less; a report that
    sorts by load tells somebody their hardest session was their easiest.
  */
  it("picks the best set by what it was worth, and shows the real one", async () => {
    const bench = (await report(ro)).training.bests.find((b) => b.name === "Bench press")!;
    expect(bench.of).toEqual({ load: 180, reps: 5 });
    expect(bench.estimate.value).toBeGreaterThan(200);
    expect(bench.estimate.beyond).toBe(false);
  });

  /* ⚠️ A record is over all time. One that reset every four weeks is not a record. */
  it("keeps a best from outside the window", async () => {
    const short = (await report(ro, 1)).training.bests.find((b) => b.name === "Bench press");
    expect(short?.of).toEqual({ load: 180, reps: 5 });
  });
});

/* ------------------------------------------------------------- nutrition --- */

describe("how they have been eating", () => {
  /*
    ⚠️ DIVIDED BY THE DAYS THAT WERE LOGGED, NOT BY THE WINDOW. Two careful days
    in a month divided by twenty-eight says somebody ate 60 calories a day —
    wrong, alarming, and produced by mistaking silence for abstinence.
  */
  it("averages over the days that were logged, and says how many", async () => {
    const r = await report(ro, 28);
    expect(r.nutrition.days).toBe(2);
    /* 200 g of rice per day: 5.4 protein, 56 carbs, 0.6 fat. */
    expect(r.nutrition.mean.carbs).toBeCloseTo(56, 5);
    expect(r.nutrition.energy).toBeGreaterThan(200);
  });

  /* ⚠️ Nothing logged is null, never zero: zero is a claim that they ate nothing. */
  it("reports nothing rather than zero when nothing was logged", async () => {
    const r = await report(bare);
    expect(r.nutrition.days).toBe(0);
    expect(r.nutrition.energy).toBeNull();
  });
});

describe("the report refuses what it cannot answer", () => {
  it("does not invent a client", async () => {
    expect((await call("/api/client.report?clientId=cli_nope")).status).toBe(404);
  });
});
