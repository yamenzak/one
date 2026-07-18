import { describe, expect, it } from "vitest";
import {
  defaultChannels, resolveChannels, parseNotifPrefs, categoriesForRole, categoryAppliesTo, resolveAllChannels,
} from "../src/notifications.js";

describe("notification preferences", () => {
  it("inbox defaults on for applicable categories; off when the category doesn't apply to the role", () => {
    expect(defaultChannels("client", "plans-goals")).toEqual({ inbox: true, email: true });
    expect(defaultChannels("client", "sales")).toEqual({ inbox: false, email: false }); // sales is owner-only
    expect(defaultChannels("trainer", "billing")).toEqual({ inbox: false, email: false }); // billing is owner-only
  });

  it("coach check-ins/activity default to digest-only (email off), client feedback emails", () => {
    expect(defaultChannels("trainer", "check-ins").email).toBe(false);
    expect(defaultChannels("trainer", "activity").email).toBe(false);
    expect(defaultChannels("client", "check-ins").email).toBe(true);
  });

  it("digest is email-only", () => {
    expect(defaultChannels("owner", "digest")).toEqual({ inbox: false, email: true });
  });

  it("stored prefs override defaults per channel", () => {
    const stored = parseNotifPrefs(JSON.stringify({ "check-ins": { email: true }, "labs": { inbox: false } }));
    expect(resolveChannels("trainer", stored, "check-ins")).toEqual({ inbox: true, email: true }); // email turned on
    expect(resolveChannels("client", stored, "labs")).toEqual({ inbox: false, email: true }); // inbox turned off, email default kept
    // Untouched category keeps its default.
    expect(resolveChannels("client", stored, "swaps")).toEqual({ inbox: true, email: true });
  });

  it("parseNotifPrefs ignores junk + unknown categories", () => {
    expect(parseNotifPrefs("{bad")).toEqual({});
    expect(parseNotifPrefs(JSON.stringify({ nope: { email: true }, labs: { email: "x" } }))).toEqual({ labs: {} });
  });

  it("categoriesForRole scopes the settings UI", () => {
    const ownerKeys = categoriesForRole("owner").map((c) => c.key);
    expect(ownerKeys).toContain("sales");
    expect(ownerKeys).toContain("billing");
    const clientKeys = categoriesForRole("client").map((c) => c.key);
    expect(clientKeys).not.toContain("sales");
    expect(clientKeys).toContain("commerce");
    expect(categoryAppliesTo("commerce", "trainer")).toBe(false);
  });

  it("resolveAllChannels returns a full matrix for the role's categories", () => {
    const m = resolveAllChannels("client", {});
    expect(Object.keys(m)).toContain("plans-goals");
    expect(Object.keys(m)).not.toContain("sales");
    expect(m["plans-goals"]).toEqual({ inbox: true, email: true });
  });
});
