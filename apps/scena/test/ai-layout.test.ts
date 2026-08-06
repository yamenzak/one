import { describe, it, expect } from "vitest";
import { parseLayout } from "../src/ai.js";
import type { GenerateRequest } from "../src/ai.js";

const req = (currentWidgets: unknown[] = []): GenerateRequest => ({
  task: "layout",
  modelId: "m",
  prompt: "hi",
  options: { designW: 1920, designH: 1080, currentWidgets },
});

describe("parseLayout", () => {
  it("keeps valid nodes and normalizes geometry", () => {
    const out = parseLayout('[{"type":"text","x":100,"y":200,"w":800,"h":300,"config":{"text":"Hi"}}]', req());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "text", x: 100, y: 200, w: 800, h: 300 });
    expect((out[0] as { config: { text: string } }).config.text).toBe("Hi");
  });

  it("tolerates markdown fences and leading prose", () => {
    const out = parseLayout('Here you go:\n```json\n[{"type":"box","x":0,"y":0,"w":1920,"h":1080}]\n```', req());
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("box");
  });

  it("drops unknown widget types", () => {
    const out = parseLayout('[{"type":"text","x":0,"y":0,"w":400,"h":200},{"type":"notawidget","x":0,"y":0,"w":10,"h":10}]', req());
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("text");
  });

  it("clamps geometry inside the canvas and rounds", () => {
    const out = parseLayout('[{"type":"text","x":5000,"y":-40,"w":9000,"h":80.6}]', req());
    const n = out[0] as { x: number; y: number; w: number; h: number };
    expect(n.w).toBe(1920); // clamped to canvas width
    expect(n.h).toBe(81); // rounded, above min
    expect(n.x).toBe(0); // pinned back inside (w == canvas)
    expect(n.y).toBe(0); // negative clamped to 0
  });

  it("fills missing geometry and objects with safe defaults", () => {
    const out = parseLayout('[{"type":"clock"}]', req());
    const n = out[0] as { x: number; y: number; w: number; h: number; rot: number; z: number; style: object; config: object };
    expect(Number.isFinite(n.x)).toBe(true);
    expect(Number.isFinite(n.w)).toBe(true);
    expect(n.style).toEqual({});
    expect(n.config).toEqual({});
  });

  it("throws when the model returns no array", () => {
    expect(() => parseLayout("I could not do that.", req())).toThrow();
  });

  it("throws when no valid widgets survive", () => {
    expect(() => parseLayout('[{"type":"bogus"}]', req())).toThrow();
  });
});
