/**
 * LogDetail — a premium, analytics-rich page for a single Today-feed log (an
 * activity, a meal, a workout, a check-in, water, sleep, mood, a measurement, a
 * scan, a goal, a supplement day, a fast). One normalized payload from
 * GET /api/logs/detail drives an ambient-glow hero (ring or big numeral + stat
 * column), a macro bar where relevant, a framed trend chart with a change
 * badge, a details list and any note — all colour-keyed to the item's domain
 * tone and formatted in the viewer's units. Reached via /log/:kind/:ref.
 */

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { fmtEnergy, fmtWeight, fmtVolume, lengthLabel, type UnitPrefs } from "@mossa/domain";
import {
  Sheet, Card, Badge, IconBadge, ChartCard, AreaChart, BarChart, MacroBar, GlanceStrip, ProgressRing, SectionHeader, Reveal, SkeletonHero, SkeletonChart, EmptyState, Stagger, stagger, METRICS, toneVar, cn,
  Flame, Weight, Droplet, MapPin, Timer, HeartPulse, Gauge, Smile, Ruler, Activity, TrendingUp, TrendingDown,
  Footprints, Dumbbell, ClipboardList, Moon, Pill, ScanLine, Target, Utensils, Croissant, Soup, Apple,
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

/** Icon + tone for a stat — macros pick up their metric colour, otherwise the
 *  glyph tracks the unit and the item's own tone. */
function statMeta(s: Stat, base: Tone): { icon: LucideIcon; tone: Tone } {
  const l = s.label.toLowerCase();
  if (l.startsWith("protein")) return { icon: METRICS.protein.icon, tone: METRICS.protein.tone };
  if (l.startsWith("carb")) return { icon: METRICS.carbs.icon, tone: METRICS.carbs.tone };
  if (l.startsWith("fat") && !l.includes("body")) return { icon: METRICS.fat.icon, tone: METRICS.fat.tone };
  const byUnit: Partial<Record<UnitKind, LucideIcon>> = {
    energy: Flame, weight: Weight, volume: Droplet, distance: MapPin, length: Ruler,
    minutes: Timer, hours: Timer, bpm: HeartPulse, percent: Gauge, rating: Smile, count: Activity,
  };
  return { icon: byUnit[s.unit] ?? Activity, tone: base };
}

/** Format a raw metric value into the viewer's units. */
function fmtUnit(value: number | null | undefined, unit: UnitKind, units: UnitPrefs): string {
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
    case "rating": return `${round1(value)}`;
    case "bpm": return `${Math.round(value)} bpm`;
    case "count": case "raw": default: return `${Math.round(value * 10) / 10}`;
  }
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

/** icon + label + value + sub, mirroring the Progress hero's stat rows. */
function MiniStat({ icon: Icon, tone, label, value, sub }: { icon: LucideIcon; tone: Tone; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4" style={{ background: `color-mix(in oklch, ${toneVar[tone]} 15%, transparent)`, color: toneVar[tone] }}><Icon /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold tabular-nums">{value}{sub ? <span className="ml-0.5 text-xs font-normal text-muted-foreground">{sub}</span> : null}</div>
      </div>
    </div>
  );
}

/** A logged item's detail as a full-height, swipe-to-dismiss drawer — opened
 *  from the Today feed, so you keep your place in the feed. `kind` is the feed
 *  kind (food kinds arrive dot-encoded, e.g. "food.lunch"); `ref` is the row id
 *  or local date. */
export function LogDetailSheet({ kind, ref, onClose }: { kind: string; ref: string; onClose: () => void }) {
  const clientId = useActiveClientId();
  const units = useUnits();
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
    <Sheet open onClose={onClose}>
      <Reveal loading={state === "loading"} className="space-y-4 pb-1" skeleton={<><SkeletonHero height={150} /><SkeletonChart height={160} /></>}>
        {state === "error" || !d ? (
          <EmptyState icon={Activity} title="Couldn't load this" description="This log may have been removed. Close and try another." />
        ) : (
          <Detail d={d} Icon={Icon} units={units} />
        )}
      </Reveal>
    </Sheet>
  );
}

function Detail({ d, Icon, units }: { d: LogDetail; Icon: LucideIcon; units: UnitPrefs }) {
  const tone = d.tone;
  // Macro triad (protein/carbs/fat grams) → a real macro bar instead of 3 numbers.
  const gram = (kw: string) => d.stats.find((s) => s.unit === "raw" && s.label.toLowerCase().startsWith(kw))?.value ?? null;
  const p = gram("protein"), cb = gram("carb"), ft = gram("fat");
  const macros = p != null && cb != null && ft != null ? { proteinG: p, carbsG: cb, fatG: ft } : null;
  // Stats not already folded into the hero/macro bar → the glance strip.
  const glance = d.stats.filter((s) => !(macros && s.unit === "raw" && /^(protein|carb|fat)/.test(s.label.toLowerCase())));
  // A ring when the hero has a matching target (e.g. water vs goal).
  const target = d.series && d.hero && d.series.unit === d.hero.unit ? d.series.targetValue ?? null : null;
  const ringPct = target && d.hero ? Math.min(1, Math.max(0.001, d.hero.value / target)) : null;
  // Trend change badge: first vs last point.
  const pts = d.series?.points ?? [];
  const delta = pts.length >= 2 ? pts[pts.length - 1]!.value - pts[0]!.value : null;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
      {/* Hero */}
      <Stagger>
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full blur-3xl" style={{ background: `color-mix(in oklch, ${toneVar[tone]} 14%, transparent)` }} />
          <div className="relative">
            <div className="mb-4 flex items-center gap-3">
              <IconBadge icon={Icon} tone={tone} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-tight">{d.title}</div>
                <div className="text-xs text-muted-foreground">{dayLabel(d.date)}{d.subtitle ? ` · ${d.subtitle}` : ""}</div>
              </div>
            </div>
            <div className="flex items-center gap-5">
              {ringPct != null && d.hero ? (
                <ProgressRing size={116} strokeWidth={11} tone={tone} progress={ringPct} value={fmtUnit(d.hero.value, d.hero.unit, units).replace(/\s.*/, "")} label={d.hero.label} sublabel={target ? `of ${fmtUnit(target, d.hero.unit, units)}` : undefined} softTrack tintValue />
              ) : d.hero ? (
                <div className="shrink-0">
                  <div className="numeral text-5xl font-black leading-none tracking-tight" style={{ color: toneVar[tone] }}>{fmtUnit(d.hero.value, d.hero.unit, units)}</div>
                  <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{d.hero.label}</div>
                </div>
              ) : null}
              {glance.length > 0 && (
                <div className={cn("min-w-0 flex-1 space-y-2.5", !d.hero && "w-full")}>
                  {glance.slice(0, d.hero ? 3 : 4).map((s, i) => { const m = statMeta(s, tone); return <MiniStat key={i} icon={m.icon} tone={m.tone} label={s.label} value={fmtUnit(s.value, s.unit, units)} />; })}
                </div>
              )}
            </div>
            {macros && (
              <div className="mt-4 border-t border-border/50 pt-4">
                <MacroBar proteinG={macros.proteinG} carbsG={macros.carbsG} fatG={macros.fatG} />
              </div>
            )}
          </div>
        </Card>
      </Stagger>

      {/* Overflow stats as a card-less glance (only when the hero couldn't hold them all). */}
      {glance.length > (d.hero ? 3 : 4) && (
        <Stagger>
          <GlanceStrip items={glance.slice(d.hero ? 3 : 4, (d.hero ? 3 : 4) + 3).map((s) => { const m = statMeta(s, tone); return { icon: m.icon, tone: m.tone, value: fmtUnit(s.value, s.unit, units), label: s.label }; })} />
        </Stagger>
      )}

      {/* Trend */}
      {d.series && d.series.points.length > 1 && (
        <Stagger>
          <ChartCard
            title={d.series.title}
            icon={Icon}
            tone={tone}
            value={fmtUnit(pts[pts.length - 1]!.value, d.series.unit, units)}
            delta={delta != null && Math.abs(delta) > 0 ? (
              <Badge tone="neutral"><span className="inline-flex items-center gap-0.5 [&_svg]:size-3">{delta > 0 ? <TrendingUp /> : <TrendingDown />}{fmtUnit(Math.abs(delta), d.series.unit, units)}</span></Badge>
            ) : undefined}
          >
            {d.series.chart === "bar" ? (
              <BarChart values={d.series.points.map((x) => x.value)} labels={d.series.points.map((x) => x.label ?? "")} tone={tone} target={d.series.targetValue ?? undefined} format={(v) => fmtUnit(v, d.series!.unit, units)} />
            ) : (
              <AreaChart values={d.series.points.map((x) => x.value)} tone={tone} trend target={d.series.targetValue ?? undefined} format={(v) => fmtUnit(v, d.series!.unit, units)} label={(i) => d.series!.points[i]?.label ?? ""} />
            )}
          </ChartCard>
        </Stagger>
      )}

      {/* Items — foods / exercises / supplements */}
      {d.items.length > 0 && (
        <Stagger>
          <Card className="space-y-1">
            <SectionHeader icon={Icon} tone={tone} title="Breakdown" count={<Badge tone="neutral">{d.items.length}</Badge>} />
            <div className="divide-y divide-border/50">
              {d.items.map((it, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: toneVar[tone] }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.title}</div>
                    {it.sub && <div className="truncate text-xs text-muted-foreground">{it.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Stagger>
      )}

      {/* Spec rows */}
      {d.rows.length > 0 && (
        <Stagger>
          <Card className="divide-y divide-border/50">
            {d.rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-semibold tabular-nums">{r.value}</span>
              </div>
            ))}
          </Card>
        </Stagger>
      )}

      {d.note && (
        <Stagger>
          <Card>
            <SectionHeader title="Notes" />
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{d.note}</p>
          </Card>
        </Stagger>
      )}
    </motion.div>
  );
}
