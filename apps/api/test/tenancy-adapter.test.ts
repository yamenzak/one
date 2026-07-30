import { describe, expect, it } from "vitest";
import { checkSlug, classifyHost, slugRejectionMessage } from "@4dl/tenancy";
import { KOVA_RESERVED_LABELS } from "../src/host-context.js";

/**
 * The half of tenancy that is Kova's, asserted where it lives.
 *
 * `@4dl/tenancy` reserves what is true of any multi-tenant product on any zone —
 * the other doors, mail autoconfig, ACME, Cloudflare plumbing, money words. It
 * deliberately does NOT reserve "kova", because that means nothing to a warehouse
 * app and a shared list accumulating every app's brand names is one nobody can
 * safely edit.
 *
 * Which means the brand reservations are now OURS to keep covered. They were
 * previously asserted in the package's own test, and moving them out without
 * moving the assertion is exactly how a security control quietly loses its
 * coverage: nothing fails, and `kova.kova.4dl.app` becomes claimable by anyone
 * who types it into the studio-create form.
 */
const opts = { reserved: KOVA_RESERVED_LABELS };

describe("Kova's tenancy adapter", () => {
  it("reserves the product and company names, which the package does not", () => {
    for (const label of ["kova", "mossa", "4dl", "fourdegrees", "fourdegreelabs", "labs"]) {
      expect(checkSlug(label, opts), `${label} is claimable`).toEqual({ ok: false, reason: "reserved" });
      // …and the package on its own would allow it. If this ever flips, the
      // brand list has leaked back into the shared package.
      expect(checkSlug(label, {}).ok, `${label} leaked into @4dl/tenancy`).toBe(true);
    }
  });

  it("still reserves the universal labels through the same call", () => {
    for (const label of ["admin", "setup", "www", "api", "autodiscover", "billing", "login"]) {
      expect(checkSlug(label, opts), label).toEqual({ ok: false, reason: "reserved" });
    }
  });

  it("makes a reserved brand label an INVALID host, not a candidate custom domain", () => {
    // The consequence that matters. `custom` hostnames are resolved from a
    // column an owner can write to, so a reserved label under our own root must
    // never fall through to that lookup.
    expect(classifyHost("kova.kova.4dl.app", "kova.4dl.app", opts).role).toBe("invalid");
    expect(classifyHost("acme.kova.4dl.app", "kova.4dl.app", opts)).toMatchObject({ role: "tenant", slug: "acme" });
  });

  it("says 'studio' to the owner who typed it", () => {
    expect(slugRejectionMessage("empty", "studio")).toBe("Pick an address for your studio.");
  });
});
