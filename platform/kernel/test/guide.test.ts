/**
 * A CHECKLIST, AND DELIBERATELY NOT A TOUR.
 *
 * ⚠️ EVERY RULE HERE FOLLOWS FROM ONE PROPERTY: an item is DERIVED. It cannot
 * drift from what is true, it survives a change of device, and it un-checks
 * itself if the thing is deleted. A tour step can only record "seen", which is
 * a fact about our interface rather than about somebody's progress.
 */

import { describe, expect, it } from "vitest";
import { guideProblems, MAX_HINTS, progressFor, wizardFor, wizardOf, type CollectionSpec, type GuideSpec, type GuideStep } from "../src/index.js";

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

/* ------------------------------------------------------------ the wizard --- */

/**
 * ⚠️ THE WIZARD IS A PROJECTION OF THE CHECKLIST, and these assert that it stays
 * one. Two systems is how a setup flow and a guidance surface come to disagree
 * about what a new workspace still needs, and the disagreement is always found
 * by somebody stuck in the flow.
 */
describe("the wizard is the required half of the same list", () => {
  const guide: GuideSpec = {
    steps: [
      { id: "pay", title: "Connect a payment provider", roles: ["owner"], setup: "deployment", required: true, answer: { kind: "platform", fact: "payments_configured" } },
      { id: "plan", title: "Choose a plan", roles: ["owner"], setup: "workspace", required: true, answer: { kind: "platform", fact: "plan_chosen" } },
      { id: "note", title: "Write a note", roles: ["owner"], setup: "workspace", required: true, answer: { kind: "collection", collection: "thing", atLeast: 1 } },
      { id: "extra", title: "Something nice", roles: ["owner"], setup: "workspace", required: false, answer: { kind: "collection", collection: "thing", atLeast: 5 } },
      { id: "theirs", title: "Their own", roles: ["reader"], setup: "person", required: true, answer: { kind: "platform", fact: "passkey_registered" } },
    ],
    hints: [],
  };

  /*
    ⚠️ ONE SETUP AT A TIME. A person signing up under a workspace shown the
    workspace's checklist — already finished, none of it theirs — is the failure
    the scope exists to name.
  */
  it("shows one scope's steps and no other's", () => {
    expect(wizardFor(guide, "owner", {}).steps.map((s) => s.id)).toEqual(["plan", "note"]);
    expect(wizardFor(guide, "owner", {}, "deployment").steps.map((s) => s.id)).toEqual(["pay"]);
    expect(wizardFor(guide, "reader", {}, "person").steps.map((s) => s.id)).toEqual(["theirs"]);
  });

  it("carries only the required ones — the rest is the checklist", () => {
    expect(wizardFor(guide, "owner", {}).steps.some((s) => s.id === "extra")).toBe(false);
    expect(progressFor(guide, "owner", {}).steps.some((s) => s.id === "extra")).toBe(true);
  });

  /*
    ⚠️ THE FIRST UNFINISHED, NOT THE COUNT OF FINISHED ONES. Somebody who
    satisfied a later step out of order — a plan chosen from a pricing page, a
    passkey added at a prompt — is still at the earlier one, and a position
    derived from a count would put them past work they have not done.
  */
  it("stands at the first unfinished step, even when a later one is already done", () => {
    expect(wizardFor(guide, "owner", { note: true })).toMatchObject({ at: 0, of: 2, done: false });
    expect(wizardFor(guide, "owner", { plan: true })).toMatchObject({ at: 1, of: 2, done: false });
  });

  it("is finished when every required step is, and says so", () => {
    expect(wizardFor(guide, "owner", { plan: true, note: true })).toMatchObject({ at: 2, of: 2, done: true });
  });

  /*
    ⚠️ A SCOPE WITH NOTHING REQUIRED IS FINISHED, NOT BROKEN. An app that asks
    nothing of a new person must not leave them staring at an empty flow.
  */
  it("is finished immediately when a scope requires nothing", () => {
    expect(wizardFor(guide, "owner", {}, "person")).toMatchObject({ of: 0, done: true });
  });

  /*
    ⚠️ THE OUTER SCOPE LEADS WHILE IT IS UNFINISHED, and that is not an ordering
    preference. A workspace that is not set up blocks everybody in it, so
    finishing somebody's own profile first walks them carefully through a
    workspace that cannot do anything yet.
  */
  it("walks the workspace before the person, and hands over when it is done", () => {
    const both = ["workspace", "person"] as const;
    expect(wizardOf(guide, "owner", {}, both).setup).toBe("workspace");
    expect(wizardOf(guide, "owner", { plan: true, note: true }, both).setup).toBe("person");
  });

  /*
    ⚠️ AND WHEN EVERY SCOPE IS FINISHED IT REPORTS THE INNERMOST — the one whose
    "done" is theirs. Reporting the workspace's would tell somebody the thing
    they just finished belonged to somebody else.
  */
  it("reports the innermost scope once everything is finished", () => {
    expect(wizardOf(guide, "reader", { theirs: true }, ["workspace", "person"])).toMatchObject({ setup: "person", done: true });
  });
});

describe("what a manifest may not say about whose setup a step is", () => {
  /* Two collections, and the difference between them is the whole point. */
  const tenantWide = { id: "thing", scope: { of: "tenant" }, fields: { title: {} } } as unknown as CollectionSpec;
  const theirs = { id: "entry", scope: { of: "subject", subject: "customer" }, fields: { note: {} } } as unknown as CollectionSpec;

  const step = (over: Record<string, unknown>) => ({
    id: "s", title: "T", roles: ["owner"], required: true, ...over,
  }) as never;
  const problems = (over: Record<string, unknown>, offers = { plans: 1, filePurposes: 1 }) =>
    guideProblems({ steps: [step(over)], hints: [] }, [tenantWide, theirs], ["thing.create"], [], offers)
      .map((p) => p.why).join("; ");

  /*
    ⚠️ A DEPLOYMENT STEP HAS NO TENANT TO COUNT IN. The operator is not inside a
    workspace, so a row count there is a question about somebody else's data,
    answered by whichever workspace happened to be resolved.
  */
  it("refuses a deployment step that counts rows", () => {
    expect(problems({ setup: "deployment", answer: { kind: "collection", collection: "thing", atLeast: 1 } })).toMatch(/operator is not in/);
  });

  /*
    ⚠️ AND A PERSON STEP OVER THE WORKSPACE'S ROWS IS DONE THE MOMENT A COLLEAGUE
    DOES IT — a new arrival told their setup is complete having done nothing.
  */
  it("refuses a person step counting a collection the whole workspace shares", () => {
    expect(problems({ setup: "person", answer: { kind: "collection", collection: "thing", atLeast: 1 } })).toMatch(/anybody else did it/);
  });

  it("accepts a person step counting their own", () => {
    expect(problems({ setup: "person", answer: { kind: "collection", collection: "entry", atLeast: 1 } })).toBe("");
  });

  /*
    ⚠️ AND A STEP THE REST OF THE MANIFEST MAKES UNANSWERABLE. An app selling no
    plans cannot be asked to choose one; an app with no file purposes has no
    upload surface mounted at all. Both look like a step nobody has got to yet.
  */
  it("refuses a step asking for something this manifest does not offer", () => {
    expect(problems({ answer: { kind: "platform", fact: "plan_chosen" } }, { plans: 0, filePurposes: 1 })).toMatch(/sells none/);
    expect(problems({ answer: { kind: "platform", fact: "file_stored" } }, { plans: 1, filePurposes: 0 })).toMatch(/no upload surface/);
  });

  it("refuses a workspace step asking about the deployment's own configuration", () => {
    expect(problems({ answer: { kind: "platform", fact: "payments_configured" } })).toMatch(/nobody in it can change/);
  });
});
