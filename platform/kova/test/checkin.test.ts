/**
 * REPORTING IN, END TO END — version 0.3, and the loop that keeps a coaching
 * relationship going.
 *
 * ⚠️ THIS IS WHERE THE OLD PRODUCT'S WORST SHAPE LIVED. Its check-in wrote
 * COPIES of that week's weight, sleep and mood into its own columns, then read
 * them back beside the originals, merging per date and per field. Three
 * documented bug classes came out of it. Here a check-in freezes the WORDS and
 * never the NUMBERS, so there is nothing to merge and nothing to drift.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { progressOf } from "@one/kernel";

const STUDIO = "https://westgate.kova.4dl.app";
let coach = "";

const call = async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie: coach },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const rows = (body: Record<string, never>) => body.rows as unknown as Record<string, unknown>[];
let clientId = "";

beforeAll(async () => {
  const staff = await signIn("westgate@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "westgate" }, staff);
  coach = await signIn("westgate@example.test", STUDIO);
  clientId = (await call("/api/client.create", { name: "Ro" })).body.id as unknown as string;
});

/* ------------------------------------------------------------- the words --- */

describe("a check-in freezes what somebody said", () => {
  it("takes a report and lets it be edited while it is a draft", async () => {
    const made = await call("/api/checkin.create", {
      client: clientId, since: "2026-08-03", until: "2026-08-09",
      howItWent: "Hard week, slept badly", stuckOn: "Mornings",
    });
    expect(made.status).toBe(200);
    const id = made.body.id as unknown as string;

    const listed = rows((await call("/api/checkin.list")).body).find((c) => c.id === id)!;
    const edited = await call("/api/checkin.update", {
      id, version: listed.version, changes: { howItWent: "Hard week, slept badly, but finished it" },
    });
    expect(edited.status).toBe(200);
  });

  /*
    ⚠️ ONCE IT IS SENT, THE WORDS STOP MOVING. A coach is replying to what
    somebody actually said, and a report that can be quietly rewritten
    afterwards makes the reply meaningless.
  */
  it("stops the words moving once it is sent", async () => {
    const made = await call("/api/checkin.create", {
      client: clientId, since: "2026-08-10", until: "2026-08-16", howItWent: "Better",
    });
    const id = made.body.id as unknown as string;
    expect((await call("/api/checkin.submit", { id })).status).toBe(200);

    const after = rows((await call("/api/checkin.list")).body).find((c) => c.id === id)!;
    const rewritten = await call("/api/checkin.update", {
      id, version: after.version, changes: { howItWent: "Actually it was terrible" },
    });
    expect(rewritten.status).toBe(400);
    expect(rewritten.body.meta).toMatchObject({ fields: "howItWent" });
  });

  /*
    ⚠️ AND THE ANSWER IS NOT FROZEN, because it is written AFTER the document is
    submitted. The whole point of a check-in is that somebody replies to it, so
    a freeze that covered every field would make the feature impossible.
  */
  it("still takes a reply after it is sent, and says so", async () => {
    const made = await call("/api/checkin.create", {
      client: clientId, since: "2026-08-17", until: "2026-08-23", howItWent: "Good",
    });
    const id = made.body.id as unknown as string;
    await call("/api/checkin.submit", { id });

    const replied = await call("/api/checkin.answer", { checkinId: id, answer: "Well done — same again, add 2.5kg." });
    expect(replied.status).toBe(200);

    const after = rows((await call("/api/checkin.list")).body).find((c) => c.id === id)!;
    expect(after.answer).toBe("Well done — same again, add 2.5kg.");
  });
});

/* ------------------------------------------------------------- the event --- */

describe("sending one is an event, raised by the transition itself", () => {
  /*
    ⚠️ SUBMITTING IS THE MOST NOTIFICATION-WORTHY MOMENT A DOCUMENT HAS, and
    until `docStatus.emits` existed it was the one thing in the product that
    could not raise one — every app wanting to be told had to add a second
    operation beside the lifecycle, which then had to be kept in step with it.
  */
  it("tells the coach the moment it is sent", async () => {
    const made = await call("/api/checkin.create", {
      client: clientId, since: "2026-08-24", until: "2026-08-30", howItWent: "Steady",
    });
    expect((await call("/api/checkin.submit", { id: made.body.id as unknown as string })).status).toBe(200);

    const inbox = ((await call("/api/inbox.list")).body as unknown as { rows: { type: string }[] }).rows;
    expect(inbox.map((r) => r.type)).toContain("checkin.filed");
  });

  /*
    ⚠️ RECOGNITION IS THE CALLER'S, AND HERE THE CALLER IS THE COACH. `first-checkin`
    is a client's milestone, and a coach filing one on somebody's behalf has not
    reported in — so it is not earned, and the shelf shows it as still to come.
    That is the rule working, not a gap: a badge handed to whoever typed it would
    be recognition for the wrong person.
  */
  it("does not credit the coach with the client's milestone", async () => {
    const shelf = ((await call("/api/milestone.list")).body as unknown as
      { rows: { id: string }[] }).rows;
    expect(shelf.map((m) => m.id)).not.toContain("first-checkin");
  });
});

/* ------------------------------------------------------------ the numbers --- */

describe("a check-in copies no numbers, so nothing can drift", () => {
  /*
    ⚠️ THE OLD SHAPE IS UNREPRESENTABLE. There is nowhere on a check-in to put a
    weight, so there is no second copy to disagree with the entry — and
    correcting a weigh-in corrects it everywhere, including in a check-in filed
    weeks ago.
  */
  it("has nowhere to store a weight at all", async () => {
    const listed = rows((await call("/api/checkin.list")).body);
    for (const key of ["weight", "sleep", "mood", "sleep_quality"]) {
      expect(Object.keys(listed[0]!)).not.toContain(key);
    }
  });

  it("keeps the numbers in their one home, correctable after the fact", async () => {
    const made = await call("/api/entry.create", { client: clientId, day: "2026-08-05", kind: "weight", value: 81.4 });
    const id = made.body.id as unknown as string;
    const row = rows((await call("/api/entry.list")).body).find((e) => e.id === id)!;

    const fixed = await call("/api/entry.update", { id, version: row.version, changes: { value: 84.1 } });
    expect(fixed.status).toBe(200);
    expect(rows((await call("/api/entry.list")).body).find((e) => e.id === id)!.value).toBe(84.1);
  });
});

/* -------------------------------------------------------------- the goal --- */

describe("a goal stores no progress", () => {
  it("records where somebody started and where they are going, and nothing else", async () => {
    const made = await call("/api/goal.create", {
      client: clientId, kind: "weight", start: 90, target: 75, dueOn: "2026-12-01", why: "Knees",
    });
    expect(made.status).toBe(200);

    const goal = rows((await call("/api/goal.list")).body).find((g) => g.id === made.body.id)!;
    /* ⚠️ No `current`, no `progress`: both are questions, answered from the entries. */
    expect(Object.keys(goal)).not.toContain("current");
    expect(Object.keys(goal)).not.toContain("progress");
    expect(goal).toMatchObject({ start: 90, target: 75 });
  });

  /*
    ⚠️ PROGRESS IS A QUERY, and the arithmetic is the pure layer's. Reading the
    latest entry of the goal's own kind is what makes it impossible for progress
    to be stale — there is no stored number to be stale.
  */
  it("is answered from the entries, measured from the baseline", async () => {
    await call("/api/entry.create", { client: clientId, day: "2026-08-20", kind: "weight", value: 82.5 });
    const latest = rows((await call("/api/entry.list")).body)
      .filter((e) => e.kind === "weight")
      .sort((a, b) => String(b.day).localeCompare(String(a.day)))[0]!;

    const goal = rows((await call("/api/goal.list")).body).find((g) => g.kind === "weight")!;
    const progress = progressOf({
      start: goal.start as number, target: goal.target as number, current: latest.value as number,
    });
    expect(progress).toMatchObject({ direction: "down", done: 0.5, reached: false });
  });
});
