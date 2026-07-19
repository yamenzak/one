/**
 * On-device ML wrapper (MediaPipe Tasks Vision). Loads PoseLandmarker (33
 * landmarks → alignment + anatomical heights) and ImageSegmenter (selfie person
 * mask → body outline + widths). Everything runs in-browser: the model + wasm
 * are self-hosted same-origin (`/models/…`, `/mediapipe/wasm`), and NO frame,
 * mask, or landmark is ever uploaded — only the derived numbers (and, on
 * consent, a de-identified outline) leave the device.
 *
 * The heavy `@mediapipe/tasks-vision` import lives here so it's only pulled when
 * the scan flow is dynamically imported — it never touches the main bundle.
 */

import type { NormLandmark } from "./measure.js";
import { LM } from "./measure.js";

export type ScanPhase = "front" | "side";
/** The full cue set the API voices. */
export type CueId =
  | "intro" | "step_back" | "step_forward" | "center" | "arms"
  | "straighten" | "hold" | "captured_front" | "turn_side" | "captured_side";
/** The subset an alignment check can emit as live guidance. */
export type AlignCue = Exclude<CueId, "intro" | "captured_front" | "captured_side">;

export interface Alignment {
  ok: boolean;
  cue: AlignCue;
  message: string;
}

const WASM_PATH = "/mediapipe/wasm";
const POSE_MODEL = "/models/pose_landmarker_lite.task";
const SEG_MODEL = "/models/selfie_segmenter.tflite";

export interface Scanner {
  /** Detect the single pose in a video frame → 33 landmarks, or null. */
  pose(video: HTMLVideoElement, tsMs: number): NormLandmark[] | null;
  /** Person-confidence mask for a frame (0..1), or null if unavailable. */
  segment(video: HTMLVideoElement, tsMs: number): Promise<{ mask: Float32Array; width: number; height: number } | null>;
  close(): void;
}

/**
 * Load the on-device models. Rejects if the wasm/model can't initialize (no
 * WebGL / offline / blocked) — the caller falls back to manual entry.
 */
export async function loadScanner(): Promise<Scanner> {
  const { FilesetResolver, PoseLandmarker, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

  const pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  const segmenter = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: SEG_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });

  return {
    pose(video, tsMs) {
      const res = pose.detectForVideo(video, tsMs);
      const first = res.landmarks[0];
      return first ? (first as NormLandmark[]) : null;
    },
    segment(video, tsMs) {
      return new Promise((resolve) => {
        try {
          segmenter.segmentForVideo(video, tsMs, (result) => {
            const m = result.confidenceMasks?.[0];
            if (!m) return resolve(null);
            // Copy off the mask before it's recycled by the next call.
            const src = m.getAsFloat32Array();
            const mask = new Float32Array(src.length);
            mask.set(src);
            const out = { mask, width: m.width, height: m.height };
            m.close?.();
            resolve(out);
          });
        } catch {
          resolve(null);
        }
      });
    },
    close() {
      try { pose.close(); } catch { /* ignore */ }
      try { segmenter.close(); } catch { /* ignore */ }
    },
  };
}

const v = (lm: NormLandmark | undefined): number => lm?.visibility ?? 1;

/**
 * Deterministic framing/pose checks from landmarks (no ML judgement, no server).
 * Returns the single most-important correction as a cue, or `hold` when the pose
 * is scan-ready. Checks are ordered by priority so the guidance is stable.
 */
export function analyzeAlignment(lm: NormLandmark[], phase: ScanPhase): Alignment {
  const nose = lm[LM.nose];
  const lSh = lm[LM.lShoulder];
  const rSh = lm[LM.rShoulder];
  const lHip = lm[LM.lHip];
  const rHip = lm[LM.rHip];
  const lAnk = lm[LM.lAnkle];
  const rAnk = lm[LM.rAnkle];

  // 1. Whole body present — need head, shoulders, hips and at least one ankle.
  if (!nose || !lSh || !rSh || !lHip || !rHip || v(nose) < 0.5 || v(lSh) < 0.5 || v(rSh) < 0.5) {
    return { ok: false, cue: "straighten", message: "Face the camera so your whole body shows" };
  }
  const ankleVisible = v(lAnk) > 0.4 || v(rAnk) > 0.4;
  const ankleY = Math.max(v(lAnk) > 0.4 ? (lAnk?.y ?? 0) : 0, v(rAnk) > 0.4 ? (rAnk?.y ?? 0) : 0);
  if (!ankleVisible || ankleY > 0.99 || nose.y < 0.02) {
    return { ok: false, cue: "step_back", message: "Step back — get your whole body in frame" };
  }

  // 2. Distance — body should fill most of the frame height.
  const bodyFrac = ankleY - nose.y;
  if (bodyFrac < 0.62) return { ok: false, cue: "step_forward", message: "Step a little closer" };
  if (bodyFrac > 0.94) return { ok: false, cue: "step_back", message: "Step back a little" };

  // 3. Centered.
  const midHipX = (lHip.x + rHip.x) / 2;
  if (midHipX < 0.4 || midHipX > 0.6) return { ok: false, cue: "center", message: "Move to the center of the frame" };

  const midShX = (lSh.x + rSh.x) / 2;
  const shoulderSpan = Math.abs(lSh.x - rSh.x);

  // 4. Facing the right way for this pose.
  if (phase === "front") {
    if (shoulderSpan < 0.12) return { ok: false, cue: "straighten", message: "Turn to face the camera" };
  } else {
    // Side profile: the shoulders overlap horizontally.
    if (shoulderSpan > 0.09) return { ok: false, cue: "turn_side", message: "Turn so your side faces the camera" };
  }

  // 5. Standing straight — shoulders & hips level, spine vertical.
  const shoulderTilt = Math.abs(lSh.y - rSh.y);
  const hipTilt = Math.abs(lHip.y - rHip.y);
  const lean = Math.abs(midShX - midHipX);
  if (phase === "front" && (shoulderTilt > 0.06 || hipTilt > 0.06)) {
    return { ok: false, cue: "straighten", message: "Stand up straight and level your shoulders" };
  }
  if (lean > 0.08) return { ok: false, cue: "straighten", message: "Stand up straight" };

  // 6. Arms slightly abducted (front only — a clean torso silhouette).
  if (phase === "front") {
    const lWr = lm[LM.lWrist];
    const rWr = lm[LM.rWrist];
    const half = shoulderSpan / 2;
    const lOut = lWr ? Math.abs(lWr.x - midShX) : 0;
    const rOut = rWr ? Math.abs(rWr.x - midShX) : 0;
    if (lOut < half * 1.1 || rOut < half * 1.1) {
      return { ok: false, cue: "arms", message: "Raise your arms slightly away from your sides" };
    }
  }

  return { ok: true, cue: "hold", message: "Perfect — hold still" };
}
