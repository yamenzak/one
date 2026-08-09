/**
 * THE PIECES OF THE CEREMONY, WITHOUT A CEREMONY.
 *
 * The end-to-end path is proved by `@one/hello`. These are the parsers and the
 * conversions underneath it — the places where a subtle bug produces a
 * signature that verifies for the wrong bytes, or one that fails for one user in
 * two hundred and nobody can reproduce it.
 */

import { describe, expect, it } from "vitest";
import { b64u, cborDecode, parseAuthData } from "../src/webauthn.js";

describe("base64url", () => {
  it("round-trips, without padding or the two characters URLs mangle", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    const text = b64u.encode(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect([...b64u.decode(text)]).toEqual([...bytes]);
  });
});

describe("the CBOR subset", () => {
  it("reads the shapes an authenticator emits", () => {
    // {"fmt": "none", "n": 1, "b": h'0102'}
    const bytes = new Uint8Array([0xa3, 0x63, 0x66, 0x6d, 0x74, 0x64, 0x6e, 0x6f, 0x6e, 0x65, 0x61, 0x6e, 0x01, 0x61, 0x62, 0x42, 0x01, 0x02]);
    const map = cborDecode(bytes) as Map<string, unknown>;
    expect(map.get("fmt")).toBe("none");
    expect(map.get("n")).toBe(1);
    expect([...(map.get("b") as Uint8Array)]).toEqual([1, 2]);
  });

  it("reads the negative integers a COSE key is keyed by", () => {
    // {-1: 1, -2: 3} — the curve and coordinate keys.
    const map = cborDecode(new Uint8Array([0xa2, 0x20, 0x01, 0x21, 0x03])) as Map<number, number>;
    expect(map.get(-1)).toBe(1);
    expect(map.get(-2)).toBe(3);
  });

  /*
    ⚠️ REFUSED, NOT GUESSED AT. A decoder that improvises on input it does not
    understand is a decoder an attacker writes the input for.
  */
  it("refuses what it does not implement", () => {
    expect(() => cborDecode(new Uint8Array([0xc0]))).toThrow();  // a tag
    expect(() => cborDecode(new Uint8Array([0x5f]))).toThrow();  // indefinite length
    expect(() => cborDecode(new Uint8Array([]))).toThrow();
  });
});

describe("authenticator data", () => {
  const data = (flags: number, counter: number) => {
    const b = new Uint8Array(37);
    b[32] = flags;
    b[33] = counter >> 24 & 255; b[34] = counter >> 16 & 255; b[35] = counter >> 8 & 255; b[36] = counter & 255;
    return b;
  };

  it("reads the flags that decide whether a human was there", () => {
    expect(parseAuthData(data(0x01, 0)).userPresent).toBe(true);
    expect(parseAuthData(data(0x00, 0)).userPresent).toBe(false);
    expect(parseAuthData(data(0x05, 0)).userVerified).toBe(true);
  });

  /*
    ⚠️ THE COUNTER IS BIG-ENDIAN AND UNSIGNED. Read the other way round, a
    counter of 1 becomes 16,777,216 — which passes every "did it advance" check
    for the life of the credential and then never advances again.
  */
  it("reads the counter big-endian", () => {
    expect(parseAuthData(data(0x01, 1)).counter).toBe(1);
    expect(parseAuthData(data(0x01, 0x01020304)).counter).toBe(0x01020304);
  });

  it("refuses data too short to contain what it claims", () => {
    expect(() => parseAuthData(new Uint8Array(36))).toThrow();
  });
});
