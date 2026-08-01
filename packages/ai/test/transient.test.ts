/**
 * WHICH FAILURES DESERVE A SECOND ASK.
 *
 * This is the classifier behind the retry loop, and it is worth testing on its
 * own because both of its mistakes are expensive in opposite directions:
 *
 *   too NARROW — "AI failed — google/gemini-2.5-pro: empty model response"
 *                reaches a user for a request that would have worked on the
 *                next call. That is the bug this was written for.
 *   too WIDE   — a safety refusal or a malformed prompt gets asked three times,
 *                so the person waits three times as long to be told no, and the
 *                worker burns three times the CPU to get there.
 *
 * The timeout rule is the subtle one and it is deliberately NOT about the text.
 * `RUN_TIMEOUT_MS` is two minutes; a retry makes it four, then six. A slow
 * failure is the one case where trying again cannot win.
 */

import { describe, expect, it } from "vitest";
import { isTransientAiError } from "../src/generate.js";

describe("worth retrying", () => {
  it.each([
    ["empty model response", "the reported production failure — Gemini shrugging under load"],
    ["no candidates {}", "the same shrug, one layer earlier"],
    ["HTTP 429 rate limited", "rate limit"],
    ["HTTP 503 Service Unavailable", "the pool is full"],
    ["HTTP 500 internal error", "provider-side blip"],
    ["HTTP 502 bad gateway", "edge blip"],
    ["HTTP 504", "upstream slow"],
    ["model is overloaded, please try again", "explicit back-pressure"],
    ["Too Many Requests", "case-insensitive"],
    ["fetch failed", "transport"],
    ["ECONNRESET", "socket"],
  ])("%s", (msg) => {
    expect(isTransientAiError(msg)).toBe(true);
  });
});

describe("NOT worth retrying", () => {
  it("a timeout — the caller has already waited the full budget", () => {
    expect(isTransientAiError("timeout")).toBe(false);
    // Even when the text ALSO looks transient, elapsed time wins: a 503 that
    // took two minutes to arrive is still two minutes the user waited.
    expect(isTransientAiError("HTTP 503 after timeout")).toBe(false);
  });

  it.each([
    ["response stopped (finishReason=SAFETY)", "a refusal is deterministic"],
    ["response stopped (finishReason=RECITATION)", "likewise"],
    ["HTTP 400 invalid request", "a bad prompt is bad three times"],
    ["HTTP 401 unauthorized", "a missing key stays missing"],
    ["HTTP 403 forbidden", "an unentitled model stays unentitled"],
    ["HTTP 404 model not found", "a typo in the catalog"],
    ["AI provider not configured", "nothing to retry against"],
  ])("%s", (msg) => {
    expect(isTransientAiError(msg)).toBe(false);
  });

  it("refuses an unrecognised error rather than guessing", () => {
    // The allow-list is deliberate. Treating unknown failures as transient is
    // how one broken prompt becomes three.
    expect(isTransientAiError("something nobody has seen before")).toBe(false);
    expect(isTransientAiError("")).toBe(false);
  });
});
