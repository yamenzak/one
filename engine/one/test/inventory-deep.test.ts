/**
 * ONEINVENTORY'S OTHER HALF, DRIVEN — the parts with arithmetic in them.
 *
 * ⚠️ THE GOLDEN PATH IS ALREADY IN `inventory.test.ts`, AND DRIVING IT FOUND
 * SEVEN DEFECTS. This is the rest: deliveries and the two expiry clocks,
 * itemised objects and their life, kits and their recipes, the release ladder,
 * and the night that tells somebody. Every one of them was composed, guarded and
 * green without a single request ever having reached it.
 *
 * ⚠️ IT IS A SECOND FILE RATHER THAN A LONGER ONE, and the reason is the pool:
 * every test gets its own storage stacked on this file's `beforeAll`, so a suite
 * is a world plus a set of independent stories in it. Two worlds is two files.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MEMBERSHIP, addShard, compPlan, createTenant, found, noteBelonging, noteShardApp,
  startSession, upsertAccount, type Db,
} from "@engine/runtime";
import { inventory } from "@engine/inventory";
import { included, upFrom, type Allowance } from "@engine/kernel";
import worker, { APPS, LEGAL, PLANS } from "../src/index.js";
import { warm } from "./warm.js";

const { ctx, settled } = warm();
const asDev = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };

const SLUG = "foundry";
const TODAY = "2026-08-21";
const directory = () => env.DIRECTORY as unknown as Db;

let cookie = "";

const at = (path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`http://${SLUG}.localhost:8080${path}`, init), asDev as never, ctx);

interface Said { readonly status: number; readonly body: Record<string, unknown> }

const read = async (op: string, input: Record<string, string> = {}): Promise<Said> => {
  const query = new URLSearchParams(input).toString();
  const res = await at(`/api/${op}${query ? `?${query}` : ""}`, { headers: { cookie } });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
};

const write = async (op: string, input: unknown = {}): Promise<Said> => {
  const res = await at(`/api/${op}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
};

const ok = (said: Said): Record<string, unknown> => {
  expect(said.status, JSON.stringify(said.body)).toBe(200);
  return said.body;
};

const idOf = (said: Said): string => String(ok(said).id);

/**
 * ⚠️ A PARTY, MADE THROUGH ONEPARTY'S OWN OPERATION — the only way this app can
 * get one (D120, D122). It answers with `party` rather than `id`, and reading
 * the wrong key here is not harmless: `String(undefined)` is the string
 * "undefined", the engine does not check that a `ref` names a row that exists,
 * and every order below would have been raised against a supplier that is not
 * there — passing, all the way through, on a reference to nothing.
 */
const partyOf = (said: Said): string => {
  const id = ok(said).party;
  expect(typeof id, JSON.stringify(said)).toBe("string");
  return String(id);
};

/** A product of a given tracking, and a place to put it. */
const kindOf = async (name: string, tracking: string, extra: Record<string, unknown> = {}) =>
  idOf(await write("product.create", { name, unit: "item", tracking, ...extra }));

const placeOf = async (name: string) =>
  idOf(await write("location.create", { name, kind: "room" }));

beforeAll(async () => {
  await at("/health");
  await settled();
  await addShard(directory(), "eu-1", "eu", 100);
  for (const id of Object.keys(APPS)) await noteShardApp(directory(), "eu-1", id);

  const made = await createTenant(directory(), {
    slug: SLUG, name: "Foundry", country: "DE", where: "eu", apps: ["inventory", "party"],
  });
  if (typeof made === "string") throw new Error(made);
  await compPlan(directory(), made.tenant.id, MEMBERSHIP, "studio");

  const shard = env.SHARD_EU_1 as unknown as Db;
  const who = await upsertAccount(directory(), "foreman@example.com", null);
  /* ⚠️ `keeper` holds `process:release`, which is the grant the whole rail turns
     on — loading a machine and signing for what came out of it are different
     acts by frequently different people. */
  await found(shard, made.tenant.id as never, who as never, "foreman@example.com",
    { inventory: "keeper", party: "keeper" });
  await noteBelonging(directory(), who as never, made.tenant.id as never);
  cookie = `one_session=${(await startSession(directory(), who as never)).id}`;

  for (const doc of Object.values(LEGAL.documents)) {
    await at("/api/me.accept", {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ document: doc.id, version: doc.version }),
    });
  }
});

/* ----------------------------------------------------------- the two clocks --- */

describe("a delivery and the day it runs out", () => {
  /*
    ⚠️ TWO DELIVERIES OF ONE PRODUCT ARE TWO NUMBERS, and that is the whole
    reason `batch` exists. Kept as one balance they expire on the earlier date or
    on the later one, and either answer is wrong for half the shelf.
  */
  it("keeps two lots of one product apart", async () => {
    const place = await placeOf("Cold store");
    const product = await kindOf("Milk, 2 L", "batched");
    const code = String((ok(await write("product.label", { ids: [product] }))
      .items as { code: string }[])[0]?.code);

    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 6, day: TODAY, year: 2026,
      lot: "4471", expiry: "2026-08-27",
    }));
    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 4, day: TODAY, year: 2026,
      lot: "4472", expiry: "2026-09-14",
    }));

    const lots = ok(await read("batch.list")).items as { lot: string; printed: string }[];
    expect(lots.map((l) => l.lot).sort()).toEqual(["4471", "4472"]);

    /* ⚠️ AND THE SHELF HOLDS THEM AS TWO LINES, because the balance is keyed on
       the delivery. One line would make a recall of lot 4471 a guess. */
    const lines = ok(await read("stock.list")).items as { product: string; quantity: number }[];
    const mine = lines.filter((l) => l.product === product);
    expect(mine).toHaveLength(2);
    expect(mine.reduce((n, l) => n + l.quantity, 0)).toBe(10);
  });

  /*
    ⚠️ WHAT RUNS OUT FIRST IS THE QUESTION, AND IT IS ASKED OF THE WHOLE
    WORKSPACE. `batch.due` with no product is what the nightly sweep asks and
    what the Running out screen draws; answering only per product would make both
    of them impossible.
  */
  it("says what is running out, soonest first", async () => {
    const place = await placeOf("Cold store");
    const product = await kindOf("Cream", "batched");
    const code = String((ok(await write("product.label", { ids: [product] }))
      .items as { code: string }[])[0]?.code);

    for (const [lot, on] of [["A", "2026-12-01"], ["B", "2026-08-23"]] as const) {
      ok(await write("stock.arrive", {
        raw: code, location: place, quantity: 2, day: TODAY, year: 2026, lot, expiry: on,
      }));
    }

    const due = ok(await read("batch.due", { today: TODAY })).items as
      { on: string; standing: string; days: number }[];
    /* ⚠️ SOONEST FIRST, WHICH IS THE ORDER SOMEBODY WALKS THE SHELF IN. */
    expect(due[0]?.on).toBe("2026-08-23");
    expect(due[0]?.days).toBe(2);

    /*
      ⚠️ AND THE ONE WITH FOURTEEN WEEKS ON IT IS NOT ON THIS LIST, WHICH IS THE
      OPERATION'S OWN NAME BEING KEPT. It answered every delivery with a clock
      under the heading "what runs out", so the screen drawing it was a page
      somebody scrolls past a hundred cartons of gloves to find the one carton of
      anything that matters — a list nobody opens twice. This assertion used to
      say `length >= 2`, which passed either way and was the thing that let it
      ship.
    */
    expect(due.map((one) => one.on)).not.toContain("2026-12-01");
    expect(due.every((one) => one.standing !== "fine")).toBe(true);
  });

  /* ⚠️ AND "SHOW ME THE ONES WITH PLENTY OF TIME" IS STILL ASKABLE, so the
     narrowing above is a change to what the operation says by DEFAULT rather
     than to what the product can say at all. */
  it("still answers the ones with time left, when asked for those", async () => {
    const place = await placeOf("Dry store");
    const product = await kindOf("Flour", "batched");
    const code = String((ok(await write("product.label", { ids: [product] }))
      .items as { code: string }[])[0]?.code);
    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 2, day: TODAY, year: 2026,
      lot: "C", expiry: "2027-06-01",
    }));

    expect(ok(await read("batch.due", { today: TODAY })).items).toEqual([]);
    const later = ok(await read("batch.due", { today: TODAY, standing: "fine" })).items as
      { on: string }[];
    expect(later.map((one) => one.on)).toContain("2027-06-01");
  });

  /*
    ⚠️ OPENING A CONTAINER STARTS A SECOND CLOCK, AND THE EARLIER ONE WINS. A box
    with a 2028 date on it that somebody opened last month is out next week, and
    a product that reported the printed date would be telling somebody a carton
    of cream is fine.
  */
  it("counts from the day it was opened, where that is sooner", async () => {
    const place = await placeOf("Bench");
    /* Ten days once opened, against a date years away. */
    const product = await kindOf("Reagent", "batched", { openDays: 10 });
    const code = String((ok(await write("product.label", { ids: [product] }))
      .items as { code: string }[])[0]?.code);
    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 1, day: TODAY, year: 2026,
      lot: "C0921", expiry: "2029-01-31",
    }));

    const lot = String((ok(await read("batch.list")).items as { id: string }[])[0]?.id);
    ok(await write("batch.open", { batch: lot, day: TODAY }));

    const due = ok(await read("batch.due", { product, today: TODAY })).items as
      { on: string; by: string }[];
    expect(due[0]?.on).toBe("2026-08-31");
    /* ⚠️ AND IT SAYS WHICH CLOCK DECIDED, because "expires Tuesday" with no
       reason is a shelf nobody trusts. */
    expect(due[0]?.by).toBe("opened");
  });

  /* ⚠️ AND IT MAY ONLY BE OPENED ONCE. A second opening counted from today is a
     shelf life somebody extended by pressing a button. */
  it("refuses to open the same container twice", async () => {
    const place = await placeOf("Bench");
    const product = await kindOf("Reagent", "batched", { openDays: 10 });
    const code = String((ok(await write("product.label", { ids: [product] }))
      .items as { code: string }[])[0]?.code);
    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 1, day: TODAY, year: 2026, lot: "C1", expiry: "2029-01-31",
    }));
    const lot = String((ok(await read("batch.list")).items as { id: string }[])[0]?.id);

    ok(await write("batch.open", { batch: lot, day: TODAY }));
    const again = await write("batch.open", { batch: lot, day: TODAY });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toContain("already open");
  });
});

/* ------------------------------------------------------------------- undo --- */

describe("a delivery put away in one gesture", () => {
  /*
    ⚠️ THE OPERATION WAS DRIVEN LONG BEFORE ANYTHING COULD REACH IT. Every
    assertion above receives by calling `stock.arrive` directly, which proves the
    handler and says nothing about whether a person can get to it — and for the
    whole of that time no screen named it. What this drives is the seam that
    closed that: the act as `/receive` DECLARES it, with its fills resolved the
    way the browser resolves them, and posted.
  */
  it("receives an unknown code through the act the screen declares", async () => {
    const place = await placeOf("Dock");

    /* ⚠️ OFF HOME, WHERE THE ACT IS — the photograph moved it there from a
       screen of its own, and a test still reading `/receive` would pass over a
       screen nobody can open. */
    const home = inventory().screens?.find((s) => s.route === "/");
    const blocks = (home?.body?.blocks ?? []).flatMap((b) =>
      ("of" in b ? b.of : [b]) as { block: string; does?: unknown[] }[]);
    const act = (blocks.find((b) => b.block === "ActionRow")?.does?.[0]) as
      { op: string; fills?: Record<string, unknown> } | undefined;
    expect(act?.op).toBe("stock.arrive");
    const fills = act?.fills ?? {};
    /* ⚠️ THE THREE THE SCREEN IS STANDING ON, AND NOT ONE MORE. A fill added
       here that the person should have been asked for is a form that stops
       asking — measured against the list rather than spot-checked. */
    expect(Object.keys(fills).sort()).toEqual(["capture", "day", "year"]);

    const filled = Object.fromEntries(Object.entries(fills).map(([name, from]) =>
      [name, from === "today" ? TODAY
        : from === "year" ? Number(TODAY.slice(0, 4))
          : (from as { says: string }).says]));

    /* ⚠️ A CODE THE WORKSPACE HAS NEVER SEEN, which is the case the whole
       operation exists for: the thing is on the shelf and in the system before
       anybody has named it. */
    const got = ok(await write("stock.arrive", {
      ...filled, raw: "5012345678900", location: place, quantity: 6,
    }));
    expect(got.product).toBeTruthy();

    const lines = ok(await read("stock.list")).items as
      { product: string; quantity: number }[];
    expect(lines.filter((l) => l.product === got.product)[0]?.quantity).toBe(6);
  });

  /* ⚠️ AND THE SHELF IS A REFERENCE, so the form draws a place picker rather
     than asking somebody holding a carton to type an id. Pinned because it is
     invisible in every other lane: a text field takes the same value and the
     door accepts it, so only the person in front of the form ever finds out. */
  it("asks for the shelf as a place, not as an identifier", () => {
    const of_ = inventory().operations.find((o) => o.id === "stock.arrive");
    expect(of_?.input?.["location"]?.to).toBe("location");
  });
});

describe("taking back the last thing you did", () => {
  /*
    ⚠️ AN UNDO IS A MOVEMENT, NEVER A DELETION. The wrong number stays visible
    with what cancelled it beside it, which is the difference between an
    inventory somebody can audit and one they can only believe.
  */
  it("cancels a movement with another movement", async () => {
    const place = await placeOf("Dock");
    const product = await kindOf("Sand, 25 kg", "counted");
    const got = ok(await write("stock.receive", {
      product, location: place, quantity: 30, day: TODAY, capture: "typed",
    }));

    ok(await write("stock.undo", { movement: String(got.movement), day: TODAY }));

    const lines = ok(await read("stock.list")).items as { product: string; quantity: number }[];
    expect(lines.filter((l) => l.product === product)[0]?.quantity ?? 0).toBe(0);

    const history = ok(await read("ledger.list")).items as { product: string }[];
    /* ⚠️ TWO ROWS, NOT NONE. The receipt and the thing that cancelled it. */
    expect(history.filter((r) => r.product === product)).toHaveLength(2);
  });

  /*
    ⚠️ AND THE BUTTON IS DECLARED, WHICH IS THE HALF NOTHING PROVED FOR A MONTH.
    `stock.undo` shipped rule-complete — own movement, last on its line, inside
    the hour — and reachable from NOTHING: no screen named it, no outcome
    offered it, and every suite above was green. What this drives is the seam
    that closes that (`Outcome.back`): the way back is resolved from the
    operation's DECLARATION against its REAL answer, exactly as the browser
    does, and posted. A fixture agreeing with itself would prove neither half.
  */
  it("takes a movement back through the way back it declares", async () => {
    const place = await placeOf("Dock");
    const product = await kindOf("Cement, 20 kg", "counted");
    const got = ok(await write("stock.receive", {
      product, location: place, quantity: 12, day: TODAY, capture: "typed",
    }));

    const said = inventory().operations.find((o) => o.id === "stock.receive")!.outcome;
    const back = said && !("why" in said) ? said.back : undefined;
    expect(back?.operation).toBe("stock.undo");
    expect(back?.says).toBe("Undo");

    /* ⚠️ THE BROWSER'S OWN RESOLUTION, IN THREE LINES — `today` or a field of
       the answer, and nothing else can be named. A `said` naming something the
       operation does not answer would land here as `undefined`, which is the
       shape `refuseApp` refuses at composition and this would catch anyway. */
    const input = Object.fromEntries(Object.entries(back!.from).map(([name, from]) =>
      [name, from === "today" ? TODAY : String(got[from.said])]));
    expect(input).toEqual({ movement: String(got.movement), day: TODAY });

    ok(await write("stock.undo", input));

    const lines = ok(await read("stock.list")).items as { product: string; quantity: number }[];
    expect(lines.filter((l) => l.product === product)[0]?.quantity ?? 0).toBe(0);
  });

  /* ⚠️ AND A CORRECTION OFFERS NONE, DELIBERATELY — see `stock.adjust`. It
     demanded a written reason, so undoing it would take that sentence out of
     the ledger along with the number. Pinned because the absence is a decision
     and an absence nothing asserts is indistinguishable from an oversight. */
  it("offers no way back on a correction", () => {
    const said = inventory().operations.find((o) => o.id === "stock.adjust")!.outcome;
    expect(said && !("why" in said) ? said.back : undefined).toBeUndefined();
  });

  /* ⚠️ AND IT IS THE LAST ONE ONLY. Anything since means the number people are
     working from has moved on, so it is a correction with a reason on it. */
  it("refuses an undo that is no longer the last thing", async () => {
    const place = await placeOf("Dock");
    const product = await kindOf("Gravel", "counted");
    const first = ok(await write("stock.receive", {
      product, location: place, quantity: 10, day: TODAY, capture: "typed",
    }));
    await write("stock.receive", {
      product, location: place, quantity: 5, day: TODAY, capture: "typed",
    });

    const late = await write("stock.undo", { movement: String(first.movement), day: TODAY });
    expect(late.status).toBe(409);
    expect(JSON.stringify(late.body)).toContain("cannot be taken back");
  });
});

/* ------------------------------------------------------------------ items --- */

describe("one object, for its whole life", () => {
  /*
    ⚠️ AN ITEMISED DELIVERY BECOMES ONE ROW PER OBJECT, LABELLED, AT THE MOMENT
    IT ARRIVES — and there is no second chance at it. A workspace that received
    forty drills as a number has forty objects with no history and no way to tell
    them apart.
  */
  const drills = async () => {
    const place = await placeOf("Tool store");
    const product = await kindOf("Cordless drill", "itemised");
    const code = String((ok(await write("product.label", { ids: [product] }))
      .items as { code: string }[])[0]?.code);
    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 3, day: TODAY, year: 2026,
    }));
    const items = ok(await read("unit.list")).items as { id: string; code: string }[];
    return { place, product, items };
  };

  it("mints one labelled object per thing received", async () => {
    const { items } = await drills();
    expect(items).toHaveLength(3);
    expect(new Set(items.map((one) => one.code)).size).toBe(3);
    for (const one of items) expect(one.code).toMatch(/^ONE-U-/);
  });

  /*
    ⚠️ ISSUING TAKES IT OFF THE SHELF, AND THAT IS THE POINT. A shelf that goes
    on claiming a drill which is in somebody's van makes every count afterwards
    "find" it missing and correct a number that was right.
  */
  it("moves the shelf when an object goes out and comes back", async () => {
    const { place, product, items } = await drills();
    const one = String(items[0]?.id);

    const after = (lines: { product: string; quantity: number }[]) =>
      lines.filter((l) => l.product === product).reduce((n, l) => n + l.quantity, 0);

    ok(await write("unit.issue", { unit: one, holder: "Dana", day: TODAY }));
    expect(after(ok(await read("stock.list")).items as never)).toBe(2);

    ok(await write("unit.return", { unit: one, day: TODAY, location: place }));
    expect(after(ok(await read("stock.list")).items as never)).toBe(3);
  });

  /* ⚠️ AND RETIRING ONE NEEDS A REASON AND THE STRONGER GRANT. An object leaving
     for good is a correction to what the workspace owns. */
  it("retires an object off the shelf, with a reason", async () => {
    const { product, items } = await drills();
    ok(await write("unit.retire", {
      unit: String(items[0]?.id), day: TODAY, reason: "Dropped from a gantry",
    }));

    const lines = ok(await read("stock.list")).items as { product: string; quantity: number }[];
    expect(lines.filter((l) => l.product === product).reduce((n, l) => n + l.quantity, 0)).toBe(2);
  });

  /*
    ⚠️ A SERVICE IS THE SECOND CLOCK ON AN OBJECT, and it is a different working
    day from an expiry — which is why the two never share a list.
  */
  it("records a service and says when the next one is due", async () => {
    const { items } = await drills();
    ok(await write("unit.serve", {
      unit: String(items[0]?.id), day: TODAY, next: "2026-09-04", note: "Chuck replaced",
    }));

    const due = ok(await read("unit.due", { today: TODAY })).items as
      { on: string; days: number }[];
    expect(due.some((one) => one.on === "2026-09-04")).toBe(true);
  });
});

/* ------------------------------------------------------------------- kits --- */

describe("a kit, and what it is supposed to hold", () => {
  /*
    ⚠️ THE RECIPE NAMES REAL PRODUCTS, which is what a kit is CHECKED against —
    so the part has to exist before the tray type that holds it does. A recipe of
    invented ids is a kit that is short of things nobody can find.
  */
  const tray = async (holds = 1) => {
    const place = await placeOf("Theatre store");
    const part = await kindOf("Forceps", "itemised");
    const product = await kindOf("Minor set", "assembled", {
      recipe: [{ product: part, quantity: holds }],
    });
    const kit = idOf(await write("kit.assemble", { product, location: place, day: TODAY }));
    return { place, product, part, kit };
  };

  it("assembles a kit and gives it a label of ours", async () => {
    const { kit } = await tray();
    const rows = ok(await read("kit.list")).items as { id: string; code: string }[];
    const mine = rows.find((one) => one.id === kit);
    expect(mine?.code).toMatch(/^ONE-K-/);
  });

  /*
    ⚠️ TAKING SOMETHING OUT OF A BUILT KIT UN-BUILDS IT, which is the whole
    safety property. A tray that is short one instrument and still reads "ready"
    is a tray somebody carries into a theatre.
  */
  it("un-builds a kit when something is taken out of it", async () => {
    const { place, part, kit } = await tray();
    const code = String((ok(await write("product.label", { ids: [part] }))
      .items as { code: string }[])[0]?.code);
    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 1, day: TODAY, year: 2026,
    }));
    const one = String((ok(await read("unit.list")).items as { id: string }[])[0]?.id);

    ok(await write("kit.put", { kit, unit: one }));
    ok(await write("kit.build", { kit, day: TODAY }));
    expect(String((ok(await read("kit.list")).items as { id: string; state: string }[])
      .find((k) => k.id === kit)?.state)).toBe("built");

    ok(await write("kit.take", { kit, unit: one }));
    expect(String((ok(await read("kit.list")).items as { id: string; state: string }[])
      .find((k) => k.id === kit)?.state)).not.toBe("built");
  });

  /* ⚠️ AND WHAT IS MISSING IS A QUESTION SOMEBODY CAN ASK BEFORE THEY CARRY IT
     ANYWHERE. */
  it("says what a kit is short of", async () => {
    const { kit } = await tray();
    const said = ok(await read("kit.check", { kit }));
    expect(Array.isArray(said.short)).toBe(true);
  });
});

/* ------------------------------------------------------------------- runs --- */

describe("the release rail", () => {
  const load = async () => {
    const place = await placeOf("Sterile store");
    const product = await kindOf("Instrument tray", "batched");
    const code = String((ok(await write("product.label", { ids: [product] }))
      .items as { code: string }[])[0]?.code);
    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 1, day: TODAY, year: 2026, lot: "L1",
      expiry: "2027-01-01",
    }));
    const lot = String((ok(await read("batch.list")).items as { id: string }[])[0]?.id);
    const run = idOf(await write("process.open",
      { kind: "sterilise", machine: "Autoclave 2", day: TODAY }));
    ok(await write("process.put", { process: run, batch: lot }));
    return { run, lot, product, place };
  };

  /*
    ⚠️ A QUARANTINE THAT DOES NOT REFUSE A TAKE IS A BADGE ON A SCREEN. What is
    in a run that has ended and not been released must not leave the shelf — the
    person reads the badge, believes it, and uses the tray anyway.
  */
  it("holds what is in a run until somebody signs for it", async () => {
    const { run, lot, product, place } = await load();
    ok(await write("process.end", { process: run, evidence: "Printout 4471" }));

    const held = await write("stock.take", {
      product, location: place, batch: lot, quantity: 1, day: TODAY, capture: "typed",
    });
    expect(held.status).toBe(409);

    ok(await write("process.release", { process: run, day: TODAY }));
    ok(await write("stock.take", {
      product, location: place, batch: lot, quantity: 1, day: TODAY, capture: "typed",
    }));
  });

  /*
    ⚠️ AND A FAILED RUN IS NOT A RELEASED ONE. Everything in it stays held, with
    a reason on it — the whole rail exists for the moment somebody has to say no.
  */
  it("keeps a failed load held, and says why", async () => {
    const { run } = await load();
    ok(await write("process.end", { process: run, evidence: "Indicator lot 22B" }));
    ok(await write("process.fail", { process: run, reason: "Indicator did not turn" }));

    const rows = ok(await read("process.list")).items as { id: string; state: string }[];
    expect(rows.find((r) => r.id === run)?.state).toBe("failed");
  });

  /* ⚠️ AND A RELEASED LOAD CAN BE CALLED BACK, which is the one act that reaches
     backwards into what has already been used. */
  it("calls a released load back", async () => {
    const { run } = await load();
    ok(await write("process.end", { process: run, evidence: "Printout" }));
    ok(await write("process.release", { process: run, day: TODAY }));
    ok(await write("process.recall", { process: run, reason: "Cycle log reviewed" }));

    const rows = ok(await read("process.list")).items as { id: string; state: string }[];
    expect(rows.find((r) => r.id === run)?.state).toBe("recalled");
  });
});

/* ------------------------------------------------------------------- jobs --- */

describe("a job, and what it used", () => {
  /*
    ⚠️ THE TRACE IS THE POINT OF THE JOB. "Which jobs used lot 4471" is the
    question a recall is, and a job that recorded nothing about what it consumed
    can only answer it by asking somebody to remember.
  */
  it("records what a job consumed, and traces it", async () => {
    const place = await placeOf("Bay 1");
    const product = await kindOf("Cutting fluid", "counted");
    ok(await write("stock.receive", {
      product, location: place, quantity: 20, day: TODAY, capture: "typed",
    }));

    const job = idOf(await write("job.open", { ref: "WO-4468", label: "Bay 1 service", day: TODAY }));
    ok(await write("stock.take", {
      product, location: place, quantity: 4, day: TODAY, capture: "typed", against: job,
    }));
    ok(await write("job.close", { job, day: TODAY }));

    const said = ok(await read("job.trace", { job }));
    const items = said.items as { product: string; quantity: number; says: string }[];
    expect(items.some((one) => one.product === product && one.quantity === 4)).toBe(true);

    /*
      ⚠️ AND THE SENTENCE COMES BACK WITH IT, because the screen draws one column
      rather than three. How many, which lot and whether the lot is in question
      are one fact about a line; a screen assembling them from columns would be a
      second place the wording happens, and the trace's own row is where it
      belongs. `/job` binds `says`, so a handler that stopped sending it would
      draw a list of blank second lines with nothing failing anywhere.
    */
    expect(items.find((one) => one.product === product)?.says).toBe("4 taken");
    expect(said.doubted).toBe(0);
  });
});

/* ------------------------------------------------------------------ words --- */

/*
  ⚠️ THE WHOLE ARGUMENT FOR A TABLE OVER A STRING ON EACH PRODUCT is that a word
  is held once and renamed in one place. `tagging`'s own header said so while
  nothing could rename anything, so this drives the half that was a promise.
*/
describe("the words a catalogue is filed under", () => {
  it("renames a word once, and refuses a rename onto one that exists", async () => {
    const first = idOf(await write("product.register", {
      name: "Nitrile gloves", tracking: "counted", unit: "box",
      tags: ["Consumable", "Protective equipment"], day: TODAY,
    }));
    expect(first.length).toBeGreaterThan(0);

    const words = ok(await read("tag.list", {})) as { items?: unknown };
    const rows = (words.items ?? []) as { id: string; name: string }[];
    const consumable = rows.find((one) => one.name === "Consumable");
    const other = rows.find((one) => one.name === "Protective equipment");
    expect(consumable && other).toBeTruthy();

    ok(await write("tag.rename", { tag: consumable!.id, name: "Consumables" }));

    /*
      ⚠️ CASE-INSENSITIVE, WHICH IS THE COMPARISON REGISTRATION MATCHES ON.
      Anything narrower lets the duplicate in through the door the register flow
      closes, on the one table whose value is that it holds each word once.
    */
    const clash = await write("tag.rename", { tag: other!.id, name: "consumables" });
    expect(clash.status).toBe(409);
  });
});

/* ------------------------------------------------------------------ night --- */

describe("what the night tells somebody", () => {
  /*
    ⚠️ AN EXPIRY NOBODY IS TOLD ABOUT IS MOST OF THE REASON NOBODY RECORDS ONE.
    The sweep is declared, scheduled, listed on the operator's console and asked
    of every workspace — and until a request proved it, nothing had ever run it
    against a shelf with a date on it.
  */
  it("runs the expiry sweep over a real shelf without refusing", async () => {
    const place = await placeOf("Cold store");
    const product = await kindOf("Yoghurt", "batched");
    const code = String((ok(await write("product.label", { ids: [product] }))
      .items as { code: string }[])[0]?.code);
    ok(await write("stock.arrive", {
      raw: code, location: place, quantity: 4, day: TODAY, year: 2026,
      lot: "Y1", expiry: "2026-08-22",
    }));

    const waited: Promise<unknown>[] = [];
    await worker.scheduled!({}, asDev as never, { waitUntil: (p) => { waited.push(p); } });
    await Promise.all(waited);

    const runs = await directory().prepare(
      `SELECT ok, detail FROM job_run WHERE job_id = 'inventory.expiry'`)
      .all<{ ok: number; detail: string | null }>();
    expect(runs.results.length).toBeGreaterThanOrEqual(1);
    /* ⚠️ AND IT SURVIVED THE WORKSPACE. A pass that refused one is reported
       rather than fatal, so `ok` alone would not say this. */
    expect(runs.results.every((r) => r.ok === 1)).toBe(true);
    expect(runs.results.at(-1)?.detail ?? "").not.toContain("refused:");
  });
});

/*
  ⚠️ THE SAME QUESTION AS `inventory.test.ts`, ON THE TIER ABOVE. That suite runs
  on `solo` and is withheld the run rail; this one runs on `studio` and is not.
  Two workspaces, one worker, one manifest — the only thing that differs is what
  was bought, which is the whole claim.
*/
describe("what the plan opens", () => {
  /*
    ⚠️ DERIVED, FOR THE REASON THE FREE TIER'S IS — see `inventory.test`. This
    named three screens the surface rewrite emptied, so it asserted a claim about
    a product that no longer had them and failed with a message that reads like a
    regression. What it is FOR is that a paid tier is handed what a free one is
    withheld, and that survives every screen coming and going.

    ⚠️ AND IT DERIVES FROM `features` AS WELL AS `flag`, which is what makes it
    an assertion at all. It read only our own switch, OneInventory has never used
    one, and so this walked an empty list and passed — a suite green on a claim
    it was not making. The two tiers differ on `processes`, and the count below
    is what stops the silence coming back.
  */
  it("hands a workspace that bought it every screen the free tier is withheld", async () => {
    const res = await at("/api/centre.view", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json() as { apps: { id: string; screens: { id: string }[] }[] };
    const ids = (body.apps.find((a) => a.id === "inventory")?.screens ?? []).map((s) => s.id);
    const paid = PLANS.find((one) => one.id === "studio")!.includes as Record<string, Allowance>;
    const free = PLANS.find((one) => one.id === "solo")!.includes as Record<string, Allowance>;
    const buys = (tier: Record<string, Allowance>, keys?: readonly string[]) =>
      !keys || keys.some((key) => included(tier[key] ?? false));
    const only = (inventory().screens ?? [])
      .filter((one) => !one.flag && buys(paid, one.features) && !buys(free, one.features));
    expect(only.length, "the two tiers open the same screens, so this proves nothing")
      .toBeGreaterThan(0);
    for (const one of only) expect(ids, one.id).toContain(one.id);
    /* ⚠️ AND IT SEES THE ORDINARY ONES TOO, so a tier that opened the gated set
       by breaking the filter altogether does not pass this. */
    expect(ids).toContain("products");
  });
});

/* -------------------------------------------------------------- the report --- */

/**
 * WHAT A MONTH ADDED UP TO, THROUGH THE SCREEN THAT SHOWS IT.
 *
 * ⚠️ THE SCREEN AND NOT THE OPERATION, because everything between them is what
 * had never run: five asked views over one read, a period fed in from a control,
 * and the door holding one answer for all five. The operation was already tested
 * and already right; a report nobody could open is the shape this file exists
 * to find.
 */
describe("what the month added up to", () => {
  const screen = async (id: string, over: Record<string, string> = {}) => {
    const query = new URLSearchParams({ today: TODAY, ...over }).toString();
    const res = await at(`/api/screen/${id}?${query}`, { headers: { cookie } });
    return {
      status: res.status,
      body: await res.json() as {
        views: Record<string, { items: Record<string, unknown>[]; count: number }>;
      },
    };
  };

  it("answers every reading of the same period from one screen", async () => {
    const paper = await kindOf("Copier paper", "counted", { par: 4 });
    const shelf = await placeOf("Stationery");
    ok(await write("stock.receive", {
      product: paper, location: shelf, quantity: 10, day: TODAY, capture: "typed",
    }));
    ok(await write("stock.take", {
      product: paper, location: shelf, quantity: 6, day: TODAY, capture: "typed",
    }));
    /* ⚠️ A CORRECTION, WHICH IS THE OTHER HALF OF THE RECORDED SHARE. What left
       with somebody scanning it and what a count found gone are two numbers, and
       the figure this screen leads with is the ratio between them. Signed, and
       DOWN: an adjustment is a delta, so `2` here would be two found rather than
       two missing — see `applyMove`. */
    ok(await write("stock.adjust", {
      product: paper, location: shelf, quantity: -2, reason: "counted",
      day: TODAY, capture: "typed",
    }));

    const got = await screen("report");
    expect(got.status).toBe(200);
    const told = got.body.views["recorded"]?.items[0];
    expect(told).toBeTruthy();
    /* ⚠️ SIX TAKEN AND NOTHING FOUND GONE BY A COUNT, so everything that left
       was scanned out — see `toldIn`, which counts as inferred consumption only
       what a COUNT found. The correction below is a discrepancy and reads on the
       list; it is not somebody quietly walking off with two reams. */
    expect(told?.["recorded"]).toBe(6);
    expect(told?.["inferred"]).toBe(0);
    expect(told?.["sharePct"]).toBe(100);
    expect(String(told?.["says"])).toBe("Everything that left was scanned out");

    /* ⚠️ AND THE OTHER FOUR ARE ANSWERED TOO, which is the half that had no
       code path at all — `readsIn` walks the hero, the door runs every view a
       body names, and the report is run once for all five. */
    expect(got.body.views["what-left"]?.items.length).toBe(1);
    expect(got.body.views["what-was-wrong"]?.items.length).toBe(1);
    expect(got.body.views["day-by-day"]?.items.length).toBeGreaterThan(1);
    /* ⚠️ 2 ON THE SHELF AGAINST A PAR OF 4 AND SIX A MONTH GOING OUT — the one
       list on this screen somebody acts on. */
    expect(got.body.views["what-to-buy"]?.items.length).toBe(1);
  });

  /* ⚠️ THE CONTROL ACTUALLY NARROWS, which is the whole of `PickSpec`: it
     reaches an asked view's input on the worker, and held in the browser it
     would move a segment and leave every figure under it exactly where it was. */
  it("counts a different period when the screen is narrowed to one", async () => {
    const ink = await kindOf("Ink, black", "counted");
    const shelf = await placeOf("Print room");
    ok(await write("stock.receive", {
      product: ink, location: shelf, quantity: 40, day: TODAY, capture: "typed",
    }));
    ok(await write("stock.take", {
      product: ink, location: shelf, quantity: 9, day: TODAY, capture: "typed",
    }));

    const week = await screen("report", { "pick.span": "week" });
    const quarter = await screen("report", { "pick.span": "quarter" });
    expect(week.body.views["day-by-day"]?.items.length).toBe(7);
    expect(quarter.body.views["day-by-day"]?.items.length).toBe(90);
    /* ⚠️ AND THE MOVEMENTS ARE IN BOTH, because today is inside both windows —
       so what differs is the period and not which rows the narrowing dropped. */
    expect(week.body.views["what-left"]?.items.length)
      .toBe(quarter.body.views["what-left"]?.items.length);
  });

  /* ⚠️ AND `ledger:read` IS WHAT OPENS IT — the common role moves stock and may
     not read the record of who moved it, which is why this is a screen of its
     own rather than a group on the home. */
  it("is not offered to somebody who may not read the history", () => {
    const roles = inventory().access.roles;
    expect(roles["keeper"]).toContain("ledger:read");
    expect(roles["user"]).not.toContain("ledger:read");
    const report = (inventory().screens ?? []).find((one) => one.id === "report");
    expect(report?.permission).toBe("ledger:read");
  });
});

/* --------------------------------------------------------- the count session --- */

/**
 * A SHELF COUNTED, THROUGH THE SCREEN SOMEBODY STANDS AT.
 *
 * ⚠️ THE FOUR OPERATIONS WERE ALREADY DRIVEN — see `inventory.test`. What had
 * never run is the SCREEN: a session opened from a list, its tallies read back,
 * its differences asked for, and the close offered as a row. Every one of them
 * was reachable through the API and through an agent, and from the product by
 * nobody.
 */
describe("a shelf counted, through the screen", () => {
  const screen = async (id: string, record?: string) => {
    const query = new URLSearchParams({ today: TODAY, ...(record ? { record } : {}) });
    const res = await at(`/api/screen/${id}?${query.toString()}`, { headers: { cookie } });
    return {
      status: res.status,
      body: await res.json() as {
        record: Record<string, unknown> | null;
        acts: Record<string, unknown>;
        views: Record<string, { items: Record<string, unknown>[]; count: number }>;
      },
    };
  };

  it("opens from the list, reads back what was tallied, and says what disagrees", async () => {
    const bolts = await kindOf("Bolts, M8", "counted");
    const bin = await placeOf("Bin 7");
    ok(await write("stock.receive", {
      product: bolts, location: bin, quantity: 40, day: TODAY, capture: "typed",
    }));
    /* ⚠️ A COUNT IS DRIVEN BY WHAT THE CAMERA READ, NEVER BY A PRODUCT ID, so
       the label has to exist before the shelf can be counted — which is the
       whole reason `product.label` is a write. */
    const labelled = ok(await write("product.label", { ids: [bolts] }));
    const code = String((labelled.items as { id: string; code: string }[])
      .find((one) => one.id === bolts)?.code);
    const session = String(ok(await write("count.open", {
      location: bin, day: TODAY,
    })).id);

    /* ⚠️ THE LIST LEADS TO IT, which is what "you cannot open one" was about. */
    const list = await screen("counts");
    expect(list.body.views["counting"]?.items.some((one) => one["id"] === session)).toBe(true);

    /* ⚠️ THIRTY-SEVEN AGAINST FORTY, so the difference is three short — the
       number the whole flow exists to find. */
    ok(await write("count.tally", { count: session, raw: code, year: 2026, quantity: 37 }));

    const at37 = await screen("count", session);
    expect(at37.status).toBe(200);
    /* ⚠️ THE TALLY IS NOT THE SHELF. Until the session closes the balance is
       still forty, and reading the two as one would make a half-finished count
       visible to everybody else as fact. */
    expect(at37.body.views["counted-here"]?.items[0]?.["quantity"]).toBe(37);
    const differ = at37.body.views["what-disagrees"]?.items ?? [];
    expect(differ.length).toBe(1);
    expect(differ[0]?.["delta"]).toBe(-3);
    expect(String(differ[0]?.["name"])).toBe("Bolts, M8");
    expect(String(differ[0]?.["says"])).toBe("37 found, 3 short");

    /* ⚠️ AND BOTH VERBS ARE OFFERED ON THE SCREEN, with everything the screen is
       standing on already filled — the session, the day and the device's year. */
    expect(Object.keys(at37.body.acts)).toContain("count.tally");
    expect(Object.keys(at37.body.acts)).toContain("count.close");

    ok(await write("count.close", { count: session, day: TODAY }));
    const lines = ok(await read("stock.list")).items as { product: string; quantity: number }[];
    expect(lines.find((one) => one.product === bolts)?.quantity).toBe(37);
  });

  /* ⚠️ AND THE WAY BACK IS THE LIST THAT LED HERE — see `upFrom`. Derived from
     the `goes` on that list rather than declared, so a screen cannot disagree
     with the link somebody followed to reach it. */
  it("goes back to the list its rows were opened from", () => {
    const screens = inventory().screens ?? [];
    const here = screens.find((one) => one.id === "count")!;
    expect(upFrom(screens, here)?.id).toBe("counts");
  });
});

/* -------------------------------------------------------------- the history --- */

/**
 * THE RECORD EVERY FIGURE IN THIS PRODUCT IS MADE OF.
 *
 * ⚠️ `ledger:read` GATED THE REPORT AND NOTHING ELSE, so the question the
 * recorded share raises — who took this, and when — was answered nowhere. A
 * number nobody can drill into is a number somebody has to take on trust.
 */
describe("who moved what, and when", () => {
  const seen = async (over: Record<string, string> = {}) => {
    const query = new URLSearchParams({ today: TODAY, ...over });
    const res = await at(`/api/screen/history?${query.toString()}`, { headers: { cookie } });
    return {
      status: res.status,
      body: await res.json() as {
        views: Record<string, { items: Record<string, unknown>[]; count: number }>;
      },
    };
  };

  it("reads every movement back as a sentence, newest first", async () => {
    const tape = await kindOf("Packing tape", "counted");
    const store = await placeOf("Back store");
    const bench = await placeOf("Bench two");
    ok(await write("stock.receive", {
      product: tape, location: store, quantity: 24, day: TODAY, capture: "typed",
    }));
    ok(await write("stock.take", {
      product: tape, location: store, quantity: 5, day: TODAY, capture: "scanned",
    }));
    ok(await write("stock.move", {
      product: tape, from: store, to: bench, quantity: 4, day: TODAY, capture: "typed",
    }));

    const got = await seen();
    expect(got.status).toBe(200);
    const rows = got.body.views["every-movement"]?.items ?? [];
    const mine = rows.filter((one) => one["product"] === tape);
    /* ⚠️ FOUR ROWS FOR THREE ACTS, because a transfer genuinely changes two
       balances and is one row at each end — see `MOVES`. */
    expect(mine.length).toBe(4);
    const said = mine.map((one) => String(one["says"]));
    expect(said).toContain("Received 24 into Back store");
    expect(said).toContain("Took 5 from Back store");
    /* ⚠️ AND THE TWO HALVES OF THE TRANSFER READ DIFFERENTLY, which is the whole
       reason the sentence is composed rather than declared. */
    expect(said).toContain("Carried 4 out of Back store");
    expect(said).toContain("Carried 4 into Bench two");
    /* ⚠️ NEWEST FIRST, which is the only order a log has. */
    expect(String(mine[0]?.["name"])).toBe("Packing tape");
  });

  /* ⚠️ THE PERIOD IS A RANGE, WHICH IS WHY THIS IS AN OPERATION AND NOT A VIEW
     OVER THE TABLE — a `Match` is equality and will never say "the last seven
     days". */
  it("counts a different period when the screen is narrowed to one", async () => {
    const week = await seen({ "pick.span": "week" });
    const quarter = await seen({ "pick.span": "quarter" });
    expect(week.status).toBe(200);
    expect(quarter.body.views["every-movement"]?.count)
      .toBeGreaterThanOrEqual(week.body.views["every-movement"]?.count ?? 0);
  });

  /* ⚠️ AND THE REPORT LEADS HERE, which is what makes the share checkable rather
     than something to be believed. */
  it("is where the recorded share leads", () => {
    const report = (inventory().screens ?? []).find((one) => one.id === "report");
    expect(report?.body?.hero?.leads).toEqual(["history"]);
    const here = (inventory().screens ?? []).find((one) => one.id === "history");
    expect(here?.permission).toBe("ledger:read");
  });
});

/* ------------------------------------------------------------ the orders --- */

/**
 * BUYING IT IN, DRIVEN — the loop `/report` could describe and not close.
 *
 * ⚠️ THE ASSERTION THAT MATTERS IS THAT THE SHELF MOVED. An order rail that
 * updates its own numbers and leaves the stock alone is a spreadsheet with a
 * state machine on it — every figure agrees, the order closes clean, and nothing
 * is on the shelf. So every receipt here is checked against the balance and the
 * ledger, not against the line it was booked to.
 */
describe("buying it in", () => {
  const world = async () => {
    /* ⚠️ THE PARTY IS ONEPARTY'S AND IT IS MADE THROUGH ONEPARTY'S OWN
       OPERATION (D120, D122). OneInventory has no way to create one and must
       not — this is the seam driven end to end in a real deployment, which is
       the only place both manifests are in the room together. */
    const supplier = partyOf(await write("party.register", {
      name: "Harbour Supplies", kind: "organisation", role: "supplier",
      email: "dana@harbour.example",
    }));
    const place = idOf(await write("location.create", { name: "Goods in", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Blue roll", unit: "roll", tracking: "counted",
    }));
    return { supplier, place, product };
  };

  const onHandOf = async (product: string): Promise<number> => {
    const said = await read("stock.lines", { product });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    return (said.body.items as { quantity: number }[] ?? [])
      .reduce((sum, one) => sum + one.quantity, 0);
  };

  it("opens an order, fills it, places it, and the delivery lands on the shelf", async () => {
    const { supplier, place, product } = await world();
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));

    const added = await write("buying.add", { buying, product, quantity: 10 });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(added.body.lines).toBe(1);

    const placed = await write("buying.place", { buying, ref: "HS-4471" });
    expect(placed.status, JSON.stringify(placed.body)).toBe(200);
    expect(placed.body.state).toBe("placed");

    const part = await write("buying.receive", {
      buying, product, location: place, quantity: 4, day: TODAY, capture: "typed",
    });
    expect(part.status, JSON.stringify(part.body)).toBe(200);
    expect(part.body.state).toBe("part");
    expect(part.body.left).toBe(6);
    /* ⚠️ THE SHELF, WHICH IS THE WHOLE POINT — see the describe's header. */
    expect(await onHandOf(product)).toBe(4);

    /* ⚠️ AND IT CLOSES ITSELF WHEN THE LAST ONE LANDS. Nobody who has just
       received the last box wants to be asked to press a second button saying
       so, and an order left open because they did not is one that shows up for
       ever on the list of what is still coming. */
    const rest = await write("buying.receive", {
      buying, product, location: place, quantity: 6, day: TODAY, capture: "typed",
    });
    expect(rest.body.state).toBe("closed");
    expect(rest.body.left).toBe(0);
    expect(await onHandOf(product)).toBe(10);
  });

  /*
    ⚠️ ONE ARRIVAL PATH, AND THIS IS WHAT SAYS SO. The receipt must be in the
    ledger under the same verb an ordinary one is, carrying the order in
    `against` — otherwise a delivery booked against an order is invisible to the
    history, the usage report and the undo.
  */
  it("writes the movement to the one ledger, against the order", async () => {
    const { supplier, place, product } = await world();
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product, quantity: 3 });
    await write("buying.place", { buying });
    await write("buying.receive", {
      buying, product, location: place, quantity: 3, day: TODAY, capture: "typed",
    });

    const said = await read("stock.history", { product, today: TODAY });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    const rows = said.body.items as { says: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((one) => /received/i.test(one.says))).toBe(true);
  });

  /*
    ⚠️ RAISING A PLACED LINE IS THE TEMPTING ONE, and it is what the whole record
    exists against: a line quietly moved from 10 to 12 after 12 turn up is a
    receipt that reconciles perfectly against a promise nobody made.
  */
  it("refuses to change what a placed order asked for", async () => {
    const { supplier, product } = await world();
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product, quantity: 10 });
    await write("buying.place", { buying });

    const again = await write("buying.add", { buying, product, quantity: 2 });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).toMatch(/cannot change/);
  });

  /* ⚠️ AND PLACING AN EMPTY ONE IS REFUSED — `settled([])` is true, so an order
     placed with nothing on it would close itself on the first delivery against a
     line that does not exist. */
  it("refuses to place an order with nothing on it", async () => {
    const { supplier } = await world();
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    const placed = await write("buying.place", { buying });
    expect(placed.status).toBe(409);
    expect(JSON.stringify(placed.body)).toMatch(/nothing on this order/);
  });

  /* ⚠️ OVER-DELIVERY IS ALLOWED AND THE SHELF IS TOLD THE TRUTH — see
     `refuseArrival`. A case of 12 against an order for 10 is an ordinary
     Tuesday, and refusing it would make the paperwork more important than the
     stock. */
  it("takes more than was ordered, and the shelf says twelve", async () => {
    const { supplier, place, product } = await world();
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product, quantity: 10 });
    await write("buying.place", { buying });
    const said = await write("buying.receive", {
      buying, product, location: place, quantity: 12, day: TODAY, capture: "typed",
    });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    expect(said.body.state).toBe("closed");
    expect(said.body.left).toBe(0);
    expect(await onHandOf(product)).toBe(12);
  });

  /*
    ⚠️ CANCELLING A PART-RECEIVED ORDER WOULD ERASE WHY THE STOCK IS THERE, and
    the refusal names the way out rather than only saying no.
  */
  it("refuses to cancel once some of it has arrived, and says to close it short", async () => {
    const { supplier, place, product } = await world();
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product, quantity: 10 });
    await write("buying.place", { buying });
    await write("buying.receive", {
      buying, product, location: place, quantity: 4, day: TODAY, capture: "typed",
    });

    const cancelled = await write("buying.cancel", { buying });
    expect(cancelled.status).toBe(409);
    expect(JSON.stringify(cancelled.body)).toMatch(/close it short/);

    /* ⚠️ AND THE WAY OUT WORKS, WITH THE SHORTFALL REPORTED. An order closed
       short that could not say how short is one nobody can reconcile against
       an invoice. */
    const closed = await write("buying.close", { buying, reason: "Discontinued" });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body.short).toBe(6);
  });

  /* ⚠️ AND NOTHING ARRIVES AGAINST A DRAFT. A delivery booked to an order
     nobody sent is stock on the shelf under a promise that was never made. */
  it("refuses a delivery against an order that was never placed", async () => {
    const { supplier, place, product } = await world();
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product, quantity: 5 });
    const said = await write("buying.receive", {
      buying, product, location: place, quantity: 5, day: TODAY, capture: "typed",
    });
    expect(said.status).toBe(409);
    expect(JSON.stringify(said.body)).toMatch(/not been placed/);
    expect(await onHandOf(product)).toBe(0);
  });
});

/**
 * WHAT THE SHELF IS WORTH, DRIVEN.
 *
 * ⚠️ EVERY FAILURE HERE IS A NUMBER THAT LOOKS LIKE MONEY AND IS NOT. A
 * valuation is believed on sight — nobody re-derives it — so every way of being
 * wrong is a way of being wrong silently, in a report somebody takes to their
 * accountant. `costing.test.ts` proves the arithmetic; this proves it is
 * actually reached, on the rows the product writes.
 */
describe("what a movement does to a line's worth", () => {
  const shelved = async (name: string) => {
    const place = idOf(await write("location.create", { name: `${name} shelf`, kind: "room" }));
    const product = idOf(await write("product.create", {
      name, unit: "item", tracking: "counted",
    }));
    return { place, product };
  };

  /**
   * ⚠️ THE LINE'S OWN RATE, IN MILLI, OFF THE ROW — and read through the
   * GENERATED list rather than `stock.lines`, which names its columns by hand
   * and does not carry it. That is a real gap and it is the value pass's to
   * close; asserting through the bespoke read would pin the gap instead.
   */
  const rateOf = async (product: string): Promise<number | null> => {
    const said = await read("stock.list");
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    const rows = (said.body.items as { product: string; rate: number | null }[])
      .filter((one) => one.product === product);
    expect(rows).toHaveLength(1);
    return rows[0]?.rate ?? null;
  };

  const movesOf = async (product: string): Promise<{ move: string; value: number | null }[]> => {
    const said = await read("ledger.list", { product });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    return (said.body.items as { product: string; move: string; value: number | null }[])
      .filter((one) => one.product === product);
  };

  /*
    ⚠️ THE TOTAL BECOMES A RATE, DIVIDED ONCE, ON THE SERVER. £120 for ten is
    £12.00 each — 12000 milli — and the person holding the delivery note types
    the number that is on it rather than dividing by ten in their head.
  */
  it("takes the line's total and holds the rate per unit", async () => {
    const { place, product } = await shelved("Anchor bolt");
    const got = await write("stock.receive", {
      product, location: place, quantity: 10, day: TODAY, capture: "typed", cost: 12000,
    });
    expect(got.status, JSON.stringify(got.body)).toBe(200);
    expect(await rateOf(product)).toBe(1200 * 1000);
  });

  /*
    ⚠️ THE BLEND IS WEIGHTED BY WHAT IS ALREADY THERE. Ten at £12 then ten at £8
    is £10 each, not £8 — an average that took the newest price would reprice a
    warehouse on one small delivery.
  */
  it("blends a second delivery into the first, weighted by quantity", async () => {
    const { place, product } = await shelved("Shackle");
    await write("stock.receive", {
      product, location: place, quantity: 10, day: TODAY, capture: "typed", cost: 12000 });
    await write("stock.receive", {
      product, location: place, quantity: 10, day: TODAY, capture: "typed", cost: 8000 });
    expect(await rateOf(product)).toBe(1000 * 1000);
  });

  /* ⚠️ AND A DELIVERY WITH NO PRICE LEAVES THE RATE ALONE. Receiving stock
     without knowing what it cost is the ordinary case; reading that as "it was
     free" would drag the shelf's rate to nothing one delivery at a time. */
  it("leaves the rate alone when nobody said what it cost", async () => {
    const { place, product } = await shelved("Cleat");
    await write("stock.receive", {
      product, location: place, quantity: 4, day: TODAY, capture: "typed", cost: 4000 });
    await write("stock.receive", {
      product, location: place, quantity: 4, day: TODAY, capture: "typed" });
    expect(await rateOf(product)).toBe(1000 * 1000);
  });

  /*
    ⚠️ WHAT LEFT COST IS RECORDED WHEN IT LEFT, AND THE RATE DOES NOT MOVE. This
    is the number a sales side will ask for: computed afterwards it would be
    computed against a rate that has since blended, which is the one arithmetic
    error in this area nobody notices.
  */
  it("records what the stock that left cost, and does not reprice the rest", async () => {
    const { place, product } = await shelved("Thimble");
    await write("stock.receive", {
      product, location: place, quantity: 10, day: TODAY, capture: "typed", cost: 5000 });
    await write("stock.take", {
      product, location: place, quantity: 4, day: TODAY, capture: "typed" });

    expect(await rateOf(product)).toBe(500 * 1000);
    const moves = await movesOf(product);
    expect(moves.find((m) => m.move === "received")?.value).toBe(5000);
    expect(moves.find((m) => m.move === "taken")?.value).toBe(-2000);
  });

  /*
    ⚠️ MOVING A PALLET MUST NOT CHANGE WHAT A WAREHOUSE IS WORTH, and this is the
    test that says so end to end. The source loses what it was worth and the
    destination gains the same money — however differently the two shelves were
    priced. A destination pricing the arrival at its OWN rate would create or
    destroy value on every transfer between two shelves holding the same thing.
  */
  it("carries the source's rate across a transfer, and the two halves cancel", async () => {
    const { place, product } = await shelved("Turnbuckle");
    const other = idOf(await write("location.create", { name: "Far store", kind: "room" }));

    await write("stock.receive", {
      product, location: place, quantity: 10, day: TODAY, capture: "typed", cost: 30000 });
    await write("stock.receive", {
      product, location: other, quantity: 10, day: TODAY, capture: "typed", cost: 10000 });

    const carried = await write("stock.move", {
      product, from: place, to: other, quantity: 5, day: TODAY, capture: "typed" });
    expect(carried.status, JSON.stringify(carried.body)).toBe(200);

    const moves = (await movesOf(product)).filter((m) => m.move === "moved");
    expect(moves).toHaveLength(2);
    expect(moves.reduce((sum, one) => sum + (one.value ?? 0), 0)).toBe(0);
  });

  /*
    ⚠️ FINDING TWO MORE ON A SHELF IS NOT BUYING TWO MORE. Nothing was paid, so
    nothing reprices; the value follows the count at whatever the shelf is worth
    per unit, and the difference is a fact somebody should see rather than a
    rounding the ledger absorbs.
  */
  it("moves value at the standing rate on a correction, and reprices nothing", async () => {
    const { place, product } = await shelved("Bosun's chair");
    await write("stock.receive", {
      product, location: place, quantity: 10, day: TODAY, capture: "typed", cost: 20000 });
    await write("stock.adjust", {
      product, location: place, quantity: 2, day: TODAY, capture: "typed",
      reason: "Two more found behind the crate" });

    expect(await rateOf(product)).toBe(2000 * 1000);
    expect((await movesOf(product)).find((m) => m.move === "adjusted")?.value).toBe(4000);
  });

  /* ⚠️ A WORKSPACE THAT HAS NEVER ENTERED A PRICE HAS AN UNKNOWN VALUE, NOT A
     ZERO — and every row it writes has to preserve that, or "£0" over a full
     warehouse is what a report says. */
  it("says nothing rather than nought about stock nobody has priced", async () => {
    const { place, product } = await shelved("Fender");
    await write("stock.receive", {
      product, location: place, quantity: 6, day: TODAY, capture: "typed" });
    expect(await rateOf(product)).toBeNull();
    expect((await movesOf(product)).find((m) => m.move === "received")?.value).toBeNull();
  });

  /* ⚠️ AND THE DELIVERY LANE CARRIES A PRICE TOO. Most stock arrives against an
     order, so a receipt that could not cost one would leave the value of a
     warehouse resting on the ad-hoc screen. */
  it("costs a delivery received against an order", async () => {
    const supplier = partyOf(await write("party.register", {
      name: "Chandlery", kind: "organisation", role: "supplier",
      email: "iris@chandlery.example" }));
    const { place, product } = await shelved("Warp");
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product, quantity: 8 });
    await write("buying.place", { buying, ref: "CH-91" });

    const had = await write("buying.receive", {
      buying, product, location: place, quantity: 8, day: TODAY, capture: "typed", cost: 16000 });
    expect(had.status, JSON.stringify(had.body)).toBe(200);
    expect(await rateOf(product)).toBe(2000 * 1000);
  });
});

/**
 * AND THE VALUE REACHES A SCREEN.
 *
 * ⚠️ THE ROW HELD IT AND NOTHING DREW IT, which is the whole shape of the fault
 * this round is against — a fact correctly recorded, correctly derived, and
 * reaching no surface. These drive `stock.lines`, which is what the product
 * page, the place page and the report all read through.
 */
describe("what the shelf is worth, on the screens", () => {
  const lines = async (input: Record<string, string> = {}) => {
    const said = await read("stock.lines", input);
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    return said.body as {
      items: { product: string; quantity: number; worth: number | null }[];
      total: number;
      worth: {
        quantity: number; lines: number; worth: number | null;
        priced: number; unpriced: number; says: string;
      }[];
    };
  };

  /* ⚠️ THE RATE IS MILLI AND MUST NEVER LEAVE — a thousandth of what `money`
     renders, so a rate on a screen is a figure off by a factor of a thousand.
     What crosses the wire is the arithmetic already done. */
  it("sends what a line is worth and never the rate it came from", async () => {
    const place = idOf(await write("location.create", { name: "Rope locker", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Mooring line", unit: "coil", tracking: "counted" }));
    await write("stock.receive", {
      product, location: place, quantity: 4, day: TODAY, capture: "typed", cost: 8000 });

    const said = await lines({ product });
    expect(said.items[0]?.worth).toBe(8000);
    expect(said.items[0]).not.toHaveProperty("rate");
  });

  /*
    ⚠️ THE TOTAL IS THE SUM OF WHAT IS KNOWN, AND HOW MUCH IS NOT KNOWN TRAVELS
    WITH IT. Drawn alone over a catalogue nobody has finished costing, a total is
    a confident number wrong by however much is missing — and nothing on the
    screen would say so. That is why the count and the sentence are answered
    beside the figure rather than left to a screen to work out.
  */
  it("says what the figure leaves out", async () => {
    const place = idOf(await write("location.create", { name: "Sail bin", kind: "room" }));
    const priced = idOf(await write("product.create", {
      name: "Jib sheet", unit: "coil", tracking: "counted" }));
    const not = idOf(await write("product.create", {
      name: "Whipping twine", unit: "reel", tracking: "counted" }));

    await write("stock.receive", {
      product: priced, location: place, quantity: 2, day: TODAY, capture: "typed", cost: 3000 });
    await write("stock.receive", {
      product: not, location: place, quantity: 5, day: TODAY, capture: "typed" });

    const said = await lines({ where: place });
    expect(said.worth[0]?.worth).toBe(3000);
    expect(said.worth[0]?.priced).toBe(1);
    expect(said.worth[0]?.unpriced).toBe(1);
    expect(said.worth[0]?.says).toMatch(/1 more line is not priced|One more line is not priced/);
  });

  /*
    ⚠️ AND A WORKSPACE THAT HAS PRICED NOTHING IS WORTH AN UNKNOWN, NOT NOUGHT.
    "£0.00" over a full warehouse is the confident empty with a currency symbol
    on it — the one reading a valuation must never produce.
  */
  it("says nothing rather than nought where nothing is priced", async () => {
    const place = idOf(await write("location.create", { name: "Chain locker", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Anchor chain", unit: "metre", tracking: "counted" }));
    await write("stock.receive", {
      product, location: place, quantity: 30, day: TODAY, capture: "typed" });

    const said = await lines({ where: place });
    expect(said.worth[0]?.worth).toBeNull();
    expect(said.worth[0]?.quantity).toBe(30);
    expect(said.worth[0]?.says).toMatch(/not priced/i);
  });

  /*
    ⚠️ THE BALANCE THE PRODUCT PAGE COULD NOT SAY. Its hero counted SHELVES and
    its own comment named why: a view answers how many rows it has and will never
    sum a column. This is that sum, and it is what the hero reads now.
  */
  it("sums the quantity across a product's shelves", async () => {
    const one = idOf(await write("location.create", { name: "Fore peak", kind: "room" }));
    const two = idOf(await write("location.create", { name: "Aft peak", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Shackle pin", unit: "item", tracking: "counted" }));

    await write("stock.receive", {
      product, location: one, quantity: 12, day: TODAY, capture: "typed", cost: 2400 });
    await write("stock.receive", {
      product, location: two, quantity: 8, day: TODAY, capture: "typed", cost: 1600 });

    const said = await lines({ product });
    expect(said.worth[0]?.quantity).toBe(20);
    expect(said.worth[0]?.lines).toBe(2);
    expect(said.worth[0]?.worth).toBe(4000);
  });

  /* ⚠️ AND NARROWING TO ONE PRODUCT NARROWS THE TOTAL TOO. A figure summed over
     every line while the list under it showed one product's would be two answers
     to differently narrowed questions, side by side, with nothing saying so. */
  it("narrows the figure by the same question as the lines", async () => {
    const place = idOf(await write("location.create", { name: "Lazarette", kind: "room" }));
    const mine = idOf(await write("product.create", {
      name: "Fairlead", unit: "item", tracking: "counted" }));
    const other = idOf(await write("product.create", {
      name: "Stanchion", unit: "item", tracking: "counted" }));

    await write("stock.receive", {
      product: mine, location: place, quantity: 3, day: TODAY, capture: "typed", cost: 900 });
    await write("stock.receive", {
      product: other, location: place, quantity: 3, day: TODAY, capture: "typed", cost: 9000 });

    const said = await lines({ product: mine });
    expect(said.items).toHaveLength(1);
    expect(said.worth[0]?.worth).toBe(900);
  });
});

/**
 * CARRIAGE, SPREAD ACROSS WHAT ARRIVED.
 *
 * ⚠️ THE ONLY WAY TO SEE THIS IS TO DRIVE IT. The spread is pure and tested, the
 * line prices are a column, and the receipt is a chokepoint — and the thing that
 * can be wrong is the wiring between the three: a receipt priced from its own
 * row alone, a typed cost passed through instead of the landed one, a carriage
 * that reaches the screen and never the shelf. Every one of those typechecks.
 */
describe("carriage, spread across what arrived", () => {
  /** ⚠️ An order with two lines at known prices, in the state a van lands on. */
  const ordered = async (name: string, carriage: number) => {
    const place = idOf(await write("location.create", { name: `${name} bay`, kind: "room" }));
    const supplier = partyOf(await write("party.register", { name: `${name} Supplies`, kind: "organisation", role: "supplier" }));
    const heavy = idOf(await write("product.create", {
      name: `${name} pallet`, unit: "pallet", tracking: "counted" }));
    const light = idOf(await write("product.create", {
      name: `${name} box`, unit: "box", tracking: "counted" }));
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    /* ⚠️ £84.00 against £25.60 — by value the van costs the pallet £27.59 and
       the box £8.41, where by count it would be £18.00 each. */
    await write("buying.add", { buying, product: heavy, quantity: 20, cost: 8_400 });
    await write("buying.add", { buying, product: light, quantity: 8, cost: 2_560 });
    if (carriage) {
      const said = await write("buying.carriage", { buying, carriage });
      expect(said.status, JSON.stringify(said.body)).toBe(200);
    }
    await write("buying.place", { buying });
    return { place, buying, heavy, light };
  };

  const rateOf = async (product: string): Promise<number | null> => {
    const said = await read("stock.list");
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    const rows = (said.body.items as { product: string; rate: number | null }[])
      .filter((one) => one.product === product);
    return rows[0]?.rate ?? null;
  };

  /*
    ⚠️ THE SHELF CARRIES THE FREIGHT, WHICH IS THE WHOLE FEATURE. £84.00 of goods
    and £27.59 of van is £111.59 for twenty — and a product that recorded only
    the £84.00 would value the warehouse below what the business paid, by the one
    component that is never small on a small order.
  */
  it("lands the carriage on the shelf, not just on the order", async () => {
    const { place, buying, heavy } = await ordered("Harbour", 3_600);
    const got = await write("buying.receive", {
      buying, product: heavy, location: place, quantity: 20,
      day: TODAY, capture: "typed",
    });
    expect(got.status, JSON.stringify(got.body)).toBe(200);
    expect(got.body.landed).toBe(8_400 + 2_759);
    /* ⚠️ Milli per unit: £111.59 over twenty is £5.5795 each, which is exactly
       the sub-penny rate the milli column exists to hold. */
    expect(await rateOf(heavy)).toBe(Math.round(((8_400 + 2_759) * 1000) / 20));
  });

  /* ⚠️ BY VALUE, NOT BY COUNT — the cheap line does not carry half the van. */
  it("gives the cheaper line the smaller share", async () => {
    const { place, buying, light } = await ordered("Northgate", 3_600);
    const got = await write("buying.receive", {
      buying, product: light, location: place, quantity: 8,
      day: TODAY, capture: "typed",
    });
    expect(got.body.landed).toBe(2_560 + 841);
  });

  /*
    ⚠️ THE DELIVERY NOTE WINS OVER THE QUOTE, AND THE FREIGHT STILL RIDES. A
    supplier who invoices £90 for what they quoted £84 has been paid £90, and the
    shelf has to say so — but the van cost what it cost.
  */
  it("takes the typed price over the quote and still adds the share", async () => {
    const { place, buying, heavy } = await ordered("Fenwick", 3_600);
    const got = await write("buying.receive", {
      buying, product: heavy, location: place, quantity: 20,
      day: TODAY, capture: "typed", cost: 9_000,
    });
    expect(got.body.landed).toBe(9_000 + 2_759);
  });

  /* ⚠️ AND A PART DELIVERY TAKES A PART SHARE. Half the pallet line is half its
     goods and half its freight — not the whole van on the first van. */
  it("takes a part share of the carriage on a part delivery", async () => {
    const { place, buying, heavy } = await ordered("Cawdor", 3_600);
    const got = await write("buying.receive", {
      buying, product: heavy, location: place, quantity: 10,
      day: TODAY, capture: "typed",
    });
    expect(got.body.landed).toBe(4_200 + 1_380);
  });

  /*
    ⚠️ THE CARRIAGE IS FIXED THE MOMENT SOMETHING ARRIVES. This is the refusal
    the whole design rests on — the alternative is a subsystem that reposts a
    ledger, which is the thing `costing.ts`'s header refuses in writing.
  */
  it("refuses to move the carriage once a delivery has landed", async () => {
    const { place, buying, heavy } = await ordered("Selby", 3_600);
    await write("buying.receive", {
      buying, product: heavy, location: place, quantity: 5,
      day: TODAY, capture: "typed",
    });
    const said = await write("buying.carriage", { buying, carriage: 9_900 });
    expect(said.status).toBe(409);
    expect(JSON.stringify(said.body)).toContain("share of the carriage is fixed");
  });

  /* ⚠️ AND THE ORDER SAYS WHAT IT COMES TO, CARRIAGE AND ALL — the figure the
     screen draws, from the same spread the receipt used. Two calculations would
     let the page promise a number the ledger never records. */
  it("says what the whole order comes to, carriage included", async () => {
    const { buying } = await ordered("Ravenscar", 3_600);
    const said = await read("buying.lines", { buying });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    const body = said.body as {
      items: { worth: number | null }[];
      worth: { total: number | null; carriage: number; says: string }[];
    };
    expect(body.worth[0]?.total).toBe(8_400 + 2_560 + 3_600);
    expect(body.worth[0]?.says).toBe("2 lines · carriage included");
    /* ⚠️ AND THE LINES ADD UP TO IT. A total larger than its own rows is the
       figure somebody spends a morning reconciling. */
    expect(body.items.reduce((sum, one) => sum + (one.worth ?? 0), 0))
      .toBe(body.worth[0]?.total);
  });

  /*
    ⚠️ AN UNPRICED LINE TAKES NO SHARE, so the whole van lands on what the order
    could value. Spreading over an unknown would put a defensible-looking number
    on a line nobody can check.
  */
  it("puts the whole carriage on the lines that have a price", async () => {
    const place = idOf(await write("location.create", { name: "Mixed bay", kind: "room" }));
    const supplier = partyOf(await write("party.register", { name: "Mixed Supplies", kind: "organisation", role: "supplier" }));
    const known = idOf(await write("product.create", {
      name: "Known crate", unit: "crate", tracking: "counted" }));
    const blank = idOf(await write("product.create", {
      name: "Unquoted crate", unit: "crate", tracking: "counted" }));
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product: known, quantity: 10, cost: 10_000 });
    await write("buying.add", { buying, product: blank, quantity: 10 });
    await write("buying.carriage", { buying, carriage: 1_000 });
    await write("buying.place", { buying });

    const got = await write("buying.receive", {
      buying, product: known, location: place, quantity: 10,
      day: TODAY, capture: "typed",
    });
    expect(got.body.landed).toBe(11_000);

    /* ⚠️ AND THE UNQUOTED ONE STAYS UNKNOWN RATHER THAN BECOMING THE CARRIAGE.
       A shelf worth "the freight" is a number nobody could defend. */
    const other = await write("buying.receive", {
      buying, product: blank, location: place, quantity: 10,
      day: TODAY, capture: "typed",
    });
    expect(other.body.landed).toBeNull();
    expect(await rateOf(blank)).toBeNull();
  });

  /* ⚠️ RAISING A LINE ADDS ITS PRICE, because `cost` is the whole line and
     adding the same product again is ordering more of the same thing. */
  it("adds the price when the same product is put on twice", async () => {
    const supplier = partyOf(await write("party.register", { name: "Twice Supplies", kind: "organisation", role: "supplier" }));
    const product = idOf(await write("product.create", {
      name: "Twice crate", unit: "crate", tracking: "counted" }));
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product, quantity: 10, cost: 5_000 });
    await write("buying.add", { buying, product, quantity: 10, cost: 5_000 });
    const said = await read("buying.lines", { buying });
    expect((said.body.worth as { total: number }[])[0]?.total).toBe(10_000);
  });

  /* ⚠️ AND A RAISE THAT NAMES NO PRICE LEAVES THE STANDING ONE ALONE. Reading
     the absence as free would quietly halve what the order says it will cost. */
  it("keeps the price when the raise names none", async () => {
    const supplier = partyOf(await write("party.register", { name: "Silent Supplies", kind: "organisation", role: "supplier" }));
    const product = idOf(await write("product.create", {
      name: "Silent crate", unit: "crate", tracking: "counted" }));
    const buying = idOf(await write("buying.open", { supplier, today: TODAY }));
    await write("buying.add", { buying, product, quantity: 10, cost: 5_000 });
    await write("buying.add", { buying, product, quantity: 5 });
    const said = await read("buying.lines", { buying });
    expect((said.body.worth as { total: number }[])[0]?.total).toBe(5_000);
  });
});
