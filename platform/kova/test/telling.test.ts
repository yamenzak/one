/**
 * WHAT AN APP DECLARES FOR A PERSON TO READ, AND WHETHER ANYBODY CAN.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN, and the slug is minted per attempt.
 *
 * Three registries were declared, validated, guarded and unreachable: eleven
 * help articles nothing served, two legal documents with `mustAccept` roles
 * against no ledger, and twenty-one versions of release notes the runtime never
 * read. Every one of them looked covered, because the checking was thorough — a
 * guard that asks whether an article is short enough and free of developer
 * vocabulary cannot ask whether anybody can open it.
 *
 * So this file asserts reachability first and correctness second, in that order,
 * because that is the order the mistakes happened in.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { freshSlug, post, SETUP, signIn } from "./session.js";
import { kova } from "../src/manifest.js";

const SLUG = freshSlug("garrigill");
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const at = (cookie: string) => ({
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
});

let owner: ReturnType<typeof at>;
const stranger = at("");

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  owner = at(await signIn(`${SLUG}@example.test`, STUDIO));
});

/* ------------------------------------------------------------------ help --- */

describe("the help this product ships", () => {
  /*
    ⚠️ THE ASSERTION THAT WOULD HAVE FAILED FOR TWENTY-ONE VERSIONS. Kova has
    declared these articles since its first increment and nothing served one.
  */
  it("can be read", async () => {
    const out = await owner.get("/api/help.list");
    expect(out.status).toBe(200);
    const articles = out.body.articles as unknown as { id: string; title: string; body: string }[];
    expect(articles.length).toBe(Object.keys(kova.help).length);
    expect(articles.map((a) => a.id)).toContain("clients");
  });

  /*
    ⚠️ WITHOUT A SESSION, and that is not an oversight to tighten. Help is the
    product's own documentation — identical for every workspace, containing
    nobody's data — and the person most likely to need it is the one who cannot
    get in. A help centre behind a sign-in makes "I can't sign in" unanswerable.
  */
  it("is readable by somebody who is not signed in", async () => {
    const out = await stranger.get("/api/help.list");
    expect(out.status).toBe(200);
    expect((out.body.articles as unknown as unknown[]).length).toBeGreaterThan(0);
  });

  /*
    ⚠️ OFFERED FROM A SURFACE RATHER THAN SEARCHED FOR, which is the whole reason
    an article names the collections it explains. A help centre you have to go
    and find is one nobody opens at the moment they are stuck.
  */
  it("can be asked for the article about one surface", async () => {
    const out = await owner.get("/api/help.list", { surface: "movement" });
    const articles = out.body.articles as unknown as { id: string; surfaces: string[] }[];
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) expect(a.surfaces).toContain("movement");
    expect(articles.length).toBeLessThan(Object.keys(kova.help).length);
  });

  /* ⚠️ A surface nobody wrote about is an empty answer, not every article —
     which is what an unfiltered fallback would produce, at the one moment the
     reader is looking for something specific. */
  it("answers nothing for a surface nobody wrote about", async () => {
    const out = await owner.get("/api/help.list", { surface: "not-a-collection" });
    expect(out.body.articles as unknown as unknown[]).toEqual([]);
  });
});

/* -------------------------------------------------------------- releases --- */

describe("what changed in this product", () => {
  it("can be read, most recent first", async () => {
    const out = await stranger.get("/api/changelog.list");
    expect(out.status).toBe(200);
    const releases = out.body.releases as unknown as { version: string; notes: string[] }[];
    expect(releases[0]!.version).toBe(kova.manifestVersion);
    expect(releases[0]!.notes.length).toBeGreaterThan(0);
  });

  /*
    ⚠️ AND THE VERSION TRAVELS WITH IT. A changelog whose entries a reader cannot
    place against what they are actually running is a list of claims — and "is my
    deployment the one with that fix" is the only question anybody opens one to
    answer.
  */
  it("says which version this deployment is", async () => {
    expect((await stranger.get("/api/changelog.list")).body.version).toBe(kova.manifestVersion);
  });
});

/* ----------------------------------------------------------------- legal --- */

describe("the documents this product asks you to agree to", () => {
  /* ⚠️ Readable before signing up, because somebody deciding whether to sign up
     has to be able to read the terms first. */
  it("are readable by somebody who is not signed in", async () => {
    const out = await stranger.get("/api/legal.list");
    expect(out.status).toBe(200);
    expect((out.body.documents as unknown as { id: string }[]).map((d) => d.id)).toEqual(["terms", "privacy"]);
  });

  /* ⚠️ And what one person has agreed to is theirs — an unsigned reader is told
     about the documents and about nobody's acceptances. */
  it("tell a stranger nothing about anybody's acceptances", async () => {
    expect((await stranger.get("/api/legal.list")).body.outstanding as unknown as unknown[]).toEqual([]);
  });

  it("says what this person still has to accept", async () => {
    const out = await owner.get("/api/legal.list");
    const outstanding = out.body.outstanding as unknown as { id: string; version: string }[];
    /* An owner must accept both, and has accepted neither. */
    expect(outstanding.map((d) => d.id).sort()).toEqual(["privacy", "terms"]);
  });

  it("stops asking once they have", async () => {
    expect((await owner.call("/api/legal.accept", { document: "terms", version: "2026-01-01" })).status).toBe(200);
    const outstanding = (await owner.get("/api/legal.list")).body.outstanding as unknown as { id: string }[];
    expect(outstanding.map((d) => d.id)).toEqual(["privacy"]);
  });

  /*
    ⚠️ AN ACCEPTANCE IS AGAINST A VERSION, NOT AGAINST A DOCUMENT. Recording it
    against the document alone means publishing new terms silently inherits every
    consent ever given — the one property the ledger exists to deny, and the
    first thing a regulator asks about.
  */
  it("asks again when the document changes", async () => {
    const accepted = [{ document: "terms", version: "2026-01-01", at: "x" }];
    const { outstandingFor } = await import("@one/runtime");
    expect(outstandingFor(
      [{ id: "terms", version: "2027-01-01", mustAccept: ["owner"] }], "owner", accepted,
    ).map((d) => d.id)).toEqual(["terms"]);
  });

  /*
    ⚠️ A VERSION NOBODY PUBLISHED IS REFUSED. Without this a client records
    consent to something that was never asked for — a ledger row that satisfies
    the obligation, refers to nothing, and satisfies it forever.
  */
  it("refuses a version nobody published", async () => {
    expect((await owner.call("/api/legal.accept", { document: "terms", version: "1999-01-01" })).status).toBe(404);
    expect((await owner.call("/api/legal.accept", { document: "invented", version: "2026-01-01" })).status).toBe(404);
  });

  /* ⚠️ Public is the LANE, not the audience. Agreeing to something needs
     somebody to agree, or this is an unauthenticated write against whatever
     account id arrived. */
  it("cannot be accepted by nobody", async () => {
    expect((await stranger.call("/api/legal.accept", { document: "terms", version: "2026-01-01" })).status).toBe(403);
  });

  /*
    ⚠️ AND CONSENT IS NEVER A TOOL. It is the one thing in this platform that has
    to come from a person: a model that can agree to terms on somebody's behalf
    makes the whole ledger worthless as evidence, which is the only thing it is
    for.
  */
  it("is not offered to a model", async () => {
    const tools = (await owner.get("/api/tools.list")).body.tools as unknown as { operationId: string }[];
    const offered = tools.map((t) => t.operationId);
    /*
      ⚠️ THE POSITIVE HALF IS WHAT MAKES THE NEGATIVE ONE MEAN ANYTHING. Written
      without it — and reading `t.id`, which a tool does not have — this asserted
      that an array of `undefined` did not contain a string, and passed whatever
      the answer was. It survived the mutation that offers consent to a model.
    */
    expect(offered).toContain("client.create");
    expect(offered).not.toContain("legal.accept");
  });
});
