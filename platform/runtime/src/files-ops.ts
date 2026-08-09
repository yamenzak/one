/**
 * THE FILE SURFACE.
 *
 * ⚠️ THE UPLOAD TAKES RAW BYTES, NOT A JSON FIELD. Base64 in a body is a third
 * larger on the wire, has to be held in memory twice to decode, and makes the
 * request size limit arrive a third early. What matters more: a browser can
 * report progress on a raw body and cannot on one it had to build in memory
 * first — and an upload with no progress is one people cancel and retry.
 *
 * ⚠️ AND THE PURPOSE IS A CLOSED SET THE APP DECLARES. It is a policy — what may
 * be uploaded here, how large, who may read it — and a free-form string makes
 * every one of those questions unanswerable.
 */

import type { AnyOperation, AppSpec, BindingSpec, ObjectHandle, SqlHandle } from "@one/kernel";
import { operation, s, STORAGE_ENTITLEMENT } from "@one/kernel";
import { fetchMedia, forgetMedia, listMedia, storeMedia, UNLIMITED_BYTES, usedBytes } from "./files.js";

/** ⚠️ A symbol, so an app cannot reach the object store by writing a property name. */
export const FILES = Symbol.for("one.runtime.files");

export interface FilesDeps {
  readonly db: SqlHandle;
  readonly objects: ObjectHandle;
  readonly tenantId: string;
  readonly actorId: string;
  /** The exact bytes that arrived, before anything interpreted them. */
  readonly body: ArrayBuffer;
  readonly contentType: string;
  readonly fileName: string;
  readonly purpose: string;
  /** What the workspace's plan allows, resolved once with everything else. */
  readonly allowance: number;
}

export interface FilesCarrier { readonly [FILES]: FilesDeps }

const deps = (ctx: unknown): FilesDeps => (ctx as FilesCarrier)[FILES];

/**
 * ⚠️ A CEILING PER FILE AS WELL AS PER WORKSPACE, and they refuse different
 * things. Without the per-file one, a workspace with room can be handed a single
 * object large enough to exhaust a worker's memory before anything has had a
 * chance to count it.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function fileOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const purposes = Object.keys(app.filePurposes ?? {});
  if (purposes.length === 0) return [];

  const upload = operation({
    id: "file.upload",
    kind: "write",
    summary: "Store a file and return the record that points at it.",
    /*
      ⚠️ THE BODY IS NOT IN THE INPUT SHAPE. It arrives as raw bytes and is
      handed over out of band; what is declared here is everything ABOUT the file
      that a caller may choose, which is what has to be validated.
    */
    input: s.object({ name: s.text({ min: 1, max: 200 }), purpose: s.enum(purposes) }),
    output: s.object({ id: s.text(), bytes: s.number({ integer: true }), stripped: s.bool(), fresh: s.bool() }),
    permission: "file:write",
    /*
      ⚠️ COUNTED AGAINST STORAGE BY THE GENERIC GATE AS WELL. That one refuses a
      workspace already at its ceiling, cheaply, before a byte is read; the
      handler refuses the file that would CROSS it. Two checks because they
      answer different questions, and only the second needs the file.
    */
    quota: STORAGE_ENTITLEMENT,
    idempotency: { mode: "natural", key: "name" },
    audit: (i: { name: string }) => ({ subject: i.name, verb: "upload" }),
    outcome: { message: "Uploaded", tone: "success", invalidates: ["file.list"] },
    fails: ["platform.invalid", "platform.quota_reached"],
    /*
      ⚠️ NOT A TOOL. A model cannot produce bytes over this transport, and an
      operation it can only ever call wrongly is one that wastes a turn and
      teaches it nothing.
    */
    tool: false,
    async handler(ctx, input: { name: string; purpose: string }) {
      const d = deps(ctx);
      const declared = app.filePurposes?.[input.purpose];
      if (!declared) ctx.fail("platform.invalid", { field: "purpose" });

      if (d.body.byteLength === 0) ctx.fail("platform.invalid", { field: "body", reason: "empty" });
      /*
        ⚠️ THE DECLARED TYPES ARE CHECKED AGAINST WHAT ARRIVED, not against the
        file name. An extension is whatever somebody typed; the content type is
        what the browser said, and it is the one the reader will trust.
      */
      if (!declared!.accept.includes(d.contentType)) {
        ctx.fail("platform.invalid", { field: "contentType", reason: `${input.purpose} does not take ${d.contentType}` });
      }

      const stored = await storeMedia({
        db: d.db, objects: d.objects, tenantId: d.tenantId, actorId: d.actorId,
        name: input.name, contentType: d.contentType, body: d.body,
        purpose: input.purpose, at: ctx.now(),
        maxBytes: Math.min(declared!.maxBytes, MAX_FILE_BYTES),
        allowance: d.allowance,
      });

      if (stored.ok === false) {
        if (stored.why === "too_large") ctx.fail("platform.invalid", { field: "body", reason: "too large" });
        ctx.fail("platform.quota_reached", { limit: String(d.allowance), used: String(await usedBytes(d.db, d.tenantId)) });
      }
      const kept = stored as Extract<typeof stored, { ok: true }>;
      return { id: kept.row.id, bytes: kept.row.bytes, stripped: kept.row.stripped, fresh: kept.fresh };
    },
  });

  const list = operation({
    id: "file.list",
    kind: "read",
    summary: "The files this workspace has stored.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 200 })) }),
    output: s.object({ files: s.json(), used: s.number({ integer: true }), allowance: s.number({ integer: true }) }),
    permission: "file:read",
    idempotency: { mode: "none" },
    async handler(ctx, input: { limit?: number }) {
      const d = deps(ctx);
      return {
        files: await listMedia(d.db, d.tenantId, Math.min(input.limit ?? 50, 200)),
        used: await usedBytes(d.db, d.tenantId),
        allowance: d.allowance,
      };
    },
  });

  const read = operation({
    id: "file.read",
    kind: "read",
    summary: "The contents of one file.",
    input: s.object({ id: s.text({ max: 60 }) }),
    /*
      ⚠️ THE BODY DOES NOT TRAVEL THROUGH THE OUTPUT SHAPE. It is bytes with a
      content type, and the runtime answers with them directly — a JSON envelope
      around a photograph is base64 again, with the same costs and none of the
      benefits.
    */
    output: s.object({ id: s.text(), contentType: s.text(), bytes: s.number({ integer: true }) }),
    permission: "file:read",
    idempotency: { mode: "none" },
    fails: ["platform.not_found"],
    tool: false,
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      const found = await fetchMedia(d.db, d.objects, d.tenantId, input.id);
      if (!found) ctx.fail("platform.not_found");
      return { id: found!.row.id, contentType: found!.row.contentType, bytes: found!.row.bytes };
    },
  });

  const forget = operation({
    id: "file.delete",
    kind: "write",
    summary: "Delete one file and the object behind it.",
    input: s.object({ id: s.text({ max: 60 }) }),
    output: s.object({ deleted: s.bool() }),
    permission: "file:write",
    idempotency: { mode: "natural", key: "id" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "delete" }),
    fails: ["platform.not_found"],
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      const gone = await forgetMedia(d.db, d.objects, d.tenantId, input.id);
      if (!gone) ctx.fail("platform.not_found");
      return { deleted: true };
    },
  });

  return [upload, list, read, forget] as unknown as readonly AnyOperation[];
}

/** What a workspace may store, from the entitlement the app declared. */
export const allowanceFrom = (value: number | boolean | undefined): number =>
  typeof value === "number" ? value : value === true ? UNLIMITED_BYTES : 0;
