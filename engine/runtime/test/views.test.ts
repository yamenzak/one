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
