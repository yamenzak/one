import { describe, it, expect } from "vitest";
import {
  parseManifest,
  safeParseManifest,
  canonicalize,
  hashManifest,
  slideTimeline,
  musicTimeline,
  type Manifest,
} from "../src/index.js";
import { resolveAt } from "@scena/timeline";

const raw = {
  version: 42,
  channelId: "ch_abc",
  role: "content",
  dimensions: { w: 3840, h: 2160, orientation: "landscape", rotation: 0 },
  epoch: { t0: 1_751_500_000_000, cycleMs: 21000 },
  slides: {
    durationDefaultMs: 8000,
    items: [
      { id: "s1", type: "image", hash: "b1946ac9" }, // inherits 8000
      { id: "s2", type: "video", hash: "3a7bd3e2", durationMs: 10000, playOnce: true },
      { id: "s3", type: "html", htmlBody: "<h1>hi</h1>", durationMs: 3000 },
    ],
  },
  music: {
    items: [{ id: "m1", hash: "8f14e45f", durationMs: 194000 }],
  },
};

describe("parseManifest", () => {
  it("parses a valid manifest and applies defaults", () => {
    const m = parseManifest(raw);
    expect(m.slides.transitionDefault).toBe("fade");
    expect(m.slides.shuffle).toBe(false);
    expect(m.widgets).toEqual([]);
    expect(m.fonts).toEqual([]);
  });

  it("rejects an html slide with no htmlBody", () => {
    const bad = structuredClone(raw);
    (bad.slides.items[2] as Record<string, unknown>).htmlBody = undefined;
    expect(safeParseManifest(bad).success).toBe(false);
  });

  it("rejects a media slide with no hash", () => {
    const bad = structuredClone(raw);
    delete (bad.slides.items[0] as Record<string, unknown>).hash;
    expect(safeParseManifest(bad).success).toBe(false);
  });

  it("rejects a non-positive cycleMs", () => {
    const bad = structuredClone(raw);
    bad.epoch.cycleMs = 0;
    expect(safeParseManifest(bad).success).toBe(false);
  });
});

describe("canonical hashing", () => {
  it("sorts keys so insertion order does not change the string", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it("keeps array order (playout order is meaningful)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("hashes two key-reordered manifests identically", async () => {
    const m1 = parseManifest(raw);
    const reordered = parseManifest({ ...raw });
    const h1 = await hashManifest(m1);
    const h2 = await hashManifest(reordered);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores version + assets bookkeeping in the hash", async () => {
    const a = parseManifest(raw);
    const b = parseManifest({ ...raw, version: 99 });
    expect(await hashManifest(a)).toBe(await hashManifest(b));
  });

  it("changes the hash when playout content changes", async () => {
    const a = parseManifest(raw);
    const changed = structuredClone(raw);
    changed.slides.items[0]!.hash = "deadbeef";
    const b = parseManifest(changed);
    expect(await hashManifest(a)).not.toBe(await hashManifest(b));
  });
});

describe("timeline adapter", () => {
  const m: Manifest = parseManifest(raw);

  it("resolves inherited slide durations", () => {
    const tl = slideTimeline(m);
    expect(tl.cycleMs).toBe(8000 + 10000 + 3000);
    const first = resolveAt(tl, m.epoch.t0);
    expect(first.item.id).toBe("s1");
    expect(first.remainingMs).toBe(8000); // inherited default
  });

  it("builds a music timeline or null when empty", () => {
    expect(musicTimeline(m)?.cycleMs).toBe(194000);
    const noMusic = parseManifest({ ...raw, music: { items: [] } });
    expect(musicTimeline(noMusic)).toBeNull();
  });
});
