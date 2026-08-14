/**
 * THE PACKAGE CLOCK, AND WHAT MAY BE SOLD AT ALL (D16).
 *
 * ⚠️ THESE ARE THE ARITHMETIC HALVES OF THE RAIL. The runtime proves the rail
 * end to end; what lives here is the pure part every caller must agree on —
 * where the ladder's rungs are, that a renewal queues rather than sums, that
 * the destructive floor cannot be configured away, and that a package cannot
 * be composed out of keys nobody could ever use.
 */

import { describe, expect, it } from "vitest";
import { instant } from "../src/primitives.js";
import {
  PACKAGE_FLOOR_DAYS, extendedUntil, grantUntil, mayDestroy, packageSource, packageState,
  refusePackage, sellableKeys, type PackageDef,
} from "../src/package.js";

const at = (s: string) => instant(new Date(s));
const T0 = at("2026-08-14T12:00:00Z");

describe("the ladder", () => {
  it("stands active until expiry, in grace after it, lapsed past the grace", () => {
    const paid = at("2026-09-01T00:00:00Z");
    expect(packageState(paid, 3, T0)).toBe("active");
    expect(packageState(paid, 3, at("2026-09-02T00:00:00Z"))).toBe("grace");
    expect(packageState(paid, 3, at("2026-09-04T23:00:00Z"))).toBe("lapsed");
    /* ⚠️ Never bought is lapsed, not a special state anybody branches on. */
    expect(packageState(null, 3, T0)).toBe("lapsed");
  });

  /* ⚠️ The membership's clock is expiry PLUS grace — the resolver has ONE
     comparison and must not know the ladder. Grace changes the sentence
     somebody is shown, never the access. */
  it("writes the grant clock as expiry plus grace", () => {
    expect(grantUntil(at("2026-09-01T00:00:00Z"), 3)).toBe("2026-09-04T00:00:00.000Z");
  });
});

describe("a renewal extends and never stacks", () => {
  it("queues a new period onto a live window", () => {
    const current = at("2026-09-01T00:00:00Z");
    expect(extendedUntil(current, 30, T0)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("starts from now once lapsed — the dead months are not billed backwards", () => {
    const lapsed = at("2026-07-01T00:00:00Z");
    expect(extendedUntil(lapsed, 30, T0)).toBe("2026-09-13T12:00:00.000Z");
    expect(extendedUntil(null, 30, T0)).toBe("2026-09-13T12:00:00.000Z");
  });

  it("applied twice is two queued periods, not two overlapping windows", () => {
    const once = extendedUntil(null, 30, T0);
    const twice = extendedUntil(once, 30, T0);
    expect(twice).toBe("2026-10-13T12:00:00.000Z");
  });
});

describe("the destructive floor", () => {
  const paid = at("2026-08-01T00:00:00Z");

  it("never destroys with no retention configured", () => {
    expect(mayDestroy(paid, 3, null, at("2030-01-01T00:00:00Z"))).toBe(false);
    expect(mayDestroy(null, 3, 30, at("2030-01-01T00:00:00Z"))).toBe(false);
  });

  /* ⚠️ Counted from LAPSE — grace is still a paid-for relationship — and a
     retention under the floor is treated AS the floor, so a workspace cannot
     configure a customer's records out of existence the morning after a
     missed renewal. */
  it("holds the platform floor under any configured retention", () => {
    /* Lapse is 2026-08-04 (paid + 3 grace). A 1-day retention still waits the
       full 14-day floor: nothing before 2026-08-18. */
    expect(PACKAGE_FLOOR_DAYS).toBe(14);
    expect(mayDestroy(paid, 3, 1, at("2026-08-06T00:00:00Z"))).toBe(false);
    expect(mayDestroy(paid, 3, 1, at("2026-08-17T23:00:00Z"))).toBe(false);
    expect(mayDestroy(paid, 3, 1, at("2026-08-18T01:00:00Z"))).toBe(true);
    /* A retention above the floor is respected as configured: lapse + 30. */
    expect(mayDestroy(paid, 3, 30, at("2026-08-20T00:00:00Z"))).toBe(false);
    expect(mayDestroy(paid, 3, 30, at("2026-09-04T00:00:00Z"))).toBe(true);
  });
});

/* ------------------------------------------------------------ composition --- */

const APP = {
  access: {
    permissions: ["note:read", "note:write", "export:run"],
    roles: { editor: ["note:read", "note:write"] },
    seats: { counts: ["owner"], entitlement: "seats" },
  },
  collections: [],
  operations: [
    { id: "note.publish", kind: "write", summary: "", input: {}, output: {},
      permission: "note:write", idempotency: { mode: "none" }, async handler() { return {}; } },
    /* ⚠️ Reachable only behind an entitlement NO plan sells — money for a 403. */
    { id: "export.run", kind: "write", summary: "", input: {}, output: {},
      permission: "export:run", entitlement: "exporting",
      idempotency: { mode: "none" }, async handler() { return {}; } },
  ] as never[],
  screens: [{ permission: "note:read" }],
  plans: [{ id: "free", name: "Free", said: "", price: 0, currency: "EUR", order: 0,
    includes: { seats: 1 } }],
  entitlements: {
    seats: { label: "Seats", withheld: "quota" as const },
    exporting: { label: "Exporting", withheld: "gate" as const, reserved: true },
  },
};

const pkg = (over: Partial<PackageDef> = {}): PackageDef => ({
  id: "author-pass", app: "notes", name: "Author pass",
  priceCents: 500, currency: "EUR", periodDays: 30, graceDays: 3,
  grants: ["note:write"],
  ...over,
});

describe("what may be sold", () => {
  const sellable = sellableKeys(APP as never);
  const author = new Set(["note:read", "note:write"]);

  it("sells a key an operation or screen actually reads", () => {
    expect(sellable.has("note:write")).toBe(true);
    expect(sellable.has("note:read")).toBe(true);
  });

  /* ⚠️ REFUSED WHEN COMPOSED, NOT AT THE CUSTOMER'S FIRST 403. A key behind an
     entitlement no plan sells is undeliverable however real the operation is. */
  it("refuses a key only reachable behind an entitlement nobody can hold", () => {
    expect(sellable.has("export:run")).toBe(false);
    expect(refusePackage(pkg({ grants: ["export:run"] }), sellable, author)).toBe("undeliverable");
  });

  it("refuses a key the app never declared, and the platform's offices", () => {
    expect(refusePackage(pkg({ grants: ["ghost:write"] }), sellable, author)).toBe("undeliverable");
    expect(refusePackage(pkg({ grants: ["member:manage"] }), sellable, author)).toBe("undeliverable");
  });

  /* ⚠️ The role composer's rule, priced: composing a package you could not
     grant key by key and buying it from yourself is the same escalation. */
  it("refuses a package beyond its author", () => {
    expect(refusePackage(pkg(), sellable, new Set(["note:read"]))).toBe("beyond_you");
  });

  it("refuses the malformed shapes, each as its own thing to fix", () => {
    expect(refusePackage(pkg({ id: "Not A Slug" }), sellable, author)).toBe("id");
    expect(refusePackage(pkg({ grants: [] }), sellable, author)).toBe("empty");
    expect(refusePackage(pkg({ periodDays: 0 }), sellable, author)).toBe("period");
    expect(refusePackage(pkg({ priceCents: -1 }), sellable, author)).toBe("price");
    expect(refusePackage(pkg({ retentionDays: 7 }), sellable, author)).toBe("floor");
    expect(refusePackage(pkg(), sellable, author)).toBe(null);
    /* Free is a real price — a comped tier composes. */
    expect(refusePackage(pkg({ priceCents: 0 }), sellable, author)).toBe(null);
  });

  it("stamps a package's grants with one findable source", () => {
    expect(packageSource("author-pass")).toBe("pkg:author-pass");
  });
});
