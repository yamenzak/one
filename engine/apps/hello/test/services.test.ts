/**
 * THE WORK THAT LEAVES THE REQUEST PATH, AND THE INBOX THAT PROVES IT ARRIVED.
 *
 * ⚠️ STAGE 7'S EXIT CRITERION IS "OFF THE HOT PATH AND THE SEAM IS TYPED", and
 * the half that actually bites is the other one: a notification system with no
 * inbox. A previous platform had the schema, the Durable Object, the routes, the
 * registry and sixteen dispatch sites — and nowhere a person could look, for
 * three stages, with every suite green.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PLATFORM_ROLES, type Channel, type ModelRow, type TenantId } from "@engine/kernel";
import {
  DIRECTORY_MODULES, SHARD_MODULES,
  BILLING_SCHEMA, DIRECTORY_SCHEMA, IDENTITY_SCHEMA, INBOX_SCHEMA, MEMBERSHIP_SCHEMA,
  addShard, applySchema, audienceFor, createTenant, fileNote, found, inboxOf,
  markSeen, noteShardApp, openAccount, invite, setPolicy, setPreference, unseenCount,
  MOCK_ALLOWED, availableChannels, generate, mockProvider, tell, type Db, type Provider,
  topUp, walletOf,
  type PushNote,
} from "@engine/runtime";
import { HELLO } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;
const shard = () => env.SHARD_EU_2 as unknown as Db;

let tenantId = "" as TenantId;
const EVERY: readonly Channel[] = ["inbox", "email", "push"];

const MODELS: ModelRow[] = [
  { id: "@cf/meta/small", provider: "cf", task: "text-generation", label: "Small",
    input: 1, output: 3, markup: 0.5, enabled: true, isDefault: true, maxOutput: 1000 },
];

beforeAll(async () => {
  await applySchema(directory(), DIRECTORY_MODULES);
  await applySchema(shard(), [MEMBERSHIP_SCHEMA, INBOX_SCHEMA]);
  await addShard(directory(), "eu-2", "eu", 100);
  await noteShardApp(directory(), "eu-2", "hello");
});

beforeEach(async () => {
  for (const t of ["inbox", "notify_policy", "notify_preference", "membership"]) {
    await shard().exec(`DELETE FROM ${t};`);
  }
  for (const t of ["credit_ledger", "billing_account", "subscription", "tenant_app", "tenant"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  /* ⚠️ Its own slug: three suites, one database — see serve.test.ts. */
  const made = await createTenant(directory(), {
    slug: "southwind", name: "Southwind", country: "DE", where: "eu", apps: ["hello"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;
  await openAccount(directory(), tenantId);
});

const roster = async () => {
  await found(shard(), tenantId, "acc_owner" as never, "sam@example.com", { hello: "writer" });
  await invite(shard(), tenantId,
    { email: "alex@example.com", platformRole: "customer", appRoles: { hello: "reader" } },
    { platform: new Set(PLATFORM_ROLES.owner), inApp: async () => new Set(HELLO.access.roles.writer ?? []) },
    async () => HELLO.access.roles, { counts: ["owner", "manager", "staff"], allowed: -1 });
  /* The invited person has signed in, so they have an account. */
  await shard().prepare(`UPDATE membership SET account_id = 'acc_alex', accepted_at = ? WHERE email = ?`)
    .bind(new Date().toISOString(), "alex@example.com").run();
};

/* ------------------------------------------------------------------ inbox --- */

describe("being told something", () => {
  const dispatch = {
    type: "note.published", tenantId: "" as TenantId,
    values: { who: "Sam", title: "Q3 plan" },
  };

  /*
    ⚠️ THE AUDIENCE IS A PERMISSION, RESOLVED AGAINST THE ROSTER. `note.published`
    needs `note:read`, which both roles here hold — and a workspace's own role
    would be included too, without the notification knowing it exists.
  */
  it("reaches everybody who holds the key, and files a row for each", async () => {
    await roster();
    const told = await audienceFor(shard(), HELLO.notifications ?? {}, "hello", HELLO.access.roles,
      { ...dispatch, tenantId }, EVERY);
    expect(told.map((t) => t.email).sort()).toEqual(["alex@example.com", "sam@example.com"]);

    await fileNote(shard(), HELLO.notifications ?? {}, { ...dispatch, tenantId }, told);
    expect(await unseenCount(shard(), tenantId, "acc_alex")).toBe(1);

    const mine = await inboxOf(shard(), tenantId, "acc_alex");
    /* ⚠️ The values ARE the sentence: raised without them it renders "{who}". */
    expect(mine[0]!.title).toBe("Sam published Q3 plan");
    expect(mine[0]!.link).toBe("/");
  });

  /* ⚠️ Nobody is told about their own action. "You published Q3 plan" in your own
     inbox is noise, and enough of it teaches people to stop opening the bell. */
  it("does not tell somebody about what they just did", async () => {
    await roster();
    const told = await audienceFor(shard(), HELLO.notifications ?? {}, "hello", HELLO.access.roles,
      { ...dispatch, tenantId, except: "acc_alex" }, EVERY);
    expect(told.map((t) => t.accountId)).toEqual(["acc_owner"]);
  });

  /*
    ⚠️ THE INBOX SURVIVES EVERY NARROWING. Email and push are interruptions a
    person may refuse; the inbox is the record, and somebody who muted everything
    still needs somewhere to find what happened.
  */
  it("still files the row when every interruption is switched off", async () => {
    await roster();
    await setPreference(shard(), tenantId, "acc_alex", "note.published", []);
    const told = await audienceFor(shard(), HELLO.notifications ?? {}, "hello", HELLO.access.roles,
      { ...dispatch, tenantId }, EVERY);
    const alex = told.find((t) => t.accountId === "acc_alex");
    expect(alex?.channels).toEqual(["inbox"]);

    await fileNote(shard(), HELLO.notifications ?? {}, { ...dispatch, tenantId }, told);
    expect(await unseenCount(shard(), tenantId, "acc_alex")).toBe(1);
  });

  /* ⚠️ A person narrows the workspace's ceiling and can never widen past it. */
  it("refuses to let a person want more than the workspace allows", async () => {
    await roster();
    await setPolicy(shard(), tenantId, "note.published", ["inbox"]);
    await setPreference(shard(), tenantId, "acc_alex", "note.published", ["inbox", "email", "push"]);
    const told = await audienceFor(shard(), HELLO.notifications ?? {}, "hello", HELLO.access.roles,
      { ...dispatch, tenantId }, EVERY);
    expect(told.find((t) => t.accountId === "acc_alex")?.channels).toEqual(["inbox"]);
  });

  /* ⚠️ And a channel this deployment cannot deliver is never chosen — a send
     into a swallowed catch looks delivered. */
  it("offers only what the deployment can actually deliver", async () => {
    await roster();
    const told = await audienceFor(shard(), HELLO.notifications ?? {}, "hello", HELLO.access.roles,
      { ...dispatch, tenantId }, ["inbox", "email"]);
    expect(told[0]!.channels).not.toContain("push");

    expect(await availableChannels({})).toEqual(["inbox"]);
    expect(await availableChannels({ mailer: { async send() {} } })).toEqual(["inbox", "email"]);

    /* ⚠️ AND THE PUSH HALF, because the literal `["inbox"]` this replaced sat in
       `serve.ts` under a note calling it temporary, and survived the stage that
       made it wrong — every device subscribed, stored, and never sent to. */
    expect(await availableChannels({
      pusher: { async live() { return true; }, async push() {} },
    })).toEqual(["inbox", "push"]);

    /*
      ⚠️ AND A BOUND LANE WITH NO KEYPAIR IS NOT A CHANNEL. The deployment binds
      the pusher unconditionally — the keypair is made from the console while the
      worker runs — so "is it wired" and "can it send" are different questions,
      and offering the switch on the first is a person waiting for a notification
      nothing attempted.
    */
    expect(await availableChannels({
      pusher: { async live() { return false; }, async push() {} },
    })).toEqual(["inbox"]);
  });

  it("marks one as read, and then all of them", async () => {
    await roster();
    const told = await audienceFor(shard(), HELLO.notifications ?? {}, "hello", HELLO.access.roles,
      { ...dispatch, tenantId }, EVERY);
    await fileNote(shard(), HELLO.notifications ?? {}, { ...dispatch, tenantId }, told);
    await fileNote(shard(), HELLO.notifications ?? {}, { ...dispatch, tenantId }, told);
    expect(await unseenCount(shard(), tenantId, "acc_alex")).toBe(2);

    const mine = await inboxOf(shard(), tenantId, "acc_alex");
    await markSeen(shard(), tenantId, "acc_alex", mine[0]!.id);
    expect(await unseenCount(shard(), tenantId, "acc_alex")).toBe(1);
    await markSeen(shard(), tenantId, "acc_alex", null);
    expect(await unseenCount(shard(), tenantId, "acc_alex")).toBe(0);
  });

  /* ⚠️ One person's inbox is one person's. A workspace filter without the
     account is somebody reading everybody's notifications. */
  it("never shows one person another person's inbox", async () => {
    await roster();
    const told = await audienceFor(shard(), HELLO.notifications ?? {}, "hello", HELLO.access.roles,
      { ...dispatch, tenantId, except: "acc_alex" }, EVERY);
    await fileNote(shard(), HELLO.notifications ?? {}, { ...dispatch, tenantId }, told);
    expect(await inboxOf(shard(), tenantId, "acc_alex")).toHaveLength(0);
    expect(await inboxOf(shard(), tenantId, "acc_owner")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------ leaving here --- */

/**
 * ⚠️ THE INBOX IS THE RECORD AND PUSH IS THE INTERRUPTION, AND THE SECOND ONE
 * HAD NO CALLER. `tell` filed rows and dispatched nothing further for as long as
 * `serve.ts` passed a literal `["inbox"]` — so a device could be subscribed,
 * stored, counted on the console screen and never sent to, with every suite
 * green. That is what this describe exists to make impossible.
 */
describe("a note that leaves the process", () => {
  const sent: PushNote[] = [];
  const pusher = {
    async live() { return true; },
    async push(_accountId: string, note: PushNote) { sent.push(note); },
  };

  const raise = (type: string) => ({
    app: HELLO, tenantId, events: [type],
    input: {}, answer: { title: "Q3 plan" },
    actor: null, actorName: "Sam",
    channels: EVERY,
  });

  beforeEach(() => { sent.length = 0; });

  /*
    ⚠️ `note.published` DECLARES `["inbox", "email"]` AND `note.review_asked`
    DECLARES PUSH, so the type's own narrowing is the thing being read. A test
    against a book where every type offers everything proves the wiring and not
    the rule.
  */
  it("sends only what the notification type offers a channel for", async () => {
    await roster();
    await tell(shard(), { ...raise("note.published"), pusher });
    expect(sent, "a type that does not offer push was pushed anyway").toHaveLength(0);

    await tell(shard(), { ...raise("note.review_asked"), pusher });
    expect(sent.map((n) => n.title)).toEqual([
      "Sam asked you to look at Q3 plan", "Sam asked you to look at Q3 plan",
    ]);
    /* ⚠️ THE WORKSPACE TRAVELS WITH IT, because it decides which devices may
       carry the note — see `push.ts`. Without it a business's notification lands
       on a device wearing another business's logo. */
    expect(sent[0]!.tenantId).toBe(tenantId);
    expect(sent[0]!.link).toBe("/");
  });

  /* ⚠️ A PERSON WHO SWITCHED PUSH OFF IS NOT PUSHED, and the row is still filed.
     `channelsFor` has already decided; this reads that decision rather than
     making a second one. */
  it("respects somebody who turned push off for themselves", async () => {
    await roster();
    await setPreference(shard(), tenantId, "acc_alex", "note.review_asked", ["inbox", "email"]);

    await tell(shard(), { ...raise("note.review_asked"), pusher });
    expect(sent).toHaveLength(1);
    expect(await unseenCount(shard(), tenantId, "acc_alex")).toBe(1);
  });

  /* ⚠️ AND WITH NO PUSHER WIRED NOTHING IS ATTEMPTED. A deployment without one is
     ordinary, and it must lose the interruption rather than the record. */
  it("still files the record on a deployment that cannot push", async () => {
    await roster();
    expect(await tell(shard(), raise("note.review_asked"))).toBe(2);
    expect(sent).toHaveLength(0);
    expect(await unseenCount(shard(), tenantId, "acc_alex")).toBe(1);
  });
});

/* --------------------------------------------------------------------- ai --- */

describe("generating something and charging for it", () => {
  const deps = (provider: Provider, environment = "development") => ({
    directory: directory(), models: async () => MODELS, provider, environment,
  });

  const ask = () => ({
    tenantId, appId: "hello", lane: "text" as const,
    system: "S".repeat(2000), prompt: "write me a note", maxOutput: 500,
  });

  /*
    ⚠️ RESERVE → RUN → SETTLE, AND THE RESERVE IS A CEILING. What is charged is
    min(held, actual), so an estimate that under-counts costs the platform rather
    than the customer — silently, on every call.
  */
  it("charges what the provider reported, never more than was held", async () => {
    await topUp(directory(), tenantId, 10_000);
    const out = await generate(deps({
      async run() { return { text: "here you are", usage: { input: 600, output: 120 } }; },
    }), ask());
    expect(out).not.toBe("no_model");
    if (typeof out === "string") return;
    expect(out.text).toBe("here you are");
    expect(out.charged).toBeGreaterThan(0);
    expect((await walletOf(directory(), tenantId)).held).toBe(0);
  });

  /* ⚠️ A missing usage report falls back to the reserve — a recount can only
     ever charge less than the truth, because of the cap. */
  it("charges the reserve when the provider reports nothing", async () => {
    await topUp(directory(), tenantId, 10_000);
    const out = await generate(deps({
      async run() { return { text: "x", usage: null }; },
    }), ask());
    if (typeof out === "string") return;
    /* The system prompt is 2,000 characters, so the reserve is far from trivial —
       budgeting for the user's text alone would under-count every single call. */
    expect(out.charged).toBeGreaterThan(1);
  });

  /*
    ⚠️ A FAILURE RELEASES THE HOLD. A provider that times out with the credits
    still held is a customer whose balance shrank and who got nothing.
  */
  it("gives the credits back when the provider fails", async () => {
    await topUp(directory(), tenantId, 10_000);
    const out = await generate(deps({
      async run() { throw new Error("upstream timeout"); },
    }), ask());
    expect(out).toBe("provider_failed");
    const wallet = await walletOf(directory(), tenantId);
    expect(wallet).toMatchObject({ balance: 10_000, held: 0 });
  });

  it("refuses before calling anything when there is nothing to spend", async () => {
    let called = false;
    const out = await generate(deps({
      async run() { called = true; return { text: "", usage: null }; },
    }), ask());
    expect(out).toBe("not_enough_credits");
    expect(called).toBe(false);
  });

  it("refuses a lane no enabled model answers", async () => {
    await topUp(directory(), tenantId, 10_000);
    const out = await generate({
      ...deps({ async run() { return { text: "", usage: null }; } }),
      models: async () => [],
    }, ask());
    expect(out).toBe("no_model");
  });

  /*
    ⚠️ THE MOCK IS DEVELOPMENT-ONLY, STRUCTURALLY. A mock that can be switched on
    from a console fabricates output in production — including numbers somebody
    will act on — and bills for it. A previous platform shipped three such paths,
    all of which typechecked and passed every test, because the suites run where
    mocking is correct.
  */
  it("will not fabricate output outside development", async () => {
    expect(MOCK_ALLOWED("development")).toBe(true);
    expect(MOCK_ALLOWED("production")).toBe(false);

    await topUp(directory(), tenantId, 10_000);
    const inProd = await generate(deps(mockProvider("production"), "production"), ask());
    expect(inProd).toBe("provider_failed");
    /* ⚠️ And nothing was charged for the output it refused to invent. */
    expect((await walletOf(directory(), tenantId)).balance).toBe(10_000);

    const inDev = await generate(deps(mockProvider("development")), ask());
    expect(typeof inDev).not.toBe("string");
  });
});
