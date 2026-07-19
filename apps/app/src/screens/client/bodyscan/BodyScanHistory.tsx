/**
 * Body-composition history — a full-screen browser over every stored scan: pick a
 * date, see its body-fat %, measurements, and its de-identified outline as a
 * FRONT silhouette, a SIDE silhouette, or a rotatable 3-D body reconstructed from
 * the two. Portaled to <body> so it sits above the tab bar. Read-only over data
 * already loaded by the card; nothing new leaves the device.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cmToLengthDisplay, lengthLabel, kgToDisplay, weightLabel, type UnitPrefs } from "@mossa/domain";
import {
  Button, Badge, IconBadge, SegmentedControl, AreaChart, cn, toneVar, useModalOverlay,
  ScanLine, X, Percent, RotateCcw, User,
} from "@mossa/ui";
import { Silhouette } from "./Silhouette.js";
import { Body3D } from "./Body3D.js";

type Pt = [number, number];
export interface HistoryScan {
  id: string;
  date: string;
  bodyFatPercent: number | null;
  low: number | null;
  high: number | null;
  confidence: "high" | "medium" | "low" | null;
  circumferences: { neckCm: number | null; waistCm: number | null; hipsCm: number | null; chestCm: number | null };
  weightKg: number | null;
  contourFront: Pt[] | null;
  contourSide: Pt[] | null;
}

const CONF_TONE = { high: "success", medium: "warning", low: "danger" } as const;
const CONF_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Lower confidence" } as const;
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const hasPts = (p: Pt[] | null): p is Pt[] => !!p && p.length > 3;

export function BodyScanHistory({ scans, units, onClose }: { scans: HistoryScan[]; units: UnitPrefs; onClose: () => void }) {
  const ref = useModalOverlay(onClose);
  const list = useMemo(() => scans.filter((s) => s.bodyFatPercent != null), [scans]); // newest-first
  const chrono = useMemo(() => [...list].reverse(), [list]);
  const [selId, setSelId] = useState(list[0]?.id);
  const [view, setView] = useState<"front" | "side" | "3d">("front");
  const scan = list.find((s) => s.id === selId) ?? list[0];

  if (!scan) return null;

  const front = hasPts(scan.contourFront) ? scan.contourFront : null;
  const side = hasPts(scan.contourSide) ? scan.contourSide : null;
  const viewOpts = [
    ...(front ? [{ value: "front" as const, label: "Front" }] : []),
    ...(side ? [{ value: "side" as const, label: "Side" }] : []),
    ...(front ? [{ value: "3d" as const, label: (<span className="inline-flex items-center gap-1"><RotateCcw className="size-3.5" /> 3D</span>) }] : []),
  ];
  const activeView = viewOpts.some((o) => o.value === view) ? view : (viewOpts[0]?.value ?? "front");

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Body composition history"
      className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground outline-none"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <IconBadge icon={ScanLine} tone="cardio" size="sm" />
          <span className="font-semibold">Body composition</span>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close" data-autofocus onClick={onClose}><X /></Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md space-y-4">
          {/* Hero: the selected scan's outline / 3D + its number */}
          <div className="rounded-3xl bg-card p-4">
            {viewOpts.length > 0 && (
              <SegmentedControl className="mb-3" options={viewOpts} value={activeView} onChange={setView} fill />
            )}
            <div className="grid min-h-[300px] place-items-center py-1">
              {activeView === "3d" && front ? (
                <Body3D front={front} side={side} width={230} height={300} />
              ) : activeView === "side" && side ? (
                <Silhouette points={side} tone={toneVar.cardio} width={190} height={300} />
              ) : front ? (
                <Silhouette points={front} tone={toneVar.cardio} width={190} height={300} />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <User className="size-16" />
                  <span className="text-xs">No silhouette saved for this scan</span>
                </div>
              )}
            </div>
            {activeView === "3d" && (
              <p className="text-center text-xs text-muted-foreground">Drag to rotate · reconstructed from your front &amp; side outlines</p>
            )}

            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="flex items-end gap-1">
                  <span className="numeral text-5xl font-bold tabular-nums tracking-tight">{scan.bodyFatPercent!.toFixed(1)}</span>
                  <Percent className="mb-1.5 size-5 text-muted-foreground" />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {scan.confidence && (
                    <Badge tone={CONF_TONE[scan.confidence]}>
                      <span className={cn("mr-0.5 inline-block size-2 rounded-full", scan.confidence === "high" ? "bg-success" : scan.confidence === "medium" ? "bg-warning" : "bg-danger")} />
                      {CONF_LABEL[scan.confidence]}
                    </Badge>
                  )}
                  {scan.low != null && scan.high != null && (
                    <span className="numeral text-xs text-muted-foreground">{scan.low.toFixed(1)}–{scan.high.toFixed(1)}%</span>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {fmtDate(scan.date)}
                {scan.weightKg != null && <div className="numeral">{kgToDisplay(scan.weightKg, units).toFixed(1)} {weightLabel(units)}</div>}
              </div>
            </div>
          </div>

          {/* Measurements */}
          <div className="grid grid-cols-4 gap-2">
            <Meas label="Neck" cm={scan.circumferences.neckCm} units={units} />
            <Meas label="Waist" cm={scan.circumferences.waistCm} units={units} />
            <Meas label="Hips" cm={scan.circumferences.hipsCm} units={units} />
            <Meas label="Chest" cm={scan.circumferences.chestCm} units={units} />
          </div>

          {/* Trend */}
          {chrono.length >= 2 && (
            <div className="rounded-2xl bg-card p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Body-fat trend</div>
              <AreaChart values={chrono.map((s) => s.bodyFatPercent!)} tone="cardio" height={120} trend format={(v) => `${v.toFixed(1)}%`} label={(i) => new Date(`${chrono[i]?.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
            </div>
          )}

          {/* All scans */}
          <div>
            <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{list.length} scan{list.length === 1 ? "" : "s"}</div>
            <div className="space-y-2">
              {list.map((s) => {
                const on = s.id === scan.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelId(s.id)}
                    aria-current={on ? "true" : undefined}
                    className={cn("flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors", on ? "bg-cardio/15 ring-1 ring-cardio/40" : "bg-card hover:bg-surface-2")}
                  >
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2">
                      {hasPts(s.contourFront) ? <Silhouette points={s.contourFront} tone={toneVar.cardio} width={30} height={44} /> : <User className="size-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{fmtDate(s.date)}</div>
                      <div className="text-xs text-muted-foreground">{s.circumferences.waistCm != null ? `waist ${Math.round(cmToLengthDisplay(s.circumferences.waistCm, units))} ${lengthLabel(units)}` : "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="numeral text-lg font-bold tabular-nums">{s.bodyFatPercent!.toFixed(1)}<span className="text-xs text-muted-foreground">%</span></div>
                      {s.confidence && <span className={cn("inline-block size-2 rounded-full", s.confidence === "high" ? "bg-success" : s.confidence === "medium" ? "bg-warning" : "bg-danger")} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Meas({ label, cm, units }: { label: string; cm: number | null; units: UnitPrefs }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5 text-center">
      <div className="text-[0.65rem] font-medium text-muted-foreground">{label}</div>
      <div className="numeral mt-0.5 text-sm font-bold">{cm != null ? Math.round(cmToLengthDisplay(cm, units)) : "—"}<span className="ml-0.5 text-[0.55rem] text-muted-foreground">{cm != null ? lengthLabel(units) : ""}</span></div>
    </div>
  );
}
