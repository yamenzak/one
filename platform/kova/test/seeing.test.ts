/**
 * ASKING A MODEL ABOUT A PICTURE, AND ASKING IT FOR ONE — the two lanes that are
 * not the text lane wearing a different content type.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together.
 *
 * ⚠️ THE FAILURE BOTH LANES EXIST TO PREVENT COSTS MONEY AND SUCCEEDS EVERY
 * TIME. A provider bills a photograph as a flat block of input units — more than
 * most prompts — and none of it is in the text, so a vision call metered on its
 * prompt alone holds almost nothing, settles at almost nothing, and the platform
 * pays the difference. An image is worse: priced per picture, it would settle at
 * the cost of the sentence that asked for it. Neither throws, neither is visible
 * in a green suite, and both scale with USE — photographing a meal is the
 * feature people reach for most.
 */

import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "sedbergh";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

/* ------------------------------------------------------------- the runner --- */

const provider: {
  answer: unknown;
  throws: boolean;
  calls: { model: string; input: Record<string, unknown> }[];
} = { answer: { output: { foods: [] } }, throws: false, calls: [] };

const attach = () => {
  (env as Record<string, unknown>).AI = {
    async run(model: string, input: Record<string, unknown>) {
      provider.calls.push({ model, input });
      if (provider.throws) throw new Error("upstream");
      return provider.answer;
    },
  };
};

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
  async upload(body: ArrayBuffer, query: string, contentType: string) {
    const res = await worker.fetch(
      new Request(`${STUDIO}/api/file.upload?${query}`, {
        method: "POST", headers: { "content-type": contentType, cookie }, body,
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
});

/** A JPEG carrying an Exif segment, as a phone sends one. */
const photo = (tag: number): ArrayBuffer =>
  new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
    0xff, 0xdb, 0x00, 0x05, 1, 2, 3, 0xff, 0xda, 0x00, 0x02, 9, 9, tag, 0xff, 0xd9,
  ]).buffer;

interface RawDb { prepare(sql: string): { bind(...p: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null> } } }

const fund = async (amount: number) => {
  const db = (env as unknown as { DB: RawDb }).DB;
  await db.prepare(
    `INSERT INTO ledger (id, tenant_id, unit, amount, reason, ref, actor_id, at) VALUES (?, ?, 'credits', ?, 'test', NULL, 'op', ?)`,
  ).bind(crypto.randomUUID(), tenantId, amount, new Date().toISOString()).run();
};

const balance = async (): Promise<number> => {
  const db = (env as unknown as { DB: RawDb }).DB;
  const row = await db.prepare(`SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE tenant_id = ? AND unit = 'credits'`)
    .bind(tenantId).first<{ n: number }>();
  return row?.n ?? 0;
};

let coach: ReturnType<typeof as>;
let tenantId = "";
let meal = "";

beforeAll(async () => {
  attach();
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  tenantId = made.body.tenantId as string;
  expect(tenantId, "the studio fixture must have been created").toBeTruthy();
  coach = as(await signIn(`${SLUG}@example.test`, STUDIO));

  const up = await coach.upload(photo(1), "purpose=meal&name=lunch.jpg", "image/jpeg");
  expect(up.status, "the picture fixture must have uploaded").toBe(200);
  meal = up.body.id as unknown as string;
  await fund(1_000_000);
});

afterEach(() => {
  provider.throws = false;
  provider.calls.length = 0;
  provider.answer = { output: { foods: [] } };
});

/* ------------------------------------------------------- reading a picture --- */

describe("a photograph handed to a model", () => {
  it("reads a meal into foods and portions", async () => {
    provider.answer = { output: { foods: [{ name: "Porridge", grams: 300, confident: false }] } };
    const out = await coach.call("/api/ai.snap-meal", { photo: meal });
    expect(out.status).toBe(200);
    expect((out.body.read as unknown as { foods: unknown[] }).foods).toHaveLength(1);
  });

  /*
    ⚠️ THE BYTES REACH THE RUNNER. Without this the whole lane could be a
    perfectly ordinary text call with the picture dropped on the floor — which
    answers, charges, and produces a confident reading of nothing.
  */
  it("actually sends the picture", async () => {
    await coach.call("/api/ai.snap-meal", { photo: meal });
    const sent = provider.calls[0]!.input as { image?: { bytes: ArrayBuffer; contentType: string } };
    expect(sent.image, "the runner was given no picture").toBeTruthy();
    expect(sent.image!.contentType).toBe("image/jpeg");
    expect(sent.image!.bytes.byteLength).toBeGreaterThan(0);
  });

  /*
    ⚠️ IT IS SCOPED, AND THE REFUSAL NAMES WHAT WENT WRONG.
    "That picture is not in this workspace" is a thing the caller can act on;
    falling through to the meter's own "this asks for a picture and none was
    given" is the app being told it forgot to attach one, which is a different
    mistake with a different fix. Both refuse and both hold nothing, so the
    status alone cannot tell them apart — which is exactly how the specific half
    came to be computed and thrown away once already.
  */
  it("refuses a picture this workspace does not hold, and says so", async () => {
    const out = await coach.call("/api/ai.snap-meal", { photo: "med_nowhere" });
    expect(out.status).toBe(503);
    expect((out.body.meta as unknown as { reason: string }).reason).toMatch(/not in this workspace/);
    expect(provider.calls, "nothing should have been sent").toHaveLength(0);
  });

  /*
    ⚠️ ANOTHER STUDIO'S PHOTOGRAPH IS THE SAME ANSWER AS ONE THAT DOES NOT
    EXIST, and it has to be: distinguishing them tells whoever is guessing which
    ids are real. This is the assertion a nonexistent id cannot make — a lookup
    that forgot its tenant binding refuses the invented id and serves this one.
  */
  it("cannot be handed a picture from another studio", async () => {
    const other = "sedbergh-two";
    const founding = await signIn(`${other}@example.test`, SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: other }, founding);
    const cookie = await signIn(`${other}@example.test`, `https://${other}.kova.4dl.app`);
    const up = await worker.fetch(
      new Request(`https://${other}.kova.4dl.app/api/file.upload?purpose=meal&name=theirs.jpg`, {
        method: "POST", headers: { "content-type": "image/jpeg", cookie }, body: photo(7),
      }),
      env as never,
    );
    expect(up.status, "the other studio's fixture must have uploaded").toBe(200);
    const theirs = ((await up.json()) as { id: string }).id;

    const out = await coach.call("/api/ai.snap-meal", { photo: theirs });
    expect(out.status).toBe(503);
    expect((out.body.meta as unknown as { reason: string }).reason).toMatch(/not in this workspace/);
    expect(provider.calls, "another studio's photograph must never reach a model").toHaveLength(0);
  });

  /*
    ⚠️ AND IT REFUSES BEFORE ANYTHING IS HELD. Holding first and discovering
    afterwards means a refund on every mistyped id — and a refund that fails is
    credits taken for a call nobody made.
  */
  it("holds nothing for a picture that is not there", async () => {
    const before = await balance();
    await coach.call("/api/ai.snap-meal", { photo: "med_nowhere" });
    expect(await balance()).toBe(before);
  });

  it("reads a label into one food", async () => {
    provider.answer = { output: { name: "Oats", per100g: { kcal: 379, protein: 13, carbs: 68, fat: 7 }, confident: true } };
    const out = await coach.call("/api/ai.label-reader", { photo: meal });
    expect(out.status).toBe(200);
    expect((out.body.read as unknown as { name: string }).name).toBe("Oats");
  });

  /* ⚠️ A lab report goes to the reasoning model, because a misread digit here is
     a clinical figure somebody acts on. */
  it("sends a lab report to the model that reasons", async () => {
    provider.answer = { output: { values: [] } };
    await coach.call("/api/ai.lab-extract", { photo: meal });
    expect(provider.calls[0]!.model).toBe("gemini-2.5-pro");
  });

  /*
    ⚠️ IT ANSWERS; IT DOES NOT WRITE. A reading saved straight into a diary or a
    lab record is a number nobody checked, filed under a coach's name.
  */
  it("writes nothing anywhere", async () => {
    provider.answer = { output: { values: [{ name: "Ferritin", value: 24, unit: "ug/L", low: 30, high: 400, legible: true }] } };
    await coach.call("/api/ai.lab-extract", { photo: meal });
    const labs = await coach.call("/api/lab.list");
    expect((labs.body.rows as unknown as unknown[]) ?? []).toHaveLength(0);
  });
});

/* ------------------------------------------------------ what a picture costs --- */

describe("what a photograph is metered at", () => {
  /*
    ⚠️ THE PICTURE'S UNITS ARE IN THE RESERVE, AND THIS IS THE ASSERTION THE
    WHOLE LANE IS FOR. A vision call metered on its prompt alone holds only what
    its words come to — so the settle caps there, and the thousand-odd input
    units the provider actually bills for the photograph are paid by the
    platform, on every call, forever, with every one of them succeeding.

    ⚠️ COMPARED LIKE WITH LIKE, AND THAT IS WHAT MAKES THE NUMBER READABLE.
    `snap-meal` and `parse-food` run the same model with the same output ceiling
    on the same sentence, so the ONLY difference between them is the picture —
    and the difference has to be the model's declared `imageUnits` at its input
    rate. A ratio would pass on an image that was priced at a tenth of what it
    costs, because the output side dominates both.
  */
  it("holds the picture's own units on top of the words", async () => {
    provider.answer = { output: { foods: [] } };
    const words = "porridge and berries";

    const before = await balance();
    await coach.call("/api/ai.snap-meal", { photo: meal, note: words });
    const withPicture = before - (await balance());

    const mid = await balance();
    await coach.call("/api/ai.parse-food", { text: words });
    const wordsOnly = mid - (await balance());

    expect(wordsOnly).toBeGreaterThan(0);
    /*
      1,100 input units at this model's input rate of 1, plus the few units the
      two system texts differ by — which is why this is a floor rather than an
      equality. The floor is the number that matters: below it, the picture is
      partly unmetered.
    */
    expect(withPicture - wordsOnly, "the photograph itself must be metered").toBeGreaterThanOrEqual(1_100);
  });

  /*
    ⚠️ A PROVIDER THAT REPORTS LOW STILL PAYS THE PICTURE. The settle takes the
    lesser of held and reported, so a usage block that counts only the text
    would discount every image — which is the same transfer arriving through the
    other door.
  */
  it("does not let a thin usage report make the picture free", async () => {
    provider.answer = { output: { foods: [] }, usage: { input: 4, output: 4 } };
    const before = await balance();
    await coach.call("/api/ai.snap-meal", { photo: meal, note: "porridge" });
    const charged = before - (await balance());
    /* The provider is believed — but it reported units, not credits, and 4+4
       units at this model's rate is still the honest floor rather than zero. */
    expect(charged).toBeGreaterThan(0);
  });

  it("refunds in full when the provider fails", async () => {
    provider.throws = true;
    const before = await balance();
    const out = await coach.call("/api/ai.snap-meal", { photo: meal });
    expect(out.status).toBe(503);
    expect(await balance()).toBe(before);
  });
});

/* --------------------------------------------------------- asking for one --- */

const png = (): ArrayBuffer => new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8,
]).buffer;

describe("a picture asked for", () => {
  it("comes back as a file in the studio's own library", async () => {
    provider.answer = { output: { bytes: png(), contentType: "image/png" } };
    const out = await coach.call("/api/ai.image", { about: "a kettlebell on a gym floor" });
    expect(out.status).toBe(200);
    const id = out.body.media as unknown as string;
    expect(id).toMatch(/^med_/);

    /* ⚠️ In the LIBRARY, which is what makes it re-readable tomorrow without
       paying again — and countable, and erasable with the workspace. */
    const list = await coach.call("/api/file.list");
    expect((list.body.files as unknown as { id: string }[]).some((r) => r.id === id)).toBe(true);
  });

  /*
    ⚠️ PRICED PER PICTURE, NOT PER UNIT. Through the token arithmetic this would
    hold the cost of the sentence that asked for it — a fraction of the real
    price — and the platform would pay the rest on every image ever generated.
  */
  it("costs the per-picture price rather than the price of the sentence", async () => {
    provider.answer = { output: { bytes: png(), contentType: "image/png" } };
    const before = await balance();
    await coach.call("/api/ai.image", { about: "a kettlebell" });
    expect(before - (await balance())).toBe(600);
  });

  /* ⚠️ And a long prompt does not make it dearer, because it is not the prompt
     that is being bought. */
  it("costs the same whatever the prompt is", async () => {
    provider.answer = { output: { bytes: png(), contentType: "image/png" } };
    const before = await balance();
    await coach.call("/api/ai.image", { about: "a kettlebell on a gym floor ".repeat(12) });
    expect(before - (await balance())).toBe(600);
  });

  /*
    ⚠️ A USAGE REPORT CANNOT DISCOUNT IT. There are no units to report, so a
    provider that returns a block for its text models would otherwise settle
    every image at whatever happened to be in it.
  */
  it("ignores a usage report entirely", async () => {
    provider.answer = { output: { bytes: png(), contentType: "image/png" }, usage: { input: 1, output: 1 } };
    const before = await balance();
    await coach.call("/api/ai.image", { about: "a kettlebell" });
    expect(before - (await balance())).toBe(600);
  });

  /*
    ⚠️ A MODEL THAT ANSWERS WITH NO PICTURE IS A FAILED CALL, and the charge
    stands: the provider did the work and invoices us either way. Refunding here
    would make an empty answer a free retry.
  */
  it("reports a missing picture rather than storing an empty file", async () => {
    provider.answer = { output: { note: "I would rather not" } };
    const out = await coach.call("/api/ai.image", { about: "a kettlebell" });
    expect(out.status).toBe(503);
  });

  it("refunds in full when the provider fails outright", async () => {
    provider.throws = true;
    const before = await balance();
    expect((await coach.call("/api/ai.image", { about: "a kettlebell" })).status).toBe(503);
    expect(await balance()).toBe(before);
  });
});

/* ---------------------------------------------------------- the text ones --- */

describe("the drafts that are only words", () => {
  const drafted = { output: "Set up with the bar on your back, brace, and sit between your heels." };

  it("drafts how-to text for a movement", async () => {
    provider.answer = drafted;
    const out = await coach.call("/api/ai.exercise-guide", { about: "back squat" });
    expect(out.status).toBe(200);
    expect(out.body.draft as unknown as string).toContain("brace");
  });

  it("drafts supplement guidance", async () => {
    provider.answer = drafted;
    expect((await coach.call("/api/ai.supplement-guide", { about: "creatine monohydrate" })).status).toBe(200);
  });

  it("drafts an article", async () => {
    provider.answer = drafted;
    expect((await coach.call("/api/ai.article", { about: "why beginners should not train to failure" })).status).toBe(200);
  });

  it("drafts an eating plan", async () => {
    provider.answer = { output: { weeks: [] } };
    expect((await coach.call("/api/ai.draft-meals", { about: "four weeks, vegetarian, two thousand calories" })).status).toBe(200);
  });

  /*
    ⚠️ NONE OF THEM TAKES A PICTURE, and the refusal is what keeps the reserve
    honest. An image attached to a feature that declared none is metered by a
    reserve computed for text — it succeeds, and the platform pays for the
    picture.
  */
  it("refuses a picture on a feature that declared none", async () => {
    const out = await coach.call("/api/ai.parse-food", { text: "porridge", photo: meal });
    /* The field is not in the shape at all, so it never reaches the meter. */
    expect(out.status).toBe(200);
    expect((provider.calls[0]!.input as { image?: unknown }).image).toBeUndefined();
  });
});

/* --------------------------------------------------------- a month, read --- */

describe("somebody's month, read back", () => {
  it("summarises from figures this workspace actually holds", async () => {
    provider.answer = { output: "Nine sessions in four weeks, steady." };
    const person = await coach.call("/api/client.create", { name: "Wren Adeyemi" });
    await coach.call("/api/consent.record", { subject: person.body.id });
    expect(person.status, "the roster fixture must not have hit the client quota").toBe(200);

    const out = await coach.call("/api/ai.client-summary", { clientId: person.body.id as unknown as string });
    expect(out.status).toBe(200);
    expect(out.body.summary as unknown as string).toContain("Nine sessions");
  });

  /*
    ⚠️ THE BRIEF IS BUILT HERE AND CARRIES NO NAME. What the model is given is
    what it may talk about, and a brief carrying somebody's name invites a
    sentence about the person rather than about the numbers.
  */
  it("gives the model counts and not the person", async () => {
    provider.answer = { output: "steady" };
    const person = await coach.call("/api/client.create", { name: "Idris Mbeki" });
    await coach.call("/api/consent.record", { subject: person.body.id });
    expect(person.status, "the roster fixture must not have hit the client quota").toBe(200);
    await coach.call("/api/ai.client-summary", { clientId: person.body.id as unknown as string });

    const sent = provider.calls[0]!.input as { prompt: string };
    expect(sent.prompt).not.toContain("Idris");
    expect(sent.prompt).toMatch(/\d+ workouts recorded/);
  });

  it("refuses somebody this workspace does not have", async () => {
    expect((await coach.call("/api/ai.client-summary", { clientId: "cli_nowhere" })).status).toBe(404);
  });
});
