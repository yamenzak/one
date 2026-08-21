/**
 * ITEMISED THINGS — the rules that decide what may happen to one object.
 *
 * ⚠️ EVERY REFUSAL HERE IS A REAL MISTAKE SOMEBODY MAKES. Issuing a drill that
 * is already out, taking back one nobody took, retiring one that is in a van,
 * calling a tray complete while it is missing a clamp. They are asserted rather
 * than described because each is invisible in a passing build: the wrong answer
 * is a perfectly good state transition to a record that is now a lie.
 */

import { describe, expect, it } from "vitest";
import {
  ACTS, KIT_ACTS, checkKit, refuseAct, refuseKitAct, shelfStep, wantsIn,
  type Life,
} from "../src/items.js";

/* ------------------------------------------------------------------- life --- */

describe("what may happen to one object", () => {
  it("gives out what is on the shelf and takes back what is not", () => {
    expect(refuseAct("held", "issue")).toBeNull();
    expect(refuseAct("issued", "return")).toBeNull();
  });

  /* ⚠️ "OUT" WITH NOBODY NAMED IS LOST, and issuing twice is how it happens: the
     second name overwrites the first, and the person who actually has it is
     nowhere in the record. */
  it("refuses to issue something already out with somebody", () => {
    expect(refuseAct("issued", "issue")).toBe("It is already out with somebody");
  });

  it("refuses to take back something nobody took", () => {
    expect(refuseAct("held", "return")).toBe("It is already back");
  });

  /*
    ⚠️ RETIRING SOMETHING THAT IS OUT IS THE SHARPEST OF THE FOUR. It is not on
    our shelf, so retiring it takes a number off a shelf that does not hold it —
    and the person carrying it is never told.
  */
  it("refuses to retire what is in somebody's van", () => {
    expect(refuseAct("issued", "retire")).toBe("It is out with somebody. Take it back first");
  });

  /*
    ⚠️ RETIRED IS AN END AND NOTHING LEAVES IT. An object that could be issued
    again is one somebody condemned and somebody else handed out, which is the
    exact failure a retirement record exists to prevent.
  */
  it("lets nothing at all happen to a retired one", () => {
    for (const act of ACTS) expect(refuseAct("retired", act)).toBe("This one was retired");
  });

  /* ⚠️ A SERVICE IS RECORDED WHEREVER IT IS. A van is serviced on the road and a
     machine is calibrated in place; demanding it be back on our shelf first
     makes the honest record the harder one to write. */
  it("records a service wherever the thing is", () => {
    expect(refuseAct("held", "serve")).toBeNull();
    expect(refuseAct("issued", "serve")).toBeNull();
  });
});

describe("what an act does to the shelf", () => {
  /* ⚠️ ISSUING TAKES ONE OFF AND RETURNING PUTS IT BACK, because `stock` is what
     is THERE. A drill in a van is still ours and is not on the rack. */
  it("moves the balance by one, in the direction of the act", () => {
    expect(shelfStep("issue")).toBe(-1);
    expect(shelfStep("return")).toBe(1);
    expect(shelfStep("retire")).toBe(-1);
  });

  /* ⚠️ AND A SERVICE MOVES NOTHING. It happened to the object, not to the shelf,
     and a movement for it would put a phantom in every usage report. */
  it("leaves the balance alone for a service", () => {
    expect(shelfStep("serve")).toBe(0);
  });
});

/* -------------------------------------------------------------------- kit --- */

const member = (id: string, product: string) => ({ id, product });

describe("whether a kit is complete", () => {
  const TRAY = [
    { product: "clamp", quantity: 2 },
    { product: "scissors", quantity: 1 },
  ];

  it("says nothing about a tray that has everything", () => {
    const out = checkKit(TRAY, [
      member("u1", "clamp"), member("u2", "clamp"), member("u3", "scissors"),
    ]);
    expect(out.short).toEqual([]);
    expect(out.stray).toEqual([]);
  });

  /* ⚠️ SHORT IS COUNTED PER PRODUCT, NOT PER LINE. One clamp in a tray that
     wants two is a tray missing a clamp, and reporting the line as simply
     absent would send somebody looking for both. */
  it("counts how many of each are missing", () => {
    const out = checkKit(TRAY, [member("u1", "clamp"), member("u3", "scissors")]);
    expect(out.short).toEqual([{ product: "clamp", want: 2, have: 1 }]);
  });

  /*
    ⚠️ A STRAY IS NAMED BY ITS OWN LABEL RATHER THAN COUNTED. "One too many"
    tells somebody the tray is wrong; the label tells them which thing to take
    out — and for a surgical tray that difference is the whole point.
  */
  it("names what is in it that does not belong", () => {
    const out = checkKit(TRAY, [
      member("u1", "clamp"), member("u2", "clamp"), member("u3", "scissors"),
      member("u9", "probe"),
    ]);
    expect(out.short).toEqual([]);
    expect(out.stray).toEqual(["u9"]);
  });

  /* ⚠️ AN EMPTY TRAY IS SHORT OF EVERYTHING, which is what a kit being put
     together looks like on its first screen. */
  it("reports a tray with nothing in it as short of all of it", () => {
    const out = checkKit(TRAY, []);
    expect(out.short).toEqual([
      { product: "clamp", want: 2, have: 0 },
      { product: "scissors", want: 1, have: 0 },
    ]);
  });

  /* ⚠️ AND A KIT WITH NO RECIPE HAS NOTHING TO BE SHORT OF. Everything in it is
     a stray, which is honest: nobody said what it should hold. */
  it("makes everything a stray where no recipe was written", () => {
    const out = checkKit([], [member("u1", "clamp")]);
    expect(out.short).toEqual([]);
    expect(out.stray).toEqual(["u1"]);
  });
});

describe("where a kit stands", () => {
  it("lets a kit being put together be filled and finished", () => {
    for (const act of KIT_ACTS) expect(refuseKitAct("open", act)).toBeNull();
  });

  /* ⚠️ A BUILT KIT MAY STILL BE OPENED UP — somebody needs the clamp, and
     refusing them would make the app the thing between a person and their work.
     What must not survive it is the claim, which is the handler's business. */
  it("lets somebody take from a built kit", () => {
    expect(refuseKitAct("built", "take")).toBeNull();
  });

  it("refuses to build one that is already built", () => {
    expect(refuseKitAct("built", "build")).toBe("It is already built");
  });

  /* ⚠️ BROKEN IS AN END. A kit that could be re-opened is an identity somebody
     re-uses, so a tray recorded as sterile in March would be the same record as
     the one assembled in August. */
  it("lets nothing at all happen to one that was broken up", () => {
    for (const act of KIT_ACTS) {
      expect(refuseKitAct("broken", act)).toBe("This kit was broken up");
    }
  });
});

/* ⚠️ A RECIPE IS JSON SOMEBODY EDITED MONTHS AGO, so it is read defensively: a
   tray that cannot be checked at all is worse than one checked against the lines
   that make sense. */
describe("reading a recipe", () => {
  it("keeps the lines that make sense and drops the rest", () => {
    expect(wantsIn([
      { product: "clamp", quantity: 2 },
      { product: "", quantity: 1 },
      { quantity: 3 },
      { product: "scissors" },
      { product: "probe", quantity: 0 },
      "nonsense",
      null,
    ])).toEqual([
      { product: "clamp", quantity: 2 },
      /* ⚠️ A LINE WITH NO NUMBER MEANS ONE, which is what somebody writing a
         list means by writing a name on it. */
      { product: "scissors", quantity: 1 },
    ]);
  });

  it("reads anything that is not a list as no recipe at all", () => {
    expect(wantsIn(null)).toEqual([]);
    expect(wantsIn({ product: "clamp" })).toEqual([]);
    expect(wantsIn("clamp")).toEqual([]);
  });
});

/* ⚠️ THE LIST IS CLOSED AND THE TEST SAYS SO. A fourth standing added without a
   branch in `refuseAct` would be a state every act silently allows. */
describe("the standings themselves", () => {
  it("has three, and every act has an answer for each", () => {
    const lives: readonly Life[] = ["held", "issued", "retired"];
    for (const life of lives) {
      for (const act of ACTS) {
        const why = refuseAct(life, act);
        expect(why === null || typeof why === "string").toBe(true);
      }
    }
  });
});
