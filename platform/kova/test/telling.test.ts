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
  cookie,
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
  /*
    ⚠️ A PERSON WHO HAS AGREED TO NOTHING, which every other fixture in this
    repository no longer is: `signIn` accepts on the way through, because a real
    person does and because the gate refuses every write until they have. These
    tests are about the state before that, so they ask for it explicitly.
  */
  let unsigned: ReturnType<typeof at>;
  let unsignedCookie = "";
  const FRESH = freshSlug("unread");
  beforeAll(async () => {
    /*
      ⚠️ AN OWNER OF THEIR OWN STUDIO, WHICH THIS FIXTURE DID NOT USED TO MAKE.
      It signed a fresh account in at somebody else's origin and expected all
      three documents — including the processing agreement, which is an agreement
      between two BUSINESSES — because the runtime called anybody with no
      membership an owner. It does not any more: a role comes from the membership
      row, so an owner has to actually be one.
    */
    const founding = await signIn(`${FRESH}@example.test`, SETUP, { accept: false });
    await post(SETUP, "/api/identity.workspace.create", { slug: FRESH }, founding);
    unsignedCookie = await signIn(`${FRESH}@example.test`, `https://${FRESH}.kova.4dl.app`, { accept: false });
    unsigned = at(unsignedCookie, `https://${FRESH}.kova.4dl.app`);
  });

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
    const out = await unsigned.get("/api/legal.list");
    const outstanding = out.body.outstanding as unknown as { id: string; version: string }[];
    /* ⚠️ An owner must accept all three and has accepted none. The third is the
       PROCESSING AGREEMENT, which only the owner is asked for — it is the one
       document here that is an agreement between two businesses rather than a
       notice to a person. */
    expect(outstanding.map((d) => d.id).sort()).toEqual(["dpa", "privacy", "terms"]);
  });

  it("stops asking once they have", async () => {
    expect((await unsigned.call("/api/legal.accept", { document: "terms", version: "2026-01-01" })).status).toBe(200);
    const outstanding = (await unsigned.get("/api/legal.list")).body.outstanding as unknown as { id: string }[];
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
    /* ⚠️ BOTH INFERENCE LANES, because the catalogue holds both and a workspace
       chooses between them. This entry came OFF the list when the catalogue was
       Gemini-only and came back with the models — which is the check working in
       both directions rather than a list somebody edited twice. */
    expect(ids).toContain("workers-ai");
    /* ⚠️ And the mail lane, which is a WORKER BINDING rather than an API key —
       so there is no credential in a database, none in a settings screen, and
       nothing to rotate. The entry moved from `resend` to this the day the
       transport did, because `MAIL_LANES` is what the check reads. */
    expect(ids).toContain("cloudflare-email");
    expect(ids).not.toContain("resend");
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

/* -------------------------------------------------------------- the model --- */

/**
 * ⚠️ FOUR LAYERS DECIDE WHICH MODEL RUNS, and until now it was one: the manifest
 * named a model and every workspace on every deployment got it. The catalogue
 * carries two providers precisely so that "which company reads my clients'
 * records" is a decision somebody can make.
 */
describe("which model runs a feature here", () => {
  it("says what is in effect, who decided it, and what else could be picked", async () => {
    const out = await owner.get("/api/ai.models.list");
    expect(out.status).toBe(200);
    const features = out.body.features as unknown as {
      feature: string; inEffect: string | null; decidedBy: string | null; options: { id: string; provider: string }[];
    }[];
    const draft = features.find((f) => f.feature === "draft-plan")!;
    expect(draft.decidedBy).toBe("manifest");
    expect(draft.inEffect).toBe("gemini-2.5-flash");
    /* ⚠️ BOTH LANES ARE OFFERED for a text feature — that is the catalogue being
       a catalogue rather than one provider with a second one disclosed. */
    expect(new Set(draft.options.map((o) => o.provider))).toEqual(new Set(["gemini", "workers-ai"]));
  });

  /*
    ⚠️ AND NOT FOR A FEATURE THAT SENDS A PHOTOGRAPH. The Workers AI rows price
    no image, so `modelSuits` will not offer them — derived from the meter rather
    than declared, because a capability field can disagree with the arithmetic
    and it disagrees in the direction the platform pays for.
  */
  it("does not offer a text model for a feature that reads a picture", async () => {
    const features = (await owner.get("/api/ai.models.list")).body.features as unknown as
      { feature: string; options: { id: string }[] }[];
    const vision = features.find((f) => f.feature === "label-reader")!;
    expect(vision.options.map((o) => o.id).some((id) => id.startsWith("@cf/"))).toBe(false);
    expect(vision.options.length).toBeGreaterThan(0);
  });

  it("takes a choice, reports who decided, and takes it back", async () => {
    const set = await owner.call("/api/ai.models.choose", { feature: "draft-plan", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" });
    expect(set.status).toBe(200);

    const after = (await owner.get("/api/ai.models.list")).body.features as unknown as
      { feature: string; inEffect: string | null; decidedBy: string | null }[];
    const draft = after.find((f) => f.feature === "draft-plan")!;
    expect(draft.inEffect).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(draft.decidedBy).toBe("workspace");

    /* ⚠️ Clearing is expressible, or going back to the product's default would
       be a thing a workspace could do once and never undo. */
    expect((await owner.call("/api/ai.models.choose", { feature: "draft-plan" })).status).toBe(200);
    const back = (await owner.get("/api/ai.models.list")).body.features as unknown as
      { feature: string; decidedBy: string | null }[];
    expect(back.find((f) => f.feature === "draft-plan")!.decidedBy).toBe("manifest");
  });

  /*
    ⚠️ REFUSED AT THE DOOR RATHER THAN STORED. A pick that is not offered would
    be a row resolving to the default forever — a setting that appears to have
    been saved and changes nothing.
  */
  it("refuses a model that cannot do what the feature asks", async () => {
    const out = await owner.call("/api/ai.models.choose", { feature: "label-reader", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" });
    expect(out.status).toBe(400);
  });

  it("refuses a feature this product does not have", async () => {
    expect((await owner.call("/api/ai.models.choose", { feature: "invented", model: "gemini-2.5-flash" })).status).toBe(400);
  });
});

/* ------------------------------------------------------- residency, in full --- */

/**
 * ⚠️ RESIDENCY IS NOT ONLY STORAGE, AND THE PRODUCT HAS TO SAY SO.
 *
 * The allow-list mechanism existed, `generate` enforced it, and no app ever
 * declared one — so a workspace that chose the EU had its photographs sent to
 * exactly the same models as everybody else. Storage residency was real and
 * inference residency was a sentence in a comment.
 */
describe("what a region actually promises", () => {
  it("publishes which models each region permits, before anybody chooses one", async () => {
    const out = await stranger.get("/api/protection.list");
    const inference = out.body.inference as unknown as Record<string, Record<string, string[]>>;
    expect(Object.keys(inference)).toContain("ai");
    /* ⚠️ Every declared region is answered, including the one that narrows
       nothing — an absent entry would read as "no models here". */
    for (const region of kova.tenancy.regions) {
      expect(inference.ai![region], `region ${region} says nothing`).toBeDefined();
      expect(inference.ai![region]!.length).toBeGreaterThan(0);
    }
  });

  /*
    ⚠️ AND THE HONEST ANSWER TODAY IS THAT THE EU LIST IS NOT SHORTER. Neither
    provider offers inference pinned inside the EEA, so an EU studio gets EU
    STORAGE and its generations still leave under the declared safeguards. The
    value of this assertion is that the day that changes, it fails here rather
    than being a promise nobody re-read.
  */
  it("matches the manifest exactly, so the published claim cannot drift from the binding", async () => {
    const inference = (await stranger.get("/api/protection.list")).body.inference as unknown as Record<string, Record<string, string[]>>;
    const declared = (kova.bindings as Record<string, { byRegion?: Record<string, readonly string[]> }>).ai!.byRegion!;
    for (const region of kova.tenancy.regions) {
      expect(inference.ai![region]).toEqual([...declared[region]!]);
    }
  });
});

/* ------------------------------------------------------------ the gate --- */

/**
 * ⚠️ THE LEDGER WAS A RECORD OF AN OBLIGATION RATHER THAN A DISCHARGE OF ONE.
 *
 * `outstandingFor` was computed by `legal.list` and read by no route, no gate
 * and no guard — so a person could use this entire product, forever, without
 * accepting the terms, the privacy notice or the processing agreement, and the
 * ledger would faithfully record that they never had.
 */
describe("what somebody may do before they have agreed to anything", () => {
  /*
    ⚠️ THEIR OWN WORKSPACE, because a 403 for not being a member would look
    exactly like the refusal under test and prove nothing. Founding one is on
    the identity lane, which the gate exempts — somebody has to be able to get
    far enough to be SHOWN a document before they can be held to it.
  */
  const NEW = freshSlug("unagreed");
  let fresh: ReturnType<typeof at>;
  beforeAll(async () => {
    const founding = await signIn(`${NEW}@example.test`, SETUP, { accept: false });
    await post(SETUP, "/api/identity.workspace.create", { slug: NEW }, founding);
    const origin = `https://${NEW}.kova.4dl.app`;
    fresh = at(await signIn(`${NEW}@example.test`, origin, { accept: false }), origin);
  });

  /*
    ⚠️ READS ARE SERVED, AND THE ASYMMETRY IS THE DESIGN. Withholding somebody's
    own records because they have not clicked anything is punitive and helps
    nobody; refusing to record NEW information about a person until they have
    been told what will be done with it is the actual obligation. It is the same
    shape as the standing gate's read-only rung, for the same reason.
  */
  it("lets them read", async () => {
    expect((await fresh.get("/api/client.list")).status).toBe(200);
  });

  it("refuses a write, and names the documents standing in the way", async () => {
    const out = await fresh.call("/api/client.create", { name: "Someone" });
    await fresh.call("/api/consent.record", { subject: out.body.id });
    /* ⚠️ 451, not 403. A legal precondition is a different thing from lacking
       permission, and this one the person can actually do something about. */
    expect(out.status).toBe(451);
    expect(String((out.body as Record<string, Record<string, string>>).meta?.documents)).toContain("privacy");
  });

  /* ⚠️ AND ACCEPTING IS ITSELF A WRITE, so exempting its lane is what stops
     agreeing to the terms from requiring having agreed to the terms. */
  it("lets them accept, which is the one write that must survive the gate", async () => {
    const docs = (await fresh.get("/api/legal.list")).body.outstanding as unknown as { id: string; version: string }[];
    for (const doc of docs) {
      expect((await fresh.call("/api/legal.accept", { document: doc.id, version: doc.version })).status).toBe(200);
    }
    /* ⚠️ And the write goes through afterwards, or the gate is a wall. */
    expect((await fresh.call("/api/client.create", { name: "Someone" })).status).toBe(200);
  });
});

/* ------------------------------------------------------------ article 9 --- */

/**
 * ⚠️ FIFTEEN COLLECTIONS DECLARED `condition: "explicit_consent"` AND NOTHING
 * COLLECTED ANY.
 *
 * The manifest asserted a legal basis the product did not have, which is worse
 * than declaring the wrong one because it reads as diligence. Special-category
 * processing is PROHIBITED without a condition — not merely undocumented — so
 * this refuses rather than shapes.
 */
describe("recording somebody's body needs their say-so", () => {
  let subject = "";
  beforeAll(async () => {
    /* ⚠️ A client nobody recorded consent for — which is what every fixture in
       this repository now does explicitly, one line after creating one, because
       a coach does it in the room. This test is the one that must not. */
    subject = (await owner.call("/api/client.create", { name: "Unasked" })).body.id as unknown as string;
  });

  it("refuses a health write for somebody who has not consented", async () => {
    const out = await owner.call("/api/goal.create", { client: subject, kind: "weight", start: 82, target: 76 });
    expect(out.status).toBe(451);
  });

  /* ⚠️ Reading is not refused: the row that already exists is theirs, and
     withholding it helps nobody. What is refused is recording something NEW. */
  it("still lets their record be read", async () => {
    expect((await owner.get("/api/goal.list")).status).toBe(200);
  });

  it("takes the consent, and then the write goes through", async () => {
    expect((await owner.call("/api/consent.record", { subject })).status).toBe(200);
    const status = await owner.get("/api/consent.status", { subject });
    expect(status.body.given).toBe(true);
    /* ⚠️ And it says WHAT it covers — consent to "everything" is not specific,
       which is one of the three things Article 9 requires it to be. */
    expect((status.body.covers as unknown as string[]).length).toBeGreaterThan(5);

    expect((await owner.call("/api/goal.create", { client: subject, kind: "weight", start: 82, target: 76 })).status).toBe(200);
  });

  /*
    ⚠️ WITHDRAWAL IS THE PROPERTY THAT MAKES IT CONSENT. Article 7(3) requires it
    to be as easy to withdraw as to give — a basis that cannot be withdrawn is
    not consent, it is a different basis wearing the word.
  */
  it("stops accepting new records the moment it is withdrawn", async () => {
    expect((await owner.call("/api/consent.withdraw", { subject })).status).toBe(200);
    expect((await owner.get("/api/consent.status", { subject })).body.given).toBe(false);
    expect((await owner.call("/api/goal.create", { client: subject, kind: "waist", start: 92, target: 86 })).status).toBe(451);
  });

  /*
    ⚠️ AND WITHDRAWING DOES NOT ERASE THAT IT WAS EVER HELD. Deleting the row
    would destroy exactly the evidence needed to show the processing that already
    happened was lawful — withdrawal is not retroactive, and the record of both
    moments is the whole value.
  */
  it("keeps the record of when it was given as well as when it went", async () => {
    const status = await owner.get("/api/consent.status", { subject });
    expect(status.body.at).toBeTruthy();
    expect(status.body.withdrawnAt).toBeTruthy();
  });

  it("takes it again when they change their mind", async () => {
    expect((await owner.call("/api/consent.record", { subject })).status).toBe(200);
    expect((await owner.get("/api/consent.status", { subject })).body.given).toBe(true);
  });

  /* ⚠️ Somebody who adds themselves consents by doing so — otherwise they are a
     person on the roster whose every log is refused, with nothing explaining it. */
  it("is already held for somebody who added themselves", async () => {
    await owner.call("/api/settings.write", { key: "studio.selfRegister", value: true });
    const email = `self-${freshSlug("x")}@example.test`;
    expect((await post(STUDIO, "/api/client.register", { name: "Self", email })).res.status).toBe(200);
    const found = (await owner.get("/api/client.list")).body.rows as unknown as { id: string; email?: string }[];
    const them = found.find((r) => r.email === email)!;
    expect((await owner.get("/api/consent.status", { subject: them.id })).body.given).toBe(true);
  });
});

/* ------------------------------------------------------------- transfers --- */

/**
 * ⚠️ THE ANSWER TO THE QUESTION EVERY COMPLIANCE QUESTIONNAIRE ASKS. It is a
 * join over two declarations the product cannot boot without, so it cannot be
 * the thing every company's is: written from memory once, wrong by the next
 * feature.
 */
describe("what crosses a border", () => {
  it("says who receives what, where, and under which safeguard", async () => {
    const transfers = (await stranger.get("/api/protection.list")).body.transfers as unknown as
      { to: string; where: string; safeguard: string; categories: string[]; special: boolean; subjects: string[] }[];

    const gemini = transfers.find((t) => t.to === "gemini")!;
    /* ⚠️ The one that carries Article 9 data out of the EEA — the row a reviewer
       reads first, computed rather than left to somebody spotting `health`. */
    expect(gemini.special).toBe(true);
    expect(gemini.safeguard).toBe("sccs");
    expect(gemini.categories).toContain("health");
    expect(gemini.subjects).toContain("customer");
  });

  /*
    ⚠️ THE INTERSECTION, so a recipient cannot over-disclose. Open Food Facts
    receives a barcode and nothing else; its entry says `usage`, and this product
    holds no `usage` category on any collection — so the honest transfer is
    empty rather than a category nobody actually sends.
  */
  it("reports nothing for a recipient that receives nothing this product holds", async () => {
    const transfers = (await stranger.get("/api/protection.list")).body.transfers as unknown as
      { to: string; categories: string[]; special: boolean }[];
    const food = transfers.find((t) => t.to === "openfoodfacts")!;
    expect(food.special).toBe(false);
    expect(food.categories.length).toBeLessThanOrEqual(1);
  });

  it("covers every declared sub-processor, so nothing is silently left off", async () => {
    const body = (await stranger.get("/api/protection.list")).body;
    const declared = (body.subprocessors as unknown as { id: string }[]).map((p) => p.id).sort();
    const transferred = (body.transfers as unknown as { to: string }[]).map((t) => t.to).sort();
    expect(transferred).toEqual(declared);
  });
});
