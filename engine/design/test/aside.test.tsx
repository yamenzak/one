/**
 * WHAT THE SHEET SAYS BEFORE A RECORD LEAVES.
 *
 * ⚠️ THE COPY IS THE FEATURE HERE, which is why a render test is the right
 * instrument. The mechanism underneath is thirty lines and correct; what makes
 * the trash worth having is somebody reading "you can put it back" and pressing
 * the button instead of leaving a catalogue full of things nobody dares remove.
 * A dialog still saying "this cannot be undone" would describe a product that
 * stopped existing, and nothing but reading it would catch that.
 *
 * ⚠️ AND THE WINDOW IS ASSERTED AGAINST `BIN_DAYS`, never against "30". A test
 * that pinned the literal would pass on the day somebody changed the sweep and
 * left the promise behind.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BIN_DAYS } from "@engine/kernel";
import { PutAside, SAYS } from "../src/parts/aside.js";

/* ⚠️ STATICALLY, WHICH BOUNDS WHAT THIS CAN ASK. A drawer's body is mounted on
   open, so what a string render sees is the trigger. The sheet's own words are
   the `open` case below — the same limit `create.test` states about `Story`. */
const drawn = (over: Partial<Parameters<typeof PutAside>[0]> = {}) =>
  renderToStaticMarkup(
    <PutAside
      trigger={<button type="button">Delete</button>}
      name="Casting resin, clear"
      of="product"
      onBin={() => undefined}
      {...over}
    />,
  );

describe("the sheet that asks before a record leaves", () => {
  it("draws the control that opens it", () => {
    expect(drawn()).toContain("Delete");
  });
});

/**
 * ⚠️ THE TWO QUESTIONS ARE ASSERTED THROUGH THE COMPONENT'S OWN COPY, and it is
 * exported for no other reason. Reaching the words through a rendered drawer
 * would need a browser — that is the seen lane's question, which is where the
 * sheet SITS rather than what it says. A test that re-typed the sentences would
 * be a second copy of the thing being checked, which is the fault this file
 * exists to catch one level up.
 */
describe("what each question promises", () => {
  it("says a deleted record comes back, for as long as the sweep allows", () => {
    expect(SAYS.bin.then).toContain(String(BIN_DAYS));
    expect(SAYS.bin.then).toContain("put it back");
    /* ⚠️ AND NEVER THE OLD SENTENCE. "Cannot be undone" over a thirty-day window
       is the expensive direction of wrong: somebody who believes it hesitates
       over every delete, which is the state the trash was built to end. */
    expect(SAYS.bin.then.toLowerCase()).not.toContain("cannot be undone");
  });

  it("says a frozen record is never destroyed and has no date on it", () => {
    expect(SAYS.freeze.then).toContain("never destroyed");
    expect(SAYS.freeze.then).not.toContain(String(BIN_DAYS));
  });

  /* ⚠️ AND THE BUTTON SAYS WHAT IT DOES, which is the rule `Confirm`'s header
     states: a person under a sheet reads the buttons first, and "Yes" makes them
     re-read the question they came to answer. */
  it("names the outcome on the button rather than agreeing with a question", () => {
    for (const one of Object.values(SAYS)) {
      expect(one.does).not.toMatch(/^(Yes|OK|Confirm)$/);
    }
    expect(SAYS.bin.does).toContain("trash");
  });

  /* ⚠️ THE TITLE CARRIES THE NAME. "Delete this?" over a list somebody has
     scrolled is a question about whichever row they think is selected. */
  it("asks about the record by name", () => {
    expect(SAYS.bin.title("Casting resin")).toContain("Casting resin");
    expect(SAYS.freeze.title("Casting resin")).toContain("Casting resin");
  });

  /* ⚠️ AND EACH SAYS WHAT SURVIVES, IN THE COLLECTION'S OWN WORD — the whole
     difference between the two is what goes on pointing at the record. */
  it("says what goes on working, using the word for the thing", () => {
    expect(SAYS.bin.says("product")).toContain("product");
    expect(SAYS.freeze.says("shelf")).toContain("shelf");
  });
});
