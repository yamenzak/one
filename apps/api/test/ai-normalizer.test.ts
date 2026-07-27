import { describe, expect, it } from "vitest";
import { extractJson, readWorkersAiOutput } from "../src/ai.js";

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

// Workers AI does not speak one response shape. We used to read `result.response`
// and nothing else, so a model answering in the OpenAI-compatible envelope came
// back as "" — and `generate()` settled credits for it. These pin the envelopes
// the platform documents; the live provider is not reachable from CI.
describe("readWorkersAiOutput — Workers AI response envelopes", () => {
  it("reads the classic text-generation shape", () => {
    expect(readWorkersAiOutput({ response: "hello" })).toBe("hello");
  });

  it("re-serializes an object `response` (JSON mode hands back a parsed value)", () => {
    expect(readWorkersAiOutput({ response: { a: 1 } })).toBe('{"a":1}');
    expect(extractJson(readWorkersAiOutput({ response: { a: 1 } }))).toEqual({ a: 1 });
  });

  it("reads the OpenAI-compatible chat envelope — the shape that was being lost", () => {
    expect(readWorkersAiOutput({ choices: [{ message: { content: '{"a":1}' } }] })).toBe('{"a":1}');
  });

  it("joins an array-of-parts content", () => {
    const raw = { choices: [{ message: { content: [{ type: "text", text: '{"a":' }, { type: "text", text: "1}" }] } }] };
    expect(readWorkersAiOutput(raw)).toBe('{"a":1}');
  });

  it("reads a completions-style `choices[].text`", () => {
    expect(readWorkersAiOutput({ choices: [{ text: "plain" }] })).toBe("plain");
  });

  it("reads the Responses-API shapes", () => {
    expect(readWorkersAiOutput({ output_text: "hi" })).toBe("hi");
    expect(readWorkersAiOutput({ output: [{ content: [{ text: "hi" }] }] })).toBe("hi");
  });

  it("falls back to reasoning_content when a thinking model left content empty", () => {
    const raw = { choices: [{ message: { content: "", reasoning_content: 'so the answer is {"a":1}' } }] };
    // Not a free pass: it still has to survive the normalizer downstream.
    expect(extractJson(readWorkersAiOutput(raw))).toEqual({ a: 1 });
  });

  it("prefers real content over reasoning", () => {
    const raw = { choices: [{ message: { content: "answer", reasoning_content: "thinking" } }] };
    expect(readWorkersAiOutput(raw)).toBe("answer");
  });

  it("returns empty for the shapes that carry nothing", () => {
    // Each of these is a FAILURE at the call site — generate() throws, releases
    // the hold and charges nothing, rather than reporting an empty success.
    expect(readWorkersAiOutput({})).toBe("");
    expect(readWorkersAiOutput({ response: "" })).toBe("");
    expect(readWorkersAiOutput({ choices: [] })).toBe("");
    expect(readWorkersAiOutput({ choices: [{ message: { content: "" } }] })).toBe("");
    expect(readWorkersAiOutput({ choices: [{ message: { content: [] } }] })).toBe("");
    expect(readWorkersAiOutput(null)).toBe("");
    expect(readWorkersAiOutput(undefined)).toBe("");
  });
});
