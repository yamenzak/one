/**
 * ASKING A MODEL FOR SOMETHING, THROUGH THE REAL WORKER — and the meter it
 * cannot get round.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together.
 *
 * ⚠️ THE MODEL RUNNER IS ATTACHED TO THE ENVIRONMENT BY THIS TEST, and that is
 * the shape rather than a convenience. The platform has no mock lane: a
 * deployment with nothing bound refuses, and there is no configuration that
 * turns a refusal into an invented answer. A test that wants deterministic
 * output supplies the runner itself, exactly as production supplies a real one.
 *
 * The product this replaces had three ways to generate without metering — a
 * console switch, a missing binding, and a provider failure falling back — and
 * all three typechecked, passed every test, and fabricated output in production
 * while still charging for it.
 */

import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { joinAs, post, SETUP, signIn } from "./session.js";

const SLUG = "airedale";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

/* ------------------------------------------------------------- the runner --- */

/** What the attached runner answers next, and what it was asked. */
const provider: {
  answer: unknown;
  throws: boolean;
  calls: { model: string; system: string; prompt: string }[];
} = { answer: { output: { weeks: [] }, usage: { input: 100, output: 200 } }, throws: false, calls: [] };

const attach = () => {
  /* ⚠️ `AI`, because a binding's physical name is the SCREAMING form of its
     logical one — the same derivation a deployment config uses. */
  (env as Record<string, unknown>).AI = {
    async run(model: string, input: { system: string; prompt: string }) {
      provider.calls.push({ model, system: input.system, prompt: input.prompt });
      if (provider.throws) throw new Error("upstream");
      return provider.answer;
    },
  };
};

const detach = () => { delete (env as Record<string, unknown>).AI; };

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

/**
 * ⚠️ THE STORE DIRECTLY, because there is no route that mints credits yet — a
 * purchase is what will put them here, and it is not built. Reaching past the
 * surface is honest for a fixture standing in for one; it would not be for an
 * assertion.
 */
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
let coachCookie = "";
let tenantId = "";

beforeAll(async () => {
  attach();
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  tenantId = made.body.tenantId as string;
  expect(tenantId, "the studio fixture must have been created").toBeTruthy();
  coachCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  coach = as(coachCookie);
});

afterEach(() => {
  provider.throws = false;
  provider.answer = { output: { weeks: [] }, usage: { input: 100, output: 200 } };
});

/* ---------------------------------------------------------- unconfigured --- */

describe("a deployment with nothing bound to run a model", () => {
  /*
    ⚠️ IT REFUSES, AND IT NEVER INVENTS. This is the assertion the product this
    replaces would have failed: a missing binding fell through to a mock, so the
    feature kept "working" — including a lab-report reader that returned
    fabricated clinical values, and billed for them.
  */
  it("refuses, and takes nothing", async () => {
    detach();
    await fund(1_000_000);
    const before = await balance();
    const out = await coach("/api/ai.draft-plan", { brief: "four weeks for a beginner, twice a week" });
    expect(out.status).toBe(503);
    expect(await balance()).toBe(before);
    attach();
  });

  /*
    ⚠️ AND THE REST OF THE PRODUCT STILL WORKS, which is the half a refusal alone
    does not prove. A model runner is the one store a deployment may legitimately
    not have — a self-host, a region with no permitted sub-processor, anything
    before somebody has bought credits — so a missing one must cost the studio
    its generation and nothing else. Treated like a missing database it takes
    every route down with it, and the symptom is a whole workspace answering 503.
  */
  it("serves everything that is not generation", async () => {
    detach();
    expect((await coach("/api/programme.list")).status).toBe(200);
    expect((await coach("/api/client.list")).status).toBe(200);
    expect((await coach("/api/ai.spending")).status).toBe(200);
    attach();
  });
});

/* --------------------------------------------------------------- drafting --- */

describe("drafting a plan from a sentence", () => {
  it("sends exactly the declared system text, and charges what was reported", async () => {
    provider.calls.length = 0;
    const before = await balance();
    const out = await coach("/api/ai.draft-plan", { brief: "four weeks for a beginner, twice a week" });
    expect(out.status).toBe(200);

    /* 100 × 1 + 200 × 4 = 900, at the catalogue's rate for this model. */
    expect(Number(out.body.charged)).toBe(900);
    expect(await balance()).toBe(before - 900);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.model).toBe("gemini-2.5-flash");
    /* ⚠️ The manifest's text, not the handler's — a reserve is computed from it. */
    expect(provider.calls[0]!.system).toContain("You draft strength-training programmes");
    expect(provider.calls[0]!.prompt).toContain("four weeks");
  });

  /*
    ⚠️ A DRAFT IS A DRAFT. Nothing is written: the answer comes back for a person
    to read, edit and save through the ordinary surface. A generated row saved
    straight into somebody's programme is a plan nobody approved, arriving under
    a coach's name.
  */
  it("writes no programme", async () => {
    const before = ((await coach("/api/programme.list")).body.rows as unknown as unknown[]).length;
    await coach("/api/ai.draft-plan", { brief: "a strength block for somebody returning" });
    expect(((await coach("/api/programme.list")).body.rows as unknown as unknown[]).length).toBe(before);
  });

  it("refuses a brief too short to be one", async () => {
    expect((await coach("/api/ai.draft-plan", { brief: "hi" })).status).toBe(400);
  });

  /*
    ⚠️ A FAILED RUN IS REFUNDED IN FULL, because the workspace has no output. A
    provider that failed after doing work is the provider's problem with us, not
    ours with the studio.
  */
  it("gives the credits back when the provider fails", async () => {
    provider.throws = true;
    const before = await balance();
    const out = await coach("/api/ai.draft-plan", { brief: "four weeks for a beginner, twice a week" });
    expect(out.status).toBe(503);
    expect(await balance()).toBe(before);
  });

  /*
    ⚠️ A MISSING USAGE REPORT SETTLES AT THE RESERVE, NEVER AT A RECOUNT. A
    recount can only ever come in low — the cap catches the other direction — so
    it would turn every unreported call into a discount, silently, on every call.
  */
  it("charges the whole reserve when the provider reports no usage", async () => {
    provider.answer = { output: { weeks: [] } };
    const before = await balance();
    await coach("/api/ai.draft-plan", { brief: "four weeks for a beginner, twice a week" });
    /* The reserve is the output ceiling at the catalogue rate, so far above 900. */
    expect(before - (await balance())).toBeGreaterThan(4_000 * 4);
  });
});

/* --------------------------------------------------------------- spending --- */

describe("what the credits went on", () => {
  /*
    ⚠️ A BALANCE THAT ONLY GOES DOWN, WITH NOTHING TO READ, IS THE SAME SILENCE
    AS AN UNREAD RUN TABLE — and "what was this spent on" is the first question
    anybody asks the day a number looks wrong.
  */
  it("lists every generation with what it cost, for the owner", async () => {
    const out = await coach("/api/ai.spending");
    expect(out.status).toBe(200);
    const spends = out.body.spends as unknown as { feature: string; charged: number; verdict: string | null }[];
    expect(spends.length).toBeGreaterThan(0);
    expect(spends.every((sp) => sp.feature === "draft-plan")).toBe(true);
    expect(Number(out.body.balance)).toBe(await balance());
  });

  /*
    ⚠️ INCLUDING THE ONES THAT FAILED, at zero. A table holding only successes
    answers "why was I charged" and none of "why did this stop working" — and it
    makes the daily ceiling something a failing provider lets somebody loop past.
  */
  it("includes the attempt that failed, charged nothing", async () => {
    const spends = (await coach("/api/ai.spending")).body.spends as unknown as { charged: number }[];
    expect(spends.some((sp) => sp.charged === 0)).toBe(true);
  });

  /*
    ⚠️ THE ONLY WAY A MODEL CHOICE IS EVER REVISITED. Without somewhere to say
    "this was wrong", the only signal a catalogue gets is that people quietly
    stop using a feature — which reads, in every metric, as one nobody wanted.
  */
  it("records that a generation was wrong, against the generation", async () => {
    const made = await coach("/api/ai.draft-plan", { brief: "four weeks for a beginner, twice a week" });
    const said = await coach("/api/ai.feedback", { id: made.body.generation, verdict: "wrong", note: "invented a movement" });
    expect(said.status).toBe(200);

    const spends = (await coach("/api/ai.spending")).body.spends as unknown as { id: string; verdict: string | null }[];
    expect(spends.find((sp) => sp.id === (made.body.generation as unknown as string))!.verdict).toBe("wrong");
  });

  it("refuses feedback on a generation that is not this studio's", async () => {
    expect((await coach("/api/ai.feedback", { id: "gen_elsewhere", verdict: "wrong" })).status).toBe(404);
  });
});

/* ---------------------------------------------------------------- clients --- */

describe("who may spend a studio's credits", () => {
  /*
    ⚠️ THE PERMISSION IS THE PRODUCT'S, NOT THE PLATFORM'S. Drafting a plan is a
    coach's act, so it carries `programme:write` — and a client holding none of
    it cannot spend the studio's balance on it however the surface is navigated.
  */
  it("refuses a client the draft surface entirely", async () => {
    const them = as(await joinAs(STUDIO, coachCookie, "ro@airedale.example.test", "client"));
    expect((await them("/api/ai.draft-plan", { brief: "a plan for me, four weeks, twice a week" })).status).toBe(403);
  });

  /*
    ⚠️ AND WHAT THE STUDIO'S CREDITS WENT ON IS THE OWNER'S QUESTION. It is the
    bill, and a client reading a studio's spending is reading a colleague's work
    and a business's costs.
  */
  it("refuses a client the spending trail", async () => {
    const them = as(await joinAs(STUDIO, coachCookie, "ro@airedale.example.test", "client"));
    expect((await them("/api/ai.spending")).status).toBe(403);
  });

  /*
    ⚠️ A CLIENT'S OWN FEATURE IS GATED ON WHAT THEY BOUGHT. Describing a meal in
    words is the nutrition surface — a client whose package does not include
    eating must not be able to spend the studio's credits on it.

    ⚠️ AND THE MEMBERSHIP HAS TO NAME THE RECORD. Being invited as a client makes
    somebody a member; naming the record they ARE is what makes them a customer,
    and a caller who is not a customer is staff as far as the second rail is
    concerned — which would skip this gate entirely.
  */
  it("refuses a client whose package does not include eating", async () => {
    const record = await coach("/api/client.create", { name: "Tam Okonjo" });
    expect(record.status, "the roster fixture must not have hit the client quota").toBe(200);
    await coach("/api/member.invite", { email: "tam@airedale.example.test", role: "client", subjectId: record.body.id });
    const them = as(await signIn("tam@airedale.example.test", STUDIO));

    const out = await them("/api/ai.parse-food", { text: "two eggs and a slice of toast" });
    expect(out.status).toBe(403);

    /*
      ⚠️ AND THE SAME PERSON, WITH EATING BOUGHT, IS ALLOWED — which is what
      makes the refusal above the customer flag rather than the permission. The
      two are the same status on the wire, so a fixture that only asserted the
      refusal would pass against an operation carrying no flag at all.
    */
    await coach("/api/commerce.package.save", {
      id: "eating", name: "Nutrition", price: { minor: 8_000, currency: "USD" },
      flags: { nutrition: true }, budgets: { nutrition: 30 }, oncePerCustomer: false,
    });
    await coach("/api/commerce.grant", { subjectId: record.body.id, packageId: "eating" });

    provider.answer = { output: { foods: [] }, usage: { input: 10, output: 10 } };
    expect((await them("/api/ai.parse-food", { text: "two eggs and a slice of toast" })).status).toBe(200);
  });

  /*
    ⚠️ AND A COACH IS NOT ONE OF THEIR CLIENT'S CUSTOMERS. A customer flag
    withholds from customers; defaulting an absent set to "refused" would
    withhold the product from the only person paying for it.
  */
  it("does not withhold it from the studio itself", async () => {
    provider.answer = { output: { foods: [] }, usage: { input: 10, output: 10 } };
    expect((await coach("/api/ai.parse-food", { text: "two eggs and a slice of toast" })).status).toBe(200);
  });
});
