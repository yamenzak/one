/**
 * The STATION HANDLE — the one credential string Scena still mints.
 *
 * This was `username.test.ts`, covering the handle a staff member typed to sign
 * in. Staff are invited by email now (see `member-routes.ts`), and the only
 * remaining handle-holder is a board STATION: a shared device at a counter whose
 * synthetic address is `<handle>@bd.scena`.
 *
 * `normalizeUsername` went with the sign-in form it validated. What is left is
 * the generator, and the interesting property is not randomness — it is the
 * ALPHABET, because this string is read aloud across a reception desk.
 */

import { describe, it, expect } from "vitest";
import { randomHandle } from "../src/members.js";
import { STATION_DOMAIN } from "../src/auth.js";

describe("the station handle", () => {
  it("is six unambiguous lowercase characters", () => {
    const h = randomHandle();
    expect(h).toHaveLength(6);
    // No 0/o and no 1/l: the two pairs that get heard wrong when a code is
    // spoken, which is exactly how a station credential is delivered.
    expect(h).toMatch(/^[a-z2-9]{6}$/);
    expect(h).not.toMatch(/[01ol]/);
  });

  it("widens on request, for the collision fallback", () => {
    expect(randomHandle(9)).toHaveLength(9);
  });

  it("does not repeat itself in practice", () => {
    const set = new Set(Array.from({ length: 200 }, () => randomHandle()));
    expect(set.size).toBeGreaterThan(190);
  });
});

describe("the station domain", () => {
  it("is NON-ROUTABLE, which is the whole safety argument", () => {
    // `@4dl/auth` allows a password only for addresses under this suffix. A
    // routable one (`.com`, or anything with an MX record) would mean a real
    // person had been issued a password on a platform that promises nobody is.
    expect(STATION_DOMAIN).toBe("@bd.scena");
    expect(STATION_DOMAIN.startsWith("@")).toBe(true);
  });
});
