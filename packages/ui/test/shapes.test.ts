/**
 * `Shape` MUST NOT CHANGE THE PHONE.
 *
 * The whole argument for adopting it is that a collection destination wires it
 * once and its narrow layout is untouched — so if that is not true, every app
 * that adopts it ships a regression to the viewport most of its users are on,
 * in exchange for a desktop improvement they will never see.
 *
 * Two properties carry that, and both are the kind that pass review by looking
 * right:
 *
 *  1. The side panes are gated on a MEDIA QUERY, not on `hidden lg:block`. A
 *     CSS-hidden pane still mounts, runs its effects and issues its fetches, so
 *     the "unchanged" phone would quietly gain a request per screen.
 *  2. The queries run unconditionally. `list !== undefined && useMediaQuery(…)`
 *     is the natural way to write it and is a hooks-order bug — `&&` skips the
 *     hook when `list` is absent, and a component rendered with a list on one
 *     route and without one on the next changes its hook count between renders.
 *
 * There is no DOM in this package's test environment, so this reads the source.
 * That is the right level anyway: the invariant is about what `Shape` RENDERS
 * for every prop combination, and a rendering test would only prove it for the
 * combination the test happened to pass.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAW = readFileSync(new URL("../src/shapes.tsx", import.meta.url), "utf8");

/**
 * The CODE, without the prose.
 *
 * Two of the assertions below are "this spelling must not appear", and the file
 * NAMES both wrong spellings in its comments to explain why they are wrong. So
 * the first version of this test failed on the documentation of the bug it
 * exists to prevent — the same self-match the `type-scale` lint hit when its
 * patterns became short enough to occur in ordinary prose. Strip comments and
 * both the ban and the explanation can coexist.
 */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Shape: the narrow layout is the one that must not move", () => {
  it("gates the side panes on a media query, not on a CSS utility", () => {
    expect(SRC, "the hook is gone — a `hidden lg:block` pane still mounts and fetches").toContain("useMediaQuery");
    expect(SRC).toMatch(/const twoPane = list !== undefined && atDesktop/);
    expect(SRC).toMatch(/const board = aside !== undefined && atWide/);
    // The failure this replaces, spelled out so re-introducing it fails here.
    expect(SRC, "`hidden lg:block` on a pane mounts it on phones").not.toMatch(/hidden[^"']*\blg:block\b/);
    expect(SRC, "`hidden xl:block` on a pane mounts it on phones").not.toMatch(/hidden[^"']*\bxl:block\b/);
  });

  it("calls both queries unconditionally", () => {
    // Each must appear as its own statement, not behind a `&&`.
    expect(SRC).toMatch(/const atDesktop = useMediaQuery\(/);
    expect(SRC).toMatch(/const atWide = useMediaQuery\(/);
    expect(SRC, "a hook behind `&&` is skipped when the left side is falsy").not.toMatch(/\S\s*&&\s*useMediaQuery\(/);
  });

  it("is a PASS-THROUGH when no pane is shown", () => {
    /*
      The regression that proved this matters: the first version always rendered
      the flex row with `ScrollArea` panes. `ScrollArea` scrolls inside itself,
      which needs a bounded height, and the consuming app's `<main>` had none —
      so the pane collapsed and the screenshot suite reported "element(s) not
      found" on all four projects, PHONE INCLUDED. That is precisely the
      regression this component's argument says it cannot cause, and neither the
      types nor the tests saw it; four photographs did.

      `return <>{children}</>` is the fix and the guard: no element, so no height
      model, so nothing to collapse.
    */
    expect(SRC).toMatch(/if \(!twoPane && !board\) return <>\{children\}<\/>;/);
    // And the height it needs on the other branch must not leak onto this one.
    const paneBranch = SRC.slice(SRC.indexOf("if (!twoPane && !board)"));
    expect(paneBranch, "the viewport height belongs only to the branch with panes").toContain("100dvh");
    expect(SRC.slice(0, SRC.indexOf("if (!twoPane && !board)"))).not.toContain("dvh");
  });

  it("subtracts the chrome above it rather than claiming the whole viewport", () => {
    /*
      A bare `h-dvh` was the first spelling. It is wrong by exactly the app bar:
      the row starts BELOW a sticky header, so a full-viewport row overhangs the
      fold by the bar's height and the page grows a scrollbar it should not
      have — and every sticky thing inside a pane then sits at the wrong offset.
      `--chrome-top` is the shell's answer to "how far down does this scroller
      start" (tokens.css), and a pane resets it because a pane IS a scroller.
    */
    expect(SRC).toMatch(/h-\[calc\(100dvh-var\(--chrome-top,0px\)\)\]/);
    const panes = SRC.match(/\[--chrome-top:0px\]/g) ?? [];
    expect(panes.length, "every pane must reset it — a missed one sticks 64px down").toBe(3);
  });

  it("tells the shell to stop centring", () => {
    // A shell that caps every screen at a 720px column (§2) is right for Focus
    // and exactly wrong here, where the panes are the layout.
    expect(SRC).toMatch(/data-shape=\{board \? "board" : "two-pane"\}/);
  });

  it("keeps the centred column ONLY when there is no list", () => {
    // In a two-pane the column is bounded by the panes beside it; centring it
    // again pushes it off the axis its own list sits on.
    expect(SRC).toMatch(/!twoPane && "column"/);
  });

  it("reads the widths from one place", () => {
    // §11.2's numbers, not re-typed per pane.
    expect(SRC).toMatch(/desktop: "\(min-width: 1100px\)"/);
    expect(SRC).toMatch(/wide: "\(min-width: 1400px\)"/);
    expect(SRC).toMatch(/useMediaQuery\(WIDTH\.desktop\)/);
    expect(SRC).toMatch(/useMediaQuery\(WIDTH\.wide\)/);
  });

  it("shows the placeholder rather than a void when nothing is selected", () => {
    // A two-pane that opens as a list beside empty space reads as a failed load.
    expect(SRC).toMatch(/twoPane && !selected \? placeholder : children/);
  });
});

describe("Shape: what the column knows about what is beside it", () => {
  /*
    §11.4 rule 3 — a record's Back must not point at a list that is already on
    screen. The first desktop photographs of Kova's roster caught exactly that:
    the list pane on the left, and an "All clients" arrow above the client it
    had opened FROM that list.

    Two spellings look like the fix and neither is:

      `lg:hidden` on the button   hides it at a WIDTH, not in a shape. A Focus
                                  screen — a record with no list pane at all —
                                  then loses its only way back past 1024px,
                                  which is a dead end rather than a tidy-up.
                                  `Hero` shipped this and it is the reason this
                                  block exists.
      a `twoPane` prop            makes every record screen re-derive what its
                                  parent already computed, in a package with no
                                  router to derive it from.
  */
  const HERO = readFileSync(new URL("../src/hero.tsx", import.meta.url), "utf8");
  const SWITCHER = readFileSync(new URL("../src/section-switcher.tsx", import.meta.url), "utf8");
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("publishes the shape, defaulting to the one that changes nothing", () => {
    expect(SRC).toMatch(/createContext<\{ twoPane: boolean \}>\(\{ twoPane: false \}\)/);
    expect(SRC).toMatch(/export function useShape\(\)/);
  });

  it("provides it around the COLUMN, not around the row", () => {
    // Around the row, the list would be told it was sitting beside itself.
    const provider = SRC.indexOf("<ShapeContext.Provider");
    expect(provider, "the context is declared but never provided").toBeGreaterThan(-1);
    expect(SRC.slice(provider - 400, provider)).toContain("min-h-0 flex-1");
  });

  for (const [name, src] of [["Hero", HERO], ["SectionSwitcher", SWITCHER]] as const) {
    it(`${name} drops its Back from the shape, not from a breakpoint`, () => {
      const c = code(src);
      expect(c, `${name} does not ask`).toMatch(/useShape\(\)/);
      expect(c).toMatch(/&& !twoPane/);
      expect(c, "`lg:hidden` strands a Focus screen's Back at ≥1024").not.toMatch(/lg:hidden/);
    });
  }
});
