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
  DEFAULT_PREFERENCES, channelsFor, danglingLinks, destinationFor, inAudience, refusePolicy, render,
  unknownNeeds,
  type CollectionSpec, type NotificationDef, type Preferences,
} from "../src/index.js";

const told = (over: Partial<NotificationDef> = {}): NotificationDef => ({
  category: "activity", tone: "info", icon: "bell",
  title: "{who} did a thing", link: { to: "inbox" }, roles: ["owner"], needs: "thing:read",
  ...over,
});

const prefs = (over: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...over });

/* ------------------------------------------------------------- channels --- */

describe("where one notification goes for one person", () => {
  it("reaches the inbox and, by default, an email", () => {
    expect(channelsFor(told(), prefs())).toEqual(["inbox", "email"]);
    expect(channelsFor(told(), prefs({ email: false }))).toEqual(["inbox"]);
  });

  /*
    ⚠️ THE INBOX IS NEVER OPTIONAL. Email can be declined, filtered, or sent to an
    address somebody has left — so a preference must remove the INTERRUPTION and
    never the information, or "I never got that" has no answer that does not
    depend on a mail provider.
  */
  it("keeps writing the inbox row for a category the person has muted", () => {
    expect(channelsFor(told(), prefs({ muted: ["activity"] }))).toEqual(["inbox"]);
    expect(channelsFor(told(), prefs({ muted: ["activity"], email: false }))).toEqual(["inbox"]);
  });

  /*
    ⚠️ A CHANNEL IS A PROMISE ABOUT DELIVERY, and `push` was removed from this
    platform once for breaking it: a switch somebody could turn on with nothing
    behind it, which is worse than an absent feature because they turn it on and
    stop watching their inbox. `available` is what keeps the promise now — a
    deployment with no keys does not OFFER it, and the record is written anyway.
  */
  it("puts nothing on a channel this deployment cannot deliver", () => {
    expect(channelsFor(told(), prefs({ push: true }))).toEqual(["inbox", "email", "push"]);
    expect(channelsFor(told(), prefs({ push: true }), {}, ["inbox", "email"])).toEqual(["inbox", "email"]);
    expect(channelsFor(told(), prefs({ push: true, email: true }), {}, ["inbox"])).toEqual(["inbox"]);
  });

  /* ⚠️ And it is off until somebody asks for it: an address was given to us, a
     device notification is a permission a browser asks for at a moment somebody
     chose, and defaulting it on describes a subscription nobody made. */
  it("does not push until somebody has asked to be pushed to", () => {
    expect(channelsFor(told(), prefs())).not.toContain("push");
  });

  /* ---------------------------------------------------- the tenant's ceiling --- */

  /*
    ⚠️ TWO LEVELS, AND THE WORKSPACE'S IS THE CEILING. A studio that does not
    want its clients emailed about every published programme is making a decision
    about its own business; a person then chooses within what is left. The other
    order cannot work — somebody cannot opt into a channel their workspace has
    turned off, because the switch would do nothing and say nothing.
  */
  it("lets a workspace narrow the channels a person may then choose from", () => {
    expect(channelsFor(told(), prefs({ push: true }), { channels: ["inbox"] })).toEqual(["inbox"]);
    expect(channelsFor(told(), prefs({ push: true }), { channels: ["inbox", "push"] })).toEqual(["inbox", "push"]);
  });

  /* ⚠️ ABSENT IS THE PRODUCT'S DEFAULT, NEVER "OFF". A workspace that has never
     opened the screen must behave exactly as it did before the screen existed,
     or shipping this silences every deployment that upgrades. */
  it("changes nothing at all for a workspace that has decided nothing", () => {
    expect(channelsFor(told(), prefs())).toEqual(channelsFor(told(), prefs(), {}));
  });

  it("sends nothing at all for a type its workspace switched off", () => {
    expect(channelsFor(told(), prefs(), { off: true })).toEqual([]);
  });

  /*
    ⚠️ AND AN `action` MAY NOT BE SWITCHED OFF BY THE WORKSPACE EITHER. Refused
    at the write, so the state cannot exist — the person it would silently stop
    the product working for is not the person who pressed the switch.
  */
  it("refuses a workspace switching off the category that blocks the product", () => {
    const registry = { "thing.happened": told({ category: "action" }), "other.thing": told() };
    expect(refusePolicy(registry, "thing.happened", { off: true })).toBe("action_off");
    expect(refusePolicy(registry, "other.thing", { off: true })).toBe(null);
    expect(refusePolicy(registry, "ghost", { off: true })).toBe("unknown_type");
    expect(refusePolicy(registry, "other.thing", { channels: ["carrier-pigeon" as never] })).toBe("unknown_channel");
  });

  /* ---------------------------------------------------------- who gets it --- */

  /*
    ⚠️ A ROLE A WORKSPACE COMPOSED FOR ITSELF IS NOT IN THE MANIFEST and never
    will be, so matching the NAME answers "no" for every one of them — which is
    somebody in a workspace for a month being told nothing while everything else
    works. The permission is the test their role CAN pass.
  */
  it("tells a role the product never heard of, by what it may read", () => {
    const declared = new Set(["owner", "client"]);
    const front = { role: "front-desk", permissions: new Set(["thing:read"]) };
    expect(inAudience(told(), front, declared)).toBe(true);
    expect(inAudience(told(), { role: "front-desk", permissions: new Set<string>() }, declared)).toBe(false);
  });

  /*
    ⚠️ AND A DECLARED ROLE STILL HAS TO BE LISTED, so the permission only ever
    widens to roles the manifest could not know about. "A check-in was filed" is
    for whoever supervises rather than for the client who filed it, and both hold
    the key — which is a distinction a permission cannot express and `roles` can.
  */
  it("never widens a role the product did name", () => {
    const declared = new Set(["owner", "client"]);
    expect(inAudience(told(), { role: "client", permissions: new Set(["thing:read"]) }, declared)).toBe(false);
    expect(inAudience(told(), { role: "owner", permissions: new Set(["thing:read"]) }, declared)).toBe(true);
  });

  /* ⚠️ A `needs` nobody declares is held by nobody, so the type reaches nobody —
     for ever, from a registry that looks complete. */
  it("refuses a type whose permission no role could ever hold", () => {
    expect(unknownNeeds({ "thing.happened": told() }, ["thing:read"])).toEqual([]);
    expect(unknownNeeds({ "thing.happened": told() }, ["other:read"])).toEqual(["thing.happened"]);
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
