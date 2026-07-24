/**
 * LogDetail — a dedicated page for a single logged item from the Today feed
 * (an activity, a meal, a workout, a check-in, water, sleep, mood, a body
 * measurement, a scan, a goal, a supplement day, a fast). Renders a normalized
 * detail payload from GET /api/logs/detail: a hero stat, a glance of stats, an
 * analytics trend chart, item/detail rows and any note — colour-keyed to the
 * item's domain tone. Reached via /log/:kind/:ref.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fmtEnergy, fmtWeight, fmtVolume, lengthLabel, type UnitPrefs } from "@mossa/domain";
import {
  Page, Card, IconBadge, ChartCard, AreaChart, BarChart, Skeleton, EmptyState, Eyebrow,
  ArrowLeft, ChevronRight, Footprints, Dumbbell, Droplet, Weight, ClipboardList, Moon, Smile, Timer, Pill, ScanLine, Target, Utensils, Croissant, Soup, Apple, Activity,
  type LucideIcon, type Tone,
} from "@mossa/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";
import { useActiveClientId } from "../../session.js";
import { activityIcon } from "./activityIcons.js";

type UnitKind = "energy" | "weight" | "volume" | "distance" | "length" | "count" | "minutes" | "hours" | "percent" | "rating" | "bpm" | "raw";
interface Stat { label: string; value: number | null; unit: UnitKind }
interface SeriesPoint { date?: string; label?: string; value: number }
interface DetailSeries { title: string; unit: UnitKind; chart: "area" | "bar"; points: SeriesPoint[]; targetValue?: number | null }
interface LogDetail {
  kind: string; date: string; title: string; subtitle?: string | null; tone: Tone;
  hero?: { value: number; unit: UnitKind; label: string } | null;
  stats: Stat[];
  items: { title: string; sub?: string | null }[];
  rows: { label: string; value: string }[];
  note?: string | null;
  series?: DetailSeries | null;
}

const ICONS: Record<string, LucideIcon> = {
  food: Utensils, "food:breakfast": Croissant, "food:lunch": Soup, "food:dinner": Utensils, "food:snack": Apple,
  water: Droplet, workout: Dumbbell, activity: Footprints, measurement: Weight, checkin: ClipboardList,
  sleep: Moon, mood: Smile, fast: Timer, supplement: Pill, bodyscan: ScanLine, goal: Target,
};
function iconFor(kind: string, ref: string): LucideIcon {
  const base = kind.replace(".", ":");
  if (base === "activity") return activityIcon(ref);
  return ICONS[base] ?? ICONS[base.split(":")[0]!] ?? Activity;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Format a raw metric value into the viewer's units. */
function fmtUnit(value: number | null, unit: UnitKind, units: UnitPrefs): string {
  if (value == null) return "—";
  switch (unit) {
    case "energy": return fmtEnergy(value, units);
    case "weight": return fmtWeight(value, units);
    case "volume": return fmtVolume(value, units);
    case "distance": { const mi = units.length === "in"; return `${round1(value / (mi ? 1609.34 : 1000))} ${mi ? "mi" : "km"}`; }
    case "length": return units.length === "in" ? `${round1(value / 2.54)} in` : `${Math.round(value)} ${lengthLabel(units)}`;
    case "minutes": return `${Math.round(value)} min`;
    case "hours": return `${round1(value)} h`;
    case "percent": return `${round1(value)}%`;
    case "rating": return `${value}/5`;
    case "bpm": return `${Math.round(value)} bpm`;
    case "count": case "raw": default: return `${Math.round(value * 10) / 10}`;
  }
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

export function LogDetail() {
  const { kind = "", ref = "" } = useParams();
  const clientId = useActiveClientId();
  const units = useUnits();
  const nav = useNavigate();
  const [d, setD] = useState<LogDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    setState("loading");
    api.get<LogDetail>(`/api/logs/detail?clientId=${clientId}&kind=${encodeURIComponent(kind)}&ref=${encodeURIComponent(ref)}`)
      .then((r) => { if (alive) { setD(r); setState("ready"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [clientId, kind, ref]);

  const Icon = iconFor(kind, ref);

  return (
    <Page>
      <button onClick={() => nav(-1)} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4"><ArrowLeft /> Back</button>

      {state === "loading" ? (
        <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>
      ) : state === "error" || !d ? (
        <EmptyState icon={Activity} title="Couldn't load this" description="This log may have been removed. Go back and try another." />
      ) : (
        <div className="space-y-4">
          {/* Header + hero */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <IconBadge icon={Icon} tone={d.tone} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold leading-tight">{d.title}</div>
                <div className="text-xs text-muted-foreground">{dayLabel(d.date)}{d.subtitle ? ` · ${d.subtitle}` : ""}</div>
              </div>
            </div>
            {d.hero && (
              <div>
                <div className="text-4xl font-black tracking-tight" style={{ color: `var(--${d.tone})` }}>{fmtUnit(d.hero.value, d.hero.unit, units)}</div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{d.hero.label}</div>
              </div>
            )}
            {d.stats.length > 0 && (
              <div className="grid grid-cols-3 gap-3 border-t border-border/50 pt-3">
                {d.stats.map((s, i) => (
                  <div key={i} className="min-w-0">
                    <div className="truncate text-sm font-semibold tabular-nums">{fmtUnit(s.value, s.unit, units)}</div>
                    <div className="truncate text-[0.7rem] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Trend */}
          {d.series && d.series.points.length > 1 && (
            <ChartCard title={d.series.title} tone={d.tone}>
              {d.series.chart === "bar" ? (
                <BarChart
                  values={d.series.points.map((p) => p.value)}
                  labels={d.series.points.map((p) => p.label ?? "")}
                  tone={d.tone}
                  target={d.series.targetValue ?? undefined}
                  format={(v) => fmtUnit(v, d.series!.unit, units)}
                />
              ) : (
                <AreaChart
                  values={d.series.points.map((p) => p.value)}
                  tone={d.tone}
                  target={d.series.targetValue ?? undefined}
                  format={(v) => fmtUnit(v, d.series!.unit, units)}
                  label={(i) => d.series!.points[i]?.label ?? ""}
                />
              )}
            </ChartCard>
          )}

          {/* Items (foods / exercises / supplements) */}
          {d.items.length > 0 && (
            <Card>
              <Eyebrow>Details</Eyebrow>
              <div className="mt-2 divide-y divide-border/50">
                {d.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.title}</div>
                      {it.sub && <div className="truncate text-xs text-muted-foreground">{it.sub}</div>}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/30" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Extra rows */}
          {d.rows.length > 0 && (
            <Card className="space-y-2">
              {d.rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium tabular-nums">{r.value}</span>
                </div>
              ))}
            </Card>
          )}

          {d.note && (
            <Card>
              <Eyebrow>Notes</Eyebrow>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/85">{d.note}</p>
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}
