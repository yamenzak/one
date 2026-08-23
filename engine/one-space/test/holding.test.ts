/**
 * WHAT THE TAB HOLDS: BOUNDED, AND DROPPED WHEN IT STOPS BEING DATABLE.
 *
 * ⚠️ THE STORE ONLY EVER GREW. `forget` runs when a write says an answer is
 * untrue; nothing ran when an answer was merely old and unwanted. A long session
 * moving through workspaces, lists and narrowings kept every payload for as long
 * as the tab was open — on a phone, memory a background tab is killed for, and
 * nothing anywhere reporting it.
 *
 * ⚠️ AND A TAB LEFT OPEN CAME BACK CONFIDENT. A phone locked in a pocket, a
 * laptop shut, a tab behind eleven others: it returned showing whatever was true
 * when it was last looked at, with nothing saying how old that was, and the only
 * thing that refreshed it was navigating somewhere that happened to re-ask.
 *
 * ⚠️ THIS IS WHY THERE IS NO QUERY LIBRARY HERE. Keeping, coalescing,
 * invalidating and revalidating are the four things one would be for, and all
 * four are the door's — with invalidation DECLARED by the operation rather than
 * written out at every call site. Asserting them is what earns that.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

let asked = 0;
let visibility = "visible";
let page: EventTarget;

/**
 * ⚠️ THE LISTENERS ARE REGISTERED AT IMPORT, SO THE WORLD IS BUILT FIRST. Both
 * are guarded on the host having a `document` and an `addEventListener` — this
 * suite runs in node, which has neither — so a test that imported the door and
 * then stubbed would be asserting against a module that registered nothing.
 *
 * ⚠️ AND EVENTS ARE DISPATCHED, NEVER HANDLERS CALLED. What is being asserted is
 * that the door LISTENS; a handler invoked directly proves the body works and
 * says nothing about whether anything will ever run it.
 */
beforeEach(() => {
  asked = 0;
  visibility = "visible";

  const world = new EventTarget();
  page = new EventTarget();
  vi.stubGlobal("addEventListener", world.addEventListener.bind(world));
  vi.stubGlobal("dispatchEvent", world.dispatchEvent.bind(world));
  vi.stubGlobal("document", {
    addEventListener: page.addEventListener.bind(page),
    dispatchEvent: page.dispatchEvent.bind(page),
    get visibilityState() { return visibility; },
  });

  vi.stubGlobal("fetch", () => {
    asked += 1;
    return Promise.resolve(new Response(JSON.stringify({ ok: true, n: asked }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  });
  /* ⚠️ A FRESH MODULE PER TEST, because the store is module state by design —
     one per tab. Sharing it across tests would make each depend on the order
     the others ran in. */
  vi.resetModules();
});

const door = async () => (await import("../src/api.js")).api;

const wentAway = (ms: number) => {
  visibility = "hidden";
  page.dispatchEvent(new Event("visibilitychange"));
  vi.setSystemTime(Date.now() + ms);
  visibility = "visible";
  page.dispatchEvent(new Event("visibilitychange"));
};

describe("what a tab keeps", () => {
  /**
   * ⚠️ `get` ALWAYS REVALIDATES, AND `known` IS THE INSTANT HALF. That split is
   * the design: a screen draws from `known` synchronously — no frame of skeleton
   * over an answer the tab already holds — while the request goes out anyway and
   * replaces it when it lands. A `get` that answered from the store instead
   * would make every revisit show a remembered answer and never correct it.
   */
  it("holds the answer for the next screen, and still asks again", async () => {
    const api = await door();
    await api.get("centre.view");
    expect(api.known("centre.view"), "nothing was kept for the next visit")
      .toBeDefined();
    await api.get("centre.view");
    expect(asked, "a repeat read did not revalidate").toBe(2);
  });

  /* ⚠️ ONE ASKING PER QUESTION IN FLIGHT. Three blocks mounting in one frame
     that each want the catalogue is three identical queries a frame apart. */
  it("coalesces two callers wanting the same thing at once", async () => {
    const api = await door();
    await Promise.all([api.get("guide.view"), api.get("guide.view")]);
    expect(asked, "concurrent identical reads were not shared").toBe(1);
  });

  it("keeps a bounded number of them", async () => {
    const api = await door();
    for (let i = 0; i < 200; i += 1) await api.get("list", { page: String(i) });

    /* ⚠️ COUNTED THROUGH THE DOOR'S OWN READER rather than by reaching into the
       Map — a test that inspects the private store passes on an implementation
       that no longer answers anybody. */
    let held = 0;
    for (let i = 0; i < 200; i += 1) {
      if (api.known("list", { page: String(i) }) !== undefined) held += 1;
    }
    expect(held, `${held} answers held after 200 reads — the store is unbounded`)
      .toBeLessThanOrEqual(64);
    expect(held, "nothing was kept at all, which is a cache that never answers")
      .toBeGreaterThan(0);
  });

  /* ⚠️ OLDEST OUT. Evicting the most recent would throw away what the screen
     somebody is looking at was drawn from, which is the one thing eviction must
     never do. */
  it("drops what nothing has asked for longest", async () => {
    const api = await door();
    for (let i = 0; i < 200; i += 1) await api.get("list", { page: String(i) });
    expect(api.known("list", { page: "0" }), "the first read survived 200 later ones")
      .toBeUndefined();
    expect(api.known("list", { page: "199" }), "the most recent read was evicted")
      .toBeDefined();
  });
});

describe("what a tab stops trusting", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("drops what it holds after a long time away", async () => {
    const api = await door();
    await api.get("centre.view");
    wentAway(120_000);
    expect(api.known("centre.view"),
      "a tab shut for two minutes came back sure of what it held")
      .toBeUndefined();
  });

  /**
   * ⚠️ AND AN ALT-TAB IS NOT BEING AWAY. Every tab switch is a
   * `visibilitychange`, so dropping on each one turns a glance at another window
   * into a refetch of the visible screen — a round trip a person watches, for an
   * answer that was seconds old.
   */
  it("keeps what it holds across a glance elsewhere", async () => {
    const api = await door();
    await api.get("centre.view");
    wentAway(5_000);
    expect(api.known("centre.view"), "a five-second tab switch threw the screen away")
      .toBeDefined();
  });

  /* ⚠️ A RECONNECTION IS THE SAME CLAIM: everything held was read on the far
     side of an outage of unknown length. `online` fires on the CHANGE, so this
     cannot repeat while a connection is merely poor. */
  it("drops what it holds when the connection comes back", async () => {
    const api = await door();
    await api.get("centre.view");
    globalThis.dispatchEvent(new Event("online"));
    expect(api.known("centre.view"), "an answer read before an outage survived it")
      .toBeUndefined();
  });
});
