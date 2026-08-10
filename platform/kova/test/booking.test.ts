/**
 * APPOINTMENTS — and the one thing about them a column cannot say.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together.
 *
 * ⚠️ THE CLASH RULE IS ON THE COLLECTION, WHICH IS WHY BOTH WRITES ARE TESTED. A
 * check written into a bespoke `booking.book` leaves the derived `booking.create`
 * standing beside it making the same row without the check — and the derived one
 * is what a form actually calls. The update matters for the same reason and one
 * more: handed only the changes, a clash check sees a booking with no coach and
 * no time, reports no clash, and accepts every move onto an occupied hour.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "swaledale";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const as = (cookie: string) => async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const TEN = "2026-09-01T10:00:00.000Z";
const HALF_TEN = "2026-09-01T10:30:00.000Z";
const ELEVEN = "2026-09-01T11:00:00.000Z";

let coach: ReturnType<typeof as>;
let coachCookie = "";
let ro = "";
let tam = "";

const book = (over: Record<string, unknown> = {}) =>
  coach("/api/booking.create", {
    client: ro, startsAt: TEN, minutes: 60, coach: "mem_ash", state: "booked", ...over,
  });

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  coachCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  coach = as(coachCookie);

  const first = await coach("/api/client.create", { name: "Ro Adeyemi" });

  await coach("/api/consent.record", { subject: first.body.id });
  expect(first.status, "the roster fixture must not have hit the client quota").toBe(200);
  ro = first.body.id as unknown as string;
  tam = ((await coach("/api/client.create", { name: "Tam Okonjo" })).body.id) as unknown as string;
});

/* --------------------------------------------------------------- booking --- */

describe("booking somebody in", () => {
  it("takes the appointment and remembers who it is with", async () => {
    const made = await book();
    expect(made.status).toBe(200);
    const back = await coach(`/api/booking.read?id=${made.body.id}`);
    expect(back.body.row).toMatchObject({ coach: "mem_ash", minutes: 60, state: "booked" });
  });

  /*
    ⚠️ A COACH CANNOT BE IN TWO PLACES AT ONCE, and this is the assertion the
    whole rule exists for. Two clients booked onto one coach's ten o'clock is a
    mistake nobody notices until both of them arrive.
  */
  it("refuses a second person onto the same coach's hour", async () => {
    const clash = await book({ client: tam });
    expect(clash.status).toBe(409);
    expect(clash.body.meta).toMatchObject({ reason: "coach_double_booked" });
  });

  it("refuses one that merely overlaps, not only one that matches", async () => {
    expect((await book({ client: tam, startsAt: HALF_TEN, minutes: 60 })).status).toBe(409);
  });

  /*
    ⚠️ TOUCHING IS NOT OVERLAPPING. An hour ending at eleven leaves eleven free,
    and a rule that refused it would lose a studio every back-to-back booking it
    makes — which is most of them.
  */
  it("allows the hour that starts when the last one ends", async () => {
    expect((await book({ client: tam, startsAt: ELEVEN })).status).toBe(200);
  });

  it("allows the same hour for a different coach", async () => {
    expect((await book({ client: tam, coach: "mem_bea" })).status).toBe(200);
  });

  /*
    ⚠️ A CANCELLED SESSION BLOCKS NOTHING. Keeping the row is how a studio sees
    what happened; treating it as an occupied hour would make an hour somebody
    cancelled permanently unbookable.
  */
  it("frees the hour again once it is cancelled", async () => {
    const made = await coach("/api/booking.create", {
      client: ro, startsAt: "2026-09-02T09:00:00.000Z", minutes: 60, coach: "mem_cy", state: "booked",
    });
    expect((await coach("/api/booking.create", {
      client: tam, startsAt: "2026-09-02T09:00:00.000Z", minutes: 60, coach: "mem_cy", state: "booked",
    })).status).toBe(409);

    await coach("/api/booking.update", { id: made.body.id, version: 1, changes: { state: "cancelled" } });
    expect((await coach("/api/booking.create", {
      client: tam, startsAt: "2026-09-02T09:00:00.000Z", minutes: 60, coach: "mem_cy", state: "booked",
    })).status).toBe(200);
  });
});

/* --------------------------------------------------------------- moving --- */

describe("changing one", () => {
  /*
    ⚠️ THE RULE RUNS ON THE UPDATE TOO, AGAINST THE MERGED ROW. Handed only the
    changes it sees no coach and no time, reports no clash, and accepts every
    move onto an occupied hour — silently, whenever the coach was not edited.
  */
  it("refuses a move onto an hour that coach already has", async () => {
    const taken = await coach("/api/booking.create", {
      client: ro, startsAt: "2026-09-03T14:00:00.000Z", minutes: 60, coach: "mem_dee", state: "booked",
    });
    expect(taken.status).toBe(200);
    const other = await coach("/api/booking.create", {
      client: tam, startsAt: "2026-09-03T16:00:00.000Z", minutes: 60, coach: "mem_dee", state: "booked",
    });
    expect(other.status).toBe(200);

    /* ⚠️ Only the time changes; the coach comes from the stored row. */
    const moved = await coach("/api/booking.update", {
      id: other.body.id, version: 1, changes: { startsAt: "2026-09-03T14:30:00.000Z" },
    });
    expect(moved.status).toBe(409);
    expect(moved.body.meta).toMatchObject({ reason: "coach_double_booked" });
  });

  /*
    ⚠️ AND THE MERGED ROW HAS TO BE IN THE DECLARATION'S OWN NAMES. The stored
    row is columns — `starts_at` — and the rule was written against the field,
    `startsAt`. Merged under the wrong keys, every lookup is `undefined`, the
    rule takes its "not enough to judge" branch, and every update passes. It only
    shows on an edit that changes something OTHER than the field in question,
    which is why this case moves the coach and leaves the time where it was.
  */
  it("refuses a coach being swapped onto an hour they already have", async () => {
    const theirs = await coach("/api/booking.create", {
      client: ro, startsAt: "2026-09-07T14:00:00.000Z", minutes: 60, coach: "mem_gil", state: "booked",
    });
    const other = await coach("/api/booking.create", {
      client: tam, startsAt: "2026-09-07T14:00:00.000Z", minutes: 60, coach: "mem_hal", state: "booked",
    });
    expect(theirs.status).toBe(200);
    expect(other.status).toBe(200);

    /* ⚠️ Only the coach changes; the time comes from the stored row. */
    const swapped = await coach("/api/booking.update", {
      id: other.body.id, version: 1, changes: { coach: "mem_gil" },
    });
    expect(swapped.status).toBe(409);
    expect(swapped.body.meta).toMatchObject({ reason: "coach_double_booked" });
  });

  /*
    ⚠️ AND A ROW IS NOT A CLASH WITH ITSELF, which is what an edit is. Without
    that, changing the note on a booking is refused because the booking exists.
  */
  it("lets a booking be edited without clashing with itself", async () => {
    const made = await coach("/api/booking.create", {
      client: ro, startsAt: "2026-09-04T08:00:00.000Z", minutes: 60, coach: "mem_eli", state: "booked",
    });
    const edited = await coach("/api/booking.update", {
      id: made.body.id, version: 1, changes: { note: "bring the belt" },
    });
    expect(edited.status).toBe(200);
  });

  it("records that somebody did not turn up, without losing the appointment", async () => {
    const made = await coach("/api/booking.create", {
      client: ro, startsAt: "2026-09-05T08:00:00.000Z", minutes: 60, coach: "mem_fay", state: "booked",
    });
    expect((await coach("/api/booking.update", { id: made.body.id, version: 1, changes: { state: "missed" } })).status).toBe(200);
    expect((await coach(`/api/booking.read?id=${made.body.id}`)).body.row).toMatchObject({ state: "missed" });
  });
});

/* --------------------------------------------------------------- seeing --- */

describe("what a client can see", () => {
  /*
    ⚠️ THEIR OWN, AND THE ROW SCOPE IS WHAT MAKES THAT TRUE RATHER THAN A FILTER
    SOMEBODY REMEMBERED. A subject-scoped collection narrows for a caller who IS
    a customer, so one client asking for the list cannot be answered with
    another's diary.
  */
  it("sees their own appointments and nobody else's", async () => {
    await coach("/api/member.invite", { email: "ro@swaledale.example.test", role: "client", subjectId: ro });
    const them = as(await signIn("ro@swaledale.example.test", STUDIO));

    const mine = await them("/api/booking.list");
    expect(mine.status).toBe(200);
    const rows = mine.body.rows as unknown as { client_id: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.client_id === ro)).toBe(true);
  });

  /*
    ⚠️ AND THEY DO NOT BOOK THEMSELVES. A diary anybody can write into is not a
    diary — the front desk owns it, which is what `booking:write` says.
  */
  it("cannot book anything", async () => {
    const them = as(await signIn("ro@swaledale.example.test", STUDIO));
    const out = await them("/api/booking.create", {
      startsAt: "2026-09-06T08:00:00.000Z", minutes: 60, coach: "mem_ash", state: "booked",
    });
    expect(out.status).toBe(403);
  });
});
