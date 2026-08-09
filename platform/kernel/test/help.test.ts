/**
 * HELP AND THE CHANGELOG — the two places a product speaks to somebody in their
 * own words, and the two that rot fastest.
 *
 * ⚠️ NEITHER FAILS AT RUNTIME. A help article that describes a screen the app
 * removed, and a changelog full of commit subjects, both render perfectly. The
 * only signal is that people stop reading them, and nobody reports that.
 */

import { describe, expect, it } from "vitest";
import {
  DEVELOPER_WORDS, EMPTY_SURFACE, LIMITS,
  danglingHelp, helpProblems, releaseProblems, removals, surfaceOf,
  type CollectionSpec, type HelpArticle,
} from "../src/index.js";

const collections = [{ id: "note" }, { id: "receipt" }] as CollectionSpec[];
const article = (over: Partial<HelpArticle> = {}): HelpArticle => ({
  title: "Keeping notes",
  body: "A note is a short piece of text you want to find again.",
  ...over,
});

/* ---------------------------------------------------------------- help --- */

describe("help is written for the person using the product", () => {
  it("accepts an article that says what a thing is and how to do it", () => {
    expect(helpProblems({ notes: article({ steps: ["Open Notes", "Write it", "Save"], surfaces: ["note"] }) }, collections)).toEqual([]);
  });

  /*
    ⚠️ LENGTH IS A CORRECTNESS PROPERTY. Help is read by somebody stuck, on a
    phone, in the middle of something else — past a screenful they stop reading
    and ask a human, which is the outcome the article existed to prevent.
  */
  it("refuses an article longer than somebody will read", () => {
    expect(helpProblems({ a: article({ body: "x".repeat(LIMITS.body + 1) }) }, collections)[0]!.why).toMatch(/over 900/);
    expect(helpProblems({ a: article({ title: "x".repeat(LIMITS.title + 1) }) }, collections)[0]!.why).toMatch(/over 60/);
  });

  it("refuses an eighth step, because that is a missing feature", () => {
    const steps = Array.from({ length: LIMITS.steps + 1 }, (_, i) => `Step ${i}`);
    expect(helpProblems({ a: article({ steps }) }, collections)[0]!.why).toMatch(/missing feature/);
  });

  /*
    ⚠️ EVERY WORD ON THE LIST MEANS THE AUTHOR WAS DESCRIBING THE IMPLEMENTATION
    RATHER THAN THE TASK. "The endpoint returns null" is true and unusable;
    "nothing is saved until you press Save" is the same fact, for somebody who
    has to act on it.
  */
  it("refuses developer vocabulary, singular or plural", () => {
    for (const word of DEVELOPER_WORDS) {
      const found = helpProblems({ a: article({ body: `The ${word} is fine.` }) }, collections);
      expect(found.map((f) => f.why).join(" "), word).toMatch(new RegExp(word));
    }
    expect(helpProblems({ a: article({ body: "Two endpoints exist." }) }, collections)[0]!.why).toMatch(/endpoint/);
  });

  /*
    Word boundaries, so a longer word that merely contains one is left alone —
    and a hyphenated use is NOT, because a hyphen is a boundary and "database-
    backed" is the same habit with punctuation in it.
  */
  it("leaves ordinary words that merely contain one alone", () => {
    expect(helpProblems({ a: article({ body: "Nullify the schematic if you like." }) }, collections)).toEqual([]);
    expect(helpProblems({ a: article({ body: "It is database-backed." }) }, collections)[0]!.why).toMatch(/database/);
  });

  it("refuses an article about a screen the app does not have", () => {
    expect(helpProblems({ a: article({ surfaces: ["ghost"] }) }, collections)[0]!.why).toMatch(/does not declare/);
    expect(helpProblems({ a: article({ surfaces: ["note", "receipt"] }) }, collections)).toEqual([]);
  });

  it("reports everything wrong at once rather than one sentence at a time", () => {
    expect(helpProblems({ a: article({ title: "", body: "", surfaces: ["ghost"] }) }, collections).length).toBe(3);
  });

  /*
    ⚠️ A CROSS-LINK IS RENDERED BESIDE AN ERROR, so whoever follows it is already
    stuck. A dead one is the second failure in a row, which is where people stop
    trying.
  */
  it("reports a link to an article nobody wrote", () => {
    expect(danglingHelp({ notes: article() }, ["notes", "ghost", "ghost"])).toEqual(["ghost"]);
    expect(danglingHelp({ notes: article() }, ["notes"])).toEqual([]);
  });
});

/* ------------------------------------------------------------- releases --- */

describe("a release note is product copy, not a commit message", () => {
  const ok = { version: "1.0.0", at: "2026-02-01", notes: ["You can now sell packages that renew."] };

  it("accepts a line somebody outside the team can act on", () => {
    expect(releaseProblems([ok])).toEqual([]);
  });

  it("refuses the four ways a commit subject gets pasted in", () => {
    const bad = (note: string) => releaseProblems([{ ...ok, notes: [note] }]);
    expect(bad("Fixed a crash in runtime/src/inbox.ts")[0]!.why).toBe("names a file");
    expect(bad("Closes #412")[0]!.why).toBe("names a pull request or issue number");
    expect(bad("Renamed the NotificationRegistry")[0]!.why).toBe("names a type");
    expect(bad("refactor the settle path")[0]!.why).toBe("reads as a commit subject");
  });

  it("refuses a version with no date and one with nothing to say", () => {
    expect(releaseProblems([{ ...ok, at: "soon" }])[0]!.why).toBe("is not a date");
    expect(releaseProblems([{ ...ok, notes: [] }])[0]!.why).toMatch(/no notes/);
  });
});

/* -------------------------------------------------------------- surface --- */

describe("what a manifest may stop offering", () => {
  const spec = {
    collections: [{ id: "note" }],
    access: { permissions: ["note:read"], plans: [{ id: "free" }], entitlements: { notes: true } },
    operations: [{ id: "notes.digest" }],
    notifications: { "plan.chosen": {} },
  };

  it("reads the parts somebody can be holding, sorted so a diff is stable", () => {
    expect(surfaceOf(spec)).toEqual({
      collections: ["note"], permissions: ["note:read"], plans: ["free"],
      entitlements: ["notes"], operations: ["notes.digest"], notifications: ["plan.chosen"],
    });
  });

  /*
    ⚠️ ADDITIONS ARE NEVER A PROBLEM AND REMOVALS ALWAYS ARE. Nobody holds
    something that did not exist; everybody holding something that is gone finds
    out by using it.
  */
  it("says nothing about anything new", () => {
    expect(removals(EMPTY_SURFACE, surfaceOf(spec), {})).toEqual([]);
  });

  it("reports a plan, a permission or an entitlement that disappeared", () => {
    const gone = removals(surfaceOf(spec), EMPTY_SURFACE, {});
    expect(gone.map((r) => `${r.kind}:${r.name}`).sort())
      .toEqual(["collections:note", "entitlements:notes", "notifications:plan.chosen", "operations:notes.digest", "permissions:note:read", "plans:free"]);
  });

  /*
    ⚠️ A DELETION LOOKS IDENTICAL TO A RENAME AND TO A TYPO, and the three need
    opposite fixes. Naming it as retired is what tells them apart.
  */
  it("accepts one that was retired on purpose, with a reason", () => {
    expect(removals(surfaceOf(spec), EMPTY_SURFACE, {
      note: "r", "note:read": "r", free: "r", notes: "r", "notes.digest": "r", "plan.chosen": "r",
    })).toEqual([]);
  });
});
