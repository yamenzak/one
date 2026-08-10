/**
 * FILES, THROUGH THE REAL WORKER.
 *
 * ⚠️ THE BODY IS RAW BYTES, AND THAT IS THE PART A UNIT TEST CANNOT PROVE.
 * Everything about the file travels in the query string so the body stays
 * exactly what the browser sent — read as text and re-encoded, a photograph
 * comes back the right length, the right type, and corrupt, with nothing
 * anywhere reporting a failure.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const ORIGIN = "https://files.hello.4dl.app";
let member = "";

/** A minimal JPEG carrying an Exif segment, as a phone would send. */
const photo = (payload: number[]): ArrayBuffer => {
  const exif = [0xff, 0xe1, 0x00, payload.length + 2, ...payload];
  return new Uint8Array([0xff, 0xd8, ...exif, 0xff, 0xdb, 0x00, 0x05, 1, 2, 3, 0xff, 0xda, 0x00, 0x02, 9, 9, 9, 0xff, 0xd9]).buffer;
};

const send = async (body: ArrayBuffer, query: string, contentType = "image/jpeg") => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}/api/file.upload?${query}`, {
      method: "POST",
      headers: { "content-type": contentType, cookie: member },
      body,
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const call = async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie: member },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return res;
};

beforeAll(async () => {
  const staff = await signIn("files@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "files" }, staff);
  member = await signIn("files@example.test", ORIGIN);
});

/* --------------------------------------------------------------- upload --- */

describe("uploading", () => {
  it("stores a file and says how much of it survived", async () => {
    const res = await send(photo([1, 2, 3, 4, 5, 6, 7, 8]), "name=progress.jpg&purpose=attachment");
    expect(res.status).toBe(200);
    expect(res.body.stripped).toBe(true);
    expect(res.body.fresh).toBe(true);
    expect(res.body.bytes as unknown as number).toBeGreaterThan(0);
  });

  /*
    ⚠️ THE SAME BYTES AGAIN ARE FREE. Somebody retrying after a dropped
    connection must not be charged for space the first attempt already took.
  */
  it("recognises the same file rather than storing it twice", async () => {
    const again = await send(photo([1, 2, 3, 4, 5, 6, 7, 8]), "name=progress.jpg&purpose=attachment");
    expect(again.body.fresh).toBe(false);
  });

  /*
    ⚠️ A PURPOSE IS A POLICY. Which types it takes is the question a free-form
    string makes unanswerable at the moment somebody is uploading.
  */
  it("refuses a type the purpose does not take", async () => {
    const res = await send(photo([1, 2]), "name=x.pdf&purpose=attachment", "application/pdf");
    expect(res.status).toBe(400);
  });

  it("refuses a purpose the manifest does not declare", async () => {
    const res = await send(photo([1, 2]), "name=x.jpg&purpose=smuggling");
    expect(res.status).toBe(400);
  });

  it("refuses an empty body rather than storing nothing under a name", async () => {
    const res = await send(new ArrayBuffer(0), "name=empty.jpg&purpose=attachment");
    expect(res.status).toBe(400);
  });

  /*
    ⚠️ A CONTENT TYPE ARRIVES WITH PARAMETERS. `image/jpeg; charset=binary` is
    the same type, and comparing the whole header against a declared list refuses
    it the day somebody's client adds one.
  */
  it("reads the type without its parameters", async () => {
    const res = await send(photo([9, 9, 9, 9]), "name=params.jpg&purpose=attachment", "image/jpeg; charset=binary");
    expect(res.status).toBe(200);
  });
});

/* ----------------------------------------------------------------- read --- */

describe("reading", () => {
  /*
    ⚠️ THE BYTES, NOT JSON ABOUT THEM. An envelope means base64 — a third larger,
    unstreamable, and impossible to put in an `<img>` without every consumer
    decoding it by hand.
  */
  it("answers with the file itself, at its own content type", async () => {
    const listed = (await (await call("/api/file.list")).json()) as { files: { id: string }[] };
    const id = listed.files[0]!.id;

    const res = await call(`/api/file.read?id=${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  /*
    ⚠️ PRIVATE. A shared cache holding one workspace's photograph is the one
    place a caching header is a disclosure.
  */
  it("never lets a shared cache keep it", async () => {
    const listed = (await (await call("/api/file.list")).json()) as { files: { id: string }[] };
    const res = await call(`/api/file.read?id=${listed.files[0]!.id}`);
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("refuses a file that is not there", async () => {
    expect((await call("/api/file.read?id=med_nothing")).status).toBe(404);
  });

  /*
    ⚠️ THERE IS NO PUBLIC URL. A signed link is a credential in a string: it
    survives being pasted into a message, a ticket and a browser history, and it
    cannot be revoked without rotating everything.
  */
  it("refuses somebody with no session", async () => {
    const listed = (await (await call("/api/file.list")).json()) as { files: { id: string }[] };
    const res = await worker.fetch(new Request(`${ORIGIN}/api/file.read?id=${listed.files[0]!.id}`), env as never);
    expect(res.status).toBe(403);
  });
});

/* -------------------------------------------------------------- the room --- */

describe("the ceiling", () => {
  it("reports what is used against what the plan allows", async () => {
    const out = (await (await call("/api/file.list")).json()) as { used: number; allowance: number };
    expect(out.used).toBeGreaterThan(0);
    expect(out.allowance).toBe(2_000_000);
  });

  const sized = (n: number): ArrayBuffer => {
    const b = new Uint8Array(new Array(n).fill(0));
    b.set([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x05, 1, 2, 3], 0);
    b.set([0xff, 0xda, 0x00, 0x02], 9);
    b.set([0xff, 0xd9], b.length - 2);
    return b.buffer;
  };

  /*
    ⚠️ TWO CEILINGS, AND THEY REFUSE DIFFERENT THINGS WITH DIFFERENT CODES. Over
    the per-file limit is a 400 — the file is wrong and a smaller one would work.
    Over the workspace's is a 402 — nothing about the file is wrong and the way
    out is deleting something or paying. One code for both produces copy that is
    misleading for whichever case it was not written for.
  */
  it("refuses a single file larger than the purpose allows", async () => {
    const res = await send(sized(4_100_000), "name=enormous.jpg&purpose=attachment");
    expect(res.status).toBe(400);
  });

  it("refuses a file the workspace has no room for, and says it is about room", async () => {
    const res = await send(sized(2_100_000), "name=huge.jpg&purpose=attachment");
    expect(res.status).toBe(402);
    expect(res.body.code).toBe("platform.quota_reached");
  });

  it("has not stored either of them", async () => {
    const out = (await (await call("/api/file.list")).json()) as { files: { name: string }[] };
    expect(out.files.map((f) => f.name)).not.toContain("huge.jpg");
    expect(out.files.map((f) => f.name)).not.toContain("enormous.jpg");
  });
});

/* -------------------------------------------------------------- deleting --- */

describe("deleting", () => {
  it("removes the file and frees the room it took", async () => {
    const before = (await (await call("/api/file.list")).json()) as { files: { id: string }[]; used: number };
    const res = await call("/api/file.delete", { id: before.files[0]!.id });
    expect(res.status).toBe(200);

    const after = (await (await call("/api/file.list")).json()) as { files: unknown[]; used: number };
    expect(after.files.length).toBe(before.files.length - 1);
    expect(after.used).toBeLessThan(before.used);
  });
});
