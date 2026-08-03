/**
 * A BOT CHECK THAT CANNOT RUN MUST NOT BE A CLOSED DOOR.
 *
 * A Turnstile widget carries a hostname allow-list. Listing one entry covers its
 * subdomains, so the whole platform fits in a single entry — but a tenant's OWN
 * domain is a different registrable domain and is covered by nothing. There the
 * widget refuses to render, no token exists, and a server that demands one turns
 * a passwordless product into a studio that can admit nobody at the address it
 * advertises.
 *
 * Cloudflare's fix for this is the Enterprise-only "Any Hostname" option; below
 * it a widget holds on the order of 10–15 hostnames, so adding every tenant's
 * domain is a queue with a ceiling rather than a mechanism. So the check is
 * scoped to where it can run, and these are the rules that scoping has to obey.
 */

import { describe, expect, it } from "vitest";
import { hostCovered, parseHostnames } from "../src/turnstile.js";

describe("parseHostnames", () => {
  it("takes commas, newlines and stray spacing", () => {
    expect(parseHostnames("4dl.app, byshujaa.com\n  example.test ")).toEqual(["4dl.app", "byshujaa.com", "example.test"]);
  });

  it("normalises case and a trailing dot", () => {
    expect(parseHostnames("4DL.App.")).toEqual(["4dl.app"]);
  });

  it("is empty for nothing at all", () => {
    expect(parseHostnames(null)).toEqual([]);
    expect(parseHostnames("   ")).toEqual([]);
  });
});

describe("hostCovered", () => {
  /** Cloudflare's own rule: an entry authorizes its subdomains too. */
  it("covers a hostname and every subdomain of it", () => {
    expect(hostCovered("4dl.app", ["4dl.app"])).toBe(true);
    expect(hostCovered("kova.4dl.app", ["4dl.app"])).toBe(true);
    expect(hostCovered("byshujaa.kova.4dl.app", ["4dl.app"])).toBe(true);
  });

  /**
   * The reason this is a suffix test with a leading DOT rather than `endsWith`.
   * `not4dl.app` ends with `4dl.app` and is somebody else's domain entirely.
   */
  it("does not cover a domain that merely ends with the same letters", () => {
    expect(hostCovered("not4dl.app", ["4dl.app"])).toBe(false);
    expect(hostCovered("evil-4dl.app", ["4dl.app"])).toBe(false);
  });

  /** The case the whole change exists for. */
  it("does not cover a tenant's own domain", () => {
    expect(hostCovered("coaching.byshujaa.com", ["kova.4dl.app"])).toBe(false);
  });

  it("covers it once the operator adds it", () => {
    expect(hostCovered("coaching.byshujaa.com", ["kova.4dl.app", "byshujaa.com"])).toBe(true);
  });

  it("covers nothing when the list is empty", () => {
    expect(hostCovered("kova.4dl.app", [])).toBe(false);
  });

  it("ignores case and a trailing dot on the host", () => {
    expect(hostCovered("Kova.4DL.app.", ["4dl.app"])).toBe(true);
  });
});
