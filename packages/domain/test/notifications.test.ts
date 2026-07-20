import { describe, expect, it } from "vitest";
import {
  defaultChannels, resolveChannels, parseNotifPrefs, categoriesForRole, categoryAppliesTo, resolveAllChannels,
  parseNotifPolicy, emailAllowedByPolicy, resolveEmailPolicy, sanitizeEmailPolicy, isNotifCategory,
  NOTIF_TYPES, notifCategoryOf,
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

  it("body-composition is a staff category the coach can tune", () => {
    expect(isNotifCategory("body-composition")).toBe(true);
    expect(categoriesForRole("trainer").map((c) => c.key)).toContain("body-composition");
    expect(categoriesForRole("client").map((c) => c.key)).not.toContain("body-composition");
    expect(defaultChannels("trainer", "body-composition")).toEqual({ inbox: true, email: true });
  });
});

describe("notification types (the atom)", () => {
  it("every type binds to a real category", () => {
    for (const [type, meta] of Object.entries(NOTIF_TYPES)) {
      expect(isNotifCategory(meta.category), `${type} → ${meta.category}`).toBe(true);
    }
  });

  it("notifCategoryOf derives the governing category from the type", () => {
    expect(notifCategoryOf("check_in")).toBe("check-ins");
    expect(notifCategoryOf("body_fat_logged")).toBe("body-composition");
    expect(notifCategoryOf("billing_past_due")).toBe("billing");
    expect(notifCategoryOf("payment_disputed")).toBe("sales");
    expect(notifCategoryOf("sub_expiring")).toBe("commerce");
  });

  it("every type's category is reachable by its declared audience role", () => {
    const roleFor = { client: "client", staff: "trainer", owner: "owner" } as const;
    for (const [type, meta] of Object.entries(NOTIF_TYPES)) {
      expect(categoryAppliesTo(meta.category, roleFor[meta.to]), `${type} (${meta.to}) can't receive ${meta.category}`).toBe(true);
    }
  });
});

describe("tenant email policy (owner allow-list)", () => {
  it("categories are email-allowed by default (opt-out model)", () => {
    expect(emailAllowedByPolicy({}, "plans-goals")).toBe(true);
    expect(emailAllowedByPolicy(parseNotifPolicy(null), "labs")).toBe(true);
  });

  it("an owner can disable a category's email studio-wide", () => {
    const pol = parseNotifPolicy(JSON.stringify({ emailCategories: { "plans-goals": false, activity: true } }));
    expect(emailAllowedByPolicy(pol, "plans-goals")).toBe(false);
    expect(emailAllowedByPolicy(pol, "activity")).toBe(true);
    expect(emailAllowedByPolicy(pol, "labs")).toBe(true); // untouched → allowed
  });

  it("parse + sanitize drop unknown categories and non-booleans", () => {
    expect(parseNotifPolicy("{bad")).toEqual({});
    expect(parseNotifPolicy(JSON.stringify({ emailCategories: { nope: false, labs: "x", swaps: false } })))
      .toEqual({ emailCategories: { swaps: false } });
    expect(sanitizeEmailPolicy({ nope: true, "body-composition": false, labs: 1 as unknown as boolean }))
      .toEqual({ "body-composition": false });
  });

  it("resolveEmailPolicy yields a full allow-map for the owner UI", () => {
    const map = resolveEmailPolicy(parseNotifPolicy(JSON.stringify({ emailCategories: { activity: false } })));
    expect(map["activity"]).toBe(false);
    expect(map["plans-goals"]).toBe(true);
    expect(Object.keys(map)).toContain("body-composition");
  });
});
