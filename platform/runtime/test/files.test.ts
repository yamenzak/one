/**
 * FILES — the ledger, the ceiling, and what a photograph stops carrying.
 *
 * ⚠️ EVERY FAILURE HERE IS PERMANENT. An object written behind the ledger is
 * invisible to the quota and to erasure forever; metadata not stripped on the
 * way in is in every copy, cache and backup already taken. Neither can be fixed
 * by a later release, which is why the checks are exhaustive rather than
 * representative.
 */

import { describe, expect, it } from "vitest";
import { stripMetadata } from "../src/exif.js";
import { digestOf, forgetMedia, keyFor, listMedia, MEDIA_SCHEMA, mediaRefused, mediaUses, readMedia, storeMedia, UNLIMITED_BYTES, usedBytes, usesOf } from "../src/files.js";
import { allowanceFrom, MAX_FILE_BYTES } from "../src/files-ops.js";
import type { CollectionSpec, Instant, ObjectHandle, SqlHandle } from "@one/kernel";

const AT = "2026-01-10T00:00:00.000Z" as Instant;

/* ------------------------------------------------------------- fixtures --- */

const bytes = (...parts: (number[] | Uint8Array)[]): ArrayBuffer => {
  const flat: number[] = [];
  for (const p of parts) flat.push(...(p instanceof Uint8Array ? [...p] : p));
  return new Uint8Array(flat).buffer;
};

/** A JPEG with a marker segment of `length` payload bytes. */
const segment = (marker: number, payload: number[]): number[] =>
  [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];

const jpeg = (segments: number[][]): ArrayBuffer =>
  bytes([0xff, 0xd8], ...segments, [0xff, 0xda, 0x00, 0x02], [1, 2, 3, 4, 5], [0xff, 0xd9]);

const chunk = (name: string, payload: number[]): number[] => [
  (payload.length >>> 24) & 0xff, (payload.length >>> 16) & 0xff, (payload.length >>> 8) & 0xff, payload.length & 0xff,
  ...[...name].map((c) => c.charCodeAt(0)), ...payload, 0, 0, 0, 0,
];

const png = (chunks: number[][]): ArrayBuffer =>
  bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ...chunks, chunk("IEND", []));

/* ------------------------------------------------------------- stripping --- */

describe("what a photograph stops carrying", () => {
  /*
    ⚠️ A PHONE PHOTO CONTAINS GPS COORDINATES, A DEVICE SERIAL AND THE OWNER'S
    NAME. A client photographs a meal at home and the file knows where they live.
  */
  it("removes the Exif segment from a JPEG and keeps the pixels", () => {
    const withExif = jpeg([segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 9, 9, 9]), segment(0xdb, [1, 2, 3])]);
    const clean = stripMetadata(withExif, "image/jpeg");

    expect(clean.confident).toBe(true);
    expect(clean.removed).toBeGreaterThan(0);
    expect(clean.body.byteLength).toBeLessThan(withExif.byteLength);
    /*
      ⚠️ THE PIXELS ARE UNTOUCHED, BYTE FOR BYTE. Everything from the scan marker
      onwards is copied verbatim — no re-encode, so no quality loss and no format
      surprise, and a stripper that re-compressed would be doing something nobody
      asked for to every photograph a product stores.
    */
    const tail = (b: ArrayBuffer) => [...new Uint8Array(b).slice(-11)];
    expect(tail(clean.body)).toEqual(tail(withExif));
  });

  it("removes XMP, IPTC and the free-text comment as well", () => {
    for (const marker of [0xe1, 0xe2, 0xed, 0xfe]) {
      const one = jpeg([segment(marker, [7, 7, 7, 7, 7, 7, 7, 7])]);
      expect(stripMetadata(one, "image/jpeg").removed, `marker ${marker.toString(16)}`).toBeGreaterThan(0);
    }
  });

  it("leaves the segments an image needs to decode", () => {
    /* Quantisation table and frame header: dropping either is a broken file. */
    const needed = jpeg([segment(0xdb, [1, 2, 3]), segment(0xc0, [4, 5, 6])]);
    const clean = stripMetadata(needed, "image/jpeg");
    expect(clean.removed).toBe(0);
    expect(clean.body.byteLength).toBe(needed.byteLength);
  });

  /*
    ⚠️ ANCILLARY BY THE FORMAT'S OWN DEFINITION — a lowercase first letter. That
    covers the metadata chunk somebody invents next year, which naming the four
    that exist today would not.
  */
  it("drops every ancillary PNG chunk and keeps every critical one", () => {
    const image = png([chunk("IHDR", [1, 2, 3]), chunk("eXIf", [9, 9, 9, 9]), chunk("tEXt", [8, 8]), chunk("IDAT", [4, 5])]);
    const clean = stripMetadata(image, "image/png");
    expect(clean.confident).toBe(true);
    expect(clean.removed).toBeGreaterThan(0);

    const out = [...new Uint8Array(clean.body)].map((b) => String.fromCharCode(b)).join("");
    expect(out).toContain("IHDR");
    expect(out).toContain("IDAT");
    expect(out).not.toContain("eXIf");
    expect(out).not.toContain("tEXt");
  });

  /*
    ⚠️ FALSE MEANS "NOT UNDERSTOOD", NOT "NOTHING TO REMOVE". A ledger recording
    `true` for a format nobody parsed would be a written claim that somebody's
    location was removed when it was not — worse than not offering the feature,
    because it is believed.
  */
  it("says so rather than claiming a format it does not parse", () => {
    for (const [body, type] of [[bytes([1, 2, 3, 4]), "image/heic"], [bytes([1, 2, 3, 4]), "image/jpeg"], [bytes([0x89, 1, 2]), "image/png"]] as const) {
      expect(stripMetadata(body, type).confident, type).toBe(false);
    }
  });

  it("does not truncate a file it refuses to parse", () => {
    const odd = bytes([1, 2, 3, 4, 5]);
    expect(stripMetadata(odd, "image/heic").body.byteLength).toBe(5);
  });
});

/* ---------------------------------------------------------------- store --- */

function world() {
  const rows: Record<string, unknown>[] = [];
  const objects = new Map<string, ArrayBuffer>();
  const db = {
    async first<T>(sql: string, ...p: readonly unknown[]) {
      if (sql.includes("SUM(bytes)")) return { n: rows.reduce((n, r) => n + (r.bytes as number), 0) } as T;
      const found = rows.find((r) => (sql.includes("digest = ?") ? r.digest === p[1] : r.id === p[1]));
      return (found ?? null) as T | null;
    },
    async all<T>() { return rows as T[]; },
    async run(sql: string, ...p: readonly unknown[]) {
      if (sql.startsWith("INSERT INTO media")) {
        rows.push({
          id: p[0], tenant_id: p[1], object_key: p[2], name: p[3], content_type: p[4],
          bytes: p[5], digest: p[6], purpose: p[7], stripped: p[8], actor_id: p[9], at: p[10],
        });
      }
      if (sql.startsWith("DELETE FROM media")) {
        const i = rows.findIndex((r) => r.id === p[1]);
        if (i >= 0) rows.splice(i, 1);
      }
    },
  } as unknown as SqlHandle;

  const store: ObjectHandle = {
    async put(key, body) { objects.set(key, body as ArrayBuffer); return key; },
    async get(key) { return objects.get(key) ?? null; },
    async delete(key) { objects.delete(key); },
  };
  return { db, store, rows, objects };
}

const upload = (w: ReturnType<typeof world>, body: ArrayBuffer, over: Partial<Parameters<typeof storeMedia>[0]> = {}) =>
  storeMedia({
    db: w.db, objects: w.store, tenantId: "t", actorId: "u",
    name: "photo.jpg", contentType: "image/jpeg", body, purpose: "attachment",
    at: AT, maxBytes: 1_000_000, allowance: UNLIMITED_BYTES, ...over,
  });

describe("storing", () => {
  /*
    ⚠️ THERE IS NO WRITE THAT SKIPS THE LEDGER. An object written behind it is
    invisible to the quota and to erasure forever, costs money every month, and
    the only way to find it is to list a bucket by hand.
  */
  it("writes an object and a row together, never one without the other", async () => {
    const w = world();
    const out = await upload(w, jpeg([segment(0xdb, [1, 2, 3])]));
    expect(out.ok).toBe(true);
    expect(w.rows.length).toBe(1);
    expect(w.objects.size).toBe(1);
    if (out.ok) expect(w.objects.has(keyFor("t", out.row.digest))).toBe(true);
  });

  /*
    ⚠️ THE KEY IS DERIVED, NEVER SUPPLIED. A caller-chosen key is a caller-chosen
    path, and a caller-chosen path can start with another workspace's prefix.
  */
  it("prefixes the key with the workspace", async () => {
    expect(keyFor("t_1", "abc")).toBe("t_1/abc");
    const w = world();
    await upload(w, jpeg([segment(0xdb, [1])]));
    expect([...w.objects.keys()][0]!.startsWith("t/")).toBe(true);
  });

  /*
    ⚠️ A RETRY AFTER A DROPPED CONNECTION MUST NOT BE REFUSED FOR SPACE THE FIRST
    ATTEMPT ALREADY TOOK — it is the same object, so it takes no more.
  */
  it("returns the same record for the same bytes and stores one object", async () => {
    const w = world();
    const body = jpeg([segment(0xdb, [1, 2, 3])]);
    const first = await upload(w, body);
    const again = await upload(w, body);
    expect(first.ok && again.ok && first.row.id).toBe(again.ok ? again.row.id : "x");
    expect(again.ok && again.fresh).toBe(false);
    expect(w.rows.length).toBe(1);
    expect(w.objects.size).toBe(1);
  });

  it("counts what is STORED, so stripping happens before the ceiling", async () => {
    const heavy = jpeg([segment(0xe1, new Array(500).fill(7)), segment(0xdb, [1])]);
    const w = world();
    const out = await upload(w, heavy, { maxBytes: 200 });
    expect(out.ok, "the metadata put it over, and the metadata is not stored").toBe(true);
    if (out.ok) expect(out.row.bytes).toBeLessThan(200);
  });

  it("refuses a file over the per-file ceiling", async () => {
    const w = world();
    expect(await upload(w, jpeg([segment(0xdb, new Array(400).fill(1))]), { maxBytes: 50 }))
      .toEqual({ ok: false, why: "too_large" });
    expect(w.objects.size, "nothing may be written for a file that was refused").toBe(0);
  });

  /*
    ⚠️ THE INCOMING FILE IS COUNTED, NOT JUST WHAT IS ALREADY THERE. A ceiling
    checked as "are we full" admits one more file of any size, which for media is
    the difference between a limit and a suggestion.
  */
  it("refuses the file that would CROSS the workspace ceiling, not merely the one after it", async () => {
    const w = world();
    await upload(w, jpeg([segment(0xdb, new Array(80).fill(1))]), { allowance: 200 });
    const used = await usedBytes(w.db, "t");
    expect(used).toBeLessThan(200);

    const over = await upload(w, jpeg([segment(0xdb, new Array(300).fill(2))]), { allowance: 200 });
    expect(over).toEqual({ ok: false, why: "no_room" });
    expect(w.objects.size, "an object written and then refused is the orphan this exists to prevent").toBe(1);
  });

  /*
    ⚠️ READ BACK FROM THE LEDGER, NOT FROM WHAT THE CALL RETURNED. The returned
    record is computed in memory and the stored one is what anybody looks at
    later — so asserting the return value proves the function agrees with itself.
    A mutation that wrote `1` into the column while returning the real answer
    survived until this read the row.
  */
  it("records whether metadata was really removed, not whether it tried", async () => {
    const w = world();
    const parsed = await upload(w, jpeg([segment(0xe1, [1, 2, 3])]));
    if (!parsed.ok) throw new Error("stored");
    expect((await readMedia(w.db, "t", parsed.row.id))?.stripped).toBe(true);

    const unknown = await upload(w, bytes([1, 2, 3, 4, 5, 6]), { contentType: "image/heic" });
    if (!unknown.ok) throw new Error("stored");
    expect((await readMedia(w.db, "t", unknown.row.id))?.stripped).toBe(false);
  });
});

/* --------------------------------------------------------------- reading --- */

describe("reading and forgetting", () => {
  it("finds a stored file and its bytes", async () => {
    const w = world();
    const out = await upload(w, jpeg([segment(0xdb, [1, 2, 3])]));
    if (!out.ok) throw new Error("stored");
    expect((await readMedia(w.db, "t", out.row.id))?.name).toBe("photo.jpg");
    expect((await listMedia(w.db, "t", 10)).length).toBe(1);
  });

  /*
    ⚠️ THE LEDGER ROW GOES FIRST. An orphan in the bucket costs money and a
    cleanup job; a row pointing at nothing is a broken image on somebody's screen
    with no way to tell it from a bug. Costing money is the better failure.
  */
  it("removes the row even when the object delete fails", async () => {
    const w = world();
    const out = await upload(w, jpeg([segment(0xdb, [1])]));
    if (!out.ok) throw new Error("stored");
    const failing = { ...w.store, delete: async () => { throw new Error("bucket is down"); } };

    expect(await forgetMedia(w.db, failing, "t", out.row.id)).toBe(true);
    expect(w.rows.length).toBe(0);
  });

  it("says nothing was there rather than throwing", async () => {
    const w = world();
    expect(await forgetMedia(w.db, w.store, "t", "med_nothing")).toBe(false);
  });
});

/* ---------------------------------------------------------------- shape --- */

describe("the surface", () => {
  it("declares its table so erasure and export find it", () => {
    expect(MEDIA_SCHEMA.scoped?.tenantTables).toEqual(["media"]);
  });

  it("reads an allowance from whatever the plan says, including unlimited", () => {
    expect(allowanceFrom(5_000)).toBe(5_000);
    expect(allowanceFrom(true)).toBe(UNLIMITED_BYTES);
    expect(allowanceFrom(false)).toBe(0);
    expect(allowanceFrom(undefined)).toBe(0);
  });

  it("caps every purpose at the platform's own ceiling", () => {
    expect(MAX_FILE_BYTES).toBeLessThanOrEqual(100 * 1024 * 1024);
  });

  it("hashes the bytes it stores, so the same file is one object", async () => {
    const a = await digestOf(bytes([1, 2, 3]));
    expect(a).toBe(await digestOf(bytes([1, 2, 3])));
    expect(a).not.toBe(await digestOf(bytes([1, 2, 4])));
  });
});

/* ------------------------------------------------------------ references --- */

/**
 * A MEDIA FIELD IS A TEXT COLUMN, and a declared `accept` that nothing checks is
 * a policy that does not exist.
 *
 * ⚠️ THE CHECK READS THE LEDGER, NEVER THE VALUE. The type and the size come
 * from the row the upload wrote after stripping and measuring, which is the only
 * place either is a fact rather than something a caller said.
 */
describe("what a record may point at", () => {
  const ledger = (rows: { id: string; content_type: string; bytes: number }[]): SqlHandle => ({
    async first<T>(_sql: string, _tenant: unknown, id: unknown) {
      return (rows.find((r) => r.id === id) ?? null) as T | null;
    },
  } as unknown as SqlHandle);

  const face = { accept: ["image/jpeg", "image/png"], maxBytes: 4_000_000 };
  const db = ledger([
    { id: "med_photo", content_type: "image/jpeg", bytes: 100_000 },
    { id: "med_film", content_type: "video/mp4", bytes: 8_000_000 },
    { id: "med_huge", content_type: "image/jpeg", bytes: 9_000_000 },
  ]);

  it("accepts a file of the declared type and size", async () => {
    expect(await mediaRefused(db, "t", "med_photo", face)).toBeNull();
  });

  /*
    ⚠️ A DELETED FILE, A TYPO AND ANOTHER WORKSPACE'S ID ARE ONE ANSWER. Telling
    them apart tells whoever is guessing which ids exist, and none of the three
    is one the caller can act on differently.
  */
  it("refuses an id nothing in this workspace names", async () => {
    expect(await mediaRefused(db, "t", "med_ghost", face)).toBe("unknown");
  });

  it("refuses a type the field does not take, however it was uploaded", async () => {
    expect(await mediaRefused(db, "t", "med_film", face)).toBe("type");
  });

  it("refuses a file larger than the field allows", async () => {
    expect(await mediaRefused(db, "t", "med_huge", face)).toBe("size");
  });

  /*
    ⚠️ AND A DATABASE WITH NO LEDGER REFUSES RATHER THAN ADMITS. An app whose
    media table is absent has nothing that could have uploaded the file, so every
    id it is handed is a fabrication.
  */
  it("refuses when there is no ledger to check against", async () => {
    const broken = { async first() { throw new Error("no such table"); } } as unknown as SqlHandle;
    expect(await mediaRefused(broken, "t", "med_photo", face)).toBe("unknown");
  });
});

/* ----------------------------------------------------------------- uses --- */

/**
 * ⚠️ DERIVED FROM THE MANIFEST, NEVER LISTED. A hand-written list of the places
 * a file can be referenced is right on the day it is written and wrong on the
 * day somebody adds a media field — and the failure is silent: the new field is
 * not consulted, so deleting a file breaks it and nothing reports that it did.
 */
describe("where a file is used", () => {
  const spec = (id: string, fields: Record<string, unknown>, platform = false, archive = true) => ({
    id, label: { one: id, many: id },
    scope: platform ? { of: "platform" } : { of: "tenant" },
    onDelete: { on: archive ? "archive" : "purge" },
    retention: { days: null, onTenantClose: "purge" },
    fields,
  }) as unknown as CollectionSpec;

  const media = { kind: "media", accept: ["image/jpeg"], maxBytes: 1 };
  const text = { kind: "text" };

  it("finds every media field on every collection and nothing else", () => {
    const uses = mediaUses([
      spec("client", { name: text, avatar: media }),
      spec("movement", { demo: media }),
      spec("note", { body: text }),
    ]);
    expect(uses.map((u) => `${u.collection}.${u.field}`)).toEqual(["client.avatar", "movement.demo"]);
    expect(uses[0]!.table).toBe("clients");
    expect(uses[0]!.column).toBe("avatar");
  });

  /*
    ⚠️ A PLATFORM-SCOPED COLLECTION HAS NO TENANT COLUMN, so a query written as
    though it did would throw — and the `catch` around the count would read that
    as "nobody points at it", which is the answer that deletes the file.
  */
  it("does not ask a platform-scoped collection about a tenant", () => {
    expect(mediaUses([spec("badge", { icon: media }, true)])[0]!.tenanted).toBe(false);
  });

  const counting = (answers: Record<string, number>): SqlHandle => ({
    async first<T>(sql: string) {
      const table = /FROM (\w+)/.exec(sql)![1]!;
      if (!(table in answers)) throw new Error("no such table");
      return { n: answers[table] } as T;
    },
  } as unknown as SqlHandle);

  it("reports every collection pointing at the file, with how many", async () => {
    const uses = mediaUses([spec("client", { avatar: media }), spec("movement", { demo: media })]);
    expect(await usesOf(counting({ clients: 2, movements: 0 }), "t", "med_x", uses))
      .toEqual([{ collection: "client", field: "avatar", count: 2 }]);
  });

  it("says nothing points at a file nothing points at", async () => {
    const uses = mediaUses([spec("client", { avatar: media })]);
    expect(await usesOf(counting({ clients: 0 }), "t", "med_x", uses)).toEqual([]);
  });

  /*
    ⚠️ ARCHIVED ROWS DO NOT COUNT. A soft-deleted record is on nobody's screen,
    and counting it would hold a workspace's storage against records it has
    already thrown away — permanently, since an archived row never comes back to
    release it.
  */
  it("ignores rows the collection has archived", () => {
    const [archived, purged] = mediaUses([spec("client", { avatar: media }), spec("movement", { demo: media }, false, false)]);
    expect(archived!.live).toContain("deleted_at");
    expect(purged!.live).toBe("");
  });
});
