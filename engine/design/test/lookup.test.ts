/**
 * A CONTROL SHOWS THE VALUE IT HOLDS, EVEN ONE ITS OPTIONS DO NOT LIST.
 *
 * ⚠️ THIS WAS PHOTOGRAPHED, AND IT IS THE WORST SHAPE A FORM BUG HAS. A model
 * read "30 Filmtabletten" off a box and answered `unit`; the field offers what
 * the WORKSPACE already uses, which on a new workspace is nothing; `setUnit`
 * ran, the form counted itself complete, and the person saw an empty box with a
 * placeholder in it. Pressing on would have saved a value they never saw.
 *
 * ⚠️ NOTHING WAS WRONG WITH THE STATE. `selectedKey` on a React Aria `ComboBox`
 * is resolved against the COLLECTION — a key that is not in the list renders as
 * an empty input, silently, with no warning and no fallback. The control was
 * behaving exactly as documented over a value it had no way to display.
 *
 * ⚠️ THE DECISION IS `withValue` AND IT IS PURE, so this needs no browser. Every
 * fault this control has had is in what the collection CONTAINS rather than in
 * the markup.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { withValue, type Option } from "../src/parts/forms.js";

const KNOWN: readonly Option[] = [
  { id: "box", label: "box" },
  { id: "glove", label: "glove" },
];

describe("what a lookup can show", () => {
  /*
    ⚠️ THE REPORTED CASE. A value from outside the list is the ordinary case on a
    new workspace, not an edge: the list is what the workspace has USED, and the
    first product it registers has used nothing.
  */
  it("carries a value its options never listed", () => {
    const shown = withValue(KNOWN, "tablet");
    expect(shown.map((o) => o.id)).toContain("tablet");
  });

  /* ⚠️ FIRST, because it is the current answer and the rest are alternatives. */
  it("puts it at the top rather than at the end", () => {
    expect(withValue(KNOWN, "tablet")[0]?.id).toBe("tablet");
  });

  /*
    ⚠️ AND IT DOES NOT DOUBLE ONE THAT IS ALREADY THERE. A duplicate `id` in a
    React Aria collection is a key collision — the second one is dropped, and
    which of the two survives is not something to rely on.
  */
  it("leaves a value that is already an option alone", () => {
    expect(withValue(KNOWN, "box")).toEqual(KNOWN);
    expect(withValue(KNOWN, "box")).toHaveLength(2);
  });

  /* ⚠️ NOTHING IS NOT A VALUE. An empty option would be a blank row in the list
     that selects an empty string — a control offering to unset itself, badly. */
  it("adds nothing for nothing", () => {
    expect(withValue(KNOWN, "")).toEqual(KNOWN);
    expect(withValue(KNOWN, "   ")).toEqual(KNOWN);
    expect(withValue(KNOWN, null)).toEqual(KNOWN);
    expect(withValue(KNOWN, undefined)).toEqual(KNOWN);
  });

  /* ⚠️ AND AN EMPTY LIST IS THE COMMONEST ONE. A workspace registering its first
     product has used no units at all, which is exactly when a model's answer is
     most useful and was most reliably invisible. */
  it("works when the workspace has used nothing yet", () => {
    expect(withValue([], "tablet").map((o) => o.label)).toEqual(["tablet"]);
  });
});

/**
 * AND THE CONTROL ACTUALLY CALLS IT.
 *
 * ⚠️ EVERY TEST ABOVE PASSES WITH THE FIX DISCONNECTED, which was measured
 * rather than guessed: replacing `shown` with `options` at the one call site
 * leaves five green tests over a control that is broken again. A correct
 * function nothing calls is the failure this whole area keeps producing — a
 * mechanism with no surface — and a pure test cannot see it by construction.
 *
 * ⚠️ SO THE WIRING IS ASSERTED AS SOURCE. Mounting is not an option here: HeroUI
 * v3 builds a `ComboBox`'s input through React Aria's render props, so static
 * markup has no input to read a value from, and a browser test of a form control
 * is a test of React Aria. What is ours is which collection is handed over, and
 * that is one line.
 */
describe("the control is wired to it", () => {
  it("renders the folded list rather than the caller's", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "..", "src", "parts", "forms.tsx"), "utf8");
    const lookup = src.slice(src.indexOf("export function Lookup"));
    const body = lookup.slice(0, lookup.indexOf("\nexport "));
    expect(body,
      "`Lookup` must fold the current value into its options — see `withValue`")
      .toContain("withValue(options, value)");
    expect(body,
      "`Lookup` renders `options` directly, so a value outside the list is invisible")
      .toContain("shown.map(");
    expect(body).not.toContain("{options.map(");
  });
});
