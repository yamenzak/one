/**
 * STATES AND MOTION — the two claims in UI.md that are not about colour.
 */

import { describe, expect, it } from "vitest";
import { dataStateOf, matrixFor, refusalFor, scene, validateStates, type ComponentStates } from "../src/index.js";

/* ----------------------------------------------------------------- data --- */

describe("a container knows the difference between nothing and not yet", () => {
  /*
    ⚠️ THE STATE MOST SYSTEMS OMIT. Collapsing `unknown` into `empty` makes a
    failed load, a pending load and a genuinely empty collection render
    identically — a confident, wrong fact wearing a loading state's excuse.
  */
  it("tells an unanswered fetch from an empty one", () => {
    expect(dataStateOf({ value: null })).toBe("unknown");
    expect(dataStateOf({ value: undefined })).toBe("unknown");
    expect(dataStateOf({ value: [] })).toBe("empty");
    expect(dataStateOf({ value: [1] })).toBe("ready");
  });

  it("tells a failure from an empty result", () => {
    // `catch(() => setItems([]))` is the shape this exists to make impossible.
    expect(dataStateOf({ value: [], failed: true })).toBe("error");
  });

  /*
    ⚠️ A SHAPED RESPONSE IS `partial`, NOT `ready`. An operation may withhold what
    the caller did not buy and SAY SO; rendering a quietly thinner screen makes
    "withheld" and "empty" the same pixel, so no client can tell them apart
    either.
  */
  it("reports a shaped response as partial", () => {
    expect(dataStateOf({ value: [1], withheld: { body: true, training: false } })).toBe("partial");
    expect(dataStateOf({ value: [1], withheld: { body: true, training: true } })).toBe("ready");
  });
});

/* -------------------------------------------------------------- refusal --- */

describe("a refusal explains itself", () => {
  /*
    ⚠️ GATED IS LOCKED, NEVER DISABLED. A disabled control cannot explain itself,
    cannot be focused, cannot be read by assistive technology, and cannot sell
    anything — which is the whole of what a plan gate is for.
  */
  it("locks what a plan withholds, and carries the way out", () => {
    const gated = refusalFor({ gated: true, reason: "Not in your plan", resolve: "billing.plans" });
    expect(gated).toEqual({ kind: "locked", reason: "Not in your plan", resolve: "billing.plans" });
  });

  it("disables only what is genuinely inapplicable, and still says why", () => {
    expect(refusalFor({ reason: "Add a client first" })).toEqual({ kind: "disabled", reason: "Add a client first" });
  });
});

/* ------------------------------------------------------------- registry --- */

describe("a component declares its states or it is not registered", () => {
  const ok: ComponentStates = { id: "button", interaction: ["idle", "hover", "pressed", "focus", "busy"] };

  it("accepts a complete declaration", () => {
    expect(validateStates([ok])).toEqual([]);
  });

  it("refuses one with no resting state", () => {
    expect(validateStates([{ id: "x", interaction: ["hover"] }])[0]?.detail).toMatch(/idle/);
  });

  /*
    ⚠️ DECLARING `empty` WITHOUT `unknown` IS SAYING, IN THE DECLARATION, that an
    unanswered fetch will render as a fact. Catching it here is cheaper than
    catching it in the screenshot nobody looks at twice.
  */
  it("refuses a container that would render an unanswered fetch as a fact", () => {
    const problems = validateStates([{ id: "list", interaction: ["idle"], data: ["empty", "ready"] }]);
    expect(problems[0]?.detail).toMatch(/unknown/);
  });

  it("refuses a component that is both disabled and locked", () => {
    const problems = validateStates([{ id: "b", interaction: ["idle", "disabled", "locked"] }]);
    expect(problems[0]?.detail).toMatch(/locked is the one that can explain itself/);
  });

  it("produces the matrix a suite photographs", () => {
    expect(matrixFor({ id: "list", interaction: ["idle"], data: ["unknown", "empty"] }))
      .toEqual(["list/idle", "list/data:unknown", "list/data:empty"]);
  });
});

/* --------------------------------------------------------------- motion --- */

describe("one choreographer, and components hold a role", () => {
  /*
    ⚠️ CHROME IS ALWAYS LAST. The user came for the content; navigation, search
    and headers are the quietest pixels on the screen and the last to arrive.
  */
  it("orders a scene by role rather than by declaration", () => {
    const steps = scene(["chrome", "anchor", "ground", "content"]);
    const at = (role: string) => steps.find((s) => s.role === role)!.delay;
    expect(at("ground")).toBeLessThan(at("anchor"));
    expect(at("anchor")).toBeLessThan(at("content"));
    expect(at("content")).toBeLessThan(at("chrome"));
  });

  it("carries its own curve, so nothing reaches for a separate constant", () => {
    for (const step of scene(["ground", "anchor", "content", "chrome", "overlay"])) {
      expect(step.ease, step.role).toMatch(/^cubic-bezier\(/);
    }
  });

  it("enters by settling down rather than growing up", () => {
    // The difference between "an app opened" and "an app was assembled for me".
    const anchor = scene(["anchor"])[0]!;
    expect(anchor.from.scale).toBeGreaterThan(1);
  });

  /*
    ⚠️ MOTION IS A BUDGET. Past a few moving groups the stagger collapses rather
    than animating a hundred rows in sequence — so a long list gets SHORTER
    motion automatically instead of the impression that the page loads badly.
  */
  it("collapses the stagger rather than animating a long list in sequence", () => {
    const few = scene(["content", "content"]);
    expect(few[1]!.delay).toBeGreaterThan(few[0]!.delay);
    const many = scene(Array.from({ length: 40 }, () => "content" as const));
    expect(new Set(many.map((s) => s.delay)).size).toBe(1);
  });

  /** Exit is enter reversed at 60% — not a second animation to get out of step. */
  it("leaves decisively", () => {
    const [entering] = scene(["content"]);
    const [leaving] = scene(["content"], { direction: "exit" });
    expect(leaving!.duration).toBeLessThan(entering!.duration);
    expect(leaving!.delay).toBe(0);
  });

  /*
    ⚠️ REMOVED, NOT REDUCED. A "reduced" motion that still translates is one that
    still makes a person ill, and a layout that depends on the transform having
    run is broken for everybody who turned motion off.
  */
  it("removes every transform under reduced motion", () => {
    for (const step of scene(["ground", "anchor", "content", "chrome", "overlay"], { reduced: true })) {
      expect(step.from.scale, step.role).toBeUndefined();
      expect(step.from.y, step.role).toBeUndefined();
      expect(step.duration).toBe(120);
    }
  });
});
