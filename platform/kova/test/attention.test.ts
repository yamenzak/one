/**
 * WHO NEEDS YOU TODAY, END TO END — version 0.4, and the one read a coach opens
 * the product for.
 *
 * ⚠️ THE DANGER HERE IS A LIST THAT IS WRONG IN A FRIENDLY DIRECTION. Every
 * defect this suite pins produces a shorter, calmer list: a person who never
 * started training reads as fine, a goal somebody reached reads as missed, a
 * name at the top that should be third. A coach learns within a week whether
 * this list is worth opening, and one that cries wolf is worse than none.
 *
 * ⚠️ THREE STUDIOS OF THREE, AND NOT FOR TIDINESS. The entry plan allows three
 * people, so a fixture that put eight on one roster would be testing the quota
 * refusal by accident — and it did, silently, until the reads came back empty
 * rather than wrong.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

type Row = { who: { id: string; name: string }; watches: { reason: string; days: number }[] };

/** A plain date N days before today, which is the only clock a test can move. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** One studio, signed in, with everything a case here needs to say. */
async function studio(slug: string) {
  const staff = await signIn(`${slug}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug }, staff);
  const origin = `https://${slug}.kova.4dl.app`;
  const cookie = await signIn(`${slug}-coach@example.test`, origin);

  const call = async (path: string, body?: unknown) => {
    const res = await worker.fetch(
      new Request(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  };

  const client = async (name: string, startedOn: string) => {
    const made = await call("/api/client.create", { name, startedOn });
    if (made.status !== 200) throw new Error(`${name}: ${JSON.stringify(made.body)}`);
    return made.body.id as unknown as string;
  };

  const trained = async (who: string, day: string) => {
    const made = await call("/api/workout.create", { client: who, day });
    await call("/api/workout.submit", { id: made.body.id as unknown as string });
  };

  const attention = async () => ((await call("/api/coach.attention")).body as unknown as { rows: Row[] }).rows;
  const named = async (name: string) => (await attention()).find((r) => r.who.name === name);

  return { call, client, trained, attention, named };
}

/* ------------------------------------------------------------ who is on it --- */

describe("the list is only the people something is true about", () => {
  let s: Awaited<ReturnType<typeof studio>>;
  let waiting = "";

  beforeAll(async () => {
    s = await studio("ridgeway");
    /* Trained yesterday, nothing outstanding. Should never appear. */
    await s.trained(await s.client("Fine", daysAgo(300)), daysAgo(1));
    /* Trained yesterday too, but sent a check-in three days ago and heard nothing. */
    waiting = await s.client("Waiting", daysAgo(300));
    await s.trained(waiting, daysAgo(1));
    /* Last trained six weeks ago. */
    await s.trained(await s.client("Gone", daysAgo(300)), daysAgo(42));

    const filed = await s.call("/api/checkin.create", {
      client: waiting, since: daysAgo(10), until: daysAgo(3), howItWent: "Shoulder is still bad",
    });
    await s.call("/api/checkin.submit", { id: filed.body.id as unknown as string });
  });

  it("leaves out somebody with nothing outstanding", async () => {
    expect(await s.named("Fine")).toBeUndefined();
  });

  /*
    ⚠️ SOMEBODY WAITING ON A REPLY COMES FIRST, and the ordering rather than the
    membership is what makes this list worth opening. A coach who has to read to
    the bottom to find the person waiting on them is a coach who stops reading it.
  */
  it("puts the person waiting on a reply at the top", async () => {
    const rows = await s.attention();
    expect(rows[0]!.who.name).toBe("Waiting");
    expect(rows[0]!.watches[0]).toMatchObject({ reason: "unanswered", days: 3 });
  });

  it("says how long somebody has been silent, and why they are on the list", async () => {
    const gone = (await s.named("Gone"))!;
    expect(gone.watches.map((w) => w.reason)).toEqual(["quiet"]);
    expect(gone.watches[0]!.days).toBe(42);
  });

  it("drops somebody off the moment they are answered", async () => {
    const filed = ((await s.call("/api/checkin.list")).body as unknown as { rows: { id: string }[] }).rows;
    expect(filed).toHaveLength(1);
    expect((await s.call("/api/checkin.answer", { checkinId: filed[0]!.id, answer: "Rest it, swap to floor press." })).status).toBe(200);

    expect(await s.named("Waiting")).toBeUndefined();
  });
});

/* ----------------------------------------------------------------- silence --- */

describe("what counts as having gone quiet", () => {
  let s: Awaited<ReturnType<typeof studio>>;

  beforeAll(async () => {
    s = await studio("lowmoor");
    /* Joined on Tuesday, and their coach entered the training they already did. */
    await s.trained(await s.client("Fresh", daysAgo(2)), daysAgo(40));
    /* Joined two months ago and has never recorded a single thing. */
    await s.client("Never", daysAgo(60));
  });

  /*
    ⚠️ A NEW ARRIVAL WITH BACK-DATED HISTORY IS THE CASE THAT LOOKS FINE AND IS
    NOT. Their last recorded session is six weeks old because their coach typed
    it in on Tuesday, so silence measured from the training alone flags somebody
    who joined two days ago — and nothing about the row would look wrong.
  */
  it("does not call somebody quiet for training they did before they arrived", async () => {
    expect(await s.named("Fresh")).toBeUndefined();
  });

  /*
    ⚠️ AND SOMEBODY WHO NEVER STARTED IS THE QUIETEST PERSON ON THE ROSTER. They
    have no last session to count from, so "days since they last did anything"
    has no answer — and an absent fact reads as nothing to report.
  */
  it("counts silence from the day somebody joined when they never started", async () => {
    const never = (await s.named("Never"))!;
    expect(never.watches.map((w) => w.reason)).toEqual(["quiet"]);
    expect(never.watches[0]!.days).toBe(60);
  });
});

/* ------------------------------------------------------------------- goals --- */

describe("a goal past its date", () => {
  let s: Awaited<ReturnType<typeof studio>>;

  beforeAll(async () => {
    s = await studio("hallam");
    /* All three trained yesterday, so the only thing that can raise them is the goal. */
    const goal = async (name: string, weighs: number | null, dueOn: string) => {
      const who = await s.client(name, daysAgo(300));
      await s.trained(who, daysAgo(1));
      await s.call("/api/goal.create", { client: who, kind: "weight", start: 90, target: 80, dueOn });
      if (weighs !== null) await s.call("/api/entry.create", { client: who, day: daysAgo(2), kind: "weight", value: weighs });
    };
    await goal("Done", 79.2, daysAgo(5));
    await goal("Behind", 88, daysAgo(5));
    await goal("Untracked", null, daysAgo(9));
  });

  /*
    ⚠️ PAST THE DATE IS NOT THE SAME AS MISSED. Somebody who reached their target
    early is not behind, and a list that says they are is telling a coach off for
    a success. Whether it was reached is a question about the entries, which is
    exactly why a goal stores no progress.
  */
  it("is not raised when they got there", async () => {
    expect(await s.named("Done")).toBeUndefined();
  });

  it("is raised when they did not, counted from the date they set", async () => {
    const row = (await s.named("Behind"))!;
    expect(row.watches.map((w) => w.reason)).toEqual(["overdue"]);
    expect(row.watches[0]!.days).toBe(5);
  });

  /*
    ⚠️ NO ENTRY AT ALL IS NOT EVIDENCE THEY GOT THERE. A goal with nothing logged
    against it has to count as missed, or setting a goal and never recording
    anything would be the way to disappear off this list.
  */
  it("is raised when there is nothing to say whether they got there", async () => {
    expect((await s.named("Untracked"))!.watches.map((w) => w.reason)).toEqual(["overdue"]);
  });
});
