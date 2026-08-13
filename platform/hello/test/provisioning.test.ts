/**
 * BEING LET INTO A PRODUCT — the one machine lane on this deployment.
 *
 * ⚠️ THE SEQUENCE THIS EXISTS FOR IS BACKWARDS FROM THE OBVIOUS ONE. Somebody
 * types their address on the company's own website and signs in AFTERWARDS,
 * often days later on another device — so the grant is written against an
 * ADDRESS, before there is an account to attach it to, and claimed by whoever
 * proves that address. It is the same mechanism an invitation to a workspace
 * already uses, which is why nothing new had to be invented for it.
 *
 * ⚠️ AND THE KEY IS THE WHOLE DOOR. This endpoint opens products to arbitrary
 * addresses; every assertion below about how it refuses is worth more than the
 * one about how it works.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { signIn } from "./session.js";
import { bindingsFor, writeOne } from "@one/runtime";
import { sql, type ResolvedRegion } from "@one/kernel";

const ID = "https://id.4dl.app";
const KEY = "test-provisioning-key";

const directory = () =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DIRECTORY }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

const call = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const res = await worker.fetch(
    new Request(`${ID}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const asMe = async (cookie: string, path: string) => {
  const res = await worker.fetch(new Request(`${ID}${path}`, { headers: { cookie } }), env as never);
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

beforeAll(async () => {
  /* ⚠️ WRITTEN AS CONFIG, WHICH IS WHERE IT LIVES IN PRODUCTION — rotated by a
     person in a console rather than by a deploy. */
  /* ⚠️ THE SCHEMA IS APPLIED BY THE FIRST REQUEST, not by the test. Writing
     config before anything has booted is writing into a database with no tables
     in it — which fails as "no such table", one layer away from anything the
     test is about. */
  await worker.fetch(new Request(`${ID}/api/me.products`), env as never);
  /* ⚠️ The real writer, so a fixture cannot hold a stale table shape alive —
     which is what a retyped INSERT here did the day `app_config` gained its app
     column, failing three suites on the fixture rather than on anything they
     test. */
  await writeOne(directory(), "hello", "provisioning.key", KEY, new Date().toISOString() as never);
});

describe("letting an address into a product", () => {
  /*
    ⚠️ NO KEY IS REFUSED, AND SO IS THE WRONG ONE. A missing secret that admitted
    everybody would be the worst available default for the one endpoint that can
    open every product on the deployment to any address somebody names — and a
    fresh deployment has no key at all, which is precisely the state in which this
    must be shut.
  */
  it("refuses a caller with no key and one with the wrong key", async () => {
    expect((await call("/api/platform.provisioning.grant", { email: "a@example.test" })).status).toBe(403);
    expect((await call("/api/platform.provisioning.grant", { email: "a@example.test" },
      { authorization: "Bearer nearly-the-right-key" })).status).toBe(403);
  });

  it("refuses something that is not an address", async () => {
    const out = await call("/api/platform.provisioning.grant", { email: "not-an-address" }, { authorization: `Bearer ${KEY}` });
    expect(out.status).toBe(400);
  });

  /*
    ⚠️ THE GRANT IS GIVEN BEFORE THE ACCOUNT EXISTS, which is the ordinary case
    and the reason it is keyed by address. Nothing here signs anybody in.
  */
  it("grants to an address nobody has signed in with yet", async () => {
    const out = await call("/api/platform.provisioning.grant",
      { email: "New.Customer@Example.test", apps: ["kova"] }, { authorization: `Bearer ${KEY}` });
    expect(out.status).toBe(200);
    expect(out.body.granted).toBe(true);

    /* ⚠️ LOWER CASED ON THE WAY IN. Addresses are compared as text everywhere in
       this platform, so a capital letter is a second account nobody can reach. */
    const row = await directory().first<{ apps: string }>(
      `SELECT apps FROM provisioning WHERE email = ?`, "new.customer@example.test",
    );
    expect(row?.apps).toBe("kova");
  });

  /*
    ⚠️ A SECOND PURCHASE ADDS RATHER THAN REPLACES. Written as a replacement, the
    day somebody buys a second product is the day the first one is revoked —
    silently, and only noticed when they try to open a workspace they already paid
    for.
  */
  it("adds a second product without taking the first away", async () => {
    const key = { authorization: `Bearer ${KEY}` };
    await call("/api/platform.provisioning.grant", { email: "two@example.test", apps: ["kova"] }, key);
    await call("/api/platform.provisioning.grant", { email: "two@example.test", apps: ["scena"] }, key);
    const row = await directory().first<{ apps: string }>(`SELECT apps FROM provisioning WHERE email = ?`, "two@example.test");
    expect(row?.apps.split(",").sort()).toEqual(["kova", "scena"]);
  });

  /*
    ⚠️ AND IT CAN BE TAKEN BACK, because a refund is the ordinary case and a
    switch with no off is not a switch. What it takes back is the ability to open
    a NEW workspace: the ones that exist keep their members, their records and
    their bill, because an endpoint a website can call must never be able to make
    somebody's studio disappear.
  */
  it("takes a grant back without touching what was already created", async () => {
    const key = { authorization: `Bearer ${KEY}` };
    await call("/api/platform.provisioning.grant", { email: "gone@example.test", apps: ["kova", "scena"] }, key);
    await call("/api/platform.provisioning.revoke", { email: "gone@example.test", apps: ["kova"] }, key);
    const left = await directory().first<{ apps: string }>(`SELECT apps FROM provisioning WHERE email = ?`, "gone@example.test");
    expect(left?.apps).toBe("scena");

    await call("/api/platform.provisioning.revoke", { email: "gone@example.test" }, key);
    /* ⚠️ AN EMPTY LIST IS NO ROW. "May open nothing" and "was never granted" are
       the same fact, and keeping both means every reader has to know that. */
    expect(await directory().first(`SELECT apps FROM provisioning WHERE email = ?`, "gone@example.test")).toBeNull();
  });

  it("refuses a revoke with no key just as firmly", async () => {
    expect((await call("/api/platform.provisioning.revoke", { email: "two@example.test" })).status).toBe(403);
  });
});

/* ------------------------------------------------------------- the offer --- */

describe("what the hub may offer", () => {
  /*
    ⚠️ THE ANSWER IS ABOUT EVERY PRODUCT, FROM ONE WORKER. The hub is
    served by one app and the question spans all of them, which is why the list is
    declared in the module every worker imports rather than assembled from
    whichever manifest happens to be in scope.
  */
  it("offers a product to somebody who was let into it, and not to anybody else", async () => {
    const key = { authorization: `Bearer ${KEY}` };
    await call("/api/platform.provisioning.grant", { email: "buyer@example.test", apps: ["kova"] }, key);

    const buyer = await signIn("buyer@example.test", ID);
    const mine = await asMe(buyer, "/api/me.products");
    expect(mine.status).toBe(200);
    const products = mine.body.products as unknown as readonly { id: string; setupAt: string }[];
    expect(products.map((p) => p.id)).toEqual(["kova"]);

    /* ⚠️ AND IT CARRIES THE ADDRESS TO GO TO, derived from the product's root so
       the hub and the product cannot disagree about the one thing that
       has to be right. A workspace is created at the setup door and nowhere else. */
    expect(products[0]!.setupAt).toBe("https://setup.kova.4dl.app");

    const stranger = await signIn("stranger@example.test", ID);
    expect(((await asMe(stranger, "/api/me.products")).body.products as unknown as unknown[]).length).toBe(0);
  });

  /*
    ⚠️ A WILDCARD OPENS EVERYTHING, and it is what an operator grants rather than
    what a purchase does.
  */
  it("opens every product to a wildcard grant", async () => {
    await call("/api/platform.provisioning.grant", { email: "all@example.test" }, { authorization: `Bearer ${KEY}` });
    const cookie = await signIn("all@example.test", ID);
    const products = (await asMe(cookie, "/api/me.products")).body.products as unknown as readonly { id: string }[];
    expect(products.map((p) => p.id).sort()).toEqual(["kova", "scena", "tessa"]);
  });
});

/* --------------------------------------------------------- what it is called --- */

/**
 * ⚠️ THE NAME IS THE ONE THING THE SETUP DOOR TAKES THAT NOTHING ELSE COULD.
 *
 * A workspace's name lives in TWO places on purpose — the regional
 * `tenant_settings` row, which is authoritative, and a copy on the directory row,
 * which is what the sign-in screen reads before there is a session to resolve a
 * region with. Written to the copy alone it survives until the first branding
 * edit and is then replaced by a republish of a row that never existed, with
 * nothing anywhere reporting it.
 */
describe("naming a workspace while creating it", () => {
  /* ⚠️ FRESH PER ATTEMPT, because the suite retries once and a slug is
     unique forever — a retry of a test that got as far as creating would fail
     on the conflict rather than on whatever it was actually about. */
  const named = () => `named${Math.random().toString(36).slice(2, 8)}`;

  it("keeps the name after somebody edits their branding", async () => {
    const NAMED = named();
    const setup = await signIn(`founder.${NAMED}@example.test`, "https://setup.hello.4dl.app");
    const made = await worker.fetch(new Request("https://setup.hello.4dl.app/api/identity.workspace.create", {
      method: "POST", headers: { "content-type": "application/json", cookie: setup },
      body: JSON.stringify({ slug: NAMED, name: "Haddad Strength" }),
    }), env as never);
    expect(made.status).toBe(200);

    const origin = `https://${NAMED}.hello.4dl.app`;
    const here = await signIn(`founder.${NAMED}@example.test`, origin);

    /* ⚠️ THE SETTING, NOT THE COPY. This is the row a republish reads from. */
    const before = await worker.fetch(
      new Request(`${origin}/api/settings.read`, { headers: { cookie: here } }), env as never,
    );
    const values = ((await before.json()) as { values?: Record<string, string> }).values ?? {};
    expect(values["brand.name"]).toBe("Haddad Strength");

    /* ⚠️ THE EDIT THAT WOULD HAVE LOST IT — any branding key republishes all
       three from the regional store. */
    const wrote = await worker.fetch(new Request(`${origin}/api/settings.write`, {
      method: "POST", headers: { "content-type": "application/json", cookie: here },
      body: JSON.stringify({ key: "brand.accent", value: "#3355ff" }),
    }), env as never);
    expect(wrote.status).toBe(200);

    const row = await directory().first<{ branding: string }>(
      `SELECT branding FROM tenant_directory WHERE app_id = ? AND slug = ?`, "hello", NAMED,
    );
    expect(JSON.parse(row?.branding ?? "{}")["brand.name"]).toBe("Haddad Strength");
  });
});
