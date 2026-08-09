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
  steps: { id: string; done: boolean; required: boolean }[];
  blocking: { id: string }[];
  hints: { id: string; surface: string }[];
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
    expect(out.blocking.map((b) => b.id)).toEqual(["choose-plan"]);
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
    expect(out.blocking).toEqual([]);
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
