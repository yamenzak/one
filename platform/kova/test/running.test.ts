/**
 * WHAT AN OWNER DOES ABOUT MONEY AND ABOUT THEIR ROSTER.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN, and the slug is minted per attempt.
 *
 * ⚠️ THE THREAD IS A PRICE THAT DISAGREES WITH ITSELF. A shelf showing what was
 * declared while the gate enforces what is sold is a customer told a plan
 * includes three and given ten — or told ten and given three, with a receipt that
 * agrees with neither. Nothing throws, and the number on the screen is a
 * perfectly ordinary number.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { freshSlug, post, SETUP, signIn } from "./session.js";

const SLUG = freshSlug("swaledale");
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const at = (origin: string) => (cookie: string) => ({
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

let owner: ReturnType<ReturnType<typeof at>>;
let ownerCookie = "";

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  ownerCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  owner = at(STUDIO)(ownerCookie);
});

/* ---------------------------------------------------------- the shelf --- */

describe("what this deployment says it sells", () => {
  it("lists the plans with what each includes", async () => {
    const out = await owner.get("/api/billing.plans");
    expect(out.status).toBe(200);
    const plans = out.body.plans as unknown as { id: string; price: { minor: number } }[];
    expect(plans.find((p) => p.id === "solo")!.price.minor).toBe(499);
  });

  /*
    ⚠️ AND IT IS THE CATALOGUE AS SOLD, NOT AS DECLARED. This is the assertion
    the whole thread is for: an operator's edit that the storefront never reads
    is a screen showing one price while the gate enforces another.
  */
  it("shows an operator's edit rather than what the app shipped with", async () => {
    const operator = at("https://admin.kova.4dl.app")(await signIn("op@swaledale.example.test", "https://admin.kova.4dl.app"));
    expect((await operator.call("/api/admin.catalog.set", {
      planId: "solo", price: { minor: 1_299, currency: "USD" },
    })).status).toBe(200);

    const plans = (await owner.get("/api/billing.plans")).body.plans as unknown as { id: string; price: { minor: number } }[];
    expect(plans.find((p) => p.id === "solo")!.price.minor).toBe(1_299);
  });

  /* ⚠️ And so does the preview, or somebody is told what they would gain under
     ceilings the deployment stopped selling. */
  it("previews against the same catalogue", async () => {
    const operator = at("https://admin.kova.4dl.app")(await signIn("op@swaledale.example.test", "https://admin.kova.4dl.app"));
    await operator.call("/api/admin.catalog.set", { planId: "studio", entitlements: { clients: 999 } });

    const out = await owner.get("/api/market.preview", { planId: "studio" });
    expect(out.status).toBe(200);
    expect(JSON.stringify(out.body.preview)).toContain("999");
  });
});

/* -------------------------------------------------------------- credits --- */

describe("buying credits", () => {
  /*
    ⚠️ CREDITS ARE CONSUMPTION AND A PLAN IS ACCESS. Selling them together means
    answering "I have run out" with a bigger product, when what somebody wanted
    was more of the one they were already using.
  */
  it("offers packs, with the balance beside them", async () => {
    const out = await owner.get("/api/billing.packs");
    expect(out.status).toBe(200);
    const packs = out.body.packs as unknown as { id: string; credits: number }[];
    expect(packs.map((p) => p.id)).toContain("small");
    expect(out.body.balance as unknown as number).toBe(0);
  });

  /*
    ⚠️ IT GRANTS NOTHING. Credits are minted by the provider's confirmation and
    by an operator, and by nothing else — an operation that granted on request is
    a balance anybody refills by calling it.
  */
  it("moves no balance when a pack is bought", async () => {
    const before = (await owner.get("/api/billing.packs")).body.balance as unknown as number;
    await owner.call("/api/billing.credits.buy", { packId: "small" });
    expect((await owner.get("/api/billing.packs")).body.balance as unknown as number).toBe(before);
  });

  /*
    ⚠️ AND WITH NO PROVIDER IT REFUSES AND SAYS WHY. Answering cleanly with an
    intent nothing will ever settle is a workspace waiting for credits that are
    not coming, with no signal at all.
  */
  it("refuses on a deployment that cannot take a payment, rather than pretending", async () => {
    const out = await owner.call("/api/billing.credits.buy", { packId: "small" });
    expect(out.status).toBe(503);
    expect(String((out.body.meta as unknown as { reason: string }).reason)).toContain("cannot take a payment");
  });

  it("refuses a pack that does not exist", async () => {
    expect((await owner.call("/api/billing.credits.buy", { packId: "imaginary" })).status).toBe(404);
  });

  it("is not a coach's to buy", async () => {
    const coach = at(STUDIO)(await signIn(`coach-${SLUG}@example.test`, STUDIO));
    expect((await coach.get("/api/billing.packs")).status).toBe(403);
  });
});

/* --------------------------------------------------------------- portal --- */

describe("changing a card, reading an invoice, cancelling", () => {
  /*
    ⚠️ AN UNCONFIGURED DEPLOYMENT SAYS SO RATHER THAN HANDING BACK A DEAD LINK.
    "Manage billing" that opens nothing is worse than a sentence saying billing is
    not set up — one is a bug somebody reports, the other is an answer.
  */
  it("says why there is nowhere to go, rather than offering a dead link", async () => {
    const out = await owner.get("/api/billing.portal");
    expect(out.status).toBe(200);
    expect(out.body.url).toBeUndefined();
    expect(out.body.why as unknown as string).toBeTruthy();
  });
});

/* ---------------------------------------------------------- offboarding --- */

describe("asking to be released from somebody", () => {
  let person = "";
  let asked = "";

  beforeAll(async () => {
    const made = await owner.call("/api/client.create", { name: "Ro Adeyemi" });
    await owner.call("/api/consent.record", { subject: made.body.id });
    expect(made.status, "the roster fixture must not have hit the client quota").toBe(200);
    person = made.body.id as unknown as string;
  });

  it("a coach opens one, with a reason", async () => {
    const made = await owner.call("/api/release.create", {
      client: person, why: "They have moved cities and want somebody local.",
    });
    expect(made.status).toBe(200);
    asked = made.body.id as unknown as string;
  });

  it("starts as asked, without anybody saying so", async () => {
    const row = (await owner.get("/api/release.read", { id: asked })).body.row as unknown as { state: string };
    expect(row.state).toBe("asked");
  });

  it("refuses one with no reason", async () => {
    expect((await owner.call("/api/release.create", { client: person })).status).toBe(400);
  });

  /*
    ⚠️ THE OWNER DECIDES, AND THE NARROWING IS ON THE FIELDS. A coach holds
    `release:write` so they can ask — the same permission on the answer would be
    the question answering itself, which is the line the swap request draws for
    the same reason.
  */
  it("is answered by whoever manages the roster", async () => {
    const row = (await owner.get("/api/release.read", { id: asked })).body.row as unknown as { version: number };
    const done = await owner.call("/api/release.update", {
      id: asked, version: row.version,
      changes: { state: "agreed", answer: "Agreed — I will let them know." },
    });
    expect(done.status).toBe(200);
  });
});

/* ------------------------------------------------------ self-registration --- */

describe("somebody adding themselves", () => {
  const arrive = (name: string, email: string) =>
    at(STUDIO)("").call("/api/client.register", { name, email });

  /*
    ⚠️ OFF BY DEFAULT, AND THE DEFAULT IS THE WHOLE SAFETY OF IT. An open
    registration on every workspace means anybody who guesses a slug becomes a
    client of that studio.
  */
  it("is refused by a studio that has not turned it on", async () => {
    const out = await arrive("Walk In", `walkin-${SLUG}@example.test`);
    expect(out.status).toBe(403);
  });

  it("is taken once the studio allows it", async () => {
    expect((await owner.call("/api/settings.write", { key: "studio.selfRegister", value: true })).status).toBe(200);
    const out = await arrive("Walk In", `walkin-${SLUG}@example.test`);
    expect(out.status).toBe(200);

    const roster = (await owner.get("/api/client.list")).body.rows as unknown as { name: string }[];
    expect(roster.map((r) => r.name)).toContain("Walk In");
  });

  /*
    ⚠️ THE SAME ANSWER WHETHER OR NOT THEY ARE ALREADY ON THE ROSTER. Telling
    them apart turns this into a membership oracle: type an address, learn whether
    that person is coached here — which for a health product is a disclosure on
    its own.
  */
  it("says the same thing to somebody already on the roster", async () => {
    const again = await arrive("Walk In", `walkin-${SLUG}@example.test`);
    expect(again.status).toBe(200);
    const roster = (await owner.get("/api/client.list")).body.rows as unknown as { name: string }[];
    expect(roster.filter((r) => r.name === "Walk In")).toHaveLength(1);
  });

  it("refuses an address that is not one", async () => {
    expect((await arrive("Nobody", "not-an-address")).status).toBe(400);
  });

  /*
    ⚠️ THE STUDIO'S OWN CEILING, because the plan's quota is checked against the
    CALLER's entitlements and this caller has none — they belong to nothing yet.
    Without it an open studio is one anybody can push past its own plan.
  */
  it("stops at the ceiling the studio set", async () => {
    const held = ((await owner.get("/api/client.list")).body.rows as unknown as unknown[]).length;
    await owner.call("/api/settings.write", { key: "studio.selfRegisterCeiling", value: held });
    const out = await arrive("One Too Many", `spare-${SLUG}@example.test`);
    expect(out.status).toBe(402);
    expect(out.body.detail as unknown as string).toContain(String(held));
  });

  it("takes them again once the ceiling is raised", async () => {
    await owner.call("/api/settings.write", { key: "studio.selfRegisterCeiling", value: 0 });
    expect((await arrive("One More", `more-${SLUG}@example.test`)).status).toBe(200);
  });
});

/* ------------------------------------------------------------- the business --- */

describe("how the studio is doing", () => {
  /*
    ⚠️ ACTIVE MEANS THEY DID SOMETHING. A roster count on its own is the number
    that flatters: it only ever goes up, and it goes up fastest when nobody is
    being coached.
  */
  it("separates who is on the roster from who is training", async () => {
    const out = await owner.get("/api/studio.analytics");
    expect(out.status).toBe(200);
    expect(out.body.clients as unknown as number).toBeGreaterThan(0);
    expect(out.body.active as unknown as number).toBe(0);
  });

  it("counts somebody as active once they train", async () => {
    const roster = (await owner.get("/api/client.list")).body.rows as unknown as { id: string }[];
    const today = new Date().toISOString().slice(0, 10);
    await owner.call("/api/workout.create", { client: roster[0]!.id, day: today });

    const out = await owner.get("/api/studio.analytics");
    expect(out.body.active as unknown as number).toBe(1);
    expect(out.body.sessions as unknown as number).toBe(1);
  });

  it("counts nothing outside the window", async () => {
    const out = await owner.get("/api/studio.analytics", { days: "7" });
    const old = await owner.get("/api/studio.analytics", { days: "365" });
    expect(out.body.joined as unknown as number).toBeLessThanOrEqual(old.body.joined as unknown as number);
  });

  /* ⚠️ The owner's. A coach's view of the studio is their own clients, which is
     `coach.attention` — this is the business, and the business is not theirs. */
  it("is not a coach's to read", async () => {
    const coach = at(STUDIO)(await signIn(`coach-${SLUG}@example.test`, STUDIO));
    expect((await coach.get("/api/studio.analytics")).status).toBe(403);
  });
});
