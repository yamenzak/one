/**
 * SAYING THERE IS NO LONGER A VALUE.
 *
 * ⚠️ EVERY CHECKER DESCRIBES WHAT A VALUE LOOKS LIKE, and until this there was
 * no way to say a field has none. A ref is a non-empty id, a colour is six hex
 * digits, a day is a date — so emptying one was refused as a malformed value,
 * and a record moved into a tree could never be pulled back out of it, a
 * supplier could never be un-assigned, an accent could never be taken off.
 *
 * ⚠️ AND THE REFUSAL WAS THE WORST SHAPE OF REFUSAL: it arrives at a form as
 * "Invalid length: Expected >=1 but received 0" under a control the person
 * deliberately emptied.
 */

import { describe, expect, it } from "vitest";
import { checkAll, checkSome, field, type Fields } from "../src/index.js";

const FIELDS: Fields = {
  name: field.text({ label: "Name", required: true, holds: "none", max: 60 }),
  note: field.text({ label: "Note", holds: "none", max: 200 }),
  within: field.ref({ label: "Inside", holds: "none", to: "place" }),
  accent: field.colour({ label: "Accent", holds: "none" }),
  due: field.day({ label: "Due", holds: "none" }),
  size: field.enum({ label: "Size", holds: "none", values: ["small", "large"] }),
  spent: field.money({ label: "Spent", holds: "none" }),
};

describe("clearing an optional field", () => {
  it("takes an empty string and stores nothing", () => {
    const done = checkSome(FIELDS, { within: "" });
    expect(done.ok && done.values).toEqual({ within: null });
  });

  it("takes null and means the same by it", () => {
    const done = checkSome(FIELDS, { within: null });
    expect(done.ok && done.values).toEqual({ within: null });
  });

  /*
    ⚠️ ONE KIND OF EMPTY IN THE COLUMN, AND THAT IS THE POINT OF NORMALISING. Two
    — `""` from one caller and `null` from another — would make every reader test
    for both, and the first one that tested only for `IS NULL` would quietly miss
    half the rows.
  */
  it("clears every kind whose shape an empty string does not fit", () => {
    for (const name of ["within", "accent", "due", "size", "spent"]) {
      const done = checkSome(FIELDS, { [name]: "" });
      expect(done.ok && done.values).toEqual({ [name]: null });
    }
  });

  /* ⚠️ AN EMPTY STRING IN A WORD FIELD IS A VALUE SOMEBODY TYPED NOTHING INTO,
     not a field they cleared — and turning it into a null would make "" and
     "no note" the same thing, which they are not on a screen. */
  it("leaves a word field's empty string alone", () => {
    const done = checkSome(FIELDS, { note: "" });
    expect(done.ok && done.values).toEqual({ note: "" });
  });

  it("still refuses a value that is wrong rather than absent", () => {
    expect(checkSome(FIELDS, { accent: "blue" }).ok).toBe(false);
    expect(checkSome(FIELDS, { due: "the 4th" }).ok).toBe(false);
    expect(checkSome(FIELDS, { size: "enormous" }).ok).toBe(false);
  });

  /* ⚠️ AND A REQUIRED FIELD IS NOT CLEARABLE, because "" as an ANSWER to a
     question that must be answered is a different thing from a field somebody
     emptied. */
  it("refuses an empty answer to a required question", () => {
    expect(checkSome(FIELDS, { name: "" }).ok).toBe(false);
    expect(checkSome(FIELDS, { name: null }).ok).toBe(false);
  });

  /* ⚠️ ONLY ON THE PATCH PATH. A create sends the fields it has and omits the
     rest, so there is nothing there to clear. */
  it("is not how a create works", () => {
    expect(checkAll(FIELDS, { name: "Shelf", within: "" }).ok).toBe(false);
    expect(checkAll(FIELDS, { name: "Shelf" }).ok).toBe(true);
  });
});
