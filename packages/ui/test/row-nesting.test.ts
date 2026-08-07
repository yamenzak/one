/**
 * A NAVIGATING `Row` MUST NOT PUT ITS TRAILING CONTENT INSIDE ITS BUTTON.
 *
 * `Row` renders a `<button>` (or `<a>`) when it navigates. For most of its life
 * it rendered `trailing` inside that element — so a row that both navigated and
 * carried a switch, a ⋮ menu or a delete button emitted a control nested inside
 * a button.
 *
 * That is invalid HTML, and the failure is not cosmetic: browsers disagree on
 * whether the inner control's click also fires the outer one, a screen reader
 * announces one confusing target where there are two, and Enter on the focused
 * row can activate either. Sixteen call sites across Kova, Tessa and Scena
 * shipped it, every one of them looking correct in review and in a screenshot.
 *
 * There is no DOM in this package's test environment, so this reads the source
 * — which is the right level anyway: the invariant is about what `Row` RENDERS,
 * and a rendering test would only prove it for the props that test happened to
 * pass.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(new URL("../src/layout.tsx", import.meta.url), "utf8");

/** The `Row` component's body, from its declaration to the next top-level one. */
function rowSource(): string {
  const start = SRC.indexOf("export const Row = forwardRef");
  expect(start, "Row's declaration moved — this test is reading the wrong code").toBeGreaterThan(-1);
  const after = SRC.indexOf("\n/**", start);
  return SRC.slice(start, after > 0 ? after : undefined);
}

describe("Row: a navigating row with trailing content", () => {
  const src = rowSource();

  it("splits the navigating element from the trailing slot", () => {
    // The branch that makes it possible at all.
    expect(src, "the interactiveTrailing branch is gone — trailing is back inside the button").toContain("interactiveTrailing");
    expect(src).toMatch(/const interactiveTrailing = navigates && trailing !== undefined/);
  });

  it("renders only the identity inside the button or link on that branch", () => {
    // Isolate the branch and assert what it puts inside the interactive element.
    const branch = src.slice(src.indexOf("if (interactiveTrailing)"), src.indexOf("if (href)"));
    expect(branch, "the branch vanished").toContain("<button");
    expect(branch, "the button must contain `identity` only — `body` includes the tail").toContain(">{identity}<");
    expect(branch, "`body` inside the button is the bug this test exists for").not.toContain(">{body}<");
    expect(branch, "the tail must be a SIBLING of the interactive element").toMatch(/<span[^>]*>\{tail\}<\/span>/);
  });

  it("still renders one element when there is nothing interactive beside it", () => {
    // The guard on the guard: a fix that made EVERY row two elements would pass
    // the checks above while changing the tap target of every simple row in
    // three apps.
    expect(src).toMatch(/if \(onClick\) \{[\s\S]*?<motion\.button[\s\S]*?\{body\}/);
    expect(src).toMatch(/if \(href\) \{[\s\S]*?<motion\.a[\s\S]*?\{body\}/);
  });

  it("gives the navigating half back the row's left padding", () => {
    // Without this the tap target starts 16px inside the row's edge, which is
    // invisible in review and felt immediately on a phone.
    const inner = /const inner = "([^"]*)"/.exec(src)?.[1] ?? "";
    expect(inner, "the inner element must reclaim the row's px-4").toContain("-ml-4");
    expect(inner).toContain("pl-4");
    expect(inner, "it must fill the row's height, or only the text line is tappable").toContain("self-stretch");
  });
});
