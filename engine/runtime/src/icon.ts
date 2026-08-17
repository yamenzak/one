/**
 * A WORKSPACE'S OWN ICON — the one they upload, and where it has to live.
 *
 * ⚠️ IT IS IN THE DIRECTORY, NOT IN A SHARD AND NOT IN R2, and that is forced by
 * WHO READS IT. A favicon and a web manifest are fetched with no session, often
 * with no cookie jar at all, before any workspace has been located — so an icon
 * held beside the records would mean locating a database to answer a request for
 * a picture, on the coldest path the product has. An icon held in R2 would mean
 * resolving a per-jurisdiction bucket on that same path, which is a second
 * addressing problem in the same place.
 *
 * ⚠️ AND THE BYTES ARE IN THE ROW, so the object cannot orphan. `storage.ts`
 * exists because a row without its object is silent in both directions; here
 * there is no second thing to lose. Erasure is one DELETE in the same database
 * as the workspace record.
 *
 * ⚠️ THE PRICE IS A CAP, AND IT IS THE RIGHT PRICE. `MOST_BYTES` is what stops
 * this becoming a file store with no ledger — an icon is a small square, and a
 * business that needs more than this is uploading a photograph by mistake.
 *
 * ⚠️ PNG ONLY, AND THE REFUSED FORMAT IS SVG ON PURPOSE. An SVG is a document:
 * it can carry script, and it would be served from the workspace's OWN origin,
 * which is where their staff are signed in. Accepting one trades a nicer logo
 * for a cross-site scripting vector against the people the workspace employs.
 * A raster cannot execute.
 *
 * ⚠️ ONLY A COMMERCIAL WORKSPACE MAY HAVE ONE (`mayBrand`), CHECKED HERE AND NOT
 * ONLY AT THE SCREEN. A personal workspace is not trading under anybody's name,
 * so it wears ours — and a hidden control is not a refused write.
 */

import type { Kind, TenantId } from "@engine/kernel";
import { mayBrand } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

/**
 * ⚠️ ITS OWN TABLE, NEVER A COLUMN ON `tenant_branding`. That row is read by
 * `brandingOf` on every cold start of every branded workspace's sign-in page;
 * putting a hundred kilobytes of picture in it would put that picture on the
 * wire for a screen that never shows it.
 *
 * ⚠️ BASE64 TEXT RATHER THAN A BLOB, because this row travels through JSON in
 * the export and the tests, and a column whose type depends on the driver is a
 * column that works in one of those and not the other. The 33% is bounded by
 * `MOST_BYTES` and is the cheapest part of this decision.
 */
export const ICON_SCHEMA: SchemaModule = {
  id: "icon",
  statements: [
    `CREATE TABLE IF NOT EXISTS tenant_icon (tenant_id TEXT PRIMARY KEY, png_b64 TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL, at TEXT NOT NULL, by TEXT);`,
  ],
};

/* ------------------------------------------------------------------ rules --- */

/** ⚠️ A square icon at 512 is under 30 kB drawn; this is generous, not tight. */
export const MOST_BYTES = 128 * 1024;

/**
 * ⚠️ 256 IS THE FLOOR BECAUSE 192 AND 180 ARE BOTH ASKED FOR. A smaller upload
 * is upscaled by the platform onto a home screen, where it is the largest the
 * mark is ever seen and the blur is the first thing anybody notices.
 */
export const LEAST_SIDE = 256;
export const MOST_SIDE = 1024;

export type IconRefusal =
  | "not_commercial" | "too_big" | "empty" | "not_a_png" | "not_square" | "wrong_size";

export interface IconRow {
  /* ⚠️ `<ArrayBuffer>` because these bytes become a `Response` body, and the
     default `ArrayBufferLike` might be shared memory, which is not one. */
  readonly png: Uint8Array<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

/* -------------------------------------------------------------- the bytes --- */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * WHAT THIS FILE ACTUALLY IS, READ OUT OF IT.
 *
 * ⚠️ THE CONTENT TYPE A BROWSER SENDS IS A CLAIM, NOT A FACT. Trusting it means
 * a workspace can store anything under a name we then serve as `image/png` from
 * their own origin. The signature and the header are the file itself.
 *
 * ⚠️ AND `IHDR` IS ALWAYS FIRST AND ALWAYS AT BYTE 16 — the format says so — so
 * the dimensions are a fixed read rather than a chunk walk. A file whose IHDR is
 * elsewhere is not a PNG, which is the answer we want anyway.
 */
export function readPng(body: Uint8Array): { width: number; height: number } | null {
  if (body.length < 24) return null;
  for (let i = 0; i < SIGNATURE.length; i++) if (body[i] !== SIGNATURE[i]) return null;
  if (String.fromCharCode(body[12]!, body[13]!, body[14]!, body[15]!) !== "IHDR") return null;
  const at = (i: number) => (body[i]! << 24) | (body[i + 1]! << 16) | (body[i + 2]! << 8) | body[i + 3]!;
  const width = at(16) >>> 0;
  const height = at(20) >>> 0;
  return width && height ? { width, height } : null;
}

/* ------------------------------------------------------------------ store --- */

/**
 * ⚠️ EVERY REFUSAL IS ITS OWN, because each one is a different thing to do next:
 * become a business, export a smaller file, export a PNG, crop it square, or
 * export it larger. "Invalid" is a screen somebody has to guess at.
 */
export async function setIcon(
  db: Db,
  tenantId: TenantId,
  kind: Kind,
  body: Uint8Array,
  by: string | null = null,
  now = new Date(),
): Promise<IconRow | IconRefusal> {
  if (!mayBrand(kind)) return "not_commercial";
  if (!body.length) return "empty";
  if (body.length > MOST_BYTES) return "too_big";

  const png = readPng(body);
  if (!png) return "not_a_png";
  if (png.width !== png.height) return "not_square";
  if (png.width < LEAST_SIDE || png.width > MOST_SIDE) return "wrong_size";

  await db.prepare(
    `INSERT INTO tenant_icon (tenant_id, png_b64, width, height, bytes, at, by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET png_b64 = excluded.png_b64,
       width = excluded.width, height = excluded.height, bytes = excluded.bytes,
       at = excluded.at, by = excluded.by`)
    .bind(tenantId, toBase64(body), png.width, png.height, body.length, now.toISOString(), by)
    .run();

  return { png: asOwn(body), width: png.width, height: png.height, bytes: body.length };
}

/**
 * ⚠️ THE KIND IS PASSED IN AND CHECKED ON THE READ TOO, and it is not belt and
 * braces. A workspace that uploaded an icon while commercial and then had its
 * kind changed would otherwise keep serving it — a business's mark on a
 * workspace that is no longer that business.
 */
export async function iconOf(
  db: Db, tenantId: TenantId, kind: Kind,
): Promise<IconRow | null> {
  if (!mayBrand(kind)) return null;
  try {
    const row = await db.prepare(
      `SELECT png_b64, width, height, bytes FROM tenant_icon WHERE tenant_id = ?`)
      .bind(tenantId).first<{ png_b64: string; width: number; height: number; bytes: number }>();
    if (!row) return null;
    return {
      png: fromBase64(row.png_b64),
      width: Number(row.width), height: Number(row.height), bytes: Number(row.bytes),
    };
  } catch {
    /* ⚠️ FAILS TO "NO ICON", NEVER TO A THROW — the same rule `brandingOf`
       follows and for the same reason: a deployment that has not applied this
       module must lose a picture, not its manifest route. */
    return null;
  }
}

/** ⚠️ Whether there is one, without moving the bytes — the editor asks this. */
export async function hasIcon(db: Db, tenantId: TenantId): Promise<
  { readonly width: number; readonly bytes: number } | null
> {
  try {
    const row = await db.prepare(`SELECT width, bytes FROM tenant_icon WHERE tenant_id = ?`)
      .bind(tenantId).first<{ width: number; bytes: number }>();
    return row ? { width: Number(row.width), bytes: Number(row.bytes) } : null;
  } catch {
    return null;
  }
}

/**
 * ⚠️ ERASED WITH THE WORKSPACE, AND SAID OUT LOUD HERE for the reason
 * `forgetBranding` is: this table is in the DIRECTORY, so the cascade derived
 * from every app's collections cannot see it. A logo left behind after a
 * business closed is their mark still on our infrastructure.
 */
export async function forgetIcon(db: Db, tenantId: TenantId): Promise<void> {
  await db.prepare(`DELETE FROM tenant_icon WHERE tenant_id = ?`).bind(tenantId).run();
}

/* ⚠️ The caller's view may be over anything; the row we hand back is ours. */
const asOwn = (b: Uint8Array): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(b.length));
  out.set(b);
  return out;
};

/* ----------------------------------------------------------------- base64 --- */

/* ⚠️ CHUNKED, because `String.fromCharCode(...bytes)` on a hundred kilobytes is
   a hundred thousand arguments and blows the stack — at a size that depends on
   the runtime, so it works in the tests and fails on the biggest real upload. */
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
