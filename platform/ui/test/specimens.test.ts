/**
 * THE MATRIX IS ONLY A MATRIX IF SOMEBODY DREW IT.
 *
 * ⚠️ `registry.ts` DECLARES WHAT EXISTS AND WHAT STATES EACH THING HAS BEEN
 * DESIGNED IN, and for four stages nothing checked that any of it had been
 * looked at. A declared state with no specimen is a state that was considered on
 * paper and shipped unexamined — which is indistinguishable, in the registry,
 * from one that was designed.
 */

import { describe, expect, it } from "vitest";
import { COMPONENTS, RENDERER_OWNS } from "../src/registry.js";
import { COVERED, GROUPS } from "../reference/specimens.js";

describe("every component in the language has been drawn", () => {
  it("covers every registered component with at least one specimen", () => {
    const missing = COMPONENTS.map((c) => c.id).filter((id) => !COVERED.includes(id));
    expect(missing, "registered and never drawn").toEqual([]);
  });

  /*
    ⚠️ AND THE REVERSE: A SPECIMEN FOR SOMETHING THAT IS NOT IN THE LANGUAGE.
    That is how a component gets built, drawn, reviewed and shipped without ever
    being declared — so it has no state matrix, and the boundary guard does not
    know it exists.
  */
  it("draws nothing the registry does not declare", () => {
    const declared = new Set(COMPONENTS.map((c) => c.id));
    const stray = COVERED.filter((id) => !declared.has(id));
    expect(stray, "drawn and never registered").toEqual([]);
  });

  /*
    ⚠️ THE REFUSALS ARE DRAWN TOO. `locked` and `disabled` are the states a
    product ships most often and reviews least — a gallery that shows only the
    happy path is a gallery that agrees to nothing worth agreeing.
  */
  it("draws the states that only appear when something is wrong", () => {
    const captions = GROUPS.flatMap((g) => g.items.map((i) => `${i.of}:${i.caption}`)).join(" ");
    for (const state of ["locked", "disabled", "busy", "invalid", "empty", "unknown", "error"]) {
      expect(captions, `no specimen shows ${state}`).toMatch(new RegExp(state, "i"));
    }
  });

  /*
    ⚠️ EVERY GROUP SAYS WHAT ITS RULE IS. A gallery of components with no reasons
    is a picture book: the next person picks by appearance, which is exactly the
    decision the language exists to have already made.
  */
  it("gives every group a stated rule", () => {
    for (const g of GROUPS) {
      expect(g.note.length, `${g.title} has no rule`).toBeGreaterThan(60);
      expect(g.items.length, `${g.title} is empty`).toBeGreaterThan(0);
    }
  });

  /* And the boundary's promises are all visible, not merely present in code. */
  it("draws every surface the boundary forbids an app to build", () => {
    const satisfiedBy: Record<string, string> = { dialog: "overlay", sheet: "overlay", drawer: "overlay", popover: "overlay", confirm: "overlay", tabs: "segmented" };
    const missing = RENDERER_OWNS.filter((id) => !COVERED.includes(satisfiedBy[id] ?? id));
    expect(missing, "forbidden to an app and shown to nobody").toEqual([]);
  });
});
