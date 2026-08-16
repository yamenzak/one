/**
 * THE HUB'S ADDRESSES — the whole information architecture, as a table.
 *
 * ⚠️ THIS IS WHAT MAKES THE HUB A ROUTE RATHER THAN A POPUP. Every screen has
 * an address somebody can link to, land on and reload; parsing is total, so a
 * mangled path is the root rather than a blank page; and leaving is decided by
 * where a screen SITS rather than by what its author remembered.
 */

import { describe, expect, it } from "vitest";
import {
  HUB, OF_CONSOLE, OF_WORKSPACE, above, inHub, nameOf, parseWhere, partsFor, pathOf,
} from "../src/hub/where.js";

describe("what belongs to the hub", () => {
  it("claims its own prefix and nothing else", () => {
    expect(inHub("/hub")).toBe(true);
    expect(inHub("/hub/you")).toBe(true);
    /* ⚠️ A workspace's own paths belong to the product — see the header. */
    expect(inHub("/")).toBe(false);
    expect(inHub("/clients")).toBe(false);
    expect(inHub("/hubbub")).toBe(false);
  });
});

describe("every screen has an address", () => {
  it("reads and writes each one back", () => {
    const every = [
      { at: "home" }, { at: "you" }, { at: "inbox" }, { at: "workspaces" },
      { at: "workspace", slug: "atlas" },
      ...OF_WORKSPACE.map((part) => ({ at: part, slug: "atlas" })),
      { at: "console" },
      ...OF_CONSOLE.map((part) => ({ at: part })),
    ] as const;

    for (const where of every) {
      const path = pathOf(where);
      expect(path.startsWith(HUB), path).toBe(true);
      expect(parseWhere(path), path).toEqual(where);
      /* ⚠️ Every screen says what it is, so the crown and the title agree. */
      expect(nameOf(where), path).toBeTruthy();
    }
  });

  /* ⚠️ TOTAL, AND THE SAFE ANSWER IS HOME. A route is a string somebody can
     type, an old link can carry and a redirect can mangle. */
  it("lands anything it cannot read on the root", () => {
    for (const path of ["/hub/nowhere", "/hub/w", "/hub/console/nothing", "/hub/w/atlas/nope", "/hub/"]) {
      const where = parseWhere(path);
      expect(["home", "workspaces", "workspace", "console"], path).toContain(where.at);
    }
    expect(parseWhere("/hub/nowhere")).toEqual({ at: "home" });
    /* A workspace with no part named is the workspace itself. */
    expect(parseWhere("/hub/w/atlas/nope")).toEqual({ at: "workspace", slug: "atlas" });
    expect(parseWhere("/hub/w")).toEqual({ at: "workspaces" });
  });

  it("ignores a trailing slash", () => {
    expect(parseWhere("/hub/")).toEqual({ at: "home" });
    expect(parseWhere("/hub/w/atlas/")).toEqual({ at: "workspace", slug: "atlas" });
  });
});

describe("what a workspace offers each role", () => {
  /*
    ⚠️ A ROW SOMEBODY CANNOT OPEN IS NOT DRAWN. A destination that answers 403
    is a promise the product does not keep, and nothing on the row tells the
    person whether they are refused or the product is broken.
  */
  it("offers a customer nothing their role cannot open", () => {
    expect(partsFor("customer")).not.toContain("money");
    expect(partsFor("customer")).not.toContain("wording");
    expect(partsFor("staff")).not.toContain("money");
    /* ⚠️ And somebody whose membership has not arrived yet is offered no more
       than a customer — an unknown role is never a generous one. */
    expect(partsFor(null)).toEqual(partsFor("customer"));
  });

  it("offers everything to whoever runs the workspace", () => {
    for (const role of ["owner", "manager"]) {
      expect(partsFor(role)).toEqual([...OF_WORKSPACE]);
    }
  });

  /* ⚠️ Every part it offers is one the parser can produce — a row into an
     address nothing reads is a row that lands on the hub's root. */
  it("names only real addresses", () => {
    for (const role of ["owner", "manager", "staff", "customer", null]) {
      for (const part of partsFor(role)) {
        expect(parseWhere(pathOf({ at: part, slug: "atlas" })).at).toBe(part);
      }
    }
  });
});

describe("leaving", () => {
  /* ⚠️ `null` is the root of the surface and is DISMISSED — the hub closes and
     returns somebody to whatever it was drawn over. */
  it("dismisses at the root and steps up everywhere else", () => {
    expect(above({ at: "home" })).toBe(null);
    expect(above({ at: "you" })).toEqual({ at: "home" });
    expect(above({ at: "workspaces" })).toEqual({ at: "home" });
    expect(above({ at: "workspace", slug: "atlas" })).toEqual({ at: "workspaces" });
    for (const part of OF_WORKSPACE) {
      expect(above({ at: part, slug: "atlas" })).toEqual({ at: "workspace", slug: "atlas" });
    }
    expect(above({ at: "console" })).toEqual({ at: "home" });
    for (const part of OF_CONSOLE) expect(above({ at: part })).toEqual({ at: "console" });
  });

  /* ⚠️ And going up always terminates. A cycle here is a back button that never
     leaves, which is the one navigation bug nobody can work around. */
  it("reaches the root from every screen", () => {
    const every = [
      { at: "you" }, { at: "inbox" }, { at: "workspaces" },
      { at: "workspace", slug: "atlas" },
      ...OF_WORKSPACE.map((part) => ({ at: part, slug: "atlas" })),
      { at: "console" }, ...OF_CONSOLE.map((part) => ({ at: part })),
    ] as const;

    for (const start of every) {
      let where: ReturnType<typeof above> = start;
      let steps = 0;
      while (where && steps < 10) { where = above(where); steps++; }
      expect(where, pathOf(start)).toBe(null);
    }
  });
});
