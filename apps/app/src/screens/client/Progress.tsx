/**
 * Progress tab — a data-rich analytics dashboard. One aggregation
 * (`/api/progress`) feeds four lenses: Overview (a wellness-index hero, a
 * consistency heatmap, calorie adherence), Body (weight / body-fat / waist
 * trends with moving-average lines + deltas), Training (weekly volume bars,
 * totals, a PR leaderboard) and Wellness (a mood/energy/sleep/calm/consistency
 * radar + per-day mood & sleep trends). Charts are the @mossa/ui chart set.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { kgToDisplay, cmToLengthDisplay, weightLabel, lengthLabel, fmtEnergy, kcalToDisplay, POSTURE_GUIDANCE, presetRange, type RangePreset, type SeriesDelta } from "@mossa/domain";

const capp = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
import {
  Card, Badge, Button, SegmentedControl, Page, Stagger, StatCard, ProgressRing, IconBadge, stagger, EmptyState, SectionHeader, Sparkline,
  Reveal, SkeletonHero, SkeletonChart,
  AreaChart, BarChart, RadarChart, CalendarHeatmap, ChartCard, METRICS, POSTURE_SEVERITY_TONE, cn, toneVar,
  Dumbbell, Trophy, Flame, Moon, Smile, Zap, Gauge, HeartPulse, TrendingUp, Activity, AlertTriangle, Calendar, Scale, type Tone, type LucideIcon,
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
    ranges?: { weightKg?: MetricRange };
    latest: { weightKg: number | null; bodyFatPct: number | null; waistCm: number | null; neckCm: number | null; hipsCm: number | null; chestCm: number | null; leanMassKg: number | null; fatMassKg: number | null; ffmi: number | null; somatotype: string | null; postureSeverity: "good" | "mild" | "moderate" | "severe" | null; postureCva: number | null; weightStatus: RangeStat | null };
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

const isTab = (t: string | null): t is Tab => t === "overview" || t === "body" || t === "training" || t === "wellness";

export function Progress({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ProgressData | null>(null);
  // Deep-link: a notification (or another screen) can open a specific lens via
  // `?tab=body|training|wellness`. Seed from it once, then strip the param.
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (isTab(params.get("tab")) ? (params.get("tab") as Tab) : "overview"));
  useEffect(() => {
    if (params.get("tab")) setParams((p) => { p.delete("tab"); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const today = todayLocal();
  // Range is a preset (7d/30d/90d) or a "custom" window with explicit start/end
  // dates. Every chart & summary keys off the fetched range, so the custom
  // window flows through all four lenses automatically.
  const [range, setRange] = useState<RangePreset | "custom">("30d");
  const [customStart, setCustomStart] = useState(() => presetRange("30d", today).start);
  const [customEnd, setCustomEnd] = useState(today);
  const customValid = customStart <= customEnd;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const units = useUnits();

  // Don't clear data on a range toggle — keep the current lens rendered (dimmed)
  // while the next range loads, so switching doesn't flash the full skeleton.
  // An alive guard drops a stale response; a failure surfaces a retry.
  useEffect(() => {
    if (range === "custom" && !customValid) return;
    let alive = true;
    setLoading(true); setError(false);
    const qs = range === "custom"
      ? `start=${customStart}&end=${customEnd}&today=${today}`
      : `range=${range}&today=${today}`;
    api.get<ProgressData>(`/api/progress/${clientId}?${qs}`)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setError(true); setLoading(false); } });
    return () => { alive = false; };
  }, [clientId, range, customStart, customEnd, customValid, today, reloadKey]);

  const days = data?.range.days ?? [];
  const dateLabel = (i: number) => shortDate(days[i] ?? today);

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
      {/* Lens tabs collapse to icons (active one keeps its label, navbar-style)
          so the whole row — tabs + range — fits the Progress column. "Custom"
          is a calendar icon; picking it reveals the start→end pickers below. */}
      <div className="flex flex-wrap items-center gap-2">
        <LensTabs tab={tab} onChange={setTab} />
        <SegmentedControl className="ml-auto" value={range} onChange={(v) => setRange(v as RangePreset | "custom")}
          options={[
            { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "90d", label: "90d" },
            { value: "custom", label: <span title="Custom range" className="flex items-center [&_svg]:size-4"><Calendar /><span className="sr-only">Custom range</span></span> },
          ]} />
      </div>
      {range === "custom" && (
        <div className="flex items-center gap-2">
          <DatePill value={customStart} max={customEnd} label="Start date"
            onChange={(v) => { setCustomStart(v); if (v > customEnd) setCustomEnd(v); }} />
          <span className="shrink-0 text-sm text-muted-foreground">→</span>
          <DatePill value={customEnd} min={customStart} max={today} label="End date"
            onChange={(v) => { setCustomEnd(v); if (v < customStart) setCustomStart(v); }} />
        </div>
      )}

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
            {tab === "wellness" && <Wellness data={data} />}
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

      {/* Bare glance strip — activity coverage, deliberately card-less. */}
      <section className="space-y-2">
        <Eyebrow>At a glance</Eyebrow>
        <Stagger>
          <GlanceStrip items={[
            { icon: Dumbbell, tone: "activity", value: data.training.workoutDays, label: "Workouts" },
            { icon: METRICS.calories.icon, tone: "calories", value: nutrition.loggedDays, label: "Days logged" },
            { icon: Activity, tone: "cardio", value: consistency.checkInDays, label: "Check-ins" },
          ]} />
        </Stagger>
      </section>

      <Stagger>
        <ChartCard title="Consistency" icon={Activity} tone="activity" value={consistency.checkInDays} unit="days logged" delta={<Badge tone="neutral">best {consistency.longestStreak}d streak</Badge>}>
          <CalendarHeatmap days={consistency.heatmap} today={data.today} tone="activity" weeks={Math.min(53, Math.max(10, Math.ceil(data.range.days.length / 7)))} />
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
  const bfSpark = body.bodyFat.map((p) => p.v);
  // Lean/fat split (derived when the client has a logged height) drives the
  // composition ring + bar, folding four metrics into one richer card.
  const lean = body.latest.leanMassKg, fat = body.latest.fatMassKg;
  const comp = lean != null && fat != null && lean + fat > 0 ? lean + fat : null;
  // Girth measurements with a trend become a compact sparkline stat-grid instead
  // of three more full-width area charts.
  const girth = ([
    { key: "waist", label: METRICS.waist.label, icon: METRICS.waist.icon, tone: METRICS.waist.tone, series: body.waist, latest: body.latest.waistCm, delta: body.deltas.waist },
    { key: "chest", label: METRICS.chest.label, icon: METRICS.chest.icon, tone: METRICS.chest.tone, series: body.chest, latest: body.latest.chestCm, delta: body.deltas.chest },
    { key: "hips", label: METRICS.hips.label, icon: METRICS.hips.icon, tone: METRICS.hips.tone, series: body.hips, latest: body.latest.hipsCm, delta: body.deltas.hips },
  ] as const)
    .filter((m) => m.series.length >= 2 && m.latest != null)
    .map((m) => ({ ...m, conv: (v: number) => cmToLengthDisplay(v, units) }));
  return (
    <>
      <Stagger><BodyScanCard clientId={clientId} /></Stagger>

      {/* Hero — weight is the anchor metric, kept full-width. */}
      <Stagger>
        <ChartCard title="Weight" icon={METRICS.weight.icon} tone="cardio" value={body.latest.weightKg != null ? kgToDisplay(body.latest.weightKg, units).toFixed(1) : "—"} unit={wl} delta={<span className="flex flex-wrap items-center gap-1.5"><DeltaBadge d={body.deltas.weight} convert={(v) => kgToDisplay(v, units)} unit={wl} /><RangeChip status={body.latest.weightStatus} range={body.ranges?.weightKg} convert={(v) => kgToDisplay(v, units)} unit={wl} /></span>}>
          <AreaChart values={weightVals} tone="cardio" trend label={dateLabel} format={(v) => v.toFixed(1)} />
        </ChartCard>
      </Stagger>

      {/* Body composition — ring + lean/fat split, a deliberate break from the
          area-chart rhythm. Consolidates body-fat, lean/fat mass and FFMI. */}
      {body.latest.bodyFatPct != null && (
        <Stagger>
          <Card className="space-y-4">
            <SectionHeader icon={METRICS.bodyFat.icon} tone="sleep" title="Body composition"
              action={<span className="flex items-center gap-1.5"><DeltaBadge d={body.deltas.bodyFat} convert={(v) => v} unit="%" />{body.latest.ffmi != null && <Badge tone="neutral">FFMI {body.latest.ffmi.toFixed(1)}</Badge>}</span>} />
            <div className="flex items-center gap-4">
              <ProgressRing size={116} strokeWidth={11} tone="sleep" progress={Math.min(1, (body.latest.bodyFatPct ?? 0) / 40)} value={body.latest.bodyFatPct.toFixed(1)} label="Body fat" sublabel="%" softTrack tintValue />
              <div className="min-w-0 flex-1 space-y-3">
                {comp != null ? (
                  <>
                    <MiniStat icon={METRICS.leanMass.icon} tone={METRICS.leanMass.tone} label="Lean mass" value={kgToDisplay(lean!, units).toFixed(1)} sub={wl} />
                    <MiniStat icon={METRICS.fatMass.icon} tone={METRICS.fatMass.tone} label="Fat mass" value={kgToDisplay(fat!, units).toFixed(1)} sub={wl} />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Add your height in profile to unlock lean &amp; fat mass.</p>
                )}
                {bfSpark.length >= 2 && <div className="overflow-hidden"><Sparkline values={bfSpark} tone="sleep" width={190} height={40} className="w-full" /></div>}
              </div>
            </div>
            {comp != null && lean != null && fat != null && (
              <div className="space-y-1.5">
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-2">
                  <div style={{ width: `${(lean / comp) * 100}%`, backgroundColor: toneVar.cardio }} />
                  <div style={{ width: `${(fat / comp) * 100}%`, backgroundColor: toneVar.sleep }} />
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span style={{ color: toneVar.cardio }}>Lean {Math.round((lean / comp) * 100)}%</span>
                  <span style={{ color: toneVar.sleep }}>Fat {Math.round((fat / comp) * 100)}%</span>
                </div>
              </div>
            )}
          </Card>
        </Stagger>
      )}

      {/* Girth measurements — compact sparkline stat grid. */}
      {girth.length > 0 && (
        <Stagger className="grid grid-cols-2 gap-3">
          {girth.map((g) => (
            <StatCard key={g.key} stack tone={g.tone} icon={g.icon} label={g.label}
              value={g.conv(g.latest as number).toFixed(1)} unit={ll}
              badge={<DeltaBadge d={g.delta} convert={g.conv} unit={ll} />}
              chart={<Sparkline values={g.series.map((p) => g.conv(p.v))} tone={g.tone} width={150} height={44} className="w-full" />} />
          ))}
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
      {/* Bare totals strip — card-less. */}
      <section className="space-y-2">
        <Eyebrow>Totals this period</Eyebrow>
        <Stagger>
          <GlanceStrip items={[
            { icon: Dumbbell, tone: "activity", value: `${Math.round(kgToDisplay(training.totalTonnage, units) / 1000).toLocaleString()}k`, label: `Volume ${wl}` },
            { icon: Activity, tone: "activity", value: training.totalSets, label: "Sets" },
            { icon: Flame, tone: "cardio", value: training.workoutDays, label: "Sessions" },
          ]} />
        </Stagger>
      </section>

      {/* Weekly training — volume bars + a sets sparkline in one card (two forms). */}
      <Stagger>
        <ChartCard title="Weekly volume" icon={Dumbbell} tone="activity" value={training.weekly.length ? Math.round(kgToDisplay(training.weekly.at(-1)!.tonnage, units)).toLocaleString() : "—"} unit={wl} delta={<Badge tone="neutral">last week</Badge>}>
          {training.weekly.length >= 2 ? (
            <div className="space-y-4">
              <BarChart values={tonnageVals} labels={weekLabels} tone="activity" format={(v) => `${v.toLocaleString()} ${wl}`} />
              <div className="space-y-1.5 border-t border-border/40 pt-3">
                <div className="flex items-center justify-between text-xs"><span className="font-medium text-muted-foreground">Sets per week</span><span className="numeral font-semibold">{training.totalSets} total</span></div>
                <div className="overflow-hidden"><Sparkline values={setVals} tone="cardio" width={320} height={40} className="w-full" /></div>
              </div>
            </div>
          ) : <EmptyMini label="Log a few weeks of training to see volume" />}
        </ChartCard>
      </Stagger>

      <section className="space-y-2">
        <Eyebrow action={<span className="text-[0.65rem] font-medium text-muted-foreground">est. 1RM</span>}>Personal records</Eyebrow>
        <Stagger>
        <Card className="space-y-3">
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
      </section>
    </>
  );
}

// ── Wellness ──
function Wellness({ data }: { data: ProgressData }) {
  const { wellness } = data;
  const r = wellness.radar;
  const axes = [
    { label: "Mood", value: r.mood },
    { label: "Energy", value: r.energy },
    { label: "Sleep", value: r.sleep },
    { label: "Calm", value: r.calm },
    { label: "Consistency", value: r.consistency },
  ];
  const moodSpark = wellness.perDay.map((p) => p.mood).filter((v): v is number => v != null);
  const sleepSpark = wellness.perDay.map((p) => p.sleepHours).filter((v): v is number => v != null);
  const hasRadar = axes.some((a) => a.value > 0);
  return (
    <>
      <Stagger>
        <ChartCard title="Wellness balance" icon={HeartPulse} tone="cardio" value={wellness.index != null ? wellness.index.toFixed(1) : "—"} unit={wellness.index != null ? "/ 5" : undefined}>
          {hasRadar ? <RadarChart axes={axes} tone="cardio" size={230} /> : <EmptyMini label="Check in with mood, energy & sleep to build your radar" />}
        </ChartCard>
      </Stagger>

      <section className="space-y-2">
        <Eyebrow>Averages</Eyebrow>
        <Stagger className="grid grid-cols-2 gap-3">
          <StatCard stack label="Avg mood" value={wellness.averages.mood ?? "—"} unit="/ 5" icon={Smile} tone="nutrition" />
          <StatCard stack label="Avg energy" value={wellness.averages.energy ?? "—"} unit="/ 5" icon={Zap} tone="warning" />
          <StatCard stack label="Avg sleep" value={wellness.averages.sleepHours ?? "—"} unit="h" icon={Moon} tone="sleep" />
          <StatCard stack label="Avg stress" value={wellness.averages.stress ?? "—"} unit="/ 5" icon={Gauge} tone="danger" />
        </Stagger>
      </section>

      {/* Mood & sleep folded into one trends card (sparkline rows, not two areas). */}
      {(moodSpark.length >= 2 || sleepSpark.length >= 2) && (
        <Stagger>
          <Card className="space-y-4">
            <SectionHeader icon={HeartPulse} tone="sleep" title="Trends" />
            <TrendRow icon={Smile} tone="nutrition" label="Mood" value={wellness.averages.mood} unit="/ 5" values={moodSpark} />
            <TrendRow icon={Moon} tone="sleep" label="Sleep" value={wellness.averages.sleepHours} unit="h" values={sleepSpark} />
          </Card>
        </Stagger>
      )}
    </>
  );
}

/** A labeled metric row: icon + label + current average on the left, a trend
 *  sparkline on the right. The atom of the wellness "Trends" card. */
function TrendRow({ icon: Icon, tone, label, value, unit, values }: { icon: LucideIcon; tone: Tone; label: string; value: number | null; unit: string; values: number[] }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4 shrink-0" style={{ color: toneVar[tone] }} />{label}</div>
        <div className="numeral mt-1 text-xl font-bold leading-none">{value != null ? value.toFixed(1) : "—"}{value != null && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}</div>
      </div>
      {values.length >= 2 ? <div className="overflow-hidden"><Sparkline values={values} tone={tone} width={150} height={44} /></div> : <span className="text-xs text-muted-foreground">Not enough data</span>}
    </div>
  );
}

// ── Small pieces ──
/** The four Progress lenses, as an icon rail that expands the active tab's label
 *  (the app's bottom-nav idiom) — compact enough to share a row with the filters. */
const LENSES: { value: Tab; label: string; icon: LucideIcon }[] = [
  { value: "overview", label: "Overview", icon: Gauge },
  { value: "body", label: "Body", icon: Scale },
  { value: "training", label: "Training", icon: Dumbbell },
  { value: "wellness", label: "Wellness", icon: HeartPulse },
];

function LensTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="relative flex items-center gap-0.5 rounded-full bg-secondary p-1">
      {LENSES.map((l) => {
        const on = tab === l.value;
        return (
          <button key={l.value} onClick={() => onChange(l.value)} aria-current={on ? "page" : undefined} title={l.label}
            className={cn("relative z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors", on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {on && <motion.span layoutId="progress-lens-pill" initial={false} transition={{ type: "spring", stiffness: 380, damping: 32 }} className="absolute inset-0 rounded-full bg-primary" />}
            <l.icon className="relative size-4 shrink-0" strokeWidth={on ? 2.4 : 2} />
            {on && <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} transition={{ duration: 0.2 }} className="relative overflow-hidden whitespace-nowrap">{l.label}</motion.span>}
          </button>
        );
      })}
    </div>
  );
}

/** A date pill wrapping a native date input — the custom-range endpoints. */
function DatePill({ value, min, max, label, onChange }: { value: string; min?: string; max?: string; label: string; onChange: (v: string) => void }) {
  return (
    <label className="relative flex-1">
      <input type="date" value={value} min={min} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0 [color-scheme:dark]" aria-label={label} />
      <div className="pointer-events-none flex items-center justify-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm font-semibold [&_svg]:size-4"><Calendar className="text-muted-foreground" />{shortDate(value)}</div>
    </label>
  );
}

/** A bare, uppercase section label (with optional trailing action) — the flow
 *  device that keeps the page from reading as one long stack of cards. */
function Eyebrow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

/** A card-less stat strip: icon + big numeral + label, split by hairline
 *  dividers. A deliberate break from the boxed-card rhythm. */
function GlanceStrip({ items }: { items: { icon: LucideIcon; tone: Tone; value: ReactNode; label: string }[] }) {
  return (
    <div className="flex items-stretch divide-x divide-border/50">
      {items.map((it, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5 px-2 text-center">
          <it.icon className="size-4" style={{ color: toneVar[it.tone] }} />
          <span className="numeral text-2xl font-bold leading-none">{it.value}</span>
          <span className="text-[0.65rem] font-medium leading-tight text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

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
