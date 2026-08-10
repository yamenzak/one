/**
 * REACHING OUT, AND ARRIVING TWICE.
 *
 * ⚠️ EVERY ADDRESS HERE IS THIS SUITE'S OWN, and the slug is minted per attempt.
 *
 * The thread is the boundary of this worker. Outward: three public catalogues an
 * app may ask, where a caller's value must never become a request to somewhere
 * else. Inward: a phone that lost the answer to a write and asks again, a person
 * arriving from another workspace, and somebody who has not signed in at all.
 * Every one of them is a case where the ordinary path is fine and the edge is
 * silent — a set logged twice, a shopfront naming a studio's clients, a
 * workspace list that is really a list of everybody's workspaces.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker, { recorded } from "../src/worker.js";
import { freshSlug, post, SETUP, signIn } from "./session.js";

const SLUG = freshSlug("hartside");
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const at = (origin: string) => (cookie: string) => ({
  async call(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await worker.fetch(
      new Request(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
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

let ownerCookie = "";
let owner: ReturnType<ReturnType<typeof at>>;
let client: ReturnType<ReturnType<typeof at>>;
let ro = "";
let squat = "";
const CLIENT_EMAIL = `ro-${SLUG}@example.test`;

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  ownerCookie = await signIn(`${SLUG}@example.test`, STUDIO);
  owner = at(STUDIO)(ownerCookie);

  const person = await owner.call("/api/client.create", { name: "Ro Adeyemi", email: CLIENT_EMAIL });
  expect(person.status, "the roster fixture must not have hit the client quota").toBe(200);
  ro = person.body.id as unknown as string;
  /* ⚠️ The membership NAMES the record, which is what makes them a customer
     rather than a member of staff who happens to have been invited. */
  await owner.call("/api/member.invite", { email: CLIENT_EMAIL, role: "client", subjectId: ro });
  client = at(STUDIO)(await signIn(CLIENT_EMAIL, STUDIO));

  /*
    ⚠️ AND THEY HOLD SOMETHING. A customer with no package holds no capability at
    all, so every assertion below would be a 403 that proves the gate works and
    nothing about the feature behind it.
  */
  await owner.call("/api/commerce.package.save", {
    id: "twelve-weeks", name: "Twelve weeks", price: { minor: 60_000, currency: "USD" },
    flags: { training: true, nutrition: true, body: true, progress: true },
    budgets: { coaching: 90, nutrition: 90 }, oncePerCustomer: false,
  });
  await owner.call("/api/commerce.grant", { subjectId: ro, packageId: "twelve-weeks" });

  squat = (await owner.call("/api/movement.create", { name: "Back squat", pattern: "squat" })).body.id as unknown as string;
});

/* ------------------------------------------------------- arriving twice --- */

/*
  ⚠️ THE BASEMENT CASE. A phone that queued a write and replayed it when the
  signal came back cannot know whether the first attempt landed — the ANSWER is
  what went missing, not the request. Without a key the person has done two sets
  of ten, in the record, forever, and nothing anywhere threw.
*/
describe("a write that arrives twice", () => {
  let workout = "";

  beforeAll(async () => {
    workout = (await owner.call("/api/workout.create", { client: ro, day: "2026-08-03" })).body.id as unknown as string;
  });

  it("lands once when both attempts carry the same key", async () => {
    const body = { client: ro, workout, movement: squat, reps: 10, load: 100, round: 1 };
    const first = await client.call("/api/set.create", body, { "idempotency-key": "basement-1" });
    const again = await client.call("/api/set.create", body, { "idempotency-key": "basement-1" });

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    /*
      ⚠️ AND THE SECOND IS ANSWERED WITH THE FIRST ONE'S ID rather than with
      "already done". The client is waiting for the id of the row it just made;
      an acknowledgement it cannot refer to is a write it has to go and find.
    */
    expect(again.body.id).toBe(first.body.id);

    const rows = (await client.get("/api/set.list", { limit: "200" })).body.rows as unknown as { id: string }[];
    expect(rows.filter((r) => r.id === first.body.id)).toHaveLength(1);
  });

  /*
    ⚠️ AND THE SAME SET, MEANT TWICE, IS TWO SETS. A gym is the place somebody
    does the identical thing again on purpose, so deduplicating on the CONTENT
    would silently drop the second half of every straight-set session. Only the
    caller knows two attempts were one intent, which is why the key is theirs.
  */
  it("makes two rows where the caller meant two", async () => {
    const body = { client: ro, workout, movement: squat, reps: 10, load: 100, round: 2 };
    const one = await client.call("/api/set.create", body, { "idempotency-key": "basement-2" });
    const two = await client.call("/api/set.create", body, { "idempotency-key": "basement-3" });
    expect(one.body.id).not.toBe(two.body.id);
  });

  /* ⚠️ A caller that supplies no key is not silently deduplicated either — that
     would be this platform deciding, for them, that they misclicked. */
  it("makes two rows where no key was supplied at all", async () => {
    const body = { client: ro, workout, movement: squat, reps: 8, load: 90, round: 3 };
    const one = await client.call("/api/set.create", body);
    const two = await client.call("/api/set.create", body);
    expect(one.body.id).not.toBe(two.body.id);
  });

  /*
    ⚠️ THE KEY IS PER PERSON. Two clients whose apps mint keys the same way — a
    timestamp, a counter, a device id somebody reused — must not swallow each
    other's writes, and "our client generates UUIDs" is a property of a client
    this platform does not control.
  */
  it("does not let one person's key answer another's write", async () => {
    const mine = await client.call(
      "/api/set.create", { client: ro, workout, movement: squat, reps: 5, round: 4 },
      { "idempotency-key": "shared-counter-7" },
    );
    const theirs = await owner.call(
      "/api/set.create", { client: ro, workout, movement: squat, reps: 5, round: 5 },
      { "idempotency-key": "shared-counter-7" },
    );
    expect(theirs.status).toBe(200);
    expect(theirs.body.id).not.toBe(mine.body.id);
  });
});

/* ------------------------------------------------------------ the player --- */

describe("working through a session", () => {
  let workout = "";

  beforeAll(async () => {
    /* Something they did in July, so "last time" has an answer that is not today. */
    const july = (await owner.call("/api/workout.create", { client: ro, day: "2026-07-20" })).body.id as unknown as string;
    await owner.call("/api/set.create", { client: ro, workout: july, movement: squat, reps: 5, load: 80, round: 1 });

    const programme = (await owner.call("/api/programme.create", {
      client: ro, kind: "training", title: "Block one", active: true,
      weeks: [{ days: [{ name: "Monday", movements: [{ movement: squat, sets: 3, reps: 5 }] }] }],
    })).body.id as unknown as string;
    /* ⚠️ Before the other block's workout, so "last time" cannot be answered by
       a fixture in another describe — which is a green test proving nothing. */
    workout = (await owner.call("/api/workout.create", { client: ro, day: "2026-07-25", programme })).body.id as unknown as string;
  });

  it("gives the client what they are meant to do, in rounds", async () => {
    const out = await client.get("/api/workout.player", { workoutId: workout });
    expect(out.status).toBe(200);
    const rounds = out.body.rounds as unknown as { movement: string; lastTime: unknown }[][];
    expect(rounds[0]![0]!.movement).toBe(squat);
  });

  /*
    ⚠️ LAST TIME IS THE MOST RECENT SET ON ANOTHER DAY, and the exclusion is the
    whole of it. Without it the first set somebody logs becomes what they are
    told they did last time — so the number they are working against is the one
    they just did, and it climbs with them all session.
  */
  it("reads last time from a previous day, not from this one", async () => {
    await client.call("/api/set.create", { client: ro, workout, movement: squat, reps: 5, load: 200, round: 1 });

    const rounds = (await client.get("/api/workout.player", { workoutId: workout })).body.rounds as unknown as
      { movement: string; lastTime: { load: number; day: string } | null }[][];
    expect(rounds[0]![0]!.lastTime!.day).toBe("2026-07-20");
    expect(rounds[0]![0]!.lastTime!.load).toBe(80);
  });

  /* ⚠️ And what is already logged comes back, so a phone that locked mid-session
     does not lose where somebody was. */
  it("carries what is already logged for this workout", async () => {
    const done = (await client.get("/api/workout.player", { workoutId: workout })).body.done as unknown as unknown[];
    expect(done.length).toBeGreaterThan(0);
  });

  /*
    ⚠️ IT TAKES AN ID, SO THE ROW'S OWN SUBJECT IS CHECKED RATHER THAN ASSUMED. A
    subject-scoped read narrows by itself; this one would hand any client any
    workout in the studio if the check were left to the scope.
  */
  it("refuses somebody else's session", async () => {
    const other = (await owner.call("/api/client.create", { name: "Ines Vidal" })).body.id as unknown as string;
    const theirs = (await owner.call("/api/workout.create", { client: other, day: "2026-08-06" })).body.id as unknown as string;
    expect((await client.get("/api/workout.player", { workoutId: theirs })).status).toBe(404);
  });
});

/* --------------------------------------------------------- the shopfront --- */

describe("what a stranger can see", () => {
  const stranger = at(STUDIO)("");

  /*
    ⚠️ OFF UNTIL THE STUDIO SAYS OTHERWISE, for the same reason self-registration
    is: publishing a business's price list is the business's decision, not a
    default it discovers after somebody links to it.
  */
  it("is closed until somebody opens it", async () => {
    const out = await stranger.get("/api/studio.shopfront");
    expect(out.status).toBe(200);
    expect(out.body.open).toBe(false);
    expect(out.body.packages as unknown as unknown[]).toEqual([]);
  });

  it("opens when the owner opens it, and says what is sold", async () => {
    expect((await owner.call("/api/settings.write", { key: "studio.shopfront", value: true })).status).toBe(200);

    const out = await stranger.get("/api/studio.shopfront");
    expect(out.body.open).toBe(true);
    const packages = out.body.packages as unknown as { name: string; includes: string[] }[];
    expect(packages.map((p) => p.name)).toContain("Twelve weeks");
    /* ⚠️ What it includes — not what it switches off, which reads as a list of
       things the studio does not do. */
    const includes = packages.find((p) => p.name === "Twelve weeks")!.includes;
    expect(includes).toContain("training");
    expect(includes).not.toContain("checkins");
  });

  /*
    ⚠️ AND EVERY FIELD ON IT IS A FIELD THE WHOLE INTERNET CAN READ. This is the
    assertion the operation exists for: a poster, not a roster. Nobody's name,
    nobody's email, no count of who is coached here.
  */
  it("says nothing about who is coached here", async () => {
    const text = JSON.stringify((await stranger.get("/api/studio.shopfront")).body);
    expect(text).not.toContain("Ro Adeyemi");
    expect(text).not.toContain(CLIENT_EMAIL);
    expect(text).not.toContain(ro);
  });
});

/* ------------------------------------------------------------- the poses --- */

/*
  ⚠️ HANDS-FREE MEANS THE SEQUENCE IS THE SERVER'S AND THE SPEAKING IS THE
  DEVICE'S. A phone two metres away can read text aloud; what it cannot do is
  invent the order or the framing, and a product where each app made those up is
  one where two scans of the same person are not comparable.
*/
describe("being talked through a scan", () => {
  it("gives the poses in order, with something to say for each", async () => {
    const out = await client.get("/api/scan.guide");
    expect(out.status).toBe(200);
    const steps = out.body.steps as unknown as { pose: string; say: string; holdSeconds: number }[];
    expect(steps.map((s) => s.pose)).toEqual(["front", "side", "back"]);
    for (const step of steps) {
      expect(step.say.length, step.pose).toBeGreaterThan(20);
      expect(step.holdSeconds).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------- their workspaces --- */

describe("the workspaces somebody belongs to", () => {
  /*
    ⚠️ SESSIONS ARE PER ORIGIN, SO THIS IS A LIST OF ADDRESSES RATHER THAN A
    SWITCH. Moving between workspaces is navigating to another door with the one
    credential behind all of them — a tap, not a sign-in.
  */
  it("lists the one they are in", async () => {
    const out = await owner.get("/api/me.workspaces");
    expect(out.status).toBe(200);
    const mine = out.body.workspaces as unknown as { slug: string }[];
    expect(mine.map((w) => w.slug)).toContain(SLUG);
  });

  /*
    ⚠️ AND ONLY THOSE. The directory is global and lists every workspace on the
    deployment, so a list that forgot to intersect with membership would hand
    everybody the name of every business here — which is the same bug as a
    shopfront naming a roster, one table over.
  */
  it("does not list one they have nothing to do with", async () => {
    const elsewhere = freshSlug("kirkstone");
    const founding = await signIn(`${elsewhere}@example.test`, SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: elsewhere }, founding);

    const mine = (await owner.get("/api/me.workspaces")).body.workspaces as unknown as { slug: string }[];
    expect(mine.map((w) => w.slug)).not.toContain(elsewhere);
  });

  it("tells somebody signed into nothing about nothing", async () => {
    const out = await at(STUDIO)("").get("/api/me.workspaces");
    expect(out.body.workspaces as unknown as unknown[]).toEqual([]);
  });
});

/* ---------------------------------------------------------- what they see --- */

describe("what somebody arranges for themselves", () => {
  it("keeps the order they chose", async () => {
    await owner.call("/api/me.preferences.set", { layout: ["attention", "roster", "feed"] });
    const out = await owner.get("/api/me.preferences");
    expect(out.body.layout as unknown as string[]).toEqual(["attention", "roster", "feed"]);
  });

  /*
    ⚠️ EACH PREFERENCE IS WRITTEN ONLY WHEN IT WAS SENT. A screen saving one must
    not clear the other, which is exactly what a whole-object write does — and
    the symptom is somebody's units silently reverting every time they drag a
    card on a different screen.
  */
  it("does not clear the other preference on the way past", async () => {
    await owner.call("/api/me.preferences.set", { units: "imperial" });
    await owner.call("/api/me.preferences.set", { layout: ["feed"] });

    const out = await owner.get("/api/me.preferences");
    expect(out.body.units).toBe("imperial");
    expect(out.body.layout as unknown as string[]).toEqual(["feed"]);
  });

  /* ⚠️ Bounded, because it is a list of what to show first rather than a place
     to keep things. */
  it("refuses a layout that is not a layout", async () => {
    expect((await owner.call("/api/me.preferences.set", {
      layout: Array.from({ length: 40 }, (_, i) => `card-${i}`),
    })).status).toBe(400);
  });
});

/* ----------------------------------------------------------- their words --- */

describe("a studio putting our messages in its own words", () => {
  it("lists what it may change, in both versions", async () => {
    const out = await owner.get("/api/wording.list");
    expect(out.status).toBe(200);
    const rows = out.body.rows as unknown as { type: string; ours: { title: string }; theirs: unknown; values: string[] }[];
    const granted = rows.find((r) => r.type === "package.granted");
    expect(granted!.ours.title).toBe("{days} days added");
    expect(granted!.theirs).toBeNull();
    /* ⚠️ What they may interpolate, from the same function the write refuses
       with — or a screen offers a value the store then rejects. */
    expect(granted!.values).toContain("days");
  });

  /*
    ⚠️ AND NOT WHAT WE SEND TO THEM, ABOUT THEM. A business that could reword its
    own arrears notice could make one read as though nothing were wrong, for
    staff who would then not act on it.
  */
  it("does not offer them our own messages about their bill", async () => {
    const rows = (await owner.get("/api/wording.list")).body.rows as unknown as { type: string }[];
    expect(rows.map((r) => r.type)).not.toContain("plan.chosen");
    expect((await owner.call("/api/wording.set", { type: "plan.chosen", title: "All is well" })).status).toBe(400);
  });

  it("takes their sentence and gives it back", async () => {
    expect((await owner.call("/api/wording.set", {
      type: "package.granted", title: "{days} more with us",
    })).status).toBe(200);

    const rows = (await owner.get("/api/wording.list")).body.rows as unknown as
      { type: string; saying: { title: string } }[];
    expect(rows.find((r) => r.type === "package.granted")!.saying.title).toBe("{days} more with us");
  });

  /*
    ⚠️ THE SHARP ONE. A dispatch carries the values OUR copy needs and nothing
    else, and an unknown token renders as its own literal text — so this refusal
    is the difference between a sentence and an email that says "You paid
    {amount}" to a paying customer.
  */
  it("refuses a value the message does not carry", async () => {
    expect((await owner.call("/api/wording.set", {
      type: "package.granted", title: "You paid {amount}",
    })).status).toBe(400);
  });

  it("goes back to our words when they clear it", async () => {
    await owner.call("/api/wording.clear", { type: "package.granted" });
    const rows = (await owner.get("/api/wording.list")).body.rows as unknown as
      { type: string; theirs: unknown; saying: { title: string } }[];
    const granted = rows.find((r) => r.type === "package.granted")!;
    expect(granted.theirs).toBeNull();
    expect(granted.saying.title).toBe("{days} days added");
  });

  /* ⚠️ It is a workspace's own choice, so it is behind the settings permission
     rather than being anything a client can reach. */
  it("is not a client's to change", async () => {
    expect((await client.get("/api/wording.list")).status).toBe(403);
    expect((await client.call("/api/wording.set", { type: "package.granted", title: "x" })).status).toBe(403);
  });
});

/* ---------------------------------------------------------- the sign-off --- */

describe("how a studio signs what it sends", () => {
  /*
    ⚠️ EVERY MESSAGE LEAVES FROM THE DEPLOYMENT'S ADDRESS — one verified sender
    for the whole platform, which is what makes a new product inherit mail that
    works. The cost is that a customer's inbox shows us rather than the business
    they know, so the business has to be able to say who it is inside the message.
  */
  it("puts the studio's sign-off under what a client is sent", async () => {
    await owner.call("/api/settings.write", { key: "mail.signature", value: "— Anna, Hartside Strength" });
    await owner.call("/api/wording.set", {
      type: "programme.published", body: "Your next block is up.",
    });

    const programme = (await owner.call("/api/programme.create", {
      client: ro, kind: "training", title: "Block two",
      weeks: [{ days: [{ name: "Monday", movements: [{ movement: squat, sets: 3, reps: 5 }] }] }],
    })).body.id as unknown as string;
    expect((await owner.call("/api/programme.publish", { programmeId: programme })).status).toBe(200);

    const sent = recorded.get(CLIENT_EMAIL.toLowerCase());
    expect(sent, "the client should have been emailed about their programme").toBeTruthy();
    expect(sent!.body).toContain("Your next block is up.");
    expect(sent!.body).toContain("— Anna, Hartside Strength");
  });
});

/* -------------------------------------------------------- looking outward --- */

/*
  ⚠️ THE DECLARATION IS THE DEFENCE. There is no argument on any of these that
  could carry a URL: the host comes from the manifest and every value a caller
  supplies is escaped into a path segment. What is asserted here is that the
  operations exist, are permissioned, and answer a service they cannot reach with
  a PROBLEM rather than an exception — because a lookup this platform cannot make
  is an ordinary Tuesday for a third party, not a broken product.
*/
describe("asking a public catalogue", () => {
  it("refuses a barcode that is not a barcode before going anywhere", async () => {
    expect((await client.get("/api/food.barcode", { code: "../../admin" })).status).toBe(400);
    expect((await client.get("/api/food.barcode", { code: "12" })).status).toBe(400);
  });

  it("answers a lookup it cannot complete with a problem, never a crash", async () => {
    for (const [path, query] of [
      ["/api/food.barcode", { code: "5000112637922" }],
      ["/api/food.search", { text: "oat milk" }],
    ] as const) {
      const out = await client.get(path, query);
      expect([200, 404, 503], `${path} answered ${out.status}`).toContain(out.status);
    }
  });

  /* ⚠️ Finding a movement is a coach's job — it ends in a library row the whole
     studio trains against. */
  it("keeps the movement catalogue behind the permission that writes movements", async () => {
    expect((await client.get("/api/movement.search", { text: "squat" })).status).toBe(403);
    const out = await owner.get("/api/movement.search", { text: "squat" });
    expect([200, 404, 503]).toContain(out.status);
  });
});

/* ------------------------------------------------------- their own prices --- */

/*
  ⚠️ A DISCOUNT THIS PLATFORM CANNOT ENFORCE IS STILL WORTH HAVING, AND THE
  BOUNDARY IS THE POINT. The studio is paid on its OWN provider — we open an
  intent and hand over an address — so a code changes what the customer is
  quoted, what the purchase row carries, and what the studio is asked to confirm.
  What it cannot do is change what a page we do not own asks for.
*/
describe("a studio discounting its own prices", () => {
  it("issues a code and says what is left of it", async () => {
    expect((await owner.call("/api/commerce.discount.save", {
      code: "summer", percent: 25, uses: 2,
    })).status).toBe(200);

    const list = (await owner.get("/api/commerce.discounts")).body.discounts as unknown as
      { code: string; percent: number; usesLeft: number }[];
    /* ⚠️ Stored as it will be typed back — a code somebody enters in lower case
       off a poster must be the code they were given. */
    expect(list.find((d) => d.code === "SUMMER")).toEqual({ code: "SUMMER", percent: 25, usesLeft: 2, expiresAt: null });
  });

  it("refuses a percentage that is a giveaway rather than a discount", async () => {
    expect((await owner.call("/api/commerce.discount.save", { code: "FREE", percent: 100, uses: 1 })).status).toBe(400);
  });

  it("quotes the reduced price, with the full one beside it", async () => {
    const out = await owner.call("/api/commerce.checkout", {
      subjectId: ro, packageId: "twelve-weeks", code: "summer",
    });
    expect(out.status).toBe(200);
    expect((out.body.amount as unknown as { minor: number }).minor).toBe(45_000);
    const discount = out.body.discount as unknown as { code: string; was: { minor: number } };
    expect(discount.code).toBe("SUMMER");
    expect(discount.was.minor).toBe(60_000);
  });

  /*
    ⚠️ A CODE THAT DOES NOT WORK IS REFUSED, NEVER IGNORED. Quietly charging the
    full price to somebody who typed one is the worst of the three outcomes: they
    pay more than they expected and find out from a receipt, on a page we do not
    own, with nothing to point at.
  */
  it("refuses a code nobody issued rather than charging full price", async () => {
    const out = await owner.call("/api/commerce.checkout", {
      subjectId: ro, packageId: "twelve-weeks", code: "NOTACODE",
    });
    expect(out.status).toBe(404);
  });

  /*
    ⚠️ THE USE IS SPENT WHEN THE MONEY MOVED, NOT WHEN SOMEBODY LOOKED. An intent
    is a person saying they mean to pay, on a page this platform does not own, and
    most are abandoned — so spending at checkout exhausts a code for twenty on
    twenty people who closed the tab, and the studio cannot tell why.
  */
  it("spends a use at settlement rather than at checkout", async () => {
    const before = (await owner.get("/api/commerce.discounts")).body.discounts as unknown as { code: string; usesLeft: number }[];
    const left = before.find((d) => d.code === "SUMMER")!.usesLeft;

    const opened = await owner.call("/api/commerce.checkout", {
      subjectId: ro, packageId: "twelve-weeks", code: "SUMMER",
    });
    const mid = (await owner.get("/api/commerce.discounts")).body.discounts as unknown as { code: string; usesLeft: number }[];
    expect(mid.find((d) => d.code === "SUMMER")!.usesLeft, "an abandoned intent must not spend a use").toBe(left);

    expect((await owner.call("/api/commerce.confirm", {
      purchaseId: opened.body.purchaseId as unknown as string,
    })).status).toBe(200);

    const after = (await owner.get("/api/commerce.discounts")).body.discounts as unknown as { code: string; usesLeft: number }[];
    expect(after.find((d) => d.code === "SUMMER")!.usesLeft).toBe(left - 1);
  });

  /* ⚠️ And what was actually charged is on the purchase, or a studio confirming
     a payment is reconciling against a price nobody recorded. */
  it("records what was charged, and under which code", async () => {
    const history = (await owner.get("/api/commerce.purchases", { subjectId: ro })).body.purchases as unknown as
      { amount: { minor: number }; discountCode?: string; status: string }[];
    const discounted = history.find((p) => p.discountCode === "SUMMER");
    expect(discounted, "the settled purchase should name the code it used").toBeTruthy();
    expect(discounted!.amount.minor).toBe(45_000);
  });

  /* ⚠️ It is the workspace's own price list, so it is behind the permission that
     manages what it sells rather than anything a customer can reach. */
  it("is not a customer's to issue", async () => {
    expect((await client.call("/api/commerce.discount.save", { code: "MINE", percent: 50, uses: 1 })).status).toBe(403);
    expect((await client.get("/api/commerce.discounts")).status).toBe(403);
  });
});
