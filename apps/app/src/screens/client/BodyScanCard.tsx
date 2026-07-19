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
  Card, Button, Badge, Spinner, IconBadge, EmptyState, cn, toneVar,
  AreaChart, ScanLine, Camera, Sparkles, Percent,
} from "@mossa/ui";
import { api } from "../../api.js";
import { useSession } from "../../session.js";
import { morphPoly, Silhouette } from "./bodyscan/Silhouette.js";
import { BodyScanLauncher } from "./bodyscan/BodyScanLauncher.js";

interface Scan {
  id: string;
  date: string;
  bodyFatPercent: number | null;
  low: number | null;
  high: number | null;
  confidence: "high" | "medium" | "low" | null;
  circumferences: { neckCm: number | null; waistCm: number | null; hipsCm: number | null; chestCm: number | null };
  weightKg: number | null;
  contourFront: [number, number][] | null;
  contourSide: [number, number][] | null;
  createdAt: string;
}
const CONF_TONE = { high: "success", medium: "warning", low: "danger" } as const;
const CONF_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Lower confidence" } as const;

export function BodyScanCard({ clientId }: { clientId: string }) {
  const { ctx } = useSession();
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [blocked, setBlocked] = useState(false);

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
      {({ open, loading, profileReady }) => (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <IconBadge icon={ScanLine} tone="cardio" size="sm" />
              <div>
                <div className="font-semibold">Body scan</div>
                <div className="text-xs text-muted-foreground">Camera body-fat estimate</div>
              </div>
            </div>
            {profileReady && !blocked && (
              <Button size="sm" onClick={open}><Camera /> {latest ? "New scan" : "Scan"}</Button>
            )}
          </div>

          {blocked ? (
            <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted-foreground">Body scan isn't part of your current plan.</div>
          ) : scans == null || loading ? (
            <div className="grid h-24 place-items-center"><Spinner /></div>
          ) : !profileReady ? (
            <div className="rounded-2xl bg-warning-soft/40 px-4 py-3 text-sm text-warning">
              Add your sex, birth date and height in your profile to use the body scan.
            </div>
          ) : latest ? (
            <ScanSummary scans={scans} latest={latest} />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No scans yet"
              description="Take a private, on-device scan to estimate your body composition and track the trend."
              action={<Button onClick={open}><Camera /> Start body scan</Button>}
            />
          )}
        </Card>
      )}
    </BodyScanLauncher>
  );
}

function ScanSummary({ scans, latest }: { scans: Scan[]; latest: Scan }) {
  const chrono = useMemo(() => [...scans].filter((s) => s.bodyFatPercent != null).reverse(), [scans]);
  const bfValues = chrono.map((s) => s.bodyFatPercent!);
  const withContour = useMemo(() => chrono.filter((s) => s.contourFront && s.contourFront.length > 3), [chrono]);

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

      {/* Trend */}
      {bfValues.length >= 2 && (
        <div className="rounded-2xl bg-surface-2 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Body-fat trend</div>
          <AreaChart values={bfValues} tone="cardio" height={130} trend format={(v) => `${v.toFixed(1)}%`} label={(i) => new Date(`${chrono[i]?.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
        </div>
      )}

      {/* Silhouette morph */}
      {withContour.length >= 2 && <SilhouetteMorph scans={withContour} />}
    </div>
  );
}

/** Crossfade + interpolate the outline between the earliest and latest stored
 *  silhouette; the scrubber sweeps the shape from then → now. */
function SilhouetteMorph({ scans }: { scans: Scan[] }) {
  const first = scans[0]!;
  const last = scans[scans.length - 1]!;
  const [t, setT] = useState(1);
  const poly = useMemo(() => morphPoly(first.contourFront!, last.contourFront!, t), [first, last, t]);
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Shape over time</span>
        <span className="numeral">{fmt(first.date)} → {fmt(last.date)}</span>
      </div>
      <div className="grid place-items-center py-1">
        <Silhouette points={poly} tone={toneVar.cardio} width={130} height={210} />
      </div>
      <input
        type="range" min={0} max={1} step={0.01} value={t} onChange={(e) => setT(Number(e.target.value))}
        aria-label="Scrub silhouette between earliest and latest scan"
        className="mt-1 w-full accent-[var(--color-cardio)]"
      />
    </div>
  );
}
