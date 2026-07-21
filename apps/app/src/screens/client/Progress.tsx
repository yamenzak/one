/**
 * Progress tab — a data-rich analytics dashboard. One aggregation
 * (`/api/progress`) feeds four lenses: Overview (a wellness-index hero, a
 * consistency heatmap, calorie adherence), Body (weight / body-fat / waist
 * trends with moving-average lines + deltas), Training (weekly volume bars,
 * totals, a PR leaderboard) and Wellness (a mood/energy/sleep/calm/consistency
 * radar + per-day mood & sleep trends). Charts are the @mossa/ui chart set.
 */

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { kgToDisplay, cmToLengthDisplay, weightLabel, lengthLabel, fmtEnergy, kcalToDisplay, POSTURE_GUIDANCE, type RangePreset, type SeriesDelta } from "@mossa/domain";

const capp = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
import {
  Card, Badge, Button, SegmentedControl, Page, Stagger, StatCard, ProgressRing, IconBadge, stagger, EmptyState,
  Reveal, SkeletonHero, SkeletonChart,
  AreaChart, BarChart, RadarChart, CalendarHeatmap, ChartCard, METRICS, POSTURE_SEVERITY_TONE, cn, toneVar,
  Dumbbell, Trophy, Flame, Moon, Smile, Zap, Gauge, HeartPulse, TrendingUp, Activity, AlertTriangle, type Tone, type LucideIcon,
} from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";
import { CoachNote } from "./CoachNote.js";
import { BodyScanCard } from "./BodyScanCard.js";

// ── API shapes ──
interface Pt { date: string; v: number }
type RangeStat = "in_range" | "below" | "above";
type MetricRange = { min: number | null; max: number | null };
interface ProgressData {
  range: { start: string; end: string; days: string[] };
  today: string;
  body: {
    weight: Pt[]; bodyFat: Pt[]; waist: Pt[]; chest: Pt[]; hips: Pt[]; posture: Pt[]; leanMass: Pt[]; fatMass: Pt[]; ffmi: Pt[];
    ranges?: { weightKg?: MetricRange; bodyFatPercent?: MetricRange };
    latest: { weightKg: number | null; bodyFatPct: number | null; waistCm: number | null; neckCm: number | null; hipsCm: number | null; chestCm: number | null; leanMassKg: number | null; fatMassKg: number | null; ffmi: number | null; somatotype: string | null; postureSeverity: "good" | "mild" | "moderate" | "severe" | null; postureCva: number | null; weightStatus: RangeStat | null; bodyFatStatus: RangeStat | null };
    deltas: { weight: SeriesDelta | null; bodyFat: SeriesDelta | null; waist: SeriesDelta | null; chest: SeriesDelta | null; hips: SeriesDelta | null };
  };
  nutrition: { perDay: { date: string; calories: number; protein: number; carbs: number; fat: number; logged: boolean; target: number | null }[]; targets: { targetCalories?: number; targetProteinG?: number }; adherencePct: number | null; loggedDays: number };
  training: { perDay: { date: string; tonnage: number; load: number; sets: number }[]; weekly: { week: string; tonnage: number; load: number; sets: number }[]; totalTonnage: number; totalSets: number; workoutDays: number; prs: { exerciseId: string; name: string; thumb: string | null; e1rm: number; weight: number; reps: number }[] };
  wellness: { perDay: { date: string; mood: number | null; energy: number | null; stress: number | null; sleepQuality: number | null; sleepHours: number | null }[]; averages: { mood: number | null; energy: number | null; stress: number | null; sleepQuality: number | null; sleepHours: number | null }; radar: { mood: number; energy: number; sleep: number; calm: number; consistency: number }; index: number | null };
  consistency: { heatmap: Record<string, number>; checkInDays: number; streak: number; longestStreak: number; consistencyPct: number; weekFlags: boolean[] };
}

type Tab = "overview" | "body" | "training" | "wellness";

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dense = (series: Pt[], days: string[]): (number | null)[] => { const m = new Map(series.map((p) => [p.date, p.v])); return days.map((d) => m.get(d) ?? null); };

export function Progress({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<RangePreset>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const units = useUnits();
  const today = todayLocal();

  // Don't clear data on a range toggle — keep the current lens rendered (dimmed)
  // while the next range loads, so 7d/30d/90d doesn't flash the full skeleton.
  // An alive guard drops a stale response; a failure surfaces a retry.
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false);
    api.get<ProgressData>(`/api/progress/${clientId}?range=${range}&today=${today}`)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setError(true); setLoading(false); } });
    return () => { alive = false; };
  }, [clientId, range, today, reloadKey]);

  const days = data?.range.days ?? [];
  const dateLabel = (i: number) => shortDate(days[i] ?? today);

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl options={[{ value: "overview", label: "Overview" }, { value: "body", label: "Body" }, { value: "training", label: "Training" }, { value: "wellness", label: "Wellness" }]} value={tab} onChange={(v) => setTab(v as Tab)} />
        <SegmentedControl className="ml-auto" options={[{ value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "90d", label: "90d" }]} value={range} onChange={(v) => setRange(v as RangePreset)} />
      </div>

      {error && !data ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load progress" description="Something went wrong loading your analytics. Check your connection and try again." action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>} />
      ) : (
      <Reveal loading={!data} className="space-y-4" skeleton={
        <>
          <SkeletonHero height={150} />
          <SkeletonChart height={160} />
          <SkeletonChart height={140} />
        </>
      }>
        {data && (
          /* Keyed remount per tab → each lens re-staggers in; no AnimatePresence
             wait-handshake (which could strand the incoming tab unmounted).
             Dim while a new range loads (prior data stays put — no skeleton flash). */
          <motion.div key={tab} variants={stagger} initial="hidden" animate="show" className={cn("space-y-4 transition-opacity", loading && "pointer-events-none opacity-50")}>
            {tab === "overview" && <Overview data={data} units={units} dateLabel={dateLabel} />}
            {tab === "body" && <Body data={data} units={units} dateLabel={dateLabel} clientId={clientId} />}
            {tab === "training" && <Training data={data} units={units} />}
            {tab === "wellness" && <Wellness data={data} dateLabel={dateLabel} />}
          </motion.div>
        )}
      </Reveal>
      )}

      <CoachNote clientId={clientId} surface="progress" />
    </Page>
  );
}

// ── Overview ──
function Overview({ data, units, dateLabel }: { data: ProgressData; units: ReturnType<typeof useUnits>; dateLabel: (i: number) => string }) {
  const { consistency, wellness, nutrition, body } = data;
  const days = data.range.days;
  const cals = nutrition.perDay.map((p) => (p.logged ? p.calories : null));
  const calTargets = nutrition.perDay.map((p) => p.target);
  const idxPct = wellness.index != null ? wellness.index / 5 : 0;
  return (
    <>
      <Stagger data-tour="progress-hero">
        <Card className="relative flex items-center gap-5 overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-cardio/10 blur-3xl" />
          <ProgressRing size={116} strokeWidth={11} tone="cardio" progress={idxPct || 0.001} value={wellness.index != null ? wellness.index.toFixed(1) : "—"} label="Wellness" sublabel="/ 5" softTrack tintValue />
          <div className="relative min-w-0 flex-1 space-y-2.5">
            <MiniStat icon={Flame} tone="calories" label="Check-in streak" value={`${consistency.streak}`} sub={consistency.streak === 1 ? "day" : "days"} />
            <MiniStat icon={Gauge} tone="activity" label="Consistency" value={`${consistency.consistencyPct}`} sub="%" />
            <MiniStat icon={METRICS.weight.icon} tone="cardio" label="Weight trend" value={body.deltas.weight ? `${body.deltas.weight.delta > 0 ? "+" : ""}${kgToDisplay(body.deltas.weight.delta, units).toFixed(1)}` : "—"} sub={body.deltas.weight ? weightLabel(units) : ""} />
          </div>
        </Card>
      </Stagger>

      <Stagger>
        <ChartCard title="Consistency" icon={Activity} tone="activity" value={consistency.checkInDays} unit="days logged" delta={<Badge tone="neutral">best {consistency.longestStreak}d streak</Badge>}>
          <CalendarHeatmap days={consistency.heatmap} today={data.today} tone="activity" weeks={data.range.days.length > 40 ? 16 : 10} />
        </ChartCard>
      </Stagger>

      <Stagger>
        <ChartCard title="Calorie adherence" icon={METRICS.calories.icon} tone="calories" value={nutrition.adherencePct != null ? nutrition.adherencePct : "—"} unit={nutrition.adherencePct != null ? "%" : undefined} delta={nutrition.targets.targetCalories ? <Badge tone="neutral">target {fmtEnergy(nutrition.targets.targetCalories, units)}</Badge> : undefined}>
          <AreaChart values={cals} tone="calories" targetSeries={calTargets} target={nutrition.targets.targetCalories} trend label={dateLabel} format={(v) => `${kcalToDisplay(v, units)}`} />
        </ChartCard>
      </Stagger>
    </>
  );
}

// ── Body ──
function Body({ data, units, dateLabel, clientId }: { data: ProgressData; units: ReturnType<typeof useUnits>; dateLabel: (i: number) => string; clientId: string }) {
  const days = data.range.days;
  const { body } = data;
  const wl = weightLabel(units), ll = lengthLabel(units);
  const weightVals = dense(body.weight, days).map((v) => (v == null ? null : kgToDisplay(v, units)));
  const waistVals = dense(body.waist, days).map((v) => (v == null ? null : cmToLengthDisplay(v, units)));
  const bfVals = dense(body.bodyFat, days);
  return (
    <>
      <Stagger><BodyScanCard clientId={clientId} /></Stagger>
      <Stagger>
        <ChartCard title="Weight" icon={METRICS.weight.icon} tone="cardio" value={body.latest.weightKg != null ? kgToDisplay(body.latest.weightKg, units).toFixed(1) : "—"} unit={wl} delta={<span className="flex flex-wrap items-center gap-1.5"><DeltaBadge d={body.deltas.weight} convert={(v) => kgToDisplay(v, units)} unit={wl} /><RangeChip status={body.latest.weightStatus} range={body.ranges?.weightKg} convert={(v) => kgToDisplay(v, units)} unit={wl} /></span>}>
          <AreaChart values={weightVals} tone="cardio" trend label={dateLabel} format={(v) => v.toFixed(1)} />
        </ChartCard>
      </Stagger>
      <Stagger>
        <ChartCard title="Body fat" icon={METRICS.bodyFat.icon} tone="sleep" value={body.latest.bodyFatPct != null ? body.latest.bodyFatPct.toFixed(1) : "—"} unit="%" delta={<span className="flex flex-wrap items-center gap-1.5"><DeltaBadge d={body.deltas.bodyFat} convert={(v) => v} unit="%" /><RangeChip status={body.latest.bodyFatStatus} range={body.ranges?.bodyFatPercent} convert={(v) => v} unit="%" /></span>}>
          <AreaChart values={bfVals} tone="sleep" trend label={dateLabel} format={(v) => `${v.toFixed(1)}%`} />
        </ChartCard>
      </Stagger>
      <Stagger>
        <ChartCard title="Waist" icon={METRICS.waist.icon} tone="nutrition" value={body.latest.waistCm != null ? cmToLengthDisplay(body.latest.waistCm, units).toFixed(1) : "—"} unit={ll} delta={<DeltaBadge d={body.deltas.waist} convert={(v) => cmToLengthDisplay(v, units)} unit={ll} />}>
          <AreaChart values={waistVals} tone="nutrition" trend label={dateLabel} format={(v) => v.toFixed(1)} />
        </ChartCard>
      </Stagger>
      {body.chest.length >= 2 && (
        <Stagger>
          <ChartCard title="Chest" icon={METRICS.chest.icon} tone={METRICS.chest.tone} value={body.latest.chestCm != null ? cmToLengthDisplay(body.latest.chestCm, units).toFixed(1) : "—"} unit={ll} delta={<DeltaBadge d={body.deltas.chest} convert={(v) => cmToLengthDisplay(v, units)} unit={ll} />}>
            <AreaChart values={dense(body.chest, days).map((v) => (v == null ? null : cmToLengthDisplay(v, units)))} tone={METRICS.chest.tone} trend label={dateLabel} format={(v) => v.toFixed(1)} />
          </ChartCard>
        </Stagger>
      )}
      {body.hips.length >= 2 && (
        <Stagger>
          <ChartCard title="Hips" icon={METRICS.hips.icon} tone={METRICS.hips.tone} value={body.latest.hipsCm != null ? cmToLengthDisplay(body.latest.hipsCm, units).toFixed(1) : "—"} unit={ll} delta={<DeltaBadge d={body.deltas.hips} convert={(v) => cmToLengthDisplay(v, units)} unit={ll} />}>
            <AreaChart values={dense(body.hips, days).map((v) => (v == null ? null : cmToLengthDisplay(v, units)))} tone={METRICS.hips.tone} trend label={dateLabel} format={(v) => v.toFixed(1)} />
          </ChartCard>
        </Stagger>
      )}
      {body.leanMass.length >= 2 && (
        <Stagger>
          <ChartCard title="Lean mass" icon={METRICS.leanMass.icon} tone={METRICS.leanMass.tone} value={body.latest.leanMassKg != null ? kgToDisplay(body.latest.leanMassKg, units).toFixed(1) : "—"} unit={wl}>
            <AreaChart values={dense(body.leanMass, days).map((v) => (v == null ? null : kgToDisplay(v, units)))} tone={METRICS.leanMass.tone} trend label={dateLabel} format={(v) => v.toFixed(1)} />
          </ChartCard>
        </Stagger>
      )}
      {body.fatMass.length >= 2 && (
        <Stagger>
          <ChartCard title="Fat mass" icon={METRICS.fatMass.icon} tone={METRICS.fatMass.tone} value={body.latest.fatMassKg != null ? kgToDisplay(body.latest.fatMassKg, units).toFixed(1) : "—"} unit={wl}>
            <AreaChart values={dense(body.fatMass, days).map((v) => (v == null ? null : kgToDisplay(v, units)))} tone={METRICS.fatMass.tone} trend label={dateLabel} format={(v) => v.toFixed(1)} />
          </ChartCard>
        </Stagger>
      )}
      {body.ffmi.length >= 2 && (
        <Stagger>
          <ChartCard title="FFMI" icon={METRICS.ffmi.icon} tone={METRICS.ffmi.tone} value={body.latest.ffmi != null ? body.latest.ffmi.toFixed(1) : "—"} unit={METRICS.ffmi.unit}>
            <AreaChart values={dense(body.ffmi, days)} tone={METRICS.ffmi.tone} trend label={dateLabel} format={(v) => v.toFixed(1)} />
          </ChartCard>
        </Stagger>
      )}
      {body.posture.length > 0 && (
        <Stagger>
          <ChartCard title="Posture" icon={METRICS.posture.icon} tone={METRICS.posture.tone}
            value={body.latest.postureCva != null ? body.latest.postureCva.toFixed(0) : "—"} unit="° neck angle"
            delta={body.latest.postureSeverity ? <Badge tone={POSTURE_SEVERITY_TONE[body.latest.postureSeverity]}>{capp(body.latest.postureSeverity)}</Badge> : undefined}>
            <AreaChart values={dense(body.posture, days)} tone={METRICS.posture.tone} trend label={dateLabel} format={(v) => `${v.toFixed(0)}°`} />
          </ChartCard>
        </Stagger>
      )}
      {body.latest.postureSeverity && body.latest.postureSeverity !== "good" && (
        <Stagger>
          <Card className="flex items-start gap-3 border border-warning/25 bg-warning-soft/40">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0"><div className="text-sm font-semibold">Posture screen</div><p className="text-sm text-muted-foreground">{POSTURE_GUIDANCE[body.latest.postureSeverity]} A higher neck angle is more upright.</p></div>
          </Card>
        </Stagger>
      )}
      <Stagger>
        <Card className="space-y-3">
          <div className="text-sm font-semibold">Latest measurements</div>
          {body.latest.somatotype && <div className="text-xs text-muted-foreground">Body type · <span className="font-semibold text-foreground">{body.latest.somatotype}</span></div>}
          <div className="grid grid-cols-3 gap-2">
            <MeasChip label="Chest" value={body.latest.chestCm} units={units} />
            <MeasChip label="Waist" value={body.latest.waistCm} units={units} />
            <MeasChip label="Hips" value={body.latest.hipsCm} units={units} />
            <MeasChip label="Neck" value={body.latest.neckCm} units={units} />
          </div>
        </Card>
      </Stagger>
    </>
  );
}

// ── Training ──
function Training({ data, units }: { data: ProgressData; units: ReturnType<typeof useUnits> }) {
  const { training } = data;
  const wl = weightLabel(units);
  const weekLabels = training.weekly.map((w) => shortDate(w.week));
  const tonnageVals = training.weekly.map((w) => Math.round(kgToDisplay(w.tonnage, units)));
  const setVals = training.weekly.map((w) => w.sets);
  const maxE1 = training.prs[0]?.e1rm ?? 1;
  return (
    <>
      <Stagger className="grid grid-cols-3 gap-3">
        <StatCard stack label="Volume" value={Math.round(kgToDisplay(training.totalTonnage, units) / 1000).toLocaleString()} unit={`k ${wl}`} icon={Dumbbell} tone="activity" />
        <StatCard stack label="Sets" value={training.totalSets} icon={Activity} tone="activity" />
        <StatCard stack label="Sessions" value={training.workoutDays} icon={Flame} tone="cardio" />
      </Stagger>
      <Stagger>
        <ChartCard title="Weekly volume" icon={Dumbbell} tone="activity" value={training.weekly.length ? Math.round(kgToDisplay(training.weekly.at(-1)!.tonnage, units)).toLocaleString() : "—"} unit={wl} delta={<Badge tone="neutral">last week</Badge>}>
          {training.weekly.length >= 2 ? <BarChart values={tonnageVals} labels={weekLabels} tone="activity" format={(v) => `${v.toLocaleString()} ${wl}`} /> : <EmptyMini label="Log a few weeks of training to see volume" />}
        </ChartCard>
      </Stagger>
      <Stagger>
        <ChartCard title="Weekly sets" icon={Activity} tone="cardio">
          {training.weekly.length >= 2 ? <BarChart values={setVals} labels={weekLabels} tone="cardio" height={130} format={(v) => `${v} sets`} /> : <EmptyMini label="No sets logged in range" />}
        </ChartCard>
      </Stagger>
      <Stagger>
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><IconBadge icon={Trophy} tone="activity" size="sm" /><div className="text-sm font-semibold">Personal records · est. 1RM</div></div>
          {training.prs.length === 0 ? <EmptyMini label="Log weighted sets to build your PR board" /> : (
            <div className="space-y-1.5">
              {training.prs.map((p, i) => (
                <div key={p.exerciseId} className="flex items-center gap-3">
                  <div className="numeral w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</div>
                  {p.thumb ? <img src={p.thumb} alt="" className="size-9 shrink-0 rounded-lg object-cover" /> : <IconBadge icon={Dumbbell} tone="activity" size="sm" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.max(6, (p.e1rm / maxE1) * 100)}%`, backgroundColor: toneVar.activity }} /></div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="numeral text-sm font-bold">{kgToDisplay(p.e1rm, units).toFixed(0)} <span className="text-[0.65rem] font-medium text-muted-foreground">{wl}</span></div>
                    <div className="numeral text-[0.65rem] text-muted-foreground">{kgToDisplay(p.weight, units).toFixed(0)}×{p.reps}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Stagger>
    </>
  );
}

// ── Wellness ──
function Wellness({ data, dateLabel }: { data: ProgressData; dateLabel: (i: number) => string }) {
  const { wellness } = data;
  const r = wellness.radar;
  const axes = [
    { label: "Mood", value: r.mood },
    { label: "Energy", value: r.energy },
    { label: "Sleep", value: r.sleep },
    { label: "Calm", value: r.calm },
    { label: "Consistency", value: r.consistency },
  ];
  const moodVals = wellness.perDay.map((p) => p.mood);
  const sleepVals = wellness.perDay.map((p) => p.sleepHours);
  const hasRadar = axes.some((a) => a.value > 0);
  return (
    <>
      <Stagger>
        <ChartCard title="Wellness balance" icon={HeartPulse} tone="cardio" value={wellness.index != null ? wellness.index.toFixed(1) : "—"} unit={wellness.index != null ? "/ 5" : undefined}>
          {hasRadar ? <RadarChart axes={axes} tone="cardio" size={230} /> : <EmptyMini label="Check in with mood, energy & sleep to build your radar" />}
        </ChartCard>
      </Stagger>
      <Stagger className="grid grid-cols-2 gap-3">
        <StatCard stack label="Avg mood" value={wellness.averages.mood ?? "—"} unit="/ 5" icon={Smile} tone="nutrition" />
        <StatCard stack label="Avg energy" value={wellness.averages.energy ?? "—"} unit="/ 5" icon={Zap} tone="warning" />
        <StatCard stack label="Avg sleep" value={wellness.averages.sleepHours ?? "—"} unit="h" icon={Moon} tone="sleep" />
        <StatCard stack label="Avg stress" value={wellness.averages.stress ?? "—"} unit="/ 5" icon={Gauge} tone="danger" />
      </Stagger>
      <Stagger>
        <ChartCard title="Mood trend" icon={Smile} tone="nutrition">
          <AreaChart values={moodVals} tone="nutrition" grid={3} height={140} label={dateLabel} format={(v) => v.toFixed(1)} />
        </ChartCard>
      </Stagger>
      <Stagger>
        <ChartCard title="Sleep trend" icon={Moon} tone="sleep">
          <AreaChart values={sleepVals} tone="sleep" grid={3} height={140} label={dateLabel} format={(v) => `${v.toFixed(1)}h`} />
        </ChartCard>
      </Stagger>
    </>
  );
}

// ── Small pieces ──
function MiniStat({ icon: Icon, tone, label, value, sub }: { icon: LucideIcon; tone: Tone; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0" style={{ color: toneVar[tone] }} />
      <span className="flex-1 truncate text-xs text-muted-foreground">{label}</span>
      <span className="numeral text-sm font-bold">{value}{sub && <span className="ml-0.5 text-[0.65rem] font-medium text-muted-foreground">{sub}</span>}</span>
    </div>
  );
}

function DeltaBadge({ d, convert, unit }: { d: SeriesDelta | null; convert: (v: number) => number; unit: string }) {
  if (!d || d.delta === 0) return null;
  const val = convert(Math.abs(d.delta));
  const down = d.delta < 0;
  return (
    <Badge tone="neutral"><TrendingUp className={cn("size-3", down && "rotate-180")} />{down ? "−" : "+"}{val.toFixed(1)} {unit}</Badge>
  );
}

/** In-range / off-track status against the coach-set healthy band (SPEC §8.11),
 *  showing the target window. Renders nothing when there's no band. */
export function RangeChip({ status, range, convert, unit }: { status: RangeStat | null; range?: MetricRange; convert: (v: number) => number; unit: string }) {
  if (!status || !range || (range.min == null && range.max == null)) return null;
  const fmt = (v: number) => convert(v).toFixed(1);
  const band = range.min != null && range.max != null ? `${fmt(range.min)}–${fmt(range.max)}` : range.min != null ? `≥ ${fmt(range.min)}` : `≤ ${fmt(range.max!)}`;
  const label = status === "in_range" ? "In range" : status === "below" ? "Below" : "Above";
  return <Badge tone={status === "in_range" ? "success" : "warning"}>{label} · {band} {unit}</Badge>;
}

function MeasChip({ label, value, units }: { label: string; value: number | null; units: ReturnType<typeof useUnits> }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-[0.65rem] font-medium text-muted-foreground">{label}</div>
      <div className="numeral mt-0.5 text-sm font-bold">{value != null ? `${cmToLengthDisplay(value, units).toFixed(1)}` : "—"}<span className="ml-0.5 text-[0.6rem] font-medium text-muted-foreground">{value != null ? lengthLabel(units) : ""}</span></div>
    </div>
  );
}

function EmptyMini({ label }: { label: string }) {
  return <div className="grid h-24 place-items-center rounded-xl bg-surface-2 px-4 text-center text-xs text-muted-foreground">{label}</div>;
}
