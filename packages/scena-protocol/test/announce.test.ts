import { describe, it, expect } from "vitest";
import { templateSplit, composePlain, defaultVoiceFor, isGeminiVoice, GEMINI_TTS_VOICES } from "../src/announce.js";

describe("templateSplit", () => {
  it("splits carriers and slots so parts = slots + 1", () => {
    const { parts, slots } = templateSplit("Ticket {ticket}, please proceed to counter {counter}");
    expect(slots).toEqual(["ticket", "counter"]);
    expect(parts).toEqual(["Ticket ", ", please proceed to counter ", ""]);
  });
  it("keeps unknown placeholders as literal text", () => {
    const { slots } = templateSplit("Now serving {ticket} at {desk}");
    expect(slots).toEqual(["ticket"]);
  });
});

describe("composePlain", () => {
  it("spaces letter/number runs so a natural TTS reads them (no SSML, no braces)", () => {
    const t = composePlain("Ticket {ticket}, please proceed to counter {counter}.", { ticket: "A42", counter: "3" });
    expect(t).toContain("A 42");
    expect(t).toContain("counter 3");
    expect(t).not.toContain("{");
    expect(t).not.toContain("<");
  });
  it("skips empty slot values", () => {
    expect(composePlain("Now serving {ticket}{counter}", { ticket: "A7" })).not.toContain("undefined");
  });
});

describe("voice catalog", () => {
  it("defaults to a Gemini prebuilt voice (language-agnostic)", () => {
    const v = defaultVoiceFor("en-US");
    expect(isGeminiVoice(v)).toBe(true);
    expect(GEMINI_TTS_VOICES.some((x) => x.id === v)).toBe(true);
  });
  it("recognizes Gemini voices and rejects legacy Cloud voice names", () => {
    expect(isGeminiVoice("Kore")).toBe(true);
    expect(isGeminiVoice("en-US-Neural2-C")).toBe(false);
  });
});
