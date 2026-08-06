import { describe, it, expect } from "vitest";
import { canAddLibraryTrack } from "../src/library-store.js";

describe("music library limit", () => {
  it("blocks a new track at the cap", () => {
    expect(canAddLibraryTrack(9, 10, false)).toBe(true);
    expect(canAddLibraryTrack(10, 10, false)).toBe(false);
  });
  it("treats limit 0 as feature-off (no adds)", () => {
    expect(canAddLibraryTrack(0, 0, false)).toBe(false);
  });
  it("treats negative limit as unlimited", () => {
    expect(canAddLibraryTrack(9999, -1, false)).toBe(true);
  });
  it("never counts a track the tenant already uses", () => {
    expect(canAddLibraryTrack(10, 10, true)).toBe(true); // re-adding to another channel
    expect(canAddLibraryTrack(0, 0, true)).toBe(true);
  });
});
