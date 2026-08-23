/**
 * WHAT A MOVE BETWEEN SCREENS ACTUALLY DOES.
 *
 * ⚠️ REPORTED AS "IT TAKES SEVERAL TAPS, THEN GOES STUBBORN". Two defects, and
 * they compound.
 *
 * ⚠️ EVERY TAP ON THE BAR RAN A HIERARCHICAL PUSH. A move between two of the
 * five destinations had no answer of its own, so it took the push's — a full
 * `startViewTransition` at `DURATION.page`, on the move somebody makes dozens of
 * times an hour. And the wait is not the worst of it: the tree is swapped inside
 * the transition's callback while the browser goes on showing a picture of the
 * screen being left, so for the whole animation a tap lands on the NEW screen's
 * controls under the OLD screen's image. No duration fixes that; the mismatch is
 * the mechanism.
 *
 * ⚠️ AND A SECOND TAP CORRUPTED THE FIRST JOURNEY. Every call registered its own
 * tidy-up on its own `finished`, and an interrupted transition REJECTS — so
 * pressing again made the abandoned promise settle at once and the tidy-up ran
 * in the middle of the journey that replaced it, stripping the direction off the
 * root mid-animation. The more somebody pressed, the worse it got.
 *
 * ⚠️ THE WORLD IS STUBBED RATHER THAN DRIVEN IN CHROMIUM, and deliberately: what
 * is being asserted is whether a transition is STARTED and who tidies up after
 * it, which is a question about this module and not about how the pixels move.
 * The browser lane measures geometry; this measures the decision.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

let started: number;
let settle: ((ok: boolean) => void)[];
let root: { attrs: Record<string, string> };

beforeEach(() => {
  started = 0;
  settle = [];
  root = { attrs: {} };

  const element = {
    setAttribute: (k: string, v: string) => { root.attrs[k] = v; },
    removeAttribute: (k: string) => { delete root.attrs[k]; },
    getAttribute: (k: string) => root.attrs[k] ?? null,
    getAnimations: () => [],
    /* ⚠️ `land` WALKS THE PAGE FOR WHAT THE TRAVEL HELD STILL, and a stub
       without this throws inside a `.then` — which is an unhandled rejection,
       printed by nobody, leaving the direction on the root exactly as the bug
       being tested would. The first version of this file did that. */
    querySelectorAll: () => [],
  };

  vi.stubGlobal("document", {
    documentElement: element,
    querySelectorAll: () => [],
    querySelector: () => null,
    /* ⚠️ The real one commits the change and hands back a promise that REJECTS
       when a later transition supersedes it — which is the case this exists for. */
    startViewTransition: (change: () => void) => {
      started += 1;
      change();
      return {
        finished: new Promise<void>((ok, no) => {
          settle.push((fine) => (fine ? ok() : no(new Error("skipped"))));
        }),
      };
    },
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.resetModules();
});

const move = async () => (await import("../src/frame/travel.js")).travel;
const settled = () => new Promise((r) => setTimeout(r, 0));

describe("a lateral move", () => {
  it("changes the screen without starting a transition", async () => {
    const travel = await move();
    let changed = false;
    travel("lateral", () => { changed = true; });
    expect(changed, "a lateral move did not change the screen").toBe(true);
    expect(started, "a tab switch started a view transition").toBe(0);
    expect(root.attrs["data-travel"], "a lateral move marked a direction").toBeUndefined();
  });

  /* ⚠️ SYNCHRONOUSLY, WHICH IS THE WHOLE POINT. A change deferred by even one
     task is a frame in which the bar is lit for a screen that is not drawn —
     which is the picture somebody taps a second time. */
  it("changes it before the call returns", async () => {
    const travel = await move();
    const order: string[] = [];
    travel("lateral", () => order.push("changed"));
    order.push("returned");
    expect(order).toEqual(["changed", "returned"]);
  });
});

describe("a journey", () => {
  it("starts a transition and marks its direction", async () => {
    const travel = await move();
    travel("forward", () => undefined);
    expect(started).toBe(1);
    expect(root.attrs["data-travel"]).toBe("forward");
  });

  it("clears the direction when it lands", async () => {
    const travel = await move();
    travel("back", () => undefined);
    settle[0]!(true);
    await settled();
    expect(root.attrs["data-travel"], "a finished journey left its direction behind")
      .toBeUndefined();
  });

  /**
   * ⚠️ THE ONE THIS FILE EXISTS FOR. Pressing again while a journey is running
   * makes the browser skip the first, whose promise rejects — and the abandoned
   * journey used to tidy up after the one that replaced it, taking the direction
   * off the root while the new screen was still animating against it.
   */
  it("is not tidied up by the one it replaced", async () => {
    const travel = await move();
    travel("forward", () => undefined);
    travel("back", () => undefined);
    expect(started, "the second press did not start its own journey").toBe(2);

    /* The first is skipped the moment the second begins. */
    settle[0]!(false);
    await settled();
    expect(root.attrs["data-travel"],
      "the abandoned journey stripped the direction off the one still running")
      .toBe("back");

    settle[1]!(true);
    await settled();
    expect(root.attrs["data-travel"], "the current journey never landed").toBeUndefined();
  });
});

/* ⚠️ AND SOMEBODY WHO ASKED FOR LESS MOTION TAKES THE LATERAL LANE TOO. One
   path for "change the screen, now" is what stops the fast case rotting while
   the decorated one is maintained. */
describe("less motion", () => {
  it("changes the screen with no transition at all", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.resetModules();
    const travel = await move();
    let changed = false;
    travel("forward", () => { changed = true; });
    expect(changed).toBe(true);
    expect(started, "a person who asked for stillness got a view transition").toBe(0);
  });
});
