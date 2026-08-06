import { describe, it, expect } from "vitest";
import { buildDemoManifest, demoAssetSvg, DEMO_CYCLE_MS, DEMO_SLIDES } from "../src/demo.js";
import { parseManifest, slideTimeline } from "@scena/manifest";
import { resolveAt } from "@scena/timeline";

const T0 = 1_751_500_000_000;
const BASE = "https://api.example.com";

describe("buildDemoManifest", () => {
  it("produces a schema-valid manifest", () => {
    const m = buildDemoManifest(T0, BASE);
    expect(() => parseManifest(m)).not.toThrow();
    expect(m.channelId).toBe("demo");
    expect(m.epoch.t0).toBe(T0);
  });

  it("cycleMs equals the sum of slide durations", () => {
    const m = buildDemoManifest(T0, BASE);
    const sum = m.slides.items.reduce((s, x) => s + (x.durationMs ?? 0), 0);
    expect(sum).toBe(DEMO_CYCLE_MS);
    expect(m.epoch.cycleMs).toBe(DEMO_CYCLE_MS);
  });

  it("every slide asset resolves to a demo url", () => {
    const m = buildDemoManifest(T0, BASE);
    for (const slide of m.slides.items) {
      const asset = m.assets.find((a) => a.hash === slide.hash);
      expect(asset?.url.startsWith(`${BASE}/api/demo/asset/`)).toBe(true);
    }
  });

  it("drives a resolvable timeline", () => {
    const m = buildDemoManifest(T0, BASE);
    const tl = slideTimeline(m);
    expect(resolveAt(tl, T0).item.id).toBe(m.slides.items[0]!.id);
    expect(resolveAt(tl, T0 + DEMO_CYCLE_MS).cycleIndex).toBe(1);
  });

  it("honors a custom widget layer + version", () => {
    const widgets = [
      { id: "t1", type: "text", rect: [100, 100, 400, 80] as [number, number, number, number], rot: 0, z: 5, style: {}, config: { text: "Hi" } },
    ];
    const m = buildDemoManifest(T0, BASE, { version: 7, widgets });
    expect(m.version).toBe(7);
    expect(m.widgets).toHaveLength(1);
    expect(m.widgets[0]!.type).toBe("text");
  });
});

describe("demoAssetSvg", () => {
  it("returns SVG for a known asset", () => {
    const svg = demoAssetSvg(DEMO_SLIDES[0]!.asset);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("returns null for an unknown asset", () => {
    expect(demoAssetSvg("nope")).toBeNull();
  });
});
