import { describe, it, expect } from "vitest";
import { scenaMascotSvg, SCENA_MOODS, SCENA_PALETTES, DEFAULT_SCENA_PALETTE } from "../src/index.js";

describe("scenaMascotSvg", () => {
  it("returns a self-contained svg with the fixed viewBox", () => {
    const svg = scenaMascotSvg();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 400 400"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("scopes gradient/keyframe ids by uid so two mascots don't collide", () => {
    const a = scenaMascotSvg({ uid: "aaa" });
    const b = scenaMascotSvg({ uid: "bbb" });
    expect(a).toContain("sc-body-aaa");
    expect(b).toContain("sc-body-bbb");
    expect(a).not.toContain("sc-body-bbb");
  });

  it("maps a mood to its pose + expression", () => {
    // happy → broadcaster pose emits the pulse rings (r=30 around the bulbs).
    expect(scenaMascotSvg({ mood: "happy", uid: "h" })).toContain('cy="70" r="30"');
    // sad → noise pose emits full-width scanline static (x2=305), no rings.
    const sad = scenaMascotSvg({ mood: "sad", uid: "s" });
    expect(sad).toContain('x2="305"');
    expect(sad).not.toContain('cy="70" r="30"');
    expect(SCENA_MOODS.sad.expression).toBe("sad");
  });

  it("tints stops from the given palette", () => {
    const svg = scenaMascotSvg({ palette: SCENA_PALETTES.emerald, uid: "e" });
    expect(svg).toContain(SCENA_PALETTES.emerald!.start);
  });

  it("omits animation classes when animate is false", () => {
    const svg = scenaMascotSvg({ animate: false, uid: "n" });
    expect(svg).not.toContain("sc-root-n");
    expect(svg).not.toContain("<style>");
  });

  it("defaults to the brand violet palette", () => {
    // The brand default is the design-system violet (hue 300), not a hex alt.
    expect(DEFAULT_SCENA_PALETTE.mid).toContain("300");
    expect(scenaMascotSvg({ uid: "d" })).toContain(DEFAULT_SCENA_PALETTE.mid);
  });
});
