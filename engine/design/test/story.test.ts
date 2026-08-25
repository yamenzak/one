/**
 * THE ARITHMETIC OF A NARRATED FLOW.
 *
 * ⚠️ EVERY FAULT ASSERTED HERE IS AN OFF-BY-ONE NOBODY CAN SEE BY LOOKING AT A
 * SCREEN. A skipped step still counted in the dots, a clause appearing both
 * under the control and in the recap above it, the last step refusing without
 * saying which earlier step owes something — each of them renders perfectly and
 * each is wrong.
 */

import { describe, expect, it } from "vitest";
import { walk, type Ask } from "../src/frame/story.js";

/* ⚠️ `children` IS REQUIRED BY THE TYPE AND IRRELEVANT TO EVERY ASSERTION HERE,
   which is the shape a pure function over declarations should have. */
const ask = (of: Partial<Ask> & { readonly id: string }): Ask => ({
  ask: `${of.id}?`,
  children: null,
  ...of,
});

describe("a story walks the steps that apply", () => {
  it("finds where somebody is standing", () => {
    const flow = walk([ask({ id: "a" }), ask({ id: "b" }), ask({ id: "c" })], "b");
    expect(flow.at).toBe(1);
    expect(flow.here?.id).toBe("b");
    expect(flow.last).toBe(false);
  });

  it("knows the last step, which is the one that writes", () => {
    const flow = walk([ask({ id: "a" }), ask({ id: "b" })], "b");
    expect(flow.last).toBe(true);
  });

  /*
    ⚠️ SKIPPED, NOT DISABLED, AND OUT OF THE ARITHMETIC ENTIRELY. With the step
    merely hidden, `at` would count it — so the dots would show four with three
    drawn, and Next from `a` would land on a step that renders nothing.
  */
  it("takes a step that does not apply out of the flow", () => {
    const flow = walk([
      ask({ id: "a" }),
      ask({ id: "skip", when: false }),
      ask({ id: "c" }),
    ], "c");
    expect(flow.live.map((one) => one.id)).toEqual(["a", "c"]);
    expect(flow.at).toBe(1);
    expect(flow.last).toBe(true);
  });

  /* ⚠️ A WHITE SCREEN WITH NO WAY OUT IS THE ALTERNATIVE — see `walk`. */
  it("lands at the start rather than nowhere when the step it was on vanished", () => {
    const flow = walk([ask({ id: "a" }), ask({ id: "b", when: false })], "b");
    expect(flow.at).toBe(0);
    expect(flow.here?.id).toBe("a");
  });

  it("is empty rather than broken when every step is skipped", () => {
    const flow = walk([ask({ id: "a", when: false })], "a");
    expect(flow.live).toEqual([]);
    expect(flow.here).toBeUndefined();
    /* ⚠️ NOT `true`. `at === live.length - 1` is `0 === -1` by luck alone; a
       flow with no steps has no last step, and a `last` of true would draw the
       write button over nothing. */
    expect(flow.last).toBe(false);
  });
});

describe("the story so far is what came before, and only that", () => {
  it("collects the answered clauses in order", () => {
    const flow = walk([
      ask({ id: "a", ask: "What is it?", says: "Amoxicillin 500mg" }),
      ask({ id: "b", ask: "How is it counted?", says: "Counted in tablets" }),
      ask({ id: "c" }),
    ], "c");
    expect(flow.told).toEqual([
      { id: "a", ask: "What is it?", says: "Amoxicillin 500mg" },
      { id: "b", ask: "How is it counted?", says: "Counted in tablets" },
    ]);
  });

  /*
    ⚠️ THE CURRENT STEP IS ABSENT, AND THIS IS THE ONE THAT WOULD HAVE SHIPPED.
    The story so far is what somebody has already left behind; the step they are
    standing on is the question, and stating its answer back to them is a screen
    talking about the control they are looking at.
  */
  it("leaves out the step somebody is standing on", () => {
    const flow = walk([
      ask({ id: "a", says: "said already" }),
      ask({ id: "b", says: "being said now" }),
    ], "b");
    expect(flow.told.map((one) => one.says)).toEqual(["said already"]);
  });

  it("leaves out a step nobody answered", () => {
    const flow = walk([
      ask({ id: "a", says: "answered" }),
      ask({ id: "b", says: null }),
      ask({ id: "c" }),
    ], "c");
    expect(flow.told.map((one) => one.id)).toEqual(["a"]);
  });

  it("leaves out a skipped step even when it carries a clause", () => {
    const flow = walk([
      ask({ id: "a", says: "kept" }),
      ask({ id: "gone", says: "dropped", when: false }),
      ask({ id: "c" }),
    ], "c");
    expect(flow.told.map((one) => one.says)).toEqual(["kept"]);
  });
});

describe("a refusal appears where the fix is, or takes you there", () => {
  it("is this step's own while standing on it", () => {
    const flow = walk([
      ask({ id: "a", short: "Give it a name" }),
      ask({ id: "b" }),
    ], "a");
    expect(flow.short).toBe("Give it a name");
    /* ⚠️ NO WAY THERE, BECAUSE IT IS HERE. A row that navigates to the screen
       somebody is already on is a control that does nothing. */
    expect(flow.owed).toBeNull();
  });

  /*
    ⚠️ A STEP WHOSE OWN FIELDS ARE FINE GOES FORWARD THOUGH THE FLOW IS NOT
    FINISHED, which is the entire point of dividing it. One sentence at the foot
    of a whole form told somebody on the last screen that something three
    screens back was missing and left them to find it.
  */
  it("is silent on a step that owes nothing, even while an earlier one does", () => {
    const flow = walk([
      ask({ id: "a", short: "Give it a name" }),
      ask({ id: "b" }),
      ask({ id: "c" }),
    ], "b");
    expect(flow.short).toBeUndefined();
    expect(flow.owed).toBeNull();
  });

  it("answers for the whole flow on the last step, and names where to go", () => {
    const flow = walk([
      ask({ id: "a", ask: "What is it?", short: "Give it a name" }),
      ask({ id: "b" }),
      ask({ id: "c" }),
    ], "c");
    expect(flow.short).toBe("Give it a name");
    expect(flow.owed?.id).toBe("a");
    expect(flow.owed?.ask).toBe("What is it?");
  });

  it("prefers the last step's own debt to an earlier one", () => {
    const flow = walk([
      ask({ id: "a", short: "earlier" }),
      ask({ id: "b", short: "here" }),
    ], "b");
    expect(flow.short).toBe("here");
    expect(flow.owed).toBeNull();
  });

  /* ⚠️ A SKIPPED STEP CANNOT HOLD THE FLOW SHUT. Its refusal is about a question
     nobody is being asked, so it would be a wall with no door. */
  it("ignores a refusal on a step that does not apply", () => {
    const flow = walk([
      ask({ id: "gone", short: "unanswerable", when: false }),
      ask({ id: "b" }),
    ], "b");
    expect(flow.short).toBeUndefined();
  });
});
