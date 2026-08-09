/**
 * A CHECKLIST, AND DELIBERATELY NOT A TOUR.
 *
 * ⚠️ EVERY RULE HERE FOLLOWS FROM ONE PROPERTY: an item is DERIVED. It cannot
 * drift from what is true, it survives a change of device, and it un-checks
 * itself if the thing is deleted. A tour step can only record "seen", which is
 * a fact about our interface rather than about somebody's progress.
 */

import { describe, expect, it } from "vitest";
import { guideProblems, MAX_HINTS, progressFor, type CollectionSpec, type GuideSpec, type GuideStep } from "../src/index.js";

const collections = [
  { id: "note", fields: { title: {}, pinned: {} } },
  { id: "receipt", fields: { total: {} } },
] as unknown as CollectionSpec[];

const step = (over: Partial<GuideStep> = {}): GuideStep => ({
  id: "first-note",
  title: "Write your first note",
  roles: ["owner"],
  required: false,
  answer: { kind: "collection", collection: "note", atLeast: 1 },
  ...over,
});

const guide = (over: Partial<GuideSpec> = {}): GuideSpec => ({ steps: [step()], hints: [], ...over });
const check = (g: GuideSpec) => guideProblems(g, collections, ["note.create", "note.list"], ["notes"]);

/* ------------------------------------------------------------ the checks --- */

describe("what a manifest may not say about a step", () => {
  it("accepts one that counts a collection the app has", () => {
    expect(check(guide())).toEqual([]);
    expect(check(guide({ steps: [step({ answer: { kind: "collection", collection: "note", atLeast: 1, where: { field: "pinned", equals: true } } })] }))).toEqual([]);
    expect(check(guide({ steps: [step({ answer: { kind: "platform", fact: "plan_chosen" } })] }))).toEqual([]);
  });

  /*
    ⚠️ A STEP COUNTING A COLLECTION THE APP DOES NOT HAVE IS ANSWERED "NO"
    FOREVER — so a new workspace is told to do something that cannot be done,
    and a `required` one of those is a wizard nobody can finish.
  */
  it("refuses one counting something that does not exist", () => {
    expect(check(guide({ steps: [step({ answer: { kind: "collection", collection: "ghost", atLeast: 1 } })] }))[0]!.why)
      .toMatch(/does not declare/);
    expect(check(guide({ steps: [step({ answer: { kind: "collection", collection: "note", atLeast: 1, where: { field: "nowhere", equals: 1 } } })] }))[0]!.why)
      .toMatch(/does not have/);
  });

  it("refuses one that is satisfied by nothing at all", () => {
    expect(check(guide({ steps: [step({ answer: { kind: "collection", collection: "note", atLeast: 0 } })] }))[0]!.why)
      .toMatch(/always done/);
  });

  /*
    ⚠️ AN ACTION THAT DOES NOT EXIST IS A BUTTON THAT GOES NOWHERE, offered at
    the moment somebody is least able to work out what to do instead.
  */
  it("refuses one offering an action or an article that is not there", () => {
    expect(check(guide({ steps: [step({ does: "note.invent" })] }))[0]!.why).toMatch(/not an operation/);
    expect(check(guide({ steps: [step({ help: "missing" })] }))[0]!.why).toMatch(/help that does not exist/);
    expect(check(guide({ steps: [step({ does: "note.create", help: "notes" })] }))).toEqual([]);
  });

  it("refuses one for nobody, and one declared twice", () => {
    expect(check(guide({ steps: [step({ roles: [] })] }))[0]!.why).toMatch(/audience/);
    expect(check(guide({ steps: [step(), step()] }))[0]!.why).toMatch(/twice/);
  });
});

/* ----------------------------------------------------------------- hints --- */

describe("hints, and why there are at most five", () => {
  const hint = (id: string) => ({ id, surface: "note", body: "Search looks inside every note.", roles: ["owner"] });

  it("accepts a few anchored to a real surface", () => {
    expect(check(guide({ hints: [hint("a"), hint("b")] }))).toEqual([]);
  });

  /*
    ⚠️ THE CAP IS THE FEATURE. A hint is the one tracked thing here, and tracked
    is exactly the property that makes a tour bad — so the number is bounded to
    stop a tour being rebuilt one hint at a time.
  */
  it("refuses a sixth, because past that it is a tour", () => {
    const many = Array.from({ length: MAX_HINTS + 1 }, (_, i) => hint(`h${i}`));
    expect(check(guide({ hints: many }))[0]!.why).toMatch(/over the 5 cap/);
    expect(check(guide({ hints: many.slice(0, MAX_HINTS) }))).toEqual([]);
  });

  it("refuses one pointing at a screen the app does not have", () => {
    expect(check(guide({ hints: [{ ...hint("a"), surface: "ghost" }] }))[0]!.why).toMatch(/does not declare/);
  });
});

/* -------------------------------------------------------------- progress --- */

describe("what one person still has to do", () => {
  const full: GuideSpec = {
    steps: [
      step({ id: "note", roles: ["owner", "reader"] }),
      step({ id: "plan", roles: ["owner"], required: true, answer: { kind: "platform", fact: "plan_chosen" } }),
      step({ id: "theirs", roles: ["reader"] }),
    ],
    hints: [],
  };

  it("shows somebody only what is theirs", () => {
    expect(progressFor(full, "owner", {}).steps.map((s) => s.id).sort()).toEqual(["note", "plan"]);
    expect(progressFor(full, "reader", {}).steps.map((s) => s.id).sort()).toEqual(["note", "theirs"]);
    expect(progressFor(full, "stranger", {}).steps).toEqual([]);
  });

  /*
    ⚠️ REQUIRED FIRST. A blocking step buried under optional ones is a workspace
    that cannot proceed and cannot see why.
  */
  it("puts what is blocking above what is merely worth doing", () => {
    expect(progressFor(full, "owner", {}).steps[0]!.id).toBe("plan");
  });

  /*
    ⚠️ THE WIZARD IS THE `required` HALF OF THE SAME LIST. Two systems is how
    the setup flow and the guidance come to disagree about what a new workspace
    still needs.
  */
  it("reports what is blocking as a subset of the list, not a second one", () => {
    const open = progressFor(full, "owner", {});
    expect(open.blocking.map((s) => s.id)).toEqual(["plan"]);
    for (const b of open.blocking) expect(open.steps.some((s) => s.id === b.id)).toBe(true);

    const settled = progressFor(full, "owner", { plan: true });
    expect(settled.blocking).toEqual([]);
    expect(settled.steps.length, "a done step stays on the list rather than disappearing").toBe(2);
  });

  it("reads an unanswered step as not done rather than as missing", () => {
    expect(progressFor(full, "owner", {}).steps.every((s) => s.done === false)).toBe(true);
    expect(progressFor(full, "owner", { note: true }).steps.find((s) => s.id === "note")!.done).toBe(true);
  });
});
