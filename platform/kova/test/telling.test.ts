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

/* ⚠️ The origin is a parameter because a second workspace lives at a second
   address, and driving it from this one is what would make a residency
   assertion pass while proving nothing. */
const at = (cookie: string, origin: string = STUDIO) => ({
  async call(path: string, body?: unknown) {
    const res = await worker.fetch(
      new Request(`${origin}${path}`, {
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
      new Request(`${origin}${path}${q ? `?${q}` : ""}`, { headers: { ...(cookie ? { cookie } : {}) } }),
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
    expect((out.body.documents as unknown as { id: string }[]).map((d) => d.id)).toEqual(["terms", "privacy", "dpa"]);
  });

  /* ⚠️ And what one person has agreed to is theirs — an unsigned reader is told
     about the documents and about nobody's acceptances. */
  it("tell a stranger nothing about anybody's acceptances", async () => {
    expect((await stranger.get("/api/legal.list")).body.outstanding as unknown as unknown[]).toEqual([]);
  });

  it("says what this person still has to accept", async () => {
    const out = await owner.get("/api/legal.list");
    const outstanding = out.body.outstanding as unknown as { id: string; version: string }[];
    /* ⚠️ An owner must accept all three and has accepted none. The third is the
       PROCESSING AGREEMENT, which only the owner is asked for — it is the one
       document here that is an agreement between two businesses rather than a
       notice to a person. */
    expect(outstanding.map((d) => d.id).sort()).toEqual(["dpa", "privacy", "terms"]);
  });

  it("stops asking once they have", async () => {
    expect((await owner.call("/api/legal.accept", { document: "terms", version: "2026-01-01" })).status).toBe(200);
    const outstanding = (await owner.get("/api/legal.list")).body.outstanding as unknown as { id: string }[];
    expect(outstanding.map((d) => d.id)).toEqual(["privacy", "dpa"]);
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
      [{ id: "terms", version: "2027-01-01", title: "Terms", body: "New terms.", mustAccept: ["owner"] }], "owner", accepted,
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

/* ------------------------------------------------------------ protection --- */

/**
 * ⚠️ THE RECORD HAS TO BE PRODUCIBLE, OR IT IS NOT A RECORD.
 *
 * Article 30 obliges keeping one and producing it on request. Every version of
 * that document in the world is a spreadsheet describing the product as it was
 * when somebody last had time — and the drift is invisible, because a processing
 * activity missing from a record looks exactly like one that does not happen.
 * These two routes are what make it a computed answer instead.
 */
describe("what this product discloses about where data goes", () => {
  /*
    ⚠️ PUBLIC, FOR THE SAME REASON THE TERMS ARE. Articles 13 and 14 oblige
    telling somebody who else receives their data BEFORE it is collected, so a
    list behind a session is published after the moment it is owed. It is also
    what a customer's compliance team asks for, and answering that by email is
    how a sub-processor list comes to differ from the product.
  */
  it("names every recipient to somebody who is not signed in", async () => {
    const out = await stranger.get("/api/protection.list");
    expect(out.status).toBe(200);
    const ids = (out.body.subprocessors as unknown as { id: string }[]).map((p) => p.id);
    expect(ids).toContain("cloudflare");
    expect(ids).toContain("gemini");
    expect(ids).toContain("openfoodfacts");
    /* ⚠️ And NOT the lane this product does not use. It was on the list until
       the disclosure check ran; Kova's catalogue is Gemini only. */
    expect(ids).not.toContain("workers-ai");
  });

  it("says where the data is and who to ask about it", async () => {
    const out = await stranger.get("/api/protection.list");
    expect(out.body.contact).toBe("legal@fourdegreelabs.com");
    /* ⚠️ THE REGIONS THE MANIFEST DECLARES, NOT A SENTENCE SOMEBODY WROTE. Kova
       declares one today, and a disclosure naming a region this deployment has
       no store for is wrong in the one field a residency question asks about. */
    expect(out.body.regions as unknown as string[]).toEqual(kova.tenancy.regions);
    /* ⚠️ Two controllers, never merged: a client's rights run against their
       studio, and we act on the studio's instruction. */
    expect(String(out.body.controller)).toMatch(/processor/);
  });

  /*
    ⚠️ EVERY ENTRY CARRIES ITS SAFEGUARD, because "where is it processed" and
    "what covers the transfer" are two questions and the second is the one a
    questionnaire actually asks.
  */
  it("carries a safeguard and processing terms for every one of them", async () => {
    const list = (await stranger.get("/api/protection.list")).body.subprocessors as unknown as
      { id: string; safeguard: string; terms: string; receives: string[] }[];
    expect(list.length).toBeGreaterThan(3);
    for (const p of list) {
      expect(["eea", "adequacy", "sccs", "dpf"]).toContain(p.safeguard);
      expect(p.terms).toMatch(/^https:/);
      expect(p.receives.length).toBeGreaterThan(0);
    }
  });

  /* ⚠️ The RECORD is not public — it names every activity, its basis and its
     retention, which is a description of the business rather than a notice to a
     person. Same permission as the audit trail. */
  it("keeps the record of processing off the public lane", async () => {
    expect((await stranger.get("/api/protection.record")).status).toBe(403);
  });

  it("produces the whole record for somebody who runs the workspace", async () => {
    const out = await owner.get("/api/protection.record");
    expect(out.status).toBe(200);
    const record = out.body.record as unknown as {
      special: boolean;
      activities: { collection: string; basis: string; special: boolean; condition?: string }[];
    };
    /*
      ⚠️ ONE ACTIVITY PER COLLECTION THAT HOLDS SOMETHING, AND NONE FOR THE ONES
      THAT DO NOT. A record listing a shared catalogue as processing describes
      something that does not happen, which is the same kind of wrong as omitting
      something that does.
    */
    const named = record.activities.map((a) => a.collection);
    expect(named).toContain("client");
    expect(named).toContain("scan");
    expect(named).not.toContain("movement");

    /* ⚠️ Article 35's trigger, computed from the collections rather than ticked. */
    expect(record.special).toBe(true);
    const scan = record.activities.find((a) => a.collection === "scan");
    expect(scan?.special).toBe(true);
    expect(scan?.condition).toBe("explicit_consent");
  });
});

/* ---------------------------------------------------------------- regions --- */

/**
 * ⚠️ RESIDENCY THAT HAS TO BE ASKED FOR IS RESIDENCY MOST PEOPLE WHO NEEDED IT
 * NEVER GOT, because they did not know it was a question. `eu` is a choice at
 * the moment a studio is created, and these assert that choosing it does
 * something rather than recording a preference.
 */
describe("a studio chooses where its clients' records live", () => {
  it("offers every region the manifest declares, publicly", async () => {
    const out = await stranger.get("/api/protection.list");
    expect(out.body.regions as unknown as string[]).toContain("eu");
  });

  /*
    ⚠️ THE STORE IS DIFFERENT, NOT A COLUMN. `physicalName` resolves `db` to
    `DB_EU` for a workspace in `eu` and to the bare `DB` for one in `auto`, so a
    record written in the first is not merely tagged — it is in another database,
    and a query in the other region cannot see it however it is written.
  */
  it("writes an EU studio's records to the EU store and nowhere else", async () => {
    const slug = freshSlug("eu");
    const founding = await signIn(`${slug}@example.test`, SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug, region: "eu" }, founding);
    expect(made.res.status).toBe(200);
    expect(made.body.region).toBe("eu");

    const origin = `https://${slug}.kova.4dl.app`;
    const there = at(await signIn(`${slug}@example.test`, origin), origin);
    const name = `Someone ${crypto.randomUUID().slice(0, 8)}`;
    expect((await there.call("/api/client.create", { name })).status).toBe(200);

    /*
      ⚠️ ASSERTED BY WHAT IS THERE, NOT BY HOW MANY. The suite retries once and
      creating a record is not idempotent, so a count is an assertion about how
      many times this test has run — which is the one thing it is not about.
    */
    const inEu = (await there.get("/api/client.list")).body.rows as unknown as { name: string }[];
    expect(inEu.map((r) => r.name)).toContain(name);

    const inAuto = (await owner.get("/api/client.list")).body.rows as unknown as { name: string }[];
    expect(inAuto.map((r) => r.name)).not.toContain(name);
  });

  /*
    ⚠️ A REGION NOBODY DECLARED IS REFUSED RATHER THAN DEFAULTED. Quietly placing
    a workspace somewhere other than where it asked to be is the one failure
    residency cannot have, and a default is exactly how it happens.
  */
  it("refuses a region this deployment does not have", async () => {
    const slug = freshSlug("mars");
    const founding = await signIn(`${slug}@example.test`, SETUP);
    const out = await post(SETUP, "/api/identity.workspace.create", { slug, region: "mars" }, founding);
    expect(out.res.status).toBe(400);
  });
});
