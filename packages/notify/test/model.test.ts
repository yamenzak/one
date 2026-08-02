/**
 * The channel algebra, against a registry that is NOT either shipped app's.
 *
 * Kova's 30 notification tests still pass, and they exercise this same code
 * through `@kova/domain`'s re-export — but they only ever prove the model works
 * for the vocabulary it was extracted FROM. That is the failure mode the whole
 * extraction exists to prevent, so the registry below is deliberately alien: a
 * library, with `borrower`/`librarian`, audiences named `reader` and `staff`,
 * and a tenant variable called `{{branchName}}`.
 *
 * If any of Kova's nouns had survived as a literal, most of these fail.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  audienceForRole,
  categoriesForRole,
  configureNotify,
  defaultChannels,
  emailAllowedByPolicy,
  isNotifCategory,
  notifAudienceOf,
  notifCategoryOf,
  notifLinkOf,
  notifTitleOf,
  notifVisibleInSurface,
  parseNotifPolicy,
  parseNotifPrefs,
  renderTemplate,
  resolveChannels,
  resolveEmailPolicy,
  universalNotifVars,
  unreadInSurface,
} from "../src/model.js";

const READER = "reader";
const STAFF = "staff";

function configureLibrary() {
  configureNotify({
    categories: [
      { key: "loans", label: "Loans", blurb: "Due dates and renewals", roles: ["borrower", "librarian"] },
      { key: "holds", label: "Holds", blurb: "Reservations you placed", roles: ["borrower"] },
      { key: "desk", label: "Front desk", blurb: "Overdue chases and returns", roles: ["librarian"] },
      { key: "digest", label: "Weekly digest", blurb: "Your week", roles: ["borrower", "librarian"] },
    ],
    types: {
      due_soon: { category: "loans", to: READER, title: "A book is due soon", link: "/loans" },
      hold_ready: { category: "holds", to: READER, title: "Your hold is ready" },
      overdue_chase: { category: "desk", to: STAFF, title: "Overdue loans need chasing" },
      // A third addressee, like Kova's `owner`: not the customer audience, so it
      // resolves to the member one without the package knowing the word.
      branch_report: { category: "desk", to: "manager", title: "The branch report is ready" },
    },
    customerRole: "borrower",
    audiences: { customer: READER, member: STAFF },
    tenantVar: "branchName",
    defaultChannels: (_role, category) => (category === "desk" ? { inbox: true, email: false } : null),
  });
}

beforeEach(configureLibrary);

describe("the registry names the vocabulary", () => {
  it("resolves a type's category, title and link from the registry", () => {
    expect(notifCategoryOf("due_soon")).toBe("loans");
    expect(notifTitleOf("due_soon")).toBe("A book is due soon");
    expect(notifLinkOf("due_soon")).toBe("/loans");
    // A type whose title interpolates a name carries none, and the call site supplies it.
    expect(notifLinkOf("hold_ready")).toBeNull();
  });

  it("reports an unknown category as unknown", () => {
    expect(isNotifCategory("loans")).toBe(true);
    expect(isNotifCategory("check-ins")).toBe(false);
  });

  it("carries the app's tenant variable into every template", () => {
    expect(universalNotifVars()).toEqual(["branchName", "title", "message"]);
  });

  it("blanks an unknown variable rather than leaving a stray placeholder", () => {
    expect(renderTemplate("Hi {{branchName}} — {{nope}}!", { branchName: "Elm St" })).toBe("Hi Elm St — !");
  });
});

describe("audiences and surfaces", () => {
  it("maps the customer role to the customer audience and everyone else to the member one", () => {
    expect(audienceForRole("borrower")).toBe(READER);
    expect(audienceForRole("librarian")).toBe(STAFF);
    // A role nobody registered is still a member — never silently a customer.
    expect(audienceForRole("volunteer")).toBe(STAFF);
  });

  it("resolves a third addressee to the member audience", () => {
    expect(notifAudienceOf("branch_report")).toBe(STAFF);
    expect(notifAudienceOf("due_soon")).toBe(READER);
  });

  it("falls back to the member audience for an unknown type", () => {
    expect(notifAudienceOf("no_such_type")).toBe(STAFF);
  });

  it("filters the bell by surface", () => {
    expect(notifVisibleInSurface("due_soon", READER)).toBe(true);
    expect(notifVisibleInSurface("due_soon", STAFF)).toBe(false);
    expect(notifVisibleInSurface("branch_report", STAFF)).toBe(true);
  });

  it("shows an UNREGISTERED type in every surface rather than dropping it", () => {
    // A notification nobody sees is worse than one seen twice.
    expect(notifVisibleInSurface("mystery", READER)).toBe(true);
    expect(notifVisibleInSurface("mystery", STAFF)).toBe(true);
  });

  it("counts unread per surface", () => {
    const items = [
      { type: "due_soon", read: 0 },
      { type: "hold_ready", read: 0 },
      { type: "overdue_chase", read: 0 },
      { type: "due_soon", read: 1 },
    ];
    expect(unreadInSurface(items, READER)).toBe(2);
    expect(unreadInSurface(items, STAFF)).toBe(1);
  });

  it("treats every member as a member when the app names no customer role", () => {
    configureNotify({ categories: [], types: {}, customerRole: " none" });
    // The defaults, which are nobody's product vocabulary.
    expect(audienceForRole("owner")).toBe("member");
    expect(universalNotifVars()[0]).toBe("tenantName");
  });
});

describe("role × category → channels", () => {
  it("shows a role only the categories it can receive", () => {
    expect(categoriesForRole("borrower").map((c) => c.key)).toEqual(["loans", "holds", "digest"]);
    expect(categoriesForRole("librarian").map((c) => c.key)).toEqual(["loans", "desk", "digest"]);
  });

  it("silences a category the role cannot receive, whatever is stored", () => {
    // The line that stops a demotion leaking notifications: role is re-checked
    // at read time, so a stored `desk: on` from a previous role does nothing.
    const stored = parseNotifPrefs(JSON.stringify({ desk: { inbox: true, email: true } }));
    expect(resolveChannels("borrower", stored, "desk")).toEqual({ inbox: false, email: false });
    expect(resolveChannels("librarian", stored, "desk")).toEqual({ inbox: true, email: true });
  });

  it("applies the app's override before the baseline", () => {
    expect(defaultChannels("librarian", "desk")).toEqual({ inbox: true, email: false });
    expect(defaultChannels("librarian", "loans")).toEqual({ inbox: true, email: true });
  });

  it("makes the digest email-only", () => {
    // A weekly summary sitting in an inbox nobody opens weekly is not a summary.
    expect(defaultChannels("borrower", "digest")).toEqual({ inbox: false, email: true });
  });

  it("drops a stored preference for a category the registry does not know", () => {
    expect(parseNotifPrefs(JSON.stringify({ nonsense: { inbox: false } }))).toEqual({});
  });

  it("survives malformed stored JSON", () => {
    expect(parseNotifPrefs("{not json")).toEqual({});
    expect(parseNotifPrefs(null)).toEqual({});
  });
});

describe("the owner's email veto", () => {
  it("allows everything when no policy is set", () => {
    expect(emailAllowedByPolicy({}, "loans")).toBe(true);
    expect(resolveEmailPolicy({})).toEqual({ loans: true, holds: true, desk: true, digest: true });
  });

  it("parses a policy keyed by the app's OWN audience names", () => {
    const policy = parseNotifPolicy(JSON.stringify({ emailAudience: { reader: { loans: false }, staff: { desk: false } } }));
    expect(emailAllowedByPolicy(policy, "loans", READER)).toBe(false);
    expect(emailAllowedByPolicy(policy, "loans", STAFF)).toBe(true);
    expect(emailAllowedByPolicy(policy, "desk", STAFF)).toBe(false);
  });

  it("ignores an audience key the registry does not name", () => {
    const policy = parseNotifPolicy(JSON.stringify({ emailAudience: { client: { loans: false } } }));
    expect(policy.emailAudience).toBeUndefined();
    expect(emailAllowedByPolicy(policy, "loans", READER)).toBe(true);
  });

  it("lets the per-audience map override the legacy all-audiences one", () => {
    const policy = parseNotifPolicy(JSON.stringify({ emailCategories: { loans: false }, emailAudience: { reader: { loans: true } } }));
    expect(emailAllowedByPolicy(policy, "loans", READER)).toBe(true);
    expect(emailAllowedByPolicy(policy, "loans", STAFF)).toBe(false);
  });
});
