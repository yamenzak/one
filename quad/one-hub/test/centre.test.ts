/**
 * WHERE A PATH LANDS IN THE CENTRE — pure, so it is a table rather than a walk.
 *
 * ⚠️ EVERY PATH RESOLVES TO SOMETHING. A stop with no screen renders a blank
 * page, which is the same picture as a page that failed to load — so unknown
 * addresses land on Home, and areas the caller cannot reach resolve away
 * BEFORE they render rather than after their first refused call.
 */

import { describe, expect, it } from "vitest";
import { STOP_BRANCHES } from "../src/centre/Centre.js";
import { STOPS, stopFor } from "../src/console/Console.js";
import { AREAS, areasFor, parseStop, pathFor } from "../src/centre/route.js";

const APPS = ["kova", "hello"];
const OWNER = new Set(["member:read", "member:manage", "tenant:manage", "billing:read", "billing:manage"]);
const CUSTOMER = new Set<string>();

describe("the five areas", () => {
  it("is five, which is the ceiling (D10)", () => {
    expect(AREAS).toHaveLength(5);
  });

  it("resolves each area's route, gated by what the caller holds", () => {
    expect(parseStop("/", APPS, OWNER)).toEqual({ kind: "area", area: "home" });
    expect(parseStop("/people", APPS, OWNER)).toEqual({ kind: "area", area: "people" });
    expect(parseStop("/money", APPS, OWNER)).toEqual({ kind: "area", area: "money" });
    expect(parseStop("/settings", APPS, OWNER)).toEqual({ kind: "area", area: "settings" });
    expect(parseStop("/trust", APPS, OWNER)).toEqual({ kind: "area", area: "trust" });
    expect(parseStop("/inbox", APPS, OWNER)).toEqual({ kind: "area", area: "inbox" });
  });

  /* ⚠️ An area somebody cannot reach resolves AWAY — parsing `/people` for a
     customer would draw a screen whose every call the gate refuses. */
  it("sends a customer home from the areas their role cannot open", () => {
    expect(parseStop("/people", APPS, CUSTOMER)).toEqual({ kind: "area", area: "home" });
    expect(parseStop("/money", APPS, CUSTOMER)).toEqual({ kind: "area", area: "home" });
    expect(parseStop("/settings", APPS, CUSTOMER)).toEqual({ kind: "area", area: "settings" });
    expect(areasFor(CUSTOMER).map((a) => a.area)).toEqual(["home", "settings", "trust"]);
  });
});

describe("the apps under it", () => {
  it("routes an enabled product's screens inside the shell", () => {
    expect(parseStop("/kova", APPS, OWNER)).toEqual({ kind: "app", app: "kova", route: "/" });
    expect(parseStop("/kova/plans", APPS, OWNER)).toEqual({ kind: "app", app: "kova", route: "/plans" });
  });

  it("lands an unknown address on Home rather than on nothing", () => {
    expect(parseStop("/no-such-thing", APPS, OWNER)).toEqual({ kind: "area", area: "home" });
    expect(parseStop("/scena/wall", APPS, OWNER)).toEqual({ kind: "area", area: "home" });
  });

  it("writes the path back the way it parses it", () => {
    for (const path of ["/", "/people", "/money", "/settings", "/trust", "/inbox", "/kova", "/kova/plans"]) {
      expect(pathFor(parseStop(path, APPS, OWNER))).toBe(path);
    }
  });
});

describe("the console's stops", () => {
  /* ⚠️ Five is the ceiling (D10), and every path answers — an unknown one is
     the first screen rather than nothing. */
  it("is five destinations, and resolves every path", () => {
    expect(STOPS).toHaveLength(5);
    for (const stop of STOPS) expect(stopFor(stop.route)).toBe(stop.id);
    expect(stopFor("/no-such-thing")).toBe("tenants");
    expect(stopFor("")).toBe("tenants");
  });
});

describe("every stop has a branch", () => {
  /* ⚠️ The shell's dispatch and the parser must name the same set — a stop with
     no branch renders a blank page with every suite green. */
  it("draws each area and the app surface", () => {
    for (const a of AREAS) expect(STOP_BRANCHES).toContain(a.area);
    expect(STOP_BRANCHES).toContain("inbox");
    expect(STOP_BRANCHES).toContain("app");
  });
});
