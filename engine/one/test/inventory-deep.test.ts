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
import worker, { APPS, LEGAL } from "../src/index.js";
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
    slug: SLUG, name: "Foundry", country: "DE", where: "eu", apps: ["inventory"],
  });
  if (typeof made === "string") throw new Error(made);
  await compPlan(directory(), made.tenant.id, MEMBERSHIP, "studio");

  const shard = env.SHARD_EU_1 as unknown as Db;
  const who = await upsertAccount(directory(), "foreman@example.com", null);
  /* ⚠️ `keeper` holds `process:release`, which is the grant the whole rail turns
     on — loading a machine and signing for what came out of it are different
     acts by frequently different people. */
  await found(shard, made.tenant.id as never, who as never, "foreman@example.com",
    { inventory: "keeper" });
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
    const items = said.items as { product: string; quantity: number }[];
    expect(items.some((one) => one.product === product && one.quantity === 4)).toBe(true);
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
  */
  it("hands a workspace that bought it every screen the free tier is withheld", async () => {
    const res = await at("/api/centre.view", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json() as { apps: { id: string; screens: { id: string }[] }[] };
    const ids = (body.apps.find((a) => a.id === "inventory")?.screens ?? []).map((s) => s.id);
    const gated = (inventory().screens ?? []).flatMap((one) => (one.flag ? [one.id] : []));
    for (const id of gated) expect(ids).toContain(id);
    /* ⚠️ AND IT SEES THE ORDINARY ONES TOO, so a tier that opened the gated set
       by breaking the filter altogether does not pass this. */
    expect(ids).toContain("products");
  });
});
