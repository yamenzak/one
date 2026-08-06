import { describe, it, expect } from "vitest";
import { normalizeUsername, randomHandle } from "../src/members.js";

describe("username helpers (§auth)", () => {
  it("normalizes + validates usernames", () => {
    expect(normalizeUsername("  FrontDesk ")).toBe("frontdesk");
    expect(normalizeUsername("a.b_c-9")).toBe("a.b_c-9");
    expect(normalizeUsername("ab")).toBeNull(); // too short (<3)
    expect(normalizeUsername("has space")).toBeNull();
    expect(normalizeUsername("-lead")).toBeNull(); // must start alnum
    expect(normalizeUsername("x".repeat(33))).toBeNull(); // too long (>32)
  });
  it("randomHandle makes 6-char unambiguous lowercase handles", () => {
    const h = randomHandle();
    expect(h).toHaveLength(6);
    expect(h).toMatch(/^[a-z2-9]{6}$/); // no 0/o/1/l ambiguity
    expect(randomHandle(8)).toHaveLength(8);
    // very unlikely to collide across a small sample
    const set = new Set(Array.from({ length: 200 }, () => randomHandle()));
    expect(set.size).toBeGreaterThan(190);
  });
});
