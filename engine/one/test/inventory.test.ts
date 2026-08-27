/**
 * ONEINVENTORY, DRIVEN — the golden path, through the real worker.
 *
 * ⚠️ EVERY OTHER TEST THIS PRODUCT HAS IS OVER A PURE FUNCTION OR A
 * DECLARATION. Fifty operations, fourteen collections and a chokepoint were
 * composed, typechecked, guarded and green without one of them ever having been
 * EXECUTED against a database. That is the failure class this repository is a
 * catalogue of — declared, mounted, and reached by nothing — and the only thing
 * that closes it is a request.
 *
 * ⚠️ IT DRIVES THE WORKSPACE'S OWN DOOR, over `/api/<operation>`, with a session
 * cookie. Calling the handlers directly would skip the gate, the permission, the
 * entitlement, the quota, the problem catalogue and the routing — which is most
 * of what could be wrong.
 *
 * ⚠️ AND THE ASSERTIONS ARE ABOUT WHAT THE PRODUCT PROMISES, not about which
 * rows moved. "Taking more than there is is refused" and "a count's correction
 * is attributed to the count" are the two sentences the whole model rests on.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MEMBERSHIP, addShard, compPlan, createTenant, found, noteBelonging, noteShardApp,
  startSession, upsertAccount, type Db,
} from "@engine/runtime";
import { isDrawn } from "@engine/kernel";
import { inventory } from "@engine/inventory";
import worker, { APPS, LEGAL } from "../src/index.js";
import { warm } from "./warm.js";

const { ctx, settled } = warm();

/* ⚠️ `development` is what `wrangler dev` passes, and it is what the suite needs
   for the same reason every other file here does: the deployed config says
   `production`, and this one has no signing secret of its own. */
const asDev = { ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test" };

const SLUG = "ironworks";
const directory = () => env.DIRECTORY as unknown as Db;

let cookie = "";
let tenantId = "";

/** The workspace's own door — the only place a product's operations answer. */
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

/** ⚠️ Reads the id off a create, and fails loudly rather than returning "". */
const idOf = (said: Said): string => {
  expect(said.status, JSON.stringify(said.body)).toBe(200);
  const id = said.body.id;
  expect(typeof id, JSON.stringify(said.body)).toBe("string");
  return String(id);
};

/** ⚠️ The code `product.label` minted, which is the only handle a count takes. */
const codeOf = (said: Said, product: string): string => {
  expect(said.status, JSON.stringify(said.body)).toBe(200);
  const items = said.body.items as { id: string; code: string }[];
  const mine = items.find((one) => one.id === product);
  expect(mine, JSON.stringify(said.body)).toBeDefined();
  return String(mine?.code);
};

const TODAY = "2026-08-21";

beforeAll(async () => {
  await at("/health");
  await settled();
  await addShard(directory(), "eu-1", "eu", 100);
  for (const id of Object.keys(APPS)) await noteShardApp(directory(), "eu-1", id);

  const made = await createTenant(directory(), {
    slug: SLUG, name: "Ironworks", country: "DE", where: "eu", apps: ["inventory"],
  });
  if (typeof made === "string") throw new Error(made);
  tenantId = made.tenant.id;

  /*
    ⚠️ A PLAN, BECAUSE THE PARKING ROW SELLS NOTHING. `none` is what a workspace
    that never chose sits on: no products, no locations, no import — so a suite
    without this would be asserting the gate rather than the product.

    ⚠️ AND IT IS WRITTEN AGAINST `MEMBERSHIP`, NOT AGAINST THE APP. One plan
    covers the whole account (OneMembership); a row filed under `inventory` is a
    row `heldBy` never looks at, and every operation would fall through to the
    parking tier while the row sat there looking correct.
  */
  await compPlan(directory(), tenantId as never, MEMBERSHIP, "solo");

  const shard = env.SHARD_EU_1 as unknown as Db;
  const who = await upsertAccount(directory(), "keeper@example.com", null);
  /* ⚠️ `keeper` holds `stock:adjust`, which is the grant the sharp half of this
     product is behind — correcting a number is not the same as taking one. */
  await found(shard, tenantId as never, who as never, "keeper@example.com",
    { inventory: "keeper" });
  await noteBelonging(directory(), who as never, tenantId as never);
  cookie = `one_session=${(await startSession(directory(), who as never)).id}`;

  /* ⚠️ THE WALL COMES FIRST, and it holds the whole product including reads —
     so a suite that skipped it would get 451 on every assertion below and read
     as a product that does not work. */
  for (const doc of Object.values(LEGAL.documents)) {
    const done = await at("/api/me.accept", {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ document: doc.id, version: doc.version }),
    });
    expect(done.status, doc.id).toBe(200);
  }
});

/* ------------------------------------------------------------- the shelves --- */

describe("what is where, and how many", () => {
  /*
    ⚠️ THE FIRST REQUEST IS THE WHOLE POINT OF THE FILE. A product can be
    declared, composed, mounted, guarded and green while its very first operation
    500s on a column that was never created — and nothing anywhere would have
    said so.
  */
  it("answers a generated list before anything is in it", async () => {
    const said = await read("product.list");
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    expect(said.body.items).toEqual([]);
  });

  it("makes a place and a product", async () => {
    const place = idOf(await write("location.create", { name: "Store room", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Nitrile gloves, M", brand: "Ansell", unit: "box", tracking: "counted",
    }));
    /* ⚠️ THE COLLECTION'S OWN NAME IS THE PREFIX — `newId` is the platform's,
       and an app inventing a three-letter stem for a generated record would be
       two id conventions in one database. */
    expect(place).toMatch(/^location_/);
    expect(product).toMatch(/^product_/);
  });

  /*
    ⚠️ RECEIVING MOVES THE BALANCE AND WRITES THE HISTORY IN ONE ACT. The
    chokepoint is the product's central claim — every balance change goes through
    `stockMove`, so the ledger is the whole story — and it is a claim about
    RUNTIME that no structural guard can make.
  */
  it("puts stock on a shelf, and the shelf says so", async () => {
    const place = idOf(await write("location.create", { name: "Bay 1", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Masking tape", unit: "roll", tracking: "counted",
    }));

    const got = await write("stock.receive", {
      product, location: place, quantity: 24, day: TODAY, capture: "typed" });
    expect(got.status, JSON.stringify(got.body)).toBe(200);

    const lines = await read("stock.list");
    const mine = (lines.body.items as { product: string; quantity: number }[])
      .filter((l) => l.product === product);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.quantity).toBe(24);
  });

  /*
    ⚠️ AND TAKING MORE THAN THERE IS IS REFUSED, IN THE PRODUCT'S OWN WORDS.
    Landing on zero instead is the single most damaging thing an inventory can
    do quietly: the shelf then agrees with whoever took the last of it, and the
    discrepancy that would have found the problem is gone.
  */
  it("refuses to take more than is there, and says which", async () => {
    const place = idOf(await write("location.create", { name: "Cabinet 2", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Isopropanol 99%", unit: "bottle", tracking: "counted",
    }));
    await write("stock.receive", { product, location: place, quantity: 3, day: TODAY, capture: "typed" });

    const short = await write("stock.take", {
      product, location: place, quantity: 5, day: TODAY, capture: "typed" });
    expect(short.status).toBe(409);
    expect(JSON.stringify(short.body)).toContain("not that much");

    /* ⚠️ AND THE REFUSAL LEFT THE SHELF ALONE. A 409 over a write that had
       already landed is worse than no refusal at all. */
    const lines = await read("stock.list");
    const mine = (lines.body.items as { product: string; quantity: number }[])
      .filter((l) => l.product === product);
    expect(mine[0]?.quantity).toBe(3);
  });

  /* ⚠️ TAKING WHAT IS THERE WORKS, which is the half a test asserting only the
     refusal would let somebody break by refusing everything. */
  it("takes what is there", async () => {
    const place = idOf(await write("location.create", { name: "Bench", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Screws, M4 × 20", unit: "item", tracking: "counted",
    }));
    await write("stock.receive", { product, location: place, quantity: 100, day: TODAY, capture: "typed" });
    const took = await write("stock.take", {
      product, location: place, quantity: 40, day: TODAY, capture: "typed" });
    expect(took.status, JSON.stringify(took.body)).toBe(200);

    const lines = await read("stock.list");
    const mine = (lines.body.items as { product: string; quantity: number }[])
      .filter((l) => l.product === product);
    expect(mine[0]?.quantity).toBe(60);
  });
});

/* ------------------------------------------------------------- the history --- */

describe("what the record says happened", () => {
  /*
    ⚠️ A MOVEMENT IS A ROW SOMEBODY CAN READ, and the reason the ledger exists is
    that the balance alone cannot answer "who took it". A product where the two
    could disagree is one where neither is worth reading.
  */
  it("writes a line of history for every movement", async () => {
    const place = idOf(await write("location.create", { name: "Shelf A", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Cutting fluid, 5 L", unit: "item", tracking: "counted",
    }));
    await write("stock.receive", { product, location: place, quantity: 10, day: TODAY, capture: "typed" });
    await write("stock.take", { product, location: place, quantity: 4, day: TODAY, capture: "typed" });

    const said = await read("ledger.list");
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    const mine = (said.body.items as { product: string; move: string; delta: number }[])
      .filter((r) => r.product === product);
    expect(mine.map((r) => r.move).sort()).toEqual(["received", "taken"]);
    expect(mine.reduce((n, r) => n + r.delta, 0)).toBe(6);
  });
});

/* --------------------------------------------------------------- the count --- */

describe("counting a shelf", () => {
  /*
    ⚠️ A COUNT'S CORRECTION IS ATTRIBUTED TO THE COUNT, and that attribution is
    what the recorded-share figure is computed from. Written as an ordinary
    adjustment it is indistinguishable from somebody fixing a typo, and the one
    number that says whether anybody is actually scanning reads a hundred per
    cent for ever — in the flattering direction, with every test green.
  */
  it("settles a session, and the correction names the session", async () => {
    const place = idOf(await write("location.create", { name: "Cage", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Cable ties", unit: "bag", tracking: "counted",
    }));
    await write("stock.receive", { product, location: place, quantity: 50, day: TODAY, capture: "typed" });

    /*
      ⚠️ A COUNT IS DRIVEN BY WHAT THE CAMERA READ, NEVER BY A PRODUCT ID — which
      is why the label has to exist before the shelf can be counted. A product
      with no barcode gets one of ours, minted by printing, and that is the whole
      reason `product.label` is a WRITE rather than a rendering.
    */
    const code = codeOf(await write("product.label", { ids: [product] }), product);

    const session = idOf(await write("count.open", { location: place, day: TODAY }));


    /* ⚠️ Forty found where fifty was expected: ten gone, and nobody said so. */
    const told = await write("count.tally", {
      count: session, raw: code, year: 2026, quantity: 40,
    });
    expect(told.status, JSON.stringify(told.body)).toBe(200);

    const closed = await write("count.close", { count: session, day: TODAY });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);

    const lines = await read("stock.list");
    const mine = (lines.body.items as { product: string; quantity: number }[])
      .filter((l) => l.product === product);
    expect(mine[0]?.quantity).toBe(40);

    const history = await read("ledger.list");
    const fix = (history.body.items as { product: string; move: string; against: string }[])
      .filter((r) => r.product === product && r.move === "adjusted");
    expect(fix).toHaveLength(1);
    /* ⚠️ THE SESSION'S OWN ID, which is what the report's `BY_COUNT` prefix
       recognises. The two have to agree, and this is where they meet. */
    expect(fix[0]?.against).toBe(session);
    expect(fix[0]?.against.startsWith("cnt_")).toBe(true);
  });
});

/* -------------------------------------------------------------- the report --- */

describe("the figures", () => {
  /*
    ⚠️ THE RECORDED SHARE IS THE NUMBER THAT MAKES THE PRODUCT LOOK BAD, and it
    only means anything if the two halves are computed from the same history. A
    report answering zeroes over a workspace with movements in it is a screen
    nobody would question.
  */
  it("tells what was scanned out from what a count found gone", async () => {
    const place = idOf(await write("location.create", { name: "Stores", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "Gloves, L", unit: "box", tracking: "counted",
    }));
    await write("stock.receive", { product, location: place, quantity: 100, day: TODAY, capture: "typed" });
    await write("stock.take", { product, location: place, quantity: 30, day: TODAY, capture: "typed" });

    const code = codeOf(await write("product.label", { ids: [product] }), product);
    const session = idOf(await write("count.open", { location: place, day: TODAY }));
    await write("count.tally", { count: session, raw: code, year: 2026, quantity: 60 });
    await write("count.close", { count: session, day: TODAY });

    const said = await read("stock.report", { today: TODAY, span: "month" });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    /* ⚠️ A LIST OF ONE, because a view is a list wherever it came from and the
       declared Reports screen reads its three figures off the first row. */
    const told = (said.body.told as readonly {
      recorded: number; inferred: number; share: number; sharePct: number; says: string;
    }[])[0]!;
    expect(told.recorded).toBe(30);
    /* ⚠️ Ten the count found gone that nobody recorded taking. */
    expect(told.inferred).toBe(10);
    expect(told.share).toBeCloseTo(0.75);
    expect(told.sharePct).toBe(75);
    expect(told.says).toContain("went unscanned");
  });
});

/* -------------------------------------------------------------- the import --- */

describe("bringing a spreadsheet in", () => {
  const SHEET = [
    "product name,brand,ean,qty,shelf,supplier",
    "\"Gloves, nitrile, M\",Ansell,5012345678900,40,Import bay,Medline",
    "Isopropanol 99%,,5012345678917,6,Import bay,Kaufmann",
    "Masking tape,,,12,,",
    "Cutting fluid 5L,,,4,Import bay,",
  ].join("\n");

  /*
    ⚠️ THE PREVIEW IS A POST, AND THAT IS NOT A DETAIL. A read answers on a GET,
    and a GET carries its input in the URL — eight hundred rows of somebody's
    catalogue in a query string is a request refused between the browser and the
    worker at a limit nobody controls. This assertion is what would have caught
    it: the screen calls `post`, and until the operation was declared a write the
    two disagreed and nothing anywhere said so.
  */
  it("says what the sheet would do before it does any of it", async () => {
    await write("location.create", { name: "Import bay", kind: "room" });

    const seen = await write("product.preview", { text: SHEET });
    expect(seen.status, JSON.stringify(seen.body)).toBe(200);

    const columns = seen.body.columns as Record<string, number>;
    expect(columns.name).toBe(0);
    expect(columns.code).toBe(2);
    expect(columns.quantity).toBe(3);
    expect(columns.location).toBe(4);
    expect(columns.supplier).toBe(5);

    const tally = seen.body.tally as Record<string, number>;
    /* ⚠️ Three new, and the tape refused — it has a quantity and no place, which
       imported anyway would be a product created without its stock. */
    expect(tally).toEqual({ new: 3, update: 0, refused: 1 });

    /* ⚠️ AND NOTHING HAPPENED. A preview that created a product would be the one
       failure this whole shape exists to prevent. */
    const kinds = await read("product.list");
    expect((kinds.body.items as unknown[]).length).toBe(0);
  });

  /*
    ⚠️ AND THE COMMIT DOES EXACTLY WHAT THE PREVIEW SAID. `one-planner.test.mjs`
    makes the two share a function structurally; this is the same claim asserted
    from outside, which is the half a structural check cannot make.
  */
  it("does what it said, and names what it would not do", async () => {
    await write("location.create", { name: "Import bay", kind: "room" });
    const seen = await write("product.preview", { text: SHEET });
    const tally = seen.body.tally as Record<string, number>;

    const done = await write("product.import", { text: SHEET, day: TODAY });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.made).toBe(tally.new);
    expect(done.body.changed).toBe(tally.update);
    /* ⚠️ Three rows carried a place, so three landed on a shelf. */
    expect(done.body.received).toBe(3);
    /* ⚠️ Two suppliers named in the sheet, learned rather than dropped. */
    expect(done.body.learned).toBe(2);

    const refused = done.body.refused as string[];
    expect(refused).toHaveLength(tally.refused ?? 0);
    /* ⚠️ WITH ITS LINE NUMBER, which is the fact that makes it fixable in the
       file somebody still has open. */
    expect(refused[0]).toContain("Line 4");

    const kinds = await read("product.list");
    expect((kinds.body.items as unknown[]).length).toBe(3);

    const suppliers = await read("supplier.list");
    expect((suppliers.body.items as { name: string }[]).map((s) => s.name).sort())
      .toEqual(["Kaufmann", "Medline"]);
  });

  /*
    ⚠️ A SECOND IMPORT OF THE SAME SHEET UPDATES RATHER THAN DUPLICATING. Matched
    on the code first, because a name is what somebody typed and two exports of
    one catalogue spell it differently — matching on the name alone is how an
    import makes a second "Gloves, Nitrile M" beside the first, for ever.
  */
  it("recognises what it already imported", async () => {
    await write("location.create", { name: "Import bay", kind: "room" });
    await write("product.import", { text: SHEET, day: TODAY });

    const again = await write("product.preview", { text: SHEET });
    const tally = again.body.tally as Record<string, number>;
    expect(tally.new).toBe(0);
    expect(tally.update).toBe(3);

    await write("product.import", { text: SHEET, day: TODAY });
    const kinds = await read("product.list");
    expect((kinds.body.items as unknown[]).length).toBe(3);
  });

  /* ⚠️ AND A CORRECTED MAPPING IS OBEYED. The whole reason the guess is shown is
     that it can be wrong; a screen that could show it and not change it would be
     a report rather than a control. */
  it("obeys a corrected column mapping", async () => {
    const seen = await write("product.preview", {
      text: SHEET,
      /* ⚠️ `-1` is "leave it out" — the correction somebody makes most. */
      columns: { quantity: -1, location: -1 },
    });
    const tally = seen.body.tally as Record<string, number>;
    /* ⚠️ Nothing is refused now: the tape's only problem was a quantity with
       nowhere to put it, and the sheet no longer claims either. */
    expect(tally).toEqual({ new: 4, update: 0, refused: 0 });
  });
});

/* ------------------------------------------------------------------ scope --- */

describe("what another workspace can see", () => {
  /*
    ⚠️ THE INVARIANT UNDER ALL OF IT. Every read above is scoped by the tenant
    the door resolved, and a product that leaked across that line would leak a
    competitor's whole catalogue. It is asserted from the OUTSIDE — a second
    workspace on the same shard, asking the same question — because that is the
    only way to ask it that a wrong `WHERE` cannot pass.
  */
  it("sees none of somebody else's stock", async () => {
    const made = await createTenant(directory(), {
      slug: "elsewhere", name: "Elsewhere", country: "DE", where: "eu", apps: ["inventory"],
    });
    if (typeof made === "string") throw new Error(made);
    const shard = env.SHARD_EU_1 as unknown as Db;
    const who = await upsertAccount(directory(), "other@example.com", null);
    await found(shard, made.tenant.id, who as never, "other@example.com", { inventory: "keeper" });
    await noteBelonging(directory(), who as never, made.tenant.id);
    const theirs = `one_session=${(await startSession(directory(), who as never)).id}`;

    /* Ours: one product on one shelf. */
    const place = idOf(await write("location.create", { name: "Private", kind: "room" }));
    const product = idOf(await write("product.create", {
      name: "A secret consumable", unit: "item", tracking: "counted",
    }));
    await write("stock.receive", { product, location: place, quantity: 7, day: TODAY, capture: "typed" });

    for (const doc of Object.values(LEGAL.documents)) {
      await worker.fetch(new Request("http://elsewhere.localhost:8080/api/me.accept", {
        method: "POST", headers: { cookie: theirs, "content-type": "application/json" },
        body: JSON.stringify({ document: doc.id, version: doc.version }),
      }), asDev as never, ctx);
    }

    const res = await worker.fetch(
      new Request("http://elsewhere.localhost:8080/api/stock.list", {
        headers: { cookie: theirs },
      }), asDev as never, ctx);
    expect(res.status).toBe(200);
    expect((await res.json() as { items: unknown[] }).items).toEqual([]);
  });
});

/*
  ⚠️ WHAT THE PLAN OPENS, AND THIS WORKSPACE IS ON `solo` — work orders, no
  release rail. The nav is the only place a customer learns which half of this
  product they bought, and it learns it from `centre.view`: a screen the page
  never receives has no row, no route and no way in by typing.

  ⚠️ ASSERTED AGAINST THE TIER RATHER THAN AGAINST A LIST OF SCREENS. The
  question is "does the door reflect the plan", so the fixture is the plan; the
  companion suite runs the same product on `studio` and gets the run rail.
*/
describe("what the plan opens", () => {
  const screensOf = async (): Promise<readonly { id: string; features?: string[] }[]> => {
    const res = await at("/api/centre.view", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      apps: { id: string; screens: { id: string; features?: string[] }[] }[];
    };
    const mine = body.apps.find((a) => a.id === "inventory");
    expect(mine, JSON.stringify(body.apps.map((a) => a.id))).toBeDefined();
    return mine!.screens;
  };

  /*
    ⚠️ DERIVED FROM WHAT THE MANIFEST GATES, NOT FROM SCREEN IDS TYPED HERE. This
    named `run`, `case` and `work` — three screens that left with the twenty-one
    the surface rewrite emptied — so the suite went on asserting a claim about a
    product that had changed underneath it, and the failure said "expected to
    include 'run'" about a screen nobody had removed by mistake.

    ⚠️ AND IT IS CORRECT IN BOTH WORLDS, which is the point of deriving it. Today
    OneInventory gates no screen on a flag, so the assertion is that this tier
    sees every screen its grants allow; the day a gated screen returns, the same
    walk asserts it is withheld here — with no edit, and no silence in between.
  */
  const GATED = (inventory().screens ?? []).flatMap((one) => (one.flag ? [one.id] : []));

  it("withholds exactly what this tier did not buy, and nothing else", async () => {
    const ids = (await screensOf()).map((s) => s.id);
    for (const id of GATED) expect(ids).not.toContain(id);
    /* ⚠️ AND KEEPS EVERY UNGATED ONE. Half of this claim is that the filter is
       not over-reaching: a screen withheld because a NEIGHBOUR was gated is the
       failure `/work` was designed against — it is about runs AND jobs, so
       gating it on runs alone would take the work orders with it. */
    const open = (inventory().screens ?? [])
      .filter((one) => !one.flag && one.nav !== "none")
      .map((one) => one.id);
    for (const id of open) expect(ids).toContain(id);
  });

  /*
    ⚠️ AND THE CONTROLS ARE ANSWERED FOR TOO, WHICH IS THE OTHER HALF. A screen
    that survives the plan filter can still hold a control the gate would refuse
    — this workspace has work orders and no run rail — and a product that draws
    it anyway puts the refusal in a toast over whatever was just filled in. The
    verdict comes from the same walk the request's own gate ran.
  */
  it("says which gate would stop a control, before it is drawn", async () => {
    const res = await at("/api/centre.view", { headers: { cookie } });
    const body = await res.json() as {
      apps: { id: string; may: Record<string, string> }[];
    };
    const may = body.apps.find((a) => a.id === "inventory")?.may ?? {};
    /* ⚠️ `processes` IS FALSE ON THIS TIER, so the run rail's own operations are
       the entitlement gate — named, rather than reported as a bare `false`,
       because "your plan does not include this" and "you cannot yet" are
       different controls. */
    expect(may["process.open"]).toBe("entitlement");
    /* ⚠️ AND WHAT IS ALLOWED IS ABSENT RATHER THAN `null`. Fifty operations is
       fifty keys on every boot, almost all of them nothing. */
    expect(may["stock.receive"]).toBeUndefined();
    expect(may["product.create"]).toBeUndefined();
  });

  /* ⚠️ AND EVERY SCREEN WITHOUT A GATE STILL TRAVELS. A filter that quietly
     dropped an ungated screen would pass both assertions above. */
  it("leaves every ungated screen alone", async () => {
    const ids = new Set((await screensOf()).map((s) => s.id));
    for (const s of APPS.inventory!().screens) {
      if (!s.features) expect(ids.has(s.id), s.id).toBe(true);
    }
  });
});

/*
  ⚠️ THE CHECKLIST IS TICKED BY WHAT HAPPENED, AND THIS SUITE HAS ALREADY DONE
  ALL THREE. A step ticked by a screen is a step that stays undone when somebody
  does the same thing from the API or from an import — which is the state this
  product shipped in: three unticked steps for ever, including for a workspace
  that had finished.

  ⚠️ ASSERTED AFTER THE GOLDEN PATH RATHER THAN BY RAISING EVENTS BY HAND. What
  is being checked is that the ORDINARY operations count, so anything that
  reached the tally another way would prove nothing.
*/
describe("how far this workspace has got", () => {
  /*
    ⚠️ THE THREE ARE DONE INSIDE THE TEST, not left to the specs above. Every
    test in this pool gets its own storage stacked on `beforeAll`, so a tally
    filled by a sibling is not there — and a suite written the other way passes
    or fails on which file ran first.
  */
  const theThree = async () => {
    const place = idOf(await write("location.create", { name: "A guide shelf", kind: "shelf" }));
    const product = idOf(await write("product.create", {
      name: "A guide consumable", unit: "item", tracking: "counted",
    }));
    await write("stock.receive", {
      product, location: place, quantity: 4, day: TODAY, capture: "typed",
    });
  };

  it("ticks a step from the operation that did it", async () => {
    await theThree();

    const said = await read("guide.view");
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    const counts = said.body.counts as Record<string, number>;
    expect(counts["location.created"]).toBeGreaterThan(0);
    expect(counts["product.created"]).toBeGreaterThan(0);
    expect(counts["stock.received"]).toBeGreaterThan(0);
    /*
      ⚠️ AND `steps` IS WHAT IS LEFT, DERIVED FROM THE GUIDE RATHER THAN COUNTED
      HERE. This asserted `[]` and a `done` of three, which was true of a guide
      with three steps in it — a fourth was added and the assertion went on
      describing the old book. What the test is FOR is that an ordinary operation
      ticks a step; naming the number of steps as well makes editing the guide
      break a test about something else.
    */
    const raised = ["location.created", "product.created", "stock.received"];
    const guide = inventory().guide ?? {};
    const owed = Object.values(guide)
      .filter((step) => !raised.includes(step.done))
      .map((step) => step.id)
      .sort();
    expect((said.body.steps as { id: string }[]).map((s) => s.id).sort()).toEqual(owed);
    expect(said.body.done).toHaveLength(raised.length);
  });

  /* ⚠️ A MILESTONE IS SAID ONCE, and the record of having said it is what stops
     it — not the screen remembering. */
  it("congratulates once and then stops", async () => {
    await theThree();
    const first = await read("guide.view");
    const fresh = first.body.fresh as { id: string }[];
    expect(fresh.map((m) => m.id)).toContain("first-stock");

    expect((await write("guide.seen", { milestone: "first-stock" })).status).toBe(200);

    const again = await read("guide.view");
    expect((again.body.fresh as { id: string }[]).map((m) => m.id)).not.toContain("first-stock");
    expect(again.body.said).toContain("first-stock");
  });

  /* ⚠️ AND ONLY A MILESTONE THIS APP DECLARES. Writing whatever arrives would
     make the table a list of strings a caller chose. */
  it("refuses a congratulation nothing declares", async () => {
    const said = await write("guide.seen", { milestone: "invented" });
    expect(said.status).toBe(404);
  });
});

/* ------------------------------------------------------- carrying and rungs --- */

/**
 * THE BOX, THE SHEET AND THE TABLET — and carrying some of it to another shelf.
 *
 * ⚠️ THIS IS THE ONE STORY THE MODEL COULD NOT TELL. A carton of amoxicillin
 * holds twenty boxes, a box three blister sheets, a sheet ten tablets — and the
 * SHEET carries no barcode, so it could never be a `code` and there was nowhere
 * to put it at all. Anybody issuing by the sheet typed 10 every time and hoped.
 *
 * ⚠️ AND MOVING SOME OF IT WAS A TAKE PLUS A RECEIVE, which puts the whole
 * carton into the usage report — so "we used 600 tablets" was a sentence about a
 * trolley. `moved` is a verb of its own for that reason, and it is two rows
 * sharing one cause rather than one row naming both ends, because `stockMove` is
 * the only function allowed to change a balance.
 *
 * ⚠️ STOCK STAYS IN BASE UNITS THROUGHOUT, which is what makes the whole thing
 * small: a shelf holds 600 tablets however they arrived, so there is nothing to
 * break open, no partial-carton state and no second balance to disagree with the
 * first. A rung is a named multiplier applied exactly once, at the door.
 */
describe("a ladder of packaging, and carrying stock between shelves", () => {
  const LEVELS = [
    { name: "sheet", per: 10 },
    { name: "box", per: 3 },
    { name: "carton", per: 20 },
  ];

  /** A workspace with the ladder on it, a back store and a ward shelf. */
  const dispensary = async (name: string) => {
    const back = idOf(await write("location.create", { name: `${name} store`, kind: "room" }));
    const ward = idOf(await write("location.create", { name: `${name} ward`, kind: "shelf" }));
    const made = await write("product.register", {
      name, unit: "tablet", tracking: "counted", levels: LEVELS,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    return { back, ward, product: String(made.body.product) };
  };

  const onShelf = async (product: string, location: string): Promise<number> => {
    const lines = await read("stock.list");
    const rows = (lines.body.items as { product: string; location: string; quantity: number }[]);
    return rows.filter((l) => l.product === product && l.location === location)
      .reduce((sum, l) => sum + l.quantity, 0);
  };

  /*
    ⚠️ ONE CARTON IS SIX HUNDRED TABLETS, AND THE MULTIPLICATION HAPPENS ONCE.
    Sending a rung NAME rather than a multiplier is the whole safety of it: a
    client that sent 600 would be deciding how much stock exists.
  */
  it("receives one carton as six hundred tablets", async () => {
    const { back, product } = await dispensary("Amoxicillin 500mg");
    const got = await write("stock.receive", {
      product, location: back, quantity: 600, day: TODAY, capture: "typed" });
    expect(got.status, JSON.stringify(got.body)).toBe(200);
    expect(await onShelf(product, back)).toBe(600);
  });

  /*
    ⚠️ AND THE SHEET IS THE RUNG THAT PROVES THE POINT. It has no barcode, so a
    model built on codes alone could not express it — and issuing by the sheet is
    exactly what a dispensary does all day.
  */
  it("moves two boxes to the ward, and it is sixty tablets", async () => {
    const { back, ward, product } = await dispensary("Amoxicillin 250mg");
    await write("stock.receive", {
      product, location: back, quantity: 600, day: TODAY, capture: "typed" });

    const moved = await write("stock.move", {
      product, from: back, to: ward, quantity: 2, rung: "box",
      day: TODAY, capture: "typed",
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.arrived).toBe(60);

    expect(await onShelf(product, back)).toBe(540);
    expect(await onShelf(product, ward)).toBe(60);
  });

  it("moves a single sheet, which is ten", async () => {
    const { back, ward, product } = await dispensary("Amoxicillin 125mg");
    await write("stock.receive", {
      product, location: back, quantity: 600, day: TODAY, capture: "typed" });
    const moved = await write("stock.move", {
      product, from: back, to: ward, quantity: 1, rung: "sheet",
      day: TODAY, capture: "typed" });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(await onShelf(product, ward)).toBe(10);
  });

  /*
    ⚠️ A RUNG THE PRODUCT DOES NOT DECLARE IS REFUSED, NEVER READ AS ONE. Falling
    back to a single would move one tablet where a pallet was meant — a wrong
    number nothing downstream can detect, because one is what a real entry looks
    like. The usual cause is a stale screen, so the refusal names the rung.
  */
  it("refuses a rung this product does not have", async () => {
    const { back, ward, product } = await dispensary("Amoxicillin 100mg");
    await write("stock.receive", {
      product, location: back, quantity: 600, day: TODAY, capture: "typed" });

    const said = await write("stock.move", {
      product, from: back, to: ward, quantity: 1, rung: "pallet",
      day: TODAY, capture: "typed" });
    expect(said.status).toBe(422);
    expect(JSON.stringify(said.body)).toContain("pallet");

    /* ⚠️ AND THE REFUSAL MOVED NOTHING. A 422 over a write that had already
       landed is worse than no refusal at all. */
    expect(await onShelf(product, back)).toBe(600);
    expect(await onShelf(product, ward)).toBe(0);
  });

  /*
    ⚠️ A MOVE IS NOT A CONSUMPTION, AND THE HISTORY HAS TO SAY SO. Recorded as a
    take plus a receive the whole carton enters every usage report, so the one
    measure that says how fast stock actually goes would be made partly of stock
    that went nowhere.
  */
  it("records a transfer as two halves of one movement, and neither is a take", async () => {
    const { back, ward, product } = await dispensary("Amoxicillin 50mg");
    await write("stock.receive", {
      product, location: back, quantity: 600, day: TODAY, capture: "typed" });
    await write("stock.move", {
      product, from: back, to: ward, quantity: 1, rung: "box",
      day: TODAY, capture: "typed" });

    const history = await read("ledger.list");
    const rows = (history.body.items as
      { product: string; move: string; delta: number; against: string | null }[])
      .filter((l) => l.product === product);

    const carried = rows.filter((l) => l.move === "moved");
    expect(carried).toHaveLength(2);
    /* ⚠️ ONE CAUSE ON BOTH, which is what makes "these two rows are one
       movement" a question with an answer. */
    expect(new Set(carried.map((l) => l.against)).size).toBe(1);
    /* ⚠️ AND THEY CANCEL, because nothing was consumed. */
    expect(carried.reduce((sum, l) => sum + l.delta, 0)).toBe(0);
    expect(rows.some((l) => l.move === "taken")).toBe(false);
  });

  /*
    ⚠️ MORE THAN IS THERE IS REFUSED BEFORE ANYTHING IS WRITTEN. This is the
    ordinary way a transfer fails, and the source is debited first precisely so
    that the common refusal touches no rows at all.
  */
  it("refuses to carry more than the shelf holds, and moves nothing", async () => {
    const { back, ward, product } = await dispensary("Amoxicillin 25mg");
    await write("stock.receive", {
      product, location: back, quantity: 30, day: TODAY, capture: "typed" });

    const said = await write("stock.move", {
      product, from: back, to: ward, quantity: 1, rung: "carton",
      day: TODAY, capture: "typed" });
    expect(said.status).toBe(409);

    expect(await onShelf(product, back)).toBe(30);
    expect(await onShelf(product, ward)).toBe(0);
  });

  /* ⚠️ AND A MOVE TO WHERE IT ALREADY IS WOULD WRITE TWO ROWS THAT CANCEL. The
     balance would be right, which is exactly why it has to be refused: a history
     with a pair of nothings in it is one somebody scrolls past. */
  it("refuses a move to the shelf it is already on", async () => {
    const { back, product } = await dispensary("Amoxicillin 10mg");
    await write("stock.receive", {
      product, location: back, quantity: 30, day: TODAY, capture: "typed" });
    const said = await write("stock.move", {
      product, from: back, to: back, quantity: 1, rung: "box",
      day: TODAY, capture: "typed" });
    expect(said.status).toBe(400);
    expect(JSON.stringify(said.body)).toContain("shelf it is on");
  });

  /*
    ⚠️ AN UNDO REVERSES THE WHOLE MOVEMENT, AND A TRANSFER IS TWO ROWS. Undoing
    one half puts the stock back on the shelf it left AND leaves it on the shelf
    it reached — the same boxes counted twice, from one press of a button whose
    entire promise is that nothing happened.
  */
  it("takes back both halves of a transfer, not one", async () => {
    const { back, ward, product } = await dispensary("Amoxicillin 5mg");
    await write("stock.receive", {
      product, location: back, quantity: 600, day: TODAY, capture: "typed" });
    const moved = await write("stock.move", {
      product, from: back, to: ward, quantity: 1, rung: "carton",
      day: TODAY, capture: "typed" });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);

    const back_again = await write("stock.undo", {
      movement: String(moved.body.movement), day: TODAY });
    expect(back_again.status, JSON.stringify(back_again.body)).toBe(200);

    expect(await onShelf(product, back)).toBe(600);
    expect(await onShelf(product, ward)).toBe(0);
  });

  /* ⚠️ A PRODUCT WITH NO LADDER IS UNCHANGED — the quantity is base units, which
     is what every screen written before this sends. */
  it("carries a plain quantity where there is no ladder", async () => {
    const here = idOf(await write("location.create", { name: "Rack 9", kind: "rack" }));
    const there = idOf(await write("location.create", { name: "Rack 10", kind: "rack" }));
    const product = idOf(await write("product.create", {
      name: "Cable ties", unit: "item", tracking: "counted" }));
    await write("stock.receive", {
      product, location: here, quantity: 100, day: TODAY, capture: "typed" });

    const moved = await write("stock.move", {
      product, from: here, to: there, quantity: 40, day: TODAY, capture: "typed" });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(await onShelf(product, here)).toBe(60);
    expect(await onShelf(product, there)).toBe(40);
  });

  /* ⚠️ AND THE LADDER IS REFUSED AT THE DOOR RATHER THAN CLEANED UP ON READ. A
     rung silently discarded on save is a picker missing an entry, found by
     whoever receives the next delivery. */
  it("refuses a ladder naming a rung after the base unit", async () => {
    const said = await write("product.register", {
      name: "Confused tablets", unit: "tablet", tracking: "counted",
      levels: [{ name: "Tablet", per: 10 }],
    });
    expect(said.status).toBe(400);
    expect(JSON.stringify(said.body)).toContain("already");
  });
});

/* ------------------------------------------------- what a product is counted in --- */

/**
 * THE UNIT IS SET ONCE, AND THE GENERATED UPDATE CANNOT MOVE IT.
 *
 * ⚠️ A PRODUCT'S UNIT IS WHAT EVERY OTHER NUMBER IS IN. Edited from "box" to
 * "sheet" it rewrites the meaning of every balance, every movement and every
 * report without one write going anywhere near a quantity — twenty boxes on a
 * shelf become twenty sheets, and nothing afterwards can say which rows meant
 * which. The generated update is a column setter and has no way to know that.
 *
 * ⚠️ SO BOTH FIELDS ARE `settled` AND `product.recount` IS THE WAY. Each carries
 * a different question: the unit asks whether anything has been counted yet, and
 * the rung asks whether the change goes DEEPER — `promotes`, which was written,
 * tested, and called by nothing at all until now.
 *
 * ⚠️ AND IT IS ASSERTED THROUGH THE DOOR RATHER THAN OVER THE FUNCTION, because
 * the hole was that a generated verb existed and nobody had tried it.
 */
describe("changing what a product is counted in", () => {
  const fresh = async (name: string, of: Record<string, unknown> = {}) =>
    idOf(await write("product.create", {
      name, unit: "box", tracking: "counted", ...of,
    }));

  const unitOf = async (product: string) => {
    const said = await read("product.list");
    const rows = said.body.items as { id: string; unit: string; tracking: string }[];
    return rows.find((r) => r.id === product);
  };

  /*
    ⚠️ THE BACK DOOR, AND IT IS THE WHOLE POINT OF THE `settled` FLAG. No screen
    calls `product.update` — but it is a generated verb on the API, reachable by
    an agent and by a queued write replaying after a day offline, and it changed
    this field without a word.
  */
  it("refuses a unit change through the generated update", async () => {
    const product = await fresh("Nitrile gloves, L");
    const said = await write("product.update", { id: product, unit: "sheet" });
    expect(said.status, JSON.stringify(said.body)).toBe(400);
    expect(JSON.stringify(said.body)).toContain("unit");
    expect((await unitOf(product))?.unit).toBe("box");
  });

  it("refuses a tracking change through the generated update", async () => {
    const product = await fresh("Surgical tape");
    const said = await write("product.update", { id: product, tracking: "batched" });
    expect(said.status).toBe(400);
    expect((await unitOf(product))?.tracking).toBe("counted");
  });

  /* ⚠️ AND EVERYTHING ELSE STILL EDITS. A guard that froze the whole record would
     be a worse bug than the one it closes. */
  it("leaves every other field editable", async () => {
    const product = await fresh("Cotton swabs");
    const said = await write("product.update", { id: product, brand: "Hartmann", par: 40 });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
  });

  /*
    ⚠️ BEFORE ANYTHING IS COUNTED THE CHANGE IS FREE, which is when somebody who
    mistyped it actually notices. A refusal here would make a typo permanent.
  */
  it("allows the unit while nothing has been counted", async () => {
    const product = await fresh("Alcohol wipes");
    const said = await write("product.recount", { product, unit: "sheet" });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    expect((await unitOf(product))?.unit).toBe("sheet");
  });

  it("refuses the unit once there is stock", async () => {
    const place = idOf(await write("location.create", { name: "Cupboard 7", kind: "room" }));
    const product = await fresh("Gauze pads");
    await write("stock.receive", {
      product, location: place, quantity: 20, day: TODAY, capture: "typed" });

    const said = await write("product.recount", { product, unit: "sheet" });
    expect(said.status).toBe(409);
    expect(JSON.stringify(said.body)).toContain("box");
    expect((await unitOf(product))?.unit).toBe("box");
  });

  /*
    ⚠️ AND AN EMPTY SHELF IS NOT AN UNCOUNTED PRODUCT. Asked as "is there any
    stock", every product that happens to be out today would pass — while its
    ledger is full of numbers in the old unit, and a report over that mixes the
    two without any row being wrong.
  */
  it("refuses the unit on an empty shelf that has history", async () => {
    const place = idOf(await write("location.create", { name: "Cupboard 8", kind: "room" }));
    const product = await fresh("Saline 10ml");
    await write("stock.receive", {
      product, location: place, quantity: 5, day: TODAY, capture: "typed" });
    await write("stock.take", {
      product, location: place, quantity: 5, day: TODAY, capture: "typed" });

    const said = await write("product.recount", { product, unit: "ampoule" });
    expect(said.status).toBe(409);
    expect((await unitOf(product))?.unit).toBe("box");
  });

  /*
    ⚠️ GOING DEEPER IS SAFE — forty gloves become forty gloves in an unrecorded
    batch, which is honest and is what happened. This is the half a guard that
    refused every change would have taken away.
  */
  it("promotes a product to a deeper rung, with stock on the shelf", async () => {
    const place = idOf(await write("location.create", { name: "Cupboard 9", kind: "room" }));
    const product = await fresh("Lidocaine 1%");
    await write("stock.receive", {
      product, location: place, quantity: 12, day: TODAY, capture: "typed" });

    const said = await write("product.recount", { product, tracking: "batched" });
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    expect((await unitOf(product))?.tracking).toBe("batched");
  });

  /* ⚠️ AND GOING SHALLOWER IS REFUSED, which is `promotes` — written, tested, and
     reached by nothing at all before this. */
  it("refuses a shallower rung", async () => {
    const product = await fresh("Vaccine A", { tracking: "batched" });
    const said = await write("product.recount", { product, tracking: "counted" });
    expect(said.status).toBe(409);
    expect((await unitOf(product))?.tracking).toBe("batched");
  });

  it("refuses a recount that asks for nothing", async () => {
    const product = await fresh("Bandages");
    expect((await write("product.recount", { product })).status).toBe(400);
  });
});

/*
  ⚠️ WHAT A PERSON IS WALKED THROUGH, TOLD TO AN AGENT TOO. `product.register`
  takes twenty fields; the SCREEN asks ten plain questions in an order, some of
  them skipped by earlier answers, and that order is the product's own
  understanding of the thing being made. An agent given only the field names is
  guessing at exactly the reasoning the flow already encodes.

  ⚠️ AND IT IS THE MANIFEST'S OWN DECLARATION — the one thing `Create` draws — so
  this cannot become a second description that drifts from the one people
  actually see.
*/
describe("a flow reaches the agent door", () => {
  const tools = async (): Promise<readonly { name: string; description: string }[]> => {
    const res = await at("/mcp", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const body = await res.json() as {
      result: { tools: readonly { name: string; description: string }[] };
    };
    return body.result.tools;
  };

  it("tells an agent the questions behind a declared flow", async () => {
    const found = (await tools()).find((tool) => tool.name === "product.register");
    expect(found, "product.register is not on the agent door").toBeTruthy();
    const said = found?.description ?? "";
    expect(said).toContain("What is it?");
    expect(said).toContain("How closely do you follow it?");
    /* ⚠️ INCLUDING WHAT REMOVES A QUESTION. A step disappears on one earlier
       answer, and an agent that does not know which will ask for a field nobody
       would ever be asked for. */
    expect(said).toContain("only when tracking is not listed");
    /* ⚠️ AND THE CONDITION IS IN WORDS — see `saidWhen`. A `Match` is an object;
       interpolated raw it is `[object Object]`, which is not a degraded sentence
       but a wrong one, because the agent then reads a conditional question as an
       unconditional one. It typechecks, because everything interpolates. */
    expect(said).not.toContain("[object Object]");
  });

  /* ⚠️ AND AN OPERATION WITH NO FLOW IS UNCHANGED — the summary alone. A
     description that grew a trailing "A person reaching this is asked:" with
     nothing after it would be the seam leaking into every other tool. */
  it("leaves an operation nobody walks to alone", async () => {
    const found = (await tools()).find((tool) => tool.name === "product.recount");
    expect(found?.description).not.toContain("A person reaching this is asked");
  });
});

/**
 * ⚠️ THE SCREEN DOOR ANSWERS A FLOW, AND NOTHING DROVE IT UNTIL THIS FILE.
 *
 * A story screen has no body, so every derivation the door runs — the views, the
 * acts, the choices — reads from a field that is not there. The browser draws the
 * flow's controls out of the write's own `input`, so an `acts` map missing that
 * one entry is not a degraded screen: it is an empty one, silently, with the
 * shell still around it.
 */
describe("the door answers every screen it draws", () => {
  const drawn = async (id: string): Promise<Said> => {
    const res = await at(`/api/screen/${id}`, { headers: { cookie } });
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  };

  /*
    ⚠️ EVERY ONE OF THEM, DERIVED — not the flow alone. `isDrawn` is what the
    door asks, so this asks the same question of the same list: a screen the
    kernel calls drawn and the door will not answer is a route in the nav whose
    only outcome is a blank page. Written as one named screen it would have
    covered the flow and nothing else, which is how the flow came to be the one
    that broke.
  */
  it("answers all of them, and none is a 404", async () => {
    const drawable = (inventory().screens ?? []).filter(isDrawn);
    expect(drawable.length, "no screen is drawn — this asserts nothing").toBeGreaterThan(3);
    for (const one of drawable) {
      const said = await drawn(one.id);
      expect(said.status, `${one.id}: ${JSON.stringify(said.body)}`).toBe(200);
    }
  });

  /* ⚠️ AND A SCREEN THAT IS THE APP'S OWN CODE IS NOT THIS DOOR'S, which is the
     other half of the same rule — a door answering everything would hand a
     `session` screen an empty body it has no use for. */
  it("leaves a screen that draws itself alone", async () => {
    const own = (inventory().screens ?? []).filter((one) => !isDrawn(one));
    for (const one of own) expect((await drawn(one.id)).status).toBe(404);
  });

  it("sends the write a flow walks toward, with the input its steps are drawn from", async () => {
    const said = await drawn("add-a-product");
    expect(said.status, JSON.stringify(said.body)).toBe(200);

    const acts = said.body.acts as Record<string, { input?: Record<string, unknown> }>;
    const write = acts["product.register"];
    expect(write, `acts held ${JSON.stringify(Object.keys(acts))}`).toBeDefined();

    /* ⚠️ THE INPUT, NOT MERELY THE KEY. Every step draws its controls out of the
       write's declaration — `StepSpec.takes` names the fields and the input is
       where their kind, label and options come from — so an entry that arrived
       with an empty `input` is a flow of blank steps rather than no flow at all,
       which is the harder version of this bug to see. */
    const asked = (inventory().screens ?? [])
      .find((one) => one.id === "add-a-product")!.story!.asks
      .flatMap((step) => step.takes ?? []);
    expect(asked.length, "no step takes a field — this asserts nothing").toBeGreaterThan(0);
    for (const name of asked) {
      expect(Object.keys(write!.input ?? {}), `nothing to draw ${name} from`).toContain(name);
    }
  });

  /* ⚠️ AND THE READER THAT RUNS BEFORE ANYBODY IS ASKED — see `StorySpec.fills`.
     It is an operation like any other and the browser sends the pictures to it,
     so it has to arrive with its own input. */
  it("sends the reader the flow fills from", async () => {
    const acts = (await drawn("add-a-product")).body.acts as Record<string, unknown>;
    expect(Object.keys(acts)).toContain("product.see");
  });

  /*
    ⚠️ ALL FOUR WAYS STOCK MOVES, ON THE ONE SCREEN THAT IS ABOUT A PRODUCT. For
    a day only `receive` was reachable anywhere in this product — an inventory
    where stock goes up and never comes down, in which every balance is the sum
    of what arrived and no number on any screen is true after the first morning.
    Taking is the most frequent thing anybody does with an inventory and it was
    the thing this one could not do.

    ⚠️ AND THE ASSERTION IS THE ACTS THE DOOR SENDS RATHER THAN THE MANIFEST'S
    OWN BLOCKS, because those two agreeing is the whole question. A body may
    name an operation the app does not declare; the composer refuses that, and
    what this covers is the other direction — an act declared, composed, and
    dropped on the way to the browser, where a screen draws a row that opens a
    form with nothing in it.
  */
  it("sends every way stock moves, on the product screen", async () => {
    const said = await drawn("product");
    expect(said.status, JSON.stringify(said.body)).toBe(200);
    const acts = said.body.acts as Record<string, { input?: Record<string, unknown> }>;
    for (const op of ["stock.take", "stock.receive", "stock.move", "stock.adjust"]) {
      expect(Object.keys(acts), `${op} is not on the product screen`).toContain(op);
    }
    /* ⚠️ AND EACH ARRIVES WITH ITS INPUT, or the form it opens is a sheet of
       nothing. `stock.move` is the one that asks a third question — a transfer
       has two ends — so it is the one an empty input would be least visible on. */
    expect(Object.keys(acts["stock.move"]?.input ?? {})).toContain("to");
    expect(Object.keys(acts["stock.take"]?.input ?? {})).toContain("quantity");
  });

  /*
    ⚠️ AND THE PICKERS ARRIVE WITH THE ROWS, WHICH IS WHAT MAKES THESE FORMS
    ANSWERABLE. Every one of the four asks which shelf; a `ref` with no choices
    behind it draws a text box, and a text box on that question asks somebody
    standing at a shelf to type the identifier of the shelf they are touching.
  */
  it("sends the shelves each of them asks about", async () => {
    /* ⚠️ MADE HERE RATHER THAN RELIED ON FROM AN EARLIER TEST — every test in
       this suite gets its own storage stack, so a shelf another one created is
       genuinely not there. A fixture that assumed otherwise would assert against
       an empty world and pass or fail for the wrong reason. */
    await write("location.create", { name: "Cold room", kind: "room" });

    const acts = (await drawn("product")).body.acts as Record<string, {
      choices?: Record<string, readonly { id: string; label: string }[]>;
    }>;
    const where = acts["stock.take"]?.choices?.["location"];
    expect(where?.length, "no shelves to pick from").toBeGreaterThan(0);
    expect(where!.some((one) => one.label === "Cold room"),
      "a shelf is offered by its identifier rather than its name").toBe(true);
  });
});
