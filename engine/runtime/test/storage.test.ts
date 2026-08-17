/**
 * FILES — and the one invariant that is silent in both directions.
 *
 * ⚠️ EVERY TEST HERE IS ABOUT THE ROW AND THE OBJECT AGREEING. Neither half
 * failing throws: a row without its object is a broken image, an object without
 * its row is somebody's photograph left in a bucket after their account was
 * erased — invisible to every check, for ever, and visible only on a bill.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { applySchema } from "../src/schema.js";
import type { Db } from "../src/sql.js";
import { MEDIA_SCHEMA, eraseObjects, mediaFor, mediaOf, objectKey, putMedia, type Bucket } from "../src/storage.js";

const db = () => env.SHARD_EU_1 as unknown as Db;

/** A bucket that remembers, so what survived an erasure is answerable. */
function bucket() {
  const held = new Map<string, ArrayBuffer>();
  const it: Bucket = {
    async put(key, value) { held.set(key, value as ArrayBuffer); return {}; },
    async get(key) {
      const found = held.get(key);
      return found ? { body: new ReadableStream(), size: found.byteLength } : null;
    },
    async delete(keys) { for (const k of [keys].flat()) held.delete(k); },
  };
  return { it, keys: () => [...held.keys()] };
}

const bytes = (n: number) => new ArrayBuffer(n);

describe("a file, and the row that knows where it is", () => {
  beforeEach(async () => { await applySchema(db(), [MEDIA_SCHEMA]); });

  it("writes the object and the row together, under the workspace's own prefix", async () => {
    const b = bucket();
    const out = await putMedia(db(), b.it, {
      tenantId: "ten_a" as never, subjectId: "acc_1" as never,
      purpose: "note-cover", body: bytes(8), contentType: "image/png",
    });
    if (typeof out === "string") throw new Error(out);

    expect(b.keys()).toEqual([objectKey("ten_a" as never, "note-cover", out.id)]);
    /* ⚠️ THE PREFIX IS THE ISOLATION. A key a caller could choose is a caller
       who can write into somebody else's workspace, and the ledger row would
       look perfectly ordinary. */
    expect(out.objectKey.startsWith("ten_a/")).toBe(true);
    expect(await mediaFor(db(), "ten_a" as never, out.id)).toMatchObject({ bytes: 8 });
  });

  /* ⚠️ THE WORKSPACE IS PART OF THE LOOKUP, NOT A CHECK AFTER IT. Without it,
     any file on the deployment is served to anybody who can guess an id. */
  it("will not hand a file to another workspace", async () => {
    const b = bucket();
    const out = await putMedia(db(), b.it, {
      tenantId: "ten_a" as never, purpose: "note-cover", body: bytes(4),
    });
    if (typeof out === "string") throw new Error(out);
    expect(await mediaFor(db(), "ten_b" as never, out.id)).toBeNull();
    expect(await mediaOf(db(), "ten_b" as never)).toEqual([]);
  });

  /*
    ⚠️ THE ERASURE TAKES THE OBJECTS, AND THIS IS THE TEST THAT WOULD HAVE
    CAUGHT THE ORIGINAL BUG. Deleting the rows alone passes every other
    assertion in this file: the ledger is empty, the workspace reports erased,
    and every file is still in the bucket.
  */
  it("takes a workspace's objects, not only its rows", async () => {
    const b = bucket();
    for (const n of [1, 2, 3]) {
      await putMedia(db(), b.it, {
        tenantId: (n === 3 ? "ten_b" : "ten_a") as never,
        purpose: "note-cover", body: bytes(n),
      });
    }
    expect(b.keys()).toHaveLength(3);

    const gone = await eraseObjects(db(), b.it, { tenantId: "ten_a" as never });
    expect(gone).toBe(2);
    /* ⚠️ The other workspace's file is untouched — an erasure that took the
       whole bucket would pass a test asserting only that ours went. */
    expect(b.keys()).toHaveLength(1);
    expect(b.keys()[0]?.startsWith("ten_b/")).toBe(true);
  });

  /*
    ⚠️ AND A PERSON'S OWN FILES GO WITH THEM, WITHOUT TAKING THE WORKSPACE'S. A
    file uploaded against somebody's own record is theirs; one in the shared
    library is not, and only `subject_id` tells the two apart.
  */
  it("takes one person's files and leaves the workspace's", async () => {
    const b = bucket();
    await putMedia(db(), b.it, {
      tenantId: "ten_a" as never, subjectId: "acc_1" as never,
      purpose: "note-cover", body: bytes(1),
    });
    await putMedia(db(), b.it, {
      tenantId: "ten_a" as never, subjectId: null,
      purpose: "note-cover", body: bytes(2),
    });

    expect(await eraseObjects(db(), b.it, { subjectId: "acc_1" as never })).toBe(1);
    expect(b.keys()).toHaveLength(1);
  });

  /* ⚠️ NO BUCKET IS A REFUSAL, NOT A CRASH — a deployment whose bucket the
     reconciler has not made live yet stores no files, and has to survive it. */
  it("refuses rather than throwing when there is nowhere to put anything", async () => {
    expect(await putMedia(db(), null, {
      tenantId: "ten_a" as never, purpose: "note-cover", body: bytes(4),
    })).toBe("no_bucket");
    expect(await eraseObjects(db(), null, { tenantId: "ten_a" as never })).toBe(0);
  });
});
