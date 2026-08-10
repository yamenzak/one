/**
 * THE CHECKLIST, AGAINST A REAL WORKSPACE.
 *
 * ⚠️ NOTHING IS EVER MARKED DONE. Every step is answered by counting what is
 * actually there — which is why there is no operation that could set one, and
 * why an item un-checks itself when the thing is deleted. That last property is
 * the one no tour has and the one this suite exists to demonstrate.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const ORIGIN = "https://guide.hello.4dl.app";
let member = "";

const call = async (path: string, body?: unknown, cookie = member) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

type Guidance = {
  steps: { id: string; done: boolean; required: boolean; setup: string }[];
  blocking: { id: string }[];
  hints: { id: string; surface: string }[];
  wizard: { setup: string; steps: { id: string }[]; at: number; of: number; done: boolean };
  of: number; done: number;
};
const guidance = async () => (await call("/api/guide.progress")).body as unknown as Guidance;

beforeAll(async () => {
  const staff = await signIn("guide@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "guide" }, staff);
  member = await signIn("guide-owner@example.test", ORIGIN);
});

/* -------------------------------------------------------------- the list --- */

describe("what a new workspace still has to do", () => {
  it("starts with everything open and says what is blocking", async () => {
    const out = await guidance();
    expect(out.of).toBeGreaterThan(2);
    expect(out.done).toBe(0);
    /* ⚠️ Both scopes that apply here: the workspace's, and this person's own. */
    expect(out.blocking.map((b) => b.id)).toEqual(["choose-plan", "first-entry"]);
  });

  /*
    ⚠️ ANSWERED BY COUNTING, NOT BY REMEMBERING. Nothing marked this done — a
    note was written and the question changed its answer.
  */
  it("ticks itself off when the thing it counts exists", async () => {
    const made = await call("/api/note.create", { title: "the first one" });
    expect(made.status).toBe(200);

    const out = await guidance();
    expect(out.steps.find((s) => s.id === "first-note")!.done).toBe(true);
    expect(out.done).toBe(1);
  });

  /*
    ⚠️ AND IT UN-TICKS ITSELF. This is the property no tour has: delete the
    thing and the step is open again, because the step was never a record of
    having been shown a screen.
  */
  it("opens again when the thing is deleted", async () => {
    const listed = (await call("/api/note.list")).body as unknown as { rows: { id: string }[] };
    for (const row of listed.rows) await call("/api/note.delete", { id: row.id });

    expect((await guidance()).steps.find((s) => s.id === "first-note")!.done).toBe(false);
  });

  it("clears the blocker when the plan is chosen, without anything marking it", async () => {
    expect((await call("/api/billing.choose", { planId: "keeper" })).status).toBe(200);
    const out = await guidance();
    expect(out.blocking.map((b) => b.id)).not.toContain("choose-plan");
    expect(out.steps.find((s) => s.id === "choose-plan")!.done).toBe(true);
  });

  /*
    ⚠️ A DONE STEP STAYS ON THE LIST. Disappearing would make the list shorter
    every time somebody does something, so progress would be invisible at exactly
    the moment it is worth showing.
  */
  it("keeps a finished step visible", async () => {
    const out = await guidance();
    expect(out.steps.some((s) => s.id === "choose-plan")).toBe(true);
    expect(out.of).toBe(out.steps.length);
  });

  it("shows nothing at all to somebody with no session", async () => {
    expect((await call("/api/guide.progress", undefined, "")).status).toBe(403);
  });
});

/* ----------------------------------------------------------------- hints --- */

describe("the one thing that is tracked", () => {
  it("offers a hint anchored to a surface", async () => {
    const out = await guidance();
    expect(out.hints.map((h) => h.id)).toContain("search-notes");
    expect(out.hints.find((h) => h.id === "search-notes")!.surface).toBe("note");
  });

  /*
    ⚠️ DISMISSAL IS THE ONE FACT WORTH STORING HERE, because a hint says
    something not derivable — and that is exactly the property that makes a tour
    bad, which is why there is a cap on how many may exist.
  */
  it("stops offering it once, and stays stopped", async () => {
    expect((await call("/api/guide.hint.seen", { id: "search-notes" })).status).toBe(200);
    expect((await guidance()).hints.map((h) => h.id)).not.toContain("search-notes");
    await call("/api/guide.hint.seen", { id: "search-notes" });
    expect((await guidance()).hints.length).toBe(0);
  });

  it("refuses a hint the manifest does not declare", async () => {
    expect((await call("/api/guide.hint.seen", { id: "invented" })).status).toBe(400);
  });

  /*
    ⚠️ THERE IS NO WAY TO MARK A STEP DONE, and that is deliberate: a write that
    could set one would be a way to tell somebody something untrue about their
    own workspace.
  */
  it("has no operation that could mark a step complete", async () => {
    const tools = (await call("/api/tools.list")).body.tools as unknown as { name: string }[];
    expect(tools.map((t) => t.name).filter((n) => n.startsWith("guide_")).sort()).toEqual(["guide_hint_seen", "guide_progress"]);
  });
});

/* ------------------------------------------------------------ the wizard --- */

/**
 * ⚠️ THREE SHAPES, ONE DECLARATION — and the third is the one that gets built as
 * the second. A product ships a workspace wizard, then a customer signs up under
 * a tenant and is handed the workspace's checklist: already finished, and none
 * of it theirs.
 */
describe("whose setup is being asked about", () => {
  /*
    ⚠️ THE OUTER SCOPE LEADS WHILE IT IS UNFINISHED. A workspace that is not set
    up blocks everybody in it, so walking somebody carefully through their own
    profile first would be a flow completed inside a workspace that cannot do
    anything yet. By this point in the file a plan has been chosen, so the
    workspace's walk is done and the person's has taken over — which IS the rule,
    asserted as a transition rather than as a snapshot.
  */
  it("hands the walk from the workspace to the person once the workspace is set up", async () => {
    const out = await guidance();
    expect(out.wizard.setup).toBe("person");
    expect(out.wizard.steps.map((s) => s.id)).toEqual(["first-entry"]);

    /* And a person who has not chosen a plan is still walked through that first. */
    const fresh = await signIn("guide-fresh@example.test", ORIGIN);
    expect(((await call("/api/guide.progress", undefined, fresh)).body as unknown as Guidance).wizard.setup).toBe("person");
  });

  /*
    ⚠️ AND THE DEPLOYMENT'S STEP IS NOT SHOWN INSIDE A WORKSPACE. Asking somebody
    to connect a payment provider is a task nobody there can do and would not
    understand — it belongs on the operator door and nowhere else.
  */
  it("never shows the deployment's own setup inside a workspace", async () => {
    expect((await guidance()).steps.some((s) => s.id === "take-payments")).toBe(false);
  });

  /*
    ⚠️ AND A PERSON'S STEP IS COUNTED AGAINST THEIR OWN ROWS. `entry` is scoped
    to the customer, so a colleague writing one does not finish anybody else's
    setup — the failure that makes a new arrival's checklist arrive complete.
  */
  it("counts a person's step against their own rows, not the workspace's", async () => {
    const before = await guidance();
    expect(before.steps.find((s) => s.id === "first-entry")).toMatchObject({ done: false, setup: "person" });

    expect((await call("/api/entry.create", { note: "mine" })).status).toBe(200);
    expect((await guidance()).steps.find((s) => s.id === "first-entry")!.done).toBe(true);

    /*
      ⚠️ SOMEBODY ELSE'S WORKSPACE-MATE HAS THEIR OWN ANSWER. A second person in
      the same workspace has written nothing, so their step is still open even
      though the workspace now contains an entry.
    */
    const other = await signIn("guide-second@example.test", ORIGIN);
    const theirs = (await call("/api/guide.progress", undefined, other)).body as unknown as Guidance;
    expect(theirs.steps.find((s) => s.id === "first-entry")!.done).toBe(false);
  });

  /*
    ⚠️ AND THEY CANNOT SEE EACH OTHER'S. A subject-scoped read narrows to the
    caller's own subject when they have one — so the mistake that shows one
    customer another's records is not expressible.
  */
  it("keeps one person's rows out of another's list", async () => {
    const other = await signIn("guide-third@example.test", ORIGIN);
    const mine = (await call("/api/entry.list")).body as unknown as { rows: { note: string }[] };
    const theirs = (await call("/api/entry.list", undefined, other)).body as unknown as { rows: { note: string }[] };
    expect(mine.rows.some((r) => r.note === "mine")).toBe(true);
    expect(theirs.rows.some((r) => r.note === "mine")).toBe(false);
  });
});

/*
  ⚠️ THE OPERATOR DOOR IS WHERE THE DEPLOYMENT'S OWN SETUP LIVES, and the only
  place it can be acted on. `admin.` answers for the deployment, not for any
  workspace — so the same operation asks a different question depending on which
  door it came in through, which is the whole reason the scope is a declaration
  rather than a parameter somebody passes.
*/
describe("the deployment's own setup, on the operator door", () => {
  const OPERATOR = "https://admin.hello.4dl.app";
  const atAdmin = async (cookie: string) => {
    const res = await worker.fetch(
      new Request(`${OPERATOR}/api/guide.progress`, { headers: { "content-type": "application/json", cookie } }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as unknown as Guidance };
  };

  it("asks about the deployment there and about a workspace everywhere else", async () => {
    const operator = await signIn("guide-operator@example.test", OPERATOR);
    const out = await atAdmin(operator);
    expect(out.status).toBe(200);
    expect(out.body.wizard.setup).toBe("deployment");
    expect(out.body.steps.map((s) => s.id)).toEqual(["take-payments"]);
  });

  /*
    ⚠️ AND THE WORKSPACE'S STEPS ARE NOT THERE. An operator shown "write your
    first entry" is being asked about a workspace they are not in — answered by
    whichever one happened to resolve, which is none of them.
  */
  it("never shows a workspace's steps to an operator", async () => {
    const operator = await signIn("guide-operator2@example.test", OPERATOR);
    const out = await atAdmin(operator);
    expect(out.body.steps.some((s) => s.id === "choose-plan" || s.id === "first-entry")).toBe(false);
  });
});

/* ------------------------------------------------------- the degrade lane --- */

describe("the degrade lane is the feature, not the fallback", () => {
  /*
    ⚠️ A MANDATORY PAID STEP THAT REFUSED WOULD MEAN NOBODY CAN EVER FINISH. This
    deployment has no payment provider — `hello` configures no webhook secret —
    so it cannot take money at all, and the wizard is still finishable: choosing
    a plan RECORDS an intention and grants nothing, which is what makes a
    self-host and a deployment before its payment step work rather than strand
    every workspace over our own configuration.
  */
  it("finishes a workspace's wizard on a deployment that cannot take money", async () => {
    expect((await call("/api/billing.choose", { planId: "keeper" })).status).toBe(200);
    const out = await guidance();
    expect(out.wizard).toMatchObject({ done: true, at: out.wizard.of });
    expect(out.blocking).toEqual([]);
  });

  /* ⚠️ AND IT GRANTED NOTHING. Only the payment provider may stamp a plan. */
  it("records the intention and grants nothing", async () => {
    const standing = (await call("/api/billing.standing")).body as unknown as { planId?: string; pendingPlanId?: string };
    expect(standing.pendingPlanId).toBe("keeper");
    expect(standing.planId).toBeUndefined();
  });
});
