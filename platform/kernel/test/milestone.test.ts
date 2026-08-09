/**
 * RECOGNITION, AND THE THREE PLACES IT GOES WRONG QUIETLY.
 *
 * A streak bucketed in the wrong zone. A milestone over an event nothing raises.
 * An award nobody is told about. None of the three throws, none produces a wrong
 * value anywhere a test would look, and all three are indistinguishable from a
 * rule that is merely hard to satisfy.
 */

import { describe, expect, it } from "vitest";
import {
  MILESTONE_EARNED, NOTHING_YET, advance, milestoneProblems, recognitionsFor, satisfied,
  type Instant, type MilestoneRegistry, type PlainDate,
} from "../src/index.js";

const day = (d: string) => d as PlainDate;

/* -------------------------------------------------------------- the tally --- */

describe("a tally counts days, not enthusiasm", () => {
  it("starts a streak at one on the first occurrence ever", () => {
    expect(advance(NOTHING_YET, day("2026-03-01"))).toEqual({ count: 1, streak: 1, lastDay: "2026-03-01" });
  });

  /*
    ⚠️ A SECOND OCCURRENCE ON THE SAME DAY COUNTS AND DOES NOT EXTEND. Letting it
    extend turns a streak into a volume score, which is the thing the whole
    design refuses — and it would be earned by one enthusiastic afternoon.
  */
  it("counts a second occurrence the same day without extending the streak", () => {
    const once = advance(NOTHING_YET, day("2026-03-01"));
    expect(advance(once, day("2026-03-01"))).toEqual({ count: 2, streak: 1, lastDay: "2026-03-01" });
  });

  it("extends across consecutive days, including over a month boundary", () => {
    let t = advance(NOTHING_YET, day("2026-03-30"));
    t = advance(t, day("2026-03-31"));
    t = advance(t, day("2026-04-01"));
    expect(t).toEqual({ count: 3, streak: 3, lastDay: "2026-04-01" });
  });

  /*
    ⚠️ A GAP RESTARTS AT ONE, NOT AT ZERO. Today still happened; telling somebody
    who came back after a week that their streak is zero is a product describing
    their absence rather than their return.
  */
  it("restarts at one after a gap", () => {
    const before = { count: 9, streak: 5, lastDay: day("2026-03-01") };
    expect(advance(before, day("2026-03-08"))).toEqual({ count: 10, streak: 1, lastDay: "2026-03-08" });
  });

  /*
    ⚠️ A DAY EARLIER THAN THE LAST ONE IS A GAP, not an extension. Two devices
    in two zones can deliver events out of order, and treating an earlier day as
    consecutive would let a streak be extended backwards.
  */
  it("treats an out-of-order earlier day as a gap", () => {
    const before = { count: 2, streak: 2, lastDay: day("2026-03-05") };
    expect(advance(before, day("2026-03-04")).streak).toBe(1);
  });
});

/* ------------------------------------------------------------ the earning --- */

const registry: MilestoneRegistry = {
  "first-plan": { title: "Your first plan", icon: "sparkle", rule: { kind: "first", event: "plan.published" }, roles: ["trainer"] },
  "ten-plans": { title: "Ten plans", icon: "check", rule: { kind: "count", event: "plan.published", reaches: 10 }, roles: ["trainer"] },
  "a-week": { title: "A week", icon: "flame", rule: { kind: "streak", event: "plan.published", days: 7 }, roles: ["trainer"] },
  "somebody-elses": { title: "Owner only", icon: "gift", rule: { kind: "first", event: "plan.published" }, roles: ["owner"] },
};

describe("what a tally has satisfied", () => {
  it("names only what this role can earn", () => {
    expect(satisfied(registry, "plan.published", "trainer", { count: 1, streak: 1, lastDay: day("2026-03-01") })).toEqual(["first-plan"]);
  });

  it("ignores an event a rule is not about", () => {
    expect(satisfied(registry, "package.granted", "trainer", { count: 99, streak: 99, lastDay: day("2026-03-01") })).toEqual([]);
  });

  /*
    ⚠️ A STREAK IS NOT A COUNT. Ninety-nine occurrences on one day satisfies "ten
    plans" and must not satisfy "a week" — reading the wrong field is the single
    likeliest mistake here and it makes the harder milestone the easier one.
  */
  it("does not let volume satisfy a streak", () => {
    const busy = { count: 99, streak: 1, lastDay: day("2026-03-01") };
    expect(satisfied(registry, "plan.published", "trainer", busy)).toEqual(["first-plan", "ten-plans"]);
  });

  it("satisfies a streak on the day it reaches the length", () => {
    const kept = { count: 7, streak: 7, lastDay: day("2026-03-07") };
    expect(satisfied(registry, "plan.published", "trainer", kept)).toContain("a-week");
  });
});

/* -------------------------------------------------------------- the check --- */

const announcement = { roles: ["trainer", "owner"] };
const raised = ["plan.published", "package.granted"];

describe("what a manifest may not say about a milestone", () => {
  /*
    ⚠️ NO DEFAULT ON `told`. A default parameter is applied when the argument is
    `undefined`, so a helper defaulting it would silently supply an announcement
    to the one case whose whole point is that there is none — and the test would
    pass by never asking the question.
  */
  const problems = (over: MilestoneRegistry, told: { readonly roles: readonly string[] } | undefined) =>
    milestoneProblems(over, raised, told).map((p) => `${p.id}: ${p.why}`);

  it("accepts a registry whose rules are all over events something raises", () => {
    expect(problems(registry, announcement)).toEqual([]);
  });

  /*
    ⚠️ A RULE OVER AN EVENT NOTHING RAISES IS UNEARNABLE AND LOOKS MERELY HARD.
    Somebody works towards it forever and the product never says a word.
  */
  it("refuses a rule over an event nothing raises", () => {
    const out = problems({ ghost: { title: "Ghost", icon: "x", rule: { kind: "first", event: "never.happens" }, roles: ["trainer"] } }, announcement);
    expect(out.join()).toMatch(/never\.happens/);
  });

  it("refuses one nobody can earn and one with nothing to call it", () => {
    expect(problems({ nobody: { title: "T", icon: "x", rule: { kind: "first", event: "plan.published" }, roles: [] } }, announcement).join()).toMatch(/for nobody/);
    expect(problems({ blank: { title: "  ", icon: "x", rule: { kind: "first", event: "plan.published" }, roles: ["trainer"] } }, announcement).join()).toMatch(/no title/);
  });

  /*
    ⚠️ A COUNT OF ONE IS `first` WEARING A DIFFERENT WORD, and a streak of one day
    is not a streak. Both would work; both would say something untrue to whoever
    reads the manifest next.
  */
  it("refuses a degenerate count and a degenerate streak", () => {
    expect(problems({ one: { title: "T", icon: "x", rule: { kind: "count", event: "plan.published", reaches: 1 }, roles: ["trainer"] } }, announcement).join()).toMatch(/fewer than two/);
    expect(problems({ day: { title: "T", icon: "x", rule: { kind: "streak", event: "plan.published", days: 1 }, roles: ["trainer"] } }, announcement).join()).toMatch(/not a streak/);
  });

  /*
    ⚠️ EARNED IN SILENCE LOOKS EXACTLY LIKE NEVER EARNED. A notification is
    delivered by ROLE, so a milestone a customer can earn and an announcement
    addressed to owners produces a row in a table and nothing else.
  */
  it("refuses a milestone whose earners the announcement is not addressed to", () => {
    const out = problems(
      { theirs: { title: "T", icon: "x", rule: { kind: "first", event: "plan.published" }, roles: ["customer"] } },
      { roles: ["owner"] },
    );
    expect(out.join()).toMatch(/customer/);
  });

  it("refuses an app with milestones and no announcement at all", () => {
    expect(problems(registry, undefined).join()).toMatch(new RegExp(MILESTONE_EARNED.replace(".", "\\.")));
  });

  /* An app that recognises nothing needs no announcement, and is not nagged for one. */
  it("says nothing about an app with no milestones", () => {
    expect(problems({}, undefined)).toEqual([]);
  });
});

/* -------------------------------------------------------------- the shelf --- */

describe("one person's shelf", () => {
  const tallies = { "plan.published": { count: 4, streak: 2, lastDay: day("2026-03-02") } };

  it("shows only what this role can earn", () => {
    const rows = recognitionsFor(registry, "trainer", tallies, {});
    expect(rows.map((r) => r.id)).not.toContain("somebody-elses");
  });

  it("reports progress in the rule's own units", () => {
    const rows = recognitionsFor(registry, "trainer", tallies, {});
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["ten-plans"]).toMatchObject({ have: 4, need: 10 });
    /* ⚠️ Days, not occurrences — reading `count` here would say 4 of 7. */
    expect(byId["a-week"]).toMatchObject({ have: 2, need: 7 });
  });

  /*
    ⚠️ EARNED FIRST, THEN THE NEAREST. Ordering the unearned by declaration
    buries the one somebody is two days away from under nine they have not
    started, which is the only thing the list is for.
  */
  it("puts what was earned first and the nearest unearned next", () => {
    const rows = recognitionsFor(registry, "trainer", tallies, { "first-plan": "2026-03-01T00:00:00.000Z" as Instant });
    expect(rows[0]!.id).toBe("first-plan");
    expect(rows[0]!.earned).toBe(true);
    /* 2/7 of a week beats 4/10 plans by fraction, so the week comes first. */
    expect(rows[1]!.id).toBe("ten-plans");
  });

  /*
    ⚠️ AN EARNED MILESTONE IS NEVER SHOWN AS PART-WAY. A streak that broke after
    the award would otherwise report less progress than the thing already earned,
    which reads as it having been taken back.
  */
  it("shows an earned milestone as complete even after its streak broke", () => {
    const broken = { "plan.published": { count: 9, streak: 1, lastDay: day("2026-04-01") } };
    const rows = recognitionsFor(registry, "trainer", broken, { "a-week": "2026-03-07T00:00:00.000Z" as Instant });
    expect(rows.find((r) => r.id === "a-week")).toMatchObject({ earned: true, have: 7, need: 7 });
  });
});
