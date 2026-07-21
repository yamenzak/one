import { describe, expect, it } from "vitest";
import {
  defaultChannels, resolveChannels, parseNotifPrefs, categoriesForRole, categoryAppliesTo, resolveAllChannels,
  parseNotifPolicy, emailAllowedByPolicy, resolveEmailPolicy, sanitizeEmailPolicy, isNotifCategory,
  NOTIF_TYPES, notifCategoryOf, notifTitleOf, notifLinkOf,
  notifAudienceOf, notifVisibleInSurface, unreadInSurface, type NotifType,
  renderTemplate, notifTemplateOf, notifVarsOf,
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

  it("static-copy types carry a default title+link; name-interpolating types don't", () => {
    // Fixed-copy notifications own their title + link on the record.
    expect(notifTitleOf("goal_set")).toBe("Your coach set a new goal");
    expect(notifLinkOf("goal_set")).toBe("/progress");
    expect(notifTitleOf("supplement_added")).toBe("New supplement added");
    // Titles that interpolate a client name have no default — supplied at the call site.
    expect(notifTitleOf("check_in")).toBeNull();
    expect(notifTitleOf("body_fat_logged")).toBeNull();
    // client_assigned has a fixed title but a client-scoped link (no default link).
    expect(notifTitleOf("client_assigned")).toBe("You've been assigned a client");
    expect(notifLinkOf("client_assigned")).toBeNull();
  });

  it("every type's category is reachable by its declared audience role", () => {
    const roleFor = { client: "client", staff: "trainer", owner: "owner" } as const;
    for (const [type, meta] of Object.entries(NOTIF_TYPES)) {
      expect(categoryAppliesTo(meta.category, roleFor[meta.to]), `${type} (${meta.to}) can't receive ${meta.category}`).toBe(true);
    }
  });
});

describe("audience + surface (mode-aware in-app filtering)", () => {
  it("the client surface shows only client-audience types", () => {
    expect(notifVisibleInSurface("feedback", "client")).toBe(true); // to: client
    expect(notifVisibleInSurface("plan_published", "client")).toBe(true);
    expect(notifVisibleInSurface("check_in", "client")).toBe(false); // to: staff
    expect(notifVisibleInSurface("billing_past_due", "client")).toBe(false); // to: owner
  });

  it("the staff surface shows staff + owner types, never client ones", () => {
    expect(notifVisibleInSurface("check_in", "staff")).toBe(true); // to: staff
    expect(notifVisibleInSurface("billing_past_due", "staff")).toBe(true); // to: owner
    expect(notifVisibleInSurface("client_assigned", "staff")).toBe(true);
    expect(notifVisibleInSurface("feedback", "staff")).toBe(false); // to: client
  });

  it("every type lands in exactly one surface", () => {
    for (const type of Object.keys(NOTIF_TYPES) as NotifType[]) {
      const inClient = notifVisibleInSurface(type, "client");
      const inStaff = notifVisibleInSurface(type, "staff");
      expect(inClient !== inStaff, `${type} must be in exactly one surface`).toBe(true);
    }
  });

  it("an unknown type is shown everywhere rather than dropped", () => {
    expect(notifVisibleInSurface("nope" as NotifType, "client")).toBe(true);
    expect(notifAudienceOf("nope" as NotifType)).toBe("staff");
  });

  it("unreadInSurface counts only unread items visible in the surface", () => {
    const items = [
      { type: "feedback" as NotifType, read: false }, // client, unread
      { type: "check_in" as NotifType, read: false }, // staff, unread
      { type: "goal_set" as NotifType, read: true }, // client, read
      { type: "plan_published" as NotifType, read: false }, // client, unread
    ];
    expect(unreadInSurface(items, "client")).toBe(2); // feedback + plan_published
    expect(unreadInSurface(items, "staff")).toBe(1); // check_in
  });
});

describe("email templates + variable rendering", () => {
  it("substitutes known variables and blanks unknown/missing ones", () => {
    expect(renderTemplate("Hi {{coachName}}, your {{planName}} is ready", { coachName: "Sam", planName: "Push/Pull" }))
      .toBe("Hi Sam, your Push/Pull is ready");
    expect(renderTemplate("Expires in {{daysLeft}} days", { daysLeft: 3 })).toBe("Expires in 3 days");
    // Unknown / missing → empty, never a stray {{x}}.
    expect(renderTemplate("Hi {{missing}}!", {})).toBe("Hi !");
    expect(renderTemplate("{{ spaced }}", { spaced: "ok" })).toBe("ok");
  });

  it("templated types expose a subject/body and their declared vars are used in it", () => {
    const tpl = notifTemplateOf("plan_published")!;
    expect(tpl.subject).toContain("{{planName}}");
    // Every declared var actually appears somewhere in the template.
    for (const type of Object.keys(NOTIF_TYPES) as NotifType[]) {
      const t = notifTemplateOf(type);
      if (!t) continue;
      const blob = t.subject + t.body;
      for (const v of notifVarsOf(type)) {
        expect(blob.includes(`{{${v}}}`) || blob.includes(`{{ ${v} }}`), `${type}: ${v} declared but unused`).toBe(true);
      }
    }
  });

  it("only client-facing + studio-billing types carry a template (phased scope)", () => {
    expect(notifTemplateOf("feedback")).not.toBeNull();
    expect(notifTemplateOf("billing_past_due")).not.toBeNull();
    // Staff activity signals fall back to the generic card.
    expect(notifTemplateOf("check_in")).toBeNull();
    expect(notifTemplateOf("body_fat_logged")).toBeNull();
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
