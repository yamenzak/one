/**
 * THE COMPLETENESS AUDIT — every part the markup emits is a part the sheet draws.
 *
 * ⚠️ THIS IS THE CHECK EVERY OTHER TEST IN THIS PACKAGE STRUCTURALLY CANNOT
 * MAKE. The rest ask what the markup MEANS — is the button a button, does the
 * label name the field, is the ink legible on the ground — and every one of them
 * passes on an element with no rules at all. The defect is invisible to the tree
 * and obvious in a photograph: a `data-one` attribute the stylesheet never
 * mentions renders as a bare box in normal flow.
 *
 * It has been the shape of nearly every visual defect in this package. The
 * overlay parts had no CSS; the navigation had no CSS; the skeleton had no
 * geometry; the disclosure chevron had a rule and nothing emitted it; and the
 * LIVE SURFACE — the element that exists to prove position decides rather than
 * the caller — had four presentations with no rules, so all four were the same
 * box. Each was found by looking at a screenshot, one at a time, after shipping.
 *
 * ⚠️ THE EXEMPTIONS CARRY A REASON EACH AND THE LIST MAY ONLY SHRINK. An
 * exemption that stops being true is a test failure, not a comment somebody has
 * to notice.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { COMPONENTS } from "../src/registry.js";
import { sheetFor } from "../src/styles.js";
import { DEFAULT_BRAND } from "../src/brand.js";
import { BORROWED } from "../src/borrowed.js";

const SHEET = sheetFor(DEFAULT_BRAND);
const SOURCE = readdirSync("src/components")
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => readFileSync(`src/components/${f}`, "utf8"))
  .join("\n");

const emitted = new Set([...SOURCE.matchAll(/data-one="([a-z-]+)"/g)].map((m) => m[1]!));
const styled = new Set([...SHEET.matchAll(/\[data-one='([a-z-]+)'\]/g)].map((m) => m[1]!));

/**
 * ⚠️ THE ONLY HONEST REASON TO EMIT A PART AND STYLE NOTHING: the appearance
 * comes from a BORROWED class on the same element, so a rule of ours would be
 * a second opinion about the same pixels. Each entry names the object it
 * borrows — checked below, so an entry cannot survive the borrow being dropped.
 */
const DRESSED_BY_BORROWING: Readonly<Record<string, keyof typeof BORROWED>> = {
  badge: "badge",
  "checkbox-control": "checkbox",
  "radio-control": "radio",
  "switch-control": "toggle",
  "breadcrumb-item": "breadcrumbs",
};

/**
 * ⚠️ AND THE ONLY OTHER ONE: a part whose parent lays it out completely, where
 * a rule of its own would be a number with nothing to say. This list is short
 * on purpose — "the parent handles it" was the assumption under the empty
 * state, the page header's action and the row's lead, and it was wrong in all
 * three: the parent laid out a column and the part needed a row.
 */
const LAID_OUT_BY_ITS_PARENT: Readonly<Record<string, string>> = {
  "checkbox-label": "the checkbox is a flex row and the label is its second child",
  "switch-label": "the switch is a two-column grid and the label is its first cell",
  "field-hint": "the field is a flex column with a gap; the hint is one more child",
};

describe("every part the markup emits is a part the sheet draws", () => {
  it("draws every registered component", () => {
    for (const { id } of COMPONENTS) {
      expect(emitted, `${id} is registered and no component emits it`).toContain(id);
      const excused = id in DRESSED_BY_BORROWING || id in LAID_OUT_BY_ITS_PARENT;
      expect(styled.has(id) || excused, `${id} is registered and the sheet never addresses it`).toBe(true);
    }
  });

  it("draws every part any component emits", () => {
    for (const part of emitted) {
      const excused = part in DRESSED_BY_BORROWING || part in LAID_OUT_BY_ITS_PARENT;
      expect(styled.has(part) || excused, `${part} is emitted and the sheet never addresses it`).toBe(true);
    }
  });

  /*
    ⚠️ AND THE OTHER DIRECTION, which is the half that rots silently. A rule for
    a part nothing emits is not merely dead: it is an affordance somebody
    designed, wrote and believed shipped. `row-chevron` was exactly that — the
    disclosure arrow on a tappable row had a rule for four stages and no element,
    so every row that opened something looked identical to every inert one.
  */
  it("draws no part that nothing emits", () => {
    for (const part of styled) {
      expect(emitted, `${part} has a rule and no component emits it`).toContain(part);
    }
  });

  /*
    ⚠️ AN EXEMPTION IS A CLAIM, AND THE CLAIM IS CHECKED. A part excused because
    a borrowed class dresses it must actually borrow that object — otherwise the
    exemption outlives the borrow and the part is unstyled again, with a line in
    this file saying it is fine.
  */
  it("holds no exemption that has stopped being true", () => {
    for (const [part, object] of Object.entries(DRESSED_BY_BORROWING)) {
      expect(BORROWED, `${part} is excused by borrowing ${object}, which is not borrowed`).toHaveProperty(object);
      expect(emitted, `${part} is excused and nothing emits it`).toContain(part);
      expect(styled.has(part), `${part} is excused and the sheet draws it anyway — drop the exemption`).toBe(false);
    }
    for (const part of Object.keys(LAID_OUT_BY_ITS_PARENT)) {
      expect(emitted, `${part} is excused and nothing emits it`).toContain(part);
      expect(styled.has(part), `${part} is excused and the sheet draws it anyway — drop the exemption`).toBe(false);
    }
  });

  /*
    ⚠️ THE TOP OF THE LADDER CASTS A SHADOW, OR IT IS NOT THERE AT ALL. This is
    the consequence of a rule stated in `contrast.test.ts` and enforced nowhere:
    a light ground starts at l 0.93 and the ladder saturates, so `--surface-3`
    and `--surface-2` come out one unit apart on every pale tenant. Anything that
    told itself apart by reaching the top step was therefore invisible in light —
    the segmented control's indicator and the current destination on a nav island
    both were, and both looked fine in dark, where there is headroom.

    Light tells things apart by what they CAST. So the deepest surface is allowed
    only with an elevation beside it, and the check is exact rather than
    aesthetic: name the top step, cast something.
  */
  it("never separates by the top surface step without casting a shadow", () => {
    for (const rule of SHEET.split("}")) {
      if (!rule.includes("background: var(--surface-3)")) continue;
      expect(rule, "surface-3 with no elevation is invisible on every light tenant").toContain("box-shadow");
    }
  });

  /*
    ⚠️ AND A COMPONENT'S STATES ARE DRAWN TOO. A registered `locked` or `busy`
    that no rule addresses is a state the language declares, the markup stamps
    and the screen renders identically to idle — which is worse than not having
    it, because the app believes it communicated something.
  */
  it("draws every interaction state that is not the browser's own", () => {
    /* ⚠️ The four the UA draws for us, and the one that IS the resting state. */
    const NATIVE = new Set(["idle", "hover", "pressed", "focus", "disabled"]);
    const wanted = new Set(COMPONENTS.flatMap((c) => c.interaction).filter((s) => !NATIVE.has(s)));
    for (const state of wanted) {
      /* ⚠️ EITHER SPELLING COUNTS. A state is written as a VALUE where a control
         has several (`data-state='busy'`) and as a PRESENCE where it is a
         yes/no (`data-invalid`); both are the sheet addressing the state, and
         demanding one spelling would be this test having an opinion about
         markup rather than about whether anything is drawn. */
      const drawn = SHEET.includes(`data-state='${state}'`) || SHEET.includes(`[data-${state}]`);
      expect(drawn, `no rule anywhere draws the ${state} state`).toBe(true);
    }
  });
});
