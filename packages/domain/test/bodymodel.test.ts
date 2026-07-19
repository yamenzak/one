import { describe, expect, it } from "vitest";
import {
  classifySomatotype,
  ectomorphyFromHWR,
  posturalMetrics,
  bodyProfile,
  profileToSilhouette,
} from "../src/bodymodel.js";

describe("somatotype", () => {
  it("ectomorphy follows Carter's HWR bands", () => {
    // Tall + light → high HWR → high ectomorphy.
    const lean = ectomorphyFromHWR(190, 60); // hwr = 190/60^(1/3) ≈ 48.4 → 0.732*48.4-28.58
    expect(lean).toBeGreaterThan(6);
    // Short + heavy → low HWR → floored ectomorphy.
    expect(ectomorphyFromHWR(160, 100)).toBeLessThan(1.5);
  });

  it("reads a 90kg/181cm/22.7% build as meso-endomorphic", () => {
    const s = classifySomatotype({ heightCm: 181, weightKg: 90, bodyFatPercent: 22.7, ffmi: 21.2 })!;
    // Solid + a bit soft: mesomorphy strongest, endomorphy close behind, low ecto.
    expect(s.meso).toBeGreaterThan(s.ecto);
    expect(s.endo).toBeGreaterThan(s.ecto);
    expect(["mesomorph", "endomorph"]).toContain(s.dominant);
    expect(s.label).toMatch(/morph/);
  });

  it("a lean light frame reads ectomorph-dominant", () => {
    const s = classifySomatotype({ heightCm: 188, weightKg: 62, bodyFatPercent: 10, ffmi: 16 })!;
    expect(s.dominant).toBe("ectomorph");
  });

  it("rejects impossible inputs", () => {
    expect(classifySomatotype({ heightCm: 0, weightKg: 80, bodyFatPercent: 20 })).toBeNull();
  });
});

describe("posture", () => {
  const shoulder = { x: 100, y: 200 };
  const hip = { x: 100, y: 360 };
  it("an upright stack reads good", () => {
    // Ear directly above the shoulder → near-vertical neck → high CVA.
    const p = posturalMetrics({ ear: { x: 100, y: 130 }, shoulder, hip })!;
    expect(p.craniovertebralAngleDeg).toBeGreaterThan(80);
    expect(p.severity).toBe("good");
    expect(p.flags).toHaveLength(0);
  });

  it("a forward head lowers the CVA and flags it", () => {
    // Ear well ahead of the shoulder, only slightly above → shallow angle.
    const p = posturalMetrics({ ear: { x: 150, y: 178 }, shoulder, hip })!;
    expect(p.craniovertebralAngleDeg).toBeLessThan(48);
    expect(["moderate", "severe"]).toContain(p.severity);
    expect(p.flags.join(" ")).toMatch(/[Ff]orward head/);
  });

  it("a leaning trunk is detected", () => {
    const p = posturalMetrics({ ear: { x: 100, y: 130 }, shoulder: { x: 140, y: 200 }, hip })!;
    expect(p.trunkTiltDeg).toBeGreaterThan(10);
    expect(p.flags.join(" ")).toMatch(/lean/i);
  });
});

describe("body profile", () => {
  const prof = bodyProfile({ heightCm: 181, neckCm: 40, chestCm: 104, waistCm: 89, hipsCm: 102, bodyFatPercent: 22.7 })!;

  it("produces head→sole slices with positive extents", () => {
    expect(prof.slices.length).toBeGreaterThan(8);
    expect(prof.slices[0]!.t).toBe(0.045);
    expect(prof.slices.every((s) => s.halfWidthCm > 0 && s.halfDepthCm > 0)).toBe(true);
  });

  it("waist is narrower than hips and shoulders wider than waist (a real silhouette)", () => {
    const at = (key: number) => prof.slices.find((s) => Math.abs(s.t - key) < 0.001)!;
    const waist = at(0.37).halfWidthCm;
    const hip = at(0.475).halfWidthCm;
    const shoulder = at(0.205).halfWidthCm;
    expect(waist).toBeLessThan(hip);
    expect(shoulder).toBeGreaterThan(waist);
    expect(prof.shoulderWidthCm).toBeGreaterThan(30);
  });

  it("a measured girth splits so width > depth at the waist (elliptical torso)", () => {
    const waist = prof.slices.find((s) => Math.abs(s.t - 0.37) < 0.001)!;
    expect(waist.halfWidthCm).toBeGreaterThan(waist.halfDepthCm);
  });

  it("more body fat rounds the section toward a circle", () => {
    const lean = bodyProfile({ heightCm: 180, waistCm: 80, neckCm: 38, bodyFatPercent: 10 })!;
    const soft = bodyProfile({ heightCm: 180, waistCm: 80, neckCm: 38, bodyFatPercent: 34 })!;
    const wl = lean.slices.find((s) => Math.abs(s.t - 0.37) < 0.001)!;
    const ws = soft.slices.find((s) => Math.abs(s.t - 0.37) < 0.001)!;
    // Same waist girth: the leaner body is more elliptical (wider width:depth).
    expect(wl.halfWidthCm / wl.halfDepthCm).toBeGreaterThan(ws.halfWidthCm / ws.halfDepthCm);
  });

  it("renders a closed, in-bounds silhouette polygon normalized to 0..1", () => {
    const pts = profileToSilhouette(prof, { width: 190, height: 300 }, "front");
    expect(pts.length).toBeGreaterThan(100);
    expect(pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
    // Centered horizontally around 0.5.
    const xs = pts.map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThan(0.05);
    expect(Math.max(...xs)).toBeLessThan(0.95);
  });
});
