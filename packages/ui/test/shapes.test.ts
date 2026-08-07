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
