/**
 * SUPPLEMENTS, LABS AND WHO COACHES WHOM.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together.
 *
 * ⚠️ THE SHARP EDGE IN THIS FILE IS WHO WRITES WHAT. A client records that they
 * took something and may not prescribe it; they read what a lab said and may not
 * write it up. Those are two different permissions on two collections that look
 * alike, and the version of this that fails hands a client `supplement:write`
 * because it was next to `dose:write` in a list.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "wensleydale";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const as = (cookie: string) => ({
  async call(path: string, body?: unknown) {
    const res = await worker.fetch(
      new Request(`${STUDIO}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
  /** ⚠️ Another studio's origin, for the one case that is about two of them. */
  async at(origin: string, path: string, body?: unknown) {
    const res = await worker.fetch(
      new Request(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
  async upload(body: ArrayBuffer, query: string, contentType: string) {
    const res = await worker.fetch(
      new Request(`${STUDIO}/api/file.upload?${query}`, { method: "POST", headers: { "content-type": contentType, cookie }, body }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
});

const photo = (tag: number): ArrayBuffer =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
    0xff, 0xdb, 0x00, 0x05, 1, 2, 3, 0xff, 0xda, 0x00, 0x02, 9, 9, tag, 0xff, 0xd9]).buffer;

let coach: ReturnType<typeof as>;
let coachCookie = "";
let ro = "";
let client: ReturnType<typeof as>;

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  coachCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  coach = as(coachCookie);

  const made = await coach.call("/api/client.create", { name: "Ro Adeyemi" });
  expect(made.status, "the roster fixture must not have hit the client quota").toBe(200);
  ro = made.body.id as unknown as string;

  /* ⚠️ The membership NAMES the record, which is what makes them a customer. */
  await coach.call("/api/member.invite", { email: "ro@wensleydale.example.test", role: "client", subjectId: ro });
  client = as(await signIn("ro@wensleydale.example.test", STUDIO));

  /* Eating is a sold capability, and a supplement is part of it. */
  await coach.call("/api/commerce.package.save", {
    id: "full", name: "Coaching + nutrition", price: { minor: 12_000, currency: "USD" },
    flags: { nutrition: true }, budgets: { nutrition: 30 }, oncePerCustomer: false,
  });
  await coach.call("/api/commerce.grant", { subjectId: ro, packageId: "full" });
});

/* ---------------------------------------------------------- supplements --- */

describe("prescribing something", () => {
  let iron = "";

  /*
    ⚠️ THE REASON IS REQUIRED. A supplement with a dose and no stated reason is a
    prescription nobody can review — not the client deciding whether to keep
    taking it, not the next coach, and not the coach themselves in six months.
  */
  it("records what, how much, and why", async () => {
    const made = await coach.call("/api/supplement.create", {
      client: ro, name: "Iron", dose: "14 mg", timing: "with breakfast",
      why: "Ferritin at the low end and training volume going up.",
    });
    expect(made.status).toBe(200);
    iron = made.body.id as unknown as string;
    expect((await coach.call(`/api/supplement.read?id=${iron}`)).body.row).toMatchObject({ name: "Iron", dose: "14 mg" });
  });

  it("refuses one with no reason against it", async () => {
    const out = await coach.call("/api/supplement.create", { client: ro, name: "Magnesium", dose: "300 mg" });
    expect(out.status).toBe(400);
  });

  /*
    ⚠️ A CLIENT READS WHAT WAS PRESCRIBED AND DOES NOT PRESCRIBE. This is the
    assertion the version of this that fails would miss: `supplement:write` and
    `dose:write` sit next to each other in a list, and handing over both is one
    line that turns a coaching record into a self-service one.
  */
  it("is read by the client and written by nobody else", async () => {
    expect((await client.call("/api/supplement.list")).status).toBe(200);
    const out = await client.call("/api/supplement.create", {
      name: "Whatever I like", dose: "lots", why: "because",
    });
    expect(out.status).toBe(403);
  });

  /*
    ⚠️ AND TAKING IT IS THE CLIENT'S OWN RECORD, a row per day rather than a
    tick. "Did you take it this week" is a question a coach asks and a client
    half-remembers; a day and a count is the only version either can look back at.
  */
  it("lets the client record taking it, day by day", async () => {
    const took = await client.call("/api/dose.create", { supplement: iron, day: "2026-09-01", taken: true });
    expect(took.status).toBe(200);
    const missed = await client.call("/api/dose.create", { supplement: iron, day: "2026-09-02", taken: false });
    expect(missed.status).toBe(200);

    const mine = (await client.call("/api/dose.list")).body.rows as unknown as { client_id: string }[];
    expect(mine).toHaveLength(2);
    expect(mine.every((d) => d.client_id === ro)).toBe(true);
  });

  /*
    ⚠️ AND IT IS GATED ON WHAT THEY BOUGHT, like everything else on the eating
    side. A lapsed client keeps every dose they ever recorded and cannot add one.
  */
  it("is withheld from a client whose package does not include eating", async () => {
    const other = await coach.call("/api/client.create", { name: "Tam Okonjo" });
    expect(other.status).toBe(200);
    await coach.call("/api/member.invite", { email: "tam@wensleydale.example.test", role: "client", subjectId: other.body.id });
    const them = as(await signIn("tam@wensleydale.example.test", STUDIO));

    expect((await them.call("/api/supplement.list")).status).toBe(200);
    expect((await them.call("/api/dose.create", { day: "2026-09-01", taken: true })).status).toBe(403);
  });
});

/* ---------------------------------------------------------------- labs --- */

describe("asking for a lab test", () => {
  let panel = "";

  /*
    ⚠️ ONE RECORD, NOT TWO. A request and a result as separate collections is two
    rows somebody has to match, and the matching is what gets lost.
  */
  it("records the ask, with nothing back yet", async () => {
    const made = await coach.call("/api/lab.create", {
      client: ro, panel: "Full blood count and ferritin", askedOn: "2026-09-01",
      why: "Tiredness through a build phase.",
    });
    expect(made.status).toBe(200);
    panel = made.body.id as unknown as string;
    expect((await coach.call(`/api/lab.read?id=${panel}`)).body.row).toMatchObject({ takenOn: null, report: null });
  });

  /*
    ⚠️ THE REPORT IS A FILE THE STUDIO STORES, not a link to a clinic portal — a
    link is a credential or an expiry, and neither belongs in a coaching record.
  */
  it("takes the report as a file, checked against what the field accepts", async () => {
    const uploaded = await coach.upload(photo(3), "name=bloods.jpg&purpose=cover", "image/jpeg");
    expect(uploaded.status).toBe(200);

    const filed = await coach.call("/api/lab.update", {
      id: panel, version: 1,
      changes: { takenOn: "2026-09-08", report: uploaded.body.id, notes: "Ferritin 24; everything else unremarkable." },
    });
    expect(filed.status).toBe(200);
    expect((await coach.call(`/api/lab.read?id=${panel}`)).body.row).toMatchObject({ report: uploaded.body.id });
  });

  it("refuses a report that is not a picture of one", async () => {
    const film = await coach.upload(
      new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 4]).buffer,
      "name=clip.mp4&purpose=demo", "video/mp4",
    );
    const out = await coach.call("/api/lab.update", { id: panel, version: 2, changes: { report: film.body.id } });
    expect(out.status).toBe(400);
  });

  /*
    ⚠️ THE CLIENT READS IT AND DOES NOT WRITE IT UP. What a report said is a
    clinical reading somebody is responsible for, and a record a client can edit
    is one nobody can rely on afterwards.
  */
  it("is theirs to read and not to write", async () => {
    const mine = (await client.call("/api/lab.list")).body.rows as unknown as { id: string }[];
    expect(mine.map((l) => l.id)).toContain(panel);
    expect((await client.call("/api/lab.update", { id: panel, version: 2, changes: { notes: "actually fine" } })).status).toBe(403);
  });
});

/* --------------------------------------------------------- who coaches --- */

describe("who works with whom", () => {
  it("assigns a coach, and the client can see who theirs are", async () => {
    const made = await coach.call("/api/assignment.create", { client: ro, coach: "mem_ash", since: "2026-01-05", lead: true });
    expect(made.status).toBe(200);

    const theirs = (await client.call("/api/assignment.list")).body.rows as unknown as { coach: string; lead: number }[];
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ coach: "mem_ash" });
  });

  /*
    ⚠️ ONE ROW PER COACH PER CLIENT. A second is not a second relationship — it
    is the same one entered twice, and it doubles somebody on every screen that
    lists who is coaching whom.
  */
  it("refuses the same coach twice on one person", async () => {
    const again = await coach.call("/api/assignment.create", { client: ro, coach: "mem_ash", since: "2026-02-01" });
    expect(again.status).toBe(409);
    expect(again.body.meta).toMatchObject({ reason: "already_assigned" });
  });

  /*
    ⚠️ AND A ROW IS NOT A CLASH WITH ITSELF, which is what an edit is. Without
    that, naming somebody the lead coach is refused because they are already the
    coach — and the rule reads as correct right up to the first change.
  */
  it("lets an assignment be edited without clashing with itself", async () => {
    const held = (await coach.call("/api/assignment.list")).body.rows as unknown as { id: string; version: number }[];
    const mine = held[0]!;
    expect((await coach.call("/api/assignment.update", { id: mine.id, version: mine.version, changes: { lead: false } })).status).toBe(200);
  });

  it("allows a second coach on the same person", async () => {
    expect((await coach.call("/api/assignment.create", { client: ro, coach: "mem_bea", since: "2026-02-01" })).status).toBe(200);
  });

  /*
    ⚠️ AND THE RULE HAS TO SEE WHOSE ROW IT IS ON AN EDIT. The subject is not one
    of the declared fields, so a merge that walked the fields alone hands the
    rule a row belonging to nobody — it finds no client, takes its "not enough to
    judge" branch, and passes every update. Swapping one coach onto another the
    same person already has is the case that shows it.
  */
  it("refuses a coach being swapped onto somebody who already has them", async () => {
    const held = (await coach.call("/api/assignment.list")).body.rows as unknown as { id: string; version: number; coach: string; client_id: string }[];
    const bea = held.find((a) => a.coach === "mem_bea" && a.client_id === ro)!;
    const out = await coach.call("/api/assignment.update", { id: bea.id, version: bea.version, changes: { coach: "mem_ash" } });
    expect(out.status).toBe(409);
    expect(out.body.meta).toMatchObject({ reason: "already_assigned" });
  });

  it("allows the same coach on somebody else", async () => {
    const other = (await coach.call("/api/client.list")).body.rows as unknown as { id: string }[];
    const tam = other.find((c) => c.id !== ro)!;
    expect((await coach.call("/api/assignment.create", { client: tam.id, coach: "mem_ash", since: "2026-02-01" })).status).toBe(200);
  });

  /*
    ⚠️ AND A CLIENT DOES NOT DECIDE WHO COACHES THEM. Hiring is the studio's,
    which is the same line `member:manage` draws one level up.
  */
  it("is not the client's to change", async () => {
    expect((await client.call("/api/assignment.create", { coach: "mem_cy", since: "2026-03-01" })).status).toBe(403);
  });
});

/* --------------------------------------------------------- one catalogue --- */

/**
 * ⚠️ A PACKAGE IS NAMED BY THE STUDIO, AND THE NAMES PEOPLE PICK COLLIDE.
 *
 * Every other row in this platform generates its key; this one lets a workspace
 * choose the word, which is right. Keyed on the word ALONE it means two studios
 * that both call something `full` share one row — the second to save overwrites
 * the first's price, its capabilities and its days, and takes the row's tenant
 * with it, so the package does not merely change: it MOVES, disappearing from
 * one studio's list and appearing in another's.
 *
 * This was found by naming a package `full` in a second studio, which is not a
 * clever test — it is what the second customer does.
 */
describe("two studios that pick the same word", () => {
  it("keep their own package", async () => {
    const OTHER = "https://aysgarth.kova.4dl.app";
    const founding = await signIn("aysgarth@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "aysgarth" }, founding);
    const them = as(await signIn("aysgarth@example.test", OTHER));

    const saved = await them.at(OTHER, "/api/commerce.package.save", {
      id: "full", name: "Their own thing", price: { minor: 999, currency: "USD" },
      flags: {}, budgets: { coaching: 7 }, oncePerCustomer: false,
    });
    expect(saved.status).toBe(200);

    /* Their own list holds their own package, under the word they chose. */
    const theirs = (await them.at(OTHER, "/api/commerce.packages")).body.packages as unknown as { id: string; name: string }[];
    expect(theirs.find((p) => p.id === "full")!.name).toBe("Their own thing");

    /* ⚠️ And ours is untouched: same word, different studio, different package. */
    const ours = (await coach.call("/api/commerce.packages")).body.packages as unknown as { id: string; name: string }[];
    expect(ours.find((p) => p.id === "full")!.name).toBe("Coaching + nutrition");
  });
});
