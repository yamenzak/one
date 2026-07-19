/**
 * Turns a stored scan's numbers into a CLEAN, normalized body — the standard
 * proportioned profile fitted to the measured girths (packages/domain
 * `bodyProfile`). The silhouette + 3-D render from this instead of the raw
 * captured outline, so they read as a real body rather than a noisy blob. Falls
 * back to null when a scan predates the measurements needed (older rows), and the
 * callers then use the stored capture contour.
 */

import { bodyProfile, profileToSilhouette, type BodyProfile, type Pt } from "@mossa/domain";

type Num = number | null | undefined;
export interface ScanShape {
  heightCm: Num;
  bodyFatPercent: Num;
  circumferences: { neckCm: Num; waistCm: Num; hipsCm?: Num; chestCm?: Num };
}

/** The measurement-driven profile for a scan, or null if it can't be built. */
export function scanProfile(s: ScanShape): BodyProfile | null {
  const c = s.circumferences;
  if (s.heightCm == null || c.waistCm == null || c.neckCm == null) return null;
  return bodyProfile({
    heightCm: s.heightCm,
    neckCm: c.neckCm,
    chestCm: c.chestCm,
    waistCm: c.waistCm,
    hipsCm: c.hipsCm,
    bodyFatPercent: s.bodyFatPercent,
  });
}

/** Normalized (0..1) silhouette points for a profile — drop-in for <Silhouette>. */
export function modelSilhouette(profile: BodyProfile, view: "front" | "side", box = { width: 190, height: 300 }): Pt[] {
  return profileToSilhouette(profile, box, view);
}
