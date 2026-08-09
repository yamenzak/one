/**
 * THE BOUNDARY.
 *
 * ⚠️ EVERY CASE HERE IS ONE WHERE THE WRONG ANSWER IS ACCEPTED RATHER THAN
 * REFUSED. A validator that rejects garbage is the half nobody gets wrong; what
 * matters is the input that looks fine, passes a `typeof`, and lands somewhere
 * it cannot be got back out of.
 */

import { describe, expect, it } from "vitest";
import { nothing, s } from "../src/validate.js";

const fails = (r: { ok: boolean }): boolean => !r.ok;
const value = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error("expected a value");
  return r.value;
};

describe("scalars", () => {
  it("refuses a number where text belongs", () => {
    // SQLite stores it happily — its types are per value — so the row is wrong
    // and nothing throws.
    expect(fails(s.text().parse(42))).toBe(true);
    expect(fails(s.text().parse(null))).toBe(true);
  });

  /*
    ⚠️ `NaN` AND `Infinity` ARE NUMBERS to `typeof`, and both survive a JSON
    round trip through some producers. Either one reaching an arithmetic column
    poisons every total computed from it, permanently and silently.
  */
  it("refuses the numbers that are not numbers", () => {
    expect(fails(s.number().parse(NaN))).toBe(true);
    expect(fails(s.number().parse(Infinity))).toBe(true);
    expect(value(s.number().parse(0))).toBe(0);
  });

  it("refuses a fraction where a count belongs", () => {
    expect(fails(s.number({ integer: true }).parse(1.5))).toBe(true);
  });

  /*
    ⚠️ `Date.parse` ACCEPTS "2026" AND "March 3". Both land in a column compared
    lexicographically, so the row sorts wrongly — which is not an error anywhere,
    it is a ladder that fires on the wrong day.
  */
  it("refuses a timestamp that merely parses", () => {
    for (const wrong of ["2026", "March 3, 2026", "2026-08-09", "2026-08-09T12:00:00+02:00"]) {
      expect(fails(s.instant().parse(wrong)), wrong).toBe(true);
    }
    expect(value(s.instant().parse("2026-08-09T12:00:00.000Z"))).toBe("2026-08-09T12:00:00.000Z");
  });

  it("refuses an amount with no currency, and a fractional minor unit", () => {
    expect(fails(s.money().parse({ minor: 1999 }))).toBe(true);
    expect(fails(s.money().parse({ minor: 19.99, currency: "EUR" }))).toBe(true);
    expect(value(s.money().parse({ minor: 1999, currency: "EUR" }))).toEqual({ minor: 1999, currency: "EUR" });
  });

  it("bounds an opaque blob, because 'any JSON' with no ceiling fills a column", () => {
    expect(fails(s.json(10).parse({ a: "much too long to fit" }))).toBe(true);
  });
});

describe("objects", () => {
  const note = s.object({ title: s.text({ min: 1 }), body: s.optional(s.text()), pinned: s.optional(s.bool()) });

  it("requires what is required and allows what is optional", () => {
    expect(value(note.parse({ title: "a" }))).toEqual({ title: "a" });
    expect(fails(note.parse({ body: "no title" }))).toBe(true);
  });

  /*
    ⚠️ AN UNDECLARED KEY IS DROPPED, NEVER FORWARDED. A body carrying more than
    the shape describes is a client that moved on, or somebody probing for a
    field that used to be honoured — and forwarding it is how a mass-assignment
    bug happens, when a writer spreads its input.
  */
  it("drops what nobody declared", () => {
    const parsed = value(note.parse({ title: "a", tenantId: "t_someone_else", isAdmin: true }));
    expect(parsed).toEqual({ title: "a" });
    expect(Object.keys(parsed)).toEqual(["title"]);
  });

  /*
    ⚠️ EVERY ISSUE, WITH ITS PATH — not the first one. A form that can only show
    one message at a time makes somebody submit four times to learn four things.
  */
  it("reports every field that is wrong, by path", () => {
    const r = s.object({ items: s.array(s.object({ title: s.text() })) }).parse({ items: [{ title: 1 }, {}] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path)).toEqual(["items.0.title", "items.1.title"]);
  });

  it("refuses a list where an object belongs, and the reverse", () => {
    expect(fails(note.parse([]))).toBe(true);
    expect(fails(s.array(s.text()).parse({ 0: "a" }))).toBe(true);
  });

  it("takes nothing, and says so", () => {
    expect(value(nothing().parse({}))).toEqual({});
    expect(value(nothing().parse({ smuggled: true }))).toEqual({});
  });
});

describe("the description travels with the validator", () => {
  /*
    ⚠️ ONE OBJECT, so the API document cannot describe a shape the runtime does
    not enforce. Two declarations drift the first time one is edited, and the
    document is the half nobody runs.
  */
  it("describes what it checks", () => {
    const shape = s.object({ title: s.text({ max: 200 }), when: s.optional(s.instant()) });
    expect(shape.json).toEqual({
      kind: "object",
      fields: {
        title: { shape: { kind: "text", max: 200 }, optional: false },
        when: { shape: { kind: "instant" }, optional: true },
      },
    });
  });
});
