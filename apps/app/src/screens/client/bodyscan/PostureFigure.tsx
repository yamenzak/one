/**
 * Posture visual — the side-view human figure with the sagittal alignment drawn
 * on it: a plumb reference down from the shoulder, and the hip→shoulder→ear line
 * whose forward lean at the neck IS the forward-head read (lower craniovertebral
 * angle → the head juts further forward). Reconstructed schematically from the
 * stored angles (we keep the CVA + trunk tilt, not the raw landmarks), so it's a
 * clear picture of the trend, not a medical measurement.
 */

import type { Pt } from "@mossa/domain";

type Severity = "good" | "mild" | "moderate" | "severe";
const TONE: Record<Severity, string> = { good: "var(--success)", mild: "var(--warning)", moderate: "var(--warning)", severe: "var(--danger)" };

export function PostureFigure({ side, cvaDeg, trunkTiltDeg, severity, width = 150, height = 260 }: {
  side: Pt[] | null;
  cvaDeg: number | null;
  trunkTiltDeg: number | null;
  severity: Severity;
  width?: number;
  height?: number;
}) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const cva = cvaDeg ?? 50, tilt = trunkTiltDeg ?? 0;
  const tone = TONE[severity];
  // Schematic landmarks in 0..1 figure space (x forward = +, y down = +).
  const hip = { x: 0.5, y: 0.5 };
  const torso = 0.30;
  const sh = { x: hip.x + Math.sin(rad(tilt)) * torso, y: hip.y - Math.cos(rad(tilt)) * torso };
  const neck = 0.14;
  const ear = { x: sh.x + Math.cos(rad(cva)) * neck, y: sh.y - Math.sin(rad(cva)) * neck };
  const P = (p: { x: number; y: number }) => `${(p.x * width).toFixed(1)},${(p.y * height).toFixed(1)}`;
  const sil = side && side.length > 3 ? side.map((p, i) => `${i ? "L" : "M"}${(p[0] * width).toFixed(1)},${(p[1] * height).toFixed(1)}`).join("") + "Z" : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Posture side view, craniovertebral angle ${Math.round(cva)} degrees`}>
      {sil && <path d={sil} fill="var(--sleep)" fillOpacity={0.1} stroke="var(--sleep)" strokeOpacity={0.35} strokeWidth={1.5} strokeLinejoin="round" />}
      {/* Plumb reference from the shoulder — upright alignment. */}
      <line x1={sh.x * width} y1={sh.y * height} x2={sh.x * width} y2={height * 0.97} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4" />
      {/* Actual hip → shoulder → ear line. */}
      <polyline points={`${P(hip)} ${P(sh)} ${P(ear)}`} fill="none" stroke={tone} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {[hip, sh, ear].map((p, i) => <circle key={i} cx={p.x * width} cy={p.y * height} r={4} fill={tone} />)}
      {cvaDeg != null && <text x={sh.x * width + 9} y={sh.y * height - 5} fontSize={12} fontWeight={600} fill="currentColor">{Math.round(cvaDeg)}°</text>}
    </svg>
  );
}
