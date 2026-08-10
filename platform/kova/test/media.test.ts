/**
 * PHOTOGRAPHS AND VIDEO, THROUGH THE REAL WORKER — a face on a roster, a
 * demonstration on a movement, and the storage both count against.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together.
 *
 * ⚠️ THE BODY IS RAW BYTES AND EVERYTHING ABOUT THE FILE TRAVELS IN THE QUERY
 * STRING. Read as text and re-encoded, a photograph comes back the right length,
 * the right type and corrupt, with nothing anywhere reporting a failure — so
 * this cannot be proved anywhere but against a real request.
 *
 * ⚠️ AND A MEDIA FIELD IS A TEXT COLUMN. `field.media({ accept, maxBytes })`
 * declares a policy that the collection's own DDL cannot enforce, so what is
 * asserted below is that the WRITE enforces it: a face may not be a video, a
 * file that is not there, or a file too large to be one.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { joinAs, post, SETUP, signIn } from "./session.js";

const SLUG = "wharfedale";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

/** A JPEG carrying an Exif segment, as a phone sends one. */
const photo = (tag: number): ArrayBuffer =>
  new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
    0xff, 0xdb, 0x00, 0x05, 1, 2, 3,
    0xff, 0xda, 0x00, 0x02, 9, 9, tag,
    0xff, 0xd9,
  ]).buffer;

/** An MP4 header, enough to be a distinct file of a different type. */
const clip = (tag: number): ArrayBuffer =>
  new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, tag]).buffer;

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
  async upload(body: ArrayBuffer, query: string, contentType: string) {
    const res = await worker.fetch(
      new Request(`${STUDIO}/api/file.upload?${query}`, {
        method: "POST",
        headers: { "content-type": contentType, ...(cookie ? { cookie } : {}) },
        body,
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
  async raw(path: string) {
    return worker.fetch(new Request(`${STUDIO}${path}`, { headers: cookie ? { cookie } : {} }), env as never);
  },
});

let coach: ReturnType<typeof as>;
let coachCookie = "";
let face = "";

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  coachCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  coach = as(coachCookie);

  const first = await coach.upload(photo(1), "name=ro.jpg&purpose=avatar", "image/jpeg");
  expect(first.status, "the fixture upload must succeed").toBe(200);
  face = first.body.id as unknown as string;
});

/* --------------------------------------------------------------- upload --- */

describe("putting a file into the studio", () => {
  it("stores it, strips what a phone attached, and says which", async () => {
    const out = await coach.upload(photo(2), "name=session.jpg&purpose=avatar", "image/jpeg");
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ stripped: true, fresh: true });
    expect(Number(out.body.bytes)).toBeGreaterThan(0);
  });

  /*
    ⚠️ THE SAME BYTES AGAIN ARE FREE. Somebody retrying after a dropped
    connection must not be charged twice for one object, or refused for room the
    first attempt already took.
  */
  it("recognises a file it already has rather than storing it twice", async () => {
    const again = await coach.upload(photo(1), "name=ro-again.jpg&purpose=avatar", "image/jpeg");
    expect(again.body).toMatchObject({ id: face, fresh: false });
  });

  /*
    ⚠️ THE PURPOSE IS A POLICY, and it is checked against what ARRIVED rather
    than against the file name. An extension is whatever somebody typed.
  */
  it("refuses a video where the studio declared photographs", async () => {
    const out = await coach.upload(clip(1), "name=ro.mp4&purpose=avatar", "video/mp4");
    expect(out.status).toBe(400);
  });

  it("takes a video where the studio declared one", async () => {
    const out = await coach.upload(clip(2), "name=squat.mp4&purpose=demo", "video/mp4");
    expect(out.status).toBe(200);
  });
});

/* -------------------------------------------------------------- library --- */

describe("reusing what is already there", () => {
  /*
    ⚠️ THE LIBRARY IS WHAT MAKES AN UPLOAD REUSABLE. Without it every screen that
    wants a photograph asks for a new one, and a studio pays to store the same
    demonstration a dozen times under a dozen names.
  */
  it("lists what this studio has stored, newest first", async () => {
    const out = await coach.call("/api/file.list");
    expect(out.status).toBe(200);
    const files = out.body.files as unknown as { id: string; name: string; purpose: string }[];
    expect(files.some((f) => f.id === face)).toBe(true);
    expect(files.some((f) => f.purpose === "demo")).toBe(true);
  });

  /*
    ⚠️ USED AND ALLOWED TRAVEL TOGETHER. A number with nothing to measure it
    against is not an answer to "how much of my storage is left", and it is the
    only question anybody asks about storage until they run out.
  */
  it("says how much is used against what the plan allows", async () => {
    const out = await coach.call("/api/file.list");
    expect(Number(out.body.used)).toBeGreaterThan(0);
    /* A studio that never chose a plan is parked, and the parked ceiling is real. */
    expect(Number(out.body.allowance)).toBeGreaterThan(Number(out.body.used));
  });

  /*
    ⚠️ THERE IS NO PUBLIC URL. A signed link is a credential in a string: it
    survives being pasted into a message and a browser history, and it cannot be
    revoked without rotating everything. Reading through the app means the same
    checks that guard every other read guard this one.
  */
  it("answers with the bytes, at their own type, to somebody the gate admitted", async () => {
    const res = await coach.raw(`/api/file.read?id=${face}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("refuses a stranger with no session", async () => {
    expect((await as("").raw(`/api/file.read?id=${face}`)).status).toBe(403);
  });
});

/* ---------------------------------------------------------------- faces --- */

describe("giving a client a face", () => {
  /*
    ⚠️ TWO CLIENTS, AGAINST A CEILING OF THREE. Kova sells people, so a fixture
    that adds one per assertion runs out of roster halfway through and every
    later refusal is the quota's rather than the one being tested.
  */
  let ro = "";
  let bea = "";
  let film = "";

  it("keeps the photograph on the record, and hands it back on the read", async () => {
    const made = await coach.call("/api/client.create", { name: "Ro Adeyemi", avatar: face });
    expect(made.status, "the roster fixture must not have hit the client quota").toBe(200);
    ro = made.body.id as unknown as string;
    const back = await coach.call(`/api/client.read?id=${ro}`);
    expect(back.body.row).toMatchObject({ avatar: face, name: "Ro Adeyemi" });
  });

  /*
    ⚠️ THE DECLARED `accept` IS CHECKED, and it has to be checked HERE because
    the column is text. Without it a face can be set to a video that uploaded
    perfectly well under a different purpose — and it renders as a broken image
    on a screen a long way from the write that caused it.
  */
  it("refuses a video as a face, however well the video uploaded", async () => {
    const uploaded = await coach.upload(clip(3), "name=demo.mp4&purpose=demo", "video/mp4");
    expect(uploaded.status).toBe(200);
    film = uploaded.body.id as unknown as string;

    const refused = await coach.call("/api/client.create", { name: "Not a film", avatar: film });
    expect(refused.status).toBe(400);
    expect(refused.body.fields ?? refused.body.meta).toMatchObject({ field: "avatar" });
  });

  it("refuses a file that is not there at all", async () => {
    const refused = await coach.call("/api/client.create", { name: "Ghost", avatar: "med_nothing" });
    expect(refused.status).toBe(400);
  });

  /*
    ⚠️ AND THE UPDATE IS CHECKED TOO. Checking only the create leaves the same
    unverified id one save away — and the save after the first is the write a
    form actually makes.
  */
  it("refuses the same thing on a change, not only on a create", async () => {
    const refused = await coach.call("/api/client.update", { id: ro, version: 1, changes: { avatar: film } });
    expect(refused.status).toBe(400);
  });

  /*
    ⚠️ CLEARING ONE IS NOT SETTING ONE. An empty value takes the photograph off
    the record, which is what "no photograph" is — refusing it would make a face
    impossible to remove once given.

    ⚠️ ON A SECOND CLIENT, because Ro keeps wearing this file for the delete
    below — a fixture that cleared it there would leave nothing pointing at it,
    and the refusal being tested would pass for the wrong reason.
  */
  it("lets a photograph be taken back off", async () => {
    const made = await coach.call("/api/client.create", { name: "Bea Halloran", avatar: face });
    expect(made.status).toBe(200);
    bea = made.body.id as unknown as string;
    const cleared = await coach.call("/api/client.update", { id: bea, version: 1, changes: { avatar: "" } });
    expect(cleared.status).toBe(200);
    expect((await coach.call(`/api/client.read?id=${bea}`)).body.row).toMatchObject({ avatar: "" });
  });
});

/* -------------------------------------------------------------- deleting --- */

describe("deleting a file something is using", () => {
  /*
    ⚠️ REFUSED, AND WHERE IT IS USED IS PART OF THE REFUSAL. Deleting it would
    leave a broken image on a screen a long way from the library the delete was
    pressed in, with nothing connecting the two — and "it is used" without
    "where" is a refusal nobody can act on.
  */
  it("refuses while a client is wearing it, and says where", async () => {
    const out = await coach.call("/api/file.delete", { id: face });
    expect(out.status).toBe(409);
    expect(out.body.meta).toMatchObject({ reason: "in_use" });
    expect(String((out.body.meta as unknown as { used: string }).used)).toContain("client.avatar");
  });

  it("deletes one nothing points at, and frees the room it took", async () => {
    const spare = await coach.upload(photo(9), "name=spare.jpg&purpose=avatar", "image/jpeg");
    const before = Number((await coach.call("/api/file.list")).body.used);
    expect((await coach.call("/api/file.delete", { id: spare.body.id })).status).toBe(200);
    expect(Number((await coach.call("/api/file.list")).body.used)).toBeLessThan(before);
  });
});

/* ----------------------------------------------------------------- them --- */

describe("who may store anything at all", () => {
  /*
    ⚠️ A CLIENT READS AND DOES NOT UPLOAD. Their photographs arrive through the
    surfaces built for them; a general-purpose upload on the studio's own
    storage is the coach's, and a role that holds no `file:write` must be
    refused rather than merely un-navigated to.
  */
  it("refuses somebody the studio invited as a client", async () => {
    const them = as(await joinAs(STUDIO, coachCookie, "ro@wharfedale.example.test", "client"));
    const out = await them.upload(photo(7), "name=mine.jpg&purpose=avatar", "image/jpeg");
    expect(out.status).toBe(403);
  });
});
