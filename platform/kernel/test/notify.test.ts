/**
 * WHAT A PRODUCT TELLS SOMEBODY, AND WHERE.
 *
 * ⚠️ EVERY FAILURE IN THIS FILE IS SILENT AT RUNTIME. A notification that goes
 * to the wrong people, says `undefined`, or is quietly suppressed produces no
 * error anywhere — the only signal is somebody eventually mentioning that they
 * never heard about something.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES, channelsFor, danglingLinks, destinationFor, render,
  type CollectionSpec, type NotificationDef, type Preferences,
} from "../src/index.js";

const told = (over: Partial<NotificationDef> = {}): NotificationDef => ({
  category: "activity", tone: "info", icon: "bell",
  title: "{who} did a thing", link: { to: "inbox" }, roles: ["owner"],
  ...over,
});

const prefs = (over: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...over });

/* ------------------------------------------------------------- channels --- */

describe("where one notification goes for one person", () => {
  it("reaches the inbox and, by default, an email", () => {
    expect(channelsFor(told(), prefs())).toEqual(["inbox", "email"]);
    expect(channelsFor(told(), prefs({ push: true }))).toEqual(["inbox", "email", "push"]);
  });

  /*
    ⚠️ THE INBOX IS NEVER OPTIONAL. Email and push can be declined, filtered, or
    sent to an address somebody has left — so a preference must remove the
    INTERRUPTION and never the information, or "I never got that" has no answer
    that does not depend on a mail provider.
  */
  it("keeps writing the inbox row for a category the person has muted", () => {
    expect(channelsFor(told(), prefs({ muted: ["activity"] }))).toEqual(["inbox"]);
    expect(channelsFor(told(), prefs({ muted: ["activity"], push: true }))).toEqual(["inbox"]);
  });

  it("leaves an unrelated category alone", () => {
    expect(channelsFor(told({ category: "billing" }), prefs({ muted: ["activity"] }))).toEqual(["inbox", "email"]);
  });

  /*
    ⚠️ AN `action` IS NEVER MUTED. It is the category that says nothing proceeds
    until somebody does something — a plan lapsing, a workspace about to be
    erased. Letting it be switched off makes the product silently stop working
    for whoever switched it off, and they will not connect the two.
  */
  it("refuses to let the one category that blocks the product be silenced", () => {
    expect(channelsFor(told({ category: "action" }), prefs({ muted: ["action"] }))).toEqual(["inbox", "email"]);
    expect(channelsFor(told({ category: "action" }), prefs({ muted: ["action"], email: false }))).toEqual(["inbox"]);
  });
});

/* -------------------------------------------------------------- copy --- */

describe("the copy is the manifest's", () => {
  it("interpolates the values a dispatch carried", () => {
    expect(render("{who} did a thing", { who: "Sam" })).toBe("Sam did a thing");
    expect(render("{n} days added", { n: 30 })).toBe("30 days added");
  });

  /*
    ⚠️ A MISSING VALUE LEAVES THE TOKEN IN PLACE. `undefined` in a sentence is
    plausible enough to ship — it reads as a bug in the data rather than a bug in
    the copy — while a visible `{who}` is obviously wrong to the first person who
    sees it, including the person who wrote it.
  */
  it("leaves a token it has no value for visible rather than printing undefined", () => {
    expect(render("{who} did a thing", {})).toBe("{who} did a thing");
    expect(render("{a} and {b}", { a: "x" })).toBe("x and {b}");
  });
});

/* ----------------------------------------------------------- destination --- */

describe("where a notification opens", () => {
  it("carries a collection and, for a row, the id the dispatch had", () => {
    expect(destinationFor(told({ link: { to: "collection", collection: "note" } }))).toEqual({ collection: "note" });
    expect(destinationFor(told({ link: { to: "row", collection: "note" } }), "n_1")).toEqual({ collection: "note", rowId: "n_1" });
    expect(destinationFor(told())).toEqual({});
  });

  /*
    ⚠️ A LINK NAMES A DECLARED COLLECTION. Four types in a shipping product
    pointed at a path that was not a route and one at a path whose route had been
    renamed; all five were wrong for three stages, because nothing rendered a
    notification and an integration test was asserting the broken path.
  */
  it("reports a link to a collection the app does not declare", () => {
    const collections = [{ id: "note" } as CollectionSpec];
    expect(danglingLinks({ a: told({ link: { to: "row", collection: "note" } }) }, collections)).toEqual([]);
    expect(danglingLinks({ a: told({ link: { to: "row", collection: "ghost" } }) }, collections)).toEqual(["a"]);
    expect(danglingLinks({ a: told() }, [])).toEqual([]);
  });
});
