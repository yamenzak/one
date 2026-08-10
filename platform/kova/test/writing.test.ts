/**
 * WHAT A STUDIO WRITES, AND WHO CAN READ IT.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together.
 *
 * ⚠️ THE DEFECT THIS SUITE EXISTS FOR IS A DRAFT A CLIENT CAN READ. It is the
 * ordinary shape of the mistake: give clients the collection's read permission,
 * filter the list to published in the screen, and every half-written piece in
 * the studio is one request away. So the client's read is a DIFFERENT operation
 * behind a different permission, and the assertions below are about what the
 * collection's own list refuses as much as about what the feed returns.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "nidderdale";
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
  async upload(body: ArrayBuffer, query: string, contentType: string) {
    const res = await worker.fetch(
      new Request(`${STUDIO}/api/file.upload?${query}`, {
        method: "POST", headers: { "content-type": contentType, cookie }, body,
      }),
      env as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, never> };
  },
});

/** A JPEG carrying an Exif segment, as a phone sends one. */
const photo = (tag: number): ArrayBuffer =>
  new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
    0xff, 0xdb, 0x00, 0x05, 1, 2, 3, 0xff, 0xda, 0x00, 0x02, 9, 9, tag, 0xff, 0xd9,
  ]).buffer;

type Article = { id: string; title: string; publishedOn: string | null };

let coach: ReturnType<typeof as>;
let coachCookie = "";
let ro = "";
let draft = "";
let live = "";

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  coachCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  coach = as(coachCookie);

  const person = await coach.call("/api/client.create", { name: "Ro Adeyemi" });
  expect(person.status, "the roster fixture must not have hit the client quota").toBe(200);
  ro = person.body.id as unknown as string;
  await coach.call("/api/member.invite", { email: "ro@nidderdale.example.test", role: "client", subjectId: ro });
});

/* --------------------------------------------------------------- writing --- */

describe("writing something", () => {
  it("keeps a draft, unpublished", async () => {
    const made = await coach.call("/api/article.create", {
      title: "Sleeping enough to train", body: "Most of the progress happens while you are asleep.",
    });
    expect(made.status).toBe(200);
    draft = made.body.id as unknown as string;
    expect((await coach.call(`/api/article.read?id=${draft}`)).body.row).toMatchObject({ publishedOn: null });
  });

  /*
    ⚠️ A COVER IS A FILE, AND THE FIELD SAYS WHICH KIND. Setting it to a
    twenty-megabyte demonstration video would render as a broken image on every
    client's feed, a long way from the write that caused it.
  */
  it("takes a cover uploaded without leaving the product", async () => {
    const uploaded = await coach.upload(photo(1), "name=sleep.jpg&purpose=cover", "image/jpeg");
    expect(uploaded.status).toBe(200);
    const set = await coach.call("/api/article.update", {
      id: draft, version: 1, changes: { cover: uploaded.body.id },
    });
    expect(set.status).toBe(200);
    expect((await coach.call(`/api/article.read?id=${draft}`)).body.row).toMatchObject({ cover: uploaded.body.id });
  });

  it("refuses a cover that is not a picture", async () => {
    const film = await coach.upload(
      new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 7]).buffer,
      "name=clip.mp4&purpose=demo", "video/mp4",
    );
    expect(film.status).toBe(200);
    const refused = await coach.call("/api/article.update", { id: draft, version: 2, changes: { cover: film.body.id } });
    expect(refused.status).toBe(400);
  });
});

/* ------------------------------------------------------------ publishing --- */

describe("publishing", () => {
  /*
    ⚠️ THE DATE COMES FROM THE SERVER'S CLOCK. Publishing through the derived
    update would work and would let somebody date a piece last year, which is a
    claim about when a studio said something.
  */
  it("stamps the day it went out", async () => {
    const made = await coach.call("/api/article.create", {
      title: "Eating before a session", body: "Something small, an hour before, is usually enough.",
    });
    live = made.body.id as unknown as string;
    const out = await coach.call("/api/article.publish", { articleId: live });
    expect(out.status).toBe(200);
    expect(String(out.body.publishedOn)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await coach.call(`/api/article.read?id=${live}`)).body.row).toMatchObject({ publishedOn: out.body.publishedOn });
  });

  /*
    ⚠️ AN EMPTY PIECE IS NOT PUBLISHABLE. It reaches every client the studio has,
    and "we sent them a blank page" is not a mistake worth allowing for the sake
    of an unconstrained write.
  */
  it("refuses one with nothing in it", async () => {
    const empty = await coach.call("/api/article.create", { title: "Coming soon", body: "   " });
    const out = await coach.call("/api/article.publish", { articleId: empty.body.id });
    expect(out.status).toBe(400);
    expect(out.body.meta).toMatchObject({ field: "body" });
  });

  it("refuses one that is not this studio's", async () => {
    expect((await coach.call("/api/article.publish", { articleId: "art_elsewhere" })).status).toBe(404);
  });
});

/* ------------------------------------------------------------- the feed --- */

describe("what a client reads", () => {
  /*
    ⚠️ THE PUBLISHED ONES, AND NOTHING ELSE. This is the whole capability: a feed
    that leaked a draft would be the studio's unfinished thinking sent to the
    people it coaches.
  */
  it("sees what was published and not what was not", async () => {
    const them = as(await signIn("ro@nidderdale.example.test", STUDIO));
    const out = await them.call("/api/article.feed");
    expect(out.status).toBe(200);

    const feed = out.body.articles as unknown as Article[];
    expect(feed.map((a) => a.id)).toContain(live);
    expect(feed.map((a) => a.id)).not.toContain(draft);
    expect(feed.every((a) => a.publishedOn !== null)).toBe(true);
  });

  /*
    ⚠️ AND THE COLLECTION'S OWN LIST IS CLOSED TO THEM. A client holding
    `article:read` would reach every draft in the studio through it — the feed
    being correct is not a defence if the door beside it is open.
  */
  it("cannot reach the drafts through the collection", async () => {
    const them = as(await signIn("ro@nidderdale.example.test", STUDIO));
    expect((await them.call("/api/article.list")).status).toBe(403);
    expect((await them.call(`/api/article.read?id=${draft}`)).status).toBe(403);
    expect((await them.call("/api/article.create", { title: "Mine", body: "x" })).status).toBe(403);
  });

  it("is refused entirely to somebody with no session", async () => {
    expect((await as("").call("/api/article.feed")).status).toBe(403);
  });
});
