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
import { parseStop, pathFor } from "../src/centre/route.js";
import { HUB_SCREENS } from "../src/hub/Hub.js";
import { OF_CONSOLE, OF_WORKSPACE, parseWhere, pathOf } from "../src/hub/where.js";

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

  /* ⚠️ THE HUB'S PREFIX IS RESERVED ON EVERY DOOR, and this is the half that
     bites here: a product screen at `/hub/anything` would be unreachable, and
     the app's author would find out from a person who could not open it. */
  it("never claims a hub address as a product's", () => {
    expect(parseStop("/hub", [...APPS, "hub"])).toEqual({ kind: "choose" });
    expect(parseStop("/hub/w/northwind/people", APPS)).toEqual({ kind: "choose" });
  });
});

describe("every address in the hub has a branch", () => {
  /* ⚠️ The frame's dispatch and the parser must name the same set — an address
     with no branch renders a blank page with every suite green. */
  it("draws every screen the parser can produce", () => {
    const reachable = [
      "/hub", "/hub/you", "/hub/inbox", "/hub/workspaces", "/hub/w/northwind",
      ...OF_WORKSPACE.map((p) => `/hub/w/northwind/${p}`),
      "/hub/console",
      ...OF_CONSOLE.map((p) => `/hub/console/${p}`),
    ];
    for (const path of reachable) {
      expect(HUB_SCREENS, path).toContain(parseWhere(path).at);
    }
  });

  it("names no screen the parser can never produce", () => {
    const produced = new Set(HUB_SCREENS.map((at) =>
      at === "workspace" || (OF_WORKSPACE as readonly string[]).includes(at)
        ? parseWhere(pathOf({ at, slug: "northwind" } as never)).at
        : parseWhere(pathOf({ at } as never)).at));
    for (const at of HUB_SCREENS) expect(produced, at).toContain(at);
  });
});
