import { describe, it, expect } from "vitest";
import { normalizeWidgets } from "../src/profile-store.js";

describe("normalizeWidgets", () => {
  it("converts a builder {x,y,w,h} ticker node into a manifest rect widget", () => {
    const node = {
      id: "ticker_mr6yaxek1",
      type: "ticker",
      x: 0,
      y: 980,
      w: 1920,
      h: 100,
      rot: 0,
      z: 10,
      style: { bg: "oklch(0.15 0.01 300 / 0.78)", color: "#fff", fontSize: 44 },
      config: { feedId: "fd_72a000564069", variant: "scroll" },
    };
    const w = normalizeWidgets([node])[0]!;
    expect(w.rect).toEqual([0, 980, 1920, 100]);
    expect(w).not.toHaveProperty("x");
    expect(w.type).toBe("ticker");
    expect(w.config).toMatchObject({ feedId: "fd_72a000564069" });
  });

  it("passes through nodes already in manifest rect shape", () => {
    const rected = { id: "clock1", type: "clock", rect: [1480, 60, 380, 120], rot: 0, z: 10, style: {}, config: {} };
    expect(normalizeWidgets([rected])[0]!.rect).toEqual([1480, 60, 380, 120]);
  });

  it("drops invalid nodes instead of throwing (so one bad widget can't fail a publish)", () => {
    expect(normalizeWidgets([{ id: "x" } /* no rect / no x-y-w-h */, null, 42])).toEqual([]);
  });
});
