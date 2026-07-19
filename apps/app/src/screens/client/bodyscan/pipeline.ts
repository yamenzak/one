/**
 * On-device ML wrapper (MediaPipe Tasks Vision). Loads PoseLandmarker (33
 * landmarks → alignment + anatomical heights) and ImageSegmenter (DeepLab v3
 * person mask → body outline + widths). Everything runs in-browser: the model +
 * wasm are self-hosted same-origin (`/models/…`, `/mediapipe/wasm`), and NO
 * frame, mask, or landmark is ever uploaded — only the derived numbers (and, on
 * consent, a de-identified outline) leave the device.
 *
 * We use DeepLab v3 (general Pascal-VOC person segmentation) rather than the
 * selfie segmenter: the silhouette is a WHOLE body standing 2–3 m away, which
 * the selfie model (tuned for close-up head-and-shoulders) segments poorly on
 * low-contrast/cluttered backgrounds. DeepLab returns a category mask; the body
 * is every pixel classified `person`.
 *
 * The heavy `@mediapipe/tasks-vision` import lives here so it's only pulled when
 * the scan flow is dynamically imported — it never touches the main bundle.
 */

import type { NormLandmark } from "./measure.js";
import { LM } from "./measure.js";

export type ScanPhase = "front" | "side" | "relax";
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
const SEG_MODEL = "/models/deeplab_v3.tflite";
/** DeepLab v3 is trained on Pascal VOC; class 15 is `person`. */
const PERSON_CLASS = 15;

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

  // CPU delegate for the segmenter: the WebGL/GPU path for DeepLab has been
  // unreliable in-browser (empty masks on some devices), and segmentation runs
  // only ONCE per capture (not per frame) so CPU latency is a non-issue. We ask
  // for BOTH outputs and union them — argmax `categoryMask` gives crisp edges,
  // and `confidenceMasks[person] > 0.3` recovers the body where the model was
  // confident-but-not-argmax (occlusion, busy background). Maximally forgiving.
  const segmenter = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: SEG_MODEL, delegate: "CPU" },
    runningMode: "VIDEO",
    outputCategoryMask: true,
    outputConfidenceMasks: true,
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
            const cat = result.categoryMask;
            const conf = result.confidenceMasks?.[PERSON_CLASS];
            const base = cat ?? conf;
            if (!base) return resolve(null);
            const w = base.width, h = base.height, n = w * h;
            // Copy off before MediaPipe recycles the buffers on the next call.
            const catArr = cat?.getAsUint8Array();
            const confArr = conf?.getAsFloat32Array();
            const mask = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              if ((catArr && catArr[i] === PERSON_CLASS) || (confArr && confArr[i]! > 0.3)) mask[i] = 1;
            }
            cat?.close?.();
            result.confidenceMasks?.forEach((cm) => cm.close?.());
            resolve({ mask, width: w, height: h });
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
  // Feet must be genuinely in-frame so the reliable nose→ankle scale can be used
  // (measure.ts only falls back to the shorter nose→hip span as a last resort).
  // Require solid ankle confidence AND an ankle y that sits inside the frame —
  // MediaPipe extrapolates off-frame joints (y past 1, or pinned to the bottom
  // edge) with low confidence, so a lax threshold lets a feet-cut-off capture
  // auto-fire and then fail to calibrate.
  const FEET_MSG = "Step back until your feet are in the frame";
  const ankleVisible = v(lAnk) > 0.6 || v(rAnk) > 0.6;
  const ankleY = Math.max(v(lAnk) > 0.6 ? (lAnk?.y ?? 0) : 0, v(rAnk) > 0.6 ? (rAnk?.y ?? 0) : 0);
  if (!ankleVisible || ankleY <= 0 || ankleY > 0.98 || nose.y < 0.02) {
    return { ok: false, cue: "step_back", message: FEET_MSG };
  }

  // 2. Distance — the nose→ankle span should fill a good part of the frame.
  // Calibrated for a WHOLE body in frame: nose sits ~0.07 below the head top and
  // the ankle ~0.05 above the sole, so a well-framed full body spans ~0.45–0.75
  // here. (Demanding more would force stepping closer until the feet clip out —
  // the exact deadlock that stalled capture.)
  const bodyFrac = ankleY - nose.y;
  if (bodyFrac < 0.45) return { ok: false, cue: "step_forward", message: "Step a little closer" };
  if (bodyFrac > 0.82) return { ok: false, cue: "step_back", message: "Step back a little" };

  // 3. Centered.
  const midHipX = (lHip.x + rHip.x) / 2;
  if (midHipX < 0.4 || midHipX > 0.6) return { ok: false, cue: "center", message: "Move to the center of the frame" };

  const midShX = (lSh.x + rSh.x) / 2;
  const shoulderSpan = Math.abs(lSh.x - rSh.x);

  // 4. Facing the right way for this pose. (front + relax both face the camera.)
  if (phase !== "side") {
    if (shoulderSpan < 0.12) return { ok: false, cue: "straighten", message: "Turn to face the camera" };
  } else {
    // Side profile: the shoulders overlap horizontally.
    if (shoulderSpan > 0.09) return { ok: false, cue: "turn_side", message: "Turn so your side faces the camera" };
  }

  // 5. Standing straight — shoulders & hips level, spine vertical.
  const shoulderTilt = Math.abs(lSh.y - rSh.y);
  const hipTilt = Math.abs(lHip.y - rHip.y);
  const lean = Math.abs(midShX - midHipX);
  if (phase !== "side" && (shoulderTilt > 0.06 || hipTilt > 0.06)) {
    return { ok: false, cue: "straighten", message: "Stand up straight and level your shoulders" };
  }
  if (lean > 0.08) return { ok: false, cue: "straighten", message: "Stand up straight" };

  // 6. Arms slightly abducted — FRONT only (needed to separate the torso from the
  // arms for measurement). The relax pass wants arms DOWN for a natural outline.
  if (phase === "front") {
    const lWr = lm[LM.lWrist];
    const rWr = lm[LM.rWrist];
    const half = shoulderSpan / 2;
    const lOut = lWr ? Math.abs(lWr.x - midShX) : 0;
    const rOut = rWr ? Math.abs(rWr.x - midShX) : 0;
    if (lOut < half || rOut < half) {
      return { ok: false, cue: "arms", message: "Raise your arms slightly away from your sides" };
    }
  }

  return { ok: true, cue: "hold", message: "Perfect — hold still" };
}
