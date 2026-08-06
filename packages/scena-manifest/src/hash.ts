/**
 * Canonical JSON + content hashing (BLUEPRINT §5, §29.2).
 *
 * A manifest is content-addressed: the same *logical* manifest must always
 * yield the same hash, regardless of key insertion order, so republishing an
 * unchanged channel produces an identical hash (no needless re-download). We
 * therefore serialize with stable key ordering before hashing.
 *
 * Uses Web Crypto (`crypto.subtle`), available identically in Workers, browsers
 * and Node ≥20 — so the compiler and the player compute the same hash.
 */

/**
 * Deterministic JSON: object keys sorted recursively. Arrays keep their order
 * (order is meaningful for playout). Undefined values are dropped, matching
 * JSON.stringify semantics.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

const encoder = new TextEncoder();

/** SHA-256 of raw bytes → lowercase hex. The primitive under all addressing. */
export async function contentHash(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Copy into a fresh, ArrayBuffer-backed view. Cheap for manifest-sized data,
  // and it keeps the type an unambiguous `ArrayBuffer` (not the ArrayBufferLike
  // / SharedArrayBuffer union) so it satisfies BufferSource in every runtime.
  const buf = new Uint8Array(src.length);
  buf.set(src);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return toHex(digest);
}

/** Content hash of a value's canonical JSON form. */
export async function hashCanonical(value: unknown): Promise<string> {
  return contentHash(encoder.encode(canonicalize(value)));
}

/**
 * The manifest's content hash. Excludes the `assets` pre-cache table and the
 * `version` counter, which are bookkeeping — two manifests describing the same
 * playout should share a hash even if minted as different versions.
 */
export async function hashManifest(manifest: {
  version?: number;
  assets?: unknown;
  [k: string]: unknown;
}): Promise<string> {
  const { version: _v, assets: _a, ...content } = manifest;
  return hashCanonical(content);
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
