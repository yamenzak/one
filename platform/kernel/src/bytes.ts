/**
 * BASE64URL — the one encoding both halves of a ceremony have to agree about.
 *
 * Layer 0. Imports nothing.
 *
 * ⚠️ IT IS HERE BECAUSE THERE ARE TWO HALVES AND ONLY ONE ENCODING. A WebAuthn
 * challenge is BYTES; the browser hands them back as bytes; the wire between them
 * is text. The server verifies against what it issued, so the browser's encoder
 * and the server's have to be the same function — and when they are two copies,
 * the day they disagree is not the day somebody notices.
 *
 * ⚠️ AND THE DISAGREEMENT THAT ACTUALLY HAPPENS IS `+` AND `/`. Plain base64 and
 * base64url differ in exactly two of sixty-four characters, so a mismatched pair
 * verifies perfectly for most challenges and fails for the ones that happen to
 * contain a 62 or a 63 — about one in eight. That is not a bug anybody debugs from
 * a report: it is "sign-in is flaky", forever.
 *
 * ⚠️ PADDING IS STRIPPED ON THE WAY OUT AND NOT REQUIRED ON THE WAY IN. The
 * specification says unpadded; `atob` accepts either, so a peer that pads is
 * still read rather than refused.
 */

export const b64u = {
  encode(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(text: string): Uint8Array {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};
