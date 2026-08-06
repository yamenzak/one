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
  it("NARROWS with a custom grant, and only narrows", () => {
    // A viewer's preset carries `channel: ["read"]`, so this keeps the read and
    // drops the publish. The old resolver returned the blob verbatim the moment
    // it sanitized to something non-empty, which made
    // `POST /api/members/:id/permissions` a privilege-escalation primitive.
    const g = resolvePermissions("viewer", JSON.stringify({ channel: ["read", "publish"] }));
    expect(g).toEqual({ channel: ["read"] });
  });

  it("cannot hand a role a power its preset does not carry", () => {
    // The exact escalation: a receptionist has no `billing` at all, so a stored
    // grant naming it resolves to nothing rather than to `billing: ["manage"]`.
    expect(resolvePermissions("receptionist", JSON.stringify({ billing: ["manage"] }))).toEqual({});
    expect(resolvePermissions("viewer", JSON.stringify({ settings: ["manage"] }))).toEqual({});
  });

  it("leaves an OWNER unbounded — a blob must not lock a tenant out of billing", () => {
    const g = resolvePermissions("owner", JSON.stringify({ screen: ["read"] }));
    expect(g.billing).toContain("manage");
  });

  it("gives a BOARD user its own preset, not the viewer's", () => {
    // Board roles were absent from the hand-mirrored presets, so every station
    // account fell through to `viewer` — which carries `billing: ["read"]` and
    // read access to the whole fleet. A counter device in a waiting room.
    const g = resolvePermissions("board_station", null);
    expect(g).toEqual({ board: ["read", "operate"] });
    expect(g.billing).toBeUndefined();
    expect(g.screen).toBeUndefined();
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
