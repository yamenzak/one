/**
 * WHAT A SUBMITTED DOCUMENT ACTUALLY DOES.
 *
 * ⚠️ THE RAIL SETS A STANDING AND ISSUES A NUMBER, AND NEITHER IS WHAT AN INVOICE
 * IS FOR. `DocumentSpec.posts` says which rule turns a document into entries, and
 * for one round the composer checked that a rule was NAMED and nothing checked
 * that anything ran — a declaration with nothing behind it, which is the shape
 * every guard in the manifest exists to catch.
 */

import { describe, expect, it } from "vitest";
import { collection, defineApp, field, refuseApp, type AppSpec } from "../src/index.js";

const paper = collection({
  id: "paper",
  label: { one: "Paper", many: "Papers" },
  scope: { of: "tenant" },
  permission: "paper",
  retention: null,
  onClose: { then: "keep", why: "what was issued" },
  names: "about",
  document: { series: "P-{####}", posts: [{ to: "ground", rule: "paper.posted" }] },
  fields: { about: field.text({ label: "About", required: true, holds: "none", max: 60 }) },
});

const bones = (over: Partial<AppSpec> = {}): AppSpec => ({
  id: "ground", name: "Ground", mark: "▢", hue: "oklch(0.7 0.1 200)",
  access: {
    permissions: ["paper:read", "paper:write"],
    roles: {
      keeper: ["paper:read", "paper:write"],
      user: ["paper:read"],
      viewer: ["paper:read"],
    },
    presets: [],
    founding: "keeper",
    seats: { counts: ["owner"], entitlement: "seats" },
  },
  entitlements: {},
  collections: [paper],
  operations: [],
  screens: [],
  views: [],
  problems: {},
  ...over,
} as unknown as AppSpec);

const ran = async () => { /* a rule that does nothing, which is enough here */ };
/* ⚠️ WITH AN `undo`, BECAUSE `paper` CAN BE CANCELLED. A posting document that
   can be withdrawn and cannot reverse itself is refused — see below. */
const RULE = { may: ran, post: ran, undo: ran };

const whyOf = (spec: AppSpec) =>
  refuseApp(spec).filter((one) => one.of === "postings").map((one) => one.why);

describe("a document's posting rule", () => {
  it("passes when the rule a document names is declared", () => {
    expect(whyOf(bones({ postings: { "paper.posted": RULE } } as Partial<AppSpec>))).toEqual([]);
  });

  /*
    ⚠️ THE ENGINE WOULD KNOW THE DOCUMENT HAD AN EFFECT AND NOTHING WOULD CARRY
    IT OUT. An invoice submits, takes its number, becomes evidence — and the
    ledger never moves. Every screen is green and the books are missing a sale.
  */
  it("refuses a document that posts through a rule nobody declared", () => {
    const said = whyOf(bones());
    /* ⚠️ AND IT SAYS BOTH THINGS, because a missing rule is also a missing way
       to reverse it — two facts about one hole, and reporting one would leave
       the second to be found on the next run. */
    expect(said.some((one) => one.includes("no rule of that name"))).toBe(true);
    expect(said.every((one) => one.includes("paper.posted"))).toBe(true);
  });

  /* ⚠️ AND THE OTHER DIRECTION, because a handler nothing reaches is dead code
     that reads as live — which is worse than absent, since the next person to
     read it believes the effect exists. */
  it("refuses a rule no document posts through", () => {
    const said = whyOf(bones({
      postings: { "paper.posted": RULE, "ghost.posted": RULE },
    } as Partial<AppSpec>));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("ghost.posted");
  });

  /*
    ⚠️ A DOCUMENT WITHDRAWN WITHOUT REVERSING WHAT IT POSTED LEAVES THE LEDGER
    HOLDING A SALE THAT DID NOT HAPPEN — and every screen agrees, because the
    document says cancelled and the entry says nothing.
  */
  it("refuses a cancellable posting document with no way to undo itself", () => {
    const said = whyOf(bones({
      postings: { "paper.posted": { may: ran, post: ran } },
    } as Partial<AppSpec>));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("reverse itself");
  });

  /* ⚠️ AND ONE THAT CANNOT BE CANCELLED NEEDS NONE, which is why an invoice does
     not have one: the correction is a credit note, not a withdrawal. */
  it("asks for no reversal from a document that cannot be cancelled", () => {
    const sealed = collection({
      ...paper,
      document: {
        series: "P-{####}",
        amendable: false,
        cancel: { by: "refusing", instead: "credit note", why: "the customer holds it" },
        posts: [{ to: "ground", rule: "paper.posted" }],
      },
    } as never);
    expect(whyOf(bones({
      collections: [sealed],
      postings: { "paper.posted": { may: ran, post: ran } },
    } as Partial<AppSpec>))).toEqual([]);
  });

  it("says nothing about an app with neither", () => {
    const flat = collection({
      id: "note", label: { one: "Note", many: "Notes" },
      scope: { of: "tenant" }, permission: "paper", retention: null,
      onClose: { then: "purge" },
      fields: { about: field.text({ label: "About", holds: "none" }) },
    });
    expect(whyOf(bones({ collections: [flat] }))).toEqual([]);
  });

  /* ⚠️ AND IT IS CHECKED AT COMPOSITION, which is what makes it a build failure
     rather than a silence somebody finds in a quarter's figures. */
  it("stops the app composing at all", () => {
    expect(() => defineApp(bones())).toThrow(/paper\.posted/);
  });
});
