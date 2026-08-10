/**
 * RECOGNITION, END TO END — and the thing it must not need.
 *
 * ⚠️ NOTHING IN `hello` AWARDS ANYTHING. There is no call to the engine anywhere
 * in the app, no handler that knows a milestone exists, and no instrumentation
 * beside the operations. The manifest declares a rule over an event something
 * already raises, and the badge, the tally, the shelf and the announcement all
 * follow from that one declaration — which is the property being asserted here,
 * not the badge.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { bindingsFor, dayIn, readOutcome, recognise, talliesFor } from "@one/runtime";
import { sql, type Instant, type MilestoneRegistry, type PlainDate, type ResolvedRegion, type SqlHandle } from "@one/kernel";

const ORIGIN = "https://shelf.hello.4dl.app";
let member = "";

const call = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie: member, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never>, outcome: readOutcome(res.headers) };
};

type Row = { id: string; title: string; earned: boolean; have: number; need: number };
const shelf = async () => ((await call("/api/milestone.list")).body as unknown as { rows: Row[] }).rows;
const inboxTypes = async () =>
  ((await call("/api/inbox.list")).body as unknown as { rows: { type: string; title: string }[] }).rows;

beforeAll(async () => {
  const staff = await signIn("shelf@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "shelf" }, staff);
  member = await signIn("shelf@example.test", ORIGIN);
});

/* --------------------------------------------------------------- the read --- */

describe("the shelf exists before anything is on it", () => {
  /*
    ⚠️ THE SURFACE IS THERE FROM THE FIRST REQUEST. A mechanism reachable only
    once it has data is one nobody discovers, and "no rows" is exactly the state
    a first-run screen has to be able to draw.
  */
  it("lists what there is to earn, with nothing earned yet", async () => {
    const rows = await shelf();
    expect(rows.map((r) => r.id).sort()).toEqual(["picked-a-plan", "three-grants"]);
    expect(rows.every((r) => !r.earned)).toBe(true);
    expect(rows.find((r) => r.id === "three-grants")).toMatchObject({ have: 0, need: 3 });
  });
});

/* -------------------------------------------------------------- the write --- */

describe("an event the manifest already declares is the whole instrumentation", () => {
  it("awards and announces from one operation nobody told about milestones", async () => {
    const chose = await call("/api/billing.choose", { planId: "keeper" });
    expect(chose.status).toBe(200);

    /*
      ⚠️ AND IT PUNCTUATES THE RESPONSE THAT CAUSED IT. The inbox row is the
      record; the moment is the acknowledgement in the place the person is
      actually looking. It REPLACES the operation's own "Plan selected" and
      brings the milestone's own words — "saved" is not news standing next to
      "you earned something", and the smaller thing's copy under the larger
      thing's animation reads as the product having lost track.
    */
    expect(chose.outcome).toMatchObject({ moment: "celebrate", sound: "earn", message: "You chose a plan" });
    /* The body is still exactly the declared output — the outcome rides beside it. */
    expect(chose.body).toHaveProperty("pendingPlanId");

    const earned = (await shelf()).find((r) => r.id === "picked-a-plan")!;
    expect(earned).toMatchObject({ earned: true, have: 1, need: 1 });

    /*
      ⚠️ ANNOUNCED THROUGH THE ONE DISPATCH PATH, so a milestone obeys the same
      preferences, writes the same row and renders from the same registry as
      everything else. A second sender is how a product ends up with a category
      nobody can mute.
    */
    const told = await inboxTypes();
    expect(told.map((r) => r.type)).toContain("milestone.earned");
    expect(told.find((r) => r.type === "milestone.earned")!.title).toBe("You chose a plan");
  });

  /*
    ⚠️ EARNED ONCE, ANNOUNCED ONCE. The rule stays satisfied forever — every
    later occurrence satisfies it again — so an engine that awarded on
    satisfaction rather than on a first write would congratulate somebody on
    every single call for the rest of the account's life.
  */
  it("does not announce it a second time when the rule is satisfied again", async () => {
    const before = (await inboxTypes()).filter((r) => r.type === "milestone.earned").length;
    const again = await call("/api/billing.choose", { planId: "free" });
    expect(again.status).toBe(200);
    expect((await inboxTypes()).filter((r) => r.type === "milestone.earned").length).toBe(before);
    /* And the second one is an ordinary save again, with the operation's own copy. */
    expect(again.outcome).toMatchObject({ message: "Plan selected" });
    expect(again.outcome!.moment).toBeUndefined();
  });

  /*
    ⚠️ A COUNT CROSSES ITS THRESHOLD AND NOT BEFORE, and the partial progress is
    visible the whole way. A shelf that showed nothing until the last one is a
    shelf nobody looks at twice.
  */
  it("counts towards a threshold and awards on the one that reaches it", async () => {
    await call("/api/commerce.package.save", {
      id: "pack", name: "Pack", price: { minor: 100, currency: "EUR" }, flags: {}, budgets: { reading: 1 }, oncePerCustomer: false,
    });

    for (const who of ["a", "b"]) {
      expect((await call("/api/commerce.grant", { subjectId: who, packageId: "pack" })).status).toBe(200);
    }
    expect((await shelf()).find((r) => r.id === "three-grants")).toMatchObject({ earned: false, have: 2, need: 3 });

    expect((await call("/api/commerce.grant", { subjectId: "c", packageId: "pack" })).status).toBe(200);
    expect((await shelf()).find((r) => r.id === "three-grants")).toMatchObject({ earned: true, have: 3, need: 3 });
  });

  /*
    ⚠️ EARNED FIRST. The shelf is a record of what happened before it is a list
    of what is left, and the ordering is what makes it read that way.
  */
  it("puts what was earned at the top", async () => {
    expect((await shelf()).map((r) => r.earned)).toEqual([true, true]);
  });
});

/* ------------------------------------------------------- what is counted --- */

const handle = (): SqlHandle =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DB }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

describe("only what a rule watches is counted at all", () => {
  const watching: MilestoneRegistry = {
    only: { title: "Only", icon: "x", rule: { kind: "count", event: "plan.chosen", reaches: 5 }, roles: ["owner"] },
  };
  const at = (n: number) => ({
    db: handle(), registry: watching, tenantId: "t_counting", userId: "u_counting", role: "owner",
    event: n === 0 ? "plan.chosen" : "note.created",
    today: "2026-03-01" as PlainDate, at: `2026-03-01T0${n}:00:00.000Z` as Instant,
  });

  /*
    ⚠️ EVERY OPERATION RAISES SOMETHING. A tally row per person per event would
    make this table a permanent record of everything anybody ever did — the exact
    retention decision the counter exists to avoid — and it would be written on
    the hot path of every write in the product.

    Asserted against a REAL database rather than a fake, because "no row was
    written" is a claim about a table and a fake that answered it would be
    asserting its own arithmetic.
  */
  it("writes no tally at all for an event no rule is about", async () => {
    await recognise(at(1));
    await recognise(at(2));
    expect(await talliesFor(handle(), "t_counting", "u_counting")).toEqual({});
  });

  it("writes one for an event a rule is about", async () => {
    await recognise(at(0));
    const tallies = await talliesFor(handle(), "t_counting", "u_counting");
    expect(tallies).toEqual({ "plan.chosen": { count: 1, streak: 1, lastDay: "2026-03-01" } });
  });
});

/* ---------------------------------------------------------------- the day --- */

describe("the day a streak is bucketed into is the person's own", () => {
  /*
    ⚠️ MIDNIGHT UTC IS FOUR IN THE AFTERNOON IN CALIFORNIA. A streak bucketed in
    UTC breaks halfway through somebody's day and they lose it having done
    nothing wrong — so the same instant is two different days depending on where
    the person is standing, and the engine has to take theirs.
  */
  it("resolves the same instant to different days in different zones", () => {
    const evening = "2026-03-01T23:30:00.000Z" as Instant;
    expect(dayIn(evening, "Europe/Berlin")).toBe("2026-03-02");
    expect(dayIn(evening, "America/Los_Angeles")).toBe("2026-03-01");
  });

  /*
    ⚠️ AN UNKNOWN ZONE DEGRADES, IT DOES NOT THROW. The value arrives in a header
    a browser fills in, so a typo or an old device must cost a day boundary
    rather than an operation.
  */
  it("falls back rather than throwing on a zone nobody has", () => {
    expect(dayIn("2026-03-01T12:00:00.000Z" as Instant, "Mars/Olympus")).toBe("2026-03-01");
  });
});
