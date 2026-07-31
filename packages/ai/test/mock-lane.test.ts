import { describe, expect, it } from "vitest";
import { mockModeSettable, shouldUseMockLane } from "../src/mock-lane.js";

// AGENTS §6: "the mock lane may never activate in production". The bug this
// guards: `ai.mock = "on"` short-circuited the environment check, so one click in
// the admin console made every AI route return fabricated output — including
// clinical lab markers that pre-fill a real client's chart — and bill the tenant
// credits for it.
describe("shouldUseMockLane", () => {
  it('never mocks outside development, not even with ai.mock = "on"', () => {
    for (const mockMode of ["on", "auto", "off", undefined, null, "garbage"]) {
      for (const canRunReal of [true, false]) {
        expect(shouldUseMockLane({ mockMode, canRunReal, isDevelopment: false })).toBe(false);
      }
    }
  });

  it('in development, "on" forces the mock even with a real credential present', () => {
    expect(shouldUseMockLane({ mockMode: "on", canRunReal: true, isDevelopment: true })).toBe(true);
    expect(shouldUseMockLane({ mockMode: "on", canRunReal: false, isDevelopment: true })).toBe(true);
  });

  it('"auto" (and an absent/unknown value) mocks only when no credential is configured', () => {
    expect(shouldUseMockLane({ mockMode: "auto", canRunReal: false, isDevelopment: true })).toBe(true);
    expect(shouldUseMockLane({ mockMode: "auto", canRunReal: true, isDevelopment: true })).toBe(false);
    expect(shouldUseMockLane({ mockMode: undefined, canRunReal: false, isDevelopment: true })).toBe(true);
    expect(shouldUseMockLane({ mockMode: null, canRunReal: true, isDevelopment: true })).toBe(false);
  });

  it('"off" always fails closed, so a missing credential is an error not a fabrication', () => {
    expect(shouldUseMockLane({ mockMode: "off", canRunReal: false, isDevelopment: true })).toBe(false);
    expect(shouldUseMockLane({ mockMode: "off", canRunReal: true, isDevelopment: true })).toBe(false);
  });
});

describe("mockModeSettable", () => {
  it('refuses to persist "on" outside development', () => {
    expect(mockModeSettable("on", false)).toBe(false);
    expect(mockModeSettable("on", true)).toBe(true);
  });

  it("allows auto/off everywhere", () => {
    for (const dev of [true, false]) {
      expect(mockModeSettable("auto", dev)).toBe(true);
      expect(mockModeSettable("off", dev)).toBe(true);
    }
  });
});
