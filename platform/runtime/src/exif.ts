/**
 * WHAT A PHOTOGRAPH CARRIES THAT NOBODY MEANT TO SEND.
 *
 * ⚠️ A PHONE PHOTO CONTAINS GPS COORDINATES, A DEVICE SERIAL, THE OWNER'S NAME
 * AND A TIMESTAMP TO THE SECOND. A client photographs a meal at home and the
 * file knows where they live. A coach shares a progress photo and it carries the
 * model and serial of the phone that took it.
 *
 * ⚠️ AND STRIPPING LATER NEVER FIXES WHAT IS ALREADY STORED. Every copy already
 * taken, every cache, every backup and every link already shared still has it.
 * This runs on the way IN, before the object exists, or it does not run.
 *
 * It removes metadata and nothing else: the pixels are untouched, byte for byte,
 * so there is no re-encode, no quality loss and no format surprise. What it
 * cannot strip it REFUSES TO CLAIM it stripped — see `Stripped.confident`.
 */

/** What happened, so the ledger can record a fact rather than an intention. */
export interface Stripped {
  readonly body: ArrayBuffer;
  /**
   * ⚠️ FALSE MEANS "THIS FORMAT WAS NOT UNDERSTOOD", not "there was nothing to
   * remove". A ledger that recorded `true` for a format nobody parsed would be a
   * written claim that somebody's location was removed when it was not — which
   * is worse than not offering the feature, because it is believed.
   */
  readonly confident: boolean;
  readonly removed: number;
}

const JPEG = 0xff;
const SOS = 0xda;
const EOI = 0xd9;

/**
 * ⚠️ THE SEGMENTS THAT CARRY IDENTITY, and why each one is on the list.
 *
 * `APP1` is Exif — GPS, camera, owner, and the original timestamp — and also
 * XMP, which repeats much of it in XML. `APP2` carries ICC and FlashPix, the
 * second of which has held whole embedded thumbnails of the ORIGINAL image, so a
 * crop that removed somebody from a photo did not remove them from the file.
 * `APP13` is Photoshop's IPTC block: captions, credits, and location by name.
 * `COM` is a free-text comment field that tools fill with whatever they like.
 */
const JPEG_STRIP = new Set([0xe1, 0xe2, 0xed, 0xfe]);

/**
 * ⚠️ THE PNG CHUNKS THAT DO THE SAME, and the check is the lowercase FIRST
 * letter rather than a list of names: in PNG, a lowercase first letter means the
 * chunk is ancillary — safe to drop — and every metadata chunk is ancillary by
 * construction. Naming them individually would miss the next one somebody
 * invents, which is exactly how a metadata stripper goes quietly out of date.
 *
 * `eXIf` is the exception that must be named: it is ancillary and would be
 * caught anyway, but it is the one that holds GPS, so it is written down.
 */
const PNG_KEEP_CRITICAL = /^[A-Z]/;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function stripMetadata(body: ArrayBuffer, contentType: string): Stripped {
  const bytes = new Uint8Array(body);
  if (contentType === "image/jpeg" || contentType === "image/jpg") return stripJpeg(bytes);
  if (contentType === "image/png") return stripPng(bytes);
  /*
    ⚠️ A FORMAT WE DO NOT PARSE PASSES THROUGH AND SAYS SO. The alternative —
    refusing the upload — makes a metadata feature into a format allow-list, and
    the person hitting it has no idea why their file was rejected.
  */
  return { body, confident: false, removed: 0 };
}

function stripJpeg(bytes: Uint8Array): Stripped {
  if (bytes[0] !== JPEG || bytes[1] !== 0xd8) return { body: bytes.buffer as ArrayBuffer, confident: false, removed: 0 };

  const keep: [number, number][] = [[0, 2]];
  let at = 2;
  let removed = 0;

  while (at < bytes.length - 1) {
    if (bytes[at] !== JPEG) return { body: bytes.buffer as ArrayBuffer, confident: false, removed: 0 };
    const marker = bytes[at + 1]!;

    /*
      ⚠️ EVERYTHING FROM THE SCAN ONWARDS IS PIXELS AND IS COPIED VERBATIM. The
      entropy-coded data has no segment structure to walk, so a parser that kept
      going would find marker bytes inside the image and cut it in half.
    */
    if (marker === SOS || marker === EOI) { keep.push([at, bytes.length]); break; }

    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (length < 2) return { body: bytes.buffer as ArrayBuffer, confident: false, removed: 0 };
    const end = at + 2 + length;
    if (end > bytes.length) return { body: bytes.buffer as ArrayBuffer, confident: false, removed: 0 };

    if (JPEG_STRIP.has(marker)) removed += end - at;
    else keep.push([at, end]);
    at = end;
  }

  return { body: splice(bytes, keep), confident: true, removed };
}

function stripPng(bytes: Uint8Array): Stripped {
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return { body: bytes.buffer as ArrayBuffer, confident: false, removed: 0 };
  }

  const keep: [number, number][] = [[0, 8]];
  let at = 8;
  let removed = 0;

  while (at + 8 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0);
    const name = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
    const end = at + 12 + length;
    if (end > bytes.length) return { body: bytes.buffer as ArrayBuffer, confident: false, removed: 0 };

    /*
      ⚠️ CRITICAL CHUNKS ONLY — a capital first letter. Everything ancillary is
      droppable by the format's own definition, which is what makes this cover
      the metadata chunk somebody invents next year rather than the four that
      exist today.
    */
    if (PNG_KEEP_CRITICAL.test(name)) keep.push([at, end]);
    else removed += end - at;

    at = end;
    if (name === "IEND") break;
  }

  return { body: splice(bytes, keep), confident: true, removed };
}

/** The kept ranges, concatenated. The pixels are never touched. */
function splice(bytes: Uint8Array, keep: readonly [number, number][]): ArrayBuffer {
  const size = keep.reduce((n, [from, to]) => n + (to - from), 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const [from, to] of keep) {
    out.set(bytes.subarray(from, to), at);
    at += to - from;
  }
  return out.buffer;
}
