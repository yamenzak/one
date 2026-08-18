/**
 * THE SPACE'S ADDRESSES — the whole information architecture, as a table.
 *
 * ⚠️ THIS IS WHAT MAKES THE SPACE A ROUTE RATHER THAN A POPUP. Every screen has
 * an address somebody can link to, land on and reload; parsing is total, so a
 * mangled path is the root rather than a blank page; and leaving is decided by
 * where a screen SITS rather than by what its author remembered.
 */

import { describe, expect, it } from "vitest";
import {
  SPACE, OF_CONSOLE, OF_WORKSPACE, above, inSpace, nameOf, parseWhere, partsFor, pathOf,
} from "../src/space/where.js";

describe("what belongs to OneSpace", () => {
  it("claims its own prefix and nothing else", () => {
    expect(inSpace("/space")).toBe(true);
    expect(inSpace("/space/you")).toBe(true);
    /* ⚠️ A workspace's own paths belong to the product — see the header. */
    expect(inSpace("/")).toBe(false);
    expect(inSpace("/clients")).toBe(false);
    expect(inSpace("/spacebar")).toBe(false);
  });
});

/*
  ⚠️ A PREFERENCE AND AN ADMINISTRATION ARE TWO DESTINATIONS. The level of a
  setting is an AUTHORITY (DESIGN.md §3's first question), so what a workspace is
  set to and what one person prefers are not two halves of one screen — they were
  stacked on the workspace's settings surface, which also put the preference
  behind `tenant:manage` and hid it from everybody else.
*/
describe("a preference is not a workspace's setting", () => {
  it("files your own preferences under you, and steps back there", () => {
    expect(pathOf({ at: "prefs" })).toBe(`${SPACE}/prefs`);
    expect(above({ at: "prefs" })).toEqual({ at: "you" });
    /* ⚠️ And it descends the same two levels, so back goes up one at a time. */
    expect(above({ at: "prefs", app: "hello", area: "notes" }))
      .toEqual({ at: "prefs", app: "hello" });
    expect(above({ at: "prefs", app: "hello" })).toEqual({ at: "prefs" });
  });

  it("steps back through a workspace's settings one page at a time", () => {
    expect(above({ at: "settings", slug: "atlas", app: "hello", area: "notes" }))
      .toEqual({ at: "settings", slug: "atlas", app: "hello" });
    expect(above({ at: "settings", slug: "atlas", app: "hello" }))
      .toEqual({ at: "settings", slug: "atlas" });
    expect(above({ at: "settings", slug: "atlas" }))
      .toEqual({ at: "workspace", slug: "atlas" });
  });
});

describe("every screen has an address", () => {
  it("reads and writes each one back", () => {
    const every = [
      { at: "home" }, { at: "you" }, { at: "inbox" }, { at: "told" }, { at: "workspaces" },
      /* ⚠️ YOURS, NOT A WORKSPACE'S — so it carries no slug, and it descends by
         product and then by page exactly as the workspace's own settings do. */
      { at: "prefs" }, { at: "prefs", app: "hello" },
      { at: "prefs", app: "hello", area: "appearance" },
      { at: "settings", slug: "atlas", app: "hello" },
      { at: "settings", slug: "atlas", app: "hello", area: "notes" },
      { at: "workspace", slug: "atlas" },
      ...OF_WORKSPACE.map((part) => ({ at: part, slug: "atlas" })),
      { at: "console" },
      ...OF_CONSOLE.map((part) => ({ at: part })),
    ] as const;

    for (const where of every) {
      const path = pathOf(where);
      expect(path.startsWith(SPACE), path).toBe(true);
      expect(parseWhere(path), path).toEqual(where);
      /* ⚠️ Every screen says what it is, so the crown and the title agree. */
      expect(nameOf(where), path).toBeTruthy();
    }
  });

  /* ⚠️ TOTAL, AND THE SAFE ANSWER IS HOME. A route is a string somebody can
     type, an old link can carry and a redirect can mangle. */
  it("lands anything it cannot read on the root", () => {
    for (const path of ["/space/nowhere", "/space/w", "/space/console/nothing", "/space/w/atlas/nope", "/space/"]) {
      const where = parseWhere(path);
      expect(["home", "workspaces", "workspace", "console"], path).toContain(where.at);
    }
    expect(parseWhere("/space/nowhere")).toEqual({ at: "home" });
    /* A workspace with no part named is the workspace itself. */
    expect(parseWhere("/space/w/atlas/nope")).toEqual({ at: "workspace", slug: "atlas" });
    expect(parseWhere("/space/w")).toEqual({ at: "workspaces" });
  });

  it("ignores a trailing slash", () => {
    expect(parseWhere("/space/")).toEqual({ at: "home" });
    expect(parseWhere("/space/w/atlas/")).toEqual({ at: "workspace", slug: "atlas" });
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
     address nothing reads is a row that lands on OneSpace's root. */
  it("names only real addresses", () => {
    for (const role of ["owner", "manager", "staff", "customer", null]) {
      for (const part of partsFor(role)) {
        expect(parseWhere(pathOf({ at: part, slug: "atlas" })).at).toBe(part);
      }
    }
  });
});

describe("leaving", () => {
  /* ⚠️ `null` is the root of the surface and is DISMISSED — OneSpace closes and
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
