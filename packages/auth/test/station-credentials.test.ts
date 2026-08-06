/**
 * "PASSWORDLESS" MUST STAY TRUE OF PEOPLE, whatever a station needs.
 *
 * The credential lane exists because a counter device is not a human with an
 * inbox (see `AuthConfig.stationCredentials`). The risk it introduces is drift:
 * once the provider is enabled for one app, nothing at the type level stops a
 * later change issuing a password to a real person — and that failure is
 * invisible, because a password login works exactly as well as a correct one.
 *
 * Asserted against the PURE decision, not a constructed auth instance. The
 * first version of this file built one against a fake D1, which throws "Failed
 * to initialize database adapter" — so it could only assert that construction
 * fails, never what was decided. That is a test that passes for the wrong
 * reason, which is the failure mode this repo cares about most.
 */

import { describe, expect, it } from "vitest";
import { credentialLane, isStationPrincipal } from "../src/better-auth.js";

describe("the station credential lane is opt-in", () => {
  it("is OFF for an app that does not ask for it", () => {
    // Kova and Tessa. The default must be the safe one, because the unsafe one
    // is invisible.
    expect(credentialLane({})).toEqual({ enabled: false });
  });

  it("is ON only when a station domain is declared", () => {
    expect(credentialLane({ stationCredentials: { stationDomain: "@bd.scena" } }).enabled).toBe(true);
  });

  it("CLOSES public sign-up, which the provider opens by default", () => {
    /*
      The hole this assertion exists for, found against a running worker rather
      than reasoned about: enabling the provider also enables Better Auth's own
      `POST /sign-up/email`, so a stranger could register `attacker@example.com`
      with a password of their choosing and sign in with it on the next request
      — a routable address holding a password on a platform that has none.

      `autoSignIn: false` masks it (the sign-up response carries no token), so
      the endpoint reads as though it refused. It did not.
    */
    expect(credentialLane({ stationCredentials: { stationDomain: "@bd.scena" } }).disableSignUp).toBe(true);
  });

  it("does not auto-sign-in on credential creation", () => {
    // Provisioning a station must not hand the ADMIN who created it that
    // station's session.
    expect(credentialLane({ stationCredentials: { stationDomain: "@bd.scena" } }).autoSignIn).toBe(false);
  });

  it("allows the short handle a station credential actually is", () => {
    expect(credentialLane({ stationCredentials: { stationDomain: "@bd.scena" } }).minPasswordLength).toBe(6);
  });
});

describe("a station principal is identifiable", () => {
  const cfg = { stationCredentials: { stationDomain: "@bd.scena" } };

  it("recognises the non-routable suffix, case-insensitively", () => {
    expect(isStationPrincipal("a1b2c3@bd.scena", cfg)).toBe(true);
    expect(isStationPrincipal("A1B2C3@BD.SCENA", cfg)).toBe(true);
  });

  it("does NOT match a real person's address", () => {
    // The whole point: a station account must never be mistakable for a human's,
    // in either direction.
    expect(isStationPrincipal("owner@northlight.test", cfg)).toBe(false);
    expect(isStationPrincipal("someone@bd.scena.com", cfg)).toBe(false);
  });

  it("matches nothing at all for an app that never opted in", () => {
    expect(isStationPrincipal("anyone@anywhere", {})).toBe(false);
  });
});
