/**
 * WHAT A `searchable` COLLECTION ACTUALLY DOES — and the four ways it could
 * quietly not.
 *
 * ⚠️ EVERY FAILURE THIS FILE IS ABOUT IS SILENT. A record indexed and never
 * removed is findable after it was deleted; a record marked and never carried is
 * a search that returns nothing over data that is there; a query without its
 * folder filter is another workspace's notes in your results; an erasure that
 * marks nothing is a deletion request answered with the text still in the index.
 * None of the four throws, and three of them look like an empty result.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { collection, field, type CollectionSpec } from "@engine/kernel";
import { applySchema, type Db } from "../src/index.js";
import { erase, put } from "../src/records.js";
import { schemaFor } from "../src/schema.js";
import {
  SEARCH_SCHEMA, flushIndex, folderFor, indexState, instanceFor, itemKeyFor, itemsDue,
  itemsFailed, noteGone, noteWritten, recordIdIn, searchIn, type Index, type Searcher,
} from "../src/search.js";

const shard = () => env.SHARD_EU_1 as unknown as Db;
const TENANT = "ten_find";
const NOW = new Date("2026-08-19T09:00:00.000Z");
const APP = "beacon";

const note: CollectionSpec = collection({
  id: "findable",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  permission: "findable",
  retention: null,
  onClose: { then: "purge" },
  searchable: ["title", "body"],
  fields: {
    title: field.text({ label: "Title", holds: "none" }),
    body: field.long({ label: "Body", holds: "none" }),
    secret: field.text({ label: "Secret", holds: "none" }),
  },
});

/** ⚠️ A recording index, so what was SENT is assertable rather than inferred. */
const spy = () => {
  const sent = new Map<string, string>();
  const dropped: string[] = [];
  const index: Index = {
    async put(_instance, key, text) { sent.set(key, text); return { ok: true }; },
    async drop(_instance, key) { dropped.push(key); sent.delete(key); return { ok: true }; },
  };
  return { index, sent, dropped };
};

const refusing = (why: string): Index => ({
  async put() { return { ok: false, why }; },
  async drop() { return { ok: false, why }; },
});

const flush = (index: Index) => flushIndex({
  db: shard(), index, deployment: "one", now: NOW,
  collections: () => [note],
  read: (spec, scope, id) => shard()
    .prepare(`SELECT * FROM findable WHERE id = ? AND tenant_id = ?`)
    .bind(id, scope).first() as Promise<Record<string, unknown> | null>,
});

const write = async (values: Record<string, unknown>) => {
  const done = await put(shard(), note, TENANT, values, null, NOW);
  if ("why" in done) throw new Error(done.why);
  await noteWritten(shard(), note, APP, TENANT, done.id, NOW);
  return done.id;
};

beforeEach(async () => {
  await applySchema(shard(), [SEARCH_SCHEMA, schemaFor({ id: APP, collections: [note] } as never)]);
  await shard().exec(`DELETE FROM search_item;`);
  await shard().exec(`DELETE FROM findable;`);
});

/* --------------------------------------------------------------- the ledger --- */

describe("what a write leaves behind", () => {
  it("marks a new record pending and touches nothing else", async () => {
    const id = await write({ title: "One", body: "about a thing" });
    const due = await itemsDue(shard());
    expect(due).toHaveLength(1);
    expect(due[0]!.state).toBe("pending");
    expect(due[0]!.recordId).toBe(id);
    /* ⚠️ The address is the boundary — see `itemKeyFor`. */
    expect(due[0]!.itemKey).toBe(itemKeyFor(TENANT, note.id, id));
  });

  /*
    ⚠️ ONE ROW PER RECORD, WHATEVER HAPPENS TO IT. Without the unique index an
    edit adds a second pending row, the same record is indexed twice under one
    key, and the delete forgets one of the two — leaving a record that stays
    findable after it is gone.
  */
  it("keeps one row through repeated edits", async () => {
    const id = await write({ title: "One", body: "first" });
    await noteWritten(shard(), note, APP, TENANT, id, NOW);
    await noteWritten(shard(), note, APP, TENANT, id, NOW);
    expect(await itemsDue(shard())).toHaveLength(1);
  });

  /*
    ⚠️ A COLLECTION THAT SAID NOTHING LEAVES NOTHING. The hook runs on every
    generated write in every product, so a collection with no `searchable` must
    cost one branch and not one row.
  */
  it("leaves nothing at all for a collection that is not searchable", async () => {
    const plain = { ...note, searchable: undefined } as CollectionSpec;
    await noteWritten(shard(), plain, APP, TENANT, "rec_1", NOW);
    expect(await itemsDue(shard())).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- the flush --- */

describe("carrying what changed to the index", () => {
  /*
    ⚠️ THE NAMED FIELDS AND NOTHING ELSE. A flush built from `SELECT *` would
    send every column the day it was added — including the ones nobody reviewed.
  */
  it("sends only the fields the collection named", async () => {
    await write({ title: "One", body: "about a thing", secret: "do not send" });
    const at = spy();
    await flush(at.index);
    const [text] = [...at.sent.values()];
    expect(text).toContain("One");
    expect(text).toContain("about a thing");
    expect(text).not.toContain("do not send");
  });

  it("marks what it sent, so a second pass sends nothing", async () => {
    await write({ title: "One", body: "b" });
    const at = spy();
    expect((await flush(at.index)).sent).toBe(1);
    expect((await flush(at.index)).sent).toBe(0);
    expect((await indexState(shard())).indexed).toBe(1);
  });

  /*
    ⚠️ A DELETED RECORD IS REMOVED FROM THE INDEX, AND THE LEDGER ROW IS THE ONLY
    HANDLE ON IT. This is the failure that reads as a leak rather than a bug:
    the record is gone from the database and still comes back in a search.
  */
  it("removes a deleted record and then forgets the row", async () => {
    const id = await write({ title: "One", body: "b" });
    const at = spy();
    await flush(at.index);

    await shard().prepare(`DELETE FROM findable WHERE id = ?`).bind(id).run();
    await noteGone(shard(), note, APP, id, NOW);
    const out = await flush(at.index);

    expect(out.removed).toBe(1);
    expect(at.dropped).toContain(itemKeyFor(TENANT, note.id, id));
    expect(await itemsDue(shard())).toHaveLength(0);
    expect((await indexState(shard())).indexed).toBe(0);
  });

  /*
    ⚠️ A RECORD THAT VANISHED BETWEEN THE MARK AND THE FLUSH IS ORDINARY. The
    delete and the pass race by construction, and treating it as an error would
    fill the failed list with the normal case AND leave the item in the index.
  */
  it("removes rather than fails when the record is already gone", async () => {
    const id = await write({ title: "One", body: "b" });
    await shard().prepare(`DELETE FROM findable WHERE id = ?`).bind(id).run();
    const at = spy();
    const out = await flush(at.index);
    expect(out.removed).toBe(1);
    expect(out.failed).toBe(0);
  });

  /*
    ⚠️ AND DELETING THE `searchable` LINE HAS TO TAKE WHAT IS ALREADY OUT THERE
    WITH IT. Otherwise the one action somebody takes to stop indexing does
    everything except stop it.
  */
  it("removes what a collection that stopped being searchable left behind", async () => {
    await write({ title: "One", body: "b" });
    const at = spy();
    await flush(at.index);
    expect(at.sent.size).toBe(1);

    await noteWritten(shard(), note, APP, TENANT, (await itemsDue(shard()))[0]?.recordId
      ?? (await shard().prepare(`SELECT id FROM findable`).first<{ id: string }>())!.id, NOW);
    const off = await flushIndex({
      db: shard(), index: at.index, deployment: "one", now: NOW,
      collections: () => [{ ...note, searchable: undefined } as CollectionSpec],
      read: async () => null,
    });
    expect(off.removed).toBe(1);
    expect(at.sent.size).toBe(0);
  });

  /*
    ⚠️ A REFUSAL IS TERMINAL AND SAYS WHY. Retrying an item the index will never
    take is a pass that never drains; a refusal with no reason is a record
    nobody can work out how to fix.
  */
  it("records a refusal with its reason and stops retrying it", async () => {
    await write({ title: "One", body: "b" });
    const out = await flush(refusing("file too large"));
    expect(out.failed).toBe(1);

    const bad = await itemsFailed(shard());
    expect(bad[0]!.detail).toBe("file too large");
    /* ⚠️ `failed` is not due, so the next pass leaves it alone. */
    expect(await itemsDue(shard())).toHaveLength(0);
  });
});

/* --------------------------------------------------------------- the erasure --- */

describe("what erasure does to the index", () => {
  /*
    ⚠️ MARKED BY `erase` ITSELF, which is the whole reason it lives there. Every
    caller of erasure gets this with nothing wired; a version that left it to the
    four call sites would report a clean erasure with the text still findable.
  */
  it("marks every one of a workspace's records gone", async () => {
    await write({ title: "One", body: "b" });
    await write({ title: "Two", body: "c" });
    const at = spy();
    await flush(at.index);

    await erase(shard(), [note], "tenant", TENANT);
    const due = await itemsDue(shard());
    expect(due).toHaveLength(2);
    expect(due.every((i) => i.state === "gone")).toBe(true);

    await flush(at.index);
    expect(at.sent.size).toBe(0);
    expect(await itemsDue(shard())).toHaveLength(0);
  });

  /*
    ⚠️ AND IT MARKS RATHER THAN DELETING. A cascade that dropped these rows would
    remove the only pointer at the remote item — the records would be erased from
    the database and stay in the index for ever.
  */
  it("does not delete the rows, because they are the only handle on the item", async () => {
    await write({ title: "One", body: "b" });
    await erase(shard(), [note], "tenant", TENANT);
    expect((await indexState(shard())).gone).toBe(1);
  });

  /** ⚠️ Another workspace's rows are not this workspace's erasure. */
  it("leaves another workspace's records alone", async () => {
    await write({ title: "One", body: "b" });
    await noteWritten(shard(), note, APP, "ten_other", "rec_other", NOW);
    await erase(shard(), [note], "tenant", TENANT);
    const due = await itemsDue(shard());
    expect(due.find((i) => i.scope === "ten_other")!.state).toBe("pending");
  });
});

/* ---------------------------------------------------------------- the query --- */

describe("asking the index", () => {
  const answering = (chunks: unknown[]) => {
    const asked: unknown[] = [];
    const searcher: Searcher = {
      get: () => ({ async search(input) { asked.push(input); return { chunks } as never; } }),
    };
    return { searcher, asked };
  };

  /*
    ⚠️ THE FOLDER FILTER IS THE ROW-LEVEL SCOPE OF THE WHOLE RETRIEVAL PATH. It
    is the one bound between a query and every other workspace's records, and it
    is written here rather than by a caller for exactly that reason.
  */
  it("always sends the caller's own folder as the filter", async () => {
    const at = answering([]);
    await searchIn(at.searcher, "one", APP, note, TENANT, "anything");
    const sent = at.asked[0] as { ai_search_options: { retrieval: { filters: unknown } } };
    expect(sent.ai_search_options.retrieval.filters)
      .toEqual({ type: "eq", key: "folder", value: folderFor(TENANT, note.id) });
  });

  /*
    ⚠️ CHUNKS ARE PER PASSAGE AND A RESULT IS PER RECORD. A long note matches
    several times and would otherwise fill the list on its own.
  */
  it("answers once per record, however many passages matched", async () => {
    const key = itemKeyFor(TENANT, note.id, "findable_1");
    const at = answering([
      { score: 0.9, text: "first", item: { key } },
      { score: 0.7, text: "second", item: { key } },
    ]);
    const found = await searchIn(at.searcher, "one", APP, note, TENANT, "thing");
    expect(found).toHaveLength(1);
    expect((found as readonly { recordId: string }[])[0]!.recordId).toBe("findable_1");
  });

  /* ⚠️ Absent is an answer a screen can say out loud, not a failure. */
  it("says there is no index rather than pretending nothing matched", async () => {
    expect(await searchIn(null, "one", APP, note, TENANT, "thing")).toBe("no_index");
  });

  it("asks nothing at all for an empty query", async () => {
    const at = answering([]);
    expect(await searchIn(at.searcher, "one", APP, note, TENANT, "   ")).toEqual([]);
    expect(at.asked).toHaveLength(0);
  });

  it("reports a failure rather than answering empty", async () => {
    const searcher: Searcher = {
      get: () => ({ async search() { throw new Error("down"); } }),
    };
    expect(await searchIn(searcher, "one", APP, note, TENANT, "thing")).toBe("failed");
  });
});

/* ----------------------------------------------------------------- naming --- */

describe("how things are named", () => {
  /*
    ⚠️ THE DEPLOYMENT IS IN THE INSTANCE NAME. One Cloudflare account can carry
    staging and live, and an instance named for the app alone would be one index
    holding both — so a staging query would return production records.
  */
  it("puts the deployment in the instance name", () => {
    expect(instanceFor("one", "beacon")).toBe("one-beacon");
    expect(instanceFor("staging", "beacon")).not.toBe(instanceFor("one", "beacon"));
  });

  /** ⚠️ The trailing slash is load-bearing: `a/b` would also match `a/bc`. */
  it("ends a folder with a separator", () => {
    expect(folderFor("ten_a", "note")).toBe("ten_a/note/");
    expect(folderFor("ten_a", "note").endsWith("/")).toBe(true);
  });

  it("reads the record back out of the key", () => {
    expect(recordIdIn(itemKeyFor("ten_a", "note", "note_7"))).toBe("note_7");
    expect(recordIdIn("")).toBeNull();
  });
});
