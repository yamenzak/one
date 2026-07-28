/**
 * Body-scan entry + progress (SPEC §8.5). Lives on the Progress "Body" lens.
 * Shows the latest camera body-fat estimate, the trend across scans (with the
 * confidence band), and — when de-identified outlines were stored — a silhouette
 * morph scrubber between the earliest and latest scan. Starting a scan
 * dynamically imports the heavy on-device module (MediaPipe) so it never bloats
 * the main bundle.
 *
 * Gated on the client capability flag `canUseBodyScan`; the API's 403 is the
 * real boundary, this just hides the surface when the flag is known-off.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Card, Button, Badge, Spinner, IconBadge, EmptyState, SegmentedControl, cn, toneVar, POSTURE_SEVERITY_TONE,
  AreaChart, ScanLine, Camera, Percent, History, RotateCcw, ChevronRight,
} from "@kova/ui";
import { api } from "../../api.js";
import { useSession } from "../../session.js";
import { useUnits } from "../../units.js";
import { morphPoly, Silhouette } from "./bodyscan/Silhouette.js";
import { scanProfile, modelSilhouette } from "./bodyscan/model.js";
import { Body3D } from "./bodyscan/Body3D.js";
import { BodyScanLauncher } from "./bodyscan/BodyScanLauncher.js";
import { BodyScanHistory } from "./bodyscan/BodyScanHistory.js";

interface Scan {
  id: string;
  date: string;
  bodyFatPercent: number | null;
  low: number | null;
  high: number | null;
  confidence: "high" | "medium" | "low" | null;
  circumferences: { neckCm: number | null; waistCm: number | null; hipsCm: number | null; chestCm: number | null };
  weightKg: number | null;
  heightCm: number | null;
  contourFront: [number, number][] | null;
  contourSide: [number, number][] | null;
  posture: { cvaDeg: number | null; trunkTiltDeg: number | null; severity: "good" | "mild" | "moderate" | "severe" } | null;
  somatotype: string | null;
  createdAt: string;
}
const CONF_TONE = { high: "success", medium: "warning", low: "danger" } as const;
const CONF_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Lower confidence" } as const;
const POSTURE_TONE = POSTURE_SEVERITY_TONE; // SSOT — was a divergent local copy
const capw = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function BodyScanCard({ clientId }: { clientId: string }) {
  const { ctx } = useSession();
  const units = useUnits();
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  // null = closed; object opens the history sheet (optionally at a scan).
  const [history, setHistory] = useState<{ initialId?: string } | null>(null);

  // Known-off flag → render nothing (Progress just skips the section). The
  // launcher enforces the same gate; we mirror it here to skip the scans fetch.
  const flagOff = ctx?.clientFlags?.canUseBodyScan === false;

  const load = async () => {
    try {
      const r = await api.get<{ scans: Scan[] }>(`/api/body-scans?clientId=${clientId}`);
      setScans(r.scans);
    } catch (e) {
      if ((e as { status?: number }).status === 403) setBlocked(true);
      setScans([]);
    }
  };
  useEffect(() => {
    if (flagOff) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, flagOff]);

  if (flagOff) return null;

  const latest = scans?.find((s) => s.bodyFatPercent != null) ?? null;

  return (
    <BodyScanLauncher clientId={clientId} onSaved={() => void load()}>
      {({ open, loading, profileReady, hasHeight }) => (
        <>
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <IconBadge icon={ScanLine} tone="sleep" size="sm" />
              <div>
                <div className="font-semibold">Body scan</div>
                <div className="text-xs text-muted-foreground">Camera body-fat estimate</div>
              </div>
            </div>
            {profileReady && !blocked && (
              <Button size="sm" style={{ backgroundColor: toneVar.sleep, color: "var(--tone-foreground)" }} onClick={open}><Camera /> {latest ? "New scan" : "Scan"}</Button>
            )}
          </div>

          {blocked ? (
            <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted-foreground">Body scan isn't part of your current plan.</div>
          ) : scans == null || loading ? (
            <div className="grid h-24 place-items-center"><Spinner /></div>
          ) : !profileReady ? (
            <div className="rounded-2xl bg-warning-soft/40 px-4 py-3 text-sm text-warning">
              {!hasHeight
                ? "Add your height in your profile first — the body scan needs it to calibrate your measurements."
                : "Add your sex, birth date and height in your profile to use the body scan."}
            </div>
          ) : latest ? (
            <ScanSummary scans={scans} latest={latest} onOpenHistory={(initialId) => setHistory({ initialId })} />
          ) : (
            <EmptyState
              icon={ScanLine}
              title="No scans yet"
              description="Take a private, on-device scan to estimate your body composition and track the trend."
              action={<Button onClick={open}><Camera /> Start body scan</Button>}
            />
          )}
        </Card>
        {history && scans && <BodyScanHistory scans={scans} units={units} initialId={history.initialId} onClose={() => setHistory(null)} />}
        </>
      )}
    </BodyScanLauncher>
  );
}

function ScanSummary({ scans, latest, onOpenHistory }: { scans: Scan[]; latest: Scan; onOpenHistory: (initialId?: string) => void }) {
  const chrono = useMemo(() => [...scans].filter((s) => s.bodyFatPercent != null).reverse(), [scans]);
  const bfValues = chrono.map((s) => s.bodyFatPercent!);
  // Renderable = has a measurement-driven model, or a stored capture outline.
  const renderable = useMemo(() => chrono.filter((s) => scanProfile(s) || (s.contourFront && s.contourFront.length > 3)), [chrono]);

  return (
    <div className="space-y-4">
      {/* Latest number */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-end gap-1">
            <span className="numeral text-5xl font-bold tabular-nums tracking-tight">{latest.bodyFatPercent!.toFixed(1)}</span>
            <Percent className="mb-1.5 size-5 text-muted-foreground" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            {latest.confidence && (
              <Badge tone={CONF_TONE[latest.confidence]}>
                <span className={cn("mr-0.5 inline-block size-2 rounded-full", latest.confidence === "high" ? "bg-success" : latest.confidence === "medium" ? "bg-warning" : "bg-danger")} />
                {CONF_LABEL[latest.confidence]}
              </Badge>
            )}
            {latest.low != null && latest.high != null && (
              <span className="numeral text-xs text-muted-foreground">{latest.low.toFixed(1)}–{latest.high.toFixed(1)}%</span>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {new Date(`${latest.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          <div className="numeral">{scans.length} scan{scans.length === 1 ? "" : "s"}</div>
        </div>
      </div>

      {/* Body type + posture */}
      {(latest.somatotype || latest.posture) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {latest.somatotype && <span className="rounded-full bg-surface-2 px-2.5 py-1"><span className="text-muted-foreground">Body type · </span><span className="font-semibold">{latest.somatotype}</span></span>}
          {latest.posture && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1">
              <span className="text-muted-foreground">Posture</span>
              <Badge tone={POSTURE_TONE[latest.posture.severity]}>{capw(latest.posture.severity)}</Badge>
            </span>
          )}
        </div>
      )}

      {/* Trend */}
      {bfValues.length >= 2 && (
        <div className="rounded-2xl bg-surface-2 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Body-fat trend</div>
          <AreaChart values={bfValues} tone="sleep" height={130} trend format={(v) => `${v.toFixed(1)}%`} label={(i) => new Date(`${chrono[i]?.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
        </div>
      )}

      {/* Shape over time — front + side (or 3D), one slider drives both */}
      {renderable.length >= 1 && <ShapeOverTime scans={renderable} onOpenDetails={(id) => onOpenHistory(id)} />}

      <Button variant="secondary" className="w-full" onClick={() => onOpenHistory()}>
        <History /> View history
      </Button>
    </div>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmtShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Shape over time — front AND side silhouettes swept by ONE slider (or a
 * rotatable 3-D at the same point), with the body-fat % and date at that moment.
 * Silhouettes morph between adjacent scans; the number/date read the nearer scan
 * so they stay real measured values.
 */
function ShapeOverTime({ scans, onOpenDetails }: { scans: Scan[]; onOpenDetails: (scanId: string) => void }) {
  const [t, setT] = useState(1);
  const [mode, setMode] = useState<"shape" | "3d">("shape");
  const sil = (view: "front" | "side") => (s: Scan) => { const p = scanProfile(s); return p ? modelSilhouette(p, view) : (view === "front" ? s.contourFront : s.contourSide); };
  const fronts = useMemo(() => scans.map(sil("front")), [scans]); // eslint-disable-line react-hooks/exhaustive-deps
  const sides = useMemo(() => scans.map(sil("side")), [scans]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasSide = sides.every((p) => p && p.length > 3);

  const n = scans.length;
  const f = t * (n - 1);
  const i = Math.min(n - 2, Math.max(0, Math.floor(f)));
  const frac = n > 1 ? f - i : 0;
  const near = scans[Math.round(f)]!;
  const frontPoly = n > 1 && fronts[i] && fronts[i + 1] ? morphPoly(fronts[i]!, fronts[i + 1]!, frac) : fronts[Math.round(f)];
  const sidePoly = hasSide && n > 1 ? morphPoly(sides[i]!, sides[i + 1]!, frac) : sides[Math.round(f)];
  const bf = n > 1 ? lerp(scans[i]!.bodyFatPercent ?? 0, scans[i + 1]!.bodyFatPercent ?? 0, frac) : (near.bodyFatPercent ?? 0);
  const nearProfile = scanProfile(near);

  return (
    <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl
          options={[{ value: "shape", label: "Shape" }, { value: "3d", label: (<span className="inline-flex items-center gap-1"><RotateCcw className="size-3.5" /> 3D</span>) }]}
          value={mode} onChange={setMode}
        />
        <button onClick={() => onOpenDetails(near.id)} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-sleep transition-opacity active:opacity-70">
          Open details <ChevronRight className="size-3.5" />
        </button>
      </div>

      <div className="grid min-h-[220px] place-items-center">
        {mode === "3d" ? (
          nearProfile ? <Body3D profile={nearProfile} width={200} height={220} /> : <span className="text-xs text-muted-foreground">No model for this scan</span>
        ) : (
          <div className="flex items-end justify-center gap-6">
            {frontPoly && <figure className="m-0"><Silhouette points={frontPoly} tone={toneVar.sleep} width={104} height={200} /><figcaption className="mt-1 text-center text-xs text-muted-foreground">Front</figcaption></figure>}
            {hasSide && sidePoly && <figure className="m-0"><Silhouette points={sidePoly} tone={toneVar.sleep} width={88} height={200} /><figcaption className="mt-1 text-center text-xs text-muted-foreground">Side</figcaption></figure>}
          </div>
        )}
      </div>

      <div className="text-center">
        <span className="numeral text-2xl font-bold tabular-nums">{bf.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground">% · {fmtShort(near.date)}</span>
      </div>
      {n > 1 && (
        <input
          type="range" min={0} max={1} step={0.005} value={t} onChange={(e) => setT(Number(e.target.value))}
          aria-label="Scrub the body shape across your scans"
          className="w-full accent-[var(--color-sleep)]"
        />
      )}
    </div>
  );
}
