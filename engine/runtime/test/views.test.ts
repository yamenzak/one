/**
 * A DECLARED VIEW, RUN AGAINST A REAL DATABASE.
 *
 * ⚠️ THIS IS THE PIECE THAT WAS MISSING BETWEEN A CONTRACT AND A RENDERER.
 * `AppSpec.views` has been declarable since stage 89 and the renderer takes a
 * view's rows as input; nothing in between produced any. A screen could be
 * declared perfectly and drawn against nothing, which is not a bug that fails —
 * it is a feature that cannot be reached, and the capability ledger has been
 * saying so by name.
 *
 * ⚠️ AND THE THREE MATCHES BEYOND EQUALITY ARE THE ONES WORTH THE FILE. `is`
 * came free with `list`'s existing filter. `isnt`, `set` and `unset` did not,
 * and "the ones nobody has filed yet" is a view every product wants and equality
 * cannot express.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { collection, field, type AppSpec, type CollectionSpec } from "@engine/kernel";
import { applySchema, type Db } from "../src/index.js";
import { put } from "../src/records.js";
import { schemaFor } from "../src/schema.js";
import { runView, runViews } from "../src/views.js";

const shard = () => env.SHARD_EU_1 as unknown as Db;
const TENANT = "ten_views";
const NOW = new Date("2026-08-25T09:00:00.000Z");

const shelf: CollectionSpec = collection({
  id: "shelf",
  label: { one: "Shelf", many: "Shelves" },
  scope: { of: "tenant" },
  permission: "shelf",
  retention: null,
  onClose: { then: "purge" },
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 80 }),
    inside: field.text({ label: "Inside", holds: "none", max: 40 }),
    standing: field.enum({
      label: "Standing", holds: "none", values: ["ok", "held"],
      labels: { ok: "OK", held: "Held" },
    }),
  },
});

const APP = { id: "warehouse", collections: [shelf] } as unknown as AppSpec;
const withViews = (views: AppSpec["views"]) => ({ ...APP, views }) as AppSpec;

const add = async (id: string, row: Record<string, unknown>) => {
  const done = await put(shard(), shelf, TENANT, { id, ...row }, null, NOW);
  if ("why" in done) throw new Error(done.why);
};

beforeEach(async () => {
  await applySchema(shard(), [schemaFor(APP)]);
  await shard().prepare("DELETE FROM shelf").run();
  await add("a", { name: "Cold room", inside: "", standing: "ok" });
  await add("b", { name: "Bay four", inside: "a", standing: "held" });
  await add("c", { name: "Trolley", inside: "a", standing: "ok" });
});

const rows = async (view: Parameters<typeof runView>[2], here = {}) =>
  (await runView(shard(), APP, view, TENANT, here)).items.map((r) => String(r["name"]));

describe("a view narrows by what it declares", () => {
  it("answers the whole collection when it narrows by nothing", async () => {
    expect((await rows({ id: "all", of: "shelf" })).sort())
      .toEqual(["Bay four", "Cold room", "Trolley"]);
  });

  it("answers equality", async () => {
    expect(await rows({
      id: "held", of: "shelf",
      where: [{ field: "standing", is: { literal: "held" } }],
    })).toEqual(["Bay four"]);
  });

  /*
    ⚠️ `isnt` IS NOT `NOT is`, AND A ROW WITH NOTHING IN THE COLUMN IS THE
    DIFFERENCE. Every shelf here has a standing, so the two agree; the arm exists
    because the moment one does not, SQL's three-valued logic drops it from both
    answers and a person reading the screen counts the rows and finds one short.
  */
  it("answers inequality", async () => {
    expect((await rows({
      id: "loose", of: "shelf",
      where: [{ field: "standing", isnt: { literal: "held" } }],
    })).sort()).toEqual(["Cold room", "Trolley"]);
  });

  /*
    ⚠️ `unset` IS BOTH NULL AND EMPTY, WHICH IS THE HALF SQL GETS WRONG FOR A
    PERSON. A column somebody cleared holds `''` and one nothing ever wrote holds
    NULL; the database says those differ and a person says both are "no shelf
    above it". Testing only NULL answers half the rows the view is about.
  */
  it("answers unset, over both nothing and nothing-at-all", async () => {
    expect(await rows({
      id: "roots", of: "shelf", where: [{ field: "inside", unset: true }],
    })).toEqual(["Cold room"]);
  });

  it("answers set", async () => {
    expect((await rows({
      id: "within", of: "shelf", where: [{ field: "inside", set: true }],
    })).sort()).toEqual(["Bay four", "Trolley"]);
  });
});

/**
 * ⚠️ `here` IS WHAT MAKES ONE DECLARATION SERVE EVERY RECORD. Without it, "the
 * shelves inside this one" would be a view per shelf, which is a manifest that
 * grows with the data rather than with the product.
 */
describe("a view can be about the record the screen is about", () => {
  it("resolves `here` to the record it was run for", async () => {
    const view = {
      id: "below", of: "shelf",
      where: [{ field: "inside", is: { here: "record" } }],
    } as const;
    expect((await rows(view, { record: "a" })).sort()).toEqual(["Bay four", "Trolley"]);
    expect(await rows(view, { record: "b" })).toEqual([]);
  });
});

describe("a view sorts and is bounded", () => {
  it("sorts by a declared field, both ways", async () => {
    expect(await rows({ id: "az", of: "shelf", sort: { by: "name", dir: "up" } }))
      .toEqual(["Bay four", "Cold room", "Trolley"]);
    expect(await rows({ id: "za", of: "shelf", sort: { by: "name", dir: "down" } }))
      .toEqual(["Trolley", "Cold room", "Bay four"]);
  });

  /*
    ⚠️ THE COUNT IS NOT `items.length` THE MOMENT A LIMIT BITES. A block drawing
    "2" over a view capped at two is a screen reporting its own ceiling as a fact
    about the workspace — and it is the number somebody acts on.
  */
  it("says how many there are, not how many it returned", async () => {
    const held = await runView(shard(), APP, { id: "two", of: "shelf", limit: 2 }, TENANT);
    expect(held.items).toHaveLength(2);
    expect(held.count).toBe(3);
  });

  /*
    ⚠️ A SORT NAMING A COLUMN THAT IS NOT THERE FALLS BACK TO AN ORDER, NEVER TO
    NONE. `refuseView` refuses it at composition; if one ever arrives anyway, an
    unordered answer is one that comes back differently on two reads of the same
    data, which reads as rows moving on their own.
  */
  it("still orders when the sort names nothing", async () => {
    const said = await rows({ id: "odd", of: "shelf", sort: { by: "nope", dir: "up" } });
    expect(said).toHaveLength(3);
  });
});

describe("a screen's views are run together", () => {
  it("answers every view the body reads, by id", async () => {
    const app = withViews([
      { id: "roots", of: "shelf", where: [{ field: "inside", unset: true }] },
      { id: "held", of: "shelf", where: [{ field: "standing", is: { literal: "held" } }] },
      { id: "unread", of: "shelf" },
    ]);
    const got = await runViews(shard(), app, ["roots", "held"], TENANT);
    expect(Object.keys(got).sort()).toEqual(["held", "roots"]);
    expect(got["roots"]?.items).toHaveLength(1);
    expect(got["held"]?.count).toBe(1);
  });

  /*
    ⚠️ A COLLECTION THAT IS NOT THERE ANSWERS EMPTY RATHER THAN BUILDING A TABLE
    NAME OUT OF A STRING. `refuseView` has already refused this at composition,
    which is what makes the branch unreachable — and a runtime that indexes on a
    name from a manifest it did not validate itself is one line from a query it
    assembled out of user input.
  */
  it("answers nothing for a collection nobody declares", async () => {
    const held = await runView(shard(), APP, { id: "ghost", of: "nowhere" }, TENANT);
    expect(held).toEqual({ items: [], count: 0 });
  });
});

/**
 * A VIEW ANSWERED BY THE APP'S OWN OPERATION — see `AskedSpec`.
 *
 * ⚠️ THE POINT IS THAT NOTHING ELSE CHANGES. What comes back is a `Viewed` like
 * any other view's, so the renderer, the count, the permission check and the
 * screen door are all the ones that were already there. A second kind of source
 * would have been a second thing every one of them had to learn.
 */
describe("a view answered by an operation", () => {
  /* ⚠️ `id` IS THE VIEW'S AND EVERYTHING ELSE IS THE ASK'S, because two views
     over one operation is the case the memo below is about — and a helper that
     could only make one of them could not express it. */
  const asked = ({ id = "running-out", ...over }: Record<string, unknown> = {}) => ({
    id, of: "shelf",
    asked: { operation: "shelf.due", take: "items", fills: { today: "today" }, ...over },
  } as never);

  it("answers with the operation's rows, and no query runs", async () => {
    const seen: Record<string, unknown>[] = [];
    const got = await runView(
      shard(), APP, asked(), TENANT, { today: "2026-08-25" }, [],
      async (operation, input) => {
        seen.push({ operation, ...input });
        return { items: [{ id: "z", name: "From the handler" }] };
      },
    );
    expect(got).toEqual({ items: [{ id: "z", name: "From the handler" }], count: 1 });
    /* ⚠️ AND THE DEVICE'S OWN DAY REACHED IT. A shelf life is counted where the
       shelf is; the worker has no way to know what day it is where somebody is
       standing, so the fill travels with the request. */
    expect(seen).toEqual([{ operation: "shelf.due", today: "2026-08-25" }]);
  });

  /* ⚠️ A FILL WITH NOTHING BEHIND IT IS LEFT OUT RATHER THAN SENT EMPTY. An
     empty string in a required field is a refusal that says the field is
     missing when the truth is that the screen has not resolved. */
  it("leaves out a fill the screen could not supply", async () => {
    let sent: Record<string, unknown> | null = null;
    await runView(shard(), APP, asked({ fills: { at: "record" } }), TENANT, {}, [],
      async (_op, input) => { sent = input; return { items: [] }; });
    expect(sent).toEqual({});
  });

  /* ⚠️ A REFUSAL IS AN EMPTY VIEW, NOT AN OUTAGE. The operation has its own
     permission and entitlement; a caller who fails one sees the block's own
     empty state, which is what every other withheld region already looks like. */
  it("answers empty when the operation refuses", async () => {
    expect(await runView(shard(), APP, asked(), TENANT, {}, [], async () => null))
      .toEqual({ items: [], count: 0 });
  });

  /* ⚠️ AND SO IS AN ANSWER THAT IS NOT A LIST. The row shape is the operation's
     and nothing checks it, so this is the one place a mismatch surfaces — and a
     region drawing its empty state beats a renderer handed a number. */
  it("answers empty when the field it takes is not rows", async () => {
    expect(await runView(shard(), APP, asked(), TENANT, {}, [],
      async () => ({ items: 7 } as never))).toEqual({ items: [], count: 0 });
  });

  /* ⚠️ AND WITH NO RUNNER AT ALL — a caller that never wired the seam gets an
     empty view rather than a thrown request. Every other view on the screen
     still answers, which is the shape `Region` is built for. */
  it("answers empty when nothing was handed a way to ask", async () => {
    expect(await runView(shard(), APP, asked(), TENANT, {}))
      .toEqual({ items: [], count: 0 });
  });

  /*
    ⚠️ HOW MANY THERE ARE, WHERE THE HANDLER SAID — see `AskedSpec.total`. A
    bounded answer with no count reads as the whole answer, which is the one
    thing a list in an inventory product must never say.
  */
  it("counts by the field the view names, not by the page it was handed", async () => {
    expect(await runView(
      shard(), APP, asked({ total: "total" }), TENANT, {}, [],
      async () => ({ items: [{ id: "a" }, { id: "b" }], total: 4310 }),
    )).toEqual({ items: [{ id: "a" }, { id: "b" }], count: 4310 });
  });

  it("falls back to the page's own length where no field is named", async () => {
    expect((await runView(
      shard(), APP, asked(), TENANT, {}, [],
      async () => ({ items: [{ id: "a" }, { id: "b" }], total: 4310 }),
    )).count).toBe(2);
  });

  /* ⚠️ AND A NARROWING REACHES THE INPUT — see `PickSpec`. Held in the browser it
     would move a control and leave the rows exactly where they were. */
  it("sends what somebody narrowed the screen to", async () => {
    let sent: Record<string, unknown> | null = null;
    await runView(
      shard(), APP, asked({ fills: { where: { picked: "where" } } }), TENANT,
      { picked: { where: "loc_1" } }, [],
      async (_op, input) => { sent = input; return { items: [] }; },
    );
    expect(sent).toEqual({ where: "loc_1" });
  });

  it("leaves the narrowing out while nobody has chosen one", async () => {
    let sent: Record<string, unknown> | null = null;
    await runView(
      shard(), APP, asked({ fills: { where: { picked: "where" } } }), TENANT, {}, [],
      async (_op, input) => { sent = input; return { items: [] }; },
    );
    expect(sent).toEqual({});
  });

  it("runs beside the query views in one pass", async () => {
    const got = await runViews(
      shard(),
      withViews([{ id: "all", of: "shelf" }, asked()] as never),
      ["all", "running-out"], TENANT, {}, {},
      async () => ({ items: [{ id: "z" }] }),
    );
    expect(got["all"]?.count).toBe(3);
    expect(got["running-out"]?.count).toBe(1);
  });

  /*
    ⚠️ ONE QUESTION, ONE ANSWER, FOR THE LENGTH OF ONE READ — see `askedOnce`. A
    report works out four things from one pass over the ledger, so it reaches a
    screen as four views naming four of its output fields — and each one was its
    own call, which ran the whole report four times over the same period.
  */
  it("asks one question once, however many views name it", async () => {
    let ran = 0;
    const got = await runViews(
      shard(),
      withViews([asked({ id: "rows" }), asked({ id: "totals", take: "totals" })] as never),
      ["rows", "totals"], TENANT, { today: "2026-08-25" }, {},
      async () => {
        ran++;
        return { items: [{ id: "z" }], totals: [{ id: "t" }] };
      },
    );
    expect(ran).toBe(1);
    expect(got["rows"]?.count).toBe(1);
  });

  /* ⚠️ AND A DIFFERENT QUESTION IS STILL ASKED. The key is the operation and its
     input, so two views over one operation with different fills are two runs —
     which is what makes this a memo rather than a bug. */
  /*
    ⚠️ THE DEVICE'S YEAR, AND IT IS THE SAME DAY'S — see `Fill`. A six-digit
    expiry has its century inferred from a window around now, so reading one
    needs the year where the BOX is; taken off a clock a second time it could
    disagree with the day sent beside it, which is a real state one second before
    midnight on the thirty-first of December.
  */
  it("fills the year from the day the device sent", async () => {
    let saw: Record<string, unknown> = {};
    await runView(
      shard(), APP,
      asked({ fills: { today: "today", year: "year" } }),
      TENANT, { today: "2026-12-31" }, [],
      async (_op, input) => { saw = input; return { items: [] }; },
    );
    expect(saw["today"]).toBe("2026-12-31");
    expect(saw["year"]).toBe("2026");
  });

  it("still asks again when the input differs", async () => {
    let ran = 0;
    await runViews(
      shard(),
      withViews([
        asked({ id: "a" }),
        asked({ id: "b", fills: { today: "today", where: { says: "b1" } } }),
      ] as never),
      ["a", "b"], TENANT, { today: "2026-08-25" }, {},
      async () => {
        ran++;
        return { items: [] };
      },
    );
    expect(ran).toBe(2);
  });
});
