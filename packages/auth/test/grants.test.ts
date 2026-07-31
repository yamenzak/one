import { describe, expect, it } from "vitest";
import { bindGrants, grantSatisfies, intersectGrant, sanitizeGrant, type Grant } from "../src/grants.js";

/**
 * The algebra, exercised on a vocabulary that is not any real app's.
 *
 * Using invented resources here is the point: these tests would still pass if
 * every app's registry were deleted, which is the property that makes this
 * module shared rather than Kova's with the names filed off.
 */
const catalog = {
  widget: ["read", "create", "update", "destroy"],
  ledger: ["read", "settle"],
  vault: ["read", "manage"],
};

const presets: Record<string, Grant> = {
  root: { widget: ["read", "create", "update", "destroy"], ledger: ["read", "settle"], vault: ["read", "manage"] },
  operator: { widget: ["read", "create", "update"], ledger: ["read"] },
  viewer: { widget: ["read"] },
};

const grants = bindGrants({ catalog, presets, fallbackRole: "viewer", unboundedRoles: ["root"] });

describe("grant algebra", () => {
  it("drops anything the catalog does not name", () => {
    expect(
      sanitizeGrant({ widget: ["read", "teleport"], gadget: ["read"], ledger: "not-an-array" }, catalog),
    ).toEqual({ widget: ["read"] });
  });

  it("deduplicates, and refuses non-objects rather than throwing", () => {
    expect(sanitizeGrant({ widget: ["read", "read"] }, catalog)).toEqual({ widget: ["read"] });
    for (const junk of [null, undefined, 42, "widget", []]) expect(sanitizeGrant(junk, catalog)).toEqual({});
  });

  it("intersects toward the ceiling, never past it", () => {
    expect(intersectGrant({ widget: ["read", "destroy"], vault: ["manage"] }, presets.operator!)).toEqual({
      widget: ["read"],
    });
  });

  it("requires EVERY action of EVERY resource asked for", () => {
    const g = { widget: ["read", "create"], ledger: ["read"] };
    expect(grantSatisfies(g, { widget: ["read"] })).toBe(true);
    expect(grantSatisfies(g, { widget: ["read", "create"], ledger: ["read"] })).toBe(true);
    expect(grantSatisfies(g, { widget: ["destroy"] })).toBe(false);
    expect(grantSatisfies(g, { vault: ["read"] })).toBe(false);
    // Asking for nothing is satisfied by anything — the "any authenticated
    // member" case the route guard leans on.
    expect(grantSatisfies({}, {})).toBe(true);
  });
});

describe("resolving a member's effective grant", () => {
  it("falls back to the configured role for null and for nonsense", () => {
    expect(grants.resolve(null, null)).toEqual(presets.viewer);
    expect(grants.resolve("chief-of-vibes", null)).toEqual(presets.viewer);
  });

  it("BOUNDS a custom grant by the role — this is the security property", () => {
    // The whole reason custom grants are safe: an operator whose stored grant
    // claims vault access does not get it. Without the intersection, editing a
    // JSON column would be a privilege-escalation primitive.
    const escalation = JSON.stringify({ vault: ["manage"], widget: ["read", "destroy"] });
    expect(grants.resolve("operator", escalation)).toEqual({ widget: ["read"] });
  });

  it("lets a custom grant NARROW within the role", () => {
    expect(grants.resolve("operator", JSON.stringify({ widget: ["read"] }))).toEqual({ widget: ["read"] });
  });

  it("leaves an unbounded role at its full preset, custom grant or not", () => {
    // Letting a stored grant clip the top role is how a tenant locks itself out
    // of its own billing, with no role left that can undo it.
    expect(grants.resolve("root", JSON.stringify({ widget: ["read"] }))).toEqual(presets.root);
  });

  it("ignores an unparseable or empty custom grant rather than denying everything", () => {
    // Failing CLOSED here would mean a corrupted JSON column silently strips a
    // member of every power their role carries — a support incident with no
    // error message anywhere.
    expect(grants.resolve("operator", "{not json")).toEqual(presets.operator);
    expect(grants.resolve("operator", "{}")).toEqual(presets.operator);
    expect(grants.resolve("operator", JSON.stringify({ gadget: ["read"] }))).toEqual(presets.operator);
  });
});
