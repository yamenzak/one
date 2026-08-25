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
});
const supplier = made("supplier", "supplier", {
  name: field.text({ label: "Name", required: true, holds: "none", max: 80 }),
});

const APP = {
  id: "warehouse",
  collections: [shelf, supplier],
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
  cold = await add(shelf, { name: "Cold room", inside: "" });
  await add(shelf, { name: "Bay four", inside: cold });
  await add(supplier, { name: "Ferris Chemicals" });
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

  it("runs only the views this screen's body reads", async () => {
    const got = await drawnFor(shard(), APP, place, TENANT, all, cold);
    if ("needs" in got) throw new Error(got.needs);
    expect(Object.keys(got.views)).toEqual(["below"]);
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
});
