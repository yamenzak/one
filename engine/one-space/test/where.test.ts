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
  SPACE, OF_AI, OF_CONSOLE, OF_WORKSPACE, above, groundOf, inSpace, isConsole, nameOf,
  parseWhere, partsFor, pathOf,
} from "../src/space/where.js";
import { saying } from "../src/console/Switches.js";
import { LANES } from "@engine/kernel";

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
      /* ⚠️ AND EVERYTHING INSIDE AN AREA. This list named the top level only, so
         the four AI screens were never walked — which is how both of the faults
         the block below is about survived a suite that was already asking the
         right question one level up. */
      ...OF_AI.map((part) => ({ at: part })),
    ] as const;

    for (const start of every) {
      let where: ReturnType<typeof above> = start;
      let steps = 0;
      while (where && steps < 10) { where = above(where); steps++; }
      expect(where, pathOf(start)).toBe(null);
    }
  });
});

/*
  ⚠️ AN AREA IS A LEVEL, AND TWO THINGS HAVE TO AGREE WITH THAT — the way out and
  the material. Both read the address, both got it wrong for the AI area, and
  neither failed: the arrow went one level too far and the ground under three
  screens was a workspace's. A person sees a seam and a back button that
  overshoots; nothing throws, and no existing test looked inside an area.

  ⚠️ EVERY ASSERTION HERE IS DERIVED FROM `OF_AI`, so the fifth sub-page is
  covered on the day it is added rather than the day somebody remembers.
*/
describe("a screen inside an area", () => {
  it("is addressed inside it", () => {
    for (const part of OF_AI) {
      expect(pathOf({ at: part } as never), part).toMatch(
        new RegExp(`^${pathOf({ at: "ai" } as never)}/`));
    }
  });

  /* ⚠️ THE ARROW GOES UP ONE LEVEL, NEVER PAST ONE. The path says the screen is
     inside the area, so the way out of it is the area — landing on the console
     skips the page somebody just came through. */
  it("leaves upwards to its area, not past it", () => {
    for (const part of OF_AI) {
      expect(above({ at: part } as never), part).toEqual({ at: "ai" });
    }
  });

  /* ⚠️ AND STANDS ON THE SAME MATERIAL. The area and its pages are one place;
     two materials inside one place is a seam on every trip into it. */
  it("stands on the area's own ground", () => {
    const area = groundOf({ at: "ai" } as never);
    for (const part of OF_AI) {
      expect(groundOf({ at: part } as never), part).toBe(area);
    }
  });

  /*
    ⚠️ AND THE TWO QUESTIONS ABOUT THE OPERATOR'S SIDE ANSWER THE SAME WAY. They
    were separate derivations and only one had been taught about areas — the one
    that picks the material had not, which is the whole of the second fault.
  */
  it("is the operator's side by both of the tests that ask", () => {
    for (const part of [...OF_CONSOLE, ...OF_AI]) {
      expect(isConsole({ at: part } as never), part).toBe(true);
    }
  });
});

/**
 * A LANE IS AN ADDRESS, AND THAT IS WHAT MAKES DESCENDING FREE.
 *
 * ⚠️ THE CATALOGUE WAS ONE FLAT SCROLL OF SIXTY MODELS because a lane had
 * nowhere to be. Six rows that descend answer "does anything answer text, and
 * which one wins" at a glance — but only if the lane is in the path: held as
 * component state it cannot be linked to, landed on, or gone BACK from, and the
 * crown's arrow would leave the whole catalogue from inside one of its lanes.
 */
describe("one lane of the catalogue", () => {
  it("is an address under the catalogue", () => {
    expect(pathOf({ at: "models", lane: "text" })).toBe(`${pathOf({ at: "models" })}/text`);
  });

  it("survives the round trip", () => {
    for (const lane of LANES) {
      expect(parseWhere(pathOf({ at: "models", lane }))).toEqual({ at: "models", lane });
    }
  });

  /* ⚠️ TOTAL: a lane nobody has is the catalogue, never a blank screen. */
  it("reads an unknown lane as the catalogue itself", () => {
    expect(parseWhere(`${pathOf({ at: "models" })}/telepathy`)).toEqual({ at: "models" });
  });

  /* ⚠️ UP ONE LEVEL, NEVER PAST ONE — a lane goes to the catalogue and the
     catalogue goes to the area. Both arrows skipping to the console is the fault
     this file already caught once, one level higher. */
  it("leaves upwards to the catalogue, and the catalogue to its area", () => {
    expect(above({ at: "models", lane: "text" })).toEqual({ at: "models" });
    expect(above({ at: "models" })).toEqual({ at: "ai" });
  });

  /* ⚠️ SAID, NOT PRINTED. `text` is a key in a closed set (DESIGN.md §1.9). */
  it("is named by the lane rather than by its key", () => {
    expect(nameOf({ at: "models", lane: "text" })).toBe("Text");
    expect(nameOf({ at: "models" })).toBe("Models");
  });
});

/* ------------------------------------------------------------- a switch --- */

/**
 * ⚠️ WHAT A SWITCH ROW SAYS, AND IT CARRIES ONE FACT OF FOUR. The stage, the
 * state, the exception count and the retirement date are each true and only one
 * of them is ever the thing worth knowing — so the row says the most alarming
 * true one and the reader is not left to work out which mattered.
 *
 * ⚠️ AND THE OVERDUE LINE MOVED HERE FROM `FlagConsole`, which is deleted. A
 * flag past its date is REPORTED, never enforced: withholding a capability
 * because of a date somebody typed a year ago is an outage nobody asked for.
 */
describe("what a switch's row says", () => {
  const def = {
    id: "note-search", label: "Search", why: "Being tried before it goes to everybody.",
    stage: "trying" as const, fallback: false, setBy: "tenant" as const,
  };

  it("says the retirement first, because it outranks every other true thing", () => {
    expect(saying(def, true, { on: 4, off: 0 }, true))
      .toBe("Past its retirement date — this should be the product now");
  });

  /* ⚠️ THREE STATES, AND THE MIDDLE ONE IS WHERE A TRIAL LIVES. "Off" and "off
     unless a workspace says so" are different facts and the second is the one
     that leaves room for a customer to be given the feature. */
  it("tells an unset switch apart from one we have turned off", () => {
    expect(saying(def, undefined, undefined, false)).toBe("Off unless a workspace says so");
    expect(saying({ ...def, fallback: true }, undefined, undefined, false))
      .toBe("On unless a workspace says otherwise");
    expect(saying(def, false, undefined, false)).toBe("Off for everybody");
  });

  /* ⚠️ AND "ON FOR EVERYBODY" OVER ELEVEN EXCEPTIONS IS TRUE AND MISLEADING. */
  it("counts the workspaces that differ", () => {
    expect(saying(def, true, { on: 1, off: 0 }, false)).toBe("On for everybody · 1 workspace differs");
    /* ⚠️ AND THE VERB AGREES. "11 workspaces differs" is a sentence nobody wrote
       and it is what a bare count-plus-suffix produces. */
    expect(saying(def, true, { on: 4, off: 7 }, false))
      .toBe("On for everybody · 11 workspaces differ");
  });
});
