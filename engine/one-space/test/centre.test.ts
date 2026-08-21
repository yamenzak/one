/**
 * WHERE A PATH LANDS ON A WORKSPACE'S OWN ADDRESS — pure, so it is a table
 * rather than a walk.
 *
 * ⚠️ EVERY PATH RESOLVES TO SOMETHING. A stop with no screen renders a blank
 * page, which is the same picture as a page that failed to load — so an
 * unknown address lands on the choice of product rather than on nothing.
 *
 * ⚠️ AND ONE PRODUCT IS NOT A CHOICE. A chooser with a single card is a screen
 * whose entire content is a button, so a workspace with one app opens it.
 */

import { describe, expect, it } from "vitest";
import { parseStop, pathFor, routeIn } from "../src/centre/route.js";
import { SPACE_SCREENS } from "../src/space/OneSpace.js";
import { OF_CONSOLE, OF_WORKSPACE, parseWhere, pathOf } from "../src/space/where.js";

const APPS = ["hello", "atlas"];

describe("the product under a workspace's address", () => {
  it("routes a product's screens by its own id", () => {
    expect(parseStop("/hello", APPS)).toEqual({ kind: "app", app: "hello", route: "/" });
    expect(parseStop("/hello/plans", APPS)).toEqual({ kind: "app", app: "hello", route: "/plans" });
  });

  it("opens the only product rather than offering a choice of one", () => {
    expect(parseStop("/", ["hello"])).toEqual({ kind: "app", app: "hello", route: "/" });
    expect(parseStop("/", APPS)).toEqual({ kind: "choose" });
    /* ⚠️ And nothing switched on is still a screen, never a blank page. */
    expect(parseStop("/", [])).toEqual({ kind: "choose" });
  });

  it("lands an unknown address on the choice rather than on nothing", () => {
    expect(parseStop("/no-such-thing", APPS)).toEqual({ kind: "choose" });
    expect(parseStop("/nowhere/wall", APPS)).toEqual({ kind: "choose" });
  });

  it("writes the path back the way it parses it", () => {
    for (const path of ["/", "/hello", "/hello/plans", "/atlas"]) {
      expect(pathFor(parseStop(path, APPS))).toBe(path);
    }
  });

  /* ⚠️ THE SPACE'S PREFIX IS RESERVED ON EVERY DOOR, and this is the half that
     bites here: a product screen at `/space/anything` would be unreachable, and
     the app's author would find out from a person who could not open it. */
  it("never claims a OneSpace address as a product's", () => {
    expect(parseStop("/space", [...APPS, "space"])).toEqual({ kind: "choose" });
    expect(parseStop("/space/w/northwind/people", APPS)).toEqual({ kind: "choose" });
  });
});

describe("every address in OneSpace has a branch", () => {
  /*
    ⚠️ THIS TEST DID NOT CATCH THE THING IT WAS WRITTEN FOR, TWICE. It compares
    what the parser produces against a hand-written list of screen names — and
    `brand` and the stores screen were both on that list while the dispatch drew
    neither, so `/space/w/<slug>/brand` and the console's own store list rendered a blank page
    with every suite green. A list agreeing with a list proves the two lists
    agree; it says nothing about the code.

    ⚠️ WHAT REPLACED IT IS A `never` ASSERTION at the end of `Inside`, so an
    unanswered address is a BUILD failure. What survives here is the direction a
    compiler cannot see: an address the parser can never produce.
  */
  it("draws every screen the parser can produce", () => {
    const reachable = [
      "/space", "/space/you", "/space/inbox", "/space/workspaces", "/space/w/northwind",
      ...OF_WORKSPACE.map((p) => `/space/w/northwind/${p}`),
      "/space/console",
      ...OF_CONSOLE.map((p) => `/space/console/${p}`),
    ];
    /* ⚠️ Named so a shrinking list is visible: both misses were a screen
       QUIETLY absent from a set somebody was counting. */
    expect(reachable.length).toBe(5 + OF_WORKSPACE.length + 1 + OF_CONSOLE.length);
    for (const path of reachable) {
      expect(SPACE_SCREENS, path).toContain(parseWhere(path).at);
    }
  });

  it("names no screen the parser can never produce", () => {
    const produced = new Set(SPACE_SCREENS.map((at) =>
      at === "workspace" || (OF_WORKSPACE as readonly string[]).includes(at)
        ? parseWhere(pathOf({ at, slug: "northwind" } as never)).at
        : parseWhere(pathOf({ at } as never)).at));
    for (const at of SPACE_SCREENS) expect(produced, at).toContain(at);
  });
});

/**
 * A PRODUCT'S SCREENS REACH EACH OTHER, AND THE PREFIX IS THE PLATFORM'S.
 *
 * ⚠️ AN APP MUST NEVER KNOW WHERE IT WAS MOUNTED. A screen writing
 * `/inventory/thing` has learned the centre's address scheme, and the day
 * products are addressed differently every list in every app opens a page that
 * does not exist. `AppScreen.go` takes the app's OWN route and `routeIn` adds
 * the rest — for the nav and for a row inside a screen alike, which is why it is
 * one function: it was two copies of one expression on either side of a file
 * boundary.
 */
describe("an app's own route as an address", () => {
  it("adds the product's prefix and nothing else", () => {
    expect(routeIn("inventory", "/thing")).toBe("/inventory/thing");
    expect(routeIn("hello", "/write")).toBe("/hello/write");
  });

  /* ⚠️ THE ROOT IS THE APP ITSELF. A trailing slash is a different string to
     every router and to `parseStop`, so the one route every app has is the one
     most likely to be got wrong. */
  it("leaves no trailing slash on the route every app has", () => {
    expect(routeIn("inventory", "/")).toBe("/inventory");
  });

  /* ⚠️ AND IT IS THE INVERSE OF THE PARSE, which is what makes a screen reached
     from a row and the same screen reached from the bar one address. */
  it("round-trips through the parser", () => {
    for (const route of ["/", "/thing", "/where", "/start"]) {
      expect(parseStop(routeIn("hello", route), APPS))
        .toEqual({ kind: "app", app: "hello", route });
    }
  });
});
