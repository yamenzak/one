/**
 * THE MEDIA ROUTES, against a fake R2 and a real Hono app.
 *
 * Deliberately here rather than in an app's integration suite, for two reasons.
 *
 * The rules are the PACKAGE's — the closed `purpose` set, the SVG refusal, the
 * public-prefix gate, the tenant isolation on read — so this is where a
 * regression should be caught, once, for every app rather than in whichever one
 * happened to write a test.
 *
 * And `@cloudflare/vitest-pool-workers` cannot currently snapshot an isolated
 * storage frame containing R2 objects: its teardown asserts on SQLite's `-shm`
 * side-file and fails the run even when every assertion passed. Driving the
 * routes directly through `app.request()` needs no pool at all, and tests the
 * same handlers the worker mounts.
 */

import { describe, expect, it } from "vitest";
import { mediaRoutes } from "../src/routes.js";

/** Just enough R2 to satisfy the read path. */
class FakeBucket {
  objects = new Map<string, { body: string; contentType: string }>();
  async get(key: string) {
    const o = this.objects.get(key);
    return o ? { body: o.body, httpMetadata: { contentType: o.contentType } } : null;
  }
}

interface Opts {
  role?: string;
  tenantId?: string;
  signedIn?: boolean;
}

function makeApp(bucket: FakeBucket, opts: Opts = {}) {
  const written: { key: string; purpose: string; subjectId: string | null }[] = [];
  const role = opts.role ?? "owner";
  const tenantId = opts.tenantId ?? "t1";
  const app = mediaRoutes({
    actorOf: () => (opts.signedIn === false ? null : { tenantId, userId: "u1" }),
    purposes: new Set(["evidence", "document", "misc"]),
    publicPurpose: "brand",
    canWritePublic: () => role === "owner",
    canReadUsage: () => role === "owner",
    putMedia: async (_c, input) => {
      written.push({ key: input.key, purpose: input.purpose, subjectId: input.subjectId });
      bucket.objects.set(input.key, { body: "x", contentType: input.contentType });
    },
    storageUsage: async () => ({ usedBytes: 1_048_576, limitBytes: 10_485_760 }),
    isQuotaError: (e): e is { usedBytes: number; limitBytes: number } => e instanceof QuotaError,
  });
  const env = { DB: {} as D1Database, MEDIA: bucket as unknown as R2Bucket };
  const req = (path: string, init?: RequestInit) => app.request(path, init, env);
  return { req, written };
}

class QuotaError extends Error {
  constructor(public usedBytes: number, public limitBytes: number) {
    super("quota");
  }
}

function form(purpose: string, type = "image/png", name = "printout.png", extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array([137, 80, 78, 71])], { type }), name);
  fd.set("purpose", purpose);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

const post = (fd: FormData): RequestInit => ({ method: "POST", body: fd });

describe("`purpose` is a path segment, so the set is closed", () => {
  it("accepts a declared purpose and keys it under the tenant", async () => {
    const { req, written } = makeApp(new FakeBucket());
    const res = await req("/media/upload", post(form("evidence")));
    expect(res.status).toBe(201);
    const { key } = (await res.json()) as { key: string };
    expect(key.startsWith("t/t1/evidence/")).toBe(true);
    expect(written[0]!.purpose).toBe("evidence");
  });

  it("refuses a forged path", async () => {
    // Unvalidated, this wrote into ANOTHER subject's key namespace on the
    // tenant's quota. It is the first of the two live bugs in the header.
    const { req, written } = makeApp(new FakeBucket());
    expect((await req("/media/upload", post(form("../../elsewhere")))).status).toBe(400);
    expect((await req("/media/upload", post(form("c/victim/progress")))).status).toBe(400);
    expect(written).toHaveLength(0);
  });

  it("refuses an unknown purpose outright", async () => {
    const { req } = makeApp(new FakeBucket());
    expect((await req("/media/upload", post(form("anything")))).status).toBe(400);
  });
});

describe("the public prefix", () => {
  it("is owner-only to WRITE", async () => {
    // The second live bug: unguarded, this is free hosting of any file on the
    // tenant's own white-label domain, served with `cache-control: public`.
    const staff = makeApp(new FakeBucket(), { role: "staff" });
    expect((await staff.req("/media/upload", post(form("brand")))).status).toBe(403);
    const owner = makeApp(new FakeBucket(), { role: "owner" });
    expect((await owner.req("/media/upload", post(form("brand")))).status).toBe(201);
  });

  it("is readable with NO session, and cached publicly", async () => {
    const bucket = new FakeBucket();
    const { req } = makeApp(bucket, { role: "owner" });
    const { key } = (await (await req("/media/upload", post(form("brand")))).json()) as { key: string };

    const anon = makeApp(bucket, { signedIn: false });
    const res = await anon.req(`/media/${key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
  });
});

describe("what may be uploaded", () => {
  it("refuses an SVG, which would be stored XSS", async () => {
    // Served same-origin, an SVG can carry <script> and runs in the app's origin.
    const { req } = makeApp(new FakeBucket());
    expect((await req("/media/upload", post(form("evidence", "image/svg+xml", "x.svg")))).status).toBe(415);
  });

  it("refuses a type that is not on the list at all", async () => {
    const { req } = makeApp(new FakeBucket());
    expect((await req("/media/upload", post(form("evidence", "text/html", "x.html")))).status).toBe(415);
  });

  it("refuses a subjectId when the app declares no subject media", async () => {
    // Without a `subjectAccess` dep there is no scope check to run, so honouring
    // the field would key an object under an unchecked id.
    const { req } = makeApp(new FakeBucket());
    expect((await req("/media/upload", post(form("evidence", "image/png", "p.png", { subjectId: "s1" })))).status).toBe(400);
  });
});

describe("reading", () => {
  it("refuses another tenant's key to a signed-in caller", async () => {
    const bucket = new FakeBucket();
    const a = makeApp(bucket, { tenantId: "t1" });
    const { key } = (await (await a.req("/media/upload", post(form("evidence")))).json()) as { key: string };

    const b = makeApp(bucket, { tenantId: "t2" });
    expect((await b.req(`/media/${key}`)).status).toBe(403);
    // …and the owning tenant still reads it.
    expect((await a.req(`/media/${key}`)).status).toBe(200);
  });

  it("turns away an anonymous caller on a private key", async () => {
    const bucket = new FakeBucket();
    const a = makeApp(bucket);
    const { key } = (await (await a.req("/media/upload", post(form("evidence")))).json()) as { key: string };
    const anon = makeApp(bucket, { signedIn: false });
    expect((await anon.req(`/media/${key}`)).status).toBe(401);
  });

  it("hardens the response: nosniff, a sandbox CSP, and attachment for non-rasters", async () => {
    const bucket = new FakeBucket();
    const { req } = makeApp(bucket);
    const { key } = (await (await req("/media/upload", post(form("document", "application/pdf", "d.pdf")))).json()) as { key: string };
    const res = await req(`/media/${key}`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    // A pdf is not inline-safe: force the download so it cannot execute as a
    // document in our origin.
    expect(res.headers.get("content-disposition")).toBe("attachment");
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("serves a raster inline", async () => {
    const bucket = new FakeBucket();
    const { req } = makeApp(bucket);
    const { key } = (await (await req("/media/upload", post(form("evidence")))).json()) as { key: string };
    const res = await req(`/media/${key}`);
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("404s a key nothing wrote", async () => {
    const { req } = makeApp(new FakeBucket());
    expect((await req("/media/t/t1/evidence/nope.png")).status).toBe(404);
  });
});

describe("the storage meter", () => {
  it("reports used, limit and a percentage", async () => {
    const { req } = makeApp(new FakeBucket(), { role: "owner" });
    const res = await req("/storage-usage");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ usedMb: 1, limitMb: 10, unlimited: false, pct: 10 });
  });

  it("is gated — it reports a PLAN ceiling, not a fact about your own files", async () => {
    const { req } = makeApp(new FakeBucket(), { role: "staff" });
    expect((await req("/storage-usage")).status).toBe(403);
  });
});
