import { describe, expect, it } from "vitest";
import { extractJson } from "../src/ai.js";

// The response normalizer must recover well-formed JSON from the messy shapes
// real models (Gemini AND Workers AI) actually emit — otherwise a good answer
// is lost to formatting noise and the route 422s.
describe("extractJson — response normalizer", () => {
  it("parses already-clean JSON (object + array)", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("unwraps a ```json fenced block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n[{"x":true}]\n```')).toEqual([{ x: true }]);
  });

  it("strips leading + trailing prose", () => {
    expect(extractJson('Sure! Here is the plan:\n{"days":[]}\nHope that helps.')).toEqual({ days: [] });
  });

  it("tolerates trailing commas", () => {
    expect(extractJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
    expect(extractJson('[1,2,3,]')).toEqual([1, 2, 3]);
  });

  it("normalizes smart quotes", () => {
    expect(extractJson('{“a”:“hi”}')).toEqual({ a: "hi" });
  });

  it("drops // and /* */ comments", () => {
    expect(extractJson('{"a":1 // note\n,"b":2}')).toEqual({ a: 1, b: 2 });
    expect(extractJson('{"a":1 /* c */,"b":2}')).toEqual({ a: 1, b: 2 });
  });

  it("repairs a truncated array (token cap cut it off)", () => {
    expect(extractJson('[{"x":1},{"x":2')).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it("repairs a truncated nested object", () => {
    expect(extractJson('{"days":[{"name":"A"}')).toEqual({ days: [{ name: "A" }] });
  });

  it("repairs an unterminated string at the cut point", () => {
    // The last value was cut mid-string; closing it + the brackets recovers the rest.
    expect(extractJson('{"note":"hello wor')).toEqual({ note: "hello wor" });
  });

  it("does not corrupt a URL inside a valid string", () => {
    expect(extractJson('{"u":"https://x.com/a"}')).toEqual({ u: "https://x.com/a" });
  });

  it("returns null when there is no recoverable JSON", () => {
    expect(extractJson("I could not complete that request.")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});
