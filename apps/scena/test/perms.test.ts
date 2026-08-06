import { describe, it, expect } from "vitest";
import { sanitizePermissions, resolvePermissions, grantSatisfies, ROLE_PRESETS } from "../src/perms.js";

describe("sanitizePermissions", () => {
  it("keeps only catalogue-valid resource/action pairs", () => {
    const g = sanitizePermissions({ channel: ["read", "publish", "bogus"], nope: ["read"], screen: "x" });
    expect(g).toEqual({ channel: ["read", "publish"] });
  });
  it("drops empty and non-object input", () => {
    expect(sanitizePermissions(null)).toEqual({});
    expect(sanitizePermissions({ channel: [] })).toEqual({});
  });
});

describe("resolvePermissions", () => {
  it("uses the custom grant when present", () => {
    const g = resolvePermissions("viewer", JSON.stringify({ billing: ["manage"] }));
    expect(g).toEqual({ billing: ["manage"] });
  });
  it("falls back to the role preset when no custom grant", () => {
    expect(resolvePermissions("operator", null)).toEqual(ROLE_PRESETS.operator);
    expect(resolvePermissions(null, null)).toEqual(ROLE_PRESETS.viewer);
  });
  it("falls back to the role preset for empty/garbage json", () => {
    expect(resolvePermissions("viewer", "{}")).toEqual(ROLE_PRESETS.viewer);
    expect(resolvePermissions("viewer", "not json")).toEqual(ROLE_PRESETS.viewer);
  });
});

describe("grantSatisfies", () => {
  const grant = { channel: ["read", "publish"], screen: ["read"] };
  it("passes when the grant covers every needed action", () => {
    expect(grantSatisfies(grant, { channel: ["read"] })).toBe(true);
    expect(grantSatisfies(grant, { channel: ["read", "publish"], screen: ["read"] })).toBe(true);
  });
  it("fails when any needed action is missing", () => {
    expect(grantSatisfies(grant, { channel: ["delete"] })).toBe(false);
    expect(grantSatisfies(grant, { billing: ["read"] })).toBe(false);
  });
  it("owner preset satisfies everything, viewer only reads", () => {
    expect(grantSatisfies(ROLE_PRESETS.owner!, { billing: ["manage"], settings: ["manage"] })).toBe(true);
    expect(grantSatisfies(ROLE_PRESETS.viewer!, { channel: ["publish"] })).toBe(false);
    expect(grantSatisfies(ROLE_PRESETS.viewer!, { screen: ["read"] })).toBe(true);
  });
});
