/**
 * WHAT A STUDIO SELLS ITS OWN CLIENTS — version 0.6, and the second rail
 * carrying weight for the first time.
 *
 * ⚠️ TWO RAILS, NEVER MERGED, AND A PERSON'S REAL CAPABILITY IS THE
 * INTERSECTION. `training` here is what a CLIENT bought from their studio;
 * `training` in the plan catalogue is what the STUDIO bought from us. They share
 * a word because they are one feature seen from two sides, and every failure
 * this suite pins comes from treating them as one thing or as unrelated things.
 *
 * ⚠️ AND THE SHARPEST ASSERTION HERE IS ABOUT WHO IS *NOT* GATED. A customer
 * flag withholds from customers; a coach is not one of their client's customers,
 * and a gate that defaulted an absent set to "refused" withheld the product from
 * the only person paying for it.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "harlow";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const as = (cookie: string) => async (path: string, body?: unknown) => {
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

type Flags = Record<string, { value: boolean; source: string; blockedBy?: string | null }>;
type Capabilities = { flags: Flags; runway: { overall: number; byScope: Record<string, number> } };

let coach: ReturnType<typeof as>;
let ro = "";
let client: ReturnType<typeof as>;

const capabilities = async (who: string) =>
  (await coach(`/api/commerce.capabilities?subjectId=${who}`)).body as unknown as Capabilities;

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  coach = as(await signIn(`${SLUG}@example.test`, STUDIO));

  ro = (await coach("/api/client.create", { name: "Ro" })).body.id as unknown as string;

  await coach("/api/consent.record", { subject: ro });
  /* ⚠️ The membership NAMES the record, which is what makes them a customer. */
  await coach("/api/member.invite", { email: "ro@harlow.example.test", role: "client", subjectId: ro });
  client = as(await signIn("ro@harlow.example.test", STUDIO));

  await coach("/api/commerce.package.save", {
    id: "full", name: "Coaching + nutrition", price: { minor: 12_000, currency: "USD" },
    flags: { training: true, nutrition: true, checkins: true, progress: true },
    budgets: { coaching: 30, nutrition: 30 }, oncePerCustomer: false,
  });
  await coach("/api/commerce.package.save", {
    id: "training-only", name: "Training only", price: { minor: 8_000, currency: "USD" },
    flags: { training: true, progress: true },
    budgets: { coaching: 30 }, oncePerCustomer: false,
  });
});

/* ------------------------------------------------------- holding nothing --- */

describe("a client who has bought nothing", () => {
  /*
    ⚠️ THE PARKING STATE IS OFF FOR EVERY SOLD CAPABILITY. Somebody a studio
    added but has not sold anything to may look around and may not record
    against a package they do not have.
  */
  it("may read, and may not write what is sold", async () => {
    expect((await client("/api/programme.list")).status).toBe(200);
    expect((await client("/api/workout.list")).status).toBe(200);
    expect((await client("/api/workout.create", { client: ro, day: "2026-08-01" })).status).toBe(403);
    expect((await client("/api/portion.create", { client: ro, day: "2026-08-01", meal: "lunch", food: "f", amount: 1 })).status).toBe(403);
  });

  /*
    ⚠️ AND THE COACH IS NOT GATED BY IT AT ALL. This is the assertion the gate
    used to fail: an absent customer set meant "refused", so the studio paying
    for the product was the one it was withheld from, while the client it was
    written for sailed through on a set that happened to exist.
  */
  it("does not withhold anything from the studio's own staff", async () => {
    const made = await coach("/api/workout.create", { client: ro, day: "2026-08-02" });
    expect(made.status).toBe(200);
    expect((await coach("/api/checkin.create", { client: ro, since: "2026-08-01", until: "2026-08-07", howItWent: "ok" })).status).toBe(200);
  });

  it("reports every sold capability as off, and says what it is waiting on", async () => {
    const caps = await capabilities(ro);
    expect(caps.flags.training!.value).toBe(false);
    expect(caps.runway.overall).toBe(0);
  });
});

/* ------------------------------------------------------------ a package --- */

describe("granting a package turns the capability on", () => {
  it("adds the days and the flags together", async () => {
    const granted = await coach("/api/commerce.grant", { subjectId: ro, packageId: "full" });
    expect(granted.status).toBe(200);
    expect(granted.body.daysAdded).toBe(60);

    const caps = await capabilities(ro);
    expect(caps.flags.training!.value).toBe(true);
    expect(caps.flags.nutrition!.value).toBe(true);
    expect(caps.runway.byScope).toMatchObject({ coaching: 30, nutrition: 30 });
  });

  it("lets the client record against what they bought", async () => {
    const made = await client("/api/workout.create", { client: ro, day: "2026-08-03" });
    expect(made.status).toBe(200);
    expect((await client("/api/checkin.create", { client: ro, since: "2026-08-01", until: "2026-08-07", howItWent: "Good week" })).status).toBe(200);
  });

  /*
    ⚠️ A REPEAT PURCHASE QUEUES, IT DOES NOT RESTART. Buying thirty days on day
    ten of an existing thirty leaves fifty to run — extending from today throws
    away what was already paid for, and summing the remainders drifts every time
    a boundary is crossed.
  */
  it("queues a second purchase onto what is already running", async () => {
    const before = (await capabilities(ro)).runway.byScope.coaching!;
    await coach("/api/commerce.grant", { subjectId: ro, packageId: "training-only" });
    expect((await capabilities(ro)).runway.byScope.coaching).toBe(before + 30);
  });

  /* ⚠️ The ledger, not the live row — which only ever remembers what opened it. */
  it("records what was actually given, in order", async () => {
    const history = ((await coach(`/api/commerce.history?subjectId=${ro}`)).body as unknown as
      { grants: { packageId: string }[] }).grants;
    expect(history.map((g) => g.packageId).sort()).toEqual(["full", "training-only"]);
  });
});

/* ------------------------------------------------------------ the report --- */

describe("a report withholds a lens rather than refusing the whole thing", () => {
  /*
    ⚠️ REFUSING WOULD TAKE THE UNGATED HALVES DOWN WITH THE SOLD ONE, and a
    quietly thinner payload would make "withheld" and "empty" the same answer.
    `included` beside the answer is what makes them different.
  */
  it("tells the caller which lenses are in the answer", async () => {
    const out = (await coach(`/api/client.report?clientId=${ro}`)).body as unknown as
      { included: Record<string, boolean>; body: unknown };
    expect(out.included).toEqual({ body: true, training: true, nutrition: true });
    expect(out.body).not.toBeNull();
  });

  it("withholds the lenses a client did not buy, and says so", async () => {
    /* Take the sold report capability away from this one person. */
    expect((await coach("/api/commerce.override", { subjectId: ro, changes: { progress: false } })).status).toBe(200);

    const out = (await client(`/api/client.report?clientId=${ro}`)).body as unknown as
      { included: Record<string, boolean>; body: unknown; training: unknown };
    expect(out.included).toEqual({ body: false, training: false, nutrition: false });
    expect(out.body).toBeNull();
    expect(out.training).toBeNull();
  });

  /*
    ⚠️ AND THE EXCEPTION IS A DIFF: `null` puts them back on the package, and
    REMOVES the key rather than storing a null beside it. The resolver reads a
    stored null as "no exception", so the two are identical to the gate — and a
    workspace's list of the people it has made exceptions for then grows forever
    with entries that mean nothing.
  */
  it("puts them back on the package when the exception is cleared", async () => {
    const set = (await coach("/api/commerce.override", { subjectId: ro, changes: { progress: false } })).body;
    expect(set.exceptions).toEqual({ progress: false });

    const cleared = await coach("/api/commerce.override", { subjectId: ro, changes: { progress: null } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.exceptions).toEqual({});

    const out = (await client(`/api/client.report?clientId=${ro}`)).body as unknown as { included: Record<string, boolean> };
    expect(out.included.body).toBe(true);
  });

  it("refuses an exception for something the studio does not sell", async () => {
    const bad = await coach("/api/commerce.override", { subjectId: ro, changes: { telepathy: true } });
    expect(bad.status).toBe(400);
    expect(bad.body.meta).toMatchObject({ field: "changes" });
  });
});

/* --------------------------------------------------------------- repair --- */

describe("correcting somebody's days by hand", () => {
  /*
    ⚠️ THE ONE WRITE IN THIS ECONOMY WITH NO PRICE BEHIND IT, and it is separate
    from a grant on purpose: a repair is not a purchase and must not appear in
    the ledger as one, or "what have they bought from us" stops being answerable.
  */
  it("sets what is left, with a reason, without inventing a purchase", async () => {
    const before = ((await coach(`/api/commerce.history?subjectId=${ro}`)).body as unknown as { grants: unknown[] }).grants.length;

    const fixed = await coach("/api/commerce.days", {
      subjectId: ro, scope: "nutrition", days: 5, reason: "Refunded three weeks after a shoulder injury",
    });
    expect(fixed.status).toBe(200);
    expect((await capabilities(ro)).runway.byScope.nutrition).toBe(5);

    const after = ((await coach(`/api/commerce.history?subjectId=${ro}`)).body as unknown as { grants: unknown[] }).grants.length;
    expect(after).toBe(before);
  });

  it("refuses a reason nobody wrote", async () => {
    const bad = await coach("/api/commerce.days", { subjectId: ro, scope: "nutrition", days: 5, reason: "" });
    expect(bad.status).toBe(400);
  });

  /*
    ⚠️ A SCOPE NOTHING GATES BUYS NOTHING AND STILL COUNTS DOWN. The declared
    flags are where scopes come from, so a typo is days somebody paid attention
    to and nobody can spend.
  */
  it("refuses a scope no capability is gated on", async () => {
    const bad = await coach("/api/commerce.days", { subjectId: ro, scope: "coachng", days: 5, reason: "typo" });
    expect(bad.status).toBe(400);
    expect(bad.body.meta).toMatchObject({ field: "scope" });
  });

  /*
    ⚠️ ZERO ENDS THE SCOPE RATHER THAN REMOVING IT. "They have none left" and
    "they never had this" are different facts, and a screen that cannot tell them
    apart shows a lapsed client as one who never bought anything.
  */
  it("ends a scope at zero without pretending it never existed", async () => {
    await coach("/api/commerce.days", { subjectId: ro, scope: "nutrition", days: 0, reason: "Ended at their request" });
    const caps = await capabilities(ro);
    expect(caps.runway.byScope.nutrition).toBe(0);
    expect(caps.flags.nutrition!.value).toBe(false);
    /* And what they logged while they held it is still theirs to read. */
    expect((await client("/api/portion.list")).status).toBe(200);
  });
});

/* ------------------------------------------------------------ attention --- */

describe("access running out reaches the coach's list", () => {
  /*
    ⚠️ THE ONE REASON ON THAT LIST A COACH CAN ACT ON BEFORE IT HAPPENS. Every
    other reason there is already true of somebody; this one is the only warning.
  */
  it("names somebody whose soonest scope is nearly done", async () => {
    const ending = (await coach("/api/client.create", { name: "Ending" })).body.id as unknown as string;
    await coach("/api/consent.record", { subject: ending });
    /*
      ⚠️ TWO SCOPES OF DIFFERENT LENGTHS, because that is the only arrangement
      that tells the two runway numbers apart. The headline is a MAXIMUM — the
      right number to show the person themselves — and reading it here would say
      somebody with ninety days of training and three of nutrition is fine.
    */
    await coach("/api/commerce.days", { subjectId: ending, scope: "coaching", days: 90, reason: "Long block" });
    await coach("/api/commerce.days", { subjectId: ending, scope: "nutrition", days: 3, reason: "Trial add-on" });
    /* Trained yesterday, so silence cannot be what puts them on the list. */
    const made = await coach("/api/workout.create", { client: ending, day: new Date().toISOString().slice(0, 10) });
    await coach("/api/workout.submit", { id: made.body.id as unknown as string });

    const rows = ((await coach("/api/coach.attention")).body as unknown as
      { rows: { who: { name: string }; watches: { reason: string; days: number }[] }[] }).rows;
    const row = rows.find((r) => r.who.name === "Ending")!;
    expect(row.watches.map((w) => w.reason)).toEqual(["ending"]);
    expect(row.watches[0]!.days).toBe(3);
  });

  /*
    ⚠️ AND SOMEBODY WHO HOLDS NOTHING IS NOT "ENDING". They have no expiry to
    warn about, and counting them as zero days left would put every client who
    never bought anything at the top of the list — which is the fastest way to
    teach a coach to stop opening it.
  */
  it("does not warn about an expiry somebody does not have", async () => {
    const never = (await coach("/api/client.create", { name: "Nothing bought" })).body.id as unknown as string;
    await coach("/api/consent.record", { subject: never });
    const made = await coach("/api/workout.create", { client: never, day: new Date().toISOString().slice(0, 10) });
    await coach("/api/workout.submit", { id: made.body.id as unknown as string });

    const rows = ((await coach("/api/coach.attention")).body as unknown as
      { rows: { who: { name: string } }[] }).rows;
    expect(rows.some((r) => r.who.name === "Nothing bought")).toBe(false);
  });
});

/* ------------------------------------------------------------ row scope --- */

describe("a client may ask about themselves and nobody else", () => {
  /*
    ⚠️ ITS OWN STUDIO, because the entry plan allows three clients and the blocks
    above spend them. A fixture that quietly hit the quota would make every
    assertion here pass on an undefined id — which is the shape of test that
    reports a security rule as working when nothing was ever asked.
  */
  const ROW = "https://kilnsey.kova.4dl.app";
  const at = (cookie: string) => async (path: string, body?: unknown) => {
    const res = await worker.fetch(
      new Request(`${ROW}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  };

  let boss: ReturnType<typeof at>;
  let mine: ReturnType<typeof at>;
  let me = "";
  let them = "";

  beforeAll(async () => {
    const founding = await signIn("kilnsey@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "kilnsey" }, founding);
    boss = at(await signIn("kilnsey@example.test", ROW));

    me = (await boss("/api/client.create", { name: "Me" })).body.id as unknown as string;

    await boss("/api/consent.record", { subject: me });
    them = (await boss("/api/client.create", { name: "Them" })).body.id as unknown as string;
    await boss("/api/consent.record", { subject: them });
    expect(me, "the roster fixture must not have hit the client quota").toBeTruthy();
    expect(them).toBeTruthy();

    await boss("/api/member.invite", { email: "me@example.test", role: "client", subjectId: me });
    mine = at(await signIn("me@example.test", ROW));

    await boss("/api/commerce.package.save", {
      id: "block", name: "A block", price: { minor: 5_000, currency: "USD" },
      flags: { training: true, progress: true }, budgets: { coaching: 30 }, oncePerCustomer: false,
    });
    await boss("/api/commerce.grant", { subjectId: them, packageId: "block" });
  });

  /*
    ⚠️ THE OBLIGATION THAT WAS RETURNED AND NEVER DISCHARGED. `check` reported
    that a row-scoped operation needed narrowing and nothing performed it, so any
    customer holding an ordinary read permission could name somebody else's id
    and be answered. Kova's clients hold `commerce:read`, which is how a roster
    of paying customers could read each other's packages, days and purchases.
  */
  it("cannot read another client's report, capabilities or history", async () => {
    expect((await mine(`/api/client.report?clientId=${them}`)).status).toBe(403);
    expect((await mine(`/api/commerce.capabilities?subjectId=${them}`)).status).toBe(403);
    expect((await mine(`/api/commerce.history?subjectId=${them}`)).status).toBe(403);
  });

  it("can read every one of them about themselves", async () => {
    expect((await mine(`/api/client.report?clientId=${me}`)).status).toBe(200);
    expect((await mine(`/api/commerce.capabilities?subjectId=${me}`)).status).toBe(200);
    expect((await mine(`/api/commerce.history?subjectId=${me}`)).status).toBe(200);
  });

  /*
    ⚠️ AND STAFF ARE NOT NARROWED BY IT. A coach has no subject of their own, so
    the rule says nothing about them — their reach is their permissions, which is
    the only thing that could decide it.
  */
  it("does not narrow the coach to anybody", async () => {
    expect((await boss(`/api/client.report?clientId=${them}`)).status).toBe(200);
    expect((await boss(`/api/commerce.capabilities?subjectId=${them}`)).status).toBe(200);
  });
});
