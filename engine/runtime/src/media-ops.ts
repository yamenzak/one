/**
 * UPLOADING, READING AND DELETING A FILE — generated for any app that declares a
 * `media` field, and for no other.
 *
 * ⚠️ AN APP DECLARES A FIELD AND GETS A BUCKET, A ROUTE AND AN ERASURE. That is
 * the whole claim: `needsOf` derives the bucket from the field, the reconciler
 * makes it exist in each jurisdiction, and these three operations are the
 * address. Nothing in a product's own code touches R2.
 *
 * ⚠️ AND AN APP WITH NO MEDIA FIELD GETS NONE OF THEM. Three routes about files,
 * on a product that holds none, answering "no bucket" for ever, is a surface
 * that reads as a broken feature rather than an absent one.
 *
 * ⚠️ THE UPLOAD TAKES A RAW BODY. Base64 in a JSON field is a third more bytes
 * on the wire and holds the whole file twice in a 128 MB isolate — see
 * `readInput`, which hands an operation `input.body` when the content type says
 * it is not JSON.
 */

import type { AppSpec } from "@engine/kernel";
import { PUBLIC } from "@engine/kernel";
import type { Resolved } from "./compose.js";
import type { PlatformCtx } from "./member-ops.js";
import { eraseObjects, mediaFor, mediaOf, putMedia, type Bucket } from "./storage.js";

/**
 * ⚠️ A CEILING IN THE PLATFORM, NOT IN A PRODUCT. A Worker's memory is the real
 * limit and it is the same for every app here, so an app free to set its own
 * would be an app free to set one its isolate cannot survive — and the failure
 * is an out-of-memory kill, which has no error message and no stack.
 */
export const MOST_BYTES = 25 * 1024 * 1024;

export function mediaOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  /* ⚠️ The purposes an app actually declared. A caller-supplied purpose would be
     a caller choosing a directory in somebody's bucket, and the key is built
     from it. */
  const purposes = new Set(app.collections.flatMap((c) =>
    Object.values(c.fields).filter((f) => f.kind === "media").map((f) => f.purpose!)));

  const op = (
    id: string, kind: "read" | "write", summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    permission: PUBLIC,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      /*
        ⚠️ NOT AN AGENT TOOL. A model that can upload from a sentence in a
        document it was asked to summarise is a model that can be asked to, and
        the bytes it writes are billed and stored under somebody's workspace.
      */
      tool: { why: "It writes and reads whatever somebody uploaded." },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: (ctx, input) => run(ctx as PlatformCtx, input),
  });

  const bucket = (ctx: PlatformCtx): Bucket => {
    const held = (ctx as unknown as { bucket?: Bucket | null }).bucket;
    /* ⚠️ REFUSED RATHER THAN THROWN. A deployment whose bucket is not live yet
       is a deployment that stores no files — a state it has to survive. */
    if (!held) ctx.fail("platform.unavailable");
    return held;
  };

  return {
    "media.upload": op("media.upload", "write", "Put a file here", async (ctx, input) => {
      const purpose = String(input.purpose ?? "");
      if (!purposes.has(purpose)) return ctx.fail("platform.invalid");

      const body = input.body;
      if (!(body instanceof ArrayBuffer)) return ctx.fail("platform.invalid");
      if (body.byteLength > MOST_BYTES) {
        return ctx.fail("platform.too_big", { most: Math.floor(MOST_BYTES / 1024 / 1024) });
      }

      const out = await putMedia(ctx.db, bucket(ctx), {
        tenantId: ctx.tenantId as never,
        /*
          ⚠️ WHOSE IT IS, AND IT IS THE UPLOADER. It is what tells a file that
          goes when they leave from one the workspace keeps — and taking it from
          the caller instead would let anybody file an upload under somebody
          else's erasure, or under nobody's.
        */
        subjectId: ctx.accountId as never,
        purpose,
        body,
        contentType: String(input.contentType ?? "application/octet-stream"),
        by: ctx.accountId ?? null,
      }, new Date(ctx.now));

      return typeof out === "string" ? ctx.fail("platform.unavailable") : out;
    }),

    "media.list": op("media.list", "read", "The files here", async (ctx, input) => {
      const purpose = input.purpose ? String(input.purpose) : undefined;
      return { items: await mediaOf(ctx.db, ctx.tenantId as never, purpose) };
    }),

    /*
      ⚠️ IT ANSWERS WITH THE FILE, NOT WITH A LINK TO IT. A signed public URL is a
      second authorisation system — one that keeps working after somebody is
      removed from the workspace, for as long as the signature lasts, and that
      nothing here could revoke. Serving through the same door as everything else
      means the roster answers per request, which is the property the whole
      framework rests on.
    */
    "media.read": op("media.read", "read", "Fetch a file", async (ctx, input) => {
      const row = await mediaFor(ctx.db, ctx.tenantId as never, String(input.id ?? ""));
      if (!row) return ctx.fail("platform.not_found");

      const object = await bucket(ctx).get(row.objectKey);
      /* ⚠️ A ROW WITHOUT ITS OBJECT IS NOT A 404 ON THE ROW. Answering
         "not found" here would send somebody looking for a record that is
         plainly listed; this is our fault and says so. */
      if (!object) return ctx.fail("platform.unavailable");

      return new Response(object.body, {
        headers: {
          "content-type": row.contentType ?? "application/octet-stream",
          "content-length": String(row.bytes),
          /*
            ⚠️ `private`, ALWAYS. This is somebody's file behind a session, and a
            shared cache holding it is that file served to whoever asks next
            through the same proxy.
          */
          "cache-control": "private, max-age=3600",
        },
      });
    }),

    "media.delete": op("media.delete", "write", "Delete a file", async (ctx, input) => {
      const row = await mediaFor(ctx.db, ctx.tenantId as never, String(input.id ?? ""));
      if (!row) return ctx.fail("platform.not_found");

      /* ⚠️ THE OBJECT FIRST — the row is the only thing that knows the key, so
         deleting it first orphans the file for ever. */
      await bucket(ctx).delete(row.objectKey);
      await ctx.db.prepare(`DELETE FROM media WHERE id = ? AND tenant_id = ?`)
        .bind(row.id, ctx.tenantId).run();
      return { id: row.id };
    }),
  };
}

/** ⚠️ Re-exported so the composer's one import line names what it mounts. */
export { eraseObjects };
