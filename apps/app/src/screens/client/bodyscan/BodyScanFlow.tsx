/**
 * Camera body-scan flow (SPEC §8.5) — the full-screen, lazy-loaded surface.
 *
 * THE PRIVACY INVARIANT: the (possibly nude) camera frame NEVER leaves the
 * device. getUserMedia → on-device PoseLandmarker + ImageSegmenter → derived
 * circumferences + a de-identified outline. Only those numbers are POSTed (the
 * outline ONLY if the user opts in). We estimate body-fat LOCALLY for the
 * instant reveal; the server recomputes authoritatively on save.
 *
 * Steps: intro/consent → capture front → capture side → measure (on-device) →
 * result reveal + consent-gated save. A manual-measurement path is always
 * available (no camera / model load fail / low-end device / user choice).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  estimateBodyFat, classifyBodyFat, type BodyFatEstimate, type BodyFatCategory,
  displayToKg, kgToDisplay, lengthDisplayToCm, weightLabel, lengthLabel, type UnitPrefs,
} from "@mossa/domain";
import {
  Button, Field, Switch, Badge, IconBadge, Spinner, cn, toneVar, useModalOverlay,
  Camera, ScanLine, ShieldCheck, Sparkles, Ruler, User, Check, RotateCcw, X, AlertTriangle, ArrowRight, Percent,
} from "@mossa/ui";
import { api, todayLocal } from "../../../api.js";
import { loadScanner, analyzeAlignment, type Scanner, type ScanPhase, type Alignment } from "./pipeline.js";
import { measureCapture, computeCircumferences, fullBodyContour, LM, type Capture, type NormLandmark, type Circumferences } from "./measure.js";
import { CuePlayer } from "./cues.js";
import { Silhouette } from "./Silhouette.js";

export interface ScanProfile { gender: "male" | "female"; ageYears: number; heightCm: number }

export interface ScanResult {
  estimate: BodyFatEstimate;
  circumferences: Circumferences;
  contourFront: [number, number][] | null;
  contourSide: [number, number][] | null;
  weightKg: number;
}

type Step = "intro" | "front" | "relax" | "side" | "measuring" | "result" | "manual";

const CATEGORY_LABEL: Record<BodyFatCategory, string> = {
  essential: "Essential",
  athletic: "Athletic",
  fitness: "Fitness",
  average: "Average",
  above_average: "Above average",
};
const CONFIDENCE_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Lower confidence" } as const;
const CONFIDENCE_TONE = { high: "success", medium: "warning", low: "danger" } as const;

export default function BodyScanFlow({
  clientId, profile, latestWeightKg, units, onClose, onSaved,
}: {
  clientId: string;
  profile: ScanProfile;
  latestWeightKg: number | null;
  units: UnitPrefs;
  onClose: () => void;
  onSaved: (r: ScanResult & { id: string }) => void;
}) {
  const ref = useModalOverlay(onClose);
  const [step, setStep] = useState<Step>("intro");
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const cueRef = useRef<CuePlayer | null>(null);
  const capturesRef = useRef<{ front?: Capture; relax?: Capture; side?: Capture }>({});

  // Spin up the cue player once (preload is fire-and-forget, degrades to TTS).
  useEffect(() => {
    const cue = new CuePlayer();
    cueRef.current = cue;
    void cue.preload();
    return () => cue.dispose();
  }, []);
  useEffect(() => { cueRef.current?.setMuted(muted); }, [muted]);

  const beginMeasure = () => {
    setStep("measuring");
    // Defer so the "measuring" frame paints before the synchronous pixel crunch.
    setTimeout(() => {
      const { front, relax, side } = capturesRef.current;
      // Diagnostic: what fraction of the frame the person mask covers, and its
      // dims. 0% ⇒ segmentation produced no body (model/delegate); a healthy
      // % that still fails ⇒ a site/scale problem, not the mask. Surfaced on the
      // manual-fallback notice so a failed scan is debuggable from a screenshot.
      const coverage = (c?: Capture): string => {
        if (!c) return "no capture";
        let px = 0;
        for (let i = 0; i < c.mask.length; i++) if (c.mask[i]! > 0.5) px++;
        return `${c.mask.length ? Math.round((px / c.mask.length) * 100) : 0}% · ${c.width}×${c.height}`;
      };
      try {
        if (!front) throw new Error("no front capture");
        const f = measureCapture(front, profile.heightCm);
        const s = side ? measureCapture(side, profile.heightCm) : f;
        const circ = computeCircumferences(f, s);
        if (!circ) throw new Error(`sites not found · outline ${coverage(front)}`);
        // Plausibility gate: a waist far outside the human range for this height
        // means a bad read (occlusion, loose clothing, a partial mask) — surface
        // manual entry rather than a confidently-wrong estimate (e.g. a 59 cm
        // waist reading 5% body-fat on a 90 kg frame). ~0.35–0.95 × height spans
        // very lean to very high girth.
        if (circ.waistCm < profile.heightCm * 0.35 || circ.waistCm > profile.heightCm * 0.95) {
          throw new Error(`waist ${Math.round(circ.waistCm)}cm implausible · outline ${coverage(front)}`);
        }
        const estimate = estimateBodyFat({
          gender: profile.gender, ageYears: profile.ageYears, heightCm: profile.heightCm,
          weightKg: latestWeightKg ?? 75,
          neckCm: circ.neckCm, waistCm: circ.waistCm, hipsCm: circ.hipsCm ?? null,
        });
        if (!estimate) throw new Error(`estimate failed · outline ${coverage(front)}`);
        // Visualization outlines are the FULL body (arms) from the arms-down relax
        // + side captures — a natural human shape — while the numbers above came
        // from the torso-only measurement. Fall back to the torso outline if the
        // relax capture is missing.
        const contourFront = relax ? fullBodyContour(relax) : f.contour;
        const contourSide = side ? fullBodyContour(side) : null;
        // Discard the masks now — we keep only numbers + the outline.
        capturesRef.current = {};
        setResult({ estimate, circumferences: circ, contourFront, contourSide, weightKg: latestWeightKg ?? 75 });
        setStep("result");
      } catch (err) {
        const why = err instanceof Error ? err.message : coverage(front);
        setFatalError(`We couldn't read your measurements from the capture. Enter them by hand below.\n\nDiagnostic: ${why}`);
        setStep("manual");
      }
    }, 60);
  };

  const onManualResult = (r: ScanResult) => { setResult(r); setStep("result"); };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Body scan"
      className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <IconBadge icon={ScanLine} tone="cardio" size="sm" />
          <span className="font-semibold">Body scan</span>
        </div>
        <div className="flex items-center gap-1.5">
          {(step === "front" || step === "relax" || step === "side") && (
            <Button size="icon-sm" variant="ghost" aria-pressed={muted} aria-label={muted ? "Unmute voice guidance" : "Mute voice guidance"} onClick={() => setMuted((m) => !m)}>
              <Sparkles className={cn(muted && "opacity-40")} />
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Close body scan" data-autofocus onClick={onClose}><X /></Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {step === "intro" && (
          <Intro
            onStartCamera={() => setStep("front")}
            onManual={() => { setFatalError(null); setStep("manual"); }}
          />
        )}
        {(step === "front" || step === "relax" || step === "side") && (
          <CaptureStep
            key={step}
            phase={step}
            cue={cueRef.current}
            onCaptured={(cap) => {
              capturesRef.current[step] = cap;
              if (step === "front") { cueRef.current?.play("captured_front"); setStep("relax"); }
              else if (step === "relax") setStep("side");
              else { cueRef.current?.play("captured_side"); beginMeasure(); }
            }}
            onFallback={() => { setFatalError(null); setStep("manual"); }}
          />
        )}
        {step === "measuring" && <Measuring />}
        {step === "manual" && (
          <ManualStep profile={profile} latestWeightKg={latestWeightKg} units={units} notice={fatalError} onResult={onManualResult} />
        )}
        {step === "result" && result && (
          <ResultStep
            clientId={clientId} result={result} profile={profile} units={units}
            onSaved={onSaved} onRetry={() => { setResult(null); setStep("intro"); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Intro + consent ──────────────────────────────────────────────────────────
function Intro({ onStartCamera, onManual }: { onStartCamera: () => void; onManual: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-5 px-5 py-4">
      <div className="space-y-2 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-cardio/15"><Camera className="size-8" style={{ color: toneVar.cardio }} /></div>
        <h1 className="text-2xl font-bold tracking-tight">Scan your body composition</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Stand in front of your camera for three quick poses — front, relaxed, and side. We estimate your body-fat percentage from your body's proportions and build a silhouette you can rotate in 3-D.
        </p>
      </div>

      <div className="space-y-2.5 rounded-2xl bg-success-soft/40 p-4">
        <div className="flex items-center gap-2 font-semibold text-success"><ShieldCheck className="size-5" /> Your camera never leaves this device</div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          All image processing runs privately in your browser. Your photo is never uploaded, saved, or sent to a server — not even to us.
          Only a few numbers (your measurements) are stored. You can also choose to save a de-identified outline — an anonymous silhouette,
          never a photo — to watch your shape change over time.
        </p>
      </div>

      <div className="space-y-2.5 rounded-2xl bg-card p-4">
        <div className="flex items-center gap-2 font-semibold"><Sparkles className="size-5" style={{ color: toneVar.nutrition }} /> An honest estimate</div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A camera estimate is accurate to about ±4%. Think of the number as a ballpark — <span className="font-medium text-foreground">the trend over time is the real story</span>. Scan under similar lighting and clothing each time for the most consistent trend.
        </p>
      </div>

      <div className="space-y-2 rounded-2xl bg-card p-4 text-sm text-muted-foreground">
        <Bullet icon={User}>Wear form-fitting clothing (or none) so your outline is clear.</Bullet>
        <Bullet icon={ScanLine}>Prop your phone up about 2–3 m away at hip height.</Bullet>
        <Bullet icon={Ruler}>Stand tall, arms slightly out. We'll guide you by voice.</Bullet>
      </div>

      <div className="space-y-2.5">
        <Button size="lg" className="w-full" onClick={onStartCamera}><Camera /> Start camera scan</Button>
        <Button variant="ghost" className="w-full" onClick={onManual}><Ruler /> Enter measurements by hand instead</Button>
      </div>
      <p className="px-2 text-center text-xs text-muted-foreground">By continuing you agree to run the scan on your device. Your coach only ever sees the resulting numbers.</p>
    </div>
  );
}

function Bullet({ icon: Icon, children }: { icon: typeof User; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

// ── Capture (front / side) ───────────────────────────────────────────────────
function CaptureStep({ phase, cue, onCaptured, onFallback }: {
  phase: ScanPhase;
  cue: CuePlayer | null;
  onCaptured: (cap: Capture) => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<Scanner | null>(null);
  const rafRef = useRef<number>(0);
  const stableSinceRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const latestLmRef = useRef<NormLandmark[] | null>(null);
  const [state, setState] = useState<"loading" | "denied" | "modelfail" | "scanning">("loading");
  const [align, setAlign] = useState<Alignment | null>(null);
  const [progress, setProgress] = useState(0); // hold-still progress 0..1

  // Fresh capture closure per phase.
  const onCapturedRef = useRef(onCaptured);
  useEffect(() => { onCapturedRef.current = onCaptured; }, [onCaptured]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    const doCapture = async () => {
      const scanner = scannerRef.current;
      const video = videoRef.current;
      const lm = latestLmRef.current;
      if (!scanner || !video || !lm || capturingRef.current) return;
      capturingRef.current = true;
      const ts = performance.now();
      const seg = await scanner.segment(video, ts);
      if (seg && !stopped) {
        onCapturedRef.current({ mask: seg.mask, width: seg.width, height: seg.height, landmarks: lm });
      } else {
        capturingRef.current = false;
      }
    };

    void (async () => {
      // 1. Camera.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch { if (!stopped) setState("denied"); return; }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      // 2. Models.
      try {
        scannerRef.current = await loadScanner();
      } catch { if (!stopped) setState("modelfail"); return; }
      if (stopped) return;
      setState("scanning");
      if (phase === "side") cue?.play("turn_side");

      // 3. Per-frame loop: pose → alignment → auto-capture on ~1s hold.
      const loop = () => {
        if (stopped) return;
        rafRef.current = requestAnimationFrame(loop);
        const scanner = scannerRef.current;
        const v = videoRef.current;
        if (!scanner || !v || v.readyState < 2 || capturingRef.current) return;
        const ts = performance.now();
        const lm = scanner.pose(v, ts);
        latestLmRef.current = lm;
        drawOverlay(canvasRef.current, v, lm);
        if (!lm) { setAlign(null); stableSinceRef.current = null; setProgress(0); return; }
        const a = analyzeAlignment(lm, phase);
        setAlign(a);
        cue?.play(a.cue);
        if (a.ok) {
          if (stableSinceRef.current == null) stableSinceRef.current = ts;
          const held = ts - stableSinceRef.current;
          setProgress(Math.min(1, held / 1000));
          if (held >= 1000) void doCapture();
        } else {
          stableSinceRef.current = null;
          setProgress(0);
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      try { scannerRef.current?.close(); } catch { /* ignore */ }
      scannerRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [phase, cue]);

  const manualShoot = () => { void (async () => {
    const scanner = scannerRef.current;
    const video = videoRef.current;
    if (!scanner || !video || capturingRef.current) return;
    capturingRef.current = true;
    const ts = performance.now();
    const lm = latestLmRef.current ?? scanner.pose(video, ts);
    const seg = await scanner.segment(video, ts);
    if (seg && lm) onCapturedRef.current({ mask: seg.mask, width: seg.width, height: seg.height, landmarks: lm });
    else capturingRef.current = false;
  })(); };

  if (state === "denied" || state === "modelfail") {
    return (
      <div className="mx-auto max-w-md space-y-4 px-5 py-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-3xl bg-warning-soft/60"><AlertTriangle className="size-7" style={{ color: toneVar.warning }} /></div>
        <h2 className="text-lg font-semibold">{state === "denied" ? "Camera unavailable" : "On-device scan couldn't start"}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {state === "denied"
            ? "We couldn't access your camera. Check the browser permission, or enter your measurements by hand."
            : "Your device couldn't load the on-device model (it may be low on memory or lack graphics support). You can enter your measurements by hand instead."}
        </p>
        <Button size="lg" className="w-full" onClick={onFallback}><Ruler /> Enter measurements by hand</Button>
      </div>
    );
  }

  const ready = state === "scanning" && align?.ok;
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-2">
      <div className="mb-3 text-center">
        <h2 className="text-lg font-semibold">{phase === "front" ? "Front pose" : phase === "relax" ? "Relax" : "Side pose"}</h2>
        <p className="text-xs text-muted-foreground">{phase === "front" ? "Face the camera, arms slightly out" : phase === "relax" ? "Face the camera, arms relaxed at your sides" : "Turn so your side faces the camera"}</p>
      </div>
      <div className={cn("relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black ring-2 transition-colors", ready ? "ring-success" : "ring-white/10")}>
        {/* Mirror the preview so left/right feel natural; measurements are mirror-invariant. */}
        <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full -scale-x-100" />
        {/* Framing guide */}
        <div className={cn("pointer-events-none absolute inset-x-[22%] inset-y-[6%] rounded-[999px] border-2 border-dashed transition-colors", ready ? "border-success/80" : "border-white/25")} />
        {state === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-black/60">
            <div className="flex flex-col items-center gap-2 text-white/80"><Spinner /> <span className="text-sm">Starting private on-device scan…</span></div>
          </div>
        )}
        {/* Hold-still progress ring */}
        {ready && progress > 0 && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-success transition-[width] duration-100" style={{ width: `${progress * 100}%` }} /></div>
          </div>
        )}
        {/* Live guidance */}
        {state === "scanning" && (
          <div className="absolute inset-x-3 bottom-3">
            <div className={cn("flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-center text-sm font-medium backdrop-blur-md", ready ? "bg-success/85 text-white" : "bg-black/65 text-white")}>
              {ready ? <Check className="size-4" /> : <ScanLine className="size-4" />}
              {align?.message ?? "Position yourself in the frame"}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="secondary" className="flex-1" disabled={state !== "scanning"} onClick={manualShoot}><Camera /> Capture now</Button>
        <Button variant="ghost" onClick={onFallback}><Ruler /> By hand</Button>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Auto-captures when you hold the pose. Nothing is recorded — only your outline is measured.</p>
    </div>
  );
}

/** Draw a light landmark skeleton on the overlay canvas (guidance only).
 *
 * The <video> is `object-cover` (16:9 frame cropped to fill the 3:4 box), so
 * landmarks — normalized to the FULL frame — must be mapped through that same
 * cover transform, or the skeleton lands in the wrong place (squished inward,
 * so shoulders/hips look mis-detected). We size the canvas buffer to the
 * displayed box and project each point with the cover scale + crop offset. */
function drawOverlay(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, lm: NormLandmark[] | null) {
  if (!canvas) return;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!cw || !ch || !vw || !vh) return;
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const bw = Math.round(cw * dpr);
  const bh = Math.round(ch * dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px; buffer is dpr-scaled
  ctx.clearRect(0, 0, cw, ch);
  if (!lm) return;

  // object-cover: scale the frame to cover the box, then center-crop the overflow.
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  const X = (nx: number) => ox + nx * dw;
  const Y = (ny: number) => oy + ny * dh;

  const pts = [LM.lShoulder, LM.rShoulder, LM.lHip, LM.rHip, LM.lElbow, LM.rElbow, LM.lWrist, LM.rWrist, LM.lAnkle, LM.rAnkle, LM.nose];
  const r = Math.max(3, cw * 0.013);
  ctx.fillStyle = "rgba(109,211,194,0.9)";
  for (const i of pts) {
    const p = lm[i];
    if (!p || (p.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
    ctx.fill();
  }
  const bone = (a: number, b: number) => {
    const p = lm[a]; const q = lm[b];
    if (!p || !q) return;
    ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(q.x), Y(q.y)); ctx.stroke();
  };
  ctx.strokeStyle = "rgba(109,211,194,0.55)";
  ctx.lineWidth = Math.max(2, cw * 0.008);
  bone(LM.lShoulder, LM.rShoulder); bone(LM.lShoulder, LM.lHip); bone(LM.rShoulder, LM.rHip); bone(LM.lHip, LM.rHip);
  bone(LM.lShoulder, LM.lElbow); bone(LM.lElbow, LM.lWrist); bone(LM.rShoulder, LM.rElbow); bone(LM.rElbow, LM.rWrist);
  bone(LM.lHip, LM.lAnkle); bone(LM.rHip, LM.rAnkle);
}

// ── Measuring ────────────────────────────────────────────────────────────────
function Measuring() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner className="size-8" />
        <div className="space-y-1">
          <div className="font-semibold">Measuring on your device…</div>
          <p className="text-sm text-muted-foreground">Reading your proportions and estimating body composition. Your frames are being discarded now.</p>
        </div>
      </div>
    </div>
  );
}

// ── Manual measurement path ──────────────────────────────────────────────────
function ManualStep({ profile, latestWeightKg, units, notice, onResult }: {
  profile: ScanProfile;
  latestWeightKg: number | null;
  units: UnitPrefs;
  notice: string | null;
  onResult: (r: ScanResult) => void;
}) {
  const ll = lengthLabel(units);
  const wl = weightLabel(units);
  const [f, setF] = useState<Record<string, string>>(() => ({
    weight: latestWeightKg != null ? String(kgToDisplay(latestWeightKg, units)) : "",
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v.replace(/[^\d.]/g, "") }));
  const needHips = profile.gender === "female";

  const submit = () => {
    const neck = Number(f.neck);
    const waist = Number(f.waist);
    const hips = f.hips ? Number(f.hips) : null;
    const weightDisplay = Number(f.weight);
    if (!neck || !waist || !weightDisplay || (needHips && !hips)) { setErr("Please fill in your neck, waist" + (needHips ? ", hips" : "") + " and weight."); return; }
    const circ: Circumferences = { neckCm: Math.round(lengthDisplayToCm(neck, units) * 10) / 10, waistCm: Math.round(lengthDisplayToCm(waist, units) * 10) / 10 };
    if (hips) circ.hipsCm = Math.round(lengthDisplayToCm(hips, units) * 10) / 10;
    const weightKg = displayToKg(weightDisplay, units);
    const estimate = estimateBodyFat({ gender: profile.gender, ageYears: profile.ageYears, heightCm: profile.heightCm, weightKg, neckCm: circ.neckCm, waistCm: circ.waistCm, hipsCm: circ.hipsCm ?? null });
    if (!estimate) { setErr("Those measurements don't produce a valid estimate — check your waist is larger than your neck."); return; }
    onResult({ estimate, circumferences: circ, contourFront: null, contourSide: null, weightKg });
  };

  return (
    <div className="mx-auto max-w-md space-y-4 px-5 py-4">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">Enter your measurements</h2>
        <p className="text-sm text-muted-foreground">Use a tape measure. We'll estimate your body-fat percentage from these.</p>
      </div>
      {notice && <div className="whitespace-pre-line rounded-2xl bg-warning-soft/50 px-4 py-3 text-sm text-warning">{notice}</div>}
      <div className="space-y-3">
        <Field label={`Neck circumference (${ll})`} icon={Ruler} inputMode="decimal" value={f.neck ?? ""} onChange={(e) => set("neck", e.target.value)} placeholder="e.g. 38" />
        <Field label={`Waist circumference (${ll})`} icon={Ruler} inputMode="decimal" value={f.waist ?? ""} onChange={(e) => set("waist", e.target.value)} placeholder="e.g. 82" hint="Measured at the narrowest point, at the navel." />
        <Field label={`Hips circumference (${ll})${needHips ? "" : " — optional"}`} icon={Ruler} inputMode="decimal" value={f.hips ?? ""} onChange={(e) => set("hips", e.target.value)} placeholder="e.g. 98" />
        <Field label={`Weight (${wl})`} icon={User} inputMode="decimal" value={f.weight ?? ""} onChange={(e) => set("weight", e.target.value)} />
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <Button size="lg" className="w-full" onClick={submit}>See my estimate <ArrowRight /></Button>
    </div>
  );
}

// ── Result reveal + save ─────────────────────────────────────────────────────
function ResultStep({ clientId, result, profile, units, onSaved, onRetry }: {
  clientId: string;
  result: ScanResult;
  profile: ScanProfile;
  units: UnitPrefs;
  onSaved: (r: ScanResult & { id: string }) => void;
  onRetry: () => void;
}) {
  const { estimate, circumferences, contourFront } = result;
  const category = classifyBodyFat(estimate.bodyFatPercent, profile.gender);
  const count = useCountUp(estimate.bodyFatPercent);
  const [storeSilhouette, setStoreSilhouette] = useState(false);
  const [weight, setWeight] = useState(() => String(kgToDisplay(result.weightKg, units)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wl = weightLabel(units);
  const hasContour = !!contourFront && contourFront.length > 3;

  const save = async () => {
    const weightKg = displayToKg(Number(weight) || kgToDisplay(result.weightKg, units), units);
    setBusy(true); setErr(null);
    try {
      const body = {
        clientId, date: todayLocal(), weightKg,
        circumferences: circumferences,
        contourFront: storeSilhouette ? result.contourFront ?? undefined : undefined,
        contourSide: storeSilhouette ? result.contourSide ?? undefined : undefined,
        storeSilhouette,
      };
      const r = await api.post<{ ok: boolean; id: string }>("/api/body-scans", body);
      onSaved({ ...result, id: r.id });
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErr(status === 403 ? "Body scan isn't part of your current plan." : status === 422 ? "Your profile needs your sex, birth date and height before we can save this." : "Couldn't save your scan — please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5 px-5 py-4">
      {/* Silhouette + big number */}
      <div className="flex flex-col items-center">
        {hasContour ? (
          <Silhouette points={contourFront!} trace tone={toneVar.cardio} width={140} height={230} />
        ) : (
          <div className="grid h-[180px] w-[120px] place-items-center rounded-3xl bg-cardio/10"><User className="size-16" style={{ color: toneVar.cardio }} /></div>
        )}
        <div className="mt-1 flex items-end gap-1">
          <span className="numeral text-6xl font-bold tabular-nums tracking-tight">{count.toFixed(1)}</span>
          <Percent className="mb-2 size-7 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">estimated body fat</div>
        <div className="mt-2 flex items-center gap-2">
          {category && <Badge tone="cardio">{CATEGORY_LABEL[category]}</Badge>}
          <Badge tone={CONFIDENCE_TONE[estimate.confidence]}>
            <span className={cn("mr-0.5 inline-block size-2 rounded-full", estimate.confidence === "high" ? "bg-success" : estimate.confidence === "medium" ? "bg-warning" : "bg-danger")} />
            {CONFIDENCE_LABEL[estimate.confidence]}
          </Badge>
        </div>
      </div>

      {/* Confidence band */}
      <div className="rounded-2xl bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Likely range</span>
          <span className="numeral font-semibold">{estimate.low.toFixed(1)}%–{estimate.high.toFixed(1)}%</span>
        </div>
        <BandBar low={estimate.low} value={estimate.bodyFatPercent} high={estimate.high} />
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          A camera estimate is a ballpark (±~4%). Your <span className="font-medium text-foreground">trend</span> across scans is what matters — not any single number.
        </p>
      </div>

      {/* How we got here */}
      <details className="rounded-2xl bg-card p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold">How we got here</summary>
        <div className="mt-3 space-y-2">
          {estimate.methods.map((m) => (
            <div key={m.method} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 capitalize text-muted-foreground">{METHOD_LABEL[m.method]}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.round(m.weight * 100)}%`, backgroundColor: toneVar.cardio }} /></div>
              <span className="numeral w-12 text-right font-medium">{m.value.toFixed(1)}%</span>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">We blend several independent formulas; how much they agree sets the confidence band.</p>
        </div>
      </details>

      {/* Measurements */}
      <div className="grid grid-cols-4 gap-2">
        <MeasBox label="Neck" cm={circumferences.neckCm} units={units} />
        <MeasBox label="Waist" cm={circumferences.waistCm} units={units} />
        <MeasBox label="Hips" cm={circumferences.hipsCm} units={units} />
        <MeasBox label="Chest" cm={circumferences.chestCm} units={units} />
      </div>

      {/* Save */}
      <div className="space-y-3 rounded-2xl bg-card p-4">
        <Field label={`Weight (${wl})`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} />
        <label className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Save my silhouette outline</div>
            <div className="text-xs text-muted-foreground">A de-identified outline (no photo) so you can watch your shape change. You can turn this off any time.</div>
          </div>
          <Switch checked={storeSilhouette} onCheckedChange={setStoreSilhouette} disabled={!hasContour} aria-label="Save de-identified silhouette outline" />
        </label>
        {!hasContour && <p className="text-xs text-muted-foreground">No outline was captured for this entry.</p>}
      </div>

      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRetry} disabled={busy}><RotateCcw /> Redo</Button>
        <Button className="flex-1" size="lg" onClick={() => void save()} disabled={busy}>{busy ? <><Spinner /> Saving…</> : <><Check /> Save scan</>}</Button>
      </div>
    </div>
  );
}

const METHOD_LABEL: Record<string, string> = { navy: "Navy tape", rfm: "Waist-height", deurenberg: "BMI + age" };

function BandBar({ low, value, high }: { low: number; value: number; high: number }) {
  // Fixed 0..50% axis for a stable, readable band.
  const AX = 50;
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / AX) * 100))}%`;
  return (
    <div className="relative mt-3 h-2.5 rounded-full bg-surface-2">
      <div className="absolute top-0 h-full rounded-full bg-cardio/40" style={{ left: pct(low), right: `calc(100% - ${pct(high)})` }} />
      <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-cardio" style={{ left: pct(value) }} />
    </div>
  );
}

function MeasBox({ label, cm, units }: { label: string; cm: number | null | undefined; units: UnitPrefs }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5 text-center">
      <div className="text-[0.65rem] font-medium text-muted-foreground">{label}</div>
      <div className="numeral mt-0.5 text-sm font-bold">{cm != null ? Math.round(cmToLengthDisplayLocal(cm, units)) : "—"}<span className="ml-0.5 text-[0.55rem] text-muted-foreground">{cm != null ? lengthLabel(units) : ""}</span></div>
    </div>
  );
}
// Local re-export to avoid another import line churn.
function cmToLengthDisplayLocal(cm: number, units: UnitPrefs): number {
  return units.length === "in" ? cm / 2.54 : cm;
}

/** Animate 0 → target once on mount (respects reduced-motion). */
function useCountUp(target: number, ms = 1100): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}
