/**
 * WHAT A CLIENT OPENS THE APP FOR — today, a fast, a photograph, a week read
 * back, and the meal they actually had.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN, and the slug is minted per attempt:
 * the file is retried against shared storage, so a fixed one conflicts with its
 * own first attempt and reports that as a fixture failure.
 *
 * ⚠️ THE THREAD IS A NUMBER NOBODY MEASURED. A wellness score computed from one
 * input and shown like one computed from five, a fasting zone asserted from a
 * clock nobody started, two photographs from different angles compared as though
 * they were the same pose — each is the product telling somebody something about
 * their own body that is not true, and none of them throws.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { freshSlug, joinAs, post, SETUP, signIn } from "./session.js";

const SLUG = freshSlug("langstrothdale");
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const as = (cookie: string) => ({
  async call(path: string, body?: unknown) {
    const res = await worker.fetch(
      new Request(`${STUDIO}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body ?? {}),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
  async get(path: string, query: Record<string, string> = {}) {
    const q = new URLSearchParams(query).toString();
    const res = await worker.fetch(
      new Request(`${STUDIO}${path}${q ? `?${q}` : ""}`, { headers: { ...(cookie ? { cookie } : {}) } }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
  async upload(body: ArrayBuffer, query: string) {
    const res = await worker.fetch(
      new Request(`${STUDIO}/api/file.upload?${query}`, {
        method: "POST", headers: { "content-type": "image/jpeg", cookie }, body,
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
});

const photo = (tag: number): ArrayBuffer =>
  new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
    0xff, 0xdb, 0x00, 0x05, 1, 2, 3, 0xff, 0xda, 0x00, 0x02, 9, 9, tag, 0xff, 0xd9,
  ]).buffer;

let coach: ReturnType<typeof as>;
let client: ReturnType<typeof as>;
let ro = "";

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  const coachCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  coach = as(coachCookie);

  const person = await coach.call("/api/client.create", { name: "Ro Adeyemi" });
  expect(person.status, "the roster fixture must not have hit the client quota").toBe(200);
  ro = person.body.id as unknown as string;

  /*
    ⚠️ THE MEMBERSHIP NAMES THE RECORD, which is what makes them a customer. An
    invitation without it produces somebody who can sign in and owns nothing —
    every subject-scoped read narrows to "mine" and finds none.
  */
  await coach.call("/api/member.invite", { email: `ro-${SLUG}@example.test`, role: "client", subjectId: ro });
  client = as(await signIn(`ro-${SLUG}@example.test`, STUDIO));

  /* ⚠️ And a package, because every one of these features is sold. Without it
     the flags are off and the whole file reads as a permission problem. */
  await coach.call("/api/commerce.package.save", {
    id: "everything", name: "Everything", price: { minor: 12_000, currency: "USD" },
    flags: { training: true, nutrition: true, checkins: true, progress: true, body: true },
    budgets: { coaching: 90, nutrition: 90 }, oncePerCustomer: false,
  });
  const granted = await coach.call("/api/commerce.grant", { subjectId: ro, packageId: "everything" });
  expect(granted.status, "the package fixture must have been granted").toBe(200);
  void joinAs;
});

/* --------------------------------------------------------------- fasting --- */

describe("a fast, while it is running", () => {
  it("says there is none before one is started", async () => {
    const out = await client.get("/api/fast.now");
    expect(out.status).toBe(200);
    expect(out.body.fast).toBeNull();
    expect(out.body.zone).toBeNull();
    /* ⚠️ The ladder still travels, so the screen can show what is ahead. */
    expect((out.body.zones as unknown as unknown[]).length).toBeGreaterThan(3);
  });

  it("reports the zone once one is running", async () => {
    const started = new Date(Date.now() - 13 * 3_600_000).toISOString();
    const made = await client.call("/api/fast.create", { client: ro, startedAt: started });
    expect(made.status).toBe(200);

    const out = await client.get("/api/fast.now");
    expect((out.body.zone as unknown as { id: string }).id).toBe("burning");
    expect(out.body.hours as unknown as number).toBeGreaterThanOrEqual(13);
  });

  /*
    ⚠️ A FINISHED FAST IS NOT THE FAST YOU ARE IN. Without the `ended_at IS NULL`
    predicate the screen keeps counting a fast somebody stopped last week, which
    reads as a timer nobody can turn off.
  */
  it("stops reporting one that has been ended", async () => {
    const open = (await client.get("/api/fast.now")).body.fast as unknown as { id: string };
    const row = (await client.get("/api/fast.read", { id: open.id })).body.row as unknown as { version: number };
    const done = await client.call("/api/fast.update", {
      id: open.id, version: row.version, changes: { endedAt: new Date().toISOString() },
    });
    expect(done.status).toBe(200);
    expect((await client.get("/api/fast.now")).body.fast).toBeNull();
  });

  it("is the client's own, and not another client's", async () => {
    const other = await coach.call("/api/client.create", { name: "Sam Okonkwo" });
    expect(other.status, "the roster fixture must not have hit the client quota").toBe(200);
    await coach.call("/api/fast.create", {
      client: other.body.id as unknown as string, startedAt: new Date().toISOString(),
    });
    /* ⚠️ Ro has no open fast; the one just created belongs to somebody else. */
    expect((await client.get("/api/fast.now")).body.fast).toBeNull();
  });
});

/* -------------------------------------------------------------- wellness --- */

describe("how the week went, in one number", () => {
  /*
    ⚠️ BELOW TWO INPUTS THERE IS NO SCORE. One input is not a picture of a week,
    and a number computed from one is a number somebody will act on.
  */
  it("declines to score a week it knows one thing about", async () => {
    const out = await client.get("/api/client.wellness");
    expect(out.status).toBe(200);
    expect(out.body.score).toBeNull();
  });

  it("scores once there is more than one thing to go on", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await client.call("/api/entry.create", { client: ro, day: today, kind: "sleep", value: 4 });
    await client.call("/api/entry.create", { client: ro, day: today, kind: "mood", value: 4 });

    const out = await client.get("/api/client.wellness");
    expect(out.body.score as unknown as number).toBeGreaterThan(0);
    expect(out.body.from as unknown as string[]).toContain("sleep");
  });

  /*
    ⚠️ IT SAYS WHAT IT USED. A score of 82 from two inputs looks exactly like one
    from five, and the first is somebody being told they are doing well because
    they slept.
  */
  it("reports what it was computed from", async () => {
    const out = await client.get("/api/client.wellness");
    expect(out.body.coverage as unknown as number).toBeLessThan(1);
    expect((out.body.from as unknown as string[]).length).toBeGreaterThanOrEqual(2);
  });

  /*
    ⚠️ THE NUMBERS COME FROM `entry`, WHICH IS THEIR ONE HOME. A check-in carries
    prose and no figures on purpose, so a score read off a copy on the report
    would be scoring a second version nobody can correct — and correcting the
    original would leave the score unchanged.
  */
  it("follows a correction to the number it was computed from", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const made = await client.call("/api/entry.create", { client: ro, day: today, kind: "energy", value: 1 });
    const low = (await client.get("/api/client.wellness")).body.score as unknown as number;

    const row = (await client.get("/api/entry.read", { id: made.body.id as unknown as string })).body.row as unknown as { version: number };
    await client.call("/api/entry.update", { id: made.body.id as unknown as string, version: row.version, changes: { value: 5 } });
    const high = (await client.get("/api/client.wellness")).body.score as unknown as number;
    expect(high).toBeGreaterThan(low);
  });
});

/* ----------------------------------------------------------------- today --- */

describe("what today asks of somebody", () => {
  const DAY = "2026-04-06";

  beforeAll(async () => {
    const week = { days: [{ name: "Monday", movements: [{ movement: "x", sets: 3, reps: 8 }] }] };
    /* A movement id is a ref, so use a real one. */
    const squat = (await coach.call("/api/movement.create", { name: "Back squat", pattern: "squat" })).body.id as unknown as string;
    const real = { days: [{ name: "Monday", movements: [{ movement: squat, sets: 3, reps: 8 }] }] };
    void week;
    const plan = await coach.call("/api/programme.create", {
      client: ro, kind: "training", title: "Block", active: true, weeks: [real],
    });
    expect(plan.status).toBe(200);

    const meals = {
      days: [{
        name: "Monday",
        meals: [{
          name: "Lunch",
          options: [
            { label: "Chicken and rice", foods: [{ name: "Chicken breast", grams: 180 }] },
            { label: "Tofu and rice", foods: [{ name: "Firm tofu", grams: 200 }] },
          ],
        }],
      }],
    };
    const eating = await coach.call("/api/programme.create", {
      client: ro, kind: "eating", title: "Eating", active: true, weeks: [meals],
    });
    expect(eating.status, "the eating plan fixture must be accepted by the declared shape").toBe(200);
  });

  /*
    ⚠️ ONE CALL, BECAUSE THE ALTERNATIVE IS FIVE AND A SPINNER. The first screen a
    client opens decides whether the product feels like a tool or a chore, and
    five round trips on a phone in a gym is the chore.
  */
  it("answers with the session, the meals and anything outstanding at once", async () => {
    const out = await client.get("/api/client.today", { day: DAY });
    expect(out.status).toBe(200);
    expect((out.body.plan as unknown as { title: string }).title).toBe("Block");
    expect((out.body.meals as unknown as { title: string }).title).toBe("Eating");
  });

  it("shows no workout on a day nothing was recorded", async () => {
    expect((await client.get("/api/client.today", { day: DAY })).body.workout).toBeNull();
  });

  it("shows one once it is", async () => {
    await client.call("/api/workout.create", { client: ro, day: DAY });
    const out = await client.get("/api/client.today", { day: DAY });
    expect((out.body.workout as unknown as { submitted: boolean }).submitted).toBe(false);
  });

  /*
    ⚠️ AN OUTSTANDING CHECK-IN IS ONE WITH NO ANSWER, not one nobody wrote. What a
    client needs to see is that their coach has not replied yet.
  */
  it("surfaces a check-in the coach has not answered", async () => {
    await client.call("/api/checkin.create", {
      client: ro, since: "2026-03-30", until: "2026-04-05", howItWent: "Steady week",
    });
    const out = await client.get("/api/client.today", { day: DAY });
    expect(out.body.checkIn).not.toBeNull();
  });

  it("is another client's nothing", async () => {
    /* The coach asking about the roster sees no subject of their own, so this is
       the studio's view rather than a person's — and it must not invent one. */
    const out = await coach.get("/api/client.today", { day: DAY });
    expect(out.status).toBe(200);
  });
});

/* ------------------------------------------------------------- the prefill --- */

describe("what the app already knows about a week", () => {
  /*
    ⚠️ IT PREFILLS AND NEVER SUBMITS. A check-in answered by the app on somebody's
    behalf is a coaching record nobody wrote, and the whole value of it is that a
    person read the week back and said something about it.
  */
  it("counts what was actually recorded in the window", async () => {
    const out = await client.get("/api/checkin.prefill", { since: "2026-04-01", until: "2026-04-30" });
    expect(out.status).toBe(200);
    expect(out.body.workouts as unknown as number).toBeGreaterThanOrEqual(1);
  });

  it("counts nothing outside it", async () => {
    const out = await client.get("/api/checkin.prefill", { since: "2020-01-01", until: "2020-01-07" });
    expect(out.body.workouts as unknown as number).toBe(0);
    expect(out.body.sets as unknown as number).toBe(0);
  });

  /*
    ⚠️ THE LAST WEIGHT IS OFFERED, NOT ASSUMED. It is there so somebody who has
    not changed does not retype it; filling it in as this week's figure would put
    a number they did not measure into their own history.
  */
  it("offers the last weight rather than inventing one", async () => {
    expect((await client.get("/api/checkin.prefill", { since: "2026-04-01", until: "2026-04-30" })).body.weight).toBeNull();
    await client.call("/api/entry.create", { client: ro, day: "2026-04-02", kind: "weight", value: 81.4 });
    const out = await client.get("/api/checkin.prefill", { since: "2026-04-01", until: "2026-04-30" });
    expect(out.body.weight as unknown as number).toBe(81.4);
  });

  it("writes nothing at all", async () => {
    const before = ((await client.get("/api/checkin.list")).body.rows as unknown as unknown[]).length;
    await client.get("/api/checkin.prefill", { since: "2026-04-01", until: "2026-04-30" });
    expect(((await client.get("/api/checkin.list")).body.rows as unknown as unknown[]).length).toBe(before);
  });
});

/* ------------------------------------------------------------- photographs --- */

describe("progress photographs", () => {
  let front = "";

  it("keeps one, in a pose", async () => {
    const up = await client.upload(photo(3), "purpose=body-photo&name=front.jpg");
    expect(up.status).toBe(200);
    front = up.body.id as unknown as string;
    const made = await client.call("/api/photo.create", {
      client: ro, day: "2026-01-05", pose: "front", image: front,
    });
    expect(made.status).toBe(200);
  });

  /*
    ⚠️ ONE PHOTOGRAPH IS NOT A COMPARISON, and saying so beats showing the same
    picture twice — which reads as "no change" to the one person who most wants
    there to be some.
  */
  it("does not compare a single photograph with itself", async () => {
    const out = await client.get("/api/photo.compare", { pose: "front" });
    expect(out.status).toBe(200);
    expect(out.body.latest).toBeNull();
    expect(out.body.days).toBeNull();
  });

  it("compares the first with the most recent, and says how long apart", async () => {
    const up = await client.upload(photo(4), "purpose=body-photo&name=front2.jpg");
    await client.call("/api/photo.create", {
      client: ro, day: "2026-03-16", pose: "front", image: up.body.id as unknown as string,
    });
    const out = await client.get("/api/photo.compare", { pose: "front" });
    expect((out.body.first as unknown as { day: string }).day).toBe("2026-01-05");
    expect((out.body.latest as unknown as { day: string }).day).toBe("2026-03-16");
    expect(out.body.days as unknown as number).toBe(70);
  });

  /*
    ⚠️ THE SAME POSE OR NOTHING. Two pictures from different angles show a change
    that is not there, which for a photograph of somebody's own body is the
    specific way this misleads the person it is for.
  */
  it("does not mix poses", async () => {
    const up = await client.upload(photo(5), "purpose=body-photo&name=side.jpg");
    await client.call("/api/photo.create", {
      client: ro, day: "2026-03-16", pose: "side", image: up.body.id as unknown as string,
    });
    const out = await client.get("/api/photo.compare", { pose: "side" });
    expect(out.body.latest, "one side-on photograph is not a comparison").toBeNull();
  });

  /*
    ⚠️ THE PURPOSE DECIDES, WHICH IS WHAT MAKES THE CAMERA FEATURES REACHABLE AT
    ALL. A client holds no blanket write over the studio's storage — and before
    the purpose carried its own permission that meant they could not upload
    anything, so every feature built for them carried their permission, carried
    their flag, and was refused at its first step on a different operation.
  */
  it("lets a client upload what is theirs and nothing else", async () => {
    expect((await client.upload(photo(6), "purpose=body-photo&name=mine.jpg")).status).toBe(200);
    expect((await client.upload(photo(7), "purpose=meal&name=lunch.jpg")).status).toBe(200);
    /* ⚠️ And a movement demonstration is still the studio's. */
    expect((await client.upload(photo(8), "purpose=demo&name=theirs.jpg")).status).toBe(403);
    expect((await client.upload(photo(9), "purpose=lab-report&name=theirs.jpg")).status).toBe(403);
  });

  it("is not another client's to read", async () => {
    const out = await client.get("/api/photo.compare", { pose: "front", clientId: "cli_somebody" });
    /* ⚠️ The caller's own subject wins over anything in the request. */
    expect((out.body.first as unknown as { day: string } | null)?.day).toBe("2026-01-05");
  });
});

/* ------------------------------------------------------------- meal swaps --- */

describe("choosing between the meals a coach allowed", () => {
  it("carries the options through to the client", async () => {
    const out = await client.get("/api/client.today", { day: "2026-04-06" });
    const weeks = (out.body.meals as unknown as { weeks: { days: { meals: { options: { label: string }[] }[] }[] }[] }).weeks;
    const options = weeks[0]!.days[0]!.meals[0]!.options;
    expect(options.map((o) => o.label)).toEqual(["Chicken and rice", "Tofu and rice"]);
  });

  /*
    ⚠️ RECORDED RATHER THAN INFERRED FROM WHAT THEY LOGGED. A coach offering three
    versions of lunch wants to know which is being chosen, and working that out by
    matching logged foods against a plan is a guess that gets worse as somebody's
    logging gets looser — which is exactly when the answer matters.
  */
  it("records which one was taken", async () => {
    const plan = (await client.get("/api/client.today", { day: "2026-04-06" })).body.meals as unknown as { id: string };
    const made = await client.call("/api/choice.create", {
      client: ro, day: "2026-04-06", programme: plan.id, meal: "Lunch", option: "Tofu and rice",
    });
    expect(made.status).toBe(200);

    const listed = (await coach.get("/api/choice.list")).body.rows as unknown as { option: string }[];
    expect(listed.map((r) => r.option)).toContain("Tofu and rice");
  });

  /* ⚠️ A day with no options is a plan that still works. The feature is additive
     to what a single-meal plan already does. */
  it("leaves a plan with no options alone", async () => {
    const made = await coach.call("/api/programme.create", {
      client: ro, kind: "eating", title: "Plain", weeks: [{ days: [{ name: "Tuesday", meals: [{ name: "Lunch" }] }] }],
    });
    expect(made.status).toBe(200);
  });

  it("refuses a meal option that is not the shape a meal has", async () => {
    const made = await coach.call("/api/programme.create", {
      client: ro, kind: "eating", title: "Broken",
      weeks: [{ days: [{ meals: [{ name: "Lunch", choices: ["a"] }] }] }],
    });
    expect(made.status).toBe(400);
  });
});
