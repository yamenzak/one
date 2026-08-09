/**
 * THE TWO DECISIONS RECOGNITION MAKES BEFORE IT TOUCHES A DATABASE.
 *
 * Who earned this, and on what day. Both are one line at a call site in the
 * pipeline and both are wrong in ways that produce no error anywhere: a badge
 * credited to whichever account a webhook happened to arrive on, and a streak
 * bucketed at a midnight nobody in the product is awake for.
 */

import { describe, expect, it } from "vitest";
import { dayIn, earnerOf, recognise, watchedEvents } from "../src/milestone.js";
import type { Actor, Instant, MilestoneRegistry, PlainDate, Session, SqlHandle } from "@one/kernel";

/** Any call at all is the failure. */
const fail = () => { throw new Error("the store was touched"); };

const person = { userId: "u_1", tenantId: "t_1", kind: "user" } as Actor;
const machine = { userId: null, tenantId: "t_1", kind: "system" } as Actor;
const session = { accountId: "u_1" } as Session;

describe("only a person earns anything", () => {
  it("names the signed-in account", () => {
    expect(earnerOf(person, session)).toBe("u_1");
  });

  /*
    ⚠️ A SWEEP RAISES EVENTS AND HAS ACHIEVED NOTHING. A nightly job that closed
    a workspace's month is not somebody's streak, and there is no account to
    credit it to that would not be arbitrary.
  */
  it("names nobody when there is no session", () => {
    expect(earnerOf(person, null)).toBeNull();
  });

  /*
    ⚠️ AND A SYSTEM ACTOR WITH A SESSION IS STILL NOT A PERSON. A payment webhook
    can arrive on a request that carries a cookie; the actor is what says whether
    this was somebody doing something.
  */
  it("names nobody for a system actor", () => {
    expect(earnerOf(machine, session)).toBeNull();
  });
});

describe("nothing is recorded against nobody", () => {
  /*
    ⚠️ AND THE GUARD IS HERE, NOT ONLY IN THE PIPELINE. The request path already
    declines to recognise anything for a sweep or a webhook; repeating it inside
    the engine is what makes the rule reachable by a test rather than re-derived
    by whoever writes the second caller.

    The store is never touched, so the missing handle is the assertion: a
    `recognise` that got as far as a query would throw here rather than pass.
  */
  it("returns nothing, and touches no store, when there is no earner", async () => {
    const exploding = { all: fail, first: fail, run: fail, batch: fail } as unknown as SqlHandle;
    const out = await recognise({
      db: exploding,
      registry: { a: { title: "A", icon: "x", rule: { kind: "first", event: "plan.chosen" }, roles: ["owner"] } },
      tenantId: "t_1", userId: "", role: "owner", event: "plan.chosen",
      today: "2026-03-01" as PlainDate, at: "2026-03-01T00:00:00.000Z" as Instant,
    });
    expect(out).toEqual([]);
  });
});

describe("the day is the person's own", () => {
  const evening = "2026-03-01T23:30:00.000Z" as Instant;

  /*
    ⚠️ MIDNIGHT UTC IS FOUR IN THE AFTERNOON IN CALIFORNIA. A streak bucketed in
    UTC breaks halfway through somebody's day and they lose it having done
    nothing wrong.
  */
  it("resolves one instant to two days in two zones", () => {
    expect(dayIn(evening, "Europe/Berlin")).toBe("2026-03-02");
    expect(dayIn(evening, "America/Los_Angeles")).toBe("2026-03-01");
    expect(dayIn(evening, "Asia/Tokyo")).toBe("2026-03-02");
  });

  it("pads a single-digit month and day, because the shape is compared as text", () => {
    expect(dayIn("2026-01-05T12:00:00.000Z" as Instant, "UTC")).toBe("2026-01-05");
  });

  /*
    ⚠️ AN UNKNOWN ZONE DEGRADES RATHER THAN THROWING. The value arrives in a
    header a browser fills in, so a typo or an old device must cost a day
    boundary rather than an operation.
  */
  it("falls back on a zone nobody has", () => {
    expect(dayIn(evening, "Mars/Olympus")).toBe("2026-03-01");
  });
});

describe("what is counted at all", () => {
  const registry: MilestoneRegistry = {
    a: { title: "A", icon: "x", rule: { kind: "first", event: "plan.chosen" }, roles: ["owner"] },
    b: { title: "B", icon: "x", rule: { kind: "count", event: "plan.chosen", reaches: 5 }, roles: ["owner"] },
  };

  /*
    ⚠️ EVERY OPERATION RAISES SOMETHING, AND A TALLY PER PERSON PER EVENT WOULD BE
    A PERMANENT RECORD OF EVERYTHING ANYBODY DID — which is the retention decision
    the counter exists to avoid. Only what a rule watches is counted.
  */
  it("watches only the events a rule is about, once each", () => {
    expect([...watchedEvents(registry)]).toEqual(["plan.chosen"]);
    expect(watchedEvents(registry).has("package.granted")).toBe(false);
  });

  it("watches nothing at all when an app recognises nothing", () => {
    expect(watchedEvents({}).size).toBe(0);
  });
});
