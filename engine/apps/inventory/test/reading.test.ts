/**
 * WHAT A MODEL ANSWERED — untrusted input that sounds like a colleague.
 *
 * ⚠️ EVERY CASE HERE IS A REAL ANSWER SHAPE, not a hypothetical. Models fence
 * their JSON, talk around it, name a rung this product does not have, put "Q3
 * 2027" in a date column and hand back a column heading as a delivery line. None
 * of it throws; all of it ends up on a screen somebody works from.
 *
 * ⚠️ AND THE DIRECTION OF EVERY REFUSAL IS THE SAME: drop what cannot be
 * understood, keep what can. A suggestion that is half right is worth showing;
 * an exception on the request path is a camera that appears broken.
 */

import { describe, expect, it } from "vitest";
import { guessedIn, notedIn, readJson } from "../src/reading.js";

/* ------------------------------------------------------------------- json --- */

describe("finding the answer in what came back", () => {
  it("reads a bare document", () => {
    expect(readJson('{"name":"Gloves"}')).toEqual({ name: "Gloves" });
  });

  /* ⚠️ FENCED IS THE ORDINARY ANSWER, NOT THE EXCEPTION, however firmly the
     instructions ask for JSON only. */
  it("reads one inside a fence", () => {
    expect(readJson('```json\n{"name":"Gloves"}\n```')).toEqual({ name: "Gloves" });
  });

  it("reads one with talk around it", () => {
    expect(readJson('Here is the record:\n{"name":"Gloves"}\nHope that helps.'))
      .toEqual({ name: "Gloves" });
  });

  it("reads a list as readily as an object", () => {
    expect(readJson('[{"name":"A"},{"name":"B"}]'))
      .toEqual([{ name: "A" }, { name: "B" }]);
  });

  /* ⚠️ AND NOTHING IS `null` RATHER THAN A THROW. A model that answered prose is
     a model that did not understand the question, which is a suggestion the
     screen has none of — not an error the person has to dismiss. */
  it("answers nothing where there is nothing to read", () => {
    expect(readJson("I could not identify that barcode.")).toBeNull();
    expect(readJson("")).toBeNull();
    expect(readJson("{ this is not json }")).toBeNull();
  });
});

/* ---------------------------------------------------------------- product --- */

describe("what a model thinks a thing is", () => {
  it("keeps the fields it recognises", () => {
    const of = guessedIn({
      name: "Nitrile gloves, blue", brand: "Ansell", category: "PPE",
      unit: "glove", pack: 100, tracking: "counted", why: "No expiry, high volume",
    });
    expect(of.name).toBe("Nitrile gloves, blue");
    expect(of.pack).toBe(100);
    expect(of.tracking).toBe("counted");
    expect(of.why).toBe("No expiry, high volume");
  });

  /*
    ⚠️ A RUNG THIS PRODUCT DOES NOT HAVE IS DROPPED. A model answering
    "serialised" is answering about a different app, and storing it puts a value
    in the column that no branch anywhere reads — so the product is tracked as
    something with no behaviour at all.
  */
  it("drops a rung that is not on the ladder", () => {
    expect(guessedIn({ tracking: "serialised" }).tracking).toBe("");
    expect(guessedIn({ tracking: "BATCHED" }).tracking).toBe("batched");
  });

  /* ⚠️ AND A PACK OF ZERO OR A WORD IS NOT A PACK. "One" and "a box" are things
     a label says; multiplying a delivery by either is a wrong number. */
  it("takes only a real pack size", () => {
    expect(guessedIn({ pack: 0 }).pack).toBe(0);
    expect(guessedIn({ pack: "a box" }).pack).toBe(0);
    expect(guessedIn({ pack: "10" }).pack).toBe(10);
  });

  it("reads hazards as a list of named classes", () => {
    expect(guessedIn({ hazards: ["Flammable liquid", "Skin irritant"] }).hazards)
      .toEqual(["Flammable liquid", "Skin irritant"]);
    /* ⚠️ A single string is not a list, and inventing one from it would put a
       whole sentence in the place a class name goes. */
    expect(guessedIn({ hazards: "flammable" }).hazards).toEqual([]);
  });

  /* ⚠️ NOTHING AT ALL IS AN EMPTY RECORD RATHER THAN A THROW. A code nobody
     recognises is the ordinary case, and it is what the learning path is for. */
  it("answers an empty record for nothing at all", () => {
    expect(guessedIn(null).name).toBe("");
    expect(guessedIn("Gloves").name).toBe("");
    expect(guessedIn({}).tracking).toBe("");
  });
});

/* --------------------------------------------------------------- delivery --- */

describe("the lines on a delivery note", () => {
  it("reads a list of lines", () => {
    expect(notedIn([
      { code: "5000112637922", name: "Gloves", quantity: 10, lot: "A5B7", expiry: "2027-03-31" },
    ])).toEqual([
      { code: "5000112637922", name: "Gloves", quantity: 10, lot: "A5B7", expiry: "2027-03-31" },
    ]);
  });

  it("reads one wrapped in an object", () => {
    expect(notedIn({ lines: [{ name: "Gloves", quantity: 2 }] })).toHaveLength(1);
  });

  /*
    ⚠️ A LINE WITH NEITHER A NAME NOR A CODE IS NOT A LINE. It is a total, a
    column heading or a smudge — and putting it on screen as something to receive
    makes the person check every row rather than the wrong ones, which is the
    whole saving this feature exists for.
  */
  it("drops what is not a line at all", () => {
    expect(notedIn([
      { name: "Gloves", quantity: 2 },
      { quantity: 12 },
      { name: "", code: "" },
      "TOTAL",
    ])).toHaveLength(1);
  });

  /*
    ⚠️ ONLY A REAL CALENDAR DAY REACHES THE EXPIRY. "Q3 2027" and "see box" are
    things a page says and a date column cannot hold; either one stored is a
    string where every shelf-life comparison expects `YYYY-MM-DD`, and the
    comparison is lexicographic — so it does not fail, it sorts wrongly for ever.
  */
  it("takes a date only where the page gave a whole one", () => {
    expect(notedIn([{ name: "A", expiry: "Q3 2027" }])[0]?.expiry).toBe("");
    expect(notedIn([{ name: "A", expiry: "2027-03" }])[0]?.expiry).toBe("");
    expect(notedIn([{ name: "A", expiry: "2027-03-31" }])[0]?.expiry).toBe("2027-03-31");
  });

  /* ⚠️ A DELIVERY NOTE IS ONE PAGE. Hundreds of rows is a misread page, and
     showing them all is a screen nobody can check. */
  it("stops well short of a misread page", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ name: `Line ${i}`, quantity: 1 }));
    expect(notedIn(many).length).toBeLessThanOrEqual(60);
  });

  /* ⚠️ AND AN EMPTY LIST IS A CORRECT ANSWER — a photograph of a wall. */
  it("answers nothing for a page with nothing on it", () => {
    expect(notedIn(null)).toEqual([]);
    expect(notedIn({ lines: "none" })).toEqual([]);
  });
});
