/**
 * WHAT A DECLARED SCREEN IS HANDED, AND WHAT IT IS REFUSED.
 *
 * ⚠️ THE PERMISSION IS THE COLLECTIONS', AND THAT IS THE TEST THAT MATTERS. A
 * screen carries a `permission` for whether it is OFFERED; this door hands back
 * ROWS, and the permission governing a row is its collection's. Checking only
 * the screen's would let a screen asking for `stock:read` return supplier rows
 * to somebody who may not read suppliers — a manifest's mistake that the door
 * would carry out, silently, with every suite green.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { field, type AppSpec, type CollectionSpec, type ScreenSpec } from "@engine/kernel";
import { applySchema, type Db } from "../src/index.js";
import { put } from "../src/records.js";
import { schemaFor } from "../src/schema.js";
import { collectionsFor, drawnFor } from "../src/screen.js";

const shard = () => env.SHARD_EU_1 as unknown as Db;
const TENANT = "ten_screen";
const NOW = new Date("2026-08-25T09:00:00.000Z");

const made = (id: string, permission: string, fields: CollectionSpec["fields"]): CollectionSpec => ({
  id,
  label: { one: id, many: `${id}s` },
  scope: { of: "tenant" },
  permission,
  retention: null,
  onClose: { then: "purge" },
  fields,
} as CollectionSpec);

const shelf = made("shelf", "stock", {
  name: field.text({ label: "Name", required: true, holds: "none", max: 80 }),
  inside: field.text({ label: "Inside", holds: "none", max: 40 }),
  /* ⚠️ A REFERENCE INTO A COLLECTION WITH A DIFFERENT PERMISSION, which is the
     only shape that can tell a hop that is checked from one that is not. Both
     ends under one grant would pass either way. */
  supplier: field.ref({ label: "Supplied by", holds: "none", to: "supplier" }),
});
const supplier = made("supplier", "supplier", {
  name: field.text({ label: "Name", required: true, holds: "none", max: 80 }),
});

/* ⚠️ ONE THAT ASKS AND ONE THAT DOES NOT — see `Drawn.acts`. The browser draws a
   form for the first and runs the second on the press, and it decides which from
   what the door sends rather than from a catalogue it downloaded. */
const OPS = [
  {
    id: "shelf.rename", summary: "Rename this shelf",
    input: { name: field.text({ label: "Name", required: true, holds: "none", max: 80 }) },
  },
  { id: "shelf.tidy", summary: "Tidy it", input: {} },
] as unknown as AppSpec["operations"];

const APP = {
  id: "warehouse",
  collections: [shelf, supplier],
  operations: OPS,
  views: [
    { id: "below", of: "shelf", where: [{ field: "inside", is: { here: "record" } }] },
    { id: "everyone", of: "supplier" },
  ],
} as unknown as AppSpec;

const place: ScreenSpec = {
  id: "place", route: "/place", label: "Place", permission: "stock", of: "shelf",
  body: {
    shape: "detail",
    layout: { as: "stack" },
    blocks: [{
      block: "Listing",
      shows: [{ field: "name", label: "Shelf" }],
      nothing: { says: "Nothing inside" },
      bind: {
        label: { from: { of: "words", says: "Inside" } },
        of: { from: { of: "view", view: "below" } },
      },
    }],
  },
} as unknown as ScreenSpec;

/* ⚠️ THE SCREEN THAT REACHES PAST ITS OWN PERMISSION — a `stock` screen whose
   body reads suppliers. It is a manifest anybody could write, it composes, and
   the only thing between it and a leak is this door. */
const overreaching: ScreenSpec = {
  ...place,
  id: "sneaky",
  body: {
    ...place.body!,
    blocks: [{
      block: "Listing",
      shows: [{ field: "name", label: "Supplier" }],
      nothing: { says: "No suppliers" },
      bind: {
        label: { from: { of: "words", says: "Suppliers" } },
        of: { from: { of: "view", view: "everyone" } },
      },
    }],
  },
} as unknown as ScreenSpec;

/**
 * ⚠️ THE SCREEN THAT REACHES THROUGH ITS OWN SUBJECT — a shelf saying who
 * supplies it. The path is on the RECORD rather than on a view's rows, which is
 * the half nothing fetched: the kernel accepts it, the binding composes, and the
 * row came back without the column in it.
 */
const supplied: ScreenSpec = {
  id: "supplied", route: "/supplied", label: "Supplied", permission: "stock", of: "shelf",
  body: {
    shape: "detail",
    layout: { as: "stack" },
    blocks: [{
      block: "FieldRow",
      bind: {
        label: { from: { of: "words", says: "Supplied by" } },
        value: { from: { of: "field", field: "supplier.name" } },
      },
    }],
  },
} as unknown as ScreenSpec;

/* ⚠️ THE ID IS THE ONE `put` MINTED, NOT ONE THIS FILE CHOSE. `put` always
   generates its own — a caller-supplied id in the values is ignored — so a
   fixture that assumed otherwise writes rows whose references point at nothing,
   and every assertion then passes or fails for the wrong reason. */
const add = async (spec: CollectionSpec, row: Record<string, unknown>) => {
  const done = await put(shard(), spec, TENANT, row, null, NOW);
  if ("why" in done) throw new Error(done.why);
  return done.id;
};

let cold = "";

beforeEach(async () => {
  await applySchema(shard(), [schemaFor(APP)]);
  await shard().prepare("DELETE FROM shelf").run();
  await shard().prepare("DELETE FROM supplier").run();
  const ferris = await add(supplier, { name: "Ferris Chemicals" });
  cold = await add(shelf, { name: "Cold room", inside: "", supplier: ferris });
  await add(shelf, { name: "Bay four", inside: cold });
});

const all = () => true;
const only = (...held: string[]) => (p: string) => held.includes(p);

describe("a screen is handed its record and its views together", () => {
  it("answers the record the screen is about", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, all, cold);
    expect("needs" in got).toBe(false);
    if ("needs" in got) return;
    expect(got.record?.["name"]).toBe("Cold room");
    expect(got.views["below"]?.items.map((r) => r["name"])).toEqual(["Bay four"]);
  });

  /*
    ⚠️ NO RECORD IS NOT AN ERROR. A `list` screen is about a collection; a
    `detail` screen whose address has not resolved yet is a screen mid-arrival.
    Both answer views and no record, and the renderer already draws a body whose
    `field` reads resolve to nothing.
  */
  it("answers with no record when none was asked for", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, all);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.record).toBeNull();
    expect(got.views["below"]?.items).toEqual([]);
  });

  /*
    ⚠️ WHAT THE RECORD IS CALLED, ON THE SCREEN'S OWN ANSWER — see `Drawn.name`.
    A screen about one thing is named by that thing, and the manifest cannot say
    so: `ScreenSpec.label` is the word for the KIND, because it is also the nav
    item and the shortcut tile. So a page about the cold room was headed
    "Place" — a heading answering a question nobody asked.
  */
  it("says what the record is called", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.name).toBe("Cold room");
  });

  /*
    ⚠️ AND TO SOMEBODY WHO MAY ONLY READ, WHICH IS WHY IT IS NOT INSIDE `aside`.
    The same string was already resolved by the same `namesIn` — in the payload
    for DELETING one, sent only where the caller holds the update grant. So a
    member with `stock` read and no write opened a page with no name on it, and
    the fix would have been to widen a delete sheet's gate. The two are asserted
    together because the split is the whole point.
  */
  it("names the record for a reader who may not change it", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, only("stock:read", "supplier:read"),
      cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.name).toBe("Cold room");
    expect(got.aside).toBeNull();
  });

  /* ⚠️ AND `null` RATHER THAN AN IDENTIFIER WHERE THERE IS NO RECORD. A list
     screen is about a collection; the caller falls back to the screen's own
     label, which is the honest answer to "one of these". */
  it("has no name where there is no record", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, all);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.name).toBeNull();
  });

  /*
    ⚠️ THE ACTS TRAVEL WITH THE SCREEN, AND ONLY THE ONES IT OFFERS. Sending the
    catalogue would put every operation in the product on the wire for a screen
    with one button on it; sending none would mean the browser cannot draw a form
    without downloading the product's own manifest, which is the dependency
    stage 98 exists to remove.
  */
  it("sends the acts the body names, with the input each one takes", async () => {
    const acting: ScreenSpec = {
      ...place,
      id: "acting",
      body: {
        ...place.body!,
        blocks: [{ ...place.body!.blocks[0]!, does: ["shelf.rename"] }],
      },
    } as unknown as ScreenSpec;
    const got = await drawnFor(shard(), APP, acting, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(Object.keys(got.acts)).toEqual(["shelf.rename"]);
    expect(got.acts["shelf.rename"]?.summary).toBe("Rename this shelf");
    expect(Object.keys(got.acts["shelf.rename"]?.input ?? {})).toEqual(["name"]);
  });

  /*
    ⚠️ AND WHAT THE SCREEN FILLS IN TRAVELS WITH IT. Without this the first form
    a declared screen draws asks somebody to type the id of the thing they
    opened — the browser has no way to know which of an operation's inputs are
    questions and which are facts the screen is standing on.
  */
  it("sends what the screen fills in beside what it asks for", async () => {
    const acting: ScreenSpec = {
      ...place,
      id: "filling",
      body: {
        ...place.body!,
        blocks: [{
          ...place.body!.blocks[0]!,
          does: [{ op: "shelf.rename", fills: { name: "record" } }],
        }],
      },
    } as unknown as ScreenSpec;
    const got = await drawnFor(shard(), APP, acting, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.acts["shelf.rename"]?.fills).toEqual({ name: "record" });
  });

  it("fills in nothing for an act declared as a bare id", async () => {
    const acting: ScreenSpec = {
      ...place,
      id: "acting",
      body: {
        ...place.body!,
        blocks: [{ ...place.body!.blocks[0]!, does: ["shelf.rename"] }],
      },
    } as unknown as ScreenSpec;
    const got = await drawnFor(shard(), APP, acting, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.acts["shelf.rename"]?.fills).toEqual({});
  });

  it("sends no acts at all for a body that offers none", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.acts).toEqual({});
  });

  it("runs only the views this screen's body reads", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(Object.keys(got.views)).toEqual(["below"]);
  });

  /*
    ⚠️ THE RECORD REACHES TOO, AND IT DID NOT. Every other assertion in this file
    passes over a subject that carries only its own columns, so a screen binding
    `from.name` drew a blank beside a label — which reads as a shelf with no
    supplier rather than as a value nothing went to fetch.
  */
  it("carries a field of what the record points at", async () => {
    const got = await drawnFor(shard(), APP, supplied, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.record?.["supplier.name"]).toBe("Ferris Chemicals");
  });

  it("leaves the record's own columns alone", async () => {
    const got = await drawnFor(shard(), APP, supplied, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.record?.["name"]).toBe("Cold room");
  });
});

describe("every collection the screen touches is asked for by name", () => {
  it("lists the subject's collection and every view's", () => {
    expect([...collectionsFor(APP, place)].sort()).toEqual(["shelf"]);
    expect([...collectionsFor(APP, overreaching)].sort()).toEqual(["shelf", "supplier"]);
  });

  it("refuses when the caller does not hold the subject's permission", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, only("supplier:read"), cold);
    expect(got).toEqual({ needs: "stock:read" });
  });

  /*
    ⚠️ THE ONE THIS FILE EXISTS FOR. A `stock` screen reading a `supplier` view
    is a manifest anybody could write; it composes, every guard is green, and
    without this check the door hands back supplier rows to a caller holding
    `stock` alone.
  */
  it("refuses a screen whose body reads past its own permission", async () => {
    const got = await drawnFor(shard(), APP, overreaching, TENANT, only("stock:read"), cold);
    expect(got).toEqual({ needs: "supplier:read" });
  });

  /*
    ⚠️ AND IT REFUSES RATHER THAN SERVING THE PART IT MAY. Dropping the views a
    caller cannot read draws a screen with a region missing — which reads as a
    workspace with no suppliers rather than as an account that cannot see them,
    and the person acts on the first reading.
  */
  it("answers nothing at all rather than the half it could", async () => {
    const got = await drawnFor(shard(), APP, overreaching, TENANT, only("stock:read"), cold);
    expect("views" in got).toBe(false);
  });

  it("answers in full when the caller holds both", async () => {
    const got = await drawnFor(
      shard(), APP, overreaching, TENANT, only("stock:read", "supplier:read"), cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.views["everyone"]?.items).toHaveLength(1);
  });

  /*
    ⚠️ A HOP IS A TOUCH, AND IT WAS NOT COUNTED AS ONE. `supplier.name` is a
    field of a SUPPLIER's row reached through a shelf — so a screen declaring
    `stock` and binding it handed out catalogue names to a caller holding `stock`
    alone. The screen composes, the door served it, and the only difference from
    the case two tests up is that the second collection arrives through a
    reference rather than through a view.
  */
  it("counts what a path reaches into as a collection it touches", () => {
    expect([...collectionsFor(APP, supplied)].sort()).toEqual(["shelf", "supplier"]);
  });

  it("refuses a screen that reaches past its own permission", async () => {
    const got = await drawnFor(shard(), APP, supplied, TENANT, only("stock:read"), cold);
    expect(got).toEqual({ needs: "supplier:read" });
  });

  /*
    ⚠️ AND A TALLY COUNTS TOO. "How many suppliers point at this" is a smaller
    answer than their names and it is still an answer about rows — a screen that
    could report a competitor count it may not read is the same leak with the
    detail removed.
  */
  it("counts a tally's collection as one it touches", () => {
    const counting = {
      ...APP,
      /* ⚠️ SUPPLIERS, WITH HOW MANY SHELVES EACH ONE STOCKS — the tally reads
         `shelf`, which is a collection the view itself never names. */
      views: [...APP.views!,
        { id: "tallied", of: "supplier", tally: [{ as: "shelves", of: "shelf", by: "supplier" }] }],
    } as unknown as AppSpec;
    /* ⚠️ ABOUT NOTHING, so the only collections it touches are the view's and
       the tally's — which is what makes the assertion about the tally alone. */
    const screen = {
      id: "tallied", route: "/tallied", label: "Tallied", permission: "supplier",
      body: {
        ...place.body!,
        blocks: [{
          ...place.body!.blocks[0]!,
          bind: {
            label: { from: { of: "words", says: "Suppliers" } },
            of: { from: { of: "view", view: "tallied" } },
          },
        }],
      },
    } as unknown as ScreenSpec;
    expect([...collectionsFor(counting, screen)].sort()).toEqual(["shelf", "supplier"]);
  });
});

/**
 * WHAT A `ref` INPUT MAY BE — see `Act.choices`.
 *
 * ⚠️ THE ROWS TRAVEL WITH THE SCREEN, and the reason is where these forms are
 * used. A press on a warehouse phone must open a filled form rather than a
 * spinner — so this is one more statement in a batch the screen already runs,
 * not a round trip on the gesture.
 */
describe("a form that asks which one", () => {
  /* ⚠️ THE COLLECTION SAYS WHICH FIELD NAMES A ROW — without it a picker is a
     list of identifiers, which is the failure this whole seam is about. */
  const named = { ...supplier, names: "name" } as CollectionSpec;
  const picking = {
    ...APP,
    collections: [shelf, named],
    operations: [
      ...(APP.operations ?? []),
      {
        id: "shelf.supply", summary: "Say who supplies it",
        input: { by: field.ref({ label: "Supplier", required: true, holds: "none", to: "supplier" }) },
      },
    ],
  } as unknown as AppSpec;

  const asking = {
    ...place,
    id: "asking",
    body: {
      ...place.body!,
      blocks: [{
        block: "ActionRow",
        does: ["shelf.supply"],
        bind: { label: { from: { of: "words", says: "Say who supplies it" } } },
      }],
    },
  } as unknown as ScreenSpec;

  it("answers the rows, named, beside the act", async () => {
    const got = await drawnFor(shard(), picking, asking, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(got.acts["shelf.supply"]?.choices["by"]?.map((c) => c.label))
      .toEqual(["Ferris Chemicals"]);
  });

  /*
    ⚠️ AND THE COLLECTION BEHIND A PICKER IS A TOUCH, WHICH IS THE SHARP HALF. A
    form listing every supplier by name is a read of the supplier collection
    whatever it is drawn as — leaving it out of the permission check would hand a
    caller with no `supplier:read` the whole list through a dropdown.
  */
  it("counts the collection it offers as one the screen touches", () => {
    expect([...collectionsFor(picking, asking)].sort()).toEqual(["shelf", "supplier"]);
  });

  it("refuses the screen to somebody who may not read them", async () => {
    const got = await drawnFor(shard(), picking, asking, TENANT, only("stock:read"), cold);
    expect(got).toEqual({ needs: "supplier:read" });
  });

  /* ⚠️ A COLLECTION THAT NAMES NO FIELD FALLS BACK TO ITS IDENTIFIER, which is
     the honest thing to show for a row with no name — and visibly wrong in a way
     a guess assembled out of columns is not. */
  it("falls back to the identifier where a collection names nothing", async () => {
    const bare = { ...picking, collections: [shelf, supplier] } as unknown as AppSpec;
    const got = await drawnFor(shard(), bare, asking, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    const [one] = got.acts["shelf.supply"]?.choices["by"] ?? [];
    expect(one?.label).toBe(one?.id);
  });
});
