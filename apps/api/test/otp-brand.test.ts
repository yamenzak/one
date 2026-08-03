/**
 * A SIGN-IN CODE WEARS THE BRAND OF THE DOOR IT WAS ASKED FOR.
 *
 * The sign-in code is the one email every person in this system receives, and
 * it said "your Kova code" to all of them — including a client of byShujaa
 * signing in at `coaching.byshujaa.com`, who has never heard of Kova. That is
 * the white label coming off on the message that reaches the most people.
 *
 * `@4dl/email` says sign-in codes are the PLATFORM's identity, and that rule is
 * right about receipts and dunning: those are Kova billing a studio, and a
 * studio's colours on "your subscription lapsed" would be a small lie. It is
 * wrong about this one, because what decides the brand is WHO IS READING — a
 * studio's customer, or a studio's owner dealing with us.
 *
 * The host answers that, as it does everywhere else here, so the rule is a
 * function of the door and is tested as one. It is one character from leaking
 * the vendor's name to every client of every studio, or from naming a studio
 * that does not exist yet at somebody creating their first one.
 */

import { describe, expect, it } from "vitest";
import { HOST_ROLES, type HostRole } from "@4dl/tenancy";
import { otpWearsTenantBrand } from "../src/auth.js";

const shape = (role: HostRole) => ({ role }) as never;

describe("which doors brand the sign-in code", () => {
  it("uses the studio's brand on a studio subdomain and on its own domain", () => {
    expect(otpWearsTenantBrand(shape("tenant"))).toBe(true);
    expect(otpWearsTenantBrand(shape("custom"))).toBe(true);
  });

  /**
   * `setup.` matters most of the three. There is no studio there yet — that is
   * the door where one is created — so a tenant brand is not merely wrong, it
   * does not exist.
   */
  it("uses the platform's brand on every platform door", () => {
    expect(otpWearsTenantBrand(shape("root"))).toBe(false);
    expect(otpWearsTenantBrand(shape("setup"))).toBe(false);
    expect(otpWearsTenantBrand(shape("admin"))).toBe(false);
    expect(otpWearsTenantBrand(shape("invalid"))).toBe(false);
  });

  /** No shape is no evidence, and no evidence must not brand anything. */
  it("falls back to the platform when the door is unknown", () => {
    expect(otpWearsTenantBrand(undefined)).toBe(false);
  });

  /**
   * A new `HostRole` must not silently join the tenant side. Adding a door is a
   * decision about whose name goes on the sign-in code of everyone who uses it,
   * and it should be made here rather than inherited.
   */
  it("covers every role the host model defines", () => {
    const branded = HOST_ROLES.filter((r) => otpWearsTenantBrand(shape(r)));
    expect(branded).toEqual(["tenant", "custom"]);
  });
});
