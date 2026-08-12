/**
 * THE STEP A JOURNEY TAKES.
 *
 * ⚠️ EVERY CHECK HERE IS OF A RULE THAT FAILS SILENTLY. A movement in the wrong
 * direction is still a movement, a screen remounted on its way out still animates,
 * and a stagger released half a second late still plays — none of them throws,
 * none is visible in a screenshot, and all three are the reasonable-looking
 * simplification of what is written. There is nothing here about what a movement
 * LOOKS like: that is the stylesheet's, and looking at it is how it was judged.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Stack, directionOf, leavesOf, stepTo, type Level } from "../src/stack.js";

const root: Level = { at: null, move: null, leaving: null };

describe("a step decides its own direction", () => {
  /*
    ⚠️ THE ONE THAT MAKES A SHORTCUT WORK. A stack animates a CHANGE and never a
    first render — so a screen reached directly from somewhere else in a product
    arrives however its presentation arrives, rather than playing a movement back
    towards a parent it was not opened from. Written as "always animate", every
    deep link slides in from the side over an app that was never behind it.
  */
  it("plays no movement until something changes", () => {
    expect(stepTo({ at: "vault", move: null, leaving: null }, "vault", "x").move).toBe(null);
    const html = renderToStaticMarkup(<Stack at="vault">deep</Stack> as never);
    expect(html, "a screen opened directly carries a direction").not.toContain("data-move");
  });

  /* ⚠️ THE DIRECTION IS THE STEP, NOT THE DESTINATION. The same screen is arrived
     at going onward and departed from coming back, and only the step knows which. */
  it("goes onward away from the root and back to it", () => {
    expect(stepTo(root, "prefs", "home").move).toBe("onward");
    expect(stepTo({ at: "prefs", move: "onward", leaving: null }, null, "prefs").move).toBe("back");
  });

  /* ⚠️ A MOVE BETWEEN TWO SCREENS OF ONE LEVEL IS ONWARD, because pressing
     something on a surface is going into it whatever was on the surface before. */
  it("treats a move between two screens as onward", () => {
    expect(stepTo({ at: "prefs", move: "back", leaving: null }, "vault", "prefs").move).toBe("onward");
  });

  /*
    ⚠️ HOW A SCREEN ARRIVED OUTLIVES ITS ARRIVAL, and that is what keeps the
    section stagger suppressed inside it. Cleared when the movement ends — the
    obvious tidy-up, since the movement is over — every section of a screen that
    had already finished travelling would start rising one after another half a
    second late.
  */
  it("keeps the direction after the screen leaving has gone", () => {
    const moved = stepTo(root, "prefs", "home");
    const settled: Level = { ...moved, leaving: null };
    expect(settled.move, "the direction is cleared with the movement").toBe("onward");
    expect(leavesOf(settled, "prefs")).toHaveLength(1);
  });
});

describe("both screens are on the surface, and both are identified", () => {
  /*
    ⚠️ THE SCREEN LEAVING KEEPS ITS OWN KEY, WHICH IS WHAT STOPS IT REMOUNTING.
    React matches an array by key; give the pair one key, or render them as two
    sibling slots instead of an array, and the screen on its way out is mounted
    afresh in a slot that held nothing a moment ago — so a half-typed field clears
    and every effect re-runs, in full view, for the whole length of the movement.
  */
  it("carries the screen leaving under its own key", () => {
    const leaves = leavesOf(stepTo(root, "prefs", "home"), "prefs");
    expect(leaves.map((l) => [l.key, l.going, l.node]))
      .toEqual([["/", true, "home"], [":prefs", false, "prefs"]]);
  });

  it("gives every leaf a key, and never the same one twice", () => {
    const leaves = leavesOf(stepTo({ at: "a", move: null, leaving: null }, "b", "A"), "B");
    const keys = leaves.map((l) => l.key);
    expect(new Set(keys).size, "two screens share a key — they reconcile as one").toBe(keys.length);
  });

  /* ⚠️ THE ONE ARRIVING IS LAST, so it paints over the one leaving. Reversed, a
     screen going onward would slide in behind the screen it is replacing. */
  it("puts the screen arriving last", () => {
    const leaves = leavesOf(stepTo(root, "prefs", "home"), "prefs");
    expect(leaves.at(-1)?.going).toBe(false);
  });

  /*
    ⚠️ THE ROOT AND A SCREEN CANNOT COLLIDE, and the check is that they are in
    different namespaces rather than that the root's name is currently unused. A
    single reserved word for the root is a word some screen may one day be called,
    and the collision fails nowhere: the two reconcile as one element, so the
    screen arriving inherits the state of the root it replaced.
  */
  it("keys the root out of every namespace a screen can be in", () => {
    expect(leavesOf(root, "home")[0]!.key).toBe("/");
    for (const at of ["/", "root", "", "prefs"]) {
      expect(leavesOf({ at, move: null, leaving: null }, "x")[0]!.key,
        `a screen called ${JSON.stringify(at)} takes the root's key`).not.toBe("/");
    }
  });

  /*
    ⚠️ THE ONE THAT WAS WRONG IN USE AND RIGHT IN EVERY TEST. The direction was
    "is the destination the root", which is only correct for a flat level. With
    three depths — a list, a product, a document — leaving the document for its
    product is a destination that is not the root, so the surface played the
    onward movement: the screen you were returning to slid in from the far side
    over the one you were leaving, which is the picture of going DEEPER.
  */
  it("comes back when the destination is an ancestor, not only when it is the root", () => {
    expect(directionOf("legal/kova/privacy", "legal/kova")).toBe("back");
    expect(directionOf("legal/kova", "legal")).toBe("back");
    expect(directionOf("legal", null)).toBe("back");
  });

  it("goes onward when the destination is deeper", () => {
    expect(directionOf("legal", "legal/kova")).toBe("onward");
    expect(directionOf(null, "legal")).toBe("onward");
    expect(directionOf("legal/kova", "legal/kova/privacy")).toBe("onward");
  });

  /* ⚠️ SIDEWAYS IS ONWARD, and the prefix has to be a whole SEGMENT. Without the
     slash, `legal/kovax` reads as a child of `legal/kova` — two products whose
     names share a prefix, travelling the wrong way past each other. */
  it("treats a move between two screens at one depth as onward", () => {
    expect(directionOf("legal/kova", "legal/scena")).toBe("onward");
    expect(directionOf("legal/kovax", "legal/kova")).toBe("onward");
    expect(directionOf("details", "security")).toBe("onward");
  });
});
