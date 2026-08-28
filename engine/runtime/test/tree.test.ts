/**
 * A TREE THAT CANNOT BE BENT INTO A RING, AGAINST A REAL DATABASE.
 *
 * ⚠️ THIS IS THE FAILURE WITH NO ERROR MESSAGE ANYWHERE. Moving a record under
 * one of its own descendants is refused by nothing a database can express: both
 * ids are real, both rows are the caller's, and the update lands. What it
 * produces is a shape with no root, so every walk over it — a picker drawing the
 * tree, a report rolling figures up it — runs until something times out. The
 * person who did it saw a save that worked.
 *
 * ⚠️ AND IT IS PROVED THROUGH `patch` RATHER THAN AGAINST THE HELPER, because
 * the whole point is that no app has to call anything. A collection with a `ref`
 * at itself gets this, and the fifth app gets it without being told.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { DEEPEST_TREE, collection, field, type CollectionSpec } from "@engine/kernel";
import { applySchema, columnsFor, statementsFor, type SchemaModule } from "../src/schema.js";
import type { Db } from "../src/sql.js";
import { patch, put } from "../src/records.js";

const db = () => env.SHARD_EU_1 as unknown as Db;

const TENANT = "ten_tree";
const OTHER = "ten_other";
const NOW = "2026-03-07T11:00:00.000Z";

/* ⚠️ A PLACE RATHER THAN A COST CENTRE — the runtime carries no product
   vocabulary, and what is proved is that ANY self-referencing ref is a tree. */
const place: CollectionSpec = collection({
  id: "place",
  label: { one: "Place", many: "Places" },
  scope: { of: "tenant" },
  permission: "place",
  retention: null,
  onClose: { then: "purge" },
  names: "name",
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none", max: 120 }),
    within: field.ref({ label: "Inside", holds: "none", to: "place" }),
    /* ⚠️ A ref at ANOTHER collection is not a parent and must be left alone. */
    keeper: field.ref({ label: "Kept by", holds: "none", to: "party" }),
  },
});

const MODULE: SchemaModule = {
  id: "tree-test",
  statements: statementsFor(place),
  columns: { place: columnsFor(place) },
};

const make = async (
  name: string, within: string | null = null, scope = TENANT,
): Promise<string> => {
  const done = await put(
    db(), place, scope, { name, ...(within ? { within } : {}) }, "acc_x", new Date(NOW));
  if ("why" in done) throw new Error(`could not make ${name}: ${done.why}`);
  return done.id;
};

const move = (id: string, within: string, scope = TENANT) =>
  patch(db(), place, scope, id, { within }, "acc_x", new Date(NOW));

beforeEach(async () => {
  await applySchema(db(), [MODULE]);
  await db().exec(`DELETE FROM place;`);
});

describe("moving a record around a tree", () => {
  it("lets an ordinary move through", async () => {
    const site = await make("Site");
    const room = await make("Room");
    expect(await move(room, site)).toEqual({ id: room });
  });

  it("refuses a record put inside itself", async () => {
    const site = await make("Site");
    const done = await move(site, site);
    expect(done).toMatchObject({ why: "cycles", field: "within" });
  });

  /*
    ⚠️ THE ONE THAT LOOKS ORDINARY ON THE SCREEN THAT MAKES IT. Both ids are
    real, both rows are the caller's, and the update is refused by nothing a
    database can express — so the only sign afterwards is a request that never
    answers.
  */
  it("refuses a record put under its own child", async () => {
    const site = await make("Site");
    const room = await make("Room", site);
    const done = await move(site, room);
    expect(done).toMatchObject({ why: "cycles", field: "within" });
  });

  it("refuses it however far down the chain the descendant is", async () => {
    const site = await make("Site");
    const room = await make("Room", site);
    const shelf = await make("Shelf", room);
    const bin = await make("Bin", shelf);
    expect(await move(site, bin)).toMatchObject({ why: "cycles" });
    /* ⚠️ And the same chain the right way up is an ordinary move. */
    expect(await move(bin, site)).toEqual({ id: bin });
  });

  it("lets a record move sideways to a branch it is not in", async () => {
    const north = await make("North");
    const south = await make("South");
    const room = await make("Room", north);
    expect(await move(room, south)).toEqual({ id: room });
  });

  /* ⚠️ AN EMPTY PARENT IS THE ROOT, and clearing one is not this check's
     business — there is nothing above nothing to climb. */
  it("lets a record be pulled out to the top", async () => {
    const site = await make("Site");
    const room = await make("Room", site);
    expect(await move(room, "")).toEqual({ id: room });
  });

  /* ⚠️ A TREE ALLOWED TO GROW WITHOUT BOUND IS ONE EVERY ANCESTOR WALK IN THE
     DEPLOYMENT PAYS FOR — so the depth is refused rather than merely assumed. */
  it("refuses a chain deeper than anything real", async () => {
    let at = await make("l0");
    for (let n = 1; n < DEEPEST_TREE; n++) at = await make(`l${n}`, at);
    const loose = await make("loose");
    expect(await move(loose, at)).toMatchObject({ why: "cycles" });
  });

  /*
    ⚠️ A PAIR ALREADY BENT MUST NOT HANG THE CHECK, and this is the test that
    caught it: the obvious `UNION` does not stop a ring, because each pass
    carries a different depth and so is a new row that nothing deduplicates. A
    walk running for ever over rows written before this rule existed would be the
    failure it exists to prevent, moved into the thing preventing it. The depth
    predicate is the whole of the termination.
  */
  it("answers over a pair that was already bent", async () => {
    const x = await make("X");
    const y = await make("Y", x);
    /* ⚠️ Straight into the table, because `patch` is what refuses this. */
    await db().prepare(`UPDATE place SET within = ? WHERE id = ?`).bind(y, x).run();
    /* ⚠️ The climb from X goes X → Y → X → Y until the depth bound stops it,
       finds Y in what it collected, and refuses. */
    expect(await move(y, x)).toMatchObject({ why: "cycles" });
  });

  /*
    ⚠️ THE CLIMB IS INSIDE ONE WORKSPACE. A walk that crossed the scope would let
    another workspace's rows decide whether this one's move is refused — and, in
    the other direction, would report the depth of a tree the caller cannot see.
  */
  it("does not climb out of the workspace", async () => {
    const theirs = await make("Theirs", null, OTHER);
    const mine = await make("Mine");
    /* ⚠️ Pointing at a row in another workspace is not this check's business —
       what matters is that the climb found nothing and did not refuse. */
    expect(await move(mine, theirs)).toEqual({ id: mine });
  });

  /* ⚠️ A REF AT ANOTHER COLLECTION IS NOT A PARENT, so a record may be kept by
     a party whose id happens to be its own. */
  it("leaves a ref at another collection alone", async () => {
    const site = await make("Site");
    const done = await patch(
      db(), place, TENANT, site, { keeper: site }, "acc_x", new Date(NOW));
    expect(done).toEqual({ id: site });
  });
});
