/**
 * THE NUTRITION HALF, END TO END — version 0.2.
 *
 * A coach builds a library and writes a way of eating; the person following it
 * records what they actually ate; both see how the day added up. The arithmetic
 * itself is proved in `nutrition.test.ts` without a database — this is the wiring.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { energyOf, portionOf, totalOf } from "../src/nutrition.js";

const STUDIO = "https://eastgate.kova.4dl.app";
let coach = "";

const call = async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie: coach },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const rows = (body: Record<string, never>) => body.rows as unknown as Record<string, unknown>[];

let clientId = "";
let oats = "";
let egg = "";

beforeAll(async () => {
  const staff = await signIn("eastgate@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "eastgate" }, staff);
  coach = await signIn("eastgate@example.test", STUDIO);
  clientId = (await call("/api/client.create", { name: "Sam" })).body.id as unknown as string;
  await call("/api/consent.record", { subject: clientId });
});

/* -------------------------------------------------------------- the food --- */

describe("a food carries what was measured and nothing else", () => {
  it("takes a food declared per hundred grams", async () => {
    const made = await call("/api/food.create", {
      name: "Rolled oats", per: 100, unit: "g", protein: 13, carbs: 60, fat: 7, fibre: 10,
    });
    expect(made.status).toBe(200);
    oats = made.body.id as unknown as string;
  });

  /*
    ⚠️ THE BASIS IS A FIELD. A tin declares its numbers per 100 g and an egg
    declares them per egg — assuming 100 everywhere is how a product tells
    somebody one egg was 620 calories.
  */
  it("takes a food declared per item", async () => {
    const made = await call("/api/food.create", {
      name: "Egg", per: 1, unit: "item", protein: 6, carbs: 0, fat: 5, fibre: 0,
    });
    expect(made.status).toBe(200);
    egg = made.body.id as unknown as string;
  });

  /*
    ⚠️ THERE IS NO `calories` FIELD, and the shape refuses one. A row holding
    both an energy figure and the macros it comes from holds two numbers that
    disagree the moment anybody edits one.
  */
  it("has nowhere to put a calorie figure", async () => {
    const listed = rows((await call("/api/food.list")).body);
    expect(Object.keys(listed[0]!)).not.toContain("calories");
    /* Dropped rather than stored, like any field nobody declared. */
    const sneaky = await call("/api/food.create", {
      name: "Bar", per: 100, unit: "g", protein: 10, carbs: 10, fat: 10, calories: 999,
    });
    expect(sneaky.status).toBe(200);
    const bar = rows((await call("/api/food.list")).body).find((f) => f.name === "Bar")!;
    expect(bar).not.toHaveProperty("calories");
  });

  it("refuses a basis of zero at the door", async () => {
    const bad = await call("/api/food.create", { name: "Air", per: 0, unit: "g", protein: 0, carbs: 0, fat: 0 });
    expect(bad.status).toBe(400);
  });
});

/* ------------------------------------------------------- what was eaten --- */

describe("what somebody ate, and how the day added up", () => {
  it("records portions across meals", async () => {
    for (const [food, amount, meal] of [[oats, 80, "breakfast"], [egg, 2, "breakfast"], [oats, 40, "snack"]] as const) {
      const made = await call("/api/portion.create", { day: "2026-08-11", meal, food, amount, client: clientId });
      expect(made.status).toBe(200);
    }
    expect(rows((await call("/api/portion.list")).body)).toHaveLength(3);
  });

  /*
    ⚠️ THE TOTAL IS COMPUTED FROM THE ROWS, by the pure layer, from the same
    numbers the reader can see. A stored daily total is a second copy that drifts
    the first time somebody corrects a portion.
  */
  it("adds up to what the pure layer says, from the rows themselves", async () => {
    const listed = rows((await call("/api/portion.list")).body);
    const library = new Map(rows((await call("/api/food.list")).body).map((f) => [f.id as string, f]));

    const eaten = listed.map((p) => {
      const f = library.get(p.food as string)! as unknown as Record<string, number | undefined>;
      return portionOf(
        { per: f.per ?? 0, protein: f.protein ?? 0, carbs: f.carbs ?? 0, fat: f.fat ?? 0, fibre: f.fibre ?? 0 },
        p.amount as number,
      );
    });
    const day = totalOf(eaten);

    /* 120 g of oats and two eggs, arrived at two ways. */
    expect(day.protein).toBeCloseTo(13 * 1.2 + 6 * 2, 6);
    expect(energyOf(day)).toBe(energyOf(totalOf(eaten)));
  });

  it("refuses a meal nobody declared", async () => {
    const bad = await call("/api/portion.create", { day: "2026-08-11", meal: "elevenses", food: oats, amount: 10, client: clientId });
    expect(bad.status).toBe(400);
  });
});

/* --------------------------------------------------------- two programmes --- */

describe("a person follows a way of training and a way of eating at once", () => {
  const write = (kind: string, title: string) =>
    call("/api/programme.create", { title, kind, client: clientId, weeks: [{ days: [] }] });

  /*
    ⚠️ PUBLISHING ONE MUST NOT TAKE THE OTHER AWAY. Standing down every
    programme would remove somebody's eating for publishing their training — a
    data loss they would discover in a supermarket.
  */
  it("keeps both current, and stands down only the same kind", async () => {
    const training = await write("training", "Sam — training");
    const eating = await write("eating", "Sam — eating");
    expect((await call("/api/programme.publish", { programmeId: training.body.id as unknown as string })).status).toBe(200);
    expect((await call("/api/programme.publish", { programmeId: eating.body.id as unknown as string })).status).toBe(200);

    const active = rows((await call("/api/programme.list")).body).filter((p) => p.active === 1 || p.active === true);
    expect(active.map((p) => p.kind).sort()).toEqual(["eating", "training"]);

    const second = await write("eating", "Sam — eating, revised");
    expect((await call("/api/programme.publish", { programmeId: second.body.id as unknown as string })).status).toBe(200);

    const after = rows((await call("/api/programme.list")).body).filter((p) => p.active === 1 || p.active === true);
    expect(after.map((p) => p.kind).sort()).toEqual(["eating", "training"]);
    expect(after.find((p) => p.kind === "eating")!.title).toBe("Sam — eating, revised");
  });
});
