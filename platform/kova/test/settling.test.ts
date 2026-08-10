/**
 * WHAT A STUDIO CHOOSES ABOUT ITSELF, AND THE ADDRESS IT SERVES FROM.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN. A sign-in code is delivered against
 * an EMAIL, so two files signing the same address in stay green alone and fail
 * intermittently together.
 *
 * ⚠️ THE THREAD THROUGH THIS FILE IS A HOSTNAME NOBODY PROVED. A domain claimed
 * and served on the strength of somebody typing it is a takeover: the thing
 * typed may belong to a competitor, a bank, or another workspace on this same
 * deployment. Claim, prove, serve — and the assertions below are as much about
 * what a claim does NOT do as about what verification does.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { freshSlug, joinAs, post, SETUP, signIn } from "./session.js";

/* ⚠️ Fresh per attempt — the file is retried against shared storage, and a fixed
   slug makes the fixture conflict with its own first attempt. */
const SLUG = freshSlug("wharfedale");
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
});

let coachCookie = "";
let foundingCookie = "";
let coach: ReturnType<typeof as>;
let tenantId = "";

beforeAll(async () => {
  foundingCookie = await signIn(`${SLUG}@example.test`, SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, foundingCookie);
  tenantId = made.body.tenantId as string;
  expect(tenantId, `the studio fixture must have been created: ${JSON.stringify(made.body)}`).toBeTruthy();
  coachCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  coach = as(coachCookie);
});

/* -------------------------------------------------------------- settings --- */

describe("what a studio chooses about itself", () => {
  /*
    ⚠️ THE DECLARATION TRAVELS WITH THE VALUES. A screen rendered from a form
    somebody wrote to match the manifest is a screen that drifts from it — a
    setting added and not rendered, one removed and still shown, and a default
    that disagrees with the one the reader applies.
  */
  it("reports what may be set as well as what is", async () => {
    const out = await coach.get("/api/settings.read");
    expect(out.status).toBe(200);
    const declared = out.body.declared as unknown as Record<string, { label: string }>;
    expect(Object.keys(declared)).toContain("studio.weekStart");
    expect(declared["studio.weekStart"]!.label).toBeTruthy();
  });

  /*
    ⚠️ THE FALLBACK IS APPLIED IN ONE PLACE. Three readers each deciding what an
    absent row means is three decisions, and the one that differs is a policy
    that says one thing on the screen and another in the sweep.
  */
  it("answers with the declared fallback before anybody has chosen", async () => {
    const values = (await coach.get("/api/settings.read")).body.values as unknown as Record<string, unknown>;
    expect(values["studio.weekStart"]).toBe("monday");
    expect(values["studio.checkInDays"]).toBe(7);
    expect(values["studio.publishFeed"]).toBe(true);
  });

  it("keeps what was set, in the right type", async () => {
    expect((await coach.call("/api/settings.write", { key: "studio.checkInDays", value: 14 })).status).toBe(200);
    const values = (await coach.get("/api/settings.read")).body.values as unknown as Record<string, unknown>;
    expect(values["studio.checkInDays"]).toBe(14);
  });

  it("refuses a number outside what the declaration allows", async () => {
    expect((await coach.call("/api/settings.write", { key: "studio.checkInDays", value: 400 })).status).toBe(400);
  });

  it("refuses a choice that is not on the list", async () => {
    expect((await coach.call("/api/settings.write", { key: "studio.weekStart", value: "thursday" })).status).toBe(400);
  });

  /*
    ⚠️ AN UNDECLARED KEY IS REFUSED, which is the whole reason this is a registry
    rather than a table with a key column. A store that took anything is a bag of
    strings nobody can migrate, render, or tell the live entries from the dead.
  */
  it("refuses a key nobody declared", async () => {
    expect((await coach.call("/api/settings.write", { key: "studio.whatever", value: "x" })).status).toBe(400);
  });

  it("refuses a value of the wrong kind", async () => {
    expect((await coach.call("/api/settings.write", { key: "studio.publishFeed", value: "yes" })).status).toBe(400);
  });

  /*
    ⚠️ A SETTING MAY BE NARROWER THAN THE SCREEN IT IS ON, and the owner holds
    both — so what this proves is that the narrowing is not a broken control.
    Which permission is refused to whom is proved in `runtime/test/settings.test.ts`,
    where a caller's permissions can be varied; here a second staff member cannot
    exist at all, because the parking plan allows one seat.
  */
  it("lets the owner set a narrower one", async () => {
    expect((await coach.call("/api/settings.write", { key: "studio.publishFeed", value: false })).status).toBe(200);
    const values = (await coach.get("/api/settings.read")).body.values as unknown as Record<string, unknown>;
    expect(values["studio.publishFeed"]).toBe(false);
  });

  /*
    ⚠️ AND THE SEAT CEILING SAYS WHAT IT IS. `platform.quota_reached` renders
    "Your plan includes {limit}, and {used} are in use" — raised without them it
    said "includes undefined, and undefined are in use", which is what somebody
    hitting this actually read.
  */
  it("says what the seat ceiling is when it refuses one", async () => {
    const out = await coach.call("/api/member.invite", { email: `trainer-${SLUG}@example.test`, role: "trainer" });
    expect(out.status).toBe(402);
    expect(out.body.detail as unknown as string).toMatch(/includes 1, and 1 are in use/);
  });

  it("is not a client's to read at all", async () => {
    const client = as(await joinAs(STUDIO, coachCookie, `ro-${SLUG}@example.test`, "client"));
    expect((await client.get("/api/settings.read")).status).toBe(403);
  });
});

/* -------------------------------------------------------------- branding --- */

/*
  ⚠️ THE SIGN-IN SCREEN WEARS THESE, AND IT RENDERS BEFORE THERE IS A SESSION —
  therefore before there is a tenancy whose own database could be read. So the
  three keys are copied to the directory as they are written, and a workspace's
  own customers arrive at a page with the right name on it rather than watching
  the product's name change to theirs.
*/
describe("what a studio looks like", () => {
  it("takes a name and a colour", async () => {
    expect((await coach.call("/api/settings.write", { key: "brand.name", value: "Wharfedale Strength" })).status).toBe(200);
    expect((await coach.call("/api/settings.write", { key: "brand.accent", value: "#2f6f4f" })).status).toBe(200);
    const values = (await coach.get("/api/settings.read")).body.values as unknown as Record<string, unknown>;
    expect(values["brand.name"]).toBe("Wharfedale Strength");
  });

  /*
    ⚠️ A HEX TRIPLE OR NOTHING. Anything a CSS parser would accept is also a way
    to put a `url(...)` or a variable reference into a stylesheet this product
    renders for other people — a stored injection wearing a colour picker's
    clothes.
  */
  it("refuses a colour that is not a colour", async () => {
    for (const bad of ["red", "var(--x)", "url(http://x)", "#fff", "#12345g"]) {
      expect(
        (await coach.call("/api/settings.write", { key: "brand.accent", value: bad })).status,
        `"${bad}" must not be storable as a colour`,
      ).toBe(400);
    }
  });

  it("accepts being cleared back to the product's own", async () => {
    expect((await coach.call("/api/settings.write", { key: "brand.accent", value: "" })).status).toBe(200);
    /* Put it back for the rest of the file. */
    await coach.call("/api/settings.write", { key: "brand.accent", value: "#2f6f4f" });
  });

  /*
    ⚠️ AND IT REACHES THE PLACE THAT CANNOT ASK. This is the assertion the copy
    exists for: a screen with no session reads the directory, so a branding
    change that never got there is one nobody outside the studio ever sees.
  */
  it("reaches the row a screen with no session reads", async () => {
    await coach.call("/api/settings.write", { key: "brand.name", value: "Wharfedale Strength" });
    interface RawDb { prepare(sql: string): { bind(...p: unknown[]): { first<T>(): Promise<T | null> } } }
    const row = await (env as unknown as { DIRECTORY: RawDb }).DIRECTORY
      .prepare(`SELECT branding FROM tenant_directory WHERE tenant_id = ?`)
      .bind(tenantId).first<{ branding: string }>();
    expect(JSON.parse(row!.branding)["brand.name"]).toBe("Wharfedale Strength");
  });
});

/* --------------------------------------------------------------- domains --- */

describe("serving a studio from a domain it owns", () => {
  const MINE = "training.wharfedale.example";

  /*
    ⚠️ SIGNED IN ONCE AND REUSED. A sign-in code is single-use and its row is the
    cooldown row, so asking twice for one address is two round trips where one
    would do — and every extra one is another way for a full run to go wrong for
    reasons that have nothing to do with what is being tested.
  */
  const OTHER = freshSlug("wharfedale-other");
  const OTHER_ORIGIN = `https://${OTHER}.kova.4dl.app`;
  let theirs = "";
  const theOtherStudio = async (): Promise<string> => {
    if (theirs) return theirs;
    const founding = await signIn(`${OTHER}@example.test`, SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: OTHER }, founding);
    theirs = await signIn(`${OTHER}@example.test`, OTHER_ORIGIN);
    return theirs;
  };

  it("claims one, and says what to put in DNS", async () => {
    const out = await coach.call("/api/domain.claim", { hostname: MINE });
    expect(out.status).toBe(200);
    const record = out.body.record as unknown as { name: string; type: string; value: string };
    expect(record.type).toBe("TXT");
    expect(record.name).toContain(MINE);
    expect(record.value).toBeTruthy();
  });

  /*
    ⚠️ CLAIMING ROUTES NOTHING. At that point the only thing known is that
    somebody typed it — and the thing somebody typed may belong to a competitor,
    a bank, or another workspace here. This is the assertion that the three
    states have not been collapsed into two.
  */
  it("serves nothing from it yet", async () => {
    interface RawDb { prepare(sql: string): { bind(...p: unknown[]): { first<T>(): Promise<T | null> } } }
    const row = await (env as unknown as { DIRECTORY: RawDb }).DIRECTORY
      .prepare(`SELECT hostname FROM tenant_domains WHERE hostname = ?`).bind(MINE).first<{ hostname: string }>();
    expect(row, "a claimed domain must route nowhere until it is proved").toBeNull();
  });

  it("refuses a wildcard, a URL and a bare label", async () => {
    for (const bad of ["*.example.com", "https://x.example.com", "localhost", "x.example.com:8787"]) {
      expect(
        (await coach.call("/api/domain.claim", { hostname: bad })).status,
        `"${bad}" must not be claimable`,
      ).toBe(400);
    }
  });

  /*
    ⚠️ THE TOKEN SURVIVES A SECOND CLAIM. Re-issuing it means somebody who has
    already published the DNS record and pressed the button again can never
    verify — what they published no longer matches what we look for.
  */
  it("does not change the record when the same studio claims again", async () => {
    const first = (await coach.call("/api/domain.claim", { hostname: MINE })).body.record as unknown as { value: string };
    const again = (await coach.call("/api/domain.claim", { hostname: MINE })).body.record as unknown as { value: string };
    expect(again.value).toBe(first.value);
  });

  /*
    ⚠️ THE DECISION IS OURS, NOT THE CALLER'S. A worker cannot resolve TXT
    records, so what was found is handed in — and that is precisely why the
    comparison happens on the server. A verdict from the client is a custom
    domain anybody takes by sending `{verified: true}`.
  */
  it("refuses to serve on a record that is not there", async () => {
    expect((await coach.call("/api/domain.verify", { hostname: MINE, seen: ["something-else"] })).status).toBe(400);
    expect((await coach.call("/api/domain.verify", { hostname: MINE })).status).toBe(400);
  });

  it("serves it once the record is", async () => {
    const claim = (await coach.call("/api/domain.claim", { hostname: MINE })).body.record as unknown as { value: string };
    const out = await coach.call("/api/domain.verify", { hostname: MINE, seen: [`"${claim.value}"`] });
    expect(out.status).toBe(200);
    expect(out.body.state as unknown as string).toBe("served");
  });

  /*
    ⚠️ AND NOW — AND ONLY NOW — THE HOSTNAME RESOLVES TO THIS STUDIO. The probe
    is an authenticated route with no session on purpose: a host that resolves to
    a workspace refuses for want of a session (401), and one that resolves to
    nothing is not a door at all (404). That is exactly the difference routing
    makes, and a 200 would prove less — it would only show the request reached
    the worker.
  */
  it("resolves to this studio once it is served", async () => {
    const res = await worker.fetch(new Request(`https://${MINE}/api/client.list`), env as never);
    expect(res.status, "a served domain must be a door").toBe(403);
  });

  /*
    ⚠️ ONE HOSTNAME, ONE CLAIM. Two live claims is a race whose winner is
    whoever proves first — which sounds fair and is not: the loser's claim sits
    looking pending forever, and the support conversation about it discloses
    that another workspace holds it.
  */
  it("cannot be claimed by a second studio", async () => {
    const cookie = await theOtherStudio();
    const res = await worker.fetch(
      new Request(`${OTHER_ORIGIN}/api/domain.claim`, {
        method: "POST", headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ hostname: MINE }),
      }),
      env as never,
    );
    expect(res.status).toBe(409);
  });

  /*
    ⚠️ AND NOT RELEASED BY ONE EITHER. The claim table is keyed on the hostname
    alone — deliberately, so a hostname has one claim — which is exactly the
    shape where a delete without the tenant reaches across and takes somebody
    else's address down.
  */
  it("cannot be released by a second studio", async () => {
    const cookie = await theOtherStudio();
    const res = await worker.fetch(
      new Request(`${OTHER_ORIGIN}/api/domain.remove`, {
        method: "POST", headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ hostname: MINE }),
      }),
      env as never,
    );
    expect(res.status).toBe(404);
    /* And it is still a door. */
    const still = await worker.fetch(new Request(`https://${MINE}/api/client.list`), env as never);
    expect(still.status).toBe(403);
  });

  it("lists what is claimed and what each still needs", async () => {
    const out = await coach.get("/api/domain.list");
    expect(out.status).toBe(200);
    const rows = out.body.domains as unknown as { hostname: string; state: string; record: unknown }[];
    const mine = rows.find((r) => r.hostname === MINE)!;
    expect(mine.state).toBe("served");
    /* ⚠️ Nothing left to do, so nothing to show. */
    expect(mine.record).toBeNull();
  });

  it("stops being a door when released", async () => {
    expect((await coach.call("/api/domain.remove", { hostname: MINE })).status).toBe(200);
    const res = await worker.fetch(new Request(`https://${MINE}/api/client.list`), env as never);
    expect(res.status, "a released domain must resolve to nothing").toBe(404);
  });
});

/* ---------------------------------------------------------------- units --- */

/*
  ⚠️ A PERSON'S, NOT A WORKSPACE'S. A coach who thinks in kilograms and a client
  who thinks in pounds are both right, in the same studio, about the same
  barbell — so a workspace-level choice is one that is wrong for somebody by
  construction.
*/
describe("how one person reads a weight", () => {
  it("starts unset rather than guessing", async () => {
    const out = await coach.get("/api/me.preferences");
    expect(out.status).toBe(200);
    expect(out.body.units as unknown as string).toBe("");
  });

  it("keeps what they chose", async () => {
    expect((await coach.call("/api/me.preferences.set", { units: "imperial" })).status).toBe(200);
    expect((await coach.get("/api/me.preferences")).body.units as unknown as string).toBe("imperial");
  });

  it("refuses a unit system nobody has", async () => {
    expect((await coach.call("/api/me.preferences.set", { units: "stones" })).status).toBe(400);
  });

  /*
    ⚠️ AND IT IS NOT THE STUDIO'S. Somebody in two workspaces does not change how
    they read a weight when they switch — so this is one answer per account, and
    the assertion is that a second workspace sees the same one.
  */
  /*
    ⚠️ IT HANGS OFF THE ACCOUNT, NOT THE MEMBERSHIP — so it is the same answer at
    every door that person can reach, and the assertion is made at a DIFFERENT
    door rather than in a second workspace.

    A second workspace would need a second sign-in for the same address, which
    the cooldown correctly refuses; and sessions are per ORIGIN by design, so
    carrying the cookie across proves nothing either. The setup door is a session
    this person already has.
  */
  it("is the same answer at another door", async () => {
    const res = await worker.fetch(
      new Request(`${SETUP}/api/me.preferences`, { headers: { cookie: foundingCookie } }),
      env as never,
    );
    expect(((await res.json()) as { units: string }).units).toBe("imperial");
  });

  it("is nobody's to set but their own", async () => {
    const res = await worker.fetch(
      new Request(`${STUDIO}/api/me.preferences.set`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ units: "metric" }),
      }),
      env as never,
    );
    expect(res.status).toBe(403);
  });
});
